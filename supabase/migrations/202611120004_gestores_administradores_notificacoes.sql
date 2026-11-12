begin;
-- A conta que já administra a empresa conserva sua autoridade como Gestor.
alter table perfis drop constraint if exists perfis_tipo_conta_check;
alter table perfis add constraint perfis_tipo_conta_check check(tipo_conta in ('legado','empresa_admin','gestor','loja_admin','funcionario'));
update perfis set tipo_conta='gestor',funcao='gestor' where tipo_conta='empresa_admin' and exists(select 1 from vs_empresas e where e.administrador_id=perfis.id);
create unique index vs_ceo_unico on vs_donos((true));
create table vs_administradores_loja(
 usuario_id uuid references perfis(id) on delete cascade,
 loja_id uuid references lojas(id) on delete cascade,
 permite_edicao boolean not null default false,
 primary key(usuario_id,loja_id)
);
create table vs_loja_alteracoes(
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references vs_empresas(id) on delete cascade,
 loja_id uuid not null references lojas(id) on delete cascade,
 solicitante uuid references perfis(id) on delete set null,
 solicitante_nome text not null,
 estado text not null default 'EM_VERIFICACAO' check(estado in ('EM_VERIFICACAO','APROVADA','REJEITADA')),
 dados_antes jsonb not null,dados_propostos jsonb not null,
 criado_em timestamptz not null default now(),
 decidido_por uuid references perfis(id) on delete set null,decidido_em timestamptz,motivo text,
 versao integer not null default 1
);
create unique index vs_uma_alteracao_pendente on vs_loja_alteracoes(loja_id) where estado='EM_VERIFICACAO';
create table vs_notificacoes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references vs_empresas(id) on delete cascade,
 loja_id uuid references lojas(id) on delete cascade,
 audiencia text not null check(audiencia in ('gestor','administradores','loja','usuario')),
 destinatario uuid references perfis(id) on delete set null,
 autor uuid references perfis(id) on delete set null,autor_nome text not null,autor_papel text not null,
 tipo text not null,titulo text not null check(length(titulo)<=160),mensagem text not null check(length(mensagem)<=2000),
 prioridade text not null default 'informacao' check(prioridade in ('informacao','atencao','critico')),
 referencia uuid,referencia_tipo text,
 chave text,dados jsonb not null default '{}',
 criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
 unique(empresa_id,chave)
);
create index vs_notificacoes_empresa_data on vs_notificacoes(empresa_id,criado_em desc,id desc);
create index vs_notificacoes_loja on vs_notificacoes(loja_id,tipo);
create table vs_notificacoes_leituras(
 notificacao_id uuid references vs_notificacoes(id) on delete cascade,
 usuario_id uuid references perfis(id) on delete cascade,
 lida_em timestamptz not null default now(),primary key(notificacao_id,usuario_id)
);

