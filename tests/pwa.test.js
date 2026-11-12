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

test('instalação permanece visível sem prompt e orienta Android, iPhone e navegador integrado',()=>{
 const source=fs.readFileSync(new URL('../js/pwa.js',import.meta.url),'utf8');
 for(const [agent,expected] of [
  ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36',/três pontos/],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1',/Compartilhar/],
  ['Mozilla/5.0 (Linux; Android 14) Instagram',/navegador integrado/]
 ]) {
  const dom=new JSDOM('<main><aside data-install-surface hidden><button data-install-app hidden>Instalar app</button></aside></main>',{url:'https://app.test',runScripts:'outside-only'});
  const w=dom.window;Object.defineProperty(w.navigator,'userAgent',{value:agent});
  let change;const mode={matches:false,addEventListener:(name,fn)=>change=fn};w.matchMedia=()=>mode;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.eval(source);
  const surface=w.document.querySelector('aside'),button=w.document.querySelector('button');
  assert.equal(surface.hidden,false);assert.equal(button.hidden,false);button.click();button.click();
  assert.equal(w.document.querySelectorAll('dialog').length,1);assert.match(w.document.querySelector('dialog').textContent,expected);
  mode.matches=true;change();assert.equal(surface.hidden,true);assert.equal(button.hidden,true);dom.window.close();
 }
});

test('manifest tem ícones válidos e tela autenticada tem acesso direto à instalação',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
 for(const size of ['192x192','512x512']) {
  const icon=manifest.icons.find(icon=>icon.sizes===size&&icon.purpose==='any');assert.ok(icon);
  const png=fs.readFileSync(new URL('..'+icon.src,import.meta.url));assert.equal(png.readUInt32BE(16),Number(size.split('x')[0]));assert.equal(png.readUInt32BE(20),Number(size.split('x')[1]));
 }
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 assert.ok(dom.window.document.querySelector('#app-screen [data-install-surface] [data-install-app]'));
 assert.ok(dom.window.document.querySelector('#login-screen [data-install-app]'));dom.window.close();
});
