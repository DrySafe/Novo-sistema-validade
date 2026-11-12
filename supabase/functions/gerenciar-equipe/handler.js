// O cliente administrativo existe somente no servidor; o ator vem do JWT validado.
const cors = { 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body, status = 200, originHeaders = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, ...originHeaders, 'Content-Type': 'application/json', 'Cache-Control':'no-store' } });
function creationFailure(error, response = reply) {
 const code = /^[a-z_]{1,64}$/.test(error?.code || '') ? error.code : 'auth_creation_failed';
 if (['email_exists', 'user_already_exists'].includes(code)) return response({ error: 'Este login ou e-mail já possui uma conta. Use a senha já definida no acesso da empresa; cadastrar novamente não altera a senha existente.', code }, 409);
 if (code === 'weak_password') return response({ error: 'Use uma senha de pelo menos 6 caracteres e até 72 bytes.', code }, 400);
 if (['email_address_invalid', 'email_address_not_authorized', 'validation_failed'].includes(code)) return response({ error: 'O serviço de autenticação recusou o e-mail ou os dados informados. Confira e tente novamente.', code }, 400);
 if (error?.status === 429) return response({ error: 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.', code }, 429);
 // Somente código e etapa: nunca registrar senha, token ou corpo da requisição.
 // O diagnóstico público usa apenas código, sem corpo, senha, token ou dados pessoais.
 return response({ error: `Não foi possível criar a conta no serviço de autenticação (código: ${code}). Informe este código ao suporte.`, code }, 503);
}
const allowedOrigins = new Set(['https://validadeeco.vercel.app','http://localhost:3000','http://127.0.0.1:3000','http://localhost:3050','http://127.0.0.1:3050']);
async function readBody(req) {
 if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('CONTENT_TYPE');
 const reader=req.body?.getReader(); if(!reader) throw new Error('INVALID_BODY');
 const chunks=[];let size=0;
 try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);} }
 finally {reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const body=JSON.parse(new TextDecoder().decode(bytes));
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('INVALID_BODY');return body;
}
export function accountHandler(admin) {
 return async req => {
  const origin=req.headers.get('Origin');
  if(origin && !allowedOrigins.has(origin))return reply({error:'Origem não permitida'},403);
  const originHeaders=origin?{'Access-Control-Allow-Origin':origin}:{};
  const response=(body,status=200)=>reply(body,status,originHeaders);
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers:{...cors,...originHeaders}});
  if (req.method !== 'POST') return response({ error: 'Método não permitido' }, 405);
  let createdId, reservation;
  try {
   const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
   if (!token) return response({ error: 'Autenticação obrigatória' }, 401);
   const { data: { user }, error: authError } = await admin.auth.getUser(token);
   if (authError || !user) return response({ error: 'Sessão inválida' }, 401);
   const body = await readBody(req);
   const empresa = ['gestor','administrador'].includes(body.acao);
   const papel=empresa?'gestor':body.acao==='administrador_loja'?'loja_admin':'funcionario';
   if (!empresa && !['funcionario','administrador_loja'].includes(body.acao)) return response({ error: 'Operação inválida' }, 400);
   if (empresa && ['nome','lojas','vincularExistente'].some(key=>Object.hasOwn(body,key))) return response({ error: 'O CEO cadastra somente e-mail e senha de um novo Gestor' }, 400);
   const nome = empresa ? 'Gestor da empresa' : body.nome;
   const lojas = empresa ? [] : body.lojas;
   const { password, liberacoes } = body;
   const edicao=body.edicao_lojas??[];
   if(!Array.isArray(edicao)||edicao.length>100||edicao.some(id=>typeof id!=='string'||!lojas.includes(id))||new Set(edicao).size!==edicao.length||(papel!=='loja_admin'&&edicao.length))return response({error:'Liberação de edição inválida'},400);
   if (typeof nome !== 'string' || !nome.trim() || nome.length > 255 || !Array.isArray(lojas) || lojas.length>100 || lojas.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || new Set(lojas).size!==lojas.length) return response({ error: 'Informe nome e lojas válidas' }, 400);
   if(!empresa && (!lojas.length || !liberacoes || Array.isArray(liberacoes) || Object.keys(liberacoes).length!==4 || !['entrada','movimentacao','revisao','correcao'].every(k=>typeof liberacoes[k]==='boolean')))return response({error:'Selecione lojas e liberações válidas'},400);
   const login = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
   const email = empresa ? String(body.email || '').trim().toLowerCase() : `${login}@usuarios.validasuper.invalid`;
   if (empresa ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@usuarios.validasuper.invalid') || email.length>254 : !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) return response({ error: 'E-mail ou login inválido' }, 400);
   {
    if (typeof password !== 'string' || password.length < 6) return response({ error: 'Use uma senha de pelo menos 6 caracteres' }, 400);
    if (new TextEncoder().encode(password).length > 72) return response({ error: 'Senha longa demais. Reduza o tamanho, especialmente se usar acentos ou emojis.' }, 400);
   }
   // A reserva valida a hierarquia e define um UUID de uso único antes de criar Auth.
   const { data: nonce, error: reserveError } = await admin.rpc('vs_preparar_conta', { p_ator:user.id,p_email:email,p_papel:papel,p_lojas:lojas });
   reservation = nonce;
   if (reserveError?.code==='PT429')return new Response(JSON.stringify({error:'Limite de cadastros atingido. Aguarde alguns minutos.'}),{status:429,headers:{...cors,...originHeaders,'Content-Type':'application/json','Retry-After':'600','Cache-Control':'no-store'}});
   if (reserveError) return response({ error: 'Conta não autorizada para este cadastro' }, 403);
   const { data: created, error: createError } = await admin.auth.admin.createUser({ id: nonce, email, password, email_confirm: true, user_metadata: { nome: nome.trim() } });
   if (createError || !created?.user) return creationFailure(createError,response);
   const targetId = createdId = created.user.id;
   const { data, error } = await admin.rpc(empresa ? 'vs_provisionar_empresa' : 'vs_provisionar_pessoa', empresa ? { p_ator: user.id, p_usuario: targetId, p_nome: nome.trim(), p_lojas: lojas } : { p_ator: user.id, p_usuario: targetId, p_nome: nome.trim(), p_login: login, p_lojas: lojas, p_liberacoes: liberacoes,p_papel:papel,p_edicao:edicao });
   if (error) {
    if (createdId) await admin.auth.admin.deleteUser(createdId);
    createdId = undefined;
    return response({ error: 'Cadastro não concluído. Verifique as lojas, os vínculos existentes e as liberações.' }, 400);
   }
   return response(data);
  } catch (error) {
   if(error?.message==='BODY_TOO_LARGE')return response({error:'Requisição muito grande'},413);
   if(error?.message==='CONTENT_TYPE')return response({error:'Use application/json'},415);
   if (createdId) await admin.auth.admin.deleteUser(createdId);
   return response({ error: 'Não foi possível concluir o cadastro' }, 400);
  } finally {
   if(reservation) { try { await admin.rpc('vs_cancelar_reserva', { p_id: reservation }); } catch { /* A reserva de UUID expira em dois minutos e só é criada pelo servidor. */ } }
  }
 };
}
