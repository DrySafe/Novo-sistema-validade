import { authService } from './services/authService.js';
import { productService } from './services/productService.js';

let currentProfile = null;
let currentSector = 'validade';
let currentData = [];

// Elementos Globais da Interface
let loginScreen = null;
let appScreen = null;
let modalEntry = null;
let modalEmployee = null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📌 DOM carregado. Inicializando elementos e eventos...');
  
  loginScreen = document.getElementById('login-screen');
  appScreen = document.getElementById('app-screen');
  modalEntry = document.getElementById('modal-entry');
  modalEmployee = document.getElementById('modal-employee');

  setupEvents();
  checkSession();
});

async function checkSession() {
  console.log('🔍 Verificando sessão ativa...');

  try {
    currentProfile = await authService.getCurrentProfile();
    console.log('👤 Perfil retornado do banco:', currentProfile);

    if (currentProfile) {
      const elemUser = document.getElementById('display-user-name');
      const elemStore = document.getElementById('display-store-name');

      if (elemUser) elemUser.textContent = currentProfile.nome;
      if (elemStore) elemStore.textContent = currentProfile.lojas?.nome || 'Loja';

      loginScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      document.getElementById('bottom-nav')?.classList.remove('hidden');

      console.log('✅ Login realizado com sucesso!');
      loadSectorData();
    } else {
      showLoginScreen();
    }
  } catch (err) {
    console.error('❌ Erro na verificação de sessão:', err);
    showLoginScreen();
  }
}

function showLoginScreen() {
  if (loginScreen) loginScreen.classList.remove('hidden');
  if (appScreen) appScreen.classList.add('hidden');
  document.getElementById('bottom-nav')?.classList.add('hidden');
}

// Função Unificada para fechar todos os modais e desligar a câmera
async function closeAllModals() {
  if (typeof window.pararScanner === 'function') {
    try {
      await window.pararScanner();
    } catch (e) {
      console.warn('Erro ao desligar o scanner:', e);
    }
  }

  const cameraContainer = document.getElementById('camera-container');
  if (cameraContainer) cameraContainer.classList.add('hidden');

  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('active');
  });
}

