// O cliente administrativo existe somente no servidor; o ator vem do JWT validado.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
function creationFailure(error) {
 const code = /^[a-z_]{1,64}$/.test(error?.code || '') ? error.code : 'auth_creation_failed';
 if (['email_exists', 'user_already_exists'].includes(code)) return response({ error: 'Este login ou e-mail já possui uma conta. Use a senha já definida no acesso da empresa; cadastrar novamente não altera a senha existente.', code }, 409);
 if (code === 'weak_password') return response({ error: 'Use uma senha de pelo menos 6 caracteres e até 72 bytes.', code }, 400);
 if (['email_address_invalid', 'email_address_not_authorized', 'validation_failed'].includes(code)) return response({ error: 'O serviço de autenticação recusou o e-mail ou os dados informados. Confira e tente novamente.', code }, 400);
 if (error?.status === 429) return response({ error: 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.', code }, 429);
 // Somente código e etapa: nunca registrar senha, token ou corpo da requisição.
 console.error('Falha ao criar conta Auth', { code });
 return response({ error: `Não foi possível criar a conta no serviço de autenticação (código: ${code}). Informe este código ao suporte.`, code }, 503);
}
export function accountHandler(admin) {
 return async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return response({ error: 'Método não permitido' }, 405);
  let createdId, reservation;
  try {
   const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
   if (!token) return response({ error: 'Autenticação obrigatória' }, 401);
   const { data: { user }, error: authError } = await admin.auth.getUser(token);
   if (authError || !user) return response({ error: 'Sessão inválida' }, 401);
   const body = await req.json();
   const empresa = body.acao === 'administrador';
   if (!empresa && body.acao !== 'funcionario') return response({ error: 'Operação inválida' }, 400);
   if (empresa && ['nome','lojas','vincularExistente'].some(key=>Object.hasOwn(body,key))) return response({ error: 'O CEO cadastra somente e-mail e senha de um novo ADM' }, 400);
   const nome = empresa ? 'Administrador da empresa' : body.nome;
   const lojas = empresa ? [] : body.lojas;
   const { password, liberacoes } = body;
   if (typeof nome !== 'string' || !nome.trim() || nome.length > 255 || !Array.isArray(lojas) || lojas.some(id => typeof id !== 'string')) return response({ error: 'Informe nome e lojas válidas' }, 400);
   const login = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
   const email = empresa ? String(body.email || '').trim().toLowerCase() : `${login}@usuarios.validasuper.invalid`;
   if (empresa ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@usuarios.validasuper.invalid') : !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) return response({ error: 'E-mail ou login inválido' }, 400);
   {
    if (typeof password !== 'string' || password.length < 6) return response({ error: 'Use uma senha de pelo menos 6 caracteres' }, 400);
    if (new TextEncoder().encode(password).length > 72) return response({ error: 'Senha longa demais. Reduza o tamanho, especialmente se usar acentos ou emojis.' }, 400);
   }
   // A reserva valida a hierarquia e define um UUID de uso único antes de criar Auth.
   const { data: nonce, error: reserveError } = await admin.rpc('vs_reservar_conta', { p_ator: user.id, p_email: email, p_tipo: empresa ? 'empresa' : 'funcionario' });
   reservation = nonce;
   if (reserveError) return response({ error: 'Conta não autorizada para este cadastro' }, 403);
   const { data: created, error: createError } = await admin.auth.admin.createUser({ id: nonce, email, password, email_confirm: true, user_metadata: { nome: nome.trim() } });
   if (createError || !created?.user) return creationFailure(createError);
   const targetId = createdId = created.user.id;
   const { data, error } = await admin.rpc(empresa ? 'vs_provisionar_empresa' : 'vs_provisionar_funcionario', empresa ? { p_ator: user.id, p_usuario: targetId, p_nome: nome.trim(), p_lojas: lojas } : { p_ator: user.id, p_usuario: targetId, p_nome: nome.trim(), p_login: login, p_lojas: lojas, p_liberacoes: liberacoes });
   if (error) {
    if (createdId) await admin.auth.admin.deleteUser(createdId);
    createdId = undefined;
    return response({ error: 'Cadastro não concluído. Verifique as lojas, os vínculos existentes e as liberações.' }, 400);
   }
   return response(data);
  } catch {
   if (createdId) await admin.auth.admin.deleteUser(createdId);
   return response({ error: 'Não foi possível concluir o cadastro' }, 400);
  } finally {
   if(reservation) { try { await admin.rpc('vs_cancelar_reserva', { p_id: reservation }); } catch { /* A reserva de UUID expira em dois minutos e só é criada pelo servidor. */ } }
  }
 };
}
