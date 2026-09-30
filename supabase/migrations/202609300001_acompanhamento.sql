-- Requer IDs UUID e as tabelas existentes indicadas pelo frontend.
-- Aplicar primeiro em homologação. Esta migração não altera RPCs legadas.
begin;
-- AV e USO não exigem validade. VAL/VENC continuam validados na RPC de entrada.
alter table public.lotes_validade alter column data_vencimento drop not null;
create unique index if not exists vs_codigo_lote_unico on ciclos_lotes(loja_id,codigo_lote);

create function public.vs_hoje() returns date language sql stable
set search_path = public as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create function public.vs_faixa(d date) returns text language sql stable
set search_path = public as $$
 select case when d <= vs_hoje() then 'VENC' when d-vs_hoje() <= 7 then '7'
 when d-vs_hoje() <= 15 then '15' when d-vs_hoje() <= 30 then '30'
 when d-vs_hoje() <= 45 then '45' when d-vs_hoje() <= 60 then '60' else '60+' end
$$;

create function public.vs_acesso(p_loja uuid) returns boolean language sql stable security definer
set search_path = public as $$
 select auth.uid() is not null and (exists(select 1 from usuario_lojas where usuario_id=auth.uid() and loja_id=p_loja)
 or exists(select 1 from perfis where id=auth.uid() and loja_id=p_loja))
$$;

create table public.vs_rodadas (
 id uuid primary key default gen_random_uuid(), loja_id uuid not null references lojas(id), lote_id uuid references ciclos_lotes(id),
 inicio date not null, fim date not null, unique(loja_id,inicio), check(fim=inicio+14)
);
create table public.vs_itens (
 item_id uuid primary key references lotes_validade(id), loja_id uuid not null references lojas(id),
 origem_codigo text not null, tipo text not null check(tipo in ('VAL','VENC','AV','USO')),
 entrada_em timestamptz not null, dias_entrada integer, quantidade_inicial integer,
 preco_inicial numeric, preco_atual numeric, ultima_rodada uuid references vs_rodadas(id),
 ultima_faixa text, vencido_em date, lote_vencidos text, saldo_vencimento integer,
 legado boolean not null default false
);
create table public.vs_eventos (
 id bigint generated always as identity primary key, item_id uuid not null references vs_itens(item_id),
 loja_id uuid not null references lojas(id), usuario_id uuid references auth.users(id),
 ocorrido_em timestamptz not null default now(), tipo text not null,
 rodada_id uuid references vs_rodadas(id), faixa text, saldo_anterior integer not null,
 saldo_novo integer not null check(saldo_novo>=0), quantidade integer,
 preco_anterior numeric, preco_novo numeric, referencia_totvs text, motivo text not null
);
create index on vs_eventos(item_id,ocorrido_em);
alter table vs_rodadas enable row level security;
alter table vs_itens enable row level security;
alter table vs_eventos enable row level security;
create policy leitura on vs_rodadas for select to authenticated using(vs_acesso(loja_id));
create policy leitura on vs_itens for select to authenticated using(vs_acesso(loja_id));
create policy leitura on vs_eventos for select to authenticated using(vs_acesso(loja_id));
grant select on vs_rodadas,vs_itens,vs_eventos,lotes_validade,ciclos_lotes to authenticated;
revoke insert,update,delete on vs_rodadas,vs_itens,vs_eventos from anon,authenticated;
alter table lotes_validade enable row level security;
alter table ciclos_lotes enable row level security;
create policy vs_isolamento on lotes_validade as restrictive for all to authenticated using(vs_acesso(loja_id)) with check(vs_acesso(loja_id));
create policy vs_isolamento on ciclos_lotes as restrictive for all to authenticated using(vs_acesso(loja_id)) with check(vs_acesso(loja_id));
create policy vs_leitura on lotes_validade for select to authenticated using(vs_acesso(loja_id));
create policy vs_leitura on ciclos_lotes for select to authenticated using(vs_acesso(loja_id));

