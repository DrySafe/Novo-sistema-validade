begin;
alter table vs_itens add column codigo_produto_empresa text check(length(codigo_produto_empresa)<=80 and codigo_produto_empresa !~ '[[:cntrl:]]');
alter table vs_itens add column codigo_embalagem_empresa text check(length(codigo_embalagem_empresa)<=80 and codigo_embalagem_empresa !~ '[[:cntrl:]]');
alter table perfis add column desativado_em timestamptz;
alter table perfis add column desativado_por uuid references perfis(id) on delete set null;

-- Exclusão lógica preserva o histórico; a autorização é revalidada mesmo com JWT antigo.
create function vs_usuario_ativo(p_usuario uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from perfis where id=p_usuario and desativado_em is null)
$$;
revoke all on function vs_usuario_ativo(uuid) from public,anon,authenticated,service_role;

do $$
declare f record;body text;guard text;
begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('vs_acesso','vs_admin_empresa','vs_admin_loja','vs_gestor','vs_gerencia_usuarios','vs_notificacao_visivel','vs_pessoa_gerenciavel','vs_colaborador') loop
  body:=regexp_replace(regexp_replace(trim(f.prosrc),'^select\s+','','i'),';\s*$','');
  guard:=case when f.proname in ('vs_acesso','vs_notificacao_visivel') then 'vs_usuario_ativo(auth.uid())' when f.proname='vs_pessoa_gerenciavel' then 'vs_usuario_ativo(p_ator) and vs_usuario_ativo(p_usuario)' else 'vs_usuario_ativo(p_usuario)' end;
  execute format('create or replace function public.%I(%s) returns boolean language sql stable security definer set search_path=public,pg_temp as %L',f.proname,pg_get_function_arguments(f.oid),'select '||guard||' and ('||body||')');
 end loop;
end $$;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('vs_consumir_limite(uuid,text,integer,integer)'::regprocedure);
 if strpos(definition,'if p_usuario is null then')=0 then raise exception 'Versão de limites incompatível';end if;
 definition:=replace(definition,'if p_usuario is null then','if p_usuario is not null and not vs_usuario_ativo(p_usuario) then raise exception using errcode=''42501'',message=''Conta excluída da equipe. Procure o Gestor'';end if; if p_usuario is null then');execute definition;
 definition:=pg_get_functiondef('vs_contexto_acesso()'::regprocedure);
 if strpos(definition,'''senha_inicial'',')=0 then raise exception 'Contexto incompatível';end if;
 execute replace(definition,'''senha_inicial'',','''conta_desativada'',not vs_usuario_ativo(auth.uid()),''senha_inicial'',');
 definition:=pg_get_functiondef('vs_funcionarios()'::regprocedure);
 if strpos(definition,'''senha_inicial'',p.senha_inicial')=0 then raise exception 'Listagem incompatível';end if;
 execute replace(definition,'''senha_inicial'',p.senha_inicial','''desativado_em'',p.desativado_em,''senha_inicial'',p.senha_inicial');
end $$;

create function vs_excluir_colaborador(p_usuario uuid,p_motivo text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare alvo perfis;antes jsonb;
begin
 perform vs_consumir_limite(auth.uid(),'excluir_colaborador',10,600);
 select * into alvo from perfis where id=p_usuario and vs_pessoa_gerenciavel(id) for update;
 if alvo.id is null or not vs_pessoa_gerenciavel(p_usuario) then raise exception 'Conta protegida, excluída ou fora do seu escopo';end if;
 if length(trim(coalesce(p_motivo,'')))<10 or length(p_motivo)>500 then raise exception 'Explique a exclusão em 10 a 500 caracteres';end if;
 select coalesce(jsonb_agg(loja_id),'[]') into antes from usuario_lojas where usuario_id=p_usuario;
 update perfis set desativado_em=clock_timestamp(),desativado_por=auth.uid(),liberacoes='{"entrada":false,"movimentacao":false,"revisao":false,"correcao":false}' where id=p_usuario;
 insert into vs_acessos_auditoria(ator,usuario,empresa_id,acao,detalhes) values(auth.uid(),p_usuario,alvo.empresa_id,'Colaborador excluído',jsonb_build_object('nome',alvo.nome,'papel',alvo.tipo_conta,'lojas',antes,'motivo',trim(p_motivo)));
 perform vs_notificar(alvo.empresa_id,null,'gestor',null,'ACESSOS','Colaborador excluído',alvo.nome||' teve seu acesso bloqueado. O histórico foi preservado.','atencao',p_usuario,'usuario');
end $$;
revoke all on function vs_excluir_colaborador(uuid,text) from public,anon,authenticated;
grant execute on function vs_excluir_colaborador(uuid,text) to authenticated;

-- Códigos internos pertencem ao lançamento da loja, sem alterar o catálogo global por EAN.
alter function vs_criar(jsonb) rename to vs_criar_sem_codigos;
revoke all on function vs_criar_sem_codigos(jsonb) from public,anon,authenticated,service_role;
create function vs_criar(p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare resposta jsonb;campo text;codigo_produto text;codigo_embalagem text;
begin
 foreach campo in array array['codigoProdutoEmpresa','codigoEmbalagemEmpresa'] loop
  if p ? campo and jsonb_typeof(p->campo) not in ('string','null') then raise exception 'Código interno deve ser texto';end if;
  if length(p->>campo)>80 or (p->>campo) ~ '[[:cntrl:]]' then raise exception 'Código interno inválido: até 80 caracteres, sem quebras de linha';end if;
 end loop;
 codigo_produto:=nullif(trim(p->>'codigoProdutoEmpresa'),'');codigo_embalagem:=nullif(trim(p->>'codigoEmbalagemEmpresa'),'');
 resposta:=vs_criar_sem_codigos(p);
 if not coalesce((resposta->>'isDuplicado')::boolean,false) then
  update vs_itens set codigo_produto_empresa=codigo_produto,codigo_embalagem_empresa=codigo_embalagem where item_id=(resposta#>>'{registro,id}')::uuid and loja_id=(p->>'lojaId')::uuid;
 end if;
 return resposta;
end $$;
revoke all on function vs_criar(jsonb) from public,anon,authenticated;
grant execute on function vs_criar(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
