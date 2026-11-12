begin;
-- Nenhuma escrita direta do navegador: alterações passam pelos RPCs autorizados.
do $$
declare t record;
begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',t.tablename);
  execute format('revoke all on public.%I from public,anon',t.tablename);
  execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from authenticated',t.tablename);
 end loop;
end $$;
revoke all on all sequences in schema public from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from public,anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;

-- Políticas restritivas também limitam políticas permissivas antigas.
do $$
declare t text;
begin
 foreach t in array array['produtos','promocoes','registros_perdas','auditoria_eventos'] loop
  if to_regclass('public.'||t) is null then continue;end if;
  execute format('grant select on public.%I to authenticated',t);
  if t='produtos' then
   execute 'create policy vs_catalogo_leitura on produtos for select to authenticated using (true)';
   execute 'create policy vs_catalogo_visivel on produtos as restrictive for select to authenticated using (auth.uid() is not null and exists(select 1 from lotes_validade l where l.produto_id=produtos.id and vs_acesso(l.loja_id)))';
  else
   execute format('create policy vs_seguranca_loja on public.%I as restrictive for all to authenticated using (auth.uid() is not null and vs_acesso(loja_id)) with check (auth.uid() is not null and vs_acesso(loja_id))',t);
  end if;
 end loop;
end $$;

-- Limites no servidor, compartilhados entre instâncias e sessões do mesmo usuário.
create table vs_limites_operacao(
 usuario uuid not null,acao text not null,janela timestamptz not null,
 quantidade integer not null check(quantidade>0),expira_em timestamptz not null,
 primary key(usuario,acao,janela)
);
create index vs_limites_expiracao on vs_limites_operacao(expira_em);
alter table vs_limites_operacao enable row level security;
revoke all on vs_limites_operacao from public,anon,authenticated;
create function vs_consumir_limite(p_usuario uuid,p_acao text,p_max integer,p_segundos integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare agora timestamptz:=clock_timestamp();inicio timestamptz;n integer;
begin
 if p_usuario is null then raise exception 'Autenticação obrigatória';end if;
 if p_max not between 1 and 10000 or p_segundos not between 1 and 3600 then raise exception 'Limite inválido';end if;
 inicio:=to_timestamp(floor(extract(epoch from agora)/p_segundos)*p_segundos);
 delete from vs_limites_operacao where expira_em<agora-interval '1 day';
 insert into vs_limites_operacao(usuario,acao,janela,quantidade,expira_em) values(p_usuario,p_acao,inicio,1,inicio+make_interval(secs=>p_segundos))
 on conflict(usuario,acao,janela) do update set quantidade=vs_limites_operacao.quantidade+1 returning quantidade into n;
 if n>p_max then raise sqlstate 'PT429' using message='Muitas operações. Aguarde e tente novamente.';end if;
end $$;
revoke all on function vs_consumir_limite(uuid,text,integer,integer) from public,anon,authenticated,service_role;

-- Renomear as implementações preserva regras, parâmetros e efeitos do estoque.
do $$
declare f record;args text;params text;result text;base text;body text;cap integer;
begin
 for f in select p.*,p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('vs_criar','vs_registrar','vs_criar_acomp','vs_salvar_loja','vs_salvar_acessos','vs_meu_nome','vs_salvar_posicao','vs_salvar_rotina','vs_atualizar_posicao','vs_definir_custo','vs_criar_tarefa','vs_atualizar_tarefa','vs_painel','vs_acomp_dados') loop
  args:=pg_get_function_arguments(f.oid);result:=pg_get_function_result(f.oid);
  select string_agg(quote_ident(name),',') into params from unnest(f.proargnames) name;
  base:='vs_sec_base_'||f.proname;
  execute format('alter function %s rename to %I',f.signature,base);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',base,pg_get_function_identity_arguments(f.oid));
  cap:=case when f.proname in ('vs_salvar_loja','vs_salvar_acessos') then 30 else 240 end;
  body:=format('begin perform vs_consumir_limite(auth.uid(),%L,%s,60); ',f.proname,cap);
  if f.proname in ('vs_criar','vs_criar_acomp','vs_salvar_loja','vs_criar_tarefa') then body:=body||'if length(p::text)>16384 then raise exception ''Dados excedem o tamanho permitido'';end if; ';end if;
  if result='void' then body:=body||format('perform %I(%s); return; end',base,params);
  else body:=body||format('return %I(%s); end',base,params);end if;
  execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path=public,pg_temp as %L',f.proname,args,result,body);
  execute format('revoke all on function public.%I(%s) from public,anon',f.proname,pg_get_function_identity_arguments(f.oid));
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,pg_get_function_identity_arguments(f.oid));
 end loop;
end $$;
-- Cadastro de contas tem limite mais baixo e não pode ser chamado pelo cliente.
alter function vs_reservar_conta(uuid,text,text) rename to vs_sec_base_reservar_conta;
revoke all on function vs_sec_base_reservar_conta(uuid,text,text) from public,anon,authenticated,service_role;
create function vs_reservar_conta(p_ator uuid,p_email text,p_tipo text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_tipo='empresa' then
  if not vs_dono(p_ator) then raise exception 'Somente o CEO cadastra administradores';end if;
 elsif p_tipo='funcionario' then
  if not exists(select 1 from vs_empresas where vs_admin_empresa(id,p_ator)) then raise exception 'Somente o administrador da empresa cadastra funcionários';end if;
 else raise exception 'Operação inválida';end if;
 perform vs_consumir_limite(p_ator,'cadastro_conta',10,600);
 return vs_sec_base_reservar_conta(p_ator,p_email,p_tipo);
end $$;
revoke all on function vs_reservar_conta(uuid,text,text) from public,anon,authenticated;
grant execute on function vs_reservar_conta(uuid,text,text) to service_role;
-- O catálogo compartilhado não deve expor preços globais de outra loja.
revoke select on produtos from authenticated;
grant select(id,ean,nome,imagem_url) on produtos to authenticated;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.vs_painel_anterior(uuid)'::regprocedure);
 if position('''produtos'',to_jsonb(p)' in definition)=0 then raise exception 'Revisar projeção do painel antes de aplicar';end if;
 definition:=replace(definition,'''produtos'',to_jsonb(p)', '''produtos'',jsonb_build_object(''id'',p.id,''ean'',p.ean,''nome'',coalesce(i.nome_entrada,p.nome),''imagem_url'',coalesce(i.imagem_entrada,p.imagem_url))');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