-- Para registros antigos, preço e quantidade iniciais não podem ser reconstruídos.
insert into vs_itens(item_id,loja_id,origem_codigo,tipo,entrada_em,dias_entrada,preco_atual,legado)
 select l.id,l.loja_id,coalesce(l.lote_origem_codigo,c.codigo_lote,l.lote,'LEGADO'),
 case when l.lote_origem_codigo like '%VAL%' then 'VAL' when c.codigo_lote like '%VENC%' then 'VENC' when c.codigo_lote like '%USO%' then 'USO'
 when c.codigo_lote like '%AV%' then 'AV' else 'VAL' end,
 l.created_at,l.data_vencimento::date-(l.created_at at time zone 'America/Sao_Paulo')::date,p.preco_atual,true
from lotes_validade l left join ciclos_lotes c on c.id=l.ciclo_lote_id left join produtos p on p.id=l.produto_id;

create function public.vs_capturar_entrada() returns trigger language plpgsql security definer
set search_path = public as $$
declare codigo text; t text; preco numeric;
begin
 select codigo_lote into codigo from ciclos_lotes where id=new.ciclo_lote_id;
 select preco_atual into preco from produtos where id=new.produto_id;
 preco:=coalesce(nullif(current_setting('vs.preco_entrada',true),'')::numeric,preco);
 t:=case when codigo like '%VENC%' then 'VENC' when codigo like '%USO%' then 'USO'
 when codigo like '%AV%' then 'AV' else 'VAL' end;
 insert into vs_itens(item_id,loja_id,origem_codigo,tipo,entrada_em,dias_entrada,quantidade_inicial,preco_inicial,preco_atual)
 values(new.id,new.loja_id,coalesce(codigo,new.lote),t,new.created_at,new.data_vencimento::date-vs_hoje(),new.quantidade,preco,preco);
 insert into vs_eventos(item_id,loja_id,usuario_id,tipo,faixa,saldo_anterior,saldo_novo,preco_novo,motivo)
 values(new.id,new.loja_id,auth.uid(),'ENTRADA',vs_faixa(new.data_vencimento::date),0,new.quantidade,preco,'Cadastro inicial');
 return new;
end $$;
create trigger vs_entrada after insert on lotes_validade for each row execute function vs_capturar_entrada();

create function public.vs_lote(p_loja uuid,p_tipo text) returns setof ciclos_lotes language plpgsql security definer
set search_path=public as $$
declare codigo text; numero text; sufixo text; seq integer; encontrado uuid;
begin
 if not vs_acesso(p_loja) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Loja não autorizada'; end if;
 if p_tipo not in ('VAL','VENC','AV','USO') then raise exception 'Tipo de lote inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_loja::text,0));
 select coalesce(nullif(trim(numero_loja),''),'01') into numero from lojas where id=p_loja;
 if numero is null then raise exception 'Loja inexistente'; end if;
 if length(numero)=1 then numero:='0'||numero; end if;
 sufixo:=to_char(vs_hoje(),case when p_tipo='VAL' then 'MMYYYY' else 'DDMMYYYY' end);
 if p_tipo<>'VAL' then
   select id into encontrado from ciclos_lotes where loja_id=p_loja and codigo_lote like numero||p_tipo||sufixo||'%'
   and status='EM EDIÇÃO' order by created_at limit 1;
   if encontrado is not null then return query select * from ciclos_lotes where id=encontrado; return; end if;
 end if;
 select coalesce(max(sequencia_num),0)+1 into seq from ciclos_lotes where loja_id=p_loja and codigo_lote like numero||p_tipo||sufixo||'%';
 if seq>9999 then raise exception 'Sequência de lotes excedida'; end if;
 codigo:=numero||p_tipo||sufixo||lpad(seq::text,4,'0');
 return query insert into ciclos_lotes(loja_id,codigo_lote,sequencia_num,status,data_abertura)
 values(p_loja,codigo,seq,'EM EDIÇÃO',now()) returning *;
end $$;

