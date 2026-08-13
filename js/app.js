import { authService } from './authService.js';
import { productService } from './productService.js';
import { reportService } from './reportService.js';

let currentProfile = null;
let currentSector = 'validade';
let currentData = [];

// Elementos Globais da Interface
let loginScreen = null;
let appScreen = null;
let modalEntry = null;
let modalEmployee = null;
let userLojas = [];
let activeLojaId = localStorage.getItem('active_loja_id') || null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📌 DOM carregado. Inicializando elementos e eventos...');
  
  loginScreen = document.getElementById('login-screen');
  appScreen = document.getElementById('app-screen');
  modalEntry = document.getElementById('modal-entry');
  modalEmployee = document.getElementById('modal-employee');

  setupEvents();
  checkSession();
});

async function setupStoreSelector(profile) {
  const container = document.getElementById('store-selector-container');
  const select = document.getElementById('select-active-store');
  const userRole = (profile.funcao || '').toLowerCase();

  // Operador NÃO vê o seletor
  if (userRole === 'operador') {
    container.classList.add('hidden');
    activeLojaId = profile.loja_id;
    localStorage.setItem('active_loja_id', activeLojaId);
    return;
  }

  // Buscar lojas que o usuário tem acesso
  let query = supabase.from('usuario_lojas').select('lojas(id, nome)');
  
  if (userRole === 'administrador') {
    // Admin busca todas as lojas cadastradas
    query = supabase.from('lojas').select('id, nome');
  } else {
    query = query.eq('usuario_id', profile.id);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return;

  userLojas = userRole === 'administrador' ? data : data.map(d => d.lojas);

  // Preencher dropdown
  select.innerHTML = userLojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');

  // Manter selecionada a loja do localStorage ou primeira da lista
  if (activeLojaId && userLojas.some(l => l.id === activeLojaId)) {
    select.value = activeLojaId;
  } else {
    activeLojaId = userLojas[0].id;
    select.value = activeLojaId;
    localStorage.setItem('active_loja_id', activeLojaId);
  }

  container.classList.remove('hidden');

  // Evento de troca de loja
  select.addEventListener('change', (e) => {
    activeLojaId = e.target.value;
    localStorage.setItem('active_loja_id', activeLojaId);
    console.log(`🏬 Loja ativa alterada para: ${activeLojaId}`);
    loadSectorData(); // Recarrega produtos da nova loja
  });
}

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

      // ============================================================
      // CONTROLE DE VISIBILIDADE DO BOTÃO EQUIPE POR PERFIL
      // ============================================================
      const btnEquipe = document.getElementById('nav-item-equipe');
      if (btnEquipe) {
        // Converte a função para minúsculas para evitar problemas de grafia
        const userRole = (currentProfile.funcao || '').toLowerCase();
        
        // Perfis permitidos
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

function renderValidadeCards(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum lote registrado neste setor.</div>';
    return;
  }

  const userRole = (currentProfile.funcao || '').toLowerCase();
  const podeEditarCusto = ['adm', 'administrador'].includes(userRole);

  container.innerHTML = data.map(item => `
    <div class="product-card" data-id="${item.produto_id || item.id}">
      <img src="${item.imagem_url || DEFAULT_AVATAR}" alt="Foto">
      <div class="product-info">
        <div class="product-title">${item.produto_nome || item.produtos?.nome || 'Produto Sem Nome'}</div>
        
        <div class="product-sub">
          <span>Qtd: <strong>${item.quantidade} un</strong></span>
          <span>Preço Venda: <strong>R$ ${parseFloat(item.preco_atual || 0).toFixed(2)}</strong></span>
        </div>

        ${podeEditarCusto ? `
          <div class="product-sub" style="margin-top:0.4rem;">
            <span>Custo: </span>
            <span class="inline-cost-wrapper">
              R$ <input type="number" 
                        step="0.01" 
                        class="input-inline-cost" 
                        data-prod-id="${item.produto_id || item.id}" 
                        value="${item.preco_custo || '0.00'}" />
            </span>
          </div>
        ` : ''}
      </div>
      <div>
        <span class="badge-regua ${getBadgeClass(item.status_regua)}">${item.status_regua || 'OK'}</span>
      </div>
    </div>
  `).join('');

  // Eventos para atualização Inline do Preço de Custo
  if (podeEditarCusto) {
    container.querySelectorAll('.input-inline-cost').forEach(input => {
      const salvarCusto = async () => {
        const prodId = input.dataset.prodId;
        const novoValor = input.value;
        try {
          await productService.updatePrecoCusto(prodId, novoValor);
          input.style.borderColor = '#4ade80'; // Feedback verde de sucesso
          setTimeout(() => input.style.borderColor = '', 1500);
        } catch (err) {
          alert('Erro ao atualizar preço de custo: ' + err.message);
        }
      };

      input.addEventListener('blur', salvarCusto);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        }
      });
    });
  }
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

  // Eventos de Exportação Excel e PDF
