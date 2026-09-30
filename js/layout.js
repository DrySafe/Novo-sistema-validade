export function initializeLayout(doc = document) {
  const toggle = doc.getElementById('nav-more-toggle');
  const secondary = doc.getElementById('nav-secondary');
  const titles = { ciclos: 'Acompanhamento', validade: 'Validades', vencidos: 'Vencidos', uso_loja: 'Uso da loja', avarias: 'Avarias', equipe: 'Equipe' };
  const paths = {
    ciclos: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
    validade: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-12 4h3m-3 3h6"/>',
    vencidos: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    uso_loja: '<path d="m3 10 3-6h12l3 6M5 10v10h14V10M9 20v-7h6v7"/><path d="M3 10h18"/>',
    avarias: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5m-9 5v9M8 5l9 5"/>',
    equipe: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m4 9v-2a6 6 0 0 0-4-5"/>'
  };
  function close(returnFocus = false) {
    secondary.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => {
    const open = !secondary.classList.contains('is-open');
    secondary.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open));
  });
  for (const button of doc.querySelectorAll('.nav-item')) {
    button.querySelector('.nav-icon').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[button.dataset.sector]}</svg>`;
    button.querySelector('.nav-icon').setAttribute('aria-hidden', 'true');
    if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => {
      doc.querySelectorAll('.nav-item').forEach(b => b.removeAttribute('aria-current'));
      button.setAttribute('aria-current', 'page');
      doc.getElementById('workspace-title').textContent = titles[button.dataset.sector];
      toggle.classList.toggle('active', secondary.contains(button));
      toggle.setAttribute('aria-label', secondary.contains(button) ? 'Mais opções — ' + titles[button.dataset.sector] : 'Mais opções');
      doc.querySelectorAll('.report-menu').forEach(e => e.open = false);
      close(secondary.contains(button));
    });
  }
  doc.addEventListener('click', event => {
    if (!secondary.contains(event.target) && !toggle.contains(event.target)) close();
    doc.querySelectorAll('.report-menu[open]').forEach(e => { if (!e.contains(event.target)) e.open = false; });
  });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (secondary.classList.contains('is-open')) close(true);
      doc.querySelectorAll('.report-menu').forEach(e => e.open = false);
      if (doc.querySelector('.modal.active')) doc.defaultView.closeAllModals();
    }
  });
  doc.getElementById('btn-profile-logout').onclick = () => doc.getElementById('btn-logout').click();
  doc.getElementById('btn-toggle-theme').textContent = '◐';
  doc.getElementById('btn-logout').textContent = '↪';
  let focusBeforeModal = null;
  for (const modal of doc.querySelectorAll('.modal')) {
    modal.setAttribute('aria-hidden', String(!modal.classList.contains('active')));
    new doc.defaultView.MutationObserver(() => {
      const open = modal.classList.contains('active');
      modal.setAttribute('aria-hidden', String(!open));
      if (open) {
        focusBeforeModal = doc.activeElement;
        modal.querySelector('input:not([type=hidden]), button')?.focus();
      } else if (!doc.querySelector('.modal.active')) focusBeforeModal?.focus();
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    modal.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...modal.querySelectorAll('button:not(:disabled),input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(e => e.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
}
