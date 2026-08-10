import { supabase } from './supabaseClient.js';

export const authService = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Usa .maybeSingle() ao invés de .single() para evitar erro 406 caso o perfil não exista
  const { data: profile, error } = await supabase
    .from('perfis')
    .select('*, lojas(nome)')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar perfil:', error);
    throw error;
  }

  if (!profile) {
    throw new Error(`Perfil do usuário não encontrado na tabela 'perfis' para o ID: ${user.id}. Cadastre o registro na tabela perfis.`);
  }

  return profile;
}
};