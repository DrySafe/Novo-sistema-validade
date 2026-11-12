let sequence=0;
export function beginLoading(message='Carregando…',doc=document){
 const id=++sequence,overlay=doc.getElementById('page-loading');
 if(!overlay)return ()=>{};
 clearTimeout(doc.defaultView.__bootLoadingTimer);
 overlay.querySelector('[data-loading-message]').textContent=message;
 overlay.querySelector('[data-loading-retry]').hidden=true;
 overlay.hidden=false;overlay.setAttribute('aria-busy','true');
 const timer=setTimeout(()=>{if(sequence===id){overlay.querySelector('[data-loading-message]').textContent='Está demorando mais que o esperado. Verifique sua conexão.';overlay.querySelector('[data-loading-retry]').hidden=false;}},15000);
 return ()=>{clearTimeout(timer);if(sequence===id){overlay.hidden=true;overlay.setAttribute('aria-busy','false');}};
}
export function finishBoot(doc=document){clearTimeout(doc.defaultView.__bootLoadingTimer);const el=doc.getElementById('page-loading');if(el)el.hidden=true;}
export function showSectionLoading(container){
 container.replaceChildren();container.setAttribute('aria-busy','true');
 const status=container.ownerDocument.createElement('p');status.className='section-loading-label';status.setAttribute('role','status');status.textContent='Carregando os dados da loja…';
 const skeleton=container.ownerDocument.createElement('div');skeleton.className='loading-skeleton';skeleton.setAttribute('aria-hidden','true');
 container.append(status,skeleton);
}
export function finishSectionLoading(container){container.removeAttribute('aria-busy');container.classList.remove('view-enter');void container.offsetWidth;container.classList.add('view-enter');}
