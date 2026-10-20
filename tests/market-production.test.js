// Caracterização da API original vs_criar, preservada por compatibilidade.
// O novo fluxo com posição/aviso entre rodadas é validado em followup.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marketDB} from './helpers/market-db.js';
import {pendencias,faixaValidade} from '../js/lifecycleRules.js';
import {linhasResumo} from '../js/lifecycleReports.js';

test('operação de mercado: entradas, locais, lotes, rastreabilidade e passagem de 15 dias',async t=>{
 const h=await marketDB();const {db,q,as,advance,panel,create,op,ids}=h;const evidence=[];const snapshots=[];
 const record=(id,data)=>evidence.push({id,...data});
 const base={lojaId:ids.store,setor:'validade',ean:'7899000000001',produtoNome:'Leite teste 1 L',lote:'FAB-A',quantidade:12,precoAtual:5.9,dataVencimento:'2027-01-31',localizacao:'Gôndola'};
 let main,origin,round,late;
 try{
  await t.test('M01 mesmo produto, lote, validade e local: alerta e não soma automaticamente',async()=>{
   main=(await create(base)).registro.id;const retry=await create({...base,quantidade:8});const p=await panel();const rows=p.itens.filter(i=>i.produtos.ean===base.ean);origin=rows[0].origem_codigo;round=p.rodadaId;
   record('M01',{duplicado:retry.isDuplicado,linhas:rows.length,saldo:rows[0].quantidade,eventos:rows[0].eventos.length});
   assert.equal(retry.isDuplicado,true);assert.equal(rows.length,1);assert.equal(rows[0].quantidade,12);assert.equal(rows[0].eventos.length,1);
  });
  await t.test('M02 mesmo lote e validade em Depósito: linha separada e total 20',async()=>{
   await create({...base,localizacao:'Depósito',quantidade:8});const rows=(await panel()).itens.filter(i=>i.produtos.ean===base.ean);record('M02',{linhas:rows.length,unidades:rows.reduce((s,i)=>s+i.quantidade,0),locais:rows.map(i=>i.localizacao)});
   assert.equal(rows.length,2);assert.equal(rows.reduce((s,i)=>s+i.quantidade,0),20);assert.equal(new Set(rows.map(i=>i.origem_codigo)).size,1);
  });
  await t.test('M03 lote físico diferente e mesma validade: terceira linha, total 25',async()=>{
   await create({...base,lote:'FAB-B',quantidade:5});const rows=(await panel()).itens.filter(i=>i.produtos.ean===base.ean);record('M03',{linhas:rows.length,unidades:rows.reduce((s,i)=>s+i.quantidade,0),lotes_fisicos:rows.map(i=>i.lote_fisico)});assert.equal(rows.length,3);assert.equal(rows.reduce((s,i)=>s+i.quantidade,0),25);snapshots.push({stage:'M03',today:'2026-10-20',snapshot:await panel()});
  });
  await t.test('M04 validade diferente: registro independente',async()=>{
   const r=await create({...base,dataVencimento:'2027-02-28',quantidade:4});const item=(await panel()).itens.find(i=>i.id===r.registro.id);record('M04',{duplicado:r.isDuplicado,validade:item.data_vencimento,saldo:item.quantidade});assert.equal(r.isDuplicado,false);assert.equal(item.quantidade,4);
  });
  await t.test('M05 confirmação explícita de repetição: outra linha, não altera a primeira',async()=>{
   const r=await create({...base,forcarInsercao:true,quantidade:3});const rows=(await panel()).itens.filter(i=>i.produtos.ean===base.ean);record('M05',{linhas:rows.length,total:rows.reduce((s,i)=>s+i.quantidade,0),forcado_saldo:r.registro.quantidade});assert.equal(r.isDuplicado,false);assert.equal(rows.find(i=>i.id===main).quantidade,12);assert.equal(rows.reduce((s,i)=>s+i.quantidade,0),32);
  });
  await t.test('M06 localização não é normalizada: espaços permitem repetição sem alerta',async()=>{
   const r=await create({...base,localizacao:'Gôndola ',quantidade:2});record('M06',{duplicado:r.isDuplicado,local:r.registro?.localizacao,risco:'Outra linha para grafia equivalente'});assert.equal(r.isDuplicado,false);
  });
  await t.test('M07 saldo, entrada e saídas reconciliam com o relatório',async()=>{
   await op(main,'REVISAO',12);await op(main,'Venda',7);await op(main,'Correção',9);await op(main,'Descarte',8);
   const item=(await panel()).itens.find(i=>i.id===main);const row=linhasResumo([{...item,produto_nome:item.nome_entrada}])[0];
   const net=item.eventos.reduce((s,e)=>s+(e.saldo_novo-e.saldo_anterior),0);record('M07',{saldo:item.quantidade,inicial:item.quantidade_inicial,venda:row['Vendas registradas'],correcao_liquida:row['Correção de contagem (saída líquida)'],descarte:row.Descarte,reconciliado:net===item.quantidade,autor:item.eventos.at(-2).usuario_nome});assert.equal(net,8);assert.equal(row['Vendas registradas'],5);assert.equal(row['Correção de contagem (saída líquida)'],-2);assert.equal(row.Descarte,1);assert.equal(item.quantidade_inicial,12);
  });
  await t.test('M08 pedido com versão antiga é recusado sem alterar saldo',async()=>{
   const before=(await panel()).itens.find(i=>i.id===main);await op(main,'REVISAO',8);await assert.rejects(op(main,'Venda',7,5.9,undefined,before),/Registro alterado/);record('M08',{recusado:true,saldo:(await panel()).itens.find(i=>i.id===main).quantidade});
  });
  await t.test('M09 operador sem liberação não corrige, não revisa e não vê outra loja',async()=>{
   await as('operator');await assert.rejects(op(main,'Correção',20),/Cargo não autorizado/);await assert.rejects(op(main,'REVISAO',8),/Cargo não autorizado/);await assert.rejects(panel(ids.other),/não autorizada/);await assert.rejects(q('update lotes_validade set quantidade=999'),/permission denied/);await as();record('M09',{correcao_negada:true,revisao_negada:true,outra_loja_negada:true,escrita_direta_negada:true});
  });
  await t.test('M10 entradas inválidas não geram eventos nem saldo',async()=>{
   const n=(await panel()).itens.length;for(const quantidade of [0,-1,1.5])await assert.rejects(create({...base,lote:'INVALIDO',quantidade}));await assert.rejects(create({...base,lote:''}));await assert.rejects(create({...base,precoAtual:-1}));await assert.rejects(create({...base,ean:'abc'}));assert.equal((await panel()).itens.length,n);record('M10',{casos_recusados:6,itens_inalterados:true});
  });
  await t.test('M11 revisão antes da virada: mesmos itens e rodada até D+14',async()=>{
   await advance('2026-11-03');const p=await panel();const i=p.itens.find(i=>i.id===main);record('M11',{dia:'2026-11-03',mesma_rodada:p.rodadaId===round,pendencias:pendencias(i,p.rodadaId,'2026-11-03'),saldo:i.quantidade});assert.equal(p.rodadaId,round);assert.equal(i.quantidade,8);assert.equal(pendencias(i,p.rodadaId,'2026-11-03').length,0);
  });
  await t.test('M11b rodada é da loja: entrada na véspera também precisará revisar na virada',async()=>{
   const r=await create({...base,ean:'7899000000005',lote:'ENTRADA-TARDIA',quantidade:2});late=r.registro.id;await op(late,'REVISAO',2);
   // Ajuste de cronologia somente na fixture isolada: NOW() real não avança com vs_hoje().
   await db.exec('reset role');await q("update lotes_validade set created_at='2026-11-03T15:00:00Z' where id=$1",[late]);await q("update vs_itens set entrada_em='2026-11-03T15:00:00Z' where item_id=$1",[late]);await as();
   const p=await panel(),i=p.itens.find(i=>i.id===late);assert.equal(pendencias(i,p.rodadaId,'2026-11-03').length,0);record('M11b',{entrada_simulada:'2026-11-03',rodada_inicio:p.rodada.inicio,rodada_fim:p.rodada.fim,conferido:true});
  });
  await t.test('M12 D+15 abre rodada e lote novos sem zerar, copiar ou apagar itens antigos',async()=>{
   const n=(await panel()).itens.length;await advance('2026-11-04');const p=await panel();const i=p.itens.find(i=>i.id===main);const newCode=(await q('select codigo_lote from ciclos_lotes where id=$1',[p.rodada.lote_id]))[0].codigo_lote;
   const latePending=pendencias(p.itens.find(i=>i.id===late),p.rodadaId,'2026-11-04');
   record('M12',{dia:'2026-11-04',inicio:p.rodada.inicio,fim:p.rodada.fim,rodada_nova:p.rodadaId!==round,lote_antigo:origin,lote_atual:newCode,itens_antes:n,itens_depois:p.itens.length,saldo:i.quantidade,pendencias:pendencias(i,p.rodadaId,'2026-11-04'),entrada_da_vespera_pendente:latePending.includes('Conferência quinzenal')});assert.notEqual(p.rodadaId,round);assert.notEqual(newCode,origin);assert.equal(p.itens.length,n);assert.equal(i.quantidade,8);assert.equal(i.origem_codigo,origin);assert.ok(pendencias(i,p.rodadaId,'2026-11-04').includes('Conferência quinzenal'));assert.ok(latePending.includes('Conferência quinzenal'));snapshots.push({stage:'M12',today:'2026-11-04',snapshot:p});
  });
  await t.test('M13 recontagem do mesmo estoque em nova rodada cria outra entrada sem alerta: risco de duplicar',async()=>{
   const before=(await panel()).itens.filter(i=>i.produtos.ean===base.ean).reduce((s,i)=>s+i.quantidade,0);const r=await create({...base,quantidade:8});const rows=(await panel()).itens.filter(i=>i.produtos.ean===base.ean);record('M13',{duplicado:r.isDuplicado,total_antes:before,total_depois:rows.reduce((s,i)=>s+i.quantidade,0),saldo_antigo:rows.find(i=>i.id===main).quantidade,risco:'Cadastro trata como estoque adicional; não é recontagem'});assert.equal(r.isDuplicado,false);assert.equal(rows.reduce((s,i)=>s+i.quantidade,0),before+8);
  });
  await t.test('M14 revisão quinzenal remove a pendência sem alterar saldo ou lote de origem',async()=>{
   await op(main,'REVISAO',8,4.99);const p=await panel(),i=p.itens.find(i=>i.id===main);record('M14',{saldo:i.quantidade,preco:i.preco_atual,pendencias:pendencias(i,p.rodadaId,'2026-11-04')});assert.equal(pendencias(i,p.rodadaId,'2026-11-04').length,0);assert.equal(i.quantidade,8);assert.equal(i.origem_codigo,origin);
  });
  await t.test('M15 faixa de validade exige revisão antes dos quinze dias',async()=>{
   const r=await create({...base,ean:'7899000000002',lote:'FAIXA',dataVencimento:'2026-12-20'});const id=r.registro.id;await op(id,'REVISAO',12);const old=(await panel()).itens.find(i=>i.id===id);await advance('2026-11-05');const p=await panel(),i=p.itens.find(i=>i.id===id);record('M15',{de:old.ultima_faixa,para:faixaValidade(i.data_vencimento,'2026-11-05'),pendencias:pendencias(i,p.rodadaId,'2026-11-05')});assert.ok(pendencias(i,p.rodadaId,'2026-11-05').includes('Revisão da faixa de validade'));
  });
  await t.test('M16 no dia do vencimento transfere uma vez, mantém saldo e bloqueia venda',async()=>{
   const r=await create({...base,ean:'7899000000003',lote:'VENCE',dataVencimento:'2026-11-06',quantidade:10});await op(r.registro.id,'Venda',6);await advance('2026-11-06');let p=await panel();await panel();const i=p.itens.find(i=>i.id===r.registro.id);await assert.rejects(op(i.id,'Venda',5),/Venda não permitida/);record('M16',{dia:'2026-11-06',transferido:i.vencido_em,saldo:i.quantidade,saldo_vencimento:i.saldo_vencimento,lote_vencidos:i.lote_vencidos,eventos_vencimento:i.eventos.filter(e=>e.tipo==='VENCIMENTO').length});assert.equal(i.saldo_vencimento,6);assert.equal(i.eventos.filter(e=>e.tipo==='VENCIMENTO').length,1);assert.equal(i.quantidade,6);snapshots.push({stage:'M16',today:'2026-11-06',snapshot:p});await op(i.id,'Descarte',0);assert.equal((await panel()).itens.find(x=>x.id===i.id).status,'esgotado');
  });
  await t.test('M17 saldo zerado some da lista ativa mas fica consultável com todo o histórico',async()=>{
   const r=await create({...base,ean:'7899000000004',lote:'FINAL'});await op(r.registro.id,'Troca',0);const p=await panel(),i=p.itens.find(x=>x.id===r.registro.id);record('M17',{existe_no_painel:!!i,saldo:i.quantidade,status:i.status,eventos:i.eventos.length});assert.equal(i.quantidade,0);assert.equal(i.status,'esgotado');assert.equal(i.eventos.length,2);
  });
  await t.test('M18 após 45 dias, itens ainda com saldo continuam acompanhados',async()=>{
   await advance('2026-12-04');const p=await panel(),i=p.itens.find(x=>x.id===main);record('M18',{dia:'2026-12-04',saldo:i.quantidade,lote_original:i.origem_codigo,rodada_inicio:p.rodada.inicio,pendencias:pendencias(i,p.rodadaId,'2026-12-04')});assert.equal(i.quantidade,8);assert.equal(i.origem_codigo,origin);assert.ok(pendencias(i,p.rodadaId,'2026-12-04').length>0);
  });
 }finally{if(process.env.AUDIT_EVIDENCE_PATH)fs.writeFileSync(process.env.AUDIT_EVIDENCE_PATH,JSON.stringify(evidence,null,2));if(process.env.AUDIT_SNAPSHOTS_PATH)fs.writeFileSync(process.env.AUDIT_SNAPSHOTS_PATH,JSON.stringify(snapshots,null,2));await db.close();}
});
