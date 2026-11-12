import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

test('login sem e-mail, sem cadastro público e troca de senha com reautenticação', async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://app.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;
 const calls=[];
 window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'1',email:'maria@usuarios.validasuper.invalid'}}}),signInWithPassword:async p=>{calls.push(['login',p]);return {data:{},error:p.password==='errada'?{}:null};},updateUser:async p=>{calls.push(['update',p]);return {error:null};}}})};
 const {authService}=await import('../js/authService.js');
 assert.equal(document.querySelector('#login-email').type,'text');assert.equal(document.querySelector('#form-register-user'),null);assert.equal(document.querySelector('#btn-show-register'),null);
 await authService.login('  Maria  ','senha');assert.equal(calls[0][1].email,'maria@usuarios.validasuper.invalid');
 await assert.rejects(authService.changePassword('errada','nova-senha-forte-123'),/Senha atual incorreta/);assert.equal(calls.filter(c=>c[0]==='update').length,0);
 await assert.rejects(authService.changePassword('correta','Ab123'),/6 caracteres/);
 await authService.changePassword('correta','Abc123');assert.deepEqual(calls.at(-1),['update',{password:'Abc123'}]);
 dom.window.close();
});

test('Liberações apresenta lojas atribuídas, login fixo e envia somente operações selecionadas',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://app.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;window.supabase={createClient:()=>({})};
 const {authService}=await import('../js/authService.js');const {renderCompanyAccess}=await import('../js/accessAdmin.js');
 const oldGet=authService.getEmployees,oldSave=authService.saveAccess;
 const saved=[];authService.getEmployees=async()=>[{id:'funcionario',nome:'Maria <img>',login:'maria',lojas:['a'],liberacoes:{revisao:true}}];authService.saveAccess=async(...args)=>saved.push(args);
 try{
 const container=document.querySelector('main');await renderCompanyAccess(container,{empresa_admin:true,lojas:[{id:'a',nome:'Centro'},{id:'b',nome:'Norte'}]});
 const edit=container.querySelector('.access-members form');assert.equal(edit.querySelectorAll('input[type=text]')[1].readOnly,true);assert.equal(edit.querySelector('img'),null);
 const stores=edit.querySelectorAll('fieldset')[0];assert.equal(stores.querySelector('[value=a]').checked,true);assert.equal(stores.querySelector('[value=b]').checked,false);
 stores.querySelector('[value=a]').checked=false;stores.querySelector('[value=b]').checked=true;
 await edit.onsubmit(new window.Event('submit',{cancelable:true}));assert.deepEqual(saved[0],['funcionario','Maria <img>',['b'],{entrada:false,movimentacao:false,revisao:true,correcao:false}]);
 }finally{authService.getEmployees=oldGet;authService.saveAccess=oldSave;dom.window.close();}
});

test('ADM cadastra colaborador na empresa e entrega credenciais uma vez; funcionário e CEO não criam',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://app.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;
 window.supabase={createClient:()=>({})};window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new window.Event('close'));};
 const {authService}=await import('../js/authService.js');const {renderCompanyAccess}=await import('../js/accessAdmin.js');
 const oldGet=authService.getEmployees,oldCreate=authService.provisionAccount;let calls=[];
 authService.getEmployees=async()=>[];authService.provisionAccount=async p=>{calls.push({...p});return {id:'new'};};
 try{
 const context={empresa_admin:true,lojas:[{id:'loja-a',nome:'Minha loja'}]},container=document.querySelector('main');
 await renderCompanyAccess(container,context);assert.equal(container.querySelector('details').open,true);
 const form=container.querySelector('form'),inputs=form.querySelectorAll('input');inputs[0].value='Maria';inputs[1].value='maria.test';inputs[2].value='Abc123';
 await form.onsubmit(new window.Event('submit',{cancelable:true}));assert.equal(calls.length,0);assert.match(form.textContent,/Selecione pelo menos uma loja/);
 form.querySelector('[value="loja-a"]').checked=true;
 await form.onsubmit(new window.Event('submit',{cancelable:true}));assert.equal(calls.length,1);
 assert.equal(calls[0].acao,'funcionario');assert.deepEqual(calls[0].lojas,['loja-a']);assert.equal(calls[0].liberacoes.entrada,true);assert.equal(calls[0].email,undefined);
 const modal=document.querySelector('dialog');assert.match(modal.textContent,/Colaborador cadastrado/);assert.equal(modal.querySelector('[type=password]').value,'Abc123');
 assert.equal(container.querySelector('[type=password]').value,'');const secret=modal.querySelector('[type=password]');modal.close();assert.equal(secret.value,'');assert.equal(document.querySelector('dialog'),null);
 await renderCompanyAccess(container,{...context,dono_app:true});assert.equal(container.querySelector('form'),null);
 await renderCompanyAccess(container,{...context,empresa_admin:false});assert.equal(container.querySelector('form'),null);
 }finally{authService.getEmployees=oldGet;authService.provisionAccount=oldCreate;dom.window.close();}
});
