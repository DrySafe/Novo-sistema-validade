begin;
-- Supabase concede EXECUTE diretamente por defaults do projeto. Revogar PUBLIC
-- sozinho não remove os privilégios diretos de anon/authenticated.
do $$ declare f record; begin
 for f in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'vs\_%' escape '\' or p.proname in
 ('get_meu_perfil','get_user_funcao','get_user_loja_id','usuario_tem_acesso_loja','validar_status_lote_para_insercao',
 'deletar_usuario_auth_ao_deletar_perfil','gerar_codigo_lote','forcar_virada_ciclo_teste','rls_auto_enable','handle_new_user','handle_new_user_profile','handle_new_user_onboarding')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);
  execute format('alter function %s set search_path=public,pg_temp',f.assinatura);
 end loop;
end $$;
create or replace function public.usuario_tem_acesso_loja(p_loja_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$select public.vs_acesso(p_loja_id)$$;
grant execute on function public.vs_acesso(uuid),public.vs_hoje(),public.vs_faixa(date),
 public.vs_gestor(uuid,uuid),public.vs_criar(jsonb),public.vs_painel(uuid),public.vs_sincronizar(uuid),
 public.vs_registrar(uuid,integer,numeric,text,text,text,integer,bigint),
 public.vs_salvar_loja(jsonb,uuid),public.vs_editar_perfil(uuid,text,text,uuid),public.vs_remover_membro(uuid,uuid),
 public.get_meu_perfil(),public.get_user_funcao(),public.get_user_loja_id(),public.usuario_tem_acesso_loja(uuid) to authenticated;
grant execute on function public.vs_gestor(uuid,uuid),public.vs_vincular_membro(uuid,uuid,uuid,text,text,text) to service_role;
revoke all on function public.vs_rotina_diaria() from service_role;
revoke all on public.vs_itens,public.vs_rodadas,public.vs_eventos from public,anon,authenticated;
grant select on public.vs_itens,public.vs_rodadas,public.vs_eventos to authenticated;
commit;
