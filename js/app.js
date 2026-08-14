import { authService } from './authService.js';
import { productService } from './productService.js';
import { reportService } from './reportService.js';
import { supabase } from './supabaseClient.js';

// Avatar SVG de reserva quando o produto/usuário não tem foto
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 24 24' fill='%239ca3af'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

// Variáveis de Estado Globais
let currentProfile = null;
let currentSector = 'validade';
let currentData = [];
let userLojas = [];
let activeLojaId = localStorage.getItem('active_loja_id') || null;

// Elementos Globais da Interface
let loginScreen = null;
let appScreen = null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📌 DOM carregado. Inicializando ValidaSuper...');
  
  loginScreen = document.getElementById('login-screen');
  appScreen = document.getElementById('app-screen');

  setupEvents();
  checkSession();
});

// ============================================================
// VERIFICAÇÃO DE SESSÃO E CARREGAMENTO INICIAL
// ============================================================
async function checkSession() {
  console.log('🔍 Verificando sessão ativa...');

  try {
    currentProfile = await authService.getCurrentProfile();
    console.log('👤 Perfil retornado do banco:', currentProfile);

    if (currentProfile) {
      // SE O USUÁRIO AINDA NÃO TEM LOJA VINCULADA (Novo Onboarding)
      if (!currentProfile.loja_id && !currentProfile.lojas) {
        const nomeLoja = prompt(`Olá ${currentProfile.nome}! Para começar, digite o nome do seu Supermercado/Loja:`);
        if (nomeLoja) {
          const novaLoja = await authService.createStoreForUser({
            nomeLoja,
            cnpj: '',
            usuarioId: currentProfile.id
          });
          currentProfile.loja_id = novaLoja.id;
          currentProfile.lojas = novaLoja;
        } else {
          alert("Você precisa cadastrar uma loja para utilizar o ValidaSuper.");
          await authService.logout();
          showLoginScreen();
          return;
        }
      }

      const elemUser = document.getElementById('display-user-name');
      const elemStore = document.getElementById('display-store-name');

      if (elemUser) elemUser.textContent = currentProfile.nome;
      if (elemStore) elemStore.textContent = currentProfile.lojas?.nome || 'Loja';

      // Configura seletor de loja (múltiplas lojas)
      await setupStoreSelector();

      // Controle de visibilidade da aba Equipe
      const btnEquipe = document.getElementById('nav-item-equipe');
      if (btnEquipe) {
        const userRole = (currentProfile.funcao || '').toLowerCase();
        const allowedRoles = ['administrador', 'admin', 'gestor', 'gerente'];

        if (allowedRoles.includes(userRole)) {
          btnEquipe.classList.remove('hidden');
        } else {
          btnEquipe.classList.add('hidden');
        }
      }

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

// Configuração do Seletor Multiloja no Topbar
async function setupStoreSelector() {
  const container = document.getElementById('store-selector-container');
  const select = document.getElementById('select-active-store');
  if (!container || !select) return;

  const userRole = (currentProfile.funcao || '').toLowerCase();

  // Operador não altera loja
  if (userRole === 'operador') {
    container.classList.add('hidden');
    activeLojaId = currentProfile.loja_id;
    localStorage.setItem('active_loja_id', activeLojaId);
    return;
  }

  try {
    let query;
    if (userRole === 'administrador') {
      query = supabase.from('lojas').select('id, nome');
    } else {
      query = supabase.from('usuario_lojas').select('lojas(id, nome)').eq('usuario_id', currentProfile.id);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      activeLojaId = currentProfile.loja_id;
      return;
    }

    userLojas = userRole === 'administrador' ? data : data.map(d => d.lojas);

    select.innerHTML = userLojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');

    if (activeLojaId && userLojas.some(l => l.id === activeLojaId)) {
      select.value = activeLojaId;
    } else {
      activeLojaId = userLojas[0].id;
      select.value = activeLojaId;
      localStorage.setItem('active_loja_id', activeLojaId);
    }

    container.classList.remove('hidden');

    select.onchange = (e) => {
      activeLojaId = e.target.value;
      localStorage.setItem('active_loja_id', activeLojaId);
      console.log(`🏬 Loja alterada para: ${activeLojaId}`);
      loadSectorData();
    };
  } catch (err) {
    console.warn('Aviso ao carregar seletor de lojas:', err);
  }
}

// Fechar Modais e Câmeras
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

// ============================================================
// LISTENERS E MANIPULAÇÃO DE EVENTOS
// ============================================================
function setupEvents() {

  // Exportação Excel e PDF
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    reportService.exportToExcel(currentData, currentSector, currentProfile);
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    reportService.exportToPDF(currentData, currentSector, currentProfile);
  });
  
  // Tema Claro / Escuro
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

  // 2. TELA DE LOGIN E CADASTRO DE USUÁRIO
  const btnShowRegister = document.getElementById('btn-show-register');
  const btnShowLogin = document.getElementById('btn-show-login');
  const formLogin = document.getElementById('form-login');
  const formRegisterUser = document.getElementById('form-register-user');

  if (btnShowRegister && btnShowLogin) {
    btnShowRegister.addEventListener('click', () => {
      if (formLogin) formLogin.classList.add('hidden');
      if (formRegisterUser) formRegisterUser.classList.remove('hidden');
    });

    btnShowLogin.addEventListener('click', () => {
      if (formRegisterUser) formRegisterUser.classList.add('hidden');
      if (formLogin) formLogin.classList.remove('hidden');
    });
  }

  // Submit Cadastro de Novo Usuário
  if (formRegisterUser) {
    formRegisterUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await authService.registerUser({
          nome: document.getElementById('reg-user-name').value,
          email: document.getElementById('reg-user-email').value,
          password: document.getElementById('reg-user-password').value
        });

        alert('Conta criada com sucesso!');
        await checkSession();
      } catch (err) {
        alert('Erro ao criar conta: ' + err.message);
      }
    });
  }

  // Submit Login Padrão
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

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await authService.logout();
    localStorage.removeItem('active_loja_id');
    location.reload();
  });

  // Troca de Abas (Bottom Nav)
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      
      const target = e.currentTarget;
      target.classList.add('active');
      
      currentSector = target.dataset.sector;
      console.log('📌 Setor alterado para:', currentSector);

      loadSectorData();
    });
  });

  // Botão Abrir Modal (+ Cadastrar)
  document.getElementById('btn-open-modal')?.addEventListener('click', () => {
    const userRole = (currentProfile.funcao || '').toLowerCase();

    // Bloqueia o perfil ADM de cadastrar produtos
    if (userRole === 'adm' && currentSector !== 'equipe') {
      alert("Atenção: O perfil ADM não tem permissão para inserir novos produtos.");
      return;
    }

    const mEntry = document.getElementById('modal-entry');
    const mEmployee = document.getElementById('modal-employee');

    if (mEntry) mEntry.classList.remove('active');
    if (mEmployee) mEmployee.classList.remove('active');

    if (currentSector === 'equipe') {
      if (mEmployee) mEmployee.classList.add('active');
    } else {
      const entrySector = document.getElementById('entry-sector');
      if (entrySector) entrySector.value = currentSector;
      
      const isValidade = currentSector === 'validade';
      const fieldValidade = document.getElementById('field-group-validity');
      if (fieldValidade) fieldValidade.style.display = isValidade ? 'grid' : 'none';

      if (mEntry) mEntry.classList.add('active');
    }
  });

  // Botões de fechar modais
  document.getElementById('btn-close-modal')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-close-modal-emp')?.addEventListener('click', closeAllModals);

  // Submit Cadastrar Colaborador
  const formEmployee = document.getElementById('form-employee');
  if (formEmployee) {
    formEmployee.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await authService.addEmployee({
          lojaId: activeLojaId || currentProfile.loja_id,
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

  // Consulta de EAN externa
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

        previewImg.src = extProd.imagem_url || DEFAULT_AVATAR;
        previewTitle.textContent = extProd.nome || 'Produto sem nome';
        if (previewBox) previewBox.classList.remove('hidden');
      } else {
        if (previewBox) previewBox.classList.add('hidden');
      }
    });
  }

  // Câmera Scanner
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

  // Submit Lançamento de Produto
  const formEntry = document.getElementById('form-entry');
  if (formEntry) {
    formEntry.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await productService.createEntry({
          lojaId: activeLojaId || currentProfile.loja_id,
          usuarioId: currentProfile.id,
          setor: currentSector,
          ean: document.getElementById('entry-ean').value,
          produtoNome: document.getElementById('entry-product-name').value,
          precoAtual: parseFloat(document.getElementById('entry-price')?.value || 0),
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

// ============================================================
// BUSCA E RENDERIZAÇÃO DOS DADOS
// ============================================================
async function loadSectorData() {
  const container = document.getElementById('product-card-container');
  if (!container) return;

  const lojaAlvo = activeLojaId || currentProfile.loja_id;
  container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Carregando dados...</div>';

  try {
    if (currentSector === 'validade') {
      currentData = await productService.getReguaVencimentos(lojaAlvo);
      renderValidadeCards(currentData, container);
    } else if (currentSector === 'vencidos') {
      currentData = await productService.getProdutosVencidos(lojaAlvo);
      renderValidadeCards(currentData, container);
    } else if (currentSector === 'equipe') {
      currentData = await authService.getTeamMembers(lojaAlvo);
      renderEquipeCards(currentData, container);
    } else {
      currentData = await productService.getRegistrosPerdas(lojaAlvo, currentSector);
      renderPerdasCards(currentData, container);
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--st-7);">Erro ao carregar dados: ${err.message}</div>`;
  }
}

// Cards da Equipe
function renderEquipeCards(members, container) {
  if (!members || members.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum colaborador nesta loja.</div>';
    return;
  }

  container.innerHTML = members.map(user => `
    <div class="product-card">
      <img src="${user.foto_url || DEFAULT_AVATAR}" alt="Avatar" style="border-radius: 50%; object-fit: cover; width: 56px; height: 56px;">
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

// Cards da Régua de Validade e Vencidos (ÚNICA DECLARAÇÃO DA FUNÇÃO)
function renderValidadeCards(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum lote registrado neste setor.</div>';
    return;
  }

  const userRole = (currentProfile.funcao || '').toLowerCase();
  const podeEditarCusto = ['adm', 'administrador'].includes(userRole);

  container.innerHTML = data.map(item => `
    <div class="product-card">
      <img src="${item.imagem_url || item.produtos?.imagem_url || DEFAULT_AVATAR}" alt="Foto">
      <div class="product-info">
        <div class="product-title">${item.produto_nome || item.produtos?.nome || 'Produto Sem Nome'}</div>
        <div class="product-sub">
          <span>Lote: <strong>${item.lote || 'N/A'}</strong></span>
          <span>Qtd: <strong>${item.quantidade} un</strong></span>
        </div>
        <div class="product-sub" style="margin-top: 0.25rem;">
          <span>Preço Venda: <strong>R$ ${parseFloat(item.preco_atual || item.produtos?.preco_atual || 0).toFixed(2)}</strong></span>
        </div>

        ${podeEditarCusto ? `
          <div class="product-sub" style="margin-top:0.35rem;">
            <span style="color:var(--primary); font-weight:bold;">Custo (ADM): R$ </span>
            <input type="number" 
                   step="0.01" 
                   class="input-inline-cost" 
                   data-prod-id="${item.produto_id || item.produtos?.id || item.id}" 
                   value="${item.preco_custo || item.produtos?.preco_custo || '0.00'}" 
                   style="width: 80px; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px; font-weight: bold;" />
          </div>
        ` : ''}
      </div>
      <div>
        <span class="badge-regua ${getBadgeClass(item.status_regua)}">${item.status_regua || 'OK'}</span>
      </div>
    </div>
  `).join('');

  // Adiciona evento blur / Enter para o input de preço de custo
  if (podeEditarCusto) {
    container.querySelectorAll('.input-inline-cost').forEach(input => {
      const salvarCusto = async () => {
        const prodId = input.dataset.prodId;
        const novoValor = input.value;
        try {
          await productService.updatePrecoCusto(prodId, novoValor);
          input.style.borderColor = '#4ade80';
          setTimeout(() => input.style.borderColor = '', 1500);
        } catch (err) {
          alert('Erro ao atualizar preço de custo: ' + err.message);
        }
      };

      input.addEventListener('blur', salvarCusto);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    });
  }
}

// Cards de Perdas (Avarias / Uso Loja)
function renderPerdasCards(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum registro encontrado neste setor.</div>';
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="product-card">
      <img src="${item.produtos?.imagem_url || DEFAULT_AVATAR}" alt="Foto">
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