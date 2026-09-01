import { authService } from './authService.js';
import { productService } from './productService.js';
import { cycleService } from './cycleService.js';
import { reportService } from './reportService.js';
import { supabase } from './supabaseClient.js';

/* ============================================================
   SEÇÃO 1: CONFIGURAÇÕES, CONSTANTES E ESTADOS GLOBAIS
   ============================================================ */

// Avatar SVG de reserva quando o produto/usuário não tem foto
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 24 24' fill='%239ca3af'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

// Variáveis de Estado Globais da Aplicação
let currentProfile = null;
let currentSector = 'validade';
let currentData = [];
let currentCycle = null;
let userLojas = [];
let activeLojaId = localStorage.getItem('active_loja_id') || null;

// Elementos Globais das Telas
let loginScreen = null;
let appScreen = null;

// Evento Principal de Inicialização do DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('📌 DOM carregado. Inicializando ValidaSuper...');
  
  loginScreen = document.getElementById('login-screen');
  appScreen = document.getElementById('app-screen');

  setupEvents();
  checkSession();
});

/* ============================================================
   SEÇÃO 2: GERENCIAMENTO DE SESSÃO E CARREGAMENTO DE CICLOS
   ============================================================ */

// Verifica se existe sessão ativa de usuário e carrega o perfil do banco
async function checkSession() {
  console.log('🔍 Verificando sessão ativa...');

  try {
    currentProfile = await authService.getCurrentProfile();
    console.log('👤 Perfil retornado do banco:', currentProfile);

    if (currentProfile) {
      // SE O USUÁRIO AINDA NÃO TEM LOJA VINCULADA (Onboarding Fluido)
      if (!currentProfile.loja_id && !currentProfile.lojas) {
        const modalOnboarding = document.getElementById('modal-onboarding');
        if (modalOnboarding) {
          modalOnboarding.classList.add('active');
        }
        return; // Interrompe o carregamento até o formulário de onboarding ser enviado
      }

      // Atualiza os seletores e visores da tela
      const elemUser = document.getElementById('display-user-name');
      const elemStore = document.getElementById('display-store-name');

      if (elemUser) elemUser.textContent = currentProfile.nome;
      if (elemStore) elemStore.textContent = currentProfile.lojas?.nome || 'Loja';

      // Calcula Iniciais para a Avatar Badge
      const initialsElem = document.getElementById('user-initials');
      if (initialsElem && currentProfile.nome) {
        const partes = currentProfile.nome.trim().split(/\s+/);
        let iniciais = partes[0][0].toUpperCase();
        if (partes.length > 1) {
          iniciais += partes[partes.length - 1][0].toUpperCase();
        }
        initialsElem.textContent = iniciais;
      }

      // Configura o seletor de loja e o ciclo ativo
      await setupStoreSelector();

      const lojaAlvo = activeLojaId || currentProfile.loja_id;
      currentCycle = await cycleService.getOrCreateActiveCycle(lojaAlvo);
      updateCycleTopbarDisplay();

      // Controle de visibilidade de abas e botões administrativos
      const userRole = (currentProfile.funcao || '').toLowerCase();
      const isAdmin = ['administrador', 'admin'].includes(userRole);

      const btnEquipe = document.getElementById('nav-item-equipe');
      if (btnEquipe) {
        btnEquipe.classList.toggle('hidden', !['administrador', 'admin', 'gestor', 'gerente'].includes(userRole));
      }

      const btnAddStore = document.getElementById('btn-add-new-store');
      const btnEditStore = document.getElementById('btn-open-edit-store');
      if (btnAddStore) btnAddStore.classList.toggle('hidden', !isAdmin);
      if (btnEditStore) btnEditStore.classList.toggle('hidden', !isAdmin);

      // Exibe a interface do aplicativo
      if (loginScreen) loginScreen.classList.add('hidden');
      if (appScreen) appScreen.classList.remove('hidden');
      document.getElementById('bottom-nav')?.classList.remove('hidden');

      console.log('✅ Login e Ciclo carregados com sucesso!');
      loadSectorData();
    } else {
      showLoginScreen();
    }
  } catch (err) {
    console.error('❌ Erro na verificação de sessão:', err);
    showLoginScreen();
  }
}

