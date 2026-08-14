import { supabase } from './supabaseClient.js';

export const authService = {
  // 1. Login padrão
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  // 2. Logout
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // 3. Retorna perfil do usuário logado + dados da loja principal
  async getCurrentProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('perfis')
      .select('*, lojas(nome, cnpj)')
      .eq('id', user.id)
      .single();

    if (error) throw new Error(`Perfil não encontrado para o ID: ${user.id}`);
    return data;
  },

 // 4. CRIAR APENAS CONTA DE USUÁRIO
  async registerUser({ nome, email, password }) {
    // A) Criar o usuário no Supabase Auth
    const { data: authData, error: errorAuth } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome }
      }
    });

    if (errorAuth) throw new Error("Erro ao criar conta: " + errorAuth.message);

    // B) Efetua o login imediato para obter a sessão JWT
    if (!authData.session) {
      await this.login(email, password);
    }

    const { data: { user } } = await supabase.auth.getUser();

    // C) Insere o perfil do usuário (Sem loja inicialmente)
    const { error: errorPerfil } = await supabase
      .from('perfis')
      .insert({
        id: user.id,
        nome: nome,
        funcao: 'administrador' // Pode iniciar como Admin/Gestor por padrão
      });

    if (errorPerfil && !errorPerfil.message.includes('duplicate')) {
      throw new Error("Erro ao criar perfil de usuário: " + errorPerfil.message);
    }

    return authData;
  },

  // 5. CADASTRAR UMA LOJA PARA O USUÁRIO LOGADO (PÓS-LOGIN)
  async createStoreForUser({ nomeLoja, cnpj, usuarioId }) {
    // A) Inserir nova loja
    const { data: loja, error: errorLoja } = await supabase
      .from('lojas')
      .insert({ nome: nomeLoja, cnpj })
      .select('id, nome')
      .single();

    if (errorLoja) throw new Error("Erro ao criar loja: " + errorLoja.message);

    // B) Vincular a loja criada ao perfil do usuário
    const { error: errorPerfil } = await supabase
      .from('perfis')
      .update({ loja_id: loja.id })
      .eq('id', usuarioId);

    if (errorPerfil) throw new Error("Erro ao vincular loja ao perfil: " + errorPerfil.message);

    // C) Inserir vínculo na tabela pivô N:N
    await supabase
      .from('usuario_lojas')
      .insert({ usuario_id: usuarioId, loja_id: loja.id });

    return loja;
  },

  // 6. CADASTRAR NOVO FUNCIONÁRIO/COLABORADOR
  async addEmployee({ lojaId, nome, funcao, email, avatarUrl }) {
    const { data, error } = await supabase
      .from('perfis')
      .insert({
        loja_id: lojaId,
        nome,
        funcao,
        foto_url: avatarUrl || null
      })
      .select();

    if (error) throw new Error("Erro ao salvar funcionário: " + error.message);
    return data;
  }
};