import { ceoClient } from './ceoClient.js';
const login=document.getElementById('ceo-login'),panel=document.getElementById('ceo-panel'),status=document.getElementById('ceo-status');
function view(authorized){login.hidden=authorized;panel.hidden=!authorized;}
async function authorize(){
 const {data:{user},error:userError}=await ceoClient.auth.getUser();
 if(userError||!user){view(false);return false;}
 const {data,error}=await ceoClient.rpc('vs_ceo_autorizado');
 if(error||data!==true){await ceoClient.auth.signOut({scope:'local'});view(false);status.textContent='Acesso exclusivo do CEO. Para operar sua empresa, use o acesso da empresa.';return false;}
 view(true);return true;
}
login.onsubmit=async event=>{
 event.preventDefault();const save=login.querySelector('[type=submit]');save.disabled=true;status.textContent='Verificando acesso…';
 try{
  const {error}=await ceoClient.auth.signInWithPassword({email:document.getElementById('ceo-email').value.trim().toLowerCase(),password:document.getElementById('ceo-password').value});
  if(error)throw new Error('E-mail ou senha incorretos, ou acesso indisponível.');
  if(await authorize()){status.textContent='Acesso CEO autorizado.';login.reset();}
 }catch(error){view(false);status.textContent=error.message;}finally{document.getElementById('ceo-password').value='';save.disabled=false;}
};
document.getElementById('ceo-create-admin').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,save=form.querySelector('[type=submit]');save.disabled=true;status.textContent='Criando administrador…';
 try{
  const password=document.getElementById('new-admin-password').value;
  if(password.length<12)throw new Error('Use uma senha inicial de pelo menos 12 caracteres.');
  if(new TextEncoder().encode(password).length>72)throw new Error('Senha longa demais. Reduza o tamanho, especialmente se usar acentos ou emojis.');
  const {data,error}=await ceoClient.functions.invoke('gerenciar-equipe',{body:{acao:'administrador',email:document.getElementById('new-admin-email').value.trim().toLowerCase(),password}});
  let message=data?.error;
  if(error?.context&&typeof error.context.json==='function'){try{message=(await error.context.json()).error||message;}catch{}}
  if(error||data?.error)throw new Error(message||'Não foi possível criar a conta. Confira o acesso e tente novamente.');
  form.reset();status.textContent='Conta ADM criada. Entregue as credenciais iniciais ao responsável; ele deverá definir sua senha pessoal ao entrar.';
 }catch(error){status.textContent=error.message;}finally{document.getElementById('new-admin-password').value='';save.disabled=false;}
};
document.getElementById('ceo-logout').onclick=async()=>{await ceoClient.auth.signOut({scope:'local'});view(false);status.textContent='Você saiu da Área Administrativa.';};
authorize().catch(()=>{view(false);status.textContent='Não foi possível verificar o acesso. Tente entrar novamente.';});
