-- CEO separado da operação: somente cria novos administradores.
begin;
alter table public.perfis add column senha_inicial boolean not null default false;
create table public.vs_cadastros_auth (
 usuario_id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
 ator uuid not null, tipo text not null check(tipo in ('empresa','funcionario')),
 criado_em timestamptz not null default now(), consumido_em timestamptz
);
alter table public.vs_cadastros_auth enable row level security;
revoke all on public.vs_cadastros_auth from public,anon,authenticated;
create or replace function public.vs_guardar_identidade() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare reserva vs_provisionamentos;
begin
 if tg_op='INSERT' then
  delete from vs_provisionamentos where id=new.id and email=lower(new.email) and expira_em>now() returning * into reserva;
  if reserva.id is null then raise exception 'Cadastro público desativado. Solicite acesso ao administrador.'; end if;
  insert into vs_cadastros_auth(usuario_id,ator,tipo) values(new.id,reserva.ator,reserva.tipo);
 elsif exists(select 1 from perfis p where p.id=old.id) and (new.email is distinct from old.email or new.phone is distinct from old.phone) then
  raise exception 'O login não pode ser alterado';
 end if;
 return new;
end $$;
create function public.vs_senha_pessoal() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
  update perfis set senha_inicial=false where id=new.id and senha_inicial;
 end if;
 return new;
end $$;
create trigger vs_senha_pessoal after update of encrypted_password on auth.users for each row execute function public.vs_senha_pessoal();
create function public.vs_ceo_autorizado() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select vs_dono()$$;
create or replace function public.vs_admin_empresa(p_empresa uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono(p_usuario) and exists(select 1 from vs_empresas e join perfis p on p.id=e.administrador_id where e.id=p_empresa and p.id=p_usuario and not p.senha_inicial)
$$;
create or replace function public.vs_acesso(p_loja uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono() and exists(select 1 from lojas l join perfis p on p.id=auth.uid() where l.id=p_loja and not p.senha_inicial and (
 (l.empresa_id is not null and p.empresa_id=l.empresa_id and (vs_admin_empresa(l.empresa_id) or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=l.id)))
 or (l.empresa_id is null and p.tipo_conta='legado' and (p.loja_id=l.id or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=l.id)))))
