import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

test('service worker usa fallback público e nunca intercepta APIs ou grava páginas autenticadas', async () => {
 const events={},files=[],deleted=[];
 const offline=new Response('Sem conexão');
 const context={URL, self:{location:{origin:'https://app.test'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}, caches:{open:async()=>({addAll:async list=>files.push(...list)}),keys:async()=>['validasuper-public-v0','outro-app'],delete:async key=>deleted.push(key),match:async key=>{assert.equal(key,'/offline.html');return offline;}},fetch:async()=>{throw new Error('offline');}};
 vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
 let installed;events.install({waitUntil:p=>installed=p});await installed;
 assert.ok(files.includes('/offline.html'));assert.ok(files.every(path=>path==='/offline.html'||path.startsWith('/icons/')));
 let activated;events.activate({waitUntil:p=>activated=p});await activated;assert.deepEqual(deleted,['validasuper-public-v0']);
 for(const request of [{method:'POST',mode:'cors',url:'https://supabase.test/rest/v1/itens'},{method:'GET',mode:'cors',url:'https://supabase.test/rest/v1/itens'},{method:'GET',mode:'cors',url:'https://app.test/private-data'}]){
  events.fetch({request,respondWith:()=>assert.fail('API interceptada')});
 }
 let result;events.fetch({request:{method:'GET',mode:'navigate',url:'https://app.test/'},respondWith:p=>result=p});assert.equal(await result,offline);
});

test('instalação oferece prompt nativo e oculta os botões após instalar',async()=>{
 const dom=new JSDOM('<button data-install-app hidden>Instalar</button>',{url:'https://app.test'});const {window}=dom;
 // JSDOM não implementa a abertura nativa de dialogs; o fluxo real é validado no Chromium.
 window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 window.matchMedia=()=>({matches:false,addEventListener(){}});globalThis.window=window;globalThis.document=window.document;
 await import('../js/pwa.js');const button=document.querySelector('button');assert.equal(button.hidden,false);
 button.click();assert.match(document.querySelector('dialog').textContent,/Instalar aplicativo/);document.querySelector('dialog').remove();
 let prompted=false;const event=new window.Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{prompted=true;};event.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 button.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(prompted,true);window.dispatchEvent(new window.Event('appinstalled'));assert.equal(button.hidden,true);dom.window.close();
});
