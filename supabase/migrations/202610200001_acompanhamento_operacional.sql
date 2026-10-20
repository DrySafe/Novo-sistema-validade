-- Extensão opcional. Não altera as regras de saldo, ciclos, revisão ou vencimento.
begin;
create table public.vs_posicoes (
 id uuid primary key default gen_random_uuid(),loja_id uuid not null references lojas(id) on delete cascade,
 nome text not null check(length(trim(nome)) between 1 and 60),categoria text not null check(categoria in ('Gôndola','Depósito','Ponta','Ilha','Câmara','Outros')),
 ativa boolean not null default true,criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now()
);
create unique index vs_posicao_nome_unico on vs_posicoes(loja_id,lower(trim(nome)));
alter table public.vs_itens add column posicao_id uuid references vs_posicoes(id) on delete set null;
create table public.vs_acomp_config (
 loja_id uuid primary key references lojas(id) on delete cascade,dias_alerta integer not null default 15 check(dias_alerta between 1 and 60),
 cadencia_dias integer not null default 1 check(cadencia_dias between 1 and 15)
);
create table public.vs_tarefas (
 id uuid primary key default gen_random_uuid(),loja_id uuid not null references lojas(id) on delete cascade,
 item_id uuid references vs_itens(item_id) on delete cascade,tipo text not null check(tipo in ('Conferência','Exposição','Remanejamento','Desconto','Devolução','Outro')),
 titulo text not null check(length(trim(titulo)) between 1 and 160),descricao text not null default '' check(length(descricao)<=2000),
 prazo date not null,responsavel_id uuid not null references auth.users(id),estado text not null default 'aberta' check(estado in ('aberta','em_andamento','concluida','impedida','cancelada')),
 criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),concluido_em timestamptz,
 resultado text not null default '' check(length(resultado)<=2000),versao integer not null default 1
);
create index vs_tarefas_loja_prazo on vs_tarefas(loja_id,prazo,estado);
create table public.vs_item_custos (
 item_id uuid primary key references vs_itens(item_id) on delete cascade,loja_id uuid not null references lojas(id) on delete cascade,
 custo numeric(14,4) not null check(custo>=0 and custo::text not in ('NaN','Infinity','-Infinity')),versao integer not null default 1,
 atualizado_por uuid not null references auth.users(id),atualizado_em timestamptz not null default now()
);
create table public.vs_evento_custos (
 evento_id bigint primary key references vs_eventos(id) on delete cascade,loja_id uuid not null references lojas(id) on delete cascade,custo_unitario numeric(14,4) not null
);
create table public.vs_acomp_eventos (
 id bigint generated always as identity primary key,loja_id uuid not null references lojas(id) on delete cascade,item_id uuid references vs_itens(item_id) on delete cascade,
 tarefa_id uuid references vs_tarefas(id) on delete cascade,acao text not null,usuario_id uuid not null references auth.users(id),usuario_nome text not null,
 ocorrido_em timestamptz not null default now(),motivo text not null,dados jsonb not null default '{}'
);
create index vs_acomp_eventos_loja on vs_acomp_eventos(loja_id,id);
-- Uma pessoa suspensa ou de outra empresa nunca pode receber tarefas da loja.
create function public.vs_colaborador(p_loja uuid,p_usuario uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not vs_dono(p_usuario) and exists(select 1 from perfis p join lojas l on l.id=p_loja where p.id=p_usuario and not p.senha_inicial and (
 (l.empresa_id is not null and p.empresa_id=l.empresa_id and (vs_admin_empresa(l.empresa_id,p_usuario) or exists(select 1 from usuario_lojas u where u.usuario_id=p_usuario and u.loja_id=p_loja)))
 or (l.empresa_id is null and p.tipo_conta='legado' and (p.loja_id=p_loja or exists(select 1 from usuario_lojas u where u.usuario_id=p_usuario and u.loja_id=p_loja)))))
$$;
create function public.vs_acomp_log(p_loja uuid,p_item uuid,p_tarefa uuid,p_acao text,p_motivo text,p_dados jsonb default '{}') returns void language sql security definer set search_path=public,pg_temp as $$
 insert into vs_acomp_eventos(loja_id,item_id,tarefa_id,acao,usuario_id,usuario_nome,motivo,dados)
 select p_loja,p_item,p_tarefa,p_acao,auth.uid(),p.nome,p_motivo,p_dados from perfis p where p.id=auth.uid()
$$;
create function public.vs_custo_evento() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 begin insert into vs_evento_custos(evento_id,loja_id,custo_unitario) select new.id,new.loja_id,custo from vs_item_custos where item_id=new.item_id;return new;end $$;
create trigger vs_custo_snapshot after insert on vs_eventos for each row execute function vs_custo_evento();
create function public.vs_acomp_dados(p_loja uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare g boolean;
 begin
 if not vs_acesso(p_loja) then raise exception 'Loja não autorizada';end if;g:=vs_gestor(p_loja);
 return jsonb_build_object('versao',1,'gestor',g,'pode_criar',g or vs_permitido(p_loja,'ENTRADA') or vs_permitido(p_loja,'REVISAO') or vs_permitido(p_loja,'MOVIMENTACAO'),
 'usuario_id',auth.uid(),'config',coalesce((select to_jsonb(c) from vs_acomp_config c where loja_id=p_loja),'{"dias_alerta":15,"cadencia_dias":1}'),
 'posicoes',coalesce((select jsonb_agg(to_jsonb(p) order by categoria,nome) from vs_posicoes p where loja_id=p_loja),'[]'),
 'tarefas',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('responsavel_nome',(select nome from perfis where id=t.responsavel_id)) order by prazo,criado_em) from vs_tarefas t where loja_id=p_loja),'[]'),
 'participantes',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome) order by nome) from perfis p where vs_colaborador(p_loja,p.id) and (g or p.id=auth.uid())),'[]'),
 'custos',case when g then coalesce((select jsonb_agg(to_jsonb(c)) from vs_item_custos c where loja_id=p_loja),'[]') else '[]'::jsonb end,
 'custos_eventos',case when g then coalesce((select jsonb_agg(to_jsonb(c)) from vs_evento_custos c where loja_id=p_loja),'[]') else '[]'::jsonb end,
 'eventos',coalesce((select jsonb_agg(to_jsonb(e) order by id) from vs_acomp_eventos e where loja_id=p_loja and (g or acao<>'CUSTO')),'[]'));
 end $$;
