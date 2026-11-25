import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {priceSuggestion} from '../js/priceSuggestion.js';
import {buildLotWorkbook,excelHeaders} from '../js/lotExcel.js';
const today='2026-11-25';
const expiry=days=>new Date(Date.parse(today+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const base={tipo:'VAL',status:'ativo',quantidade:5,preco_atual:100,preco_inicial:200,produto_nome:'Produto de teste',eventos:[],origem_codigo:'LOTE-A'};

test('sugestões respeitam todos os limites e usam o preço atual sem modificar o item',()=>{
 for(const [days,rate,amount]of [[61,0,10000],[60,5,9500],[46,5,9500],[45,10,9000],[31,10,9000],[30,15,8500],[16,15,8500],[15,40,6000],[7,40,6000],[1,40,6000]]){
  const item={...base,data_vencimento:expiry(days)},before=JSON.stringify(item);const actual=priceSuggestion(item,today);assert.equal(actual.discountPercent,rate);assert.equal(actual.suggestedCents,amount);assert.equal(JSON.stringify(item),before);
 }
 assert.equal(priceSuggestion({...base,preco_atual:19.99,data_vencimento:expiry(60)},today).suggestedCents,1899);
 assert.equal(priceSuggestion({...base,preco_atual:0.05,data_vencimento:expiry(45)},today).suggestedCents,5);
});

test('não sugere venda de vencidos, vence hoje, AV/USO, sem preço, sem data ou sem saldo',()=>{
 for(const item of [{data_vencimento:expiry(0)},{data_vencimento:expiry(-1)},{data_vencimento:expiry(3),vencido_em:today},{tipo:'AV',data_vencimento:expiry(3)},{tipo:'USO',data_vencimento:expiry(3)},{data_vencimento:null},{data_vencimento:expiry(30),preco_atual:null},{data_vencimento:expiry(3),quantidade:0},{data_vencimento:expiry(3),status:'esgotado'}])assert.equal(priceSuggestion({...base,...item},today).suggestedCents,null);
});

test('Excel mantém a ordem aprovada, preço sugerido separado e totais pelo preço atual',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-25T15:00:00Z')});
 try{
  const module={exports:{}};vm.runInThisContext('(function(module,exports){'+readFileSync(new URL('../js/vendor/exceljs-4.4.0.min.js',import.meta.url),'utf8')+'\n})')(module,module.exports);
  const items=[{...base,id:'a',data_vencimento:expiry(15),codigo_produto_empresa:'000123',codigo_embalagem_empresa:'CX-0001',produtos:{ean:'0789123456789'},quantidade_inicial:5},{...base,id:'b',data_vencimento:expiry(-1),preco_atual:20,quantidade:2,quantidade_inicial:2}];
  const book=buildLotWorkbook(module.exports,items,{nome:'Gestão',lojas:{nome:'Loja teste'}}),sheet=book.getWorksheet('Produtos');
  assert.deepEqual(excelHeaders.slice(0,7),['CÓDIGO WINTHOR','CÓDIGO DE BARRAS','PRODUTO','DATA DE VALIDADE','QUANTIDADE','SUGESTÃO R$','DIAS QUE FALTAM']);
  assert.deepEqual([...Array(7)].map((_,i)=>sheet.getCell(7,i+1).value),excelHeaders.slice(0,7));
  const rows=[sheet.getRow(8),sheet.getRow(9)],active=rows.find(r=>r.getCell(1).value==='000123'),expired=rows.find(r=>r!==active);
  assert.equal(active.getCell(2).value,'0789123456789');assert.equal(active.getCell(6).value,60);assert.equal(active.getCell(8).value,100);assert.equal(active.getCell(9).value,500);assert.equal(active.getCell(21).value,0.4);assert.equal(active.getCell(1).numFmt,'@');
  assert.equal(expired.getCell(6).value,null);assert.equal(expired.getCell(7).value,'VENCIDO');assert.equal(sheet.autoFilter.from.row,7);assert.equal(sheet.views[0].xSplit,3);
  const totals=book.getWorksheet('Totais por lote');assert.equal(totals.getCell(2,4).value,540);assert.ok(book.getWorksheet('Histórico'));assert.ok(book.getWorksheet('Dados dos itens'));
 }finally{t.mock.timers.reset();}
});
