-- Aplicar após as quatro migrações de setembro, antes do frontend atualizado.
begin;
alter table public.vs_itens add column lote_fisico text check(length(lote_fisico)<=100);
alter table public.vs_itens add column nome_entrada text;
alter table public.vs_itens add column imagem_entrada text;
alter table public.vs_eventos add column usuario_nome text;
alter table public.vs_eventos add column usuario_funcao text;
-- Não se reconstrói lote físico ou identidade histórica dos registros legados.
create function public.vs_permitido(p_loja uuid,p_acao text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select vs_acesso(p_loja) and exists(select 1 from perfis p where p.id=auth.uid() and
 case p_acao
 when 'ENTRADA' then p.funcao in ('administrador','admin','gestor','gerente','operador')
 when 'MOVIMENTACAO' then p.funcao in ('administrador','admin','gestor','gerente','operador')
 when 'REVISAO' then p.funcao in ('administrador','admin','gestor','gerente','precificacao')
 when 'CORRECAO' then p.funcao in ('administrador','admin','gestor','gerente','adm')
 else false end)
$$;
revoke all on function public.vs_permitido(uuid,text) from public,anon,authenticated;
grant execute on function public.vs_permitido(uuid,text) to authenticated;
create function public.vs_autoria_evento() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 -- Identidade vem da sessão/servidor, nunca de dados enviados pelo cliente.
 if new.usuario_id is distinct from auth.uid() then raise exception 'Autor do evento inválido'; end if;
 select nome,funcao into new.usuario_nome,new.usuario_funcao from perfis where id=new.usuario_id;
 if new.usuario_id is null then new.usuario_nome:='Rotina automática'; end if;
 return new;
end $$;
revoke all on function public.vs_autoria_evento() from public,anon,authenticated;
create trigger vs_autoria before insert on public.vs_eventos for each row execute function public.vs_autoria_evento();
create function public.vs_equipe(p_loja uuid) returns jsonb language sql stable security definer
set search_path=public,pg_temp as $$
 select case when vs_gestor(p_loja) then coalesce((
 select jsonb_agg(to_jsonb(p) order by p.nome) from perfis p
 where p.loja_id=p_loja or exists(select 1 from usuario_lojas u where u.usuario_id=p.id and u.loja_id=p_loja)
 ),'[]'::jsonb) else '[]'::jsonb end
$$;
revoke all on function public.vs_equipe(uuid) from public,anon,authenticated;
grant execute on function public.vs_equipe(uuid) to authenticated;
create or replace function public.vs_registrar(p_item uuid,p_saldo integer,p_preco numeric,p_destino text,p_motivo text,p_totvs text,p_esperado integer,p_versao bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare l lotes_validade%rowtype; i vs_itens%rowtype; rodada uuid; faixa text; versao bigint; acao text;
begin
 select * into l from lotes_validade where id=p_item;
 if not found or not vs_acesso(l.loja_id) then raise exception 'Item não autorizado'; end if;
 acao:=case p_destino when 'Correção' then 'CORRECAO' when 'REVISAO' then 'REVISAO' else 'MOVIMENTACAO' end;
 if not vs_permitido(l.loja_id,acao) then raise exception 'Cargo não autorizado para esta operação'; end if;
 if p_esperado is null or p_versao is null or p_esperado<0 or p_versao<0 then raise exception 'Saldo e versão esperados são obrigatórios'; end if;
 rodada:=vs_sincronizar(l.loja_id);
 select * into l from lotes_validade where id=p_item for update;
 select * into i from vs_itens where item_id=p_item for update;
 select coalesce(max(id),0) into versao from vs_eventos where item_id=p_item;
 if l.quantidade<>p_esperado or versao<>p_versao then raise exception 'Registro alterado. Recarregue antes de salvar.'; end if;
 if l.status='baixado' or (p_destino is distinct from 'Correção' and (l.status<>'ativo' or l.quantidade<=0)) then raise exception 'Item já concluído'; end if;
 if p_saldo is null or p_saldo<0 or p_motivo is null or length(trim(p_motivo))=0 then raise exception 'Saldo e justificativa obrigatórios'; end if;
 if p_destino is null or p_destino not in ('REVISAO','Venda','Descarte','Troca','Bonificação','Uso Loja','Avaria','Correção') then raise exception 'Destino inválido'; end if;
 if p_destino='Correção' and (length(trim(p_motivo))<10 or p_saldo=l.quantidade) then raise exception 'Correção exige saldo diferente e justificativa de pelo menos 10 caracteres'; end if;
 if p_destino<>'Correção' and p_saldo>l.quantidade then raise exception 'Saldo maior exige correção de contagem'; end if;
 if p_destino='REVISAO' and (i.tipo<>'VAL' or i.vencido_em is not null or l.data_vencimento is null or l.data_vencimento<=vs_hoje() or p_saldo<>l.quantidade or p_preco is null or p_preco<0 or p_preco::text in ('NaN','Infinity','-Infinity')) then
 raise exception 'Revise somente saldo confirmado de item VAL não vencido, com preço válido'; end if;
 if p_destino='Venda' and (i.tipo<>'VAL' or i.vencido_em is not null or l.data_vencimento is null or l.data_vencimento<=vs_hoje()) then raise exception 'Venda não permitida para vencidos ou itens fora de VAL'; end if;
 if p_destino not in ('REVISAO','Correção') and p_saldo>=l.quantidade then raise exception 'Informe uma quantidade de saída positiva'; end if;
 faixa:=case when l.data_vencimento is null then null else vs_faixa(l.data_vencimento) end;
 insert into vs_eventos(item_id,loja_id,usuario_id,tipo,rodada_id,faixa,saldo_anterior,saldo_novo,quantidade,preco_anterior,preco_novo,referencia_totvs,motivo)
 values(p_item,l.loja_id,auth.uid(),p_destino,rodada,faixa,l.quantidade,p_saldo,l.quantidade-p_saldo,i.preco_atual,
 case when p_destino='REVISAO' then p_preco else i.preco_atual end,nullif(trim(p_totvs),''),trim(p_motivo));
 update lotes_validade set quantidade=p_saldo,status=case when p_saldo=0 then 'esgotado' else 'ativo' end where id=p_item;
 if p_destino='REVISAO' then update vs_itens set ultima_rodada=rodada,ultima_faixa=faixa,preco_atual=p_preco where item_id=p_item; end if;
 if p_destino='Correção' then
  -- Toda correção exige nova revisão; restaurar saldo vencido também sincroniza.
  update vs_itens set ultima_rodada=null,ultima_faixa=null where item_id=p_item;
  perform vs_sincronizar(l.loja_id);
 end if;
end $$;
create or replace function public.vs_criar(p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare loja uuid; produto uuid; ciclo ciclos_lotes%rowtype; item lotes_validade%rowtype;
 t text; qtd integer; venc date; preco numeric; rodada uuid; duplicado jsonb;
begin
 loja:=(p->>'lojaId')::uuid;
 if not vs_acesso(loja) then raise exception 'Loja não autorizada'; end if;
 if not vs_permitido(loja,'ENTRADA') then raise exception 'Cargo não autorizado a lançar produtos'; end if;
 if nullif(trim(p->>'lote'),'') is null or length(p->>'lote')>100 then raise exception 'Informe o lote físico (até 100 caracteres)'; end if;
 if p->>'setor' not in ('validade','vencidos','avarias','uso','uso_loja') or p->>'setor' is null then raise exception 'Setor inválido'; end if;
 qtd:=(p->>'quantidade')::integer; venc:=nullif(p->>'dataVencimento','')::date; preco:=(p->>'precoAtual')::numeric;
 if qtd is null or qtd<=0 or preco is null or preco<0 or preco::text in ('NaN','Infinity','-Infinity') or coalesce(p->>'ean','') !~ '^[0-9]{8,14}$'
 or length(trim(coalesce(p->>'produtoNome','')))=0 then raise exception 'EAN, nome, quantidade e preço válidos são obrigatórios'; end if;
 t:=case when p->>'setor'='avarias' then 'AV' when p->>'setor' in ('uso','uso_loja') then 'USO'
 when p->>'setor'='vencidos' or venc<=vs_hoje() then 'VENC' else 'VAL' end;
 if t in ('AV','USO') and length(trim(coalesce(p->>'motivo','')))<10 then raise exception 'Explique o motivo da entrada em pelo menos 10 caracteres'; end if;
 if t in ('VAL','VENC') and venc is null then raise exception 'Validade obrigatória'; end if;
 if p->>'setor'='vencidos' and venc>vs_hoje() then raise exception 'Produto ainda não vencido'; end if;
 rodada:=vs_sincronizar(loja);
 if t='VAL' then
   select c.* into ciclo from ciclos_lotes c join vs_rodadas r on r.lote_id=c.id where r.id=rodada;
 else select * into ciclo from vs_lote(loja,t); end if;
 -- Serializa o catálogo pelo EAN, além do bloqueio por loja feito pela sincronização.
 perform pg_advisory_xact_lock(hashtextextended(p->>'ean',1));
 select id into produto from produtos where ean=p->>'ean' limit 1;
 if produto is null then
   insert into produtos(ean,nome,imagem_url,preco_atual) values(p->>'ean',trim(p->>'produtoNome'),nullif(p->>'imagemUrl',''),preco) returning id into produto;
 end if;
 if not coalesce((p->>'forcarInsercao')::boolean,false) then
   select to_jsonb(l)||jsonb_build_object('perfis',jsonb_build_object('nome',f.nome)) into duplicado
   from lotes_validade l join vs_itens i on i.item_id=l.id left join perfis f on f.id=l.usuario_id
   where l.loja_id=loja and l.produto_id=produto and l.ciclo_lote_id=ciclo.id and l.status='ativo'
   and i.lote_fisico=trim(p->>'lote') and l.data_vencimento::date is not distinct from venc and l.localizacao=coalesce(nullif(p->>'localizacao',''),'Gôndola') limit 1;
   if duplicado is not null then return jsonb_build_object('isDuplicado',true,'registroExistente',duplicado); end if;
 end if;
 perform set_config('vs.preco_entrada',preco::text,true);
 insert into lotes_validade(loja_id,produto_id,lote,data_vencimento,quantidade,localizacao,usuario_id,status,ciclo_lote_id,origem_cadastro)
 values(loja,produto,ciclo.codigo_lote,venc,qtd,coalesce(nullif(p->>'localizacao',''),'Gôndola'),auth.uid(),'ativo',ciclo.id,
 case when t='VENC' then 'ADICIONADO_VENCIDO' else 'PADRAO' end) returning * into item;
 update vs_itens set lote_fisico=trim(p->>'lote'),nome_entrada=trim(p->>'produtoNome'),imagem_entrada=nullif(p->>'imagemUrl','') where item_id=item.id;
 if t in ('AV','USO') then
   update vs_eventos set motivo=coalesce(nullif(trim(p->>'motivo'),''),'Cadastro inicial') where item_id=item.id and tipo='ENTRADA';
 end if;
 perform vs_sincronizar(loja);
 return jsonb_build_object('isDuplicado',false,'registro',to_jsonb(item));
end $$;
create or replace function public.vs_painel(p_loja uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rodada uuid; resultado jsonb;
begin
 if not vs_acesso(p_loja) then raise exception 'Loja não autorizada'; end if;
 rodada:=vs_sincronizar(p_loja);
 select jsonb_build_object('api_version',2,'permissoes',jsonb_build_object('entrada',vs_permitido(p_loja,'ENTRADA'),'movimentacao',vs_permitido(p_loja,'MOVIMENTACAO'),'revisao',vs_permitido(p_loja,'REVISAO'),'correcao',vs_permitido(p_loja,'CORRECAO'),'equipe',vs_gestor(p_loja),'editarLoja',vs_gestor(p_loja),'criarLoja',exists(select 1 from perfis where id=auth.uid() and funcao in ('administrador','admin'))),'rodadaId',rodada,'rodada',to_jsonb(r),'itens',coalesce((
   select jsonb_agg(to_jsonb(l)||to_jsonb(i)||jsonb_build_object('id',l.id,'produtos',to_jsonb(p),
     'eventos',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('responsavel_nome',coalesce(e.usuario_nome,f.nome),'rodada_inicio',er.inicio,'rodada_fim',er.fim) order by e.id) from vs_eventos e left join perfis f on f.id=e.usuario_id left join vs_rodadas er on er.id=e.rodada_id where e.item_id=l.id),'[]'::jsonb)) order by l.data_vencimento,l.id)
   from lotes_validade l join vs_itens i on i.item_id=l.id left join produtos p on p.id=l.produto_id
   where l.loja_id=p_loja
 ),'[]'::jsonb)) into resultado from vs_rodadas r where r.id=rodada;
 return resultado;
end $$;
create or replace function public.vs_editar_perfil(p_usuario uuid,p_nome text,p_funcao text,p_loja uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare alvo perfis; cargo text;
begin
 select * into alvo from perfis where id=p_usuario for update;
 if auth.uid() is null or alvo.id is null then raise exception 'Perfil não autorizado'; end if;
 if nullif(trim(p_nome),'') is null then raise exception 'Informe o nome'; end if;
 if p_usuario=auth.uid() then
  if p_funcao is distinct from alvo.funcao or p_loja is distinct from alvo.loja_id then raise exception 'Não é permitido alterar o próprio cargo ou loja'; end if;
 else
  if not vs_gestor(p_loja) or not (alvo.loja_id=p_loja or exists(select 1 from usuario_lojas where usuario_id=p_usuario and loja_id=p_loja)) then raise exception 'Perfil fora da equipe'; end if;
  select funcao into cargo from perfis where id=auth.uid();
  if cargo not in ('administrador','admin') and (p_funcao<>'operador' or alvo.funcao<>'operador') then raise exception 'Somente administrador pode gerir cargos de gestão'; end if;
 end if;
 update perfis set nome=trim(p_nome),funcao=p_funcao where id=p_usuario returning * into alvo;
 return to_jsonb(alvo);
end $$;
notify pgrst, 'reload schema';
commit;
