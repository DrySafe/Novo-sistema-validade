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
function showCredentials(login, password) {
 const modal=el('dialog'); modal.className='vs-dialog access-dialog';
 const title=el('h2','Colaborador cadastrado'); title.id='credentials-'+crypto.randomUUID(); modal.setAttribute('aria-labelledby',title.id);
 modal.append(title,el('p','Entregue estas credenciais diretamente ao colaborador por um canal privado. Ele poderá trocar a própria senha. Esta tela não ficará disponível no cadastro.'));
 const form=el('div');
 const user=field(form,'Login','text',login), secret=field(form,'Senha inicial','password',password);
 user.readOnly=secret.readOnly=true;
 const status=el('p'); status.setAttribute('role','status');
 form.append(button('Mostrar / ocultar senha',()=>{secret.type=secret.type==='password'?'text':'password';}),button('Copiar acesso',async()=>{
  try { await navigator.clipboard.writeText(`Acesso ao ValidaSuper: ${location.origin}/\nLogin: ${user.value}\nSenha inicial: ${secret.value}\nTroque sua senha pelo seu perfil após entrar.`); status.textContent='Credenciais copiadas. Compartilhe por um canal privado.'; }
  catch { status.textContent='Não foi possível copiar. Selecione o login e mostre a senha para copiá-los manualmente.'; }
 }));
 modal.append(form,status,button('Concluir',()=>modal.close()));
 modal.addEventListener('close',()=>{password='';secret.value='';modal.remove();});
 document.body.append(modal); modal.showModal();
}
export async function renderCompanyAccess(container, context, onSaved=async()=>{}) {
 container.replaceChildren(el('h2','Colaboradores e permissões'));
 if(context.dono_app || !context.empresa_admin){container.append(el('p','Somente o administrador da empresa gerencia funcionários.')); return;}
 container.append(el('p','Cada funcionário consulta apenas as lojas selecionadas. As liberações abaixo autorizam operações. O login é único no aplicativo e não pode ser alterado. Para suspender o acesso às lojas, desmarque todas e salve.'));
 const create=el('details'); create.open=true; create.append(el('summary','Cadastrar colaborador'));
 const form=el('form'), name=field(form,'Nome completo'), login=field(form,'Login (sem e-mail)'), password=field(form,'Senha inicial','password');
 login.pattern='[a-z0-9][a-z0-9._-]{2,39}'; login.minLength=3; login.maxLength=40; login.autocomplete='off'; login.title='De 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.'; login.addEventListener('input',()=>{login.value=login.value.toLowerCase();});
 password.minLength=6; password.maxLength=72; password.autocomplete='new-password';
 const stores=choices(form,'Lojas permitidas',context.lojas.map(l=>[l.id,l.nome]));
 const allowed=permissions(form,{entrada:true});
 let credentials=null;
 submit(form,'Criar colaborador',async()=>{
  if(!stores().length)throw new Error('Selecione pelo menos uma loja.');
  await authService.provisionAccount({acao:'funcionario',nome:name.value.trim(),login:login.value.trim(),password:password.value,lojas:stores(),liberacoes:allowed()});
  credentials={login:login.value.trim(),password:password.value};
 },async()=>{
  const created=credentials; credentials=null;
  await renderCompanyAccess(container,context,onSaved);
  if(created) showCredentials(created.login,created.password);
  await onSaved();
 });
 form.append(el('p','Não é necessário e-mail. Para acompanhar dados sem cadastrar ou movimentar, desmarque todas as liberações; mantenha as lojas permitidas.'));
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
 current.autocomplete='current-password'; next.autocomplete=confirm.autocomplete='new-password'; next.minLength=confirm.minLength=6; next.maxLength=confirm.maxLength=72;
 submit(form,'Alterar senha',async()=>{if(next.value!==confirm.value)throw new Error('A confirmação da senha não confere.');if(next.value===current.value)throw new Error('Escolha uma senha diferente da atual.');await authService.changePassword(current.value,next.value);},async()=>{form.reset();await onSaved();});
 modal.append(form); document.body.append(modal); modal.addEventListener('close',()=>modal.remove()); modal.showModal();
}
