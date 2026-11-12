import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeLayout} from '../js/layout.js';
import {initializeMenuHelp} from '../js/menuHelp.js';

function dialogs(dom){
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
}

test('ajuda acompanha o menu atual, é somente leitura e devolve o foco ao fechar',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'));const doc=dom.window.document;dialogs(dom);initializeLayout(doc);
 const help=doc.getElementById('btn-menu-help');
 const texts=new Set();
 for(const nav of doc.querySelectorAll('.nav-item')){
  nav.click();help.click();const dialog=doc.getElementById('menu-help-dialog');
  assert.ok(dialog.open);assert.equal(dialog.querySelector('form'),null);assert.ok(dialog.querySelectorAll('h3').length>=3);
  assert.match(help.getAttribute('aria-label'),/^Ajuda sobre /);
  assert.match(dialog.querySelector('h2').textContent,/Como usar:/);texts.add(dialog.textContent);
  help.click();assert.equal(doc.querySelectorAll('#menu-help-dialog').length,1);
  if(nav.dataset.sector==='acompanhamento'){
   assert.match(dialog.textContent,/Concluir uma ação não altera saldo ou preço/);
   assert.match(dialog.textContent,/não comprovam perdas evitadas/);
  }
  dialog.querySelector('button').click();assert.equal(doc.getElementById('menu-help-dialog'),null);assert.equal(doc.activeElement,help);
 }
 assert.equal(texts.size,8);dom.window.close();
});

test('área do CEO tem orientação própria sem abrir nem enviar cadastro',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8'));const doc=dom.window.document;dialogs(dom);
 initializeMenuHelp(doc,'administrativo');doc.getElementById('btn-menu-help').click();
 const dialog=doc.getElementById('menu-help-dialog');assert.match(dialog.textContent,/exclusiva do único CEO/);assert.match(dialog.textContent,/não acessa as lojas/);assert.equal(dialog.querySelector('input'),null);
 dialog.close();dom.window.close();
});
