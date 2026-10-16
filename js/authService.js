import { supabase } from './supabaseClient.js';

export const authService = {

  /* ============================================================
     SEÇÃO 1: AUTENTICAÇÃO E SESSÃO (SUPABASE AUTH)
     ============================================================ */

  // 1.1 Administradores usam e-mail; funcionários usam seu login fixo.
  async login(identifier, password) {
    const value = identifier.trim().toLowerCase();
    const email = value.includes('@') ? value : `${value}@usuarios.validasuper.invalid`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  // 1.2 Encerra a Sessão do Usuário
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // 1.3 Obtém o Perfil Completo do Usuário Logado e Dados da Loja Principal
  async getCurrentProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('perfis')
      .select('*, lojas!perfis_loja_id_fkey(id, nome, numero_loja, cnpj, razao_social, inscricao_estadual, logradouro, numero, bairro, cidade, uf, cep, telefone)')
      .eq('id', user.id)
      .maybeSingle();

    if (!data) {
      const { data: perfilPuro, error: errPuro } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (errPuro || !perfilPuro) {
        throw new Error(`Perfil não encontrado para o ID: ${user.id}`);
      }
      return { ...perfilPuro, login_display: perfilPuro.login || user.email };
    }

    return { ...data, login_display: data.login || user.email };
  },

  async getAccessContext() {
    const { data, error } = await supabase.rpc('vs_contexto_acesso');
    if (error || data?.versao !== 1) throw new Error('Atualização de acessos do servidor necessária. Contate o administrador do aplicativo.');
    return data;
  },
  async provisionAccount(payload) {
    const { data, error } = await supabase.functions.invoke('gerenciar-equipe', { body: payload });
    let message = data?.error;
    if (error?.context && typeof error.context.json === 'function') {
      try { message = (await error.context.json()).error || message; } catch { /* Mantém a mensagem pública quando a resposta não é JSON. */ }
    }
    if (error || data?.error) throw new Error(message || 'Não foi possível cadastrar. Confira seus acessos e tente novamente.');
    return data;
  },
  async getEmployees() {
    const { data, error } = await supabase.rpc('vs_funcionarios');
    if (error) throw error;
    return data;
  },
  async saveAccess(usuario, nome, lojas, liberacoes) {
    const { error } = await supabase.rpc('vs_salvar_acessos', { p_usuario: usuario, p_nome: nome, p_lojas: lojas, p_liberacoes: liberacoes });
    if (error) throw error;
  },
  async changePassword(current, next) {
    if (next.length < 12) throw new Error('Use uma senha de pelo menos 12 caracteres.');
    if (new TextEncoder().encode(next).length > 72) throw new Error('Senha longa demais. Reduza o tamanho, especialmente se usar acentos ou emojis.');
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Sessão inválida. Entre novamente.');
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (loginError) throw new Error('Senha atual incorreta.');
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) throw new Error('Não foi possível alterar a senha. Tente novamente.');
  },

  /* ============================================================
     SEÇÃO 2: GESTÃO E VÍNCULO DE UNIDADES / LOJAS
     ============================================================ */

  // 2.1 Cadastra Nova Loja para o Usuário Logado e Registra Tabela Associativa
  async createStoreForUser(dadosLoja) {
    const { 
      numeroLoja, nomeLoja, razaoSocial, cnpj, ie, 
      logradouro, numero, bairro, cidade, uf, cep, telefone, 
      usuarioId 
    } = dadosLoja;

    const { data: loja, error } = await supabase.rpc('vs_salvar_loja', {
      p: { numero_loja: numeroLoja || '01', nome: nomeLoja, razao_social: razaoSocial || null,
        cnpj: cnpj || null, inscricao_estadual: ie || null, logradouro: logradouro || null,
        numero: numero || null, bairro: bairro || null, cidade: cidade || null, uf: uf || null,
        cep: cep || null, telefone: telefone || null }, p_id: null
    });
    if (error) throw error;

    return loja;
  },

  // 2.2 Atualiza Dados Completos de Uma Loja Existente
  async updateStore(lojaId, dados) {
    const { data, error } = await supabase.rpc('vs_salvar_loja', { p: dados, p_id: lojaId });

    if (error) throw new Error("Erro ao atualizar loja: " + error.message);
    return data;
  },

  /* ============================================================
     SEÇÃO 3: GESTÃO DE MEMBROS E COLABORADORES DA EQUIPE
     ============================================================ */

  // 3.1 Lista Todos os Colaboradores Vinculados a uma Loja Específica
  async getTeamMembers(lojaId) {
    const { data, error } = await supabase.rpc('vs_equipe', { p_loja: lojaId });

    if (error) throw error;
    return data;
  },

  /* ============================================================
     SEÇÃO 4: ADMINISTRAÇÃO E MANUTENÇÃO DE PERFIS
     ============================================================ */

  // 4.1 Cada usuário altera apenas o próprio nome. Vínculos ficam em Liberações.
  async updateUserProfile(usuarioId, { nome }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || usuarioId !== user.id) throw new Error('Use a área de Liberações para gerenciar funcionários.');
    const { error } = await supabase.rpc('vs_meu_nome', { p_nome: nome });
    if (error) throw error;
  }
};
