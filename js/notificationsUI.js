import {notificationService as api} from './notificationService.js';
const states=new Map();
const roleLabels={gestor:'Gestor',loja_admin:'Administrador',funcionario:'Colaborador',sistema:'Sistema'};
const types={ALTERACAO_LOJA:'Alteração de loja',DECISAO_LOJA:'Decisão cadastral',ACESSOS:'Acessos e permissões',CORRECAO:'Correção de quantidade',DESCARTE:'Descarte',AVARIA:'Avaria',VENCIMENTO:'Vencimento',ACAO:'Ação preventiva',ACAO_ATRASADA:'Ação atrasada',AVISO:'Comunicação da equipe'};
const fields={nome:'Nome',numero_loja:'Número da loja',razao_social:'Razão social',cnpj:'CNPJ',inscricao_estadual:'Inscrição estadual',logradouro:'Endereço',numero:'Número',bairro:'Bairro',cidade:'Cidade',uf:'UF',cep:'CEP',telefone:'Telefone'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(title,run,primary=false)=>{const b=el('button',title,primary?'btn btn-primary':'btn btn-secondary');b.type='button';b.onclick=run;return b;};
function field(parent,title,options){const wrap=el('div',undefined,'form-group'),label=el('label',title),input=el(options?'select':'textarea');input.id='notification-'+crypto.randomUUID();label.htmlFor=input.id;if(options)for(const[value,text]of options){const o=el('option',text);o.value=value;input.append(o);}wrap.append(label,input);parent.append(wrap);return input;}
function dialog(title){const d=el('dialog',undefined,'vs-dialog notification-dialog'),head=el('div',undefined,'modal-header'),heading=el('h2',title);heading.id='notification-heading-'+crypto.randomUUID();d.setAttribute('aria-labelledby',heading.id);head.append(heading,button('Fechar',()=>d.close()));d.append(head);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;}
const formatDate=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
export function setNotificationCount(count,doc=document){const value=Number.isFinite(Number(count))?Math.max(0,Number(count)):0,b=doc.getElementById('btn-notifications'),badge=doc.getElementById('notification-count');if(!b||!badge)return;badge.textContent=value>99?'99+':String(value);badge.hidden=value===0;b.setAttribute('aria-label',value?`Notificações: ${value} não lidas`:'Notificações');}
export function showStoreRequest(request,canDecide,refresh){
 const d=dialog('Alteração cadastral — '+(request.estado==='EM_VERIFICACAO'?'Em verificação':request.estado==='APROVADA'?'Aprovada':'Recusada'));
 d.append(el('p',`Solicitada por ${request.solicitante_nome} em ${formatDate(request.criado_em)}. Os dados vigentes só mudam após aprovação do Gestor.`));
 const table=el('table',undefined,'notification-compare'),head=el('tr');for(const title of ['Campo','Vigente no pedido','Proposto'])head.append(el('th',title));table.append(head);
 for(const[key,label]of Object.entries(fields)){const old=request.dados_antes[key],next=request.dados_propostos[key];if(old===next)continue;const row=el('tr');row.append(el('th',label),el('td',old||'Não informado'),el('td',next||'Não informado'));table.append(row);}d.append(table);
 if(request.estado!=='EM_VERIFICACAO'){d.append(el('p',`Decisão em ${formatDate(request.decidido_em)}. ${request.motivo||''}`));return d;}
 if(!canDecide){d.append(el('p','Aguardando decisão do Gestor. Nenhuma alteração foi aplicada.'));return d;}
 const reason=field(d,'Justificativa (obrigatória ao recusar)');reason.maxLength=2000;const status=el('p');status.setAttribute('role','status');
 const actions=el('div',undefined,'notification-actions');
 for(const[approved,label]of [[true,'Aprovar alteração'],[false,'Recusar alteração']])actions.append(button(label,async()=>{
  if(!approved&&reason.value.trim().length<10){status.textContent='Explique a recusa em pelo menos 10 caracteres.';return;}
  const buttons=[...actions.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent='Registrando decisão…';
  try{await api.decide(request,approved,reason.value);d.close();await refresh();}catch(error){status.textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
 },approved));d.append(status,actions);return d;
}
function newNotice(context,refresh,preferred){const d=dialog('Nova comunicação da equipe'),form=el('form');
 const store=field(form,'Loja',context.lojas.map(l=>[l.id,l.nome])),dest=field(form,'Enviar para',[['administradores','Administradores e Gestor'],['gestor','Somente Gestor'],['loja','Equipe da loja']]);
 if(context.lojas.some(l=>l.id===preferred))store.value=preferred;
 const updateDest=()=>{const l=context.lojas.find(l=>l.id===store.value);const option=dest.querySelector('[value=loja]');option.disabled=!(context.gestor_empresa||l?.pode_administrar);if(option.disabled&&dest.value==='loja')dest.value='administradores';};store.onchange=updateDest;updateDest();
 const title=field(form,'Título');title.rows=1;title.maxLength=160;title.required=true;
 const message=field(form,'Mensagem');message.minLength=10;message.maxLength=2000;message.required=true;
 const priority=field(form,'Prioridade',[['informacao','Informação'],['atencao','Atenção'],['critico','Crítica']]);const status=el('p');status.setAttribute('role','status');const save=button('Enviar comunicação',()=>{});save.type='submit';form.append(status,save);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;status.textContent='Enviando…';try{await api.send({p_loja:store.value,p_destino:dest.value,p_titulo:title.value,p_mensagem:message.value,p_prioridade:priority.value});d.close();await refresh();}catch(error){status.textContent=error.message;}finally{save.disabled=false;}};
 form.append(el('p','Mensagem interna do aplicativo. Você pode acompanhar seus próprios avisos enquanto tiver acesso à loja. Não inclua senhas ou chaves. Não envia e-mail, SMS ou notificação fora do app.'));d.append(form);
}
export async function renderNotifications(container,context,onChanged=async()=>{},isCurrent=()=>true){
 const key=context.usuario_id||'current';if(!states.has(key))states.set(key,{loja:'',tipo:'',papel:'',unread:false,cursor:null,history:[]});const state=states.get(key);
 if(state.loja&&!context.lojas.some(l=>l.id===state.loja)){state.loja='';state.cursor=null;state.history=[];}
 const data=await api.load(state);if(!container.isConnected||!isCurrent())return;
 setNotificationCount(data.nao_lidas);container.className='';container.replaceChildren();
 const head=el('div',undefined,'follow-toolbar');head.append(el('h2','Central de notificações'));
 const refresh=()=>renderNotifications(container,context,onChanged,isCurrent);
 const eligible=context.lojas.filter(l=>l.empresa_id!==null);
 if(eligible.length)head.append(button('Nova comunicação',()=>newNotice({...context,lojas:eligible},refresh,state.loja||context.loja_ativa)));container.append(head,el('p','Filtre por loja, perfil de quem registrou e tipo de ocorrência. As leituras são individuais. Atualização automática a cada minuto; sem avisos externos.','entry-context'));
 const filters=el('div',undefined,'notification-filters');
 const controls=[['loja','Loja',[['','Todas as lojas'],...context.lojas.map(l=>[l.id,l.nome])]],['papel','Perfil de origem',[['','Todos os perfis'],...Object.entries(roleLabels)]],['tipo','Tipo de registro',[['','Todos os tipos'],...Object.entries(types)]],['read','Leitura',[['all','Todas'],['unread','Somente não lidas']]]];
 for(const[key,label,options]of controls){const input=field(filters,label,options);input.value=key==='read'?(state.unread?'unread':'all'):state[key];input.onchange=async()=>{if(key==='read')state.unread=input.value==='unread';else state[key]=input.value;state.cursor=null;state.history=[];await refresh().catch(e=>{error.textContent=e.message;});};}container.append(filters);
 const error=el('p');error.setAttribute('role','alert');container.append(error);
 const rows=(data.itens||[]).slice(0,50),hasNext=(data.itens||[]).length>50;
 if(rows.length){const mark=button('Marcar esta página como lida',async()=>{mark.disabled=true;try{await api.mark(rows.map(n=>n.id));await refresh();}catch(e){error.textContent=e.message;}finally{mark.disabled=false;}});container.append(mark);}
 else container.append(el('p','Nenhuma notificação nesta seleção.'));
 for(const n of rows){const article=el('article',undefined,'notification-card'+(n.lida?'':' notification-unread'));const header=el('div',undefined,'follow-toolbar');header.append(el('h3',n.titulo),el('span',n.prioridade==='critico'?'Crítica':n.prioridade==='atencao'?'Atenção':'Informação','notification-priority notification-priority-'+n.prioridade));if(n.alteracao)header.append(el('span',n.alteracao.estado==='EM_VERIFICACAO'?'Em verificação':n.alteracao.estado==='APROVADA'?'Aprovada':'Recusada','notification-priority'));article.append(header,el('p',`${n.loja_nome} · ${roleLabels[n.autor_papel]||'Sistema'} · ${types[n.tipo]||'Registro'} · ${formatDate(n.atualizado_em)}`,'entry-context'),el('p',n.mensagem),el('small','Registrado por '+n.autor_nome));
  const actions=el('div',undefined,'notification-actions');if(!n.lida)actions.append(button('Marcar como lida',async()=>{try{await api.mark([n.id]);await refresh();}catch(e){error.textContent=e.message;}}));
  if(n.alteracao)actions.append(button(n.alteracao.estado==='EM_VERIFICACAO'&&context.gestor_empresa?'Verificar alteração':'Ver solicitação',()=>showStoreRequest(n.alteracao,context.gestor_empresa,async()=>{await api.mark([n.id]);await onChanged();await refresh();})));
  article.append(actions);container.append(article);
 }
 const pagination=el('div',undefined,'notification-actions');if(state.history.length)pagination.append(button('Página anterior',async()=>{state.cursor=state.history.pop();await refresh();}));if(hasNext)pagination.append(button('Próxima página',async()=>{state.history.push(state.cursor);const last=rows.at(-1);state.cursor={date:last.criado_em,id:last.id};await refresh();}));container.append(pagination);
}