create function public.vs_sincronizar(p_loja uuid) returns uuid language plpgsql security definer
set search_path = public as $$
declare v_inicio date; rodada uuid; numero text; lote_id_novo uuid; venc_id uuid; venc_codigo text;
begin
 if not vs_acesso(p_loja) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Loja não autorizada'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_loja::text,0));
 -- Rodadas contínuas de 15 dias, ancoradas na primeira entrada da loja.
 -- Reabre lotes legados arquivados que ainda possuem itens em acompanhamento.
 update ciclos_lotes c set status='EM EDIÇÃO' where c.loja_id=p_loja and c.status='ARQUIVADO'
 and exists(select 1 from lotes_validade l join vs_itens i on i.item_id=l.id
   where l.loja_id=p_loja and l.status='ativo' and l.quantidade>0 and (l.ciclo_lote_id=c.id or i.origem_codigo=c.codigo_lote));
 select min(inicio) into v_inicio from vs_rodadas where loja_id=p_loja;
 if v_inicio is null then
   select least(coalesce(min((entrada_em at time zone 'America/Sao_Paulo')::date),vs_hoje()),vs_hoje()) into v_inicio from vs_itens where loja_id=p_loja and tipo='VAL';
 end if;
 v_inicio:=v_inicio+((vs_hoje()-v_inicio)/15)*15;
 insert into vs_rodadas(loja_id,inicio,fim) values(p_loja,v_inicio,v_inicio+14) on conflict(loja_id,inicio) do nothing;
 select id,lote_id into rodada,lote_id_novo from vs_rodadas where loja_id=p_loja and vs_rodadas.inicio=v_inicio;
 if lote_id_novo is null then
   -- Reutiliza somente lote da rodada atual; anteriores continuam rastreáveis.
   select id into lote_id_novo from ciclos_lotes where loja_id=p_loja and codigo_lote like '%VAL%'
   and status='EM EDIÇÃO' and (created_at at time zone 'America/Sao_Paulo')::date>=v_inicio order by created_at limit 1;
   if lote_id_novo is null then
     select id into lote_id_novo from vs_lote(p_loja,'VAL');
   end if;
   update vs_rodadas set lote_id=lote_id_novo where id=rodada;
 end if;
 select numero_loja::text into numero from lojas where id=p_loja;
 -- Bloqueia os itens antes de registrar a transferência, evitando duplicação concorrente.
 perform l.id from lotes_validade l join vs_itens i on i.item_id=l.id
 where l.loja_id=p_loja and i.tipo in ('VAL','VENC') and l.status='ativo' and l.quantidade>0
 and l.data_vencimento::date<=vs_hoje() and i.vencido_em is null for update of l,i;
 if exists(select 1 from lotes_validade l join vs_itens i on i.item_id=l.id where l.loja_id=p_loja
 and i.tipo in ('VAL','VENC') and l.status='ativo' and l.quantidade>0 and l.data_vencimento::date<=vs_hoje() and i.vencido_em is null) then
   select id,codigo_lote into venc_id,venc_codigo from vs_lote(p_loja,'VENC');
 end if;
 insert into vs_eventos(item_id,loja_id,usuario_id,tipo,faixa,saldo_anterior,saldo_novo,motivo)
 select l.id,l.loja_id,auth.uid(),'VENCIMENTO','VENC',l.quantidade,l.quantidade,'Transferência para lote diário'
 from lotes_validade l join vs_itens i on i.item_id=l.id where l.loja_id=p_loja and i.tipo in ('VAL','VENC')
 and l.status='ativo' and l.quantidade>0 and l.data_vencimento::date<=vs_hoje() and i.vencido_em is null;
 update vs_itens i set vencido_em=vs_hoje(),lote_vencidos=venc_codigo,saldo_vencimento=l.quantidade
 from lotes_validade l where i.item_id=l.id and l.loja_id=p_loja and i.tipo in ('VAL','VENC')
 and l.status='ativo' and l.quantidade>0 and l.data_vencimento::date<=vs_hoje() and i.vencido_em is null;
 if venc_id is not null then
   update lotes_validade l set ciclo_lote_id=venc_id,lote=venc_codigo,lote_origem_codigo=i.origem_codigo
   from vs_itens i where i.item_id=l.id and l.loja_id=p_loja and i.vencido_em=vs_hoje()
   and i.lote_vencidos=venc_codigo and l.status='ativo';
 end if;
 -- O lote original só é concluído quando nenhum de seus itens mantém saldo.
 update ciclos_lotes c set status='ARQUIVADO' where c.loja_id=p_loja and c.id<>lote_id_novo
 and c.codigo_lote like '%VAL%' and c.status='EM EDIÇÃO'
 and exists(select 1 from vs_itens i where i.loja_id=p_loja and i.origem_codigo=c.codigo_lote)
 and not exists(select 1 from vs_itens i join lotes_validade l on l.id=i.item_id
   where i.loja_id=p_loja and i.origem_codigo=c.codigo_lote and l.quantidade>0);
 return rodada;