create function public.vs_salvar_posicao(p_loja uuid,p_nome text,p_categoria text,p_id uuid default null,p_ativa boolean default true) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare alvo uuid;
 begin
 if not vs_gestor(p_loja) then raise exception 'Somente a gestão cadastra posições';end if;
 if p_id is null then insert into vs_posicoes(loja_id,nome,categoria,criado_por) values(p_loja,trim(p_nome),p_categoria,auth.uid()) returning id into alvo;
 else update vs_posicoes set ativa=coalesce(p_ativa,true) where id=p_id and loja_id=p_loja returning id into alvo;
 if alvo is null then raise exception 'Posição não autorizada';end if;end if;
 perform vs_acomp_log(p_loja,null,null,'POSICAO','Cadastro ou ativação de posição',jsonb_build_object('id',alvo,'ativa',p_ativa));return alvo;
 end $$;
create function public.vs_salvar_rotina(p_loja uuid,p_dias integer,p_cadencia integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 begin if not vs_gestor(p_loja) then raise exception 'Somente a gestão configura a fila';end if;
 insert into vs_acomp_config values(p_loja,p_dias,p_cadencia) on conflict(loja_id) do update set dias_alerta=excluded.dias_alerta,cadencia_dias=excluded.cadencia_dias;
 perform vs_acomp_log(p_loja,null,null,'ROTINA','Configuração da fila diária',jsonb_build_object('dias_alerta',p_dias,'cadencia_dias',p_cadencia));end $$;
create function public.vs_estoque_semelhante(p_loja uuid,p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
 and lower(trim(l.localizacao))=lower(trim(local_item)) and i.tipo=case when p->>'setor'='avarias' then 'AV' when p->>'setor' in ('uso','uso_loja') then 'USO' when p->>'setor'='vencidos' or nullif(p->>'dataVencimento','')::date<=vs_hoje() then 'VENC' else 'VAL' end
 order by l.created_at limit 50) x),'[]');
 end $$;
