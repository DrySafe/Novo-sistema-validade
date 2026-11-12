import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {beginLoading,finishBoot,showSectionLoading,finishSectionLoading} from '../js/loading.js';

test('carregamento mais antigo não encerra o atual; área anuncia atualização e libera busy ao concluir',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'));const doc=dom.window.document;
 const old=beginLoading('Primeiro',doc),current=beginLoading('Atual',doc);old();assert.equal(doc.getElementById('page-loading').hidden,false);assert.equal(doc.querySelector('[data-loading-message]').textContent,'Atual');
 current();assert.equal(doc.getElementById('page-loading').hidden,true);
 const section=doc.getElementById('product-card-container');showSectionLoading(section);assert.equal(section.getAttribute('aria-busy'),'true');assert.equal(section.querySelector('[role=status]').textContent,'Carregando os dados da loja…');finishSectionLoading(section);assert.equal(section.hasAttribute('aria-busy'),false);
 finishBoot(doc);dom.window.close();
});

test('páginas não dependem de handlers inline nem de scripts externos; CSP bloqueia eval e scripts inline',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));const csp=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
 assert.match(csp,/script-src 'self';/);assert.match(csp,/script-src-attr 'none'/);assert.doesNotMatch(csp,/unsafe-eval/);assert.match(csp,/frame-ancestors 'none'/);
 for(const file of ['index.html','admin.html']){
  const dom=new JSDOM(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));const doc=dom.window.document;
  for(const el of doc.querySelectorAll('*'))for(const attr of el.attributes)assert.ok(!/^on/i.test(attr.name),'handler inline: '+attr.name);
  for(const script of doc.querySelectorAll('script'))assert.ok(script.getAttribute('src')?.startsWith('js/'));
  assert.ok(doc.getElementById('page-loading'));dom.window.close();
 }
});