$$;
create or replace function public.vs_gestor(p_loja uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono(p_usuario) and exists(select 1 from lojas l join perfis p on p.id=p_usuario where l.id=p_loja and not p.senha_inicial and ((l.empresa_id is not null and p.empresa_id=l.empresa_id and vs_admin_empresa(l.empresa_id,p_usuario)) or (l.empresa_id is null and p.tipo_conta='legado' and p.funcao in ('administrador','admin','gestor','gerente','adm') and (p.loja_id=l.id or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=l.id)))))
$$;
-- Não expõe vínculos, nomes de empresas, lojas ou contas ao CEO.
create or replace function public.vs_contexto_acesso() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('versao',1,'dono_app',vs_dono(),'senha_inicial',coalesce((select senha_inicial from perfis where id=auth.uid()),false),'empresa_admin',not vs_dono() and exists(select 1 from vs_empresas where administrador_id=auth.uid()),'empresas','[]'::jsonb,'lojas',coalesce((select jsonb_agg(to_jsonb(l) order by l.nome) from lojas l where vs_acesso(l.id)),'[]'),'lojas_legadas','[]'::jsonb)
$$;
create or replace function public.vs_reservar_conta(p_ator uuid,p_email text,p_tipo text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;
begin
 if p_tipo='empresa' then
  if not vs_dono(p_ator) then raise exception 'Somente o CEO cadastra administradores'; end if;
 elsif p_tipo='funcionario' then
  if not exists(select 1 from vs_empresas where vs_admin_empresa(id,p_ator)) then raise exception 'Somente o administrador da empresa cadastra funcionários'; end if;
 else raise exception 'Tipo de conta inválido'; end if;
 delete from vs_provisionamentos where expira_em<=now();
 insert into vs_provisionamentos(email,ator,tipo) values(lower(p_email),p_ator,p_tipo) returning id into ticket;
 return ticket;
end $$;
create or replace function public.vs_provisionar_empresa(p_ator uuid,p_usuario uuid,p_nome text,p_lojas uuid[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid; alvo perfis;
begin
 if not vs_dono(p_ator) then raise exception 'Somente o CEO cadastra administradores'; end if;
 if p_lojas is null or cardinality(p_lojas)<>0 then raise exception 'O CEO não pode vincular lojas'; end if;
 select * into alvo from perfis where id=p_usuario for update;
 if alvo.id is null or p_usuario=p_ator or vs_dono(p_usuario) or alvo.empresa_id is not null or alvo.loja_id is not null or alvo.tipo_conta<>'legado' or exists(select 1 from usuario_lojas where usuario_id=p_usuario) then raise exception 'Somente contas novas podem ser cadastradas'; end if;
 update vs_cadastros_auth set consumido_em=now() where usuario_id=p_usuario and ator=p_ator and tipo='empresa' and consumido_em is null;
 if not found then raise exception 'Cadastro novo autorizado obrigatório'; end if;
 insert into vs_empresas(nome,administrador_id) values('Empresa',p_usuario) returning id into empresa;
 update perfis set empresa_id=empresa,tipo_conta='empresa_admin',funcao='administrador',senha_inicial=true,nome='Administrador da empresa' where id=p_usuario;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao) values(p_ator,p_usuario,empresa,'Administrador cadastrado pelo CEO');
 return jsonb_build_object('criado',true);
end $$;
-- As funções anteriores continuam internas, com verificações adicionais nas novas entradas.
alter function public.vs_salvar_loja(jsonb,uuid) rename to vs_salvar_loja_antes_ceo;
revoke all on function public.vs_salvar_loja_antes_ceo(jsonb,uuid) from public,anon,authenticated,service_role;
create function public.vs_salvar_loja(p jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from vs_empresas where vs_admin_empresa(id)) then raise exception 'Somente o administrador da empresa com senha pessoal pode criar ou editar lojas'; end if;
 return vs_salvar_loja_antes_ceo(p,p_id);
end $$;
alter function public.vs_salvar_acessos(uuid,text,uuid[],jsonb) rename to vs_salvar_acessos_antes_ceo;
revoke all on function public.vs_salvar_acessos_antes_ceo(uuid,text,uuid[],jsonb) from public,anon,authenticated,service_role;
create function public.vs_salvar_acessos(p_usuario uuid,p_nome text,p_lojas uuid[],p_liberacoes jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from vs_empresas where vs_admin_empresa(id)) then raise exception 'Funcionário fora da empresa ou conta protegida'; end if;
 perform vs_salvar_acessos_antes_ceo(p_usuario,p_nome,p_lojas,p_liberacoes);
end $$;
alter function public.vs_provisionar_funcionario(uuid,uuid,text,text,uuid[],jsonb) rename to vs_provisionar_funcionario_antes_ceo;
revoke all on function public.vs_provisionar_funcionario_antes_ceo(uuid,uuid,text,text,uuid[],jsonb) from public,anon,authenticated,service_role;
create function public.vs_provisionar_funcionario(p_ator uuid,p_usuario uuid,p_nome text,p_login text,p_lojas uuid[],p_liberacoes jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from vs_empresas where vs_admin_empresa(id,p_ator)) then raise exception 'Provisionamento não autorizado'; end if;
 return vs_provisionar_funcionario_antes_ceo(p_ator,p_usuario,p_nome,p_login,p_lojas,p_liberacoes);
end $$;
create or replace function public.vs_funcionarios() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('lojas',(select coalesce(jsonb_agg(u.loja_id),'[]') from usuario_lojas u where u.usuario_id=p.id))) from perfis p join vs_empresas e on e.id=p.empresa_id where vs_admin_empresa(e.id) and p.id<>auth.uid()),'[]')
$$;
create or replace function public.vs_permissoes(p_loja uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('entrada',vs_permitido(p_loja,'ENTRADA'),'movimentacao',vs_permitido(p_loja,'MOVIMENTACAO'),'revisao',vs_permitido(p_loja,'REVISAO'),'correcao',vs_permitido(p_loja,'CORRECAO'),'equipe',vs_gestor(p_loja),'editarLoja',vs_gestor(p_loja),'criarLoja',exists(select 1 from vs_empresas e where vs_admin_empresa(e.id)))
$$;
-- Restrições também valem para consultas diretas e políticas permissivas antigas.
do $$
declare tabela text;
begin
 foreach tabela in array array['lojas','usuario_lojas','produtos','lotes_validade','ciclos_lotes','vs_itens','vs_eventos','vs_rodadas','auditoria_eventos'] loop
  execute format('alter table public.%I enable row level security',tabela);
  execute format('create policy vs_sem_ceo on public.%I as restrictive for all to authenticated using (not public.vs_dono()) with check (not public.vs_dono())',tabela);
 end loop;
end $$;
revoke all on function public.vs_conta_email(text) from public,anon,authenticated,service_role;
revoke all on function public.vs_ceo_autorizado(),public.vs_senha_pessoal(),public.vs_acesso(uuid),public.vs_gestor(uuid,uuid),public.vs_salvar_loja(jsonb,uuid),public.vs_salvar_acessos(uuid,text,uuid[],jsonb),public.vs_provisionar_funcionario(uuid,uuid,text,text,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.vs_ceo_autorizado(),public.vs_acesso(uuid),public.vs_gestor(uuid,uuid),public.vs_salvar_loja(jsonb,uuid),public.vs_salvar_acessos(uuid,text,uuid[],jsonb) to authenticated;
grant execute on function public.vs_provisionar_funcionario(uuid,uuid,text,text,uuid[],jsonb) to service_role;
notify pgrst,'reload schema';
commit;
