import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

test('link público abre outra aba; sessão CEO é separada e formulário envia somente novas credenciais',async()=>{
 const index=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const link=index.window.document.querySelector('.public-footer a');assert.equal(link.textContent,'Área Administrativa');assert.equal(link.target,'_blank');assert.equal(link.getAttribute('href'),'admin.html');index.window.close();
 const dom=new JSDOM(fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8'),{url:'https://app.test/admin.html'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 let role=null;const calls=[],clients=[];
 window.supabase={createClient:(url,key,options)=>{
  clients.push(options);return {auth:{getUser:async()=>({data:{user:role?{id:role}:null}}),signInWithPassword:async()=>{role='ceo';return {error:null};},signOut:async options=>{calls.push(['signOut',options]);role=null;return {error:null};}},rpc:async()=>({data:role==='ceo',error:null}),functions:{invoke:async(name,options)=>{calls.push([name,options]);return {data:{criado:true},error:null};}}};
 }};
 await import('../js/ceo.js');await Promise.resolve();
 assert.equal(clients.length,1);assert.match(clients[0].auth.storageKey,/^validasuper-ceo-/);assert.equal(clients[0].auth.storage,window.sessionStorage);
 const login=document.getElementById('ceo-login');document.getElementById('ceo-email').value='ceo@test.example';document.getElementById('ceo-password').value='senha-do-ceo';
 await login.onsubmit({preventDefault(){}});assert.equal(document.getElementById('ceo-panel').hidden,false);
 const form=document.getElementById('ceo-create-admin');assert.equal(form.querySelectorAll('input').length,2);assert.equal(form.querySelector('select,fieldset'),null);
 document.getElementById('new-admin-email').value='novo@test.example';document.getElementById('new-admin-password').value='senha-inicial-123';
 await form.onsubmit({preventDefault(){},currentTarget:form});
 assert.deepEqual(calls.find(c=>c[0]==='gerenciar-equipe')[1].body,{acao:'administrador',email:'novo@test.example',password:'senha-inicial-123'});
 assert.equal(document.getElementById('new-admin-password').value,'');assert.doesNotMatch(document.body.textContent,/senha-inicial-123/);
 await document.getElementById('ceo-logout').onclick();assert.equal(document.getElementById('ceo-panel').hidden,true);assert.deepEqual(calls.at(-1),['signOut',{scope:'local'}]);
 dom.window.close();
});
