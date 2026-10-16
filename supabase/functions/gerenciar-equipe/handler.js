// O cliente administrativo existe somente no servidor; o ator vem do JWT validado.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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
   const { nome, password, lojas, liberacoes } = body;
   const empresa = body.acao === 'empresa';
   if (!empresa && body.acao !== 'funcionario') return response({ error: 'Operação inválida' }, 400);
   if (typeof nome !== 'string' || !nome.trim() || nome.length > 255 || !Array.isArray(lojas) || lojas.some(id => typeof id !== 'string')) return response({ error: 'Informe nome e lojas válidas' }, 400);
   const login = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
   const email = empresa ? String(body.email || '').trim().toLowerCase() : `${login}@usuarios.validasuper.invalid`;
   if (empresa ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@usuarios.validasuper.invalid') : !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login)) return response({ error: 'E-mail ou login inválido' }, 400);
   if (!(empresa && body.vincularExistente === true)) {
    if (typeof password !== 'string' || password.length < 12) return response({ error: 'Use uma senha de pelo menos 12 caracteres' }, 400);
    if (new TextEncoder().encode(password).length > 72) return response({ error: 'Senha longa demais. Reduza o tamanho, especialmente se usar acentos ou emojis.' }, 400);
   }
   // A reserva valida a hierarquia e define um UUID de uso único antes de criar Auth.
   const { data: nonce, error: reserveError } = await admin.rpc('vs_reservar_conta', { p_ator: user.id, p_email: email, p_tipo: empresa ? 'empresa' : 'funcionario' });
   reservation = nonce;
   if (reserveError) return response({ error: 'Conta não autorizada para este cadastro' }, 403);
   let targetId;
   if (empresa && body.vincularExistente === true) {
    const { data, error } = await admin.rpc('vs_conta_email', { p_email: email });
    if (error || !data) return response({ error: 'Conta existente não encontrada' }, 400);
    targetId = data;
   } else {

    const { data, error } = await admin.auth.admin.createUser({ id: nonce, email, password, email_confirm: true, user_metadata: { nome: nome.trim() } });
    if (error || !data.user) return response({ error: ['email_exists', 'user_already_exists'].includes(error?.code) ? 'O login ou e-mail já está em uso.' : 'Não foi possível criar a conta. Tente novamente.', code: error?.code || 'auth_creation_failed' }, 400);
    targetId = createdId = data.user.id;
   }
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
