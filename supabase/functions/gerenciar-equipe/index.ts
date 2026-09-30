import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (req: Request) => {
 if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
 if (req.method !== 'POST') return response({ error: 'Método não permitido' }, 405);
 try {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response({ error: 'Autenticação obrigatória' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return response({ error: 'Sessão inválida' }, 401);
  const { lojaId, nome, funcao, email, password, avatarUrl } = await req.json();
  if (typeof nome !== 'string' || !nome.trim() || typeof email !== 'string' || typeof password !== 'string' || password.length < 8) return response({ error: 'Informe nome, e-mail e senha de pelo menos 8 caracteres' }, 400);
  const { data: permitido, error: accessError } = await admin.rpc('vs_gestor', { p_loja: lojaId, p_usuario: user.id });
  if (accessError || !permitido) return response({ error: 'Gestor não autorizado' }, 403);
  const { data: perfil } = await admin.from('perfis').select('funcao').eq('id', user.id).single();
  const cargos = ['administrador', 'admin', 'gestor', 'gerente', 'operador', 'adm', 'precificacao'];
  if (!cargos.includes(funcao) || (!['administrador', 'admin'].includes(perfil?.funcao) && funcao !== 'operador')) return response({ error: 'Cargo não autorizado' }, 403);
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome: nome.trim() } });
  if (createError || !created.user) return response({ error: createError?.message || 'Não foi possível criar a conta' }, 400);
  const { data, error } = await admin.rpc('vs_vincular_membro', { p_gestor: user.id, p_usuario: created.user.id, p_loja: lojaId, p_nome: nome.trim(), p_funcao: funcao, p_foto: avatarUrl || null });
  if (error) {
   // Compensa somente a conta criada nesta requisição, ainda sem vínculo.
   await admin.auth.admin.deleteUser(created.user.id);
   return response({ error: 'Não foi possível vincular a conta à equipe' }, 400);
  }
  return response(data);
 } catch { return response({ error: 'Não foi possível concluir o cadastro' }, 400); }
});
