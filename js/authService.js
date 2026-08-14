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

  // 4. CRIAR NOVA LOJA (Self-Service Onboarding SaaS Multi-loja)
  async registerNewStore({ nomeLoja, cnpj, nomeAdmin, email, password }) {
    // A) Criar o registro na tabela 'lojas'
    const { data: loja, error: errorLoja } = await supabase
      .from('lojas')
      .insert({ nome: nomeLoja, cnpj })
      .select('id')
      .single();

    if (errorLoja) throw new Error("Erro ao criar a loja: " + errorLoja.message);

    // B) Criar a conta de autenticação no Supabase Auth
    const { data: authData, error: errorAuth } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome: nomeAdmin }
      }
    });

    if (errorAuth) throw new Error("Erro ao criar usuário: " + errorAuth.message);

    // C) Garante a sessão ativa para passar na política de RLS do Supabase
    if (authData.session) {
      await supabase.auth.setSession(authData.session);
    }

    // Vincular o usuário recém-criado na tabela 'perfis' como Administrador
    const { error: errorPerfil } = await supabase
      .from('perfis')
      .insert({
        id: authData.user.id,
        loja_id: loja.id,
        nome: nomeAdmin,
        funcao: 'administrador'
      });

    if (errorPerfil) throw new Error("Erro ao salvar perfil do Administrador: " + errorPerfil.message);

    // D) Adicionar o vínculo na tabela pivô 'usuario_lojas' (N:N)
    const { error: errorPivo } = await supabase
      .from('usuario_lojas')
      .insert({
        usuario_id: authData.user.id,
        loja_id: loja.id
      });

    if (errorPivo) console.warn("Aviso ao vincular usuario_lojas:", errorPivo.message);

    return authData;
  },

  // 5. LISTAR COLABORADORES DA MINHA LOJA
  async getTeamMembers(lojaId) {
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('loja_id', lojaId)
      .order('nome', { ascending: true });

    if (error) throw error;
    return data;
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