function setupEvents() {
  // 1. ALTERNAR TEMA (DARK / LIGHT)
  const btnToggleTheme = document.getElementById('btn-toggle-theme');

  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    if (btnToggleTheme) btnToggleTheme.textContent = '☀️';
  }

  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      btnToggleTheme.textContent = isDark ? '☀️' : '🌙';
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  // 2. TELA DE LOGIN E CADASTRO DE LOJA
  const btnShowRegister = document.getElementById('btn-show-register');
  const btnShowLogin = document.getElementById('btn-show-login');
  const formLogin = document.getElementById('form-login');
  const formRegisterStore = document.getElementById('form-register-store');

  if (btnShowRegister && btnShowLogin) {
    btnShowRegister.addEventListener('click', () => {
      formLogin.classList.add('hidden');
      formRegisterStore.classList.remove('hidden');
    });

    btnShowLogin.addEventListener('click', () => {
      formRegisterStore.classList.add('hidden');
      formLogin.classList.remove('hidden');
    });
  }

  if (formRegisterStore) {
    formRegisterStore.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await authService.registerNewStore({
          nomeLoja: document.getElementById('reg-store-name').value,
          cnpj: document.getElementById('reg-cnpj').value,
          nomeAdmin: document.getElementById('reg-admin-name').value,
          email: document.getElementById('reg-email').value,
          password: document.getElementById('reg-password').value
        });

        alert('Loja e perfil criados com sucesso!');
        await checkSession();
      } catch (err) {
        alert('Erro ao cadastrar loja: ' + err.message);
      }
    });
  }

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        await authService.login(email, password);
        await checkSession();
      } catch (err) {
        alert('Erro ao realizar login: ' + (err.message || err));
      }
    });
  }

  // 3. LOGOUT
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await authService.logout();
      location.reload();
    });
  }

  // 4. BOTTOM NAV (TROCA DE ABAS)
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      closeAllModals();

      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      currentSector = target.dataset.sector;
      loadSectorData();
    });
  });

  // 5. ABERTURA E FECHAMENTO DE MODAIS
  const btnOpenModal = document.getElementById('btn-open-modal');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      closeAllModals();

      if (currentSector === 'equipe') {
        if (modalEmployee) modalEmployee.classList.add('active');
      } else {
        const entrySector = document.getElementById('entry-sector');
        if (entrySector) entrySector.value = currentSector;
        
        const isValidade = currentSector === 'validade';
        const fieldValidade = document.getElementById('field-group-validity');
        if (fieldValidade) fieldValidade.style.display = isValidade ? 'grid' : 'none';

        if (modalEntry) modalEntry.classList.add('active');
      }
    });
  }

  // Botões de fechar "X"
  document.getElementById('btn-close-modal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-modal-emp')?.addEventListener('click', closeAllModals);

  // 6. FORMULÁRIO DE COLABORADOR
  const formEmployee = document.getElementById('form-employee');
  if (formEmployee) {
    formEmployee.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await authService.addEmployee({
          lojaId: currentProfile.loja_id,
          nome: document.getElementById('emp-name').value,
          funcao: document.getElementById('emp-role').value,
          email: document.getElementById('emp-email').value,
          avatarUrl: document.getElementById('emp-avatar').value
        });

        alert('Colaborador cadastrado com sucesso!');
        await closeAllModals();
        formEmployee.reset();
        loadSectorData();
      } catch (err) {
        alert('Erro ao cadastrar colaborador: ' + err.message);
      }
    });
  }

  // 7. CONSULTA EAN (BLUR)
  const entryEanInput = document.getElementById('entry-ean');
  if (entryEanInput) {
    entryEanInput.addEventListener('blur', async () => {
      const ean = entryEanInput.value.trim();
      if (!ean) return;

      const previewBox = document.getElementById('product-preview-box');
      const previewImg = document.getElementById('preview-img');
      const previewTitle = document.getElementById('preview-title');
      const nameInput = document.getElementById('entry-product-name');
      const imageUrlInput = document.getElementById('entry-image-url');

      const extProd = await productService.fetchEanExternalApi(ean);

      if (extProd) {
        if (!nameInput.value) nameInput.value = extProd.nome;
        imageUrlInput.value = extProd.imagem_url;

        previewImg.src = extProd.imagem_url || 'https://via.placeholder.com/50?text=Sem+Foto';
        previewTitle.textContent = extProd.nome || 'Produto sem nome';
        if (previewBox) previewBox.classList.remove('hidden');
      } else {
        if (previewBox) previewBox.classList.add('hidden');
      }
    });
  }

  // 8. CÂMERA SCANNER
  const btnToggleCamera = document.getElementById('btn-toggle-camera');
  const cameraContainer = document.getElementById('camera-container');

  if (btnToggleCamera && cameraContainer) {
    btnToggleCamera.addEventListener('click', async () => {
      if (!cameraContainer.classList.contains('hidden')) {
        await window.pararScanner();
        cameraContainer.classList.add('hidden');
        return;
      }

      try {
        cameraContainer.classList.remove('hidden');
        await window.iniciarScanner('scanner-video', async (codigoLido) => {
          const eanInput = document.getElementById('entry-ean');
          eanInput.value = codigoLido;
          eanInput.dispatchEvent(new Event('blur'));

          await window.pararScanner();
          cameraContainer.classList.add('hidden');
        });
      } catch (err) {
        alert("Erro ao acessar a câmera: " + err.message);
        cameraContainer.classList.add('hidden');
      }
    });
  }

  // 9. FORMULÁRIO DE PRODUTO
  const formEntry = document.getElementById('form-entry');
  if (formEntry) {
    formEntry.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await productService.createEntry({
          lojaId: currentProfile.loja_id,
          usuarioId: currentProfile.id,
          setor: currentSector,
          ean: document.getElementById('entry-ean').value,
          produtoNome: document.getElementById('entry-product-name').value,
          imagemUrl: document.getElementById('entry-image-url').value,
          lote: document.getElementById('entry-batch').value,
          quantidade: parseInt(document.getElementById('entry-qty').value),
          dataVencimento: document.getElementById('entry-expiration').value,
          localizacao: document.getElementById('entry-location').value,
          motivo: document.getElementById('entry-reason')?.value || ''
        });

        await closeAllModals();
        formEntry.reset();
        const previewBox = document.getElementById('product-preview-box');
        if (previewBox) previewBox.classList.add('hidden');

        loadSectorData();
      } catch (err) {
        alert('Erro ao salvar registro: ' + err.message);
      }
    });
  }
}

