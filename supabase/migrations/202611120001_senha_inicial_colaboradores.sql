-- Novos colaboradores usam senha temporária; os acessos atuais permanecem intactos.
begin;
create or replace function public.vs_provisionar_funcionario(p_ator uuid,p_usuario uuid,p_nome text,p_login text,p_lojas uuid[],p_liberacoes jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare resultado jsonb;
begin
 if not exists(select 1 from vs_empresas where vs_admin_empresa(id,p_ator)) then raise exception 'Provisionamento não autorizado'; end if;
 resultado:=vs_provisionar_funcionario_antes_ceo(p_ator,p_usuario,p_nome,p_login,p_lojas,p_liberacoes);
 update perfis set senha_inicial=true where id=p_usuario;
 return resultado||jsonb_build_object('troca_senha_primeiro_acesso',true);
end $$;
revoke all on function public.vs_provisionar_funcionario(uuid,uuid,text,text,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.vs_provisionar_funcionario(uuid,uuid,text,text,uuid[],jsonb) to service_role;
notify pgrst,'reload schema';
commit;
