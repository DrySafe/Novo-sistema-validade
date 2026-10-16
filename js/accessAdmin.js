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
 form.append(group); return ()=>[...group.querySelectorAll('input:checked')].map(n=>n.value);
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
 return ()=>Object.fromEntries(Object.keys(labels).map(k=>[k,selected().includes(k)]));
}
export async function renderCompanyAccess(container, context, onSaved=async()=>{}) {
 container.replaceChildren(el('h2','Funcionários e Liberações'));
 if(context.dono_app || !context.empresa_admin){container.append(el('p','Somente o administrador da empresa gerencia funcionários.')); return;}
 container.append(el('p','Cada funcionário consulta apenas as lojas selecionadas. As liberações abaixo autorizam operações. O login é único no aplicativo e não pode ser alterado. Para suspender o acesso às lojas, desmarque todas e salve.'));
 const create=el('details'); create.append(el('summary','Adicionar funcionário'));
 const form=el('form'), name=field(form,'Nome completo'), login=field(form,'Login (sem e-mail)'), password=field(form,'Senha inicial','password');
 login.pattern='[a-z0-9][a-z0-9._-]{2,39}'; login.minLength=3; login.maxLength=40; login.autocomplete='off'; login.title='De 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.'; login.addEventListener('input',()=>{login.value=login.value.toLowerCase();});
 password.minLength=12; password.maxLength=72; password.autocomplete='new-password';
 const stores=choices(form,'Lojas permitidas',context.lojas.map(l=>[l.id,l.nome]));
 const allowed=permissions(form);
 submit(form,'Criar funcionário',async()=>{if(!stores().length)throw new Error('Selecione pelo menos uma loja.'); await authService.provisionAccount({acao:'funcionario',nome:name.value,login:login.value,password:password.value,lojas:stores(),liberacoes:allowed()});},async()=>{await renderCompanyAccess(container,context,onSaved); await onSaved();});
 create.append(form); container.append(create);
 const list=el('div'); list.className='access-members'; container.append(list);
 try {
 const members=await authService.getEmployees();
 if(!container.isConnected)return;
 if(!members.length)list.append(el('p','Nenhum funcionário cadastrado nesta empresa.'));
 for(const member of members){
  const detail=el('details'); detail.append(el('summary',member.nome+' · '+(member.login||'Conta existente')));
  const edit=el('form'), memberName=field(edit,'Nome completo','text',member.nome);
  const fixed=field(edit,'Login (não pode ser alterado)','text',member.login||'Login por e-mail da conta existente'); fixed.readOnly=true;
  const assigned=choices(edit,'Lojas permitidas',context.lojas.map(l=>[l.id,l.nome]),member.lojas||[]);
  const permitted=permissions(edit,member.liberacoes);
  submit(edit,'Salvar liberações',()=>authService.saveAccess(member.id,memberName.value,assigned(),permitted()),onSaved);
  detail.append(edit); list.append(detail);
 }
 }catch(err){list.append(el('p',err.message));}
}
export async function openAccessAdmin(context, onSaved=async()=>{}) {
 if(context.dono_app || !context.empresa_admin)return;
 const modal=el('dialog'); modal.className='vs-dialog access-dialog'; const header=el('div'); header.className='modal-header';
 const heading=el('h2','Funcionários e Liberações'); heading.id='access-heading-'+crypto.randomUUID(); modal.setAttribute('aria-labelledby',heading.id);
 header.append(heading,button('Fechar',()=>modal.close())); modal.append(header); document.body.append(modal); modal.addEventListener('close',()=>modal.remove()); modal.showModal();
 const content=el('div'); modal.append(content); await renderCompanyAccess(content,context,onSaved);
}
export function openPasswordChange(onSaved=async()=>{}) {
 const modal=el('dialog'); modal.className='vs-dialog'; const title=el('h2','Alterar minha senha'); title.id='password-'+crypto.randomUUID(); modal.setAttribute('aria-labelledby',title.id);
 const header=el('div'); header.className='modal-header'; header.append(title,button('Fechar',()=>modal.close())); modal.append(header);
 const form=el('form'), current=field(form,'Senha atual','password'), next=field(form,'Nova senha','password'), confirm=field(form,'Confirme a nova senha','password');
 current.autocomplete='current-password'; next.autocomplete=confirm.autocomplete='new-password'; next.minLength=confirm.minLength=12; next.maxLength=confirm.maxLength=72;
 submit(form,'Alterar senha',async()=>{if(next.value!==confirm.value)throw new Error('A confirmação da senha não confere.');if(next.value===current.value)throw new Error('Escolha uma senha diferente da atual.');await authService.changePassword(current.value,next.value);},async()=>{form.reset();await onSaved();});
 modal.append(form); document.body.append(modal); modal.addEventListener('close',()=>modal.remove()); modal.showModal();
}