create or replace function vs_admin_empresa(p_empresa uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono(p_usuario) and exists(select 1 from vs_empresas e join perfis p on p.id=e.administrador_id where e.id=p_empresa and p.id=p_usuario and p.tipo_conta in ('gestor','empresa_admin') and p.empresa_id=e.id and not p.senha_inicial)
$$;
create function vs_admin_loja(p_loja uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono(p_usuario) and exists(select 1 from lojas l join perfis p on p.id=p_usuario where l.id=p_loja and p.empresa_id=l.empresa_id and not p.senha_inicial and (vs_admin_empresa(l.empresa_id,p_usuario) or (p.tipo_conta='loja_admin' and exists(select 1 from vs_administradores_loja a join usuario_lojas u on u.usuario_id=a.usuario_id and u.loja_id=a.loja_id where a.usuario_id=p.id and a.loja_id=l.id))))
$$;
create or replace function vs_gestor(p_loja uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select vs_admin_loja(p_loja,p_usuario) or (not vs_dono(p_usuario) and exists(select 1 from lojas l join perfis p on p.id=p_usuario where l.id=p_loja and l.empresa_id is null and p.tipo_conta='legado' and not p.senha_inicial and p.funcao in ('administrador','admin','gestor','gerente','adm') and (p.loja_id=l.id or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=l.id))))
$$;
create function vs_gerencia_usuarios(p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono(p_usuario) and exists(select 1 from perfis p where p.id=p_usuario and not p.senha_inicial and (vs_admin_empresa(p.empresa_id,p_usuario) or (p.tipo_conta='loja_admin' and exists(select 1 from vs_administradores_loja a where a.usuario_id=p.id and vs_admin_loja(a.loja_id,p.id)))))
$$;
create function vs_pode_editar_loja(p_loja uuid,p_usuario uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select vs_admin_loja(p_loja,p_usuario) and (exists(select 1 from lojas l where l.id=p_loja and vs_admin_empresa(l.empresa_id,p_usuario)) or exists(select 1 from vs_administradores_loja a where a.loja_id=p_loja and a.usuario_id=p_usuario and a.permite_edicao))
$$;
create or replace function vs_permitido(p_loja uuid,p_acao text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select vs_acesso(p_loja) and exists(select 1 from perfis p where p.id=auth.uid() and case
 when vs_admin_loja(p_loja) then p_acao in ('ENTRADA','MOVIMENTACAO','REVISAO','CORRECAO')
 when p.tipo_conta='funcionario' then coalesce((p.liberacoes->>lower(p_acao))::boolean,false)
 else case p_acao when 'ENTRADA' then p.funcao in ('administrador','admin','gestor','gerente','operador') when 'MOVIMENTACAO' then p.funcao in ('administrador','admin','gestor','gerente','operador') when 'REVISAO' then p.funcao in ('administrador','admin','gestor','gerente','precificacao') when 'CORRECAO' then p.funcao in ('administrador','admin','gestor','gerente','adm') else false end end)
$$;
create or replace function vs_permissoes(p_loja uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('entrada',vs_permitido(p_loja,'ENTRADA'),'movimentacao',vs_permitido(p_loja,'MOVIMENTACAO'),'revisao',vs_permitido(p_loja,'REVISAO'),'correcao',vs_permitido(p_loja,'CORRECAO'),'equipe',vs_admin_loja(p_loja),'editarLoja',vs_pode_editar_loja(p_loja),'criarLoja',exists(select 1 from vs_empresas e where vs_admin_empresa(e.id)))
$$;
create or replace function vs_contexto_acesso() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('versao',1,'hierarquia_version',2,'dono_app',vs_dono(),'senha_inicial',coalesce((select senha_inicial from perfis where id=auth.uid()),false),
 'empresa_admin',not vs_dono() and exists(select 1 from vs_empresas where administrador_id=auth.uid()),
 'gestor_empresa',not vs_dono() and exists(select 1 from vs_empresas where administrador_id=auth.uid()),
 'admin_loja',not vs_dono() and coalesce((select tipo_conta='loja_admin' from perfis where id=auth.uid()),false),
 'pode_gerenciar_usuarios',vs_gerencia_usuarios(),'empresas','[]'::jsonb,'lojas_legadas','[]'::jsonb,
 'lojas',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('pode_editar_cadastro',vs_pode_editar_loja(l.id),'pode_administrar',vs_admin_loja(l.id)) order by l.nome) from lojas l where vs_acesso(l.id)),'[]'))
$$;

-- A comunicação é somente interna e respeita o acesso atual à loja.
create function vs_notificar(p_empresa uuid,p_loja uuid,p_audiencia text,p_destinatario uuid,p_tipo text,p_titulo text,p_mensagem text,p_prioridade text default 'informacao',p_referencia uuid default null,p_ref_tipo text default null,p_chave text default null,p_ator uuid default auth.uid()) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare resultado uuid;nome text;papel text;
begin
 if p_empresa is null then return null;end if;
 select p.nome,case when vs_admin_empresa(p.empresa_id,p.id) then 'gestor' when p.tipo_conta='loja_admin' then 'loja_admin' else 'funcionario' end into nome,papel from perfis p where p.id=p_ator;
 insert into vs_notificacoes(empresa_id,loja_id,audiencia,destinatario,autor,autor_nome,autor_papel,tipo,titulo,mensagem,prioridade,referencia,referencia_tipo,chave)
 values(p_empresa,p_loja,p_audiencia,p_destinatario,p_ator,coalesce(nome,'Sistema'),coalesce(papel,'sistema'),p_tipo,left(p_titulo,160),left(p_mensagem,2000),p_prioridade,p_referencia,p_ref_tipo,p_chave)
 on conflict(empresa_id,chave) do update set mensagem=excluded.mensagem,atualizado_em=clock_timestamp() where vs_notificacoes.mensagem is distinct from excluded.mensagem returning id into resultado;
 return resultado;
end $$;
create function vs_notificacao_visivel(p_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono() and exists(select 1 from vs_notificacoes n join perfis p on p.id=auth.uid() where n.id=p_id and n.empresa_id=p.empresa_id and not p.senha_inicial and ((vs_admin_empresa(n.empresa_id) and (n.audiencia<>'usuario' or n.destinatario=p.id)) or ((n.loja_id is null or vs_acesso(n.loja_id)) and (n.destinatario=p.id or (n.tipo='AVISO' and n.autor=p.id) or (n.audiencia='loja' and vs_acesso(n.loja_id)) or (n.audiencia='administradores' and vs_admin_loja(n.loja_id))))))
$$;

-- Campos cadastrais são normalizados e comparados antes de aprovar.
create function vs_dados_loja(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('nome',nome,'numero_loja',numero_loja,'razao_social',razao_social,'cnpj',cnpj,'inscricao_estadual',inscricao_estadual,'logradouro',logradouro,'numero',numero,'bairro',bairro,'cidade',cidade,'uf',uf,'cep',cep,'telefone',telefone) from lojas where id=p_id
$$;
create function vs_validar_loja(p jsonb,p_atual jsonb default '{}') returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare k text;valor text;resultado jsonb:='{}';
begin
 if jsonb_typeof(p)<>'object' or length(p::text)>16384 then raise exception 'Dados da loja inválidos';end if;
 if exists(select 1 from jsonb_object_keys(p) key where key not in ('nome','numero_loja','razao_social','cnpj','inscricao_estadual','logradouro','numero','bairro','cidade','uf','cep','telefone')) then raise exception 'Campo cadastral não permitido';end if;
 foreach k in array array['nome','numero_loja','razao_social','cnpj','inscricao_estadual','logradouro','numero','bairro','cidade','uf','cep','telefone'] loop
  if p ? k and jsonb_typeof(p->k) not in ('string','null') then raise exception 'Campo cadastral inválido';end if;
  valor:=nullif(trim(p->>k),'');
  if k='numero_loja' then valor:=coalesce(valor,p_atual->>k,'01');end if;
  if length(valor)>255 or (k='numero_loja' and length(valor)>10) or (k='uf' and length(valor)>2) then raise exception 'Campo cadastral excede o tamanho permitido';end if;
  resultado:=resultado||jsonb_build_object(k,valor);
 end loop;
 if resultado->>'nome' is null then raise exception 'Informe o nome da loja';end if;
 return resultado;
end $$;
create function vs_aplicar_loja(p_id uuid,p jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update lojas set nome=p->>'nome',numero_loja=p->>'numero_loja',razao_social=p->>'razao_social',cnpj=p->>'cnpj',inscricao_estadual=p->>'inscricao_estadual',logradouro=p->>'logradouro',numero=p->>'numero',bairro=p->>'bairro',cidade=p->>'cidade',uf=p->>'uf',cep=p->>'cep',telefone=p->>'telefone' where id=p_id;
end $$;
create or replace function vs_salvar_loja(p jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid;dados jsonb;antes jsonb;alvo lojas;pedido uuid;nome_autor text;
begin
 perform vs_consumir_limite(auth.uid(),'vs_salvar_loja',30,60);
 if vs_dono() then raise exception 'CEO não opera lojas';end if;
 select e.id into empresa from vs_empresas e where vs_admin_empresa(e.id);
 if p_id is null then
  if empresa is null then raise exception 'Somente o Gestor com senha pessoal pode criar lojas';end if;
  perform pg_advisory_xact_lock(hashtextextended(empresa::text,33));
  dados:=vs_validar_loja(p);
  insert into lojas(nome,numero_loja,empresa_id) values(dados->>'nome',dados->>'numero_loja',empresa) returning * into alvo;
  perform vs_aplicar_loja(alvo.id,dados);
  insert into usuario_lojas(usuario_id,loja_id) values(auth.uid(),alvo.id) on conflict do nothing;
  update perfis set loja_id=coalesce(loja_id,alvo.id) where id=auth.uid();
 else
  if not vs_acesso(p_id) or not vs_pode_editar_loja(p_id) then raise exception 'Edição não liberada pelo Gestor para esta loja';end if;
  select * into alvo from lojas where id=p_id for update;
  if exists(select 1 from vs_loja_alteracoes where loja_id=p_id and estado='EM_VERIFICACAO') then raise exception 'Há uma alteração em verificação. Aguarde a decisão do Gestor';end if;
  antes:=vs_dados_loja(p_id);dados:=vs_validar_loja(p,antes);
  if dados=antes then raise exception 'Nenhuma alteração cadastral informada';end if;
  if not vs_admin_empresa(alvo.empresa_id) then
   select nome into nome_autor from perfis where id=auth.uid();
   insert into vs_loja_alteracoes(empresa_id,loja_id,solicitante,solicitante_nome,dados_antes,dados_propostos) values(alvo.empresa_id,p_id,auth.uid(),nome_autor,antes,dados) returning id into pedido;
   perform vs_notificar(alvo.empresa_id,p_id,'gestor',null,'ALTERACAO_LOJA','Alteração de loja em verificação',nome_autor||' enviou alterações cadastrais para análise. Os dados atuais permanecem vigentes.','atencao',pedido,'alteracao_loja');
   perform vs_notificar(alvo.empresa_id,p_id,'usuario',auth.uid(),'ALTERACAO_LOJA','Solicitação enviada','A alteração cadastral aguarda a decisão do Gestor.','informacao',pedido,'alteracao_loja');
   return jsonb_build_object('id',p_id,'solicitacao_id',pedido,'estado','EM_VERIFICACAO','pendente',true);
  end if;
  perform vs_aplicar_loja(p_id,dados);
 end if;
 select * into alvo from lojas where id=alvo.id;
 insert into vs_acessos_auditoria(ator,empresa_id,acao,detalhes) values(auth.uid(),alvo.empresa_id,case when p_id is null then 'Loja criada pelo Gestor' else 'Loja editada pelo Gestor' end,jsonb_build_object('loja_id',alvo.id,'antes',antes,'depois',dados));
 return to_jsonb(alvo);
end $$;
create function vs_decidir_loja(p_id uuid,p_aprovar boolean,p_motivo text,p_versao integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare pedido vs_loja_alteracoes;atual jsonb;v_motivo text;
begin
 perform vs_consumir_limite(auth.uid(),'vs_decidir_loja',30,60);
 -- Ordem de locks igual à submissão: loja antes da solicitação.
 perform l.id from lojas l join vs_loja_alteracoes a on a.loja_id=l.id where a.id=p_id and vs_admin_empresa(a.empresa_id) for update of l;
 select * into pedido from vs_loja_alteracoes where id=p_id and vs_admin_empresa(empresa_id) for update;
 if pedido.id is null or not vs_admin_empresa(pedido.empresa_id) then raise exception 'Somente o Gestor da empresa pode decidir';end if;
 if pedido.estado<>'EM_VERIFICACAO' or pedido.versao is distinct from p_versao then raise exception 'Solicitação já analisada ou alterada. Atualize a tela';end if;
 if p_aprovar is null then raise exception 'Informe a decisão';end if;
 v_motivo:=coalesce(nullif(trim(p_motivo),''),case when p_aprovar then 'Aprovado após conferência pelo Gestor' end);
 if length(v_motivo)<10 or v_motivo is null or length(v_motivo)>2000 then raise exception 'Informe uma justificativa de 10 a 2000 caracteres';end if;
 atual:=vs_dados_loja(pedido.loja_id);
 if p_aprovar then
  if atual is distinct from pedido.dados_antes then raise exception 'Os dados vigentes mudaram. Recuse e solicite novo envio';end if;
  perform vs_aplicar_loja(pedido.loja_id,pedido.dados_propostos);
 end if;
 update vs_loja_alteracoes set estado=case when p_aprovar then 'APROVADA' else 'REJEITADA' end,decidido_por=auth.uid(),decidido_em=now(),motivo=v_motivo,versao=versao+1 where id=p_id;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(auth.uid(),pedido.solicitante,pedido.empresa_id,'Decisão de alteração de loja',jsonb_build_object('solicitacao',p_id,'aprovada',p_aprovar,'motivo',v_motivo));
 update vs_notificacoes set titulo=case when p_aprovar then 'Alteração cadastral aprovada' else 'Alteração cadastral recusada' end,mensagem=v_motivo,atualizado_em=case when audiencia='gestor' then clock_timestamp() else atualizado_em end where referencia=p_id and referencia_tipo='alteracao_loja' and tipo='ALTERACAO_LOJA';
 perform vs_notificar(pedido.empresa_id,pedido.loja_id,'usuario',pedido.solicitante,'DECISAO_LOJA',case when p_aprovar then 'Alteração aprovada' else 'Alteração recusada' end,v_motivo,'informacao',p_id,'alteracao_loja');
end $$;

create function vs_validar_escopo_usuario(p_ator uuid,p_papel text,p_lojas uuid[]) returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p perfis;empresa uuid;
begin
 select * into p from perfis where id=p_ator;
 if not vs_gerencia_usuarios(p_ator) then raise exception 'Somente Gestor ou administrador de loja autorizado cadastra usuários';end if;
 empresa:=p.empresa_id;
 if p_papel is null or p_papel not in ('funcionario','loja_admin') then raise exception 'Papel de usuário inválido';end if;
 if p_papel='loja_admin' and not vs_admin_empresa(empresa,p_ator) then raise exception 'Somente o Gestor define administradores';end if;
 if p_lojas is null or cardinality(p_lojas)=0 or cardinality(p_lojas)>100 or cardinality(p_lojas)<>(select count(distinct x) from unnest(p_lojas) x) then raise exception 'Selecione lojas sem duplicação';end if;
 if cardinality(p_lojas)<>(select count(*) from lojas l where l.id=any(p_lojas) and l.empresa_id=empresa and vs_admin_loja(l.id,p_ator)) then raise exception 'Loja fora do seu escopo de administração';end if;
 return empresa;
end $$;
create function vs_preparar_conta(p_ator uuid,p_email text,p_papel text,p_lojas uuid[]) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;tipo text;
begin
 if p_papel='gestor' then
  if not vs_dono(p_ator) then raise exception 'Somente o CEO cria Gestores';end if;
  if coalesce(cardinality(p_lojas),0)<>0 then raise exception 'CEO não pode vincular lojas';end if;
  tipo:='empresa';
 else perform vs_validar_escopo_usuario(p_ator,p_papel,p_lojas);tipo:='funcionario';end if;
 perform vs_consumir_limite(p_ator,'cadastro_conta',10,600);
 delete from vs_provisionamentos where expira_em<=now();
 insert into vs_provisionamentos(email,ator,tipo) values(lower(p_email),p_ator,tipo) returning id into ticket;
 return ticket;
end $$;
-- APIs antigas continuam sem conceder autoridade além da nova hierarquia.
create or replace function vs_reservar_conta(p_ator uuid,p_email text,p_tipo text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket uuid;
begin
 if p_tipo='empresa' then return vs_preparar_conta(p_ator,p_email,'gestor','{}');end if;
 if p_tipo<>'funcionario' or not vs_gerencia_usuarios(p_ator) then raise exception 'Somente o administrador da empresa autorizado pode cadastrar';end if;
 perform vs_consumir_limite(p_ator,'cadastro_conta',10,600);
 delete from vs_provisionamentos where expira_em<=now();
 insert into vs_provisionamentos(email,ator,tipo) values(lower(p_email),p_ator,p_tipo) returning id into ticket;
 return ticket;
end $$;
create or replace function vs_provisionar_empresa(p_ator uuid,p_usuario uuid,p_nome text,p_lojas uuid[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid;alvo perfis;
begin
 if not vs_dono(p_ator) then raise exception 'Somente o CEO cadastra Gestores';end if;
 if p_lojas is null or cardinality(p_lojas)<>0 then raise exception 'CEO não pode vincular lojas';end if;
 select * into alvo from perfis where id=p_usuario for update;
 if alvo.id is null or p_usuario=p_ator or vs_dono(p_usuario) or alvo.empresa_id is not null or alvo.loja_id is not null or alvo.tipo_conta<>'legado' or exists(select 1 from usuario_lojas where usuario_id=p_usuario) then raise exception 'Somente contas novas podem ser cadastradas';end if;
 update vs_cadastros_auth set consumido_em=now() where usuario_id=p_usuario and ator=p_ator and tipo='empresa' and consumido_em is null;
 if not found then raise exception 'Cadastro novo autorizado obrigatório';end if;
 insert into vs_empresas(nome,administrador_id) values('Empresa',p_usuario) returning id into empresa;
 update perfis set empresa_id=empresa,tipo_conta='gestor',funcao='gestor',senha_inicial=true,nome='Gestor da empresa' where id=p_usuario;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao) values(p_ator,p_usuario,empresa,'Gestor cadastrado pelo CEO');
 return jsonb_build_object('criado',true,'papel','gestor');
end $$;
create function vs_provisionar_pessoa(p_ator uuid,p_usuario uuid,p_nome text,p_login text,p_lojas uuid[],p_liberacoes jsonb,p_papel text default 'funcionario',p_edicao uuid[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid;alvo perfis;
begin
 empresa:=vs_validar_escopo_usuario(p_ator,p_papel,p_lojas);
 if p_login is null or p_login !~ '^[a-z0-9][a-z0-9._-]{2,39}$' or nullif(trim(p_nome),'') is null or length(p_nome)>255 or not coalesce(vs_liberacoes_validas(p_liberacoes),false) then raise exception 'Dados de usuário inválidos';end if;
 if p_edicao is null or cardinality(p_edicao)>100 or cardinality(p_edicao)<>(select count(distinct l) from unnest(p_edicao) l) or exists(select 1 from unnest(p_edicao) l where not (l=any(p_lojas))) or (p_papel<>'loja_admin' and cardinality(p_edicao)>0) then raise exception 'Liberação de edição inválida';end if;
 select * into alvo from perfis where id=p_usuario for update;
 if alvo.id is null or alvo.empresa_id is not null or alvo.loja_id is not null or alvo.tipo_conta<>'legado' or vs_dono(p_usuario) or exists(select 1 from usuario_lojas where usuario_id=p_usuario) then raise exception 'Provisionamento não autorizado';end if;
 update vs_cadastros_auth set consumido_em=now() where usuario_id=p_usuario and ator=p_ator and tipo='funcionario' and consumido_em is null;
 if not found then raise exception 'Cadastro novo autorizado obrigatório';end if;
 update perfis set empresa_id=empresa,tipo_conta=p_papel,funcao=case when p_papel='loja_admin' then 'administrador' else 'operador' end,login=p_login,nome=trim(p_nome),loja_id=p_lojas[1],liberacoes=p_liberacoes,senha_inicial=true where id=p_usuario;
 insert into usuario_lojas(usuario_id,loja_id) select p_usuario,unnest(p_lojas);
 if p_papel='loja_admin' then insert into vs_administradores_loja(usuario_id,loja_id,permite_edicao) select p_usuario,l,l=any(p_edicao) from unnest(p_lojas) l;end if;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(p_ator,p_usuario,empresa,'Usuário cadastrado',jsonb_build_object('papel',p_papel,'lojas',p_lojas,'edicao',p_edicao,'liberacoes',p_liberacoes));
 perform vs_notificar(empresa,p_lojas[1],'gestor',null,'ACESSOS','Novo usuário cadastrado',trim(p_nome)||' foi cadastrado como '||case when p_papel='loja_admin' then 'administrador de loja.' else 'colaborador.' end,'informacao',p_usuario,'usuario',null,p_ator);
 return jsonb_build_object('id',p_usuario,'login',p_login,'papel',p_papel,'troca_senha_primeiro_acesso',true);
end $$;
create or replace function vs_provisionar_funcionario(p_ator uuid,p_usuario uuid,p_nome text,p_login text,p_lojas uuid[],p_liberacoes jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin return vs_provisionar_pessoa(p_ator,p_usuario,p_nome,p_login,p_lojas,p_liberacoes,'funcionario','{}');end $$;

create function vs_pessoa_gerenciavel(p_usuario uuid,p_ator uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select vs_gerencia_usuarios(p_ator) and p_usuario<>p_ator and exists(select 1 from perfis p join perfis a on a.id=p_ator where p.id=p_usuario and p.empresa_id=a.empresa_id and p.tipo_conta in ('funcionario','loja_admin') and not vs_dono(p.id) and (vs_admin_empresa(a.empresa_id,p_ator) or (p.tipo_conta='funcionario' and exists(select 1 from usuario_lojas u where u.usuario_id=p.id) and not exists(select 1 from usuario_lojas u where u.usuario_id=p.id and not vs_admin_loja(u.loja_id,p_ator)))))
$$;
create function vs_salvar_pessoa(p_usuario uuid,p_nome text,p_papel text,p_lojas uuid[],p_liberacoes jsonb,p_edicao uuid[] default '{}') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare alvo perfis;empresa uuid;antes jsonb;
begin
 perform vs_consumir_limite(auth.uid(),'vs_salvar_acessos',30,60);
 select * into alvo from perfis where id=p_usuario and vs_pessoa_gerenciavel(id) for update;
 if alvo.id is null or not vs_pessoa_gerenciavel(p_usuario) then raise exception 'Usuário fora do escopo ou conta protegida. Procure o Gestor';end if;
 -- Suspensão sem lojas é permitida, mas só o Gestor pode definir administradores.
 empresa:=alvo.empresa_id;
 if p_papel is null or p_papel not in ('funcionario','loja_admin') or (p_papel='loja_admin' and not vs_admin_empresa(empresa)) then raise exception 'Somente o Gestor define administradores';end if;
 if p_lojas is null or cardinality(p_lojas)>100 or cardinality(p_lojas)<>(select count(distinct l) from unnest(p_lojas) l) then raise exception 'Lojas inválidas ou duplicadas';end if;
 if cardinality(p_lojas)>0 then perform vs_validar_escopo_usuario(auth.uid(),p_papel,p_lojas);end if;
 if nullif(trim(p_nome),'') is null or length(p_nome)>255 or not coalesce(vs_liberacoes_validas(p_liberacoes),false) then raise exception 'Nome ou liberações inválidas';end if;
 if p_edicao is null or cardinality(p_edicao)>100 or cardinality(p_edicao)<>(select count(distinct l) from unnest(p_edicao) l) or exists(select 1 from unnest(p_edicao) l where not(l=any(p_lojas))) or (p_papel<>'loja_admin' and cardinality(p_edicao)>0) then raise exception 'Liberação de edição inválida';end if;
 select coalesce(jsonb_agg(loja_id),'[]') into antes from usuario_lojas where usuario_id=p_usuario;
 delete from vs_administradores_loja where usuario_id=p_usuario;
 delete from usuario_lojas where usuario_id=p_usuario;
 insert into usuario_lojas(usuario_id,loja_id) select p_usuario,unnest(p_lojas);
 if p_papel='loja_admin' then insert into vs_administradores_loja(usuario_id,loja_id,permite_edicao) select p_usuario,l,l=any(p_edicao) from unnest(p_lojas) l;end if;
 update perfis set nome=trim(p_nome),tipo_conta=p_papel,funcao=case when p_papel='loja_admin' then 'administrador' else 'operador' end,loja_id=p_lojas[1],liberacoes=p_liberacoes where id=p_usuario;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(auth.uid(),p_usuario,empresa,'Liberações alteradas',jsonb_build_object('papel_antes',alvo.tipo_conta,'papel',p_papel,'lojas_antes',antes,'lojas',p_lojas,'edicao',p_edicao,'liberacoes',p_liberacoes));
 perform vs_notificar(empresa,null,'gestor',null,'ACESSOS','Acesso de usuário atualizado',trim(p_nome)||' teve papel, lojas ou liberações atualizados.','atencao',p_usuario,'usuario');
end $$;
create or replace function vs_salvar_acessos(p_usuario uuid,p_nome text,p_lojas uuid[],p_liberacoes jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from perfis where id=p_usuario and tipo_conta='loja_admin') then raise exception 'Use a gestão explícita de papel para alterar um administrador';end if;
 perform vs_salvar_pessoa(p_usuario,p_nome,'funcionario',p_lojas,p_liberacoes,'{}');
end $$;
create or replace function vs_funcionarios() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'login',p.login,'tipo_conta',p.tipo_conta,'senha_inicial',p.senha_inicial,'liberacoes',p.liberacoes,
 'gerenciavel',vs_pessoa_gerenciavel(p.id),'acesso_fora_escopo',not vs_pessoa_gerenciavel(p.id),
 'lojas',(select coalesce(jsonb_agg(u.loja_id),'[]') from usuario_lojas u where u.usuario_id=p.id and vs_admin_loja(u.loja_id)),
 'edicao_lojas',(select coalesce(jsonb_agg(a.loja_id),'[]') from vs_administradores_loja a where a.usuario_id=p.id and a.permite_edicao and vs_admin_loja(a.loja_id))) order by p.nome)
 from perfis p join perfis ator on ator.id=auth.uid() where vs_gerencia_usuarios() and p.id<>auth.uid() and p.empresa_id=ator.empresa_id and p.tipo_conta in ('funcionario','loja_admin') and (vs_admin_empresa(ator.empresa_id) or (p.tipo_conta='funcionario' and exists(select 1 from usuario_lojas u where u.usuario_id=p.id and vs_admin_loja(u.loja_id))))),'[]')
$$;

create function vs_alertas_tarefas() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t record;
begin
 for t in select x.*,l.empresa_id from vs_tarefas x join lojas l on l.id=x.loja_id where x.estado not in ('concluida','cancelada') and x.prazo<vs_hoje() and vs_acesso(x.loja_id) and l.empresa_id=(select empresa_id from perfis where id=auth.uid()) loop
  perform vs_notificar(t.empresa_id,t.loja_id,'administradores',t.responsavel_id,'ACAO_ATRASADA','Ação com prazo vencido',t.titulo||' — prazo '||to_char(t.prazo,'DD/MM/YYYY')||'. Atualize a execução ou registre o impedimento.','atencao',t.id,'tarefa','atraso:'||t.id::text||':'||vs_hoje()::text,null);
 end loop;
end $$;
create function vs_notificacoes_dados(p_loja uuid default null,p_tipo text default null,p_papel text default null,p_nao_lidas boolean default false,p_antes timestamptz default null,p_antes_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare resultado jsonb;total integer;
begin
 perform vs_consumir_limite(auth.uid(),'vs_notificacoes_dados',120,60);
 if vs_dono() or not exists(select 1 from perfis where id=auth.uid() and not senha_inicial) then raise exception 'Acesso às notificações não autorizado';end if;
 if p_loja is not null and not vs_acesso(p_loja) then raise exception 'Loja não autorizada';end if;
 perform vs_alertas_tarefas();
 select count(*) into total from vs_notificacoes n left join vs_notificacoes_leituras r on r.notificacao_id=n.id and r.usuario_id=auth.uid() where n.empresa_id=(select empresa_id from perfis where id=auth.uid()) and vs_notificacao_visivel(n.id) and (r.lida_em is null or r.lida_em<n.atualizado_em);
 select coalesce(jsonb_agg(item order by criado_em desc,id desc),'[]') into resultado from (
  select n.id,n.criado_em,to_jsonb(n)||jsonb_build_object('loja_nome',coalesce(l.nome,'Empresa'),'lida',coalesce(r.lida_em>=n.atualizado_em,false),
   'alteracao',case when n.referencia_tipo='alteracao_loja' and (vs_admin_empresa(n.empresa_id) or a.solicitante=auth.uid()) then to_jsonb(a) else null end) item
  from vs_notificacoes n left join lojas l on l.id=n.loja_id left join vs_notificacoes_leituras r on r.notificacao_id=n.id and r.usuario_id=auth.uid()
  left join vs_loja_alteracoes a on n.referencia_tipo='alteracao_loja' and a.id=n.referencia
  where n.empresa_id=(select empresa_id from perfis where id=auth.uid()) and vs_notificacao_visivel(n.id) and (p_loja is null or n.loja_id=p_loja) and (p_tipo is null or n.tipo=p_tipo) and (p_papel is null or n.autor_papel=p_papel)
   and (not p_nao_lidas or r.lida_em is null or r.lida_em<n.atualizado_em)
   and (p_antes is null or (n.criado_em,n.id)<(p_antes,p_antes_id))
  order by n.criado_em desc,n.id desc limit 51
 ) s;
 return jsonb_build_object('nao_lidas',total,'itens',resultado,'limite',50);
end $$;
create function vs_ler_notificacoes(p_ids uuid[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform vs_consumir_limite(auth.uid(),'vs_ler_notificacoes',120,60);
 if p_ids is null or cardinality(p_ids)>50 or cardinality(p_ids)<>(select count(*) from vs_notificacoes where id=any(p_ids) and vs_notificacao_visivel(id)) then raise exception 'Notificação fora do seu acesso ou seleção inválida';end if;
 insert into vs_notificacoes_leituras(notificacao_id,usuario_id,lida_em) select unnest(p_ids),auth.uid(),clock_timestamp() on conflict(notificacao_id,usuario_id) do update set lida_em=excluded.lida_em;
end $$;
create function vs_enviar_aviso(p_loja uuid,p_destino text,p_titulo text,p_mensagem text,p_prioridade text default 'informacao') returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid;
begin
 if not vs_acesso(p_loja) then raise exception 'Loja não autorizada';end if;
 if p_destino is null or p_destino not in ('gestor','administradores','loja') or (p_destino='loja' and not vs_admin_loja(p_loja)) then raise exception 'Destinatário não permitido para seu perfil';end if;
 if nullif(trim(p_titulo),'') is null or length(p_titulo)>160 or nullif(trim(p_mensagem),'') is null or length(trim(p_mensagem))<10 or length(p_mensagem)>2000 or p_prioridade is null or p_prioridade not in ('informacao','atencao','critico') then raise exception 'Informe título e mensagem de 10 a 2000 caracteres';end if;
 perform vs_consumir_limite(auth.uid(),'vs_enviar_aviso',20,600);
 select empresa_id into empresa from lojas where id=p_loja;
 if empresa is null then raise exception 'Loja sem empresa vinculada';end if;
 return vs_notificar(empresa,p_loja,p_destino,null,'AVISO',trim(p_titulo),trim(p_mensagem),p_prioridade);
end $$;

-- Eventos de alta frequência (entrada, venda e revisão) não geram ruído na caixa.
create function vs_notificar_estoque() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid;tipo text;titulo text;mensagem text;produto text;chave text;id_n uuid;hoje text;unidades bigint;autor_id uuid;
begin
 if new.tipo not in ('Correção','Descarte','Avaria','VENCIMENTO') then return new;end if;
 select l.empresa_id,coalesce(i.nome_entrada,p.nome,'Produto') into empresa,produto from lojas l join vs_itens i on i.loja_id=l.id join lotes_validade s on s.id=i.item_id left join produtos p on p.id=s.produto_id where i.item_id=new.item_id;
 if empresa is null then return new;end if;
 tipo:=case new.tipo when 'Correção' then 'CORRECAO' when 'Descarte' then 'DESCARTE' when 'Avaria' then 'AVARIA' else 'VENCIMENTO' end;
 if new.tipo='Correção' then
  perform vs_notificar(empresa,new.loja_id,'administradores',null,tipo,'Quantidade corrigida',produto||': saldo '||new.saldo_anterior||' → '||new.saldo_novo||'. Consulte o histórico e a justificativa.','atencao',new.item_id,'item');
 else
  hoje:=vs_hoje()::text;autor_id:=case when new.tipo='VENCIMENTO' then null else new.usuario_id end;
  chave:='estoque:'||tipo||':'||new.loja_id::text||':'||hoje||':'||coalesce(autor_id::text,'sistema');
  titulo:=case new.tipo when 'VENCIMENTO' then 'Produtos vencidos para destinação' when 'Descarte' then 'Descartes registrados hoje' else 'Avarias registradas hoje' end;
  unidades:=case when new.tipo='VENCIMENTO' then new.saldo_novo else coalesce(new.quantidade,0) end;
  id_n:=vs_notificar(empresa,new.loja_id,'administradores',null,tipo,titulo,'Ocorrências de hoje; consulte o módulo e o histórico para detalhes.','atencao',null,null,chave,autor_id);
  update vs_notificacoes set dados=jsonb_build_object('registros',coalesce((dados->>'registros')::bigint,0)+1,'unidades',coalesce((dados->>'unidades')::bigint,0)+unidades),mensagem=(coalesce((dados->>'registros')::bigint,0)+1)::text||' registros e '||(coalesce((dados->>'unidades')::bigint,0)+unidades)::text||' unidades. Consulte o módulo correspondente e o histórico.',atualizado_em=clock_timestamp() where id=id_n;
 end if;
 return new;
end $$;
create trigger vs_notificacao_estoque after insert on vs_eventos for each row execute function vs_notificar_estoque();
create function vs_notificar_tarefa() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare empresa uuid;
begin
 select empresa_id into empresa from lojas where id=new.loja_id;
 if empresa is null then return new;end if;
 if tg_op='INSERT' then
  perform vs_notificar(empresa,new.loja_id,'usuario',new.responsavel_id,'ACAO','Ação atribuída',new.titulo||' — prazo '||to_char(new.prazo,'DD/MM/YYYY')||'.','informacao',new.id,'tarefa');
 elsif new.estado is distinct from old.estado and new.estado in ('impedida','concluida') then
  perform vs_notificar(empresa,new.loja_id,'administradores',null,'ACAO',case when new.estado='impedida' then 'Execução de ação impedida' else 'Ação concluída' end,new.titulo||'. Consulte o resultado em Ações e resultados.',case when new.estado='impedida' then 'atencao' else 'informacao' end,new.id,'tarefa');
 end if;
 return new;
end $$;
create trigger vs_notificacao_tarefa after insert or update of estado on vs_tarefas for each row execute function vs_notificar_tarefa();

create function vs_contar_notificacoes() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare total integer;
begin
 if auth.uid() is null or vs_dono() or not exists(select 1 from perfis where id=auth.uid() and not senha_inicial) then return 0;end if;
 perform vs_consumir_limite(auth.uid(),'vs_contar_notificacoes',120,60);
 perform vs_alertas_tarefas();
 select count(*) into total from vs_notificacoes n left join vs_notificacoes_leituras r on r.notificacao_id=n.id and r.usuario_id=auth.uid() where n.empresa_id=(select empresa_id from perfis where id=auth.uid()) and vs_notificacao_visivel(n.id) and (r.lida_em is null or r.lida_em<n.atualizado_em);
 return total;
end $$;

-- Somente leitura direta, limitada ao papel/loja; toda escrita é por função autorizada.
do $$
declare t text;
begin
 foreach t in array array['vs_administradores_loja','vs_loja_alteracoes','vs_notificacoes','vs_notificacoes_leituras'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public,anon,authenticated',t);
  execute format('grant select on %I to authenticated',t);
 end loop;
end $$;
create policy vs_admin_loja_leitura on vs_administradores_loja for select to authenticated using(vs_admin_loja(loja_id));
create policy vs_alteracoes_leitura on vs_loja_alteracoes for select to authenticated using(vs_admin_empresa(empresa_id) or (solicitante=auth.uid() and vs_acesso(loja_id)));
create policy vs_notificacoes_leitura on vs_notificacoes for select to authenticated using(vs_notificacao_visivel(id));
create policy vs_leituras_proprias on vs_notificacoes_leituras for select to authenticated using(usuario_id=auth.uid() and vs_notificacao_visivel(notificacao_id));
-- Funções privadas não podem ser usadas para forjar ator, loja, notificações ou aprovações.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vs_admin_loja','vs_gerencia_usuarios','vs_pode_editar_loja','vs_notificar','vs_notificacao_visivel','vs_dados_loja','vs_validar_loja','vs_aplicar_loja','vs_validar_escopo_usuario','vs_preparar_conta','vs_provisionar_pessoa','vs_pessoa_gerenciavel','vs_salvar_pessoa','vs_decidir_loja','vs_alertas_tarefas','vs_notificacoes_dados','vs_ler_notificacoes','vs_enviar_aviso','vs_notificar_estoque','vs_notificar_tarefa','vs_contar_notificacoes') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function vs_contar_notificacoes(),vs_admin_loja(uuid,uuid),vs_notificacao_visivel(uuid),vs_salvar_pessoa(uuid,text,text,uuid[],jsonb,uuid[]),vs_decidir_loja(uuid,boolean,text,integer),vs_notificacoes_dados(uuid,text,text,boolean,timestamptz,uuid),vs_ler_notificacoes(uuid[]),vs_enviar_aviso(uuid,text,text,text,text) to authenticated;
grant execute on function vs_preparar_conta(uuid,text,text,uuid[]),vs_provisionar_pessoa(uuid,uuid,text,text,uuid[],jsonb,text,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
