-- O GoTrue aplica app_metadata depois do INSERT em auth.users.
-- Vincula a reserva ao UUID definido pela API Auth Admin, antes do INSERT.
-- O cadastro público não escolhe UUIDs e continua desativado na configuração Auth.
begin;
create or replace function public.vs_guardar_identidade() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;
begin
 if tg_op='INSERT' then
  delete from vs_provisionamentos where id=new.id and email=lower(new.email) and expira_em>now() returning id into ticket;
  if ticket is null then raise exception 'Cadastro público desativado. Solicite acesso ao administrador.'; end if;
 elsif exists(select 1 from perfis p where p.id=old.id) and (new.email is distinct from old.email or new.phone is distinct from old.phone) then
  raise exception 'O login do funcionário não pode ser alterado';
 end if;
 return new;
end $$;
revoke all on function public.vs_guardar_identidade() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
