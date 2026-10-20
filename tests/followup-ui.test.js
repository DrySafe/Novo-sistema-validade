import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
test('ação preventiva exige resultado, mantém saldo e oferece indicadores e filtros sem HTML injetado',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://app.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;
 window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new window.Event('close'));};
 const calls=[];const state={versao:1,usuario_id:'operador',gestor:false,pode_criar:true,config:{dias_alerta:15,cadencia_dias:1},participantes:[{id:'operador',nome:'Ana'}],posicoes:[],custos:[],custos_eventos:[],eventos:[],tarefas:[{id:'acao',item_id:'i',tipo:'Exposição',titulo:'Revisar <img src=x>',prazo:'2026-01-01',estado:'aberta',responsavel_id:'operador',versao:1}]};
 window.supabase={createClient:()=>({rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='vs_acomp_dados'?state:null,error:null};}})};
 const {renderFollowup}=await import('../js/followupUI.js');const container=document.querySelector('main');let refreshed=0;
 const item={id:'i',loja_id:'loja',produto_nome:'Leite',tipo:'VAL',quantidade:10,status:'ativo',lote_fisico:'F1',localizacao:'Gôndola',data_vencimento:'2026-10-21',eventos:[],pendencias:[]};
 await renderFollowup({itens:[item]},container,{funcao:'operador'},async()=>{refreshed++;},'loja');assert.equal(container.querySelector('img'),null);assert.match(container.textContent,/Valores de custo restritos/);assert.equal([...container.querySelectorAll('button')].some(b=>b.textContent==='Posições e rotina'),false);
 [...container.querySelectorAll('button')].find(b=>b.textContent==='Atualizar ação').click();const form=document.querySelector('dialog form');form.querySelector('select').value='concluida';form.querySelector('textarea').value='Conferência realizada na ponta';await form.onsubmit(new window.Event('submit',{cancelable:true}));
 assert.deepEqual(calls.find(c=>c[0]==='vs_atualizar_tarefa')[1],{p_id:'acao',p_estado:'concluida',p_resultado:'Conferência realizada na ponta',p_versao:1});assert.equal(calls.some(c=>c[0]==='vs_registrar'),false);assert.equal(refreshed,1);assert.equal(item.quantidade,10);dom.window.close();
});
