-- Gestores adicionais pertencem à mesma empresa; somente CEO cria nova empresa.
begin;

create or replace function vs_admin_empresa(p_empresa uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono(p_usuario) and exists(select 1 from vs_empresas e join perfis p on p.empresa_id=e.id where e.id=p_empresa and p.id=p_usuario and (p.tipo_conta='gestor' or (p.tipo_conta='empresa_admin' and e.administrador_id=p.id)) and p.empresa_id=e.id and not p.senha_inicial)
$$;

create or replace function vs_contexto_acesso() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('versao',1,'hierarquia_version',3,'dono_app',vs_dono(),'senha_inicial',coalesce((select senha_inicial from perfis where id=auth.uid()),false),
 'empresa_admin',exists(select 1 from vs_empresas where vs_admin_empresa(id)),
 'gestor_empresa',exists(select 1 from vs_empresas where vs_admin_empresa(id)),
 'admin_loja',not vs_dono() and coalesce((select tipo_conta='loja_admin' from perfis where id=auth.uid()),false),
 'pode_gerenciar_usuarios',vs_gerencia_usuarios(),'empresas','[]'::jsonb,'lojas_legadas','[]'::jsonb,
 'lojas',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('pode_editar_cadastro',vs_pode_editar_loja(l.id),'pode_administrar',vs_admin_loja(l.id)) order by l.nome) from lojas l where vs_acesso(l.id)),'[]'))
$$;

create or replace function vs_validar_escopo_usuario(p_ator uuid,p_papel text,p_lojas uuid[]) returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p perfis;empresa uuid;
begin
 select * into p from perfis where id=p_ator;
 if not vs_gerencia_usuarios(p_ator) then raise exception 'Somente Gestor ou administrador de loja autorizado cadastra usuários';end if;
 empresa:=p.empresa_id;
 if p_papel is null or p_papel not in ('funcionario','loja_admin','gestor') then raise exception 'Papel de usuário inválido';end if;
 if p_papel='gestor' then
  if not vs_admin_empresa(empresa,p_ator) then raise exception 'Somente o Gestor cria outro Gestor da mesma empresa';end if;
  if p_lojas is null or cardinality(p_lojas)<>0 then raise exception 'Gestor acessa todas as lojas da empresa; não selecione lojas';end if;
  return empresa;
 end if;
 if p_papel='loja_admin' and not vs_admin_empresa(empresa,p_ator) then raise exception 'Somente o Gestor define administradores';end if;
 if p_lojas is null or cardinality(p_lojas)=0 or cardinality(p_lojas)>100 or cardinality(p_lojas)<>(select count(distinct x) from unnest(p_lojas) x) then raise exception 'Selecione lojas sem duplicação';end if;
 if cardinality(p_lojas)<>(select count(*) from lojas l where l.id=any(p_lojas) and l.empresa_id=empresa and vs_admin_loja(l.id,p_ator)) then raise exception 'Loja fora do seu escopo de administração';end if;
 return empresa;
end $$;

create or replace function vs_preparar_conta(p_ator uuid,p_email text,p_papel text,p_lojas uuid[]) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;tipo text;
begin
 if p_papel='gestor' and vs_dono(p_ator) then
  if coalesce(cardinality(p_lojas),0)<>0 then raise exception 'CEO não pode vincular lojas';end if;
  tipo:='empresa';
 else perform vs_validar_escopo_usuario(p_ator,p_papel,p_lojas);tipo:='funcionario';end if;
 perform vs_consumir_limite(p_ator,'cadastro_conta',10,600);
 delete from vs_provisionamentos where expira_em<=now();
 insert into vs_provisionamentos(email,ator,tipo) values(lower(p_email),p_ator,tipo) returning id into ticket;
 return ticket;
end $$;

