import { supabase } from './supabaseClient.js';

export const authService = {

  /* ============================================================
     SEÇÃO 1: AUTENTICAÇÃO E SESSÃO (SUPABASE AUTH)
     ============================================================ */

  // 1.1 Login Padrão por E-mail e Senha
  async login(email, password) {
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
      .select('*, lojas(nome, cnpj)')
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
      return perfilPuro;
    }

    return data;
  },

  // 1.4 Cadastro de Nova Conta de Usuário (Self-Register)
  async registerUser({ nome, email, password }) {
    const { data: authData, error: errorAuth } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome }
      }
    });

    if (errorAuth) throw new Error("Erro ao criar conta: " + errorAuth.message);

    await this.login(email, password);
    return authData;
  },

  /* ============================================================
     SEÇÃO 2: GESTÃO E VÍNCULO DE UNIDADES / LOJAS
     ============================================================ */

  // 2.1 Cadastra Nova Loja para o Usuário Logado e Registra Tabela Associativa
  async createStoreForUser(dadosLoja) {
    const { 
      nomeLoja, razaoSocial, cnpj, ie, 
      logradouro, numero, bairro, cidade, uf, cep, telefone, 
      usuarioId 
    } = dadosLoja;

    // 1. Insere a nova unidade comercial com dados empresariais completos
    const { data: loja, error: errorLoja } = await supabase
      .from('lojas')
      .insert({
        nome: nomeLoja,
        razao_social: razaoSocial || null,
        cnpj: cnpj || null,
        inscricao_estadual: ie || null,
        logradouro: logradouro || null,
        numero: numero || null,
        bairro: bairro || null,
        cidade: cidade || null,
        uf: uf || null,
        cep: cep || null,
        telefone: telefone || null
      })
      .select('*')
      .single();

    if (errorLoja) throw new Error("Erro ao criar loja: " + errorLoja.message);

    // 2. Vincula a loja no perfil principal se ainda estiver nula
    await supabase
      .from('perfis')
      .update({ loja_id: loja.id })
      .eq('id', usuarioId)
      .is('loja_id', null);

    // 3. Garante o vínculo do usuário com a nova loja na tabela associativa
    const { error: errorVinculo } = await supabase
      .from('usuario_lojas')
      .upsert({ usuario_id: usuarioId, loja_id: loja.id }, { onConflict: 'usuario_id,loja_id' });

    if (errorVinculo) console.warn("Aviso ao vincular loja:", errorVinculo.message);

    return loja;
  },

  // 2.2 Atualiza Dados Completos de Uma Loja Existente (Admin)
  async updateStore(lojaId, dados) {
    const { data, error } = await supabase
      .from('lojas')
      .update(dados)
      .eq('id', lojaId)
      .select();

    if (error) throw new Error("Erro ao atualizar loja: " + error.message);
    return data;
  },

  /* ============================================================
     SEÇÃO 3: GESTÃO DE MEMBROS E COLABORADORES DA EQUIPE
     ============================================================ */

  // 3.1 Lista Todos os Colaboradores Vinculados a uma Loja Específica
  async getTeamMembers(lojaId) {
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('loja_id', lojaId)
      .order('nome', { ascending: true });

    if (error) throw error;
    return data;
  },

  // 3.2 Cadastra Novo Colaborador Gerando Credenciais no Auth
  async addEmployee({ lojaId, nome, funcao, email, password, avatarUrl }) {
    // Registra a conta no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) throw new Error("Erro ao criar credenciais: " + authError.message);

    const userId = authData.user?.id;
    if (!userId) throw new Error("Ocorreu um erro inesperado ao gerar a conta de acesso.");

    // Vincula a ficha técnica na tabela perfis
    const { data, error } = await supabase
      .from('perfis')
      .upsert({
        id: userId,
        loja_id: lojaId,
        nome,
        funcao,
        foto_url: avatarUrl || null
      })
      .select();

    if (error) throw new Error("Erro ao vincular perfil: " + error.message);
    
    return data;
  },

  /* ============================================================
     SEÇÃO 4: ADMINISTRAÇÃO E MANUTENÇÃO DE PERFIS
     ============================================================ */

  // 4.1 Atualiza Nome, Cargo ou Loja do Perfil de um Usuário
  async updateUserProfile(usuarioId, { nome, funcao, lojaId }) {
    const { data, error } = await supabase
      .from('perfis')
      .update({
        nome,
        funcao,
        loja_id: lojaId || null
      })
      .eq('id', usuarioId)
      .select();

    if (error) throw new Error("Erro ao atualizar perfil: " + error.message);
    return data;
  },

  // 4.2 Exclui o Registro do Colaborador do Banco de Dados
  async deleteEmployee(usuarioId) {
    const { error } = await supabase
      .from('perfis')
      .delete()
      .eq('id', usuarioId);

    if (error) throw new Error("Erro ao excluir usuário: " + error.message);
    return true;
  }

};