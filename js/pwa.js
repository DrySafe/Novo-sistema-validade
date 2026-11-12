let installPrompt;
let installed = false;
let prompting = false;
const buttons = [...document.querySelectorAll('[data-install-app]')];
const surfaces = [...document.querySelectorAll('[data-install-surface]')];
const displayMode = window.matchMedia('(display-mode: standalone)');
const standalone = () => displayMode.matches || navigator.standalone === true;
function syncButtons() {
 const hidden = installed || standalone();
 [...buttons, ...surfaces].forEach(element => { element.hidden = hidden; });
 buttons.forEach(button => { button.disabled = prompting; });
}
function showInstructions() {
 if (document.querySelector('.pwa-instructions[open]')) return;
 const focusBefore = document.activeElement;
 const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
 const android = /Android/i.test(navigator.userAgent);
 const embedded = /FBAN|FBAV|Instagram|WhatsApp|; wv\)/i.test(navigator.userAgent);
 const dialog = document.createElement('dialog'); dialog.className = 'vs-dialog pwa-instructions';
 const title = document.createElement('h2'); title.id = 'pwa-install-title'; title.textContent = 'Instalar ValidaSuper'; dialog.setAttribute('aria-labelledby', title.id);
 const text = document.createElement('p');
 text.textContent = embedded
  ? `Você está em um navegador integrado. Abra https://validadeeco.vercel.app no ${ios ? 'Safari' : 'Chrome'} do celular para instalar.`
  : 'A instalação depende do navegador. Se a janela de instalação não aparecer, siga estes passos:';
 const steps = document.createElement('ol');
 const instructions = ios
  ? ['Abra este site no Safari.', 'Toque em Compartilhar (quadrado com seta para cima).', 'Escolha Adicionar à Tela de Início. Ative Abrir como App, se essa opção aparecer, e confirme em Adicionar.']
  : android
   ? ['Abra este site no Chrome do celular.', 'Toque no menu de três pontos (⋮) do navegador.', 'Escolha Adicionar à tela inicial → Instalar, ou Instalar aplicativo, e confirme.']
   : ['Abra este site no Chrome ou Edge e procure Instalar aplicativo no menu do navegador.', 'No Safari do Mac, use Arquivo → Adicionar ao Dock.'];
 for (const instruction of instructions) { const item = document.createElement('li'); item.textContent = instruction; steps.append(item); }
 const note = document.createElement('p'); note.textContent = 'Se a opção não aparecer, use uma aba normal, fora do modo anônimo, e verifique se o app já está instalado. A instalação não altera seus dados nem seu login.';
 const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-primary'; close.textContent = 'Entendi'; close.onclick = () => dialog.close();
 dialog.append(title, text, steps, note, close); document.body.append(dialog);
 dialog.addEventListener('close', () => { dialog.remove(); focusBefore?.focus(); }, { once:true }); dialog.showModal();
}
buttons.forEach(button => button.addEventListener('click', async () => {
 if (prompting) return;
 if (!installPrompt) { showInstructions(); return; }
 const prompt = installPrompt; installPrompt = undefined; prompting = true; syncButtons();
 try { await prompt.prompt(); await prompt.userChoice; } catch { showInstructions(); }
 finally { prompting = false; syncButtons(); }
}));
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; syncButtons(); });
window.addEventListener('appinstalled', () => { installed = true; installPrompt = undefined; syncButtons(); });
displayMode.addEventListener('change', syncButtons);
syncButtons();
if ('serviceWorker' in navigator) {
 const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* O acesso online continua disponível. */ });
 if (document.readyState === 'complete') register();
 else window.addEventListener('load', register, { once:true });
}
