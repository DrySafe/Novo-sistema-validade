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

    // B) Criar a conta de autenticação passando a loja_id nos metadados
    // O banco de dados (Trigger) criará o perfil e o vínculo N:N automaticamente!
    const { data: authData, error: errorAuth } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { 
          nome: nomeAdmin,
          loja_id: loja.id 
        }
      }
    });

    if (errorAuth) throw new Error("Erro ao criar usuário: " + errorAuth.message);

    // C) Realizar login automático para gerar a sessão
    if (!authData.session) {
      await this.login(email, password);
    }

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