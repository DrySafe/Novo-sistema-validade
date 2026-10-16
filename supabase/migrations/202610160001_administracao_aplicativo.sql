-- Aplicar após 202610140001. Não associa lojas de empresas distintas automaticamente.
begin;
create table public.vs_donos(usuario_id uuid primary key references public.perfis(id));
create table public.vs_empresas(id uuid primary key default gen_random_uuid(), nome text not null check(length(trim(nome)) between 1 and 255), administrador_id uuid not null unique references public.perfis(id), criado_em timestamptz not null default now());
alter table public.lojas add column empresa_id uuid references public.vs_empresas(id);
alter table public.perfis add column empresa_id uuid references public.vs_empresas(id);
alter table public.perfis add column tipo_conta text not null default 'legado' check(tipo_conta in ('legado','empresa_admin','funcionario'));
alter table public.perfis add column login text unique check(login is null or login ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
alter table public.perfis add column liberacoes jsonb not null default '{}'::jsonb;
create table public.vs_provisionamentos(id uuid primary key default gen_random_uuid(),email text not null unique,ator uuid not null references perfis(id),tipo text not null check(tipo in ('empresa','funcionario')),expira_em timestamptz not null default now()+interval '2 minutes');
create table public.vs_acessos_auditoria(id bigint generated always as identity primary key,ator uuid references perfis(id),usuario uuid references perfis(id),empresa_id uuid references vs_empresas(id),acao text not null,detalhes jsonb not null default '{}',criado_em timestamptz not null default now());
alter table public.vs_donos enable row level security;
alter table public.vs_empresas enable row level security;
alter table public.vs_provisionamentos enable row level security;
alter table public.vs_acessos_auditoria enable row level security;
revoke all on public.vs_donos,public.vs_empresas,public.vs_provisionamentos,public.vs_acessos_auditoria from public,anon,authenticated;

create function public.vs_dono(p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from vs_donos where usuario_id=p_usuario)$$;
create function public.vs_admin_empresa(p_empresa uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from vs_empresas where id=p_empresa and administrador_id=p_usuario)$$;
create or replace function public.vs_acesso(p_loja uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from lojas l join perfis p on p.id=auth.uid() where l.id=p_loja and (
 (l.empresa_id is not null and p.empresa_id=l.empresa_id and (vs_admin_empresa(l.empresa_id) or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=l.id)))
 or (l.empresa_id is null and p.tipo_conta='legado' and (p.loja_id=l.id or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=l.id)))))