create or replace function vs_reservar_conta(p_ator uuid,p_email text,p_tipo text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;
begin
 if p_tipo='empresa' then
  if not vs_dono(p_ator) then raise exception 'Somente o CEO cria novas empresas';end if;
  return vs_preparar_conta(p_ator,p_email,'gestor','{}');end if;
 if p_tipo<>'funcionario' or not vs_gerencia_usuarios(p_ator) then raise exception 'Somente o administrador da empresa autorizado pode cadastrar';end if;
 perform vs_consumir_limite(p_ator,'cadastro_conta',10,600);
 delete from vs_provisionamentos where expira_em<=now();
 insert into vs_provisionamentos(email,ator,tipo) values(lower(p_email),p_ator,p_tipo) returning id into ticket;
 return ticket;
end $$;

create or replace function vs_provisionar_pessoa(p_ator uuid,p_usuario uuid,p_nome text,p_login text,p_lojas uuid[],p_liberacoes jsonb,p_papel text default 'funcionario',p_edicao uuid[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid;alvo perfis;
begin
 empresa:=vs_validar_escopo_usuario(p_ator,p_papel,p_lojas);
 if p_login is null or p_login !~ '^[a-z0-9][a-z0-9._-]{2,39}$' or nullif(trim(p_nome),'') is null or length(p_nome)>255 or not coalesce(vs_liberacoes_validas(p_liberacoes),false) then raise exception 'Dados de usuário inválidos';end if;
 if p_edicao is null or cardinality(p_edicao)>100 or cardinality(p_edicao)<>(select count(distinct l) from unnest(p_edicao) l) or exists(select 1 from unnest(p_edicao) l where not (l=any(p_lojas))) or (p_papel<>'loja_admin' and cardinality(p_edicao)>0) then raise exception 'Liberação de edição inválida';end if;
 select * into alvo from perfis where id=p_usuario for update;
 if alvo.id is null or alvo.empresa_id is not null or alvo.loja_id is not null or alvo.tipo_conta<>'legado' or vs_dono(p_usuario) or exists(select 1 from usuario_lojas where usuario_id=p_usuario) then raise exception 'Provisionamento não autorizado';end if;
 update vs_cadastros_auth set consumido_em=now() where usuario_id=p_usuario and ator=p_ator and tipo='funcionario' and consumido_em is null;
 if not found then raise exception 'Cadastro novo autorizado obrigatório';end if;
 update perfis set empresa_id=empresa,tipo_conta=p_papel,funcao=case when p_papel='gestor' then 'gestor' when p_papel='loja_admin' then 'administrador' else 'operador' end,login=p_login,nome=trim(p_nome),loja_id=p_lojas[1],liberacoes=case when p_papel='gestor' then '{"entrada":true,"movimentacao":true,"revisao":true,"correcao":true}'::jsonb else p_liberacoes end,senha_inicial=true where id=p_usuario;
 insert into usuario_lojas(usuario_id,loja_id) select p_usuario,unnest(p_lojas);
 if p_papel='loja_admin' then insert into vs_administradores_loja(usuario_id,loja_id,permite_edicao) select p_usuario,l,l=any(p_edicao) from unnest(p_lojas) l;end if;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(p_ator,p_usuario,empresa,'Usuário cadastrado',jsonb_build_object('papel',p_papel,'lojas',p_lojas,'edicao',p_edicao,'liberacoes',p_liberacoes));
 perform vs_notificar(empresa,p_lojas[1],'gestor',null,'ACESSOS','Novo usuário cadastrado',trim(p_nome)||' foi cadastrado como '||case when p_papel='gestor' then 'Gestor da empresa, com acesso a todas as lojas.' when p_papel='loja_admin' then 'administrador de loja.' else 'colaborador.' end,'informacao',p_usuario,'usuario',null,p_ator);
 return jsonb_build_object('id',p_usuario,'login',p_login,'papel',p_papel,'troca_senha_primeiro_acesso',true);
end $$;

create or replace function vs_salvar_pessoa(p_usuario uuid,p_nome text,p_papel text,p_lojas uuid[],p_liberacoes jsonb,p_edicao uuid[] default '{}') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare alvo perfis;empresa uuid;antes jsonb;
begin
 perform vs_consumir_limite(auth.uid(),'vs_salvar_acessos',30,60);
 select * into alvo from perfis where id=p_usuario and vs_pessoa_gerenciavel(id) for update;
 if alvo.id is null or not vs_pessoa_gerenciavel(p_usuario) then raise exception 'Usuário fora do escopo ou conta protegida. Procure o Gestor';end if;
 -- Suspensão sem lojas é permitida, mas só o Gestor pode definir administradores.
 empresa:=alvo.empresa_id;
 if p_papel is null or p_papel not in ('funcionario','loja_admin','gestor') or (p_papel in ('loja_admin','gestor') and not vs_admin_empresa(empresa)) then raise exception 'Somente o Gestor define administradores';end if;
 if p_lojas is null or cardinality(p_lojas)>100 or cardinality(p_lojas)<>(select count(distinct l) from unnest(p_lojas) l) then raise exception 'Lojas inválidas ou duplicadas';end if;
 if p_papel='gestor' or cardinality(p_lojas)>0 then perform vs_validar_escopo_usuario(auth.uid(),p_papel,p_lojas);end if;
 if nullif(trim(p_nome),'') is null or length(p_nome)>255 or not coalesce(vs_liberacoes_validas(p_liberacoes),false) then raise exception 'Nome ou liberações inválidas';end if;
 if p_edicao is null or cardinality(p_edicao)>100 or cardinality(p_edicao)<>(select count(distinct l) from unnest(p_edicao) l) or exists(select 1 from unnest(p_edicao) l where not(l=any(p_lojas))) or (p_papel<>'loja_admin' and cardinality(p_edicao)>0) then raise exception 'Liberação de edição inválida';end if;
 select coalesce(jsonb_agg(loja_id),'[]') into antes from usuario_lojas where usuario_id=p_usuario;
 delete from vs_administradores_loja where usuario_id=p_usuario;
 delete from usuario_lojas where usuario_id=p_usuario;
 insert into usuario_lojas(usuario_id,loja_id) select p_usuario,unnest(p_lojas);
 if p_papel='loja_admin' then insert into vs_administradores_loja(usuario_id,loja_id,permite_edicao) select p_usuario,l,l=any(p_edicao) from unnest(p_lojas) l;end if;
 update perfis set nome=trim(p_nome),tipo_conta=p_papel,funcao=case when p_papel='gestor' then 'gestor' when p_papel='loja_admin' then 'administrador' else 'operador' end,loja_id=p_lojas[1],liberacoes=case when p_papel='gestor' then '{"entrada":true,"movimentacao":true,"revisao":true,"correcao":true}'::jsonb else p_liberacoes end where id=p_usuario;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(auth.uid(),p_usuario,empresa,'Liberações alteradas',jsonb_build_object('papel_antes',alvo.tipo_conta,'papel',p_papel,'lojas_antes',antes,'lojas',p_lojas,'edicao',p_edicao,'liberacoes',p_liberacoes));
 perform vs_notificar(empresa,null,'gestor',null,'ACESSOS','Acesso de usuário atualizado',trim(p_nome)||' teve papel, lojas ou liberações atualizados.','atencao',p_usuario,'usuario');
end $$;

create or replace function vs_funcionarios() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'login',p.login,'tipo_conta',p.tipo_conta,'senha_inicial',p.senha_inicial,'liberacoes',p.liberacoes,
 'gerenciavel',vs_pessoa_gerenciavel(p.id),'acesso_fora_escopo',not vs_pessoa_gerenciavel(p.id),
 'lojas',(select coalesce(jsonb_agg(u.loja_id),'[]') from usuario_lojas u where u.usuario_id=p.id and vs_admin_loja(u.loja_id)),
 'edicao_lojas',(select coalesce(jsonb_agg(a.loja_id),'[]') from vs_administradores_loja a where a.usuario_id=p.id and a.permite_edicao and vs_admin_loja(a.loja_id))) order by p.nome)
 from perfis p join perfis ator on ator.id=auth.uid() where vs_gerencia_usuarios() and p.id<>auth.uid() and p.empresa_id=ator.empresa_id and p.tipo_conta in ('funcionario','loja_admin','gestor','empresa_admin') and not vs_dono(p.id) and (vs_admin_empresa(ator.empresa_id) or (p.tipo_conta='funcionario' and exists(select 1 from usuario_lojas u where u.usuario_id=p.id and vs_admin_loja(u.loja_id))))),'[]')
$$;

create function vs_preparar_conta_equipe(p_ator uuid,p_email text,p_papel text,p_lojas uuid[],p_nova_empresa boolean) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_nova_empresa is null then raise exception 'Tipo de cadastro obrigatório';end if;
 if p_nova_empresa then
  if p_papel is distinct from 'gestor' or not vs_dono(p_ator) then raise exception 'Somente o CEO cria novas empresas';end if;
 else
  perform vs_validar_escopo_usuario(p_ator,p_papel,p_lojas);
 end if;
 return vs_preparar_conta(p_ator,p_email,p_papel,p_lojas);
end $$;
revoke all on function vs_preparar_conta_equipe(uuid,text,text,uuid[],boolean) from public,anon,authenticated;
grant execute on function vs_preparar_conta_equipe(uuid,text,text,uuid[],boolean) to service_role;

-- CREATE OR REPLACE preserva as ACLs: provisionamento continua exclusivo de service_role.

commit;