-- Rota adicional de entrada: mantém vs_criar intacta para compatibilidade.
create function public.vs_criar_acomp(p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare loja uuid;pos vs_posicoes;semelhantes jsonb;r jsonb;alvo uuid;motivo text;
 begin
 loja:=(p->>'lojaId')::uuid;if not vs_permitido(loja,'ENTRADA') then raise exception 'Loja ou entrada não autorizada';end if;
 semelhantes:=vs_estoque_semelhante(loja,p);motivo:=trim(coalesce(p->>'motivo_adicional',''));
 if jsonb_array_length(semelhantes)>0 and length(motivo)<10 then return jsonb_build_object('isDuplicado',true,'semelhantes',semelhantes,'registroExistente',semelhantes->0);end if;
 if nullif(p->>'posicao_id','') is not null then
 select * into pos from vs_posicoes where id=(p->>'posicao_id')::uuid and loja_id=loja and ativa;
 if pos.id is null then raise exception 'Posição não autorizada ou inativa';end if;p:=p||jsonb_build_object('localizacao',pos.categoria||' · '||pos.nome);end if;
 if jsonb_array_length(semelhantes)>0 then p:=p||'{"forcarInsercao":true}'::jsonb;end if;
 r:=vs_criar(p);
 if not coalesce((r->>'isDuplicado')::boolean,false) then
 alvo:=(r->'registro'->>'id')::uuid;
 if pos.id is not null then update vs_itens set posicao_id=pos.id where item_id=alvo;end if;
 if jsonb_array_length(semelhantes)>0 then perform vs_acomp_log(loja,alvo,null,'ENTRADA_ADICIONAL',motivo,jsonb_build_object('registros_existentes',semelhantes));end if;
 end if;return r;
 end $$;
create function public.vs_atualizar_posicao(p_item uuid,p_posicao uuid,p_motivo text,p_esperada uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare i vs_itens;l lotes_validade;pos vs_posicoes;anterior text;
 begin
 select * into i from vs_itens where item_id=p_item;
 if not vs_permitido(i.loja_id,'MOVIMENTACAO') then raise exception 'Sem permissão para atualizar posição';end if;
 if length(trim(coalesce(p_motivo,'')))<10 then raise exception 'Explique a mudança em pelo menos 10 caracteres';end if;
 select * into l from lotes_validade where id=p_item for update;
 select * into i from vs_itens where item_id=p_item for update;
 if i.posicao_id is distinct from p_esperada then raise exception 'Posição alterada. Recarregue os dados.';end if;
 select * into pos from vs_posicoes where id=p_posicao and loja_id=i.loja_id and ativa;
 if pos.id is null then raise exception 'Posição não autorizada ou inativa';end if;
 if i.posicao_id=pos.id then raise exception 'Escolha uma posição diferente';end if;
 anterior:=l.localizacao;
 update vs_itens set posicao_id=pos.id where item_id=p_item;
 update lotes_validade set localizacao=pos.categoria||' · '||pos.nome where id=p_item;
 perform vs_acomp_log(i.loja_id,p_item,null,'LOCALIZACAO',trim(p_motivo),jsonb_build_object('anterior',anterior,'nova',pos.categoria||' · '||pos.nome,'quantidade',l.quantidade));
 end $$;
create function public.vs_definir_custo(p_item uuid,p_custo numeric,p_motivo text,p_versao integer default 0) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare loja uuid;anterior vs_item_custos;
 begin
 select loja_id into loja from vs_itens where item_id=p_item;
 if not vs_gestor(loja) then raise exception 'Somente a gestão informa custo';end if;
 if p_custo is null or p_custo<0 or p_custo::text in ('NaN','Infinity','-Infinity') or length(trim(coalesce(p_motivo,'')))<10 then raise exception 'Custo válido e justificativa de 10 caracteres obrigatórios';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_item::text,42));select * into anterior from vs_item_custos where item_id=p_item for update;
 if coalesce(anterior.versao,0) is distinct from p_versao then raise exception 'Custo alterado. Recarregue os dados.';end if;
 insert into vs_item_custos(item_id,loja_id,custo,atualizado_por) values(p_item,loja,p_custo,auth.uid()) on conflict(item_id) do update set custo=excluded.custo,versao=vs_item_custos.versao+1,atualizado_por=auth.uid(),atualizado_em=now();
 perform vs_acomp_log(loja,p_item,null,'CUSTO',trim(p_motivo),jsonb_build_object('anterior',anterior.custo,'novo',p_custo));end $$;