$$;
-- Contas legadas mantêm consulta/operação durante a migração; somente a empresa administradora cria contas/lojas.
create or replace function public.vs_gestor(p_loja uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from lojas l join perfis p on p.id=p_usuario where l.id=p_loja and ((l.empresa_id is not null and p.empresa_id=l.empresa_id and vs_admin_empresa(l.empresa_id,p_usuario)) or (l.empresa_id is null and p.tipo_conta='legado' and p.funcao in ('administrador','admin','gestor','gerente','adm') and (p.loja_id=l.id or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=l.id)))))
$$;
create or replace function public.vs_permitido(p_loja uuid,p_acao text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select vs_acesso(p_loja) and exists(select 1 from perfis p where p.id=auth.uid() and case
 when p.empresa_id is not null and vs_admin_empresa(p.empresa_id) then p_acao in ('ENTRADA','MOVIMENTACAO','REVISAO','CORRECAO')
 when p.tipo_conta='funcionario' then coalesce((p.liberacoes->>lower(p_acao))::boolean,false)
 else case p_acao when 'ENTRADA' then p.funcao in ('administrador','admin','gestor','gerente','operador') when 'MOVIMENTACAO' then p.funcao in ('administrador','admin','gestor','gerente','operador') when 'REVISAO' then p.funcao in ('administrador','admin','gestor','gerente','precificacao') when 'CORRECAO' then p.funcao in ('administrador','admin','gestor','gerente','adm') else false end end)
$$;
create function public.vs_liberacoes_validas(p jsonb) returns boolean language sql immutable set search_path=public,pg_temp as $$select jsonb_typeof(p)='object' and p ?& array['entrada','movimentacao','revisao','correcao'] and not exists(select 1 from jsonb_each(p) x where x.key not in ('entrada','movimentacao','revisao','correcao') or jsonb_typeof(x.value)<>'boolean')$$;
create function public.vs_permissoes(p_loja uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('entrada',vs_permitido(p_loja,'ENTRADA'),'movimentacao',vs_permitido(p_loja,'MOVIMENTACAO'),'revisao',vs_permitido(p_loja,'REVISAO'),'correcao',vs_permitido(p_loja,'CORRECAO'),'equipe',exists(select 1 from lojas l where l.id=p_loja and vs_admin_empresa(l.empresa_id)),'editarLoja',exists(select 1 from lojas l where l.id=p_loja and vs_admin_empresa(l.empresa_id)),'criarLoja',exists(select 1 from vs_empresas e where e.administrador_id=auth.uid()))
$$;
alter function public.vs_painel(uuid) rename to vs_painel_anterior;
revoke all on function public.vs_painel_anterior(uuid) from public,anon,authenticated;
create function public.vs_painel(p_loja uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$select vs_painel_anterior(p_loja)||jsonb_build_object('permissoes',vs_permissoes(p_loja),'acessos_version',1)$$;

-- As tabelas herdadas também ficam protegidas, independentemente da configuração anterior.
alter table public.lojas enable row level security;
alter table public.perfis enable row level security;
alter table public.usuario_lojas enable row level security;
create policy vs_empresa_leitura on public.lojas for select to authenticated using(vs_acesso(id));
create policy vs_empresa_leitura on public.perfis for select to authenticated using(id=auth.uid() or vs_admin_empresa(empresa_id) or vs_gestor(loja_id));
create policy vs_empresa_leitura on public.usuario_lojas for select to authenticated using((usuario_id=auth.uid() and vs_acesso(loja_id)) or vs_gestor(loja_id));
create policy vs_empresa_limite on public.perfis as restrictive for select to authenticated using(id=auth.uid() or vs_admin_empresa(empresa_id) or vs_gestor(loja_id));
create policy vs_empresa_limite on public.usuario_lojas as restrictive for select to authenticated using((usuario_id=auth.uid() and vs_acesso(loja_id)) or vs_gestor(loja_id));

-- A criação pública de Auth é rejeitada mesmo se alguém chamar signUp diretamente.
-- Somente Auth Admin, com nonce reservado pelo servidor em app_metadata, pode inserir.
create function public.vs_guardar_identidade() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;
begin
 if tg_op='INSERT' then
  delete from vs_provisionamentos where id::text=new.raw_app_meta_data->>'vs_provisionamento' and email=lower(new.email) and expira_em>now() returning id into ticket;
  if ticket is null then raise exception 'Cadastro público desativado. Solicite acesso ao administrador.'; end if;
 elsif exists(select 1 from perfis p where p.id=old.id) and (new.email is distinct from old.email or new.phone is distinct from old.phone) then
  raise exception 'O login do funcionário não pode ser alterado';
 end if;
 return new;
end $$;
create trigger vs_identidade_insert before insert on auth.users for each row execute function public.vs_guardar_identidade();
create trigger vs_identidade_update before update of email,phone on auth.users for each row execute function public.vs_guardar_identidade();
create function public.vs_reservar_conta(p_ator uuid,p_email text,p_tipo text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;
begin
 if p_tipo='empresa' then
  if not vs_dono(p_ator) then raise exception 'Somente o dono do aplicativo cadastra empresas'; end if;
 elsif p_tipo='funcionario' then
  if not exists(select 1 from vs_empresas where administrador_id=p_ator) then raise exception 'Somente o administrador da empresa cadastra funcionários'; end if;
 else raise exception 'Tipo de conta inválido'; end if;
 delete from vs_provisionamentos where expira_em<=now();
 insert into vs_provisionamentos(email,ator,tipo) values(lower(p_email),p_ator,p_tipo) returning id into ticket;
 return ticket;
end $$;

create function public.vs_cancelar_reserva(p_id uuid) returns void language sql security definer set search_path=public,pg_temp as $$delete from vs_provisionamentos where id=p_id$$;
revoke all on function public.vs_cancelar_reserva(uuid) from public,anon,authenticated;
grant execute on function public.vs_cancelar_reserva(uuid) to service_role;

create function public.vs_provisionar_empresa(p_ator uuid,p_usuario uuid,p_nome text,p_lojas uuid[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa vs_empresas; alvo perfis; pessoa record;
begin
 if not vs_dono(p_ator) then raise exception 'Somente o dono do aplicativo cadastra empresas'; end if;
 perform pg_advisory_xact_lock(hashtextextended('vs_empresas',1));
 select * into alvo from perfis where id=p_usuario for update;
 if alvo.id is null or alvo.empresa_id is not null or alvo.tipo_conta<>'legado' then raise exception 'Conta já vinculada a uma empresa'; end if;
 if p_lojas is null or cardinality(p_lojas)<>(select count(*) from lojas where id=any(p_lojas) and empresa_id is null) then raise exception 'Loja inválida ou já vinculada'; end if;
 if exists(select 1 from usuario_lojas where usuario_id=p_usuario and not(loja_id=any(p_lojas))) or (alvo.loja_id is not null and not(alvo.loja_id=any(p_lojas))) then raise exception 'Inclua todas as lojas atuais do administrador'; end if;
 -- Não transfere funcionários de outra empresa nem remove vínculos silenciosamente.
 if exists(select 1 from perfis p where (p.loja_id=any(p_lojas) or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=any(p_lojas))) and (p.empresa_id is not null or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and not(u.loja_id=any(p_lojas))) or (p.loja_id is not null and not(p.loja_id=any(p_lojas))))) then raise exception 'Revise os vínculos legados entre lojas antes de migrar'; end if;
 insert into vs_empresas(nome,administrador_id) values(trim(p_nome),p_usuario) returning * into empresa;
 update lojas set empresa_id=empresa.id where id=any(p_lojas);
 update perfis set empresa_id=empresa.id where id=p_usuario or loja_id=any(p_lojas) or id in(select usuario_id from usuario_lojas where loja_id=any(p_lojas));
 insert into usuario_lojas(usuario_id,loja_id) select id,loja_id from perfis where empresa_id=empresa.id and loja_id=any(p_lojas) on conflict do nothing;
 update perfis set tipo_conta='funcionario',liberacoes=jsonb_build_object('entrada',funcao in ('administrador','admin','gestor','gerente','operador'),'movimentacao',funcao in ('administrador','admin','gestor','gerente','operador'),'revisao',funcao in ('administrador','admin','gestor','gerente','precificacao'),'correcao',funcao in ('administrador','admin','gestor','gerente','adm')) where empresa_id=empresa.id and id<>p_usuario;
 update perfis set tipo_conta='empresa_admin',funcao='administrador' where id=p_usuario;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(p_ator,p_usuario,empresa.id,'Empresa cadastrada',jsonb_build_object('lojas_migradas',p_lojas));
 return to_jsonb(empresa);
end $$;
create function public.vs_salvar_acessos(p_usuario uuid,p_nome text,p_lojas uuid[],p_liberacoes jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare alvo perfis; empresa uuid; lojas_antes jsonb;
begin
 select id into empresa from vs_empresas where administrador_id=auth.uid() for update;
 select * into alvo from perfis where id=p_usuario for update;
 if empresa is null or alvo.empresa_id is distinct from empresa or p_usuario=auth.uid() or alvo.tipo_conta='empresa_admin' or vs_dono(p_usuario) then raise exception 'Funcionário fora da empresa ou conta protegida'; end if;
 if not coalesce(vs_liberacoes_validas(p_liberacoes),false) or nullif(trim(p_nome),'') is null then raise exception 'Nome ou liberações inválidas'; end if;
 if p_lojas is null or cardinality(p_lojas)<>(select count(*) from lojas where empresa_id=empresa and id=any(p_lojas)) then raise exception 'Loja fora da empresa ou duplicada'; end if;
 select coalesce(jsonb_agg(loja_id),'[]') into lojas_antes from usuario_lojas where usuario_id=p_usuario;
 delete from usuario_lojas where usuario_id=p_usuario;
 insert into usuario_lojas(usuario_id,loja_id) select p_usuario,unnest(p_lojas);
 update perfis set nome=trim(p_nome),liberacoes=p_liberacoes,tipo_conta='funcionario',loja_id=p_lojas[1] where id=p_usuario;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(auth.uid(),p_usuario,empresa,'Liberações alteradas',jsonb_build_object('lojas_antes',lojas_antes,'lojas',p_lojas,'liberacoes_antes',alvo.liberacoes,'liberacoes',p_liberacoes));
end $$;
create function public.vs_provisionar_funcionario(p_ator uuid,p_usuario uuid,p_nome text,p_login text,p_lojas uuid[],p_liberacoes jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid; alvo perfis;
begin
 select id into empresa from vs_empresas where administrador_id=p_ator for update;
 select * into alvo from perfis where id=p_usuario for update;
 if empresa is null or alvo.id is null or alvo.empresa_id is not null or alvo.loja_id is not null or exists(select 1 from usuario_lojas where usuario_id=p_usuario) or vs_dono(p_usuario) then raise exception 'Provisionamento não autorizado'; end if;
 if (p_login is null or p_login !~ '^[a-z0-9][a-z0-9._-]{2,39}$') or nullif(trim(p_nome),'') is null or not coalesce(vs_liberacoes_validas(p_liberacoes),false) then raise exception 'Dados do funcionário inválidos'; end if;
 if p_lojas is null or cardinality(p_lojas)=0 or cardinality(p_lojas)<>(select count(*) from lojas where empresa_id=empresa and id=any(p_lojas)) then raise exception 'Selecione lojas válidas da empresa'; end if;
 update perfis set empresa_id=empresa,tipo_conta='funcionario',login=p_login,liberacoes=p_liberacoes,nome=trim(p_nome),funcao='operador',loja_id=p_lojas[1] where id=p_usuario returning * into alvo;
 insert into usuario_lojas(usuario_id,loja_id) select p_usuario,unnest(p_lojas);
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(p_ator,p_usuario,empresa,'Funcionário cadastrado',jsonb_build_object('lojas',p_lojas,'liberacoes',p_liberacoes));
 return jsonb_build_object('id',alvo.id,'login',alvo.login);
end $$;
create function public.vs_conta_email(p_email text) returns uuid language sql stable security definer set search_path=public,pg_temp as $$select id from auth.users where lower(email)=lower(p_email)$$;

-- A primeira loja já exige vínculo administrativo com uma empresa criada pelo dono.
alter function public.vs_salvar_loja(jsonb,uuid) rename to vs_salvar_loja_anterior;
revoke all on function public.vs_salvar_loja_anterior(jsonb,uuid) from public,anon,authenticated;
create function public.vs_salvar_loja(p jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid; resultado jsonb;
begin
 select id into empresa from vs_empresas where administrador_id=auth.uid() for update;
 if empresa is null then raise exception 'Somente o administrador da empresa pode criar ou editar lojas'; end if;
 if p_id is not null and not exists(select 1 from lojas where id=p_id and empresa_id=empresa) then raise exception 'Loja fora da empresa'; end if;
 resultado:=vs_salvar_loja_anterior(p,p_id);
 update lojas set empresa_id=empresa where id=(resultado->>'id')::uuid;
 return resultado||jsonb_build_object('empresa_id',empresa);
end $$;
-- Fecha as APIs antigas que concediam cargos/vínculos sem a hierarquia de empresa.
revoke all on function public.vs_vincular_membro(uuid,uuid,uuid,text,text,text),public.vs_remover_membro(uuid,uuid),public.vs_editar_perfil(uuid,text,text,uuid) from public,anon,authenticated,service_role;
create function public.vs_meu_nome(p_nome text) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin if auth.uid() is null or nullif(trim(p_nome),'') is null then raise exception 'Nome inválido'; end if; update perfis set nome=trim(p_nome) where id=auth.uid(); end $$;
create function public.vs_contexto_acesso() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('versao',1,'dono_app',vs_dono(),'empresa_admin',exists(select 1 from vs_empresas where administrador_id=auth.uid()),'empresas',case when vs_dono() then coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('administrador',p.nome)) from vs_empresas e join perfis p on p.id=e.administrador_id),'[]') else '[]'::jsonb end,'lojas',coalesce((select jsonb_agg(to_jsonb(l) order by l.nome) from lojas l where vs_acesso(l.id)),'[]'),'lojas_legadas',case when vs_dono() then coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome)) from lojas where empresa_id is null),'[]') else '[]'::jsonb end)
$$;
create function public.vs_funcionarios() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('lojas',(select coalesce(jsonb_agg(u.loja_id),'[]') from usuario_lojas u where u.usuario_id=p.id))) from perfis p join vs_empresas e on e.id=p.empresa_id where e.administrador_id=auth.uid() and p.id<>auth.uid()),'[]')
$$;
-- A migração é uma transação: novas RPCs nunca ficam públicas pelo default do PostgreSQL.
revoke all on function public.vs_dono(uuid),public.vs_admin_empresa(uuid,uuid),public.vs_liberacoes_validas(jsonb),public.vs_permissoes(uuid),public.vs_guardar_identidade(),public.vs_reservar_conta(uuid,text,text),public.vs_provisionar_empresa(uuid,uuid,text,uuid[]),public.vs_provisionar_funcionario(uuid,uuid,text,text,uuid[],jsonb),public.vs_conta_email(text),public.vs_salvar_acessos(uuid,text,uuid[],jsonb),public.vs_meu_nome(text),public.vs_contexto_acesso(),public.vs_funcionarios(),public.vs_painel(uuid),public.vs_salvar_loja(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.vs_reservar_conta(uuid,text,text),public.vs_provisionar_empresa(uuid,uuid,text,uuid[]),public.vs_provisionar_funcionario(uuid,uuid,text,text,uuid[],jsonb),public.vs_conta_email(text) to service_role;
grant execute on function public.vs_dono(uuid),public.vs_admin_empresa(uuid,uuid),public.vs_salvar_acessos(uuid,text,uuid[],jsonb),public.vs_meu_nome(text),public.vs_contexto_acesso(),public.vs_funcionarios(),public.vs_painel(uuid),public.vs_salvar_loja(jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
