-- Aviso complementar inclui localização legada genérica e VAL transferido para vencidos.
begin;
create or replace function public.vs_estoque_semelhante(p_loja uuid,p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare local_item text;pos vs_posicoes;
 begin
 if not vs_acesso(p_loja) then raise exception 'Loja não autorizada';end if;
 local_item:=coalesce(nullif(trim(p->>'localizacao'),''),'Gôndola');
 if nullif(p->>'posicao_id','') is not null then
 select * into pos from vs_posicoes where id=(p->>'posicao_id')::uuid and loja_id=p_loja and ativa;
 if pos.id is null then raise exception 'Posição não autorizada ou inativa';end if;local_item:=pos.categoria||' · '||pos.nome;end if;
 return coalesce((select jsonb_agg(x) from (select l.id,l.quantidade,l.localizacao,l.lote,l.created_at,i.origem_codigo,i.lote_fisico,f.nome usuario_nome
 from lotes_validade l join vs_itens i on i.item_id=l.id join produtos pr on pr.id=l.produto_id left join perfis f on f.id=l.usuario_id
 where l.loja_id=p_loja and l.status='ativo' and l.quantidade>0 and pr.ean=p->>'ean' and i.lote_fisico=trim(p->>'lote')
 and l.data_vencimento is not distinct from nullif(p->>'dataVencimento','')::date
 and (lower(trim(l.localizacao))=lower(trim(local_item)) or (pos.id is not null and i.posicao_id is null and lower(trim(l.localizacao))=lower(pos.categoria)))
 and ((p->>'setor' in ('validade','vencidos') and i.tipo in ('VAL','VENC')) or (p->>'setor'='avarias' and i.tipo='AV') or (p->>'setor' in ('uso','uso_loja') and i.tipo='USO'))
 order by l.created_at limit 50) x),'[]');
 end $$;
notify pgrst,'reload schema';
commit;