document.getElementById('btn-export-excel')?.addEventListener('click', () => {
  reportService.exportToExcel(currentData, currentSector, currentProfile);
});

document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
  reportService.exportToPDF(currentData, currentSector, currentProfile);
});
  
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
}

async createEntry(payload) {
  // 1. Busca ou cria o produto na tabela global 'produtos'
  const produtoId = await this.getOrCreateProduto(
    payload.ean, 
    payload.produtoNome, 
    payload.imagemUrl, 
    payload.precoAtual
  );

  // 2. Insere o lote vinculado à LOJA ATIVA do usuário
  if (payload.setor === 'validade') {
    const { error } = await supabase
      .from('lotes_validade')
      .insert({
        loja_id: payload.lojaId,
        produto_id: produtoId,
        lote: payload.lote,
        quantidade: payload.quantidade,
        data_vencimento: payload.dataVencimento,
        localizacao: payload.localizacao,
        usuario_id: payload.usuarioId
      });
    if (error) throw error;
  }
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
    btn.addEventListener('click', async (e) => {
      // Oculta modais ativos ao mudar de aba sem travar o scanner
      document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));

      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      
      // Atualiza o setor ativo global
      currentSector = target.dataset.sector;
      console.log('📌 Setor alterado para:', currentSector);

      loadSectorData();
    });
  });

  // 5. ABERTURA DINÂMICA DO MODAL (+ Cadastrar)
  const btnOpenModal = document.getElementById('btn-open-modal');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      console.log('🚀 Clicou em + Cadastrar no setor:', currentSector);

      // Garante que o modal da equipe e de produtos estejam mapeados
      const mEntry = document.getElementById('modal-entry');
      const mEmployee = document.getElementById('modal-employee');

      // Fecha qualquer modal que porventura estivesse aberto
      if (mEntry) mEntry.classList.remove('active');
      if (mEmployee) mEmployee.classList.remove('active');

      if (currentSector === 'equipe') {
        if (mEmployee) {
          mEmployee.classList.add('active');
        } else {
          console.error('❌ Elemento #modal-employee não encontrado no DOM!');
        }
      } else {
        const entrySector = document.getElementById('entry-sector');
        if (entrySector) entrySector.value = currentSector;
        
        const isValidade = currentSector === 'validade';
        const fieldValidade = document.getElementById('field-group-validity');
        if (fieldValidade) fieldValidade.style.display = isValidade ? 'grid' : 'none';

        if (mEntry) {
          mEntry.classList.add('active');
        } else {
          console.error('❌ Elemento #modal-entry não encontrado no DOM!');
        }
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
          lojaId: activeLojaId || currentProfile.loja_id,
          usuarioId: currentProfile.id,
          setor: currentSector,
          ean: document.getElementById('entry-ean').value,
          produtoNome: document.getElementById('entry-product-name').value,
          precoAtual: parseFloat(document.getElementById('entry-price').value), // 👈 Preço Atual Capturado
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

async function loadSectorData() {
  const container = document.getElementById('product-card-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Carregando lançamentos...</div>';

  try {
    if (currentSector === 'validade') {
      // Chamada correta via productService
      currentData = await productService.getReguaVencimentos(currentProfile.loja_id);
      renderValidadeCards(currentData, container);
    } else if (currentSector === 'vencidos') {
      currentData = await productService.getProdutosVencidos(currentProfile.loja_id);
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

// Avatar SVG de reserva (não depende de internet/servidor externo)
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 24 24' fill='%239ca3af'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

function renderEquipeCards(members, container) {
  if (!members || members.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum colaborador cadastrado nesta loja.</div>';
    return;
  }

  container.innerHTML = members.map(user => `
    <div class="product-card">
      <img src="${user.foto_url || DEFAULT_AVATAR}" 
           alt="Avatar" 
           style="border-radius: 50%; object-fit: cover; width: 56px; height: 56px;">
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

function renderValidadeCards(data, container) {
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum lote registrado neste setor.</div>';
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="product-card">
      <img src="${item.imagem_url || DEFAULT_AVATAR}" alt="Foto">
      <div class="product-info">
        <div class="product-title">${item.produto_nome || item.produtos?.nome || 'Produto Sem Nome'}</div>
        <div class="product-sub">
          <span>Lote: <strong>${item.lote || 'N/A'}</strong></span>
          <span>Qtd: <strong>${item.quantidade} un</strong></span>
        </div>
        <div class="product-sub" style="margin-top: 0.25rem;">
          <span>Venc: <strong>${new Date(item.data_vencimento).toLocaleDateString('pt-BR')}</strong></span>
        </div>
      </div>
      <div>
        <span class="badge-regua ${getBadgeClass(item.status_regua)}">${item.status_regua || 'OK'}</span>
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