// Exibe a tela de login e oculta elementos protegidos
function showLoginScreen() {
  if (loginScreen) loginScreen.classList.remove('hidden');
  if (appScreen) appScreen.classList.add('hidden');
  document.getElementById('bottom-nav')?.classList.add('hidden');
  document.getElementById('store-selector-container')?.classList.add('hidden');
}

// Atualiza o Visor do Lote Atual no Topo do App
function updateCycleTopbarDisplay() {
  const elemStore = document.getElementById('display-store-name');
  if (elemStore && currentCycle) {
    elemStore.innerHTML = `
      ${currentProfile.lojas?.nome || 'Loja'} 
      <span style="font-size:0.8rem; background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:6px; margin-left:6px; font-family:var(--font-mono);">
        LOTE: ${currentCycle.codigo_lote} (${currentCycle.status})
      </span>
    `;
  }
}

/* ============================================================
   SEÇÃO 3: SELETOR DE LOJAS MULTI-UNIDADE
   ============================================================ */

async function setupStoreSelector() {
  const container = document.getElementById('store-selector-container');
  const select = document.getElementById('select-active-store');
  if (!container || !select) return;

  try {
    userLojas = [];

    // 1. Busca da tabela associativa usuario_lojas
    const { data: vinculos } = await supabase
      .from('usuario_lojas')
      .select('loja_id, lojas(*)')
      .eq('usuario_id', currentProfile.id);

    if (vinculos && vinculos.length > 0) {
      userLojas = vinculos.map(v => v.lojas).filter(Boolean);
    }

    // 2. BUSCA DE EMERGÊNCIA: Se não encontrou vínculos, busca todas as lojas do banco
    if (userLojas.length === 0) {
      const { data: todasLojas } = await supabase.from('lojas').select('*');
      if (todasLojas) userLojas = todasLojas;
    }

    // 3. Remove duplicatas por ID
    userLojas = userLojas.filter((loja, index, self) =>
      index === self.findIndex((t) => t.id === loja.id)
    );

    console.log(`🏬 Lojas carregadas (${userLojas.length}):`, userLojas);

    // 4. Se houver 2 ou mais lojas, força a exibição do seletor no topo
    if (userLojas.length > 1) {
      select.innerHTML = userLojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');

      // Garante a seleção da loja ativa
      if (activeLojaId && userLojas.some(l => l.id === activeLojaId)) {
        select.value = activeLojaId;
      } else {
        activeLojaId = userLojas[0].id;
        select.value = activeLojaId;
        localStorage.setItem('active_loja_id', activeLojaId);
      }

      container.classList.remove('hidden');
      container.style.display = 'block';

      select.onchange = async (e) => {
        activeLojaId = e.target.value;
        localStorage.setItem('active_loja_id', activeLojaId);

        const lojaSelecionada = userLojas.find(l => l.id === activeLojaId);
        if (lojaSelecionada) currentProfile.lojas = lojaSelecionada;

        currentCycle = await cycleService.getOrCreateActiveCycle(activeLojaId);
        updateCycleTopbarDisplay();
        loadSectorData();
      };
    } else {
      container.classList.add('hidden');
      container.style.display = 'none';
      if (userLojas.length === 1) {
        activeLojaId = userLojas[0].id;
        localStorage.setItem('active_loja_id', activeLojaId);
      }
    }
  } catch (err) {
    console.warn('Aviso ao carregar seletor de lojas:', err);
  }
}

/* ============================================================
   SEÇÃO 4: HANDLERS E CONTROLE DE MODAIS (GLOBAIS)
   ============================================================ */

window.closeAllModals = function() {
  document.querySelectorAll('.modal').forEach(m => {
    m.classList.remove('active');
  });

  const cameraContainer = document.getElementById('camera-container');
  if (cameraContainer) cameraContainer.classList.add('hidden');

  if (typeof window.pararScanner === 'function') {
    try {
      window.pararScanner();
    } catch (e) {
      // Ignora erros
    }
  }
};

window.openEditUserModal = function(id, nome, funcao) {
  window.closeAllModals();

  setTimeout(() => {
    const inputId = document.getElementById('edit-user-id');
    const inputNome = document.getElementById('edit-user-name');
    const inputFuncao = document.getElementById('edit-user-role');
    const modal = document.getElementById('modal-edit-user');

    if (inputId) inputId.value = id;
    if (inputNome) inputNome.value = nome;
    if (inputFuncao) inputFuncao.value = funcao;

    if (modal) {
      modal.classList.add('active');
    }
  }, 30);
};

