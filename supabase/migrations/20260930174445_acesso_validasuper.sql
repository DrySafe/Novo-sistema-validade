begin;
-- Perfis e vínculos são autoridade do servidor; conserva os usuários existentes.
revoke all on public.perfis,public.usuario_lojas,public.lojas from public,anon,authenticated;
grant select on public.perfis,public.usuario_lojas,public.lojas to authenticated;
create function public.vs_gestor(p_loja uuid,p_usuario uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from perfis p where p.id=p_usuario
 and p.funcao in ('administrador','admin','gestor','gerente','adm')
 and (p.loja_id=p_loja or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=p_loja)))
$$;
revoke all on function public.vs_gestor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vs_gestor(uuid,uuid) to authenticated,service_role;
create policy vs_limite on public.usuario_lojas as restrictive for select to authenticated
 using(usuario_id=(select auth.uid()) or vs_gestor(loja_id));
create policy vs_limite on public.perfis as restrictive for select to authenticated
 using(id=(select auth.uid()) or vs_acesso(loja_id));
create policy vs_limite on public.lojas as restrictive for select to authenticated using(vs_acesso(id));

-- Os três triggers antigos deixam de atribuir cargos/vínculos via metadados.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into perfis(id,nome,funcao) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'nome',''),'Novo Usuário'),'operador') on conflict(id) do nothing; return new; end $$;
create or replace function public.handle_new_user_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into perfis(id,nome,funcao) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'nome',''),'Novo Usuário'),'operador') on conflict(id) do nothing; return new; end $$;
create or replace function public.handle_new_user_onboarding() returns trigger language plpgsql security definer set search_path=public as $$
begin return new; end $$;
revoke all on function public.handle_new_user(),public.handle_new_user_profile(),public.handle_new_user_onboarding() from public,anon,authenticated;

create function public.vs_salvar_loja(p jsonb,p_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare loja lojas; usuario uuid:=auth.uid();
begin
 if usuario is null then raise exception 'Autenticação obrigatória'; end if;
 perform pg_advisory_xact_lock(hashtextextended(usuario::text,1));
 if nullif(trim(p->>'nome'),'') is null then raise exception 'Informe o nome da loja'; end if;
 if p_id is null then
  if exists(select 1 from usuario_lojas where usuario_id=usuario) or exists(select 1 from perfis where id=usuario and loja_id is not null) then
   if not exists(select 1 from perfis where id=usuario and funcao in ('administrador','admin')) then raise exception 'Somente administrador pode criar outra loja'; end if;
  end if;
  insert into lojas(nome,numero_loja) values(trim(p->>'nome'),coalesce(nullif(p->>'numero_loja',''),'01')) returning * into loja;
  insert into usuario_lojas(usuario_id,loja_id) values(usuario,loja.id);
  update perfis set loja_id=coalesce(loja_id,loja.id),funcao='administrador' where id=usuario;
 else
  if not vs_gestor(p_id) then raise exception 'Gestor não autorizado'; end if;
  select * into loja from lojas where id=p_id for update;
 end if;
 update lojas set nome=trim(p->>'nome'),numero_loja=coalesce(nullif(p->>'numero_loja',''),numero_loja),
 razao_social=p->>'razao_social',cnpj=p->>'cnpj',inscricao_estadual=p->>'inscricao_estadual',
 logradouro=p->>'logradouro',numero=p->>'numero',bairro=p->>'bairro',cidade=p->>'cidade',uf=p->>'uf',cep=p->>'cep',telefone=p->>'telefone'
 where id=loja.id returning * into loja;
 return to_jsonb(loja);
end $$;
create function public.vs_editar_perfil(p_usuario uuid,p_nome text,p_funcao text,p_loja uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare alvo perfis; cargo text;
begin
 select * into alvo from perfis where id=p_usuario for update;
 if auth.uid() is null or alvo.id is null then raise exception 'Perfil não autorizado'; end if;
 if nullif(trim(p_nome),'') is null then raise exception 'Informe o nome'; end if;
 if p_usuario=auth.uid() then
  if p_funcao is distinct from alvo.funcao or p_loja is distinct from alvo.loja_id then raise exception 'Não é permitido alterar o próprio cargo ou loja'; end if;
 else
  if not vs_gestor(p_loja) or not (alvo.loja_id=p_loja or exists(select 1 from usuario_lojas where usuario_id=p_usuario and loja_id=p_loja)) then raise exception 'Perfil fora da equipe'; end if;
  if p_loja is distinct from alvo.loja_id then raise exception 'Transferência de loja requer gestão de vínculos'; end if;
  select funcao into cargo from perfis where id=auth.uid();
  if cargo not in ('administrador','admin') and (p_funcao<>'operador' or alvo.funcao<>'operador') then raise exception 'Somente administrador pode gerir cargos de gestão'; end if;
 end if;
 update perfis set nome=trim(p_nome),funcao=p_funcao where id=p_usuario returning * into alvo;
 return to_jsonb(alvo);
end $$;
create function public.vs_remover_membro(p_usuario uuid,p_loja uuid) returns void
language plpgsql security definer set search_path=public as $$
declare cargo text;
begin
 if not vs_gestor(p_loja) or p_usuario=auth.uid() then raise exception 'Remoção não autorizada'; end if;
 select funcao into cargo from perfis where id=auth.uid();
 if cargo not in ('administrador','admin') and exists(select 1 from perfis where id=p_usuario and funcao<>'operador') then raise exception 'Somente administrador pode remover gestores'; end if;
 delete from usuario_lojas where usuario_id=p_usuario and loja_id=p_loja;
 update perfis set loja_id=(select loja_id from usuario_lojas where usuario_id=p_usuario order by loja_id limit 1) where id=p_usuario and loja_id=p_loja;
 -- Mantém Auth e perfil para preservar a autoria do histórico.
end $$;
create function public.vs_vincular_membro(p_gestor uuid,p_usuario uuid,p_loja uuid,p_nome text,p_funcao text,p_foto text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare alvo perfis; cargo text;
begin
 if not vs_gestor(p_loja,p_gestor) then raise exception 'Gestor não autorizado'; end if;
 if p_funcao not in ('administrador','admin','gestor','gerente','operador','adm','precificacao') then raise exception 'Cargo inválido'; end if;
 select funcao into cargo from perfis where id=p_gestor;
 if cargo not in ('administrador','admin') and p_funcao<>'operador' then raise exception 'Somente administrador pode cadastrar gestores'; end if;
 select * into alvo from perfis where id=p_usuario for update;
 if alvo.id is null or alvo.loja_id is not null or exists(select 1 from usuario_lojas where usuario_id=p_usuario) then raise exception 'Conta já vinculada'; end if;
 update perfis set loja_id=p_loja,nome=p_nome,funcao=p_funcao,foto_url=p_foto where id=p_usuario returning * into alvo;
 insert into usuario_lojas(usuario_id,loja_id) values(p_usuario,p_loja);
 return to_jsonb(alvo);
end $$;
revoke all on function public.vs_salvar_loja(jsonb,uuid),public.vs_editar_perfil(uuid,text,text,uuid),public.vs_remover_membro(uuid,uuid),public.vs_vincular_membro(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vs_salvar_loja(jsonb,uuid),public.vs_editar_perfil(uuid,text,text,uuid),public.vs_remover_membro(uuid,uuid) to authenticated;
grant execute on function public.vs_vincular_membro(uuid,uuid,uuid,text,text,text) to service_role;
commit;
