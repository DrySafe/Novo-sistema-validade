import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {expiryStatus} from '../js/expiryStatus.js';
import {hojeBrasil} from '../js/lifecycleRules.js';

test('prazo exato é calculado hoje, independentemente da faixa salva e da entrada',()=>{
 const item={data_vencimento:'2026-11-20',entrada_em:'2026-10-30',faixa:'7',quantidade:2,status:'ativo'};
 const info=expiryStatus(item,'2026-11-17');assert.equal(info.days,3);assert.equal(info.text,'Faltam 3 dias');assert.equal(info.bandText,'Faixa: 1–7 dias');assert.equal(info.action,'Ação urgente');
 assert.equal(expiryStatus(item,'2026-11-18').text,'Faltam 2 dias');assert.equal(expiryStatus(item,'2026-11-19').text,'Vence amanhã');assert.equal(expiryStatus(item,'2026-11-20').text,'Vence hoje');assert.equal(expiryStatus(item,'2026-11-21').text,'Vencido há 1 dia');assert.equal(expiryStatus(item,'2026-11-22').text,'Vencido há 2 dias');
 assert.equal(expiryStatus({...item,quantidade:0},'2026-11-17').urgent,false);assert.equal(expiryStatus({...item,status:'baixado'},'2026-11-17').urgent,false);
 assert.equal(expiryStatus({...item,data_vencimento:null},'2026-11-17').days,null);
 assert.equal(expiryStatus({...item,faixa:'60'},'2026-11-17').band,'7');
 assert.equal(expiryStatus(item,hojeBrasil(new Date('2026-11-18T01:00:00Z'))).days,3);assert.equal(expiryStatus(item,hojeBrasil(new Date('2026-11-18T03:00:00Z'))).days,2);
});

test('tabela e card destacam saldo urgente, filtram por dias reais e atualizam na virada do dia',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-17T15:00:00Z')});
 const dom=new JSDOM('<div id="cards"></div>',{url:'https://app.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;window.supabase={createClient:()=>({})};
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new window.Event('close'));};
 try{
  const {renderItens}=await import('../js/lifecycleUI.js');
  const base={origem_codigo:'03VAL1020260005',status:'ativo',quantidade:2,faixa:'7',pendencias:[],eventos:[]};
  const items=[{...base,id:'maracuja',produto_nome:'Pasta Variegato Maracujá',data_vencimento:'2026-11-20'}, {...base,id:'futuro',produto_nome:'Outro produto',data_vencimento:'2026-11-24'}, {...base,id:'vencido',produto_nome:'Vencido com saldo',data_vencimento:'2026-11-16'}, {...base,id:'concluido',produto_nome:'Concluído',quantidade:0,status:'esgotado',data_vencimento:'2026-11-01'}];
  renderItens(items,document.querySelector('#cards'),{funcao:'operador'},async()=>{});
  assert.match(document.querySelector('.vs-lot-urgent').textContent,/2 itens com saldo/);document.querySelector('.vs-lot-open').click();const modal=document.querySelector('dialog');
  assert.equal(modal.querySelector('tbody tr:last-child').dataset.itemId,'concluido');const row=modal.querySelector('[data-item-id=maracuja]');assert.match(row.textContent,/Faltam 3 dias/);assert.ok(row.classList.contains('vs-expiry-urgent'));
  const urgent=modal.querySelector('[aria-label="Filtrar urgência"]');urgent.value='3';urgent.dispatchEvent(new window.Event('change'));assert.equal(modal.querySelectorAll('tbody tr[data-item-id]').length,2);assert.equal(modal.querySelector('[data-item-id=concluido]'),null);
  const band=modal.querySelector('[aria-label="Filtrar faixa de validade"]');band.value='VENC';band.dispatchEvent(new window.Event('change'));assert.equal(modal.querySelectorAll('tbody tr[data-item-id]').length,1);assert.ok(modal.querySelector('[data-item-id=vencido]'));
  band.value='todos';band.dispatchEvent(new window.Event('change'));const search=modal.querySelector('[type=search]');search.value='maracuja';search.dispatchEvent(new window.Event('input'));
  t.mock.timers.tick(24*60*60*1000);document.dispatchEvent(new window.Event('visibilitychange'));
  assert.match(modal.querySelector('[data-item-id=maracuja]').textContent,/Faltam 2 dias/);assert.equal(search.value,'maracuja');assert.equal(urgent.value,'3');assert.equal(modal.querySelectorAll('tbody tr[data-item-id]').length,1);
 }finally{dom.window.close();t.mock.timers.reset();}
});