window.openUserProfileModal = function() {
  window.closeAllModals();

  setTimeout(() => {
    if (!currentProfile) return;

    const inputSelfName = document.getElementById('self-name');
    const inputSelfRole = document.getElementById('self-role');
    const inputStoreName = document.getElementById('profile-store-name');
    const inputStoreCnpj = document.getElementById('profile-store-cnpj');

    if (inputSelfName) inputSelfName.value = currentProfile.nome || '';
    if (inputSelfRole) inputSelfRole.value = (currentProfile.funcao || 'Operador').toUpperCase();
    if (inputStoreName) inputStoreName.value = currentProfile.lojas?.nome || '';
    if (inputStoreCnpj) inputStoreCnpj.value = currentProfile.lojas?.cnpj || '';

    const userRole = (currentProfile.funcao || '').toLowerCase();
    const isAdmin = ['administrador', 'admin'].includes(userRole);

    const btnGestaoLoja = document.getElementById('tab-btn-gestao-loja');
    const btnNovaLoja = document.getElementById('tab-btn-nova-loja');
    if (btnGestaoLoja) btnGestaoLoja.style.display = isAdmin ? 'block' : 'none';
    if (btnNovaLoja) btnNovaLoja.style.display = isAdmin ? 'block' : 'none';

    const modalProfile = document.getElementById('modal-user-profile');
    if (modalProfile) {
      modalProfile.classList.add('active');
    }
  }, 30);
};

/* ============================================================
   SEÇÃO 5: REGISTRO DE EVENTOS E FORMULÁRIOS
   ============================================================ */

