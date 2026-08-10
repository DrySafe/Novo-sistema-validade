// ATENÇÃO: Substitua pelas suas credenciais do painel Supabase
const SUPABASE_URL = 'https://uuwdajgkbmaqbzqhsoid.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1d2RhamdrYm1hcWJ6cWhzb2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzODYzNjAsImV4cCI6MjEwMTk2MjM2MH0.KJP0ezd4ZOOxUEvrm5DRHDkegQyEM7w33VZm2E_XZ4M';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);