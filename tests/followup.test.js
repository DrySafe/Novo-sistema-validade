import test from 'node:test';
import assert from 'node:assert/strict';
import {marketDB} from './helpers/market-db.js';
import {metricValue} from '../js/followupReports.js';
import {dailyQueue,followupMetrics,previousPeriod} from '../js/followupRules.js';

test('acompanhamento adicional preserva estoque e aplica isolamento, autoria e versões',async t=>{
 const h=await marketDB();const {db,q,as,create,panel,op,advance,ids}=h;const rpc=async(name,args)=>(await q('select '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args))[0].r;
 const data=()=>rpc('vs_acomp_dados',[ids.store]);const p={lojaId:ids.store,setor:'validade',ean:'7899000000101',produtoNome:'Leite',lote:'F-1',quantidade:10,precoAtual:5.9,dataVencimento:'2027-01-31',localizacao:'Gôndola'};
 let posA,posB,item;
 try{
  await t.test('posições têm ID e nomes únicos por loja; servidor rejeita posição de outra loja',async()=>{
   posA=await rpc('vs_salvar_posicao',[ids.store,'Corredor 1','Gôndola',null,true]);posB=await rpc('vs_salvar_posicao',[ids.store,'Ponta 2','Ponta',null,true]);
   await assert.rejects(rpc('vs_salvar_posicao',[ids.store,' corredor 1 ','Ilha',null,true]),/duplicate key/);
   const foreign=await rpc('vs_salvar_posicao',[ids.other,'Outra','Depósito',null,true]);await assert.rejects(rpc('vs_criar_acomp',[{...p,posicao_id:foreign}]),/Posição não autorizada/);
   await as('operator');await assert.rejects(rpc('vs_salvar_posicao',[ids.store,'Não permitido','Ilha',null,true]),/gestão/);await as();
  });
  await t.test('entrada com posição é opcional e mesmo produto em duas posições mantém saldos separados',async()=>{
   const r=await rpc('vs_criar_acomp',[{...p,posicao_id:posA}]);item=r.registro.id;await rpc('vs_criar_acomp',[{...p,posicao_id:posB,quantidade:5}]);
   const rows=(await panel()).itens;assert.equal(rows.length,2);assert.equal(rows.reduce((s,i)=>s+i.quantidade,0),15);assert.equal(rows.find(i=>i.id===item).posicao_id,posA);assert.match(rows.find(i=>i.id===item).localizacao,/Corredor 1/);
  });
  await t.test('posição muda apenas a localização integral, registra motivo e recusa versão antiga',async()=>{
   const before=(await panel()).itens.find(i=>i.id===item);await rpc('vs_atualizar_posicao',[item,posB,'Produto movido integralmente para a ponta',posA]);const after=(await panel()).itens.find(i=>i.id===item);
   assert.equal(after.quantidade,before.quantidade);assert.equal(after.origem_codigo,before.origem_codigo);assert.equal(after.eventos.length,before.eventos.length);assert.equal(after.posicao_id,posB);
   await assert.rejects(rpc('vs_atualizar_posicao',[item,posA,'Tentativa com localização desatualizada',posA]),/Posição alterada/);
   assert.equal((await data()).eventos.filter(e=>e.acao==='LOCALIZACAO').length,1);
  });
  await t.test('aviso adicional encontra estoque entre rodadas sem alterar a RPC original',async()=>{
   const legacy=await create({...p,ean:'7899000000102'});await advance('2026-11-04');const r=await rpc('vs_criar_acomp',[{...p,ean:'7899000000102',quantidade:3}]);assert.equal(r.isDuplicado,true);assert.equal(r.registroExistente.id,legacy.registro.id);
   const withPosition=await rpc('vs_criar_acomp',[{...p,ean:'7899000000102',posicao_id:posA}]);assert.equal(withPosition.isDuplicado,true);assert.equal(withPosition.registroExistente.id,legacy.registro.id);
   const add=await rpc('vs_criar_acomp',[{...p,ean:'7899000000102',quantidade:3,motivo_adicional:'Recebimento adicional conferido fisicamente'}]);assert.equal(add.isDuplicado,false);
   const rows=(await panel()).itens.filter(i=>i.produtos.ean==='7899000000102');assert.equal(rows.length,2);assert.equal(rows.reduce((s,i)=>s+i.quantidade,0),13);assert.equal((await data()).eventos.filter(e=>e.acao==='ENTRADA_ADICIONAL').length,1);
  });
  await t.test('custo opcional captura valor por evento sem reprecificar o passado ou o preço de venda',async()=>{
   await rpc('vs_definir_custo',[item,2,'Custo informado pela nota de recebimento',0]);await op(item,'Descarte',8);await rpc('vs_definir_custo',[item,3,'Custo atualizado por documentação nova',1]);await op(item,'Descarte',7);
   const i=(await panel()).itens.find(i=>i.id===item),state=await data();assert.equal(Number(i.preco_atual),5.9);const costs=new Map(state.custos_eventos.map(c=>[String(c.evento_id),Number(c.custo_unitario)]));assert.deepEqual(i.eventos.filter(e=>e.tipo==='Descarte').map(e=>costs.get(String(e.id))),[2,3]);
   await assert.rejects(rpc('vs_definir_custo',[item,4,'Gravação com custo desatualizado',1]),/Custo alterado/);
   await as('operator');assert.deepEqual((await data()).custos,[]);assert.deepEqual(await q('select * from vs_item_custos'),[]);assert.equal((await data()).eventos.some(e=>e.acao==='CUSTO'),false);await assert.rejects(rpc('vs_definir_custo',[item,1,'Tentativa sem autorização suficiente',2]),/gestão/);await as();
  });
  await t.test('ações permitem responsável válido e conclusão sem alterar saldo; autoria e versões são obrigatórias',async()=>{
   const task=await rpc('vs_criar_tarefa',[ids.store,{item_id:item,tipo:'Exposição',titulo:'Conferir ponta e exposição',prazo:'2026-11-04',responsavel_id:ids.operator}]);
   const before=(await panel()).itens.find(i=>i.id===item);await as('operator');await rpc('vs_atualizar_tarefa',[task,'concluida','Exposição conferida presencialmente e etiquetas revisadas',1]);
   const after=(await panel()).itens.find(i=>i.id===item);assert.equal(after.quantidade,before.quantidade);assert.equal(after.eventos.length,before.eventos.length);
   const state=await data(),saved=state.tarefas.find(t=>t.id===task);assert.equal(saved.estado,'concluida');assert.equal(saved.versao,2);assert.ok(saved.concluido_em);assert.ok(state.eventos.find(e=>e.tarefa_id===task&&e.acao==='ACAO_ATUALIZADA').usuario_nome);
   await assert.rejects(rpc('vs_atualizar_tarefa',[task,'impedida','Tentativa de regravação de tarefa antiga',1]),/Ação alterada/);
   await assert.rejects(rpc('vs_atualizar_tarefa',[task,'em_andamento','Tentativa de reabrir ação encerrada',2]),/gestão/);await as();
  });
  await t.test('funcionário não assume ação alheia nem atribui outra pessoa; escrita direta e outra loja são negadas',async()=>{
   const task=await rpc('vs_criar_tarefa',[ids.store,{tipo:'Conferência',titulo:'Ação da gestão',prazo:'2026-11-05'}]);await as('operator');
   await assert.rejects(rpc('vs_atualizar_tarefa',[task,'concluida','Tentativa de concluir tarefa de outro',1]),/responsável/);
   await assert.rejects(rpc('vs_criar_tarefa',[ids.store,{tipo:'Outro',titulo:'Atribuição',prazo:'2026-11-05',responsavel_id:ids.admin}]),/Responsável/);
   await assert.rejects(rpc('vs_acomp_dados',[ids.other]),/não autorizada/);await assert.rejects(q("update vs_tarefas set estado='concluida'"),/permission denied/);await as();
  });
  await t.test('configuração complementar não muda a rodada e só a gestão altera',async()=>{
   const before=await panel();await rpc('vs_salvar_rotina',[ids.store,7,2]);const state=await data(),after=await panel();assert.equal(state.config.dias_alerta,7);assert.equal(after.rodadaId,before.rodadaId);assert.equal(after.itens.length,before.itens.length);
   await as('operator');await assert.rejects(rpc('vs_salvar_rotina',[ids.store,10,1]),/gestão/);await as();await assert.rejects(rpc('vs_salvar_rotina',[ids.store,0,1]),/check constraint/);
  });
  await t.test('aviso encontra o registro VAL já transferido para vencidos, sem cadastrar novamente',async()=>{
   const entry=await create({...p,ean:'7899000000103',dataVencimento:'2026-11-05'});await advance('2026-11-05');await panel();
   const r=await rpc('vs_criar_acomp',[{...p,ean:'7899000000103',setor:'vencidos',dataVencimento:'2026-11-05'}]);assert.equal(r.isDuplicado,true);assert.equal(r.registroExistente.id,entry.registro.id);
  });
 }finally{await db.close();}
});

test('indicadores separam risco atual, custo histórico, períodos e conclusão no horário brasileiro',()=>{
 const items=[{id:'i',produto_nome:'Produto',tipo:'VAL',status:'ativo',quantidade:8,data_vencimento:'2026-10-25',eventos:[{id:1,tipo:'Descarte',quantidade:2,ocorrido_em:'2026-10-20T02:00:00Z'},{id:2,tipo:'Descarte',quantidade:1,ocorrido_em:'2026-10-20T15:00:00Z'},{id:3,tipo:'Venda',quantidade:5,ocorrido_em:'2026-10-20T15:00:00Z'}],pendencias:[]}];
 const state={config:{dias_alerta:15,cadencia_dias:1},custos:[{item_id:'i',custo:3}],custos_eventos:[{evento_id:2,custo_unitario:2}],tarefas:[{estado:'concluida',prazo:'2026-10-19',concluido_em:'2026-10-20T02:00:00Z'},{estado:'aberta',prazo:'2026-10-19'}]};
 const m=followupMetrics(items,state,'2026-10-20','2026-10-20','2026-10-20');assert.equal(m.descarte,1);assert.equal(m.custoDescarte,2);assert.equal(m.vendasInformadas,5);assert.equal(m.valorRisco,24);assert.equal(metricValue('valorRisco',m),24);const missing=followupMetrics(items,{...state,custos:[]},'2026-10-20','2026-10-20','2026-10-20');assert.match(metricValue('valorRisco',missing),/Não calculado/);assert.equal(m.concluidas,0);assert.equal(m.atrasadas,1);
 const dayBefore=followupMetrics(items,state,'2026-10-19','2026-10-19','2026-10-20');assert.equal(dayBefore.descarteSemCusto,2);assert.match(metricValue('custoDescarte',dayBefore),/Não calculado/);assert.equal(dayBefore.noPrazo,1);assert.deepEqual(previousPeriod('2026-10-01','2026-10-20'),{from:'2026-09-11',to:'2026-09-30'});
 const q=dailyQueue(items,state,'2026-10-20');assert.equal(q.length,1);assert.match(q[0].reason,/fila diária/);
 assert.equal(dailyQueue([{...items[0],eventos:[{tipo:'REVISAO',ocorrido_em:'2026-10-20T15:00:00Z'}]}],state,'2026-10-20').length,0);
});