async function loadSectorData() {
  const container = document.getElementById('product-card-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Carregando lançamentos...</div>';

  try {
    if (currentSector === 'validade') {
      currentData = await productService.getReguaVencimentos(currentProfile.loja_id);
      renderValidadeCards(currentData, container);
    } else if (currentSector === 'equipe') {
      currentData = await authService.getTeamMembers(currentProfile.loja_id);
      renderEquipeCards(currentData, container);
    } else {
      currentData = await productService.getRegistrosPerdas(currentProfile.loja_id, currentSector);
      renderPerdasCards(currentData, container);
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--st-7);">Erro ao carregar dados: ${err.message}</div>`;
  }
}

function renderValidadeCards(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum lote registrado neste setor.</div>';
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="product-card">
      <img src="${item.imagem_url || 'https://via.placeholder.com/56?text=Sem+Foto'}" alt="Foto">
      <div class="product-info">
        <div class="product-title">${item.produto_nome}</div>
        <div class="product-sub">
          <span>Lote: <strong>${item.lote}</strong></span>
          <span>Qtd: <strong>${item.quantidade} un</strong></span>
        </div>
        <div class="product-sub" style="margin-top: 0.25rem;">
          <span>Venc: <strong>${new Date(item.data_vencimento).toLocaleDateString('pt-BR')}</strong></span>
        </div>
      </div>
      <div>
        <span class="badge-regua ${getBadgeClass(item.status_regua)}">${item.status_regua}</span>
      </div>
    </div>
  `).join('');
}

function renderEquipeCards(members, container) {
  if (!members || members.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum colaborador cadastrado nesta loja.</div>';
    return;
  }

  container.innerHTML = members.map(user => `
    <div class="product-card">
      <img src="${user.foto_url || 'https://via.placeholder.com/56?text=User'}" 
           alt="Avatar" 
           style="border-radius: 50%; object-fit: cover;">
      <div class="product-info">
        <div class="product-title">${user.nome}</div>
        <div class="product-sub">
          <span>Função: <strong style="text-transform: capitalize;">${user.funcao}</strong></span>
        </div>
      </div>
      <div>
        <span class="badge-regua badge-60" style="font-size: 0.75rem;">Ativo</span>
      </div>
    </div>
  `).join('');
}

function renderPerdasCards(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum registro encontrado neste setor.</div>';
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="product-card">
      <img src="${item.produtos?.imagem_url || 'https://via.placeholder.com/56?text=Sem+Foto'}" alt="Foto">
      <div class="product-info">
        <div class="product-title">${item.produtos?.nome || 'N/I'}</div>
        <div class="product-sub">
          <span>Qtd: <strong>${item.quantidade} un</strong></span>
          <span>Motivo: <strong>${item.motivo || 'N/A'}</strong></span>
        </div>
      </div>
    </div>
  `).join('');
}

function getBadgeClass(status) {
  if (!status) return 'badge-60';
  if (status.includes('Crítico')) return 'badge-7';
  if (status.includes('15')) return 'badge-15';
  if (status.includes('30')) return 'badge-30';
  if (status.includes('45')) return 'badge-45';
  if (status.includes('60')) return 'badge-60';
  return 'badge-vencido';
}