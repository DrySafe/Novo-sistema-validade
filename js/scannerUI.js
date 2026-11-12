export function scannerMessage(error) {
 const messages = {
  NotAllowedError: 'Acesso à câmera bloqueado. Nas permissões deste site no navegador, permita a câmera e tente novamente.',
  SecurityError: 'Abra o app pelo endereço HTTPS e permita o acesso à câmera.',
  NotFoundError: 'Nenhuma câmera foi encontrada neste aparelho.',
  NotReadableError: 'A câmera está ocupada ou indisponível. Feche outros aplicativos que a utilizam e tente novamente.',
  OverconstrainedError: 'Não foi possível usar essa câmera. Tente novamente ou digite o código.'
 };
 return messages[error?.name] || 'Não foi possível iniciar o leitor. Tente novamente ou digite o código de barras manualmente.';
}

export function setupScanner(document, scanner = window) {
 const button = document.getElementById('btn-toggle-camera');
 const container = document.getElementById('camera-container');
 const status = document.getElementById('camera-status');
 const input = document.getElementById('entry-ean');
 let active = false, version = 0;
 const stop = () => {
  version++; active = false;
  container.classList.add('hidden');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Ler código de barras com a câmera');
  scanner.pararScanner();
 };
 button.addEventListener('click', async () => {
  if (active) { stop(); status.textContent = 'Leitor encerrado. Você também pode digitar o código.'; return; }
  active = true;
  const current = ++version;
  container.classList.remove('hidden');
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-label', 'Fechar câmera');
  status.textContent = 'Abrindo câmera… Permita o acesso quando o navegador solicitar.';
  try {
   await scanner.iniciarScanner('scanner-video', code => {
    if (current !== version) return;
    input.value = code;
    stop();
    status.textContent = 'Código lido. Confira os dados do produto antes de salvar.';
    input.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
   }, () => {
    if (current !== version) return;
    stop(); status.textContent = 'Tempo de leitura encerrado. Abra a câmera novamente ou digite o código.';
   });
   if (current === version) status.textContent = 'Aponte o código de barras para a marcação. Toque na câmera para encerrar.';
  } catch (error) {
   if (current !== version) return;
   stop(); status.textContent = scannerMessage(error);
  }
 });
 document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
 document.defaultView.addEventListener('pagehide', stop);
 return stop;
}
