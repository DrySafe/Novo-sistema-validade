-- Execute como dono do banco. Habilita pg_cron quando ainda não instalado.
create extension if not exists pg_cron with schema pg_catalog;
-- 03:05 UTC corresponde a 00:05 em São Paulo. Sincronização também acontece ao abrir o app.
-- Ao aplicar novamente, substitui somente o agendamento deste app.
do $$
declare job bigint;
begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then
   raise exception 'Habilite pg_cron no Supabase antes de executar este arquivo';
 end if;
 for job in select jobid from cron.job where jobname='validasuper-rotina-diaria' loop
   perform cron.unschedule(job);
 end loop;
 perform cron.schedule('validasuper-rotina-diaria','5 3 * * *','select public.vs_rotina_diaria()');
end $$;
