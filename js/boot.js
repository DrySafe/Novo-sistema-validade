// Independente das bibliotecas de autenticação: oferece recuperação se um módulo não carregar.
const overlay=document.getElementById('page-loading');
if(overlay){
 overlay.querySelector('[data-loading-retry]').addEventListener('click',()=>location.reload());
 window.__bootLoadingTimer=setTimeout(()=>{if(!overlay.hidden){overlay.querySelector('[data-loading-message]').textContent='Não foi possível concluir o carregamento. Confira sua conexão e tente novamente.';overlay.querySelector('[data-loading-retry]').hidden=false;}},15000);
}