function setupEvents() {

  // 1. Instância Única do Formulário Unificado de Loja
  const formOnboarding = document.getElementById('form-onboarding-store');

  // Submit: Formulário de Loja (Criar Nova ou Editar Existente)
  if (formOnboarding) {
    formOnboarding.addEventListener('submit', async (e) => {
      e.preventDefault();

      const storeId = document.getElementById('ob-store-id').value;

      const payloadLoja = {
        nomeLoja: document.getElementById('ob-store-name').value,
        razaoSocial: document.getElementById('ob-razao-social').value,
        cnpj: document.getElementById('ob-store-cnpj').value,
        ie: document.getElementById('ob-store-ie').value,
        logradouro: document.getElementById('ob-logradouro').value,
        numero: document.getElementById('ob-numero').value,
        bairro: document.getElementById('ob-bairro').value,
        cidade: document.getElementById('ob-cidade').value,
        uf: document.getElementById('ob-uf').value.toUpperCase(),
        cep: document.getElementById('ob-cep').value,
        telefone: document.getElementById('ob-telefone').value,
        usuarioId: currentProfile.id
      };

      try {
        if (storeId) {
          // MODO EDIÇÃO
          await authService.updateStore(storeId, {
            nome: payloadLoja.nomeLoja,
            razao_social: payloadLoja.razaoSocial,
            cnpj: payloadLoja.cnpj,
            inscricao_estadual: payloadLoja.ie,
            logradouro: payloadLoja.logradouro,
            numero: payloadLoja.numero,
            bairro: payloadLoja.bairro,
            cidade: payloadLoja.cidade,
            uf: payloadLoja.uf,
            cep: payloadLoja.cep,
            telefone: payloadLoja.telefone
          });
          alert('Dados da loja atualizados com sucesso!');
        } else {
          // MODO CRIAÇÃO DE NOVA LOJA
          const novaLoja = await authService.createStoreForUser(payloadLoja);
          activeLojaId = novaLoja.id;
          localStorage.setItem('active_loja_id', activeLojaId);
          alert(`Unidade "${novaLoja.nome}" criada com sucesso!`);
        }

        window.closeAllModals();
        formOnboarding.reset();

        // Recarrega o perfil e atualiza o seletor no topo
        await checkSession();
      } catch (err) {
        alert('Erro ao salvar loja: ' + err.message);
      }
    });
  }

  // Clique na aba "🏬 Editar Loja": Preenche todos os campos com os dados da loja ativa
  document.getElementById('tab-btn-gestao-loja')?.addEventListener('click', async () => {
    window.closeAllModals();

    const lojaAtivaId = activeLojaId || currentProfile.loja_id;

    // Busca os dados completos da loja no Supabase
    const { data: loja } = await supabase
      .from('lojas')
      .select('*')
      .eq('id', lojaAtivaId)
      .maybeSingle();

    const dados = loja || currentProfile.lojas || {};

    setTimeout(() => {
      document.getElementById('modal-store-form-title').textContent = 'EDITAR DADOS DA UNIDADE';
      document.getElementById('modal-store-form-sub').textContent = 'Altere as informações cadastrais da loja selecionada.';
      document.getElementById('btn-submit-store-form').textContent = 'Salvar Alterações';

      document.getElementById('ob-store-id').value = dados.id || lojaAtivaId;
      document.getElementById('ob-store-name').value = dados.nome || '';
      document.getElementById('ob-razao-social').value = dados.razao_social || '';
      document.getElementById('ob-store-cnpj').value = dados.cnpj || '';
      document.getElementById('ob-store-ie').value = dados.inscricao_estadual || '';
      document.getElementById('ob-logradouro').value = dados.logradouro || '';
      document.getElementById('ob-numero').value = dados.numero || '';
      document.getElementById('ob-bairro').value = dados.bairro || '';
      document.getElementById('ob-cidade').value = dados.cidade || '';
      document.getElementById('ob-uf').value = dados.uf || '';
      document.getElementById('ob-cep').value = dados.cep || '';
      document.getElementById('ob-telefone').value = dados.telefone || '';

      document.getElementById('modal-onboarding')?.classList.add('active');
    }, 50);
  });

  // Clique na aba "➕ Nova Loja": Limpa os campos para criar uma nova loja
  document.getElementById('tab-btn-nova-loja')?.addEventListener('click', () => {
    window.closeAllModals();

    setTimeout(() => {
      if (formOnboarding) formOnboarding.reset();
      document.getElementById('ob-store-id').value = '';

      document.getElementById('modal-store-form-title').textContent = 'CADASTRAR NOVA UNIDADE';
      document.getElementById('modal-store-form-sub').textContent = 'Preencha os dados da nova filial/unidade comercial.';
      document.getElementById('btn-submit-store-form').textContent = 'Criar Nova Unidade';

      document.getElementById('modal-onboarding')?.classList.add('active');
    }, 50);
  });

  // Deletar Colaborador
  document.getElementById('btn-delete-user')?.addEventListener('click', async () => {
    const userId = document.getElementById('edit-user-id').value;
    const userName = document.getElementById('edit-user-name').value;

    if (!userId) return;

    const confirmar = confirm(`⚠️ Tem certeza que deseja excluir o colaborador "${userName}"?\nEsta ação não poderá ser desfeita.`);
    
    if (confirmar) {
      try {
        await authService.deleteEmployee(userId);
        alert('Colaborador removido com sucesso!');
        window.closeAllModals();
        loadSectorData();
      } catch (err) {
        alert('Erro ao excluir colaborador: ' + err.message);
      }
    }
  });

  // Exportações
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    reportService.exportToExcel(currentData, currentSector, currentProfile);
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    reportService.exportToPDF(currentData, currentSector, currentProfile);
  });
  
  // Alternância de Tema Claro / Escuro
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

  // Alternância Login / Registro
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

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await authService.logout();
    localStorage.removeItem('active_loja_id');
    location.reload();
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      
      const target = e.currentTarget;
      target.classList.add('active');
      
      currentSector = target.dataset.sector;
      loadSectorData();
    });
  });

  document.getElementById('btn-open-modal')?.addEventListener('click', () => {
    const userRole = (currentProfile.funcao || '').toLowerCase();

    if (currentCycle && currentCycle.status !== 'EM EDIÇÃO' && currentSector !== 'equipe') {
      alert(`O Lote ${currentCycle.codigo_lote} está com status "${currentCycle.status}" e não permite novos cadastros.`);
      return;
    }

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
          password: document.getElementById('emp-password').value,
          avatarUrl: document.getElementById('emp-avatar').value
        });

        alert('Colaborador cadastrado e conta criada com sucesso!');
        window.closeAllModals();
        formEmployee.reset();
        loadSectorData();
      } catch (err) {
        alert('Erro ao cadastrar colaborador: ' + err.message);
      }
    });
  }

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

  const formEntry = document.getElementById('form-entry');
  if (formEntry) {
    formEntry.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
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
        motivo: document.getElementById('entry-reason')?.value || '',
        forcarInsercao: false
      };

      try {
        let result = await productService.createEntry(payload);

        if (result.isDuplicado) {
          const dup = result.registroExistente;
          const dataHora = new Date(dup.created_at).toLocaleString('pt-BR');
          const quemCadastrou = dup.perfis?.nome || 'Outro Operador';

          const confirmar = confirm(
            `⚠️ ATENÇÃO: PRODUTO JÁ CADASTRADO NESTE LOTE!\n\n` +
            `• Cadastrado por: ${quemCadastrou}\n` +
            `• Local: ${dup.localizacao}\n` +
            `• Data/Hora: ${dataHora}\n` +
            `• Lote: ${dup.lote} | Qtd: ${dup.quantidade} un\n\n` +
            `Deseja adicionar esse produto novamente mesmo assim?`
          );

          if (confirmar) {
            payload.forcarInsercao = true;
            await productService.createEntry(payload);
          } else {
            return;
          }
        }

        window.closeAllModals();
        formEntry.reset();
        const previewBox = document.getElementById('product-preview-box');
        if (previewBox) previewBox.classList.add('hidden');

        loadSectorData();
      } catch (err) {
        alert('Erro ao salvar registro: ' + err.message);
      }
    });
  }

  const formEditUser = document.getElementById('form-edit-user');
  if (formEditUser) {
    formEditUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('edit-user-id').value;
      const nome = document.getElementById('edit-user-name').value;
      const funcao = document.getElementById('edit-user-role').value;

      try {
        await authService.updateUserProfile(userId, {
          nome,
          funcao,
          lojaId: activeLojaId || currentProfile.loja_id
        });
        alert('Perfil atualizado com sucesso!');
        window.closeAllModals();
        loadSectorData();
      } catch (err) {
        alert('Erro ao atualizar usuário: ' + err.message);
      }
    });
  }

  const fSelf = document.getElementById('form-edit-self-profile');

  document.getElementById('tab-btn-meu-perfil')?.addEventListener('click', () => {
    fSelf?.classList.remove('hidden');
  });

  if (fSelf) {
    fSelf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const novoNome = document.getElementById('self-name').value;
      try {
        await authService.updateUserProfile(currentProfile.id, {
          nome: novoNome,
          funcao: currentProfile.funcao,
          lojaId: currentProfile.loja_id
        });
        currentProfile.nome = novoNome;
        alert('Seu nome foi atualizado com sucesso!');
        window.closeAllModals();
        await checkSession();
      } catch (err) {
        alert('Erro ao atualizar perfil: ' + err.message);
      }
    });
  }
}

