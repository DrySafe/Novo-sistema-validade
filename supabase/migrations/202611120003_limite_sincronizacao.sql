begin;
-- Protege também a sincronização chamada diretamente, sem limitar o cron sem usuário.
alter function vs_sincronizar(uuid) rename to vs_sec_base_sincronizar;
revoke all on function vs_sec_base_sincronizar(uuid) from public,anon,authenticated,service_role;
create function vs_sincronizar(p_loja uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is not null then perform vs_consumir_limite(auth.uid(),'vs_sincronizar',240,60);end if;
 return vs_sec_base_sincronizar(p_loja);
end $$;
revoke all on function vs_sincronizar(uuid) from public,anon;
grant execute on function vs_sincronizar(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
