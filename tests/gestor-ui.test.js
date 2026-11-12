import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const setup=()=>{const dom=new JSDOM('<button id="btn-notifications"></button><span id="notification-count"></span><main></main>',{url:'https://app.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;window.supabase={createClient:()=>({})};window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new window.Event('close'));};return dom;};
test('apenas Gestor vê papel administrador e liberação cadastral por loja no formulário',async()=>{
 const dom=setup();const {renderCompanyAccess}=await import('../js/accessAdmin.js');const {authService}=await import('../js/authService.js');const oldGet=authService.getEmployees,oldCreate=authService.provisionAccount;let payload;
 authService.getEmployees=async()=>[];authService.provisionAccount=async p=>payload=p;
 try{
 const context={gestor_empresa:true,pode_gerenciar_usuarios:true,lojas:[{id:'a',nome:'Centro',pode_administrar:true},{id:'b',nome:'Norte',pode_administrar:true}]};const container=document.querySelector('main');await renderCompanyAccess(container,context);
 const form=container.querySelector('form');const texts=form.querySelectorAll('input:not([type=checkbox])');texts[0].value='Admin teste';texts[1].value='admin.teste';texts[2].value='123456';
 const select=form.querySelector('select');select.value='loja_admin';select.dispatchEvent(new window.Event('change'));
 const stores=form.querySelectorAll('fieldset')[0];stores.querySelector('[value=a]').checked=true;stores.dispatchEvent(new window.Event('change'));
 const edits=form.querySelectorAll('fieldset')[2];assert.equal(edits.hidden,false);assert.equal(edits.querySelector('[value=b]').disabled,true);edits.querySelector('[value=a]').checked=true;
 await form.onsubmit(new window.Event('submit',{cancelable:true}));assert.equal(payload.acao,'administrador_loja');assert.deepEqual(payload.lojas,['a']);assert.deepEqual(payload.edicao_lojas,['a']);document.querySelector('dialog').close();
 await renderCompanyAccess(container,{...context,gestor_empresa:false,admin_loja:true});assert.equal(container.querySelector('form select'),null);
 }finally{authService.getEmployees=oldGet;authService.provisionAccount=oldCreate;dom.window.close();}
});

test('notificações escapam HTML, preservam filtros e somente Gestor decide alterações',async()=>{
 const dom=setup();const {renderNotifications,showStoreRequest}=await import('../js/notificationsUI.js');const {notificationService:api}=await import('../js/notificationService.js');const old={...api};const calls=[];
 const request={id:'p',versao:1,estado:'EM_VERIFICACAO',solicitante_nome:'Admin <img>',criado_em:'2026-11-12T12:00:00Z',dados_antes:{nome:'Vigente'},dados_propostos:{nome:'<script>alert(1)</script>'}};
 const item={id:'n',criado_em:'2026-11-12T12:00:00Z',atualizado_em:'2026-11-12T12:00:00Z',titulo:'<img src=x>',mensagem:'<script>malicioso</script>',autor_nome:'Nome <img>',autor_papel:'loja_admin',tipo:'ALTERACAO_LOJA',loja_nome:'Centro',alteracao:request};
 api.load=async state=>{calls.push(['load',{...state}]);return {nao_lidas:1,itens:[item]};};api.mark=async ids=>calls.push(['mark',ids]);api.decide=async(...args)=>calls.push(['decide',...args]);
 try{
 const context={usuario_id:'gestor',gestor_empresa:true,lojas:[{id:'a',nome:'Centro',pode_administrar:true}]};const container=document.querySelector('main');await renderNotifications(container,context);
 assert.equal(container.querySelector('img'),null);assert.equal(container.querySelector('script'),null);assert.match(container.textContent,/<img src=x>/);
 const readOnly=showStoreRequest(request,false,async()=>{});assert.ok(![...readOnly.querySelectorAll('button')].some(b=>b.textContent==='Aprovar alteração'));readOnly.close();
 const modal=showStoreRequest(request,true,async()=>{});assert.equal(modal.querySelector('script'),null);
 const reject=[...modal.querySelectorAll('button')].find(b=>b.textContent==='Recusar alteração');await reject.onclick();assert.equal(calls.filter(c=>c[0]==='decide').length,0);
 modal.querySelector('textarea').value='Dados conferidos pelo Gestor';await [...modal.querySelectorAll('button')].find(b=>b.textContent==='Aprovar alteração').onclick();assert.equal(calls.find(c=>c[0]==='decide')[2],true);
 const filter=container.querySelectorAll('select')[0];filter.value='a';await filter.onchange();assert.equal(calls.at(-1)[1].loja,'a');
 }finally{Object.assign(api,old);dom.window.close();}
});