end $$;

create function public.vs_registrar(p_item uuid,p_saldo integer,p_preco numeric,p_destino text,p_motivo text,p_totvs text,p_esperado integer,p_versao bigint)
returns void language plpgsql security definer set search_path = public as $$
declare l lotes_validade%rowtype; i vs_itens%rowtype; rodada uuid; faixa text; versao bigint;
begin
 select * into l from lotes_validade where id=p_item;
 if not found or not vs_acesso(l.loja_id) then raise exception 'Item não autorizado'; end if;
 rodada:=vs_sincronizar(l.loja_id);
 select * into l from lotes_validade where id=p_item for update;
 select * into i from vs_itens where item_id=p_item for update;
 select coalesce(max(id),0) into versao from vs_eventos where item_id=p_item;
 if l.quantidade<>p_esperado or versao<>p_versao then raise exception 'Registro alterado. Recarregue antes de salvar.'; end if;
 if l.status<>'ativo' or l.quantidade<=0 then raise exception 'Item já concluído'; end if;
 if p_saldo is null or p_saldo<0 or p_motivo is null or length(trim(p_motivo))=0 then raise exception 'Saldo e justificativa obrigatórios'; end if;
 if p_destino not in ('REVISAO','Venda','Descarte','Troca','Bonificação','Uso Loja','Avaria','Correção') then raise exception 'Destino inválido'; end if;
 if p_destino<>'Correção' and p_saldo>l.quantidade then raise exception 'Saldo maior exige correção de contagem'; end if;
 if p_destino='REVISAO' and (i.vencido_em is not null or p_saldo<>l.quantidade or p_preco is null or p_preco<0 or p_preco::text in ('NaN','Infinity','-Infinity')) then
 raise exception 'Revise somente saldo confirmado de item não vencido, com preço válido'; end if;
 if p_destino='Venda' and i.vencido_em is not null then raise exception 'Venda não permitida para vencidos'; end if;
 if p_destino not in ('REVISAO','Correção') and p_saldo>=l.quantidade then raise exception 'Informe uma quantidade de saída positiva'; end if;
 faixa:=vs_faixa(l.data_vencimento::date);
 insert into vs_eventos(item_id,loja_id,usuario_id,tipo,rodada_id,faixa,saldo_anterior,saldo_novo,quantidade,preco_anterior,preco_novo,referencia_totvs,motivo)
 values(p_item,l.loja_id,auth.uid(),p_destino,rodada,faixa,l.quantidade,p_saldo,l.quantidade-p_saldo,i.preco_atual,
 case when p_destino='REVISAO' then p_preco else i.preco_atual end,nullif(trim(p_totvs),''),p_motivo);
 update lotes_validade set quantidade=p_saldo,status=case when p_saldo=0 then 'esgotado' else 'ativo' end where id=p_item;
 if p_destino='REVISAO' then update vs_itens set ultima_rodada=rodada,ultima_faixa=faixa,preco_atual=p_preco where item_id=p_item; end if;
end $$;

-- O agendamento roda sem usuário conectado. Apenas o dono do banco pode invocar esta rotina.
create function public.vs_rotina_diaria() returns void language plpgsql security definer set search_path=public as $$
declare loja record;
begin
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 for loja in select id from lojas loop perform vs_sincronizar(loja.id); end loop;
end $$;

