import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
