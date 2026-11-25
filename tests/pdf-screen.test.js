import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfHeaders,pdfRecord} from '../js/lotPdf.js';
import {excelHeaders} from '../js/lotExcel.js';
import {resumoGerencial} from '../js/lifecycleReports.js';

test('PDF segue as primeiras nove colunas do Excel, com sugestão separada do preço e do saldo',()=>{
 assert.deepEqual(pdfHeaders,excelHeaders.slice(0,9));
 const item={produto_nome:'Produto de exemplo',produtos:{ean:'0789123456789'},codigo_produto_empresa:'000123',codigo_embalagem_empresa:'CX-001',lote_fisico:'FAB-002',localizacao:'Gôndola 3',tipo:'VAL',status:'ativo',quantidade:10,quantidade_inicial:10,preco_atual:100,data_vencimento:'2026-12-10',entrada_em:'2026-11-20T12:00:00Z',origem_codigo:'LOTE-A',eventos:[]};
 const before=JSON.stringify(item);const row=resumoGerencial([item]).rows[0],record=pdfRecord(row,{},'2026-11-25','R$ 1.000,00');
 assert.deepEqual(record.primary.slice(0,5),['000123','0789123456789','Produto de exemplo','10/12/2026','10']);assert.match(record.primary[5],/60,00/);assert.equal(record.primary[6],'15');assert.match(record.primary[7],/100,00/);assert.match(record.primary[8],/1\.000,00/);
 assert.ok(record.details.indexOf('Lote:')<record.details.indexOf('Cód. embalagem:'));assert.ok(record.details.indexOf('Cód. embalagem:')<record.details.indexOf('Lote físico:'));assert.ok(record.details.indexOf('Situação:')<record.details.indexOf('Entrada:'));
 assert.match(record.details,/CX-001/);assert.match(record.details,/total do lote/);assert.match(record.details,/Desconto: 40%/);assert.equal(JSON.stringify(item),before);
});

test('PDF conserva origem de vencidos e não gera sugestão para venda vencida',()=>{
 const item={produto_nome:'Produto vencido',origem_codigo:'ORIGEM-A',lote_vencidos:'VENC-DIA',vencido_em:'2026-11-20',data_vencimento:'2026-11-20',tipo:'VAL',status:'ativo',quantidade:2,preco_atual:10,eventos:[]};
 const record=pdfRecord(resumoGerencial([item]).rows[0],{groupBy:'vencidos'},'2026-11-25');assert.equal(record.code,'VENC-DIA');assert.equal(record.primary[5],'-');assert.equal(record.primary[6],'VENCIDO');assert.match(record.details,/Origem: ORIGEM-A/);assert.match(record.primary[8],/20,00/);
});