create function public.vs_criar_tarefa(p_loja uuid,p jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare pessoa uuid;item uuid;alvo uuid;
 begin
 if not vs_acesso(p_loja) or not (vs_gestor(p_loja) or vs_permitido(p_loja,'ENTRADA') or vs_permitido(p_loja,'MOVIMENTACAO') or vs_permitido(p_loja,'REVISAO')) then raise exception 'Sem permissão para criar ação';end if;
 pessoa:=coalesce(nullif(p->>'responsavel_id','')::uuid,auth.uid());item:=nullif(p->>'item_id','')::uuid;
 if not vs_colaborador(p_loja,pessoa) or (pessoa<>auth.uid() and not vs_gestor(p_loja)) then raise exception 'Responsável não autorizado para esta loja';end if;
 if item is not null and not exists(select 1 from vs_itens where item_id=item and loja_id=p_loja) then raise exception 'Item de outra loja';end if;
 insert into vs_tarefas(loja_id,item_id,tipo,titulo,descricao,prazo,responsavel_id,criado_por)
 values(p_loja,item,p->>'tipo',trim(p->>'titulo'),coalesce(p->>'descricao',''),(p->>'prazo')::date,pessoa,auth.uid()) returning id into alvo;
 perform vs_acomp_log(p_loja,item,alvo,'ACAO_CRIADA','Ação preventiva planejada',p-'descricao');return alvo;
 end $$;
create function public.vs_atualizar_tarefa(p_id uuid,p_estado text,p_resultado text,p_versao integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare t vs_tarefas;g boolean;
 begin
 select * into t from vs_tarefas where id=p_id for update;
 if t.id is null or not vs_acesso(t.loja_id) then raise exception 'Ação não autorizada';end if;g:=vs_gestor(t.loja_id);
 if not g and t.responsavel_id<>auth.uid() then raise exception 'Somente o responsável ou a gestão atualiza a ação';end if;
 if t.versao is distinct from p_versao then raise exception 'Ação alterada. Recarregue os dados.';end if;
 if p_estado is null or p_estado not in ('em_andamento','concluida','impedida','cancelada') or (p_estado='cancelada' and not g) then raise exception 'Situação não autorizada';end if;
 if t.estado in ('concluida','cancelada') and not g then raise exception 'Somente a gestão reabre ações encerradas';end if;
 if length(trim(coalesce(p_resultado,'')))<10 then raise exception 'Registre resultado ou justificativa em pelo menos 10 caracteres';end if;
 update vs_tarefas set estado=p_estado,resultado=trim(p_resultado),versao=versao+1,atualizado_em=now(),concluido_em=case when p_estado='concluida' then now() else null end where id=p_id;
 perform vs_acomp_log(t.loja_id,t.item_id,t.id,'ACAO_ATUALIZADA',trim(p_resultado),jsonb_build_object('anterior',t.estado,'nova',p_estado));end $$;
-- Tabelas consultáveis somente na loja autorizada; mutações passam pelas RPCs.
do $$declare t text;begin foreach t in array array['vs_posicoes','vs_acomp_config','vs_tarefas','vs_item_custos','vs_evento_custos','vs_acomp_eventos'] loop
 execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);execute format('grant select on %I to authenticated',t);
 if t in ('vs_item_custos','vs_evento_custos') then execute format('create policy vs_leitura on %I for select to authenticated using (vs_gestor(loja_id))',t);
 elsif t='vs_acomp_eventos' then execute format('create policy vs_leitura on %I for select to authenticated using (vs_acesso(loja_id) and (acao<>''CUSTO'' or vs_gestor(loja_id)))',t);
 else execute format('create policy vs_leitura on %I for select to authenticated using (vs_acesso(loja_id))',t);end if;
 end loop;end $$;
revoke all on function vs_colaborador(uuid,uuid),vs_acomp_log(uuid,uuid,uuid,text,text,jsonb),vs_custo_evento() from public,anon,authenticated;
revoke all on function vs_acomp_dados(uuid),vs_salvar_posicao(uuid,text,text,uuid,boolean),vs_salvar_rotina(uuid,integer,integer),vs_estoque_semelhante(uuid,jsonb),vs_criar_acomp(jsonb),vs_atualizar_posicao(uuid,uuid,text,uuid),vs_definir_custo(uuid,numeric,text,integer),vs_criar_tarefa(uuid,jsonb),vs_atualizar_tarefa(uuid,text,text,integer) from public,anon;
grant execute on function vs_acomp_dados(uuid),vs_salvar_posicao(uuid,text,text,uuid,boolean),vs_salvar_rotina(uuid,integer,integer),vs_estoque_semelhante(uuid,jsonb),vs_criar_acomp(jsonb),vs_atualizar_posicao(uuid,uuid,text,uuid),vs_definir_custo(uuid,numeric,text,integer),vs_criar_tarefa(uuid,jsonb),vs_atualizar_tarefa(uuid,text,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