create function public.vs_criar(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare loja uuid; produto uuid; ciclo ciclos_lotes%rowtype; item lotes_validade%rowtype;
 t text; qtd integer; venc date; preco numeric; rodada uuid; duplicado jsonb;
begin
 loja:=(p->>'lojaId')::uuid;
 if not vs_acesso(loja) then raise exception 'Loja não autorizada'; end if;
 qtd:=(p->>'quantidade')::integer; venc:=nullif(p->>'dataVencimento','')::date; preco:=(p->>'precoAtual')::numeric;
 if qtd is null or qtd<=0 or preco is null or preco<0 or preco::text in ('NaN','Infinity','-Infinity') or coalesce(p->>'ean','') !~ '^[0-9]{8,14}$'
 or length(trim(coalesce(p->>'produtoNome','')))=0 then raise exception 'EAN, nome, quantidade e preço válidos são obrigatórios'; end if;
 t:=case when p->>'setor'='avarias' then 'AV' when p->>'setor' in ('uso','uso_loja') then 'USO'
 when p->>'setor'='vencidos' or venc<=vs_hoje() then 'VENC' else 'VAL' end;
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
   from lotes_validade l left join perfis f on f.id=l.usuario_id
   where l.loja_id=loja and l.produto_id=produto and l.ciclo_lote_id=ciclo.id and l.status='ativo'
   and l.data_vencimento::date is not distinct from venc and l.localizacao=coalesce(nullif(p->>'localizacao',''),'Gôndola') limit 1;
   if duplicado is not null then return jsonb_build_object('isDuplicado',true,'registroExistente',duplicado); end if;
 end if;
 perform set_config('vs.preco_entrada',preco::text,true);
 insert into lotes_validade(loja_id,produto_id,lote,data_vencimento,quantidade,localizacao,usuario_id,status,ciclo_lote_id,origem_cadastro)
 values(loja,produto,ciclo.codigo_lote,venc,qtd,coalesce(nullif(p->>'localizacao',''),'Gôndola'),auth.uid(),'ativo',ciclo.id,
 case when t='VENC' then 'ADICIONADO_VENCIDO' else 'PADRAO' end) returning * into item;
 if t in ('AV','USO') then
   update vs_eventos set motivo=coalesce(nullif(trim(p->>'motivo'),''),'Cadastro inicial') where item_id=item.id and tipo='ENTRADA';
 end if;
 perform vs_sincronizar(loja);
 return jsonb_build_object('isDuplicado',false,'registro',to_jsonb(item));
end $$;
-- Escritas operacionais passam pelas RPCs verificadas. O histórico não pode ser editado pelo cliente.
revoke insert,update,delete on lotes_validade,ciclos_lotes from public,anon,authenticated;
revoke select on lotes_validade,ciclos_lotes from public,anon;
revoke all on function vs_criar(jsonb) from public;
grant execute on function vs_criar(jsonb) to authenticated;
revoke all on function forcar_virada_ciclo_teste(uuid),gerar_codigo_lote(uuid),gerar_codigo_lote(uuid,varchar) from public,anon,authenticated;
revoke all on function vs_rotina_diaria() from public,anon,authenticated;
revoke all on function vs_lote(uuid,text),vs_capturar_entrada(),vs_sincronizar(uuid),vs_registrar(uuid,integer,numeric,text,text,text,integer,bigint) from public;
grant execute on function vs_sincronizar(uuid),vs_registrar(uuid,integer,numeric,text,text,text,integer,bigint) to authenticated;

create function public.vs_painel(p_loja uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare rodada uuid; resultado jsonb;
begin
 if not vs_acesso(p_loja) then raise exception 'Loja não autorizada'; end if;
 rodada:=vs_sincronizar(p_loja);
 select jsonb_build_object('rodadaId',rodada,'rodada',to_jsonb(r),'itens',coalesce((
   select jsonb_agg(to_jsonb(l)||to_jsonb(i)||jsonb_build_object('id',l.id,'produtos',to_jsonb(p),
     'eventos',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from vs_eventos e where e.item_id=l.id),'[]'::jsonb)) order by l.data_vencimento,l.id)
   from lotes_validade l join vs_itens i on i.item_id=l.id left join produtos p on p.id=l.produto_id
   where l.loja_id=p_loja
 ),'[]'::jsonb)) into resultado from vs_rodadas r where r.id=rodada;
 return resultado;
end $$;
revoke all on function vs_painel(uuid) from public;
grant execute on function vs_painel(uuid) to authenticated;
commit;
