import { authService } from './authService.js';
const labels = { entrada: 'Cadastrar itens', movimentacao: 'Registrar saídas e movimentações', revisao: 'Revisar saldo e preço', correcao: 'Corrigir quantidade com auditoria' };
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const button = (label, run) => { const n=el('button',label); n.type='button'; n.className='btn btn-secondary'; n.onclick=run; return n; };
function field(form, label, type='text', value='') {
 const group=el('div'); group.className='form-group'; const title=el('label',label), input=el('input');
 input.id='access-'+crypto.randomUUID(); title.htmlFor=input.id; input.type=type; input.value=value; input.required=true;
 group.append(title,input); form.append(group); return input;
}
function choices(form, title, values, selected=[]) {
 const group=el('fieldset'), legend=el('legend',title); group.append(legend); group.className='access-choices';
 for(const [key,label] of values){const wrapper=el('label'), input=el('input'); input.type='checkbox'; input.value=key; input.checked=selected.includes(key); wrapper.append(input,el('span',label)); group.append(wrapper);}
 form.append(group); const read=()=>[...group.querySelectorAll('input:checked')].map(n=>n.value);read.group=group;return read;
}
function submit(form, label, run, onSaved) {
 const status=el('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
 const save=el('button',label); save.type='submit'; save.className='btn btn-primary'; form.append(status,save);
 form.onsubmit=async e=>{e.preventDefault(); save.disabled=true; status.textContent='Salvando…';
 try { await run(); form.querySelectorAll('[type=password]').forEach(i=>i.value=''); status.textContent='Salvo com sucesso.'; await onSaved(); }
 catch(err){ status.textContent=err.message; } finally {save.disabled=false;} };
}
function permissions(form, current={}) {
 const selected=choices(form,'Liberações',Object.entries(labels),Object.keys(labels).filter(k=>current[k]));
 const read=()=>Object.fromEntries(Object.keys(labels).map(k=>[k,selected().includes(k)]));read.group=selected.group;return read;
}
function showCredentials(login, password,papel='funcionario') {
 const modal=el('dialog'); modal.className='vs-dialog access-dialog';
 const title=el('h2',papel==='gestor'?'Gestor cadastrado':papel==='loja_admin'?'Administrador cadastrado':'Colaborador cadastrado'); title.id='credentials-'+crypto.randomUUID(); modal.setAttribute('aria-labelledby',title.id);
 modal.append(title,el('p','Entregue estas credenciais diretamente ao novo usuário por um canal privado. Ele deverá trocar a senha no primeiro acesso. Esta tela não ficará disponível no cadastro.'));
 const form=el('div');
 const user=field(form,'Login','text',login), secret=field(form,'Senha inicial','password',password);
 user.readOnly=secret.readOnly=true;
 const status=el('p'); status.setAttribute('role','status');
 form.append(button('Mostrar / ocultar senha',()=>{secret.type=secret.type==='password'?'text':'password';}),button('Copiar acesso',async()=>{
  try { await navigator.clipboard.writeText(`Acesso ao ValidaSuper: ${location.origin}/\nLogin: ${user.value}\nSenha inicial: ${secret.value}\nNo primeiro acesso, troque a senha inicial por outra com pelo menos 6 caracteres. Pode usar somente números.`); status.textContent='Credenciais copiadas. Compartilhe por um canal privado.'; }
  catch { status.textContent='Não foi possível copiar. Selecione o login e mostre a senha para copiá-los manualmente.'; }
 }));
 modal.append(form,status,button('Concluir',()=>modal.close()));
 modal.addEventListener('close',()=>{password='';secret.value='';modal.remove();});
 document.body.append(modal); modal.showModal();
}
function deleteEmployee(member,refresh){
 const modal=el('dialog');modal.className='vs-dialog';const title=el('h2','Excluir colaborador');title.id='delete-'+crypto.randomUUID();modal.setAttribute('aria-labelledby',title.id);
 modal.append(title,el('p',`${member.nome} · ${member.login||'Conta com e-mail'}`),el('p','O acesso será bloqueado, inclusive nas sessões já abertas. Lançamentos, histórico e autoria serão preservados. Para troca de setor, prefira editar as lojas e liberações.'));
 const form=el('form'),reason=field(form,'Motivo da exclusão');reason.minLength=10;reason.maxLength=500;
 const confirmation=el('label'),confirm=el('input');confirm.type='checkbox';confirm.required=true;confirmation.className='vs-confirm';confirmation.append(confirm,el('span','Confirmo a exclusão e o bloqueio de acesso deste colaborador.'));form.append(confirmation);
 submit(form,'Excluir e bloquear acesso',async()=>{if(!confirm.checked)throw new Error('Confirme a exclusão.');await authService.deleteEmployee(member.id,reason.value.trim());},async()=>{modal.close();await refresh();});
 modal.append(form,button('Cancelar',()=>modal.close()));modal.addEventListener('close',()=>modal.remove());document.body.append(modal);modal.showModal();
}
export const isCompanyManager = context => context.gestor_empresa ?? context.empresa_admin;
export const canManagePeople = context => !context.dono_app && (context.pode_gerenciar_usuarios ?? context.empresa_admin);
function roleFields(form,context,stores,allowed,current={}){
 let role=null;
 if(isCompanyManager(context)){
  const group=el('div');group.className='form-group';const title=el('label','Papel do usuário');role=el('select');role.id='role-'+crypto.randomUUID();title.htmlFor=role.id;
  for(const [value,label]of [['funcionario','Colaborador'],['loja_admin','Administrador de loja'],['gestor','Gestor']]){const option=el('option',label);option.value=value;role.append(option);}
  role.value=['gestor','loja_admin'].includes(current.tipo_conta)?current.tipo_conta:'funcionario';group.append(title,role);form.append(group);
 }else form.append(el('p','Você cadastra colaboradores somente nas lojas sob sua administração. Apenas o Gestor define administradores.'));
 const edits=choices(form,'Liberar pedido de edição cadastral da loja',context.lojas.map(l=>[l.id,l.nome]),current.edicao_lojas||[]);
 edits.group.append(el('p','Mesmo com esta liberação, toda alteração ficará em verificação até a aprovação do Gestor.'));
 const warning=el('p','Gestor tem acesso completo a todas as lojas atuais e futuras da empresa, gerencia usuários, cria outros Gestores e aprova alterações. Não cria novas empresas nem acessa a área CEO.');form.append(warning);
 const confirmation=el('label'), confirm=el('input');confirm.type='checkbox';confirmation.className='vs-confirm';confirmation.append(confirm,el('span','Confirmo a concessão de acesso completo como Gestor desta empresa.'));form.append(confirmation);
 const update=()=>{
  const manager=role?.value==='gestor';stores.group.hidden=manager;warning.hidden=confirmation.hidden=!manager;confirm.required=manager;confirm.checked=false;
  const admin=role?.value==='loja_admin';allowed.group.hidden=admin||manager;edits.group.hidden=!admin;
  for(const input of edits.group.querySelectorAll('input')){input.disabled=!stores().includes(input.value);if(input.disabled)input.checked=false;}
 };
 role?.addEventListener('change',update);stores.group.addEventListener('change',update);update();
 return {stores:()=>role?.value==='gestor'?[]:stores(),validate:()=>{if(role?.value==='gestor'&&!confirm.checked)throw new Error('Confirme o acesso completo do novo Gestor.');},role:()=>role?.value||'funcionario',edits:()=>edits(),permissions:()=>['loja_admin','gestor'].includes(role?.value)?Object.fromEntries(Object.keys(labels).map(k=>[k,true])):allowed()};
}
export async function renderCompanyAccess(container, context, onSaved=async()=>{}) {
 container.replaceChildren(el('h2','Usuários, Gestores e permissões'));
 if(!canManagePeople(context)){container.append(el('p','Somente Gestor ou administrador de loja autorizado gerencia usuários.'));return;}
 context={...context,lojas:context.lojas.filter(l=>l.pode_administrar!==false)};
 container.append(el('p',isCompanyManager(context)?'Como Gestor, você cria lojas, outros Gestores, administradores e colaboradores da mesma empresa. Libere por loja quais administradores podem enviar alterações cadastrais para sua verificação.':'Você gerencia colaboradores nas suas lojas. Contas que também atendem lojas fora do seu alcance são gerenciadas pelo Gestor.'));
 const create=el('details');create.open=true;create.append(el('summary','Cadastrar usuário'));
 const form=el('form'),name=field(form,'Nome completo'),login=field(form,'Login (sem e-mail)'),password=field(form,'Senha inicial','password');
 login.pattern='[a-z0-9][a-z0-9._-]{2,39}';login.minLength=3;login.maxLength=40;login.autocomplete='off';login.title='De 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.';login.addEventListener('input',()=>{login.value=login.value.toLowerCase();});
 password.minLength=6;password.maxLength=72;password.autocomplete='new-password';
 form.append(el('p','Troca de senha obrigatória no primeiro acesso. Mínimo de 6 caracteres; pode usar somente números.'));
 const stores=choices(form,'Lojas permitidas',context.lojas.map(l=>[l.id,l.nome]));
 const allowed=permissions(form,{entrada:true}),roles=roleFields(form,context,stores,allowed);
 let credentials=null;
 submit(form,'Criar usuário',async()=>{
  roles.validate();
  if(roles.role()!=='gestor'&&!stores().length)throw new Error('Selecione pelo menos uma loja.');
  const papel=roles.role();
  await authService.provisionAccount({acao:papel==='gestor'?'gestor_empresa':papel==='loja_admin'?'administrador_loja':'funcionario',nome:name.value.trim(),login:login.value.trim(),password:password.value,lojas:roles.stores(),liberacoes:roles.permissions(),edicao_lojas:papel==='loja_admin'?roles.edits():[]});
  credentials={login:login.value.trim(),password:password.value,papel};
 },async()=>{
  const created=credentials;credentials=null;
  await renderCompanyAccess(container,context,onSaved);
  if(created)showCredentials(created.login,created.password,created.papel);
  await onSaved();
 });
 form.append(el('p','Colaboradores sem liberações podem consultar as lojas permitidas. Login fixo; nenhum e-mail pessoal é necessário.'));
 create.append(form);container.append(create);
 const showRemoved=el('label'),toggleRemoved=el('input');toggleRemoved.type='checkbox';showRemoved.append(toggleRemoved,el('span',' Mostrar colaboradores excluídos'));container.append(showRemoved);
 const list=el('div');list.className='access-members';container.append(list);
 const removedVisibility=()=>list.querySelectorAll('[data-removed]').forEach(n=>n.hidden=!toggleRemoved.checked);toggleRemoved.onchange=removedVisibility;
 try{
  const members=await authService.getEmployees();if(!container.isConnected)return;
  if(!members.length)list.append(el('p','Nenhum usuário cadastrado nesta empresa.'));
  for(const member of members){
   const row=el('div'),detail=el('details');row.append(detail);
   if(member.desativado_em){row.dataset.removed='true';row.hidden=!toggleRemoved.checked;detail.append(el('summary',member.nome+' · Excluído'),el('p','Acesso bloqueado. Histórico e autoria preservados.'));list.append(row);continue;}
   detail.append(el('summary',member.nome+' · '+(member.login||'Conta existente')+' · '+(['gestor','empresa_admin'].includes(member.tipo_conta)?'Gestor':member.tipo_conta==='loja_admin'?'Administrador':'Colaborador')));
   if(member.gerenciavel===false){detail.append(el('p',['gestor','empresa_admin'].includes(member.tipo_conta)?'Conta de Gestor protegida. Tem acesso a todas as lojas atuais e futuras da empresa; o próprio usuário altera seu nome e senha em Minha conta.':'Esta conta também atende lojas fora do seu alcance. Para preservar os acessos dessas lojas, a edição é feita pelo Gestor.'));list.append(row);continue;}
   const edit=el('form'),memberName=field(edit,'Nome completo','text',member.nome),fixed=field(edit,'Login (não pode ser alterado)','text',member.login||'Conta com e-mail');fixed.readOnly=true;
   const assigned=choices(edit,'Lojas permitidas',context.lojas.map(l=>[l.id,l.nome]),member.lojas||[]),permitted=permissions(edit,member.liberacoes),roleEdit=roleFields(edit,context,assigned,permitted,member);
   submit(edit,'Salvar papel e liberações',()=>{roleEdit.validate();return authService.savePerson(member.id,memberName.value,roleEdit.role(),roleEdit.stores(),roleEdit.permissions(),roleEdit.role()==='loja_admin'?roleEdit.edits():[]);},async()=>{await renderCompanyAccess(container,context,onSaved);await onSaved();});
   edit.append(el('p',isCompanyManager(context)?'Desmarcar todas as lojas suspende o acesso. Alterar um administrador para colaborador remove sua autoridade administrativa.':'Desmarcar todas as lojas suspende o acesso. A reativação de uma conta sem lojas será feita pelo Gestor.'));
   detail.append(edit);
   const actions=el('div');actions.className='access-member-actions';actions.append(button('Editar cadastro e acessos',()=>{detail.open=true;memberName.focus();}));const remove=button('Excluir colaborador',()=>deleteEmployee(member,async()=>{await renderCompanyAccess(container,context,onSaved);await onSaved();}));remove.classList.add('access-delete-button');actions.append(remove);row.append(actions);list.append(row);
  }
 }catch(error){list.append(el('p',error.message));}
}
export async function openAccessAdmin(context, onSaved=async()=>{}) {
 if(!canManagePeople(context))return;
 const modal=el('dialog'); modal.className='vs-dialog access-dialog'; const header=el('div'); header.className='modal-header';
 const heading=el('h2','Usuários e permissões'); heading.id='access-heading-'+crypto.randomUUID(); modal.setAttribute('aria-labelledby',heading.id);
 header.append(heading,button('Fechar',()=>modal.close())); modal.append(header); document.body.append(modal); modal.addEventListener('close',()=>modal.remove()); modal.showModal();
 const content=el('div'); modal.append(content); await renderCompanyAccess(content,context,onSaved);
}
export function openPasswordChange(onSaved=async()=>{}) {
 const modal=el('dialog'); modal.className='vs-dialog'; const title=el('h2','Alterar minha senha'); title.id='password-'+crypto.randomUUID(); modal.setAttribute('aria-labelledby',title.id);
 const header=el('div'); header.className='modal-header'; header.append(title,button('Fechar',()=>modal.close())); modal.append(header);
 const form=el('form'), current=field(form,'Senha atual','password'), next=field(form,'Nova senha','password'), confirm=field(form,'Confirme a nova senha','password');
 current.autocomplete='current-password'; next.autocomplete=confirm.autocomplete='new-password'; next.minLength=confirm.minLength=6; next.maxLength=confirm.maxLength=72;
 form.append(el('p','A nova senha deve ser diferente da senha atual e ter pelo menos 6 caracteres. Pode conter somente números.'));
 submit(form,'Alterar senha',async()=>{if(next.value!==confirm.value)throw new Error('A confirmação da senha não confere.');if(next.value===current.value)throw new Error('Escolha uma senha diferente da atual.');await authService.changePassword(current.value,next.value);},async()=>{form.reset();await onSaved();});
 modal.append(form); document.body.append(modal); modal.addEventListener('close',()=>modal.remove()); modal.showModal();
}
