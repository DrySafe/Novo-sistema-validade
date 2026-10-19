let installPrompt;
let installed = false;
const buttons = [...document.querySelectorAll('[data-install-app]')];
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function syncButtons() { buttons.forEach(button => { button.hidden = installed || standalone(); }); }
function showInstructions() {
 const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
 const dialog = document.createElement('dialog'); dialog.className = 'vs-dialog pwa-instructions';
 const title = document.createElement('h2'); title.id = 'pwa-install-title'; title.textContent = 'Instalar ValidaSuper'; dialog.setAttribute('aria-labelledby', title.id);
 const text = document.createElement('p'); text.textContent = ios
  ? 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Confirme em Adicionar.'
  : 'Abra este site no Chrome, Edge ou Safari. No menu do navegador, escolha Instalar aplicativo ou Adicionar à Tela de Início. No Safari do Mac, use Arquivo → Adicionar ao Dock. A opção depende do navegador e do dispositivo.';
 const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-primary'; close.textContent = 'Entendi'; close.onclick = () => dialog.close();
 dialog.append(title, text, close); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
}
buttons.forEach(button => button.addEventListener('click', async () => {
 if (!installPrompt) { showInstructions(); return; }
 const prompt = installPrompt; installPrompt = undefined;
 try { await prompt.prompt(); await prompt.userChoice; } catch { showInstructions(); }
 syncButtons();
}));
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; syncButtons(); });
window.addEventListener('appinstalled', () => { installed = true; installPrompt = undefined; syncButtons(); });
window.matchMedia('(display-mode: standalone)').addEventListener('change', syncButtons);
syncButtons();
if ('serviceWorker' in navigator) {
 window.addEventListener('load', () => {
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* O acesso online continua disponível. */ });
 });
}
