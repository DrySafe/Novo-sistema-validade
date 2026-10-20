begin;
create index vs_item_custos_loja on public.vs_item_custos(loja_id);
create index vs_evento_custos_loja on public.vs_evento_custos(loja_id,evento_id);
create index vs_tarefas_item on public.vs_tarefas(item_id) where item_id is not null;
commit;
