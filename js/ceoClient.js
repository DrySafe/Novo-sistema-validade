import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';
// Sessão por aba, independente da sessão operacional das empresas.
const tabId=window.sessionStorage.getItem('validasuper-ceo-tab')||crypto.randomUUID();
window.sessionStorage.setItem('validasuper-ceo-tab',tabId);
export const ceoClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
 auth: { storageKey: 'validasuper-ceo-'+tabId, storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
