import test from 'node:test';
import assert from 'node:assert/strict';
import {resumoGerencial} from '../js/lifecycleReports.js';

test('resumo calcula vendas, perdas e correções separadamente, sem presumir baixas',()=>{
 const item={quantidade_inicial:100,quantidade:80,eventos:[
  {tipo:'Correção',saldo_anterior:100,saldo_novo:120,quantidade:-20},
  {tipo:'Venda',quantidade:30},{tipo:'Descarte',quantidade:5},{tipo:'Avaria',quantidade:2},
  {tipo:'Uso Loja',quantidade:1},{tipo:'Troca',quantidade:1},{tipo:'Bonificação',quantidade:1},
  {tipo:'VENCIMENTO',quantidade:80},{tipo:'REVISAO',quantidade:0}
 ]};
 const summary=resumoGerencial([item]);assert.equal(summary.sales,30);assert.equal(summary.losses,7);assert.equal(summary.other,3);assert.equal(summary.balance,80);assert.equal(summary.rows[0].adjustment,20);assert.equal(summary.soldPercent,25);assert.equal(summary.partial,false);
 const negative=resumoGerencial([{quantidade_inicial:100,quantidade:90,eventos:[{tipo:'Correção',saldo_anterior:100,saldo_novo:90,quantidade:10}]}]);
 assert.equal(negative.rows[0].adjustment,-10);assert.equal(negative.losses,0);assert.equal(negative.sales,0);assert.equal(negative.partial,false);
});

test('vencidos com saldo e entradas em avaria ou uso não viram perdas sem saída registrada',()=>{
 const summary=resumoGerencial([{tipo:'AV',quantidade_inicial:8,quantidade:8,eventos:[]},{tipo:'USO',quantidade_inicial:5,quantidade:5,eventos:[]},{quantidade_inicial:10,quantidade:10,faixa:'VENC',eventos:[{tipo:'VENCIMENTO',quantidade:10}]}]);
 assert.equal(summary.losses,0);assert.equal(summary.balance,23);assert.equal(summary.rows[2].status,'Vencido: destinar');
});

test('histórico legado ou divergente não gera percentual enganoso',()=>{
 for(const item of [{quantidade_inicial:null,quantidade:5},{quantidade_inicial:100,quantidade:5},{legado:true,quantidade_inicial:5,quantidade:5}]){
  const result=resumoGerencial([item]);assert.equal(result.partial,true);assert.equal(result.soldPercent,null);
 }
 const result=resumoGerencial([{quantidade_inicial:10,quantidade:0,eventos:[{tipo:'Venda',quantidade:10}]}]);assert.equal(result.soldPercent,100);assert.equal(result.rows[0].status,'Concluído');
});
