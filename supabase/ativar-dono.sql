-- Executar como postgres no SQL Editor, após a migração de administração.
-- Apenas promove a conta já existente e confirmada; não cria usuário nem senha.
do $$
declare usuario uuid;
begin
 select id into usuario from auth.users where lower(email)='danielregisrj@gmail.com' and email_confirmed_at is not null;
 if usuario is null or not exists(select 1 from public.perfis where id=usuario) then
  raise exception 'Conta confirmada do dono não encontrada. Confira o e-mail antes de prosseguir.';
 end if;
 insert into public.vs_donos(usuario_id) values(usuario) on conflict do nothing;
end $$;
