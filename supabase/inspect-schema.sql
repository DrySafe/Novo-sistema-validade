-- Consulta somente leitura para comparar o ambiente real com a migração.
select jsonb_build_object(
 'colunas',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where c.table_schema='public'
   and c.table_name in ('lojas','perfis','usuario_lojas','produtos','ciclos_lotes','lotes_validade','auditoria_eventos')),
 'constraints',(select jsonb_agg(jsonb_build_object('tabela',r.relname,'nome',c.conname,'definicao',pg_get_constraintdef(c.oid)))
   from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
   where n.nspname='public' and r.relname in ('lojas','perfis','usuario_lojas','produtos','ciclos_lotes','lotes_validade','auditoria_eventos')),
 'triggers',(select jsonb_agg(jsonb_build_object('tabela',r.relname,'definicao',pg_get_triggerdef(t.oid)))
   from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace
   where n.nspname='public' and not t.tgisinternal),
 'politicas',(select jsonb_agg(to_jsonb(p)) from pg_policies p where p.schemaname='public'),
 'agendamentos',(select exists(select 1 from pg_extension where extname='pg_cron'))
) as esquema;