/* ============================================================
   SEÇÃO 6: CONSULTA E CARREGAMENTO DE DADOS DOS SETORES
   ============================================================ */

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

/* ============================================================
   SEÇÃO 7: COMPONENTES DE RENDERIZAÇÃO DE CARDS (INTERFACE)
   ============================================================ */

function renderEquipeCards(members, container) {
  if (!members || members.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum colaborador nesta loja.</div>';
    return;
  }

  const userRole = (currentProfile.funcao || '').toLowerCase();
  const podeEditar = ['administrador', 'admin', 'gerente'].includes(userRole);

  container.innerHTML = members.map(user => `
    <div class="product-card">
      <img src="${user.foto_url || DEFAULT_AVATAR}" alt="Avatar" style="border-radius: 50%; object-fit: cover; width: 56px; height: 56px;">
      <div class="product-info">
        <div class="product-title">${user.nome}</div>
        <div class="product-sub">
          <span>Função: <strong style="text-transform: capitalize;">${user.funcao}</strong></span>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <span class="badge-regua badge-60" style="font-size: 0.75rem;">Ativo</span>
        ${podeEditar ? `
          <button type="button" class="btn btn-secondary" 
                  onclick="window.openEditUserModal('${user.id}', '${user.nome}', '${user.funcao}')"
                  style="padding: 2px 8px; font-size: 0.75rem;">
            ✏️ Editar
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

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

/* ============================================================
   SEÇÃO 8: MÉTODOS AUXILIARES E UTILITÁRIOS
   ============================================================ */

function getBadgeClass(status) {
  if (!status) return 'badge-60';
  if (status.includes('Crítico')) return 'badge-7';
  if (status.includes('15')) return 'badge-15';
  if (status.includes('30')) return 'badge-30';
  if (status.includes('45')) return 'badge-45';
  if (status.includes('60')) return 'badge-60';
  return 'badge-vencido';
}