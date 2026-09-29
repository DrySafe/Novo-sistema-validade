import { authService } from './authService.js';
import { productService } from './productService.js';
import { cycleService } from './cycleService.js';
import { reportService } from './reportService.js';
import { supabase } from './supabaseClient.js';

/* ============================================================
   SEÇÃO 1: CONFIGURAÇÕES, CONSTANTES E ESTADOS GLOBAIS
   ============================================================ */

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 24 24' fill='%239ca3af'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

let currentProfile = null;
let currentSector = 'ciclos';
let currentData = [];
let currentCycle = null;
let userLojas = [];
let activeLojaId = localStorage.getItem('active_loja_id') || null;

let loginScreen = null;
let appScreen = null;

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

async function checkSession() {
  console.log('🔍 Verificando sessão ativa...');

  try {
    currentProfile = await authService.getCurrentProfile();
    console.log('👤 Perfil retornado do banco:', currentProfile);

    if (currentProfile) {
      if (!currentProfile.loja_id && !currentProfile.lojas) {
        const modalOnboarding = document.getElementById('modal-onboarding');
        if (modalOnboarding) modalOnboarding.classList.add('active');
        return;
      }

      const elemUser = document.getElementById('display-user-name');
      if (elemUser) elemUser.textContent = currentProfile.nome;

      const initialsElem = document.getElementById('user-initials');
      if (initialsElem && currentProfile.nome) {
        const partes = currentProfile.nome.trim().split(/\s+/);
        let iniciais = partes[0][0].toUpperCase();
        if (partes.length > 1) {
          iniciais += partes[partes.length - 1][0].toUpperCase();
        }
        initialsElem.textContent = iniciais;
      }

      try {
        await setupStoreSelector();
      } catch (errStore) {
        console.warn("Aviso ao carregar seletor:", errStore);
      }

      const lojaAlvo = activeLojaId || currentProfile.loja_id;

      try {
        currentCycle = await cycleService.getOrCreateActiveCycle(lojaAlvo);
      } catch (errCycle) {
        console.warn("Aviso ao buscar ciclo ativo:", errCycle);
      }

      updateCycleTopbarDisplay();

      const userRole = (currentProfile.funcao || '').toLowerCase();

      const btnEquipe = document.getElementById('nav-item-equipe');
      if (btnEquipe) {
        btnEquipe.classList.toggle('hidden', !['administrador', 'admin', 'gestor', 'gerente'].includes(userRole));
      }

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


// Função updateCycleTopbarDisplay limpa e com o console.log no lugar certo
function updateCycleTopbarDisplay() {
  console.log("ESTRUTURA DO PERFIL:", currentProfile);

  const elLojaNome = document.getElementById('display-loja-nome');
  const elLoteBadge = document.getElementById('display-lote-badge');

  let nomeLoja = 'Hiper Economize';

  if (typeof currentLoja !== 'undefined' && currentLoja && currentLoja.nome) {
    nomeLoja = currentLoja.nome;
  } else {
    const storeSelector = document.getElementById('store-selector');
    if (storeSelector && storeSelector.options && storeSelector.options[storeSelector.selectedIndex]) {
      nomeLoja = storeSelector.options[storeSelector.selectedIndex].text;
    }
  }

  if (elLojaNome) {
    elLojaNome.textContent = nomeLoja;
  }

  if (elLoteBadge && currentCycle) {
    elLoteBadge.textContent = "LOTE: " + currentCycle.codigo_lote + " (" + currentCycle.status + ")";
    elLoteBadge.style.display = 'inline-block';
  } else if (elLoteBadge) {
    elLoteBadge.style.display = 'none';
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

    const { data: vinculos } = await supabase
      .from('usuario_lojas')
      .select('loja_id, lojas(*)')
      .eq('usuario_id', currentProfile.id);

    if (vinculos && vinculos.length > 0) {
      userLojas = vinculos.map(v => v.lojas).filter(Boolean);
    }

    if (userLojas.length === 0) {
      const { data: todasLojas } = await supabase.from('lojas').select('*');
      if (todasLojas) userLojas = todasLojas;
    }

    userLojas = userLojas.filter((loja, index, self) =>
      index === self.findIndex((t) => t.id === loja.id)
    );

    if (userLojas.length > 1) {
      select.innerHTML = userLojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');

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
    } catch (e) {}
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

    if (modal) modal.classList.add('active');
  }, 30);
};

window.openUserProfileModal = function() {
  window.closeAllModals();

  setTimeout(() => {
    if (!currentProfile) return;

    const inputSelfName = document.getElementById('self-name');
    const inputSelfRole = document.getElementById('self-role');

    if (inputSelfName) inputSelfName.value = currentProfile.nome || '';
    if (inputSelfRole) inputSelfRole.value = (currentProfile.funcao || 'Operador').toUpperCase();

    const modalProfile = document.getElementById('modal-user-profile');
    if (modalProfile) modalProfile.classList.add('active');
  }, 30);
};

window.openRecontagemModal = function(itemId, produtoId, cicloId, nome, lote, qtdAnterior, imgUrl) {
  const userRole = (currentProfile.funcao || '').toLowerCase();
  
  if (!['administrador', 'admin', 'gerente', 'gestor', 'adm'].includes(userRole)) {
    alert("⛔ Apenas perfis de Gestão/Auditoria podem ajustar quantidades.");
    return;
  }

  window.simularViradaCicloTeste = async function() {
  const lojaAlvo = activeLojaId || currentProfile.loja_id;
  if (!lojaAlvo) {
    alert("Nenhuma loja ativa selecionada.");
    return;
  }

  if (confirm("🧪 Deseja simular a virada de quinzena agora?\nIsso vai encerrar o lote VAL atual, migrar os vencidos para o lote VENC mantendo o lote de origem, e abrir um novo ciclo.")) {
    try {
      const { data, error } = await supabase.rpc('forcar_virada_ciclo_teste', { p_loja_id: lojaAlvo });
      if (error) throw error;
      
      alert("✅ " + data);
      await checkSession();
    } catch (err) {
      alert("Erro ao simular virada: " + err.message);
    }
  }
};

  window.closeAllModals();

  setTimeout(() => {
    document.getElementById('recontagem-item-id').value = itemId;
    document.getElementById('recontagem-produto-id').value = produtoId;
    document.getElementById('recontagem-ciclo-id').value = cicloId || '';
    document.getElementById('recontagem-qtd-anterior').value = qtdAnterior;
    
    document.getElementById('recontagem-qtd-display').value = qtdAnterior;
    document.getElementById('recontagem-qtd-nova').value = qtdAnterior;

    document.getElementById('recontagem-nome').textContent = nome;
    document.getElementById('recontagem-lote-info').textContent = "Lote/Validade: " + lote;
    document.getElementById('recontagem-img').src = imgUrl || DEFAULT_AVATAR;

    document.getElementById('modal-recontagem')?.classList.add('active');
  }, 50);
};

// Abre o Modal de Baixa Inteligente
window.openBaixaModal = function(itemId, produtoId, nome, loteOrigem, qtd, imgUrl) {
  window.closeAllModals();

  setTimeout(() => {
    document.getElementById('baixa-item-id').value = itemId;
    document.getElementById('baixa-produto-id').value = produtoId;
    document.getElementById('baixa-qtd-atual').value = qtd;

    document.getElementById('baixa-nome').textContent = nome;
    document.getElementById('baixa-lote-info').textContent = `Lote Origem: ${loteOrigem || 'N/A'} | Qtd: ${qtd} un`;
    document.getElementById('baixa-img').src = imgUrl || DEFAULT_AVATAR;

    document.getElementById('modal-baixa')?.classList.add('active');
  }, 50);
};

/* ============================================================
   SEÇÃO 5: REGISTRO DE EVENTOS E FORMULÁRIOS
   ============================================================ */

function setupEvents() {
  const formOnboarding = document.getElementById('form-onboarding-store');

  if (formOnboarding) {
    formOnboarding.addEventListener('submit', async (e) => {
      e.preventDefault();

      const storeId = document.getElementById('ob-store-id').value;
      const payloadLoja = {
        numeroLoja: document.getElementById('ob-store-num')?.value || '01',
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
          await authService.updateStore(storeId, {
            numero_loja: payloadLoja.numeroLoja,
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
          const novaLoja = await authService.createStoreForUser(payloadLoja);
          activeLojaId = novaLoja.id;
          localStorage.setItem('active_loja_id', activeLojaId);
          alert(`Unidade "${novaLoja.nome}" criada com sucesso!`);
        }

        window.closeAllModals();
        formOnboarding.reset();
        await checkSession();
      } catch (err) {
        alert('Erro ao salvar loja: ' + err.message);
      }
    });
  }

  document.getElementById('tab-btn-gestao-loja')?.addEventListener('click', async () => {
    window.closeAllModals();
    const lojaAtivaId = activeLojaId || currentProfile.loja_id;

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
      if (document.getElementById('ob-store-num')) document.getElementById('ob-store-num').value = dados.numero_loja || '01';
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

  document.getElementById('btn-delete-user')?.addEventListener('click', async () => {
    const userId = document.getElementById('edit-user-id').value;
    const userName = document.getElementById('edit-user-name').value;

    if (!userId) return;

    if (confirm(`⚠️ Tem certeza que deseja excluir o colaborador "${userName}"?`)) {
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

  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    reportService.exportToExcel(currentData, currentSector, currentProfile);
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    reportService.exportToPDF(currentData, currentSector, currentProfile);
  });

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
      const alertBox = document.getElementById('login-alert');
      if (alertBox) {
        alertBox.className = 'hidden';
        alertBox.textContent = '';
      }

      try {
        await authService.login(
          document.getElementById('login-email').value,
          document.getElementById('login-password').value
        );
        await checkSession();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = '⚠️ E-mail ou senha incorretos. Tente novamente.';
          alertBox.classList.remove('hidden');
        }
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
      if (entrySector) entrySector.value = currentSector === 'ciclos' ? 'validade' : currentSector;
      
      const isValidade = (currentSector === 'validade' || currentSector === 'ciclos');
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

        alert('Colaborador cadastrado com sucesso!');
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

  const formBaixa = document.getElementById('form-baixa');
  if (formBaixa) {
    formBaixa.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await productService.realizarBaixaProduto({
          itemId: document.getElementById('baixa-item-id').value,
          produtoId: document.getElementById('baixa-produto-id').value,
          tipoBaixa: document.getElementById('baixa-destino').value,
          motivo: document.getElementById('baixa-motivo').value,
          usuarioId: currentProfile.id,
          lojaId: activeLojaId || currentProfile.loja_id,
          qtd: parseInt(document.getElementById('baixa-qtd-atual').value)
        });

        alert('✅ Baixa comercial registrada com sucesso para o TOTVS!');
        window.closeAllModals();
        loadSectorData();
      } catch (err) {
        alert('Erro ao realizar baixa: ' + err.message);
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
        setor: currentSector === 'ciclos' ? 'validade' : currentSector,
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
      try {
        await authService.updateUserProfile(document.getElementById('edit-user-id').value, {
          nome: document.getElementById('edit-user-name').value,
          funcao: document.getElementById('edit-user-role').value,
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

  const formRecontagem = document.getElementById('form-recontagem');
  if (formRecontagem) {
    formRecontagem.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await productService.ajustarQuantidadeLote({
          lojaId: activeLojaId || currentProfile.loja_id,
          usuarioId: currentProfile.id,
          itemId: document.getElementById('recontagem-item-id').value,
          produtoId: document.getElementById('recontagem-produto-id').value,
          cicloLoteId: document.getElementById('recontagem-ciclo-id').value,
          qtdAnterior: parseInt(document.getElementById('recontagem-qtd-anterior').value),
          qtdNova: parseInt(document.getElementById('recontagem-qtd-nova').value),
          motivo: document.getElementById('recontagem-motivo').value,
          observacao: document.getElementById('recontagem-obs').value
        });

        alert('✅ Quantidade atualizada e registrada na auditoria com sucesso!');
        window.closeAllModals();

        const idCicloAtual = document.getElementById('recontagem-ciclo-id').value;
        if (idCicloAtual) {
          window.openCycleDetails(idCicloAtual);
        } else {
          loadSectorData();
        }

      } catch (err) {
        alert('Erro ao ajustar quantidade: ' + err.message);
      }
    });
  }

  document.querySelectorAll('.filter-cycle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-cycle-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      window.renderCycleModalItems(e.target.dataset.filter);
    });
  });
}

/* ============================================================
   SEÇÃO 6: CONSULTA E CARREGAMENTO DE DADOS DOS SETORES
   ============================================================ */

async function loadSectorData() {
  const container = document.getElementById('product-card-container');
  const cycleContainer = document.getElementById('cycle-section-container');
  if (!container) return;

  const lojaAlvo = activeLojaId || currentProfile.loja_id;

  if (currentSector === 'ciclos') {
    if (cycleContainer) cycleContainer.classList.remove('hidden');
    if (container) container.classList.add('hidden');

    cycleContainer.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Carregando painel de ciclos...</div>';

    try {
      const ciclosComMetricas = await cycleService.getCycleMetrics(lojaAlvo);
      renderCiclosCards(ciclosComMetricas, cycleContainer);
    } catch (err) {
      cycleContainer.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--st-7);">Erro ao carregar ciclos: ${err.message}</div>`;
    }
  } else {
    if (cycleContainer) cycleContainer.classList.add('hidden');
    if (container) container.classList.remove('hidden');

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
}

/* ============================================================
   SEÇÃO 7: COMPONENTES DE RENDERIZAÇÃO DE CARDS (INTERFACE)
   ============================================================ */

/* ==========================================================================
   RENDERIZAÇÃO DE CICLOS E CARDS (DOM NATIVO - À PROVA DE ERROS)
   ========================================================================== */

function renderCiclosCards(ciclos, container) {
  if (!ciclos || ciclos.length === 0) {
    container.innerHTML = "";
    const msg = document.createElement("div");
    msg.style.textAlign = "center";
    msg.style.padding = "2rem";
    msg.style.color = "var(--text-muted)";
    msg.textContent = "Nenhum ciclo quinzenal cadastrado para esta loja.";
    container.appendChild(msg);
    return;
  }

  const userRole = (currentProfile.funcao || "").toLowerCase();
  const isAdmin = ["administrador", "admin", "gerente", "gestor"].includes(userRole);

  const ciclosAtivos = ciclos.filter(function(c) { return c.status === "EM EDIÇÃO"; });
  const ciclosArquivados = ciclos.filter(function(c) { return c.status !== "EM EDIÇÃO"; });

  container.innerHTML = "";
  container.style.display = "block";

  const cols = window.innerWidth >= 1024 ? "repeat(2, 1fr)" : "1fr";

  // 1. Seção de Lotes Ativos
  if (ciclosAtivos.length > 0) {
    const secAtivos = document.createElement("div");
    secAtivos.style.marginBottom = "1.5rem";

    const titAtivos = document.createElement("h3");
    titAtivos.style.fontSize = "0.9rem";
    titAtivos.style.textTransform = "uppercase";
    titAtivos.style.color = "var(--text-muted)";
    titAtivos.style.marginBottom = "0.75rem";
    titAtivos.style.fontWeight = "700";
    titAtivos.textContent = "🟢 Lotes Ativos em Edição";

    const gridAtivos = document.createElement("div");
    gridAtivos.style.display = "grid";
    gridAtivos.style.gridTemplateColumns = cols;
    gridAtivos.style.gap = "0.75rem";

    ciclosAtivos.forEach(function(c) {
      gridAtivos.appendChild(renderCardCicloNode(c, true, isAdmin));
    });

    secAtivos.appendChild(titAtivos);
    secAtivos.appendChild(gridAtivos);
    container.appendChild(secAtivos);
  }

  // 2. Seção de Lotes Arquivados
  if (ciclosArquivados.length > 0) {
    const secArq = document.createElement("div");

    const titArq = document.createElement("h3");
    titArq.style.fontSize = "0.9rem";
    titArq.style.textTransform = "uppercase";
    titArq.style.color = "var(--text-muted)";
    titArq.style.marginBottom = "0.75rem";
    titArq.style.fontWeight = "700";
    titArq.style.borderTop = "1px solid var(--border)";
    titArq.style.paddingTop = "1.25rem";
    titArq.textContent = "📁 Lotes Finalizados e Arquivados";

    const gridArq = document.createElement("div");
    gridArq.style.display = "grid";
    gridArq.style.gridTemplateColumns = cols;
    gridArq.style.gap = "0.75rem";

    ciclosArquivados.forEach(function(c) {
      gridArq.appendChild(renderCardCicloNode(c, false, isAdmin));
    });

    secArq.appendChild(titArq);
    secArq.appendChild(gridArq);
    container.appendChild(secArq);
  }
}

/* ==========================================================================
   MÓDULO: RENDERIZAÇÃO DAS ABAS DE VALIDADE, VENCIDOS, USO LOJA E AVARIAS
   (DOM NATIVO - À PROVA DE ERROS DE SINTAXE)
   ========================================================================== */

function renderValidadeCards(registros, container) {
  if (!container) return;

  container.innerHTML = "";

  if (!registros || registros.length === 0) {
    const msg = document.createElement("div");
    msg.style.textAlign = "center";
    msg.style.padding = "2rem";
    msg.style.color = "var(--text-muted)";
    msg.textContent = "Nenhum registro encontrado nesta seção.";
    container.appendChild(msg);
    return;
  }

  container.style.display = "grid";
  container.style.gridTemplateColumns = window.innerWidth >= 1024 ? "repeat(2, 1fr)" : "1fr";
  container.style.gap = "0.75rem";

  registros.forEach(function(item) {
    const card = document.createElement("div");
    card.style.background = "var(--surface-panel)";
    card.style.border = "1px solid var(--border)";
    card.style.borderRadius = "6px";
    card.style.padding = "1rem";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "0.5rem";

    // Linha Superior (Nome do Produto + Badge de Quantidade)
    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.alignItems = "flex-start";

    const prodInfo = document.createElement("div");
    const tit = document.createElement("h4");
    tit.style.margin = "0";
    tit.style.fontSize = "0.95rem";
    tit.style.color = "var(--text-main)";
    tit.style.fontWeight = "700";
    tit.textContent = item.produtos && item.produtos.nome ? item.produtos.nome : "Produto não identificado";

    const ean = document.createElement("span");
    ean.style.fontSize = "0.7rem";
    ean.style.color = "var(--text-muted)";
    ean.style.fontFamily = "var(--font-mono)";
    ean.textContent = "EAN: " + (item.produtos && item.produtos.ean ? item.produtos.ean : "S/EAN");

    prodInfo.appendChild(tit);
    prodInfo.appendChild(ean);

    const qtdBadge = document.createElement("span");
    qtdBadge.style.background = "var(--surface)";
    qtdBadge.style.padding = "0.2rem 0.5rem";
    qtdBadge.style.borderRadius = "4px";
    qtdBadge.style.fontSize = "0.75rem";
    qtdBadge.style.fontWeight = "bold";
    qtdBadge.style.color = "var(--text-main)";
    qtdBadge.style.border = "1px solid var(--border)";
    qtdBadge.textContent = "Qtd: " + (item.quantidade || 0);

    topRow.appendChild(prodInfo);
    topRow.appendChild(qtdBadge);

    // Linha Inferior (Vencimento + Código do Lote)
    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.justifyContent = "space-between";
    bottomRow.style.alignItems = "center";
    bottomRow.style.marginTop = "0.25rem";
    bottomRow.style.fontSize = "0.75rem";
    bottomRow.style.color = "var(--text-muted)";

    const dtVencFormatted = item.data_vencimento 
      ? new Date(item.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR") 
      : "N/A";

    const spanVenc = document.createElement("span");
    spanVenc.textContent = "Vencimento: " + dtVencFormatted;

    const spanLote = document.createElement("span");
    spanLote.textContent = "Lote: " + (item.lote || "N/A");

    bottomRow.appendChild(spanVenc);
    bottomRow.appendChild(spanLote);

    card.appendChild(topRow);
    card.appendChild(bottomRow);

    container.appendChild(card);
  });
}

// Disponibiliza a função globalmente para as chamadas dinâmicas das abas
window.renderValidadeCards = renderValidadeCards;
window.renderPerdasCards = renderPerdasCards;

function renderCardCicloNode(c, isAtivo, isAdmin) {
  const m = c.metricas || { total: 0, d60: 0, d45: 0, d30: 0, d15: 0, d7: 0, vencidos: 0 };
  const dtInicio = new Date(c.created_at).toLocaleDateString("pt-BR");

  const card = document.createElement("div");
  card.style.background = "var(--surface-panel)";
  card.style.border = "1px solid var(--border)";
  card.style.borderLeft = isAtivo ? "4px solid #059669" : "4px solid #64748b";
  card.style.borderRadius = "6px";
  card.style.padding = "1rem";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "0.75rem";

  // Cabeçalho do Card
  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.justifyContent = "space-between";
  top.style.alignItems = "flex-start";

  const info = document.createElement("div");
  const cod = document.createElement("span");
  cod.style.fontSize = "0.7rem";
  cod.style.color = "var(--text-muted)";
  cod.style.fontFamily = "var(--font-mono)";
  cod.textContent = "CÓDIGO: " + c.codigo_lote;

  const tit = document.createElement("h4");
  tit.style.margin = "0.1rem 0";
  tit.style.fontSize = "1rem";
  tit.style.color = "var(--text-main)";
  tit.textContent = isAtivo ? "🟢 LOTE ATUAL EM EDIÇÃO" : "📋 LOTE FINALIZADO";

  const dt = document.createElement("small");
  dt.style.color = "var(--text-muted)";
  dt.style.fontSize = "0.68rem";
  dt.textContent = "Abertura: " + dtInicio;

  info.appendChild(cod);
  info.appendChild(tit);
  info.appendChild(dt);

  const badge = document.createElement("span");
  badge.style.fontSize = "0.65rem";
  badge.style.padding = "2px 8px";
  badge.style.borderRadius = "4px";
  badge.style.fontWeight = "700";
  badge.style.background = isAtivo ? "rgba(5, 150, 105, 0.2)" : "rgba(100, 116, 139, 0.2)";
  badge.style.color = isAtivo ? "#34d399" : "#94a3b8";
  badge.style.border = isAtivo ? "1px solid #059669" : "1px solid #475569";
  badge.textContent = c.status;

  top.appendChild(info);
  top.appendChild(badge);

  // Painel de Métricas
  const panel = document.createElement("div");
  panel.style.background = "var(--surface)";
  panel.style.padding = "0.6rem";
  panel.style.border = "1px solid var(--border)";
  panel.style.borderRadius = "4px";

  const lblMet = document.createElement("div");
  lblMet.style.fontSize = "0.72rem";
  lblMet.style.fontWeight = "bold";
  lblMet.style.marginBottom = "0.4rem";
  lblMet.style.color = "var(--text-main)";
  lblMet.textContent = "VARREDURA DA QUINZENA (" + m.total + " UNIDADES):";

  const gridMet = document.createElement("div");
  gridMet.style.display = "grid";
  gridMet.style.gridTemplateColumns = "repeat(6, 1fr)";
  gridMet.style.gap = "0.25rem";
  gridMet.style.textAlign = "center";

  const arrMet = [
    { txt: "60d\n" + m.d60, bg: "rgba(5, 150, 105, 0.1)", clr: "#047857" },
    { txt: "45d\n" + m.d45, bg: "rgba(29, 78, 216, 0.1)", clr: "#1d4ed8" },
    { txt: "30d\n" + m.d30, bg: "rgba(180, 83, 9, 0.1)", clr: "#b45309" },
    { txt: "15d\n" + m.d15, bg: "rgba(194, 65, 12, 0.1)", clr: "#c2410c" },
    { txt: "7d\n" + m.d7, bg: "rgba(185, 28, 28, 0.1)", clr: "#b91c1c" },
    { txt: "Venc\n" + m.vencidos, bg: "#b91c1c", clr: "#ffffff" }
  ];

  arrMet.forEach(function(item) {
    const box = document.createElement("div");
    box.style.background = item.bg;
    box.style.color = item.clr;
    box.style.padding = "3px 2px";
    box.style.fontSize = "0.65rem";
    box.style.fontWeight = "bold";
    box.style.borderRadius = "3px";
    box.style.whiteSpace = "pre-line";
    box.textContent = item.txt;
    gridMet.appendChild(box);
  });

  panel.appendChild(lblMet);
  panel.appendChild(gridMet);

  // Rodapé e Botões
  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.gap = "0.5rem";
  footer.style.justifyContent = "flex-end";
  footer.style.alignItems = "center";
  footer.style.borderTop = "1px solid var(--border)";
  footer.style.paddingTop = "0.6rem";

  if (isAtivo) {
    const btnVirada = document.createElement("button");
    btnVirada.type = "button";
    btnVirada.className = "btn btn-secondary";
    btnVirada.style.background = "#78350f";
    btnVirada.style.color = "#fde68a";
    btnVirada.style.borderColor = "#92400e";
    btnVirada.style.fontSize = "0.7rem";
    btnVirada.style.padding = "0.3rem 0.6rem";
    btnVirada.textContent = "🧪 Simular Virada";
    btnVirada.onclick = function() { window.simularViradaCicloTeste(); };
    footer.appendChild(btnVirada);
  }

  const btnInsp = document.createElement("button");
  btnInsp.type = "button";
  btnInsp.className = "btn btn-secondary";
  btnInsp.style.fontSize = "0.7rem";
  btnInsp.style.padding = "0.3rem 0.6rem";
  btnInsp.textContent = "🔍 Inspecionar";
  btnInsp.onclick = function() { window.openCycleDetails(c.id); };
  footer.appendChild(btnInsp);

  if (isAtivo && isAdmin) {
    const btnEnc = document.createElement("button");
    btnEnc.type = "button";
    btnEnc.className = "btn btn-primary";
    btnEnc.style.background = "#059669";
    btnEnc.style.fontSize = "0.7rem";
    btnEnc.style.padding = "0.3rem 0.6rem";
    btnEnc.textContent = "🔒 Encerrar";
    btnEnc.onclick = function() { window.finalizarCicloAtual(c.id); };
    footer.appendChild(btnEnc);
  }

  card.appendChild(top);
  card.appendChild(panel);
  card.appendChild(footer);

  return card;
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

// ============================================================
// FUNÇÃO GLOBAL DE SIMULAÇÃO DE VIRADA (TESTE)
// ============================================================
window.simularViradaCicloTeste = async function() {
  const lojaAlvo = activeLojaId || currentProfile.loja_id;
  if (!lojaAlvo) {
    alert("Nenhuma loja ativa selecionada.");
    return;
  }

  if (confirm("🧪 Deseja simular a virada de quinzena agora?\nIsso vai encerrar o lote VAL atual, migrar os vencidos para o lote VENC mantendo o lote de origem, e abrir um novo ciclo.")) {
    try {
      const { data, error } = await supabase.rpc('forcar_virada_ciclo_teste', { p_loja_id: lojaAlvo });
      if (error) throw error;
      
      alert("✅ " + data);
      await checkSession();
    } catch (err) {
      alert("Erro ao simular virada: " + err.message);
    }
  }

  /* ==========================================================================
   MÓDULO: RENDERIZAÇÃO DAS ABAS DE USO LOJA E AVARIAS (renderPerdasCards)
   (DOM NATIVO - À PROVA DE ERROS DE SINTAXE)
   ========================================================================== */

function renderPerdasCards(registros, container) {
  if (!container) return;

  container.innerHTML = "";

  if (!registros || registros.length === 0) {
    const msg = document.createElement("div");
    msg.style.textAlign = "center";
    msg.style.padding = "2rem";
    msg.style.color = "var(--text-muted)";
    msg.textContent = "Nenhum registro encontrado nesta seção.";
    container.appendChild(msg);
    return;
  }

  container.style.display = "grid";
  container.style.gridTemplateColumns = window.innerWidth >= 1024 ? "repeat(2, 1fr)" : "1fr";
  container.style.gap = "0.75rem";

  registros.forEach(function(item) {
    const card = document.createElement("div");
    card.style.background = "var(--surface-panel)";
    card.style.border = "1px solid var(--border)";
    card.style.borderRadius = "6px";
    card.style.padding = "1rem";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "0.5rem";

    // Linha Superior (Nome do Produto + Badge de Quantidade)
    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.alignItems = "flex-start";

    const prodInfo = document.createElement("div");
    const tit = document.createElement("h4");
    tit.style.margin = "0";
    tit.style.fontSize = "0.95rem";
    tit.style.color = "var(--text-main)";
    tit.style.fontWeight = "700";
    tit.textContent = item.produtos && item.produtos.nome ? item.produtos.nome : (item.produto_nome || "Produto não identificado");

    const ean = document.createElement("span");
    ean.style.fontSize = "0.7rem";
    ean.style.color = "var(--text-muted)";
    ean.style.fontFamily = "var(--font-mono)";
    ean.textContent = "EAN: " + (item.produtos && item.produtos.ean ? item.produtos.ean : (item.ean || "S/EAN"));

    prodInfo.appendChild(tit);
    prodInfo.appendChild(ean);

    const qtdBadge = document.createElement("span");
    qtdBadge.style.background = "rgba(225, 29, 72, 0.15)";
    qtdBadge.style.color = "#f43f5e";
    qtdBadge.style.padding = "0.2rem 0.5rem";
    qtdBadge.style.borderRadius = "4px";
    qtdBadge.style.fontSize = "0.75rem";
    qtdBadge.style.fontWeight = "bold";
    qtdBadge.style.border = "1px solid rgba(225, 29, 72, 0.3)";
    qtdBadge.textContent = "Qtd: " + (item.quantidade || 0);

    topRow.appendChild(prodInfo);
    topRow.appendChild(qtdBadge);

    // Linha Inferior (Data do Registro + Motivo/Observação/Lote)
    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.justifyContent = "space-between";
    bottomRow.style.alignItems = "center";
    bottomRow.style.marginTop = "0.25rem";
    bottomRow.style.fontSize = "0.75rem";
    bottomRow.style.color = "var(--text-muted)";

    const dtReg = item.created_at 
      ? new Date(item.created_at).toLocaleDateString("pt-BR") 
      : "N/A";

    const spanData = document.createElement("span");
    spanData.textContent = "Data: " + dtReg;

    const spanLote = document.createElement("span");
    spanLote.textContent = "Lote: " + (item.lote || item.codigo_lote || "N/A");

    bottomRow.appendChild(spanData);
    bottomRow.appendChild(spanLote);

    card.appendChild(topRow);
    card.appendChild(bottomRow);

    container.appendChild(card);
  });
}

// Garante disponibilidade global para chamadas das abas Uso Loja e Avarias
window.renderPerdasCards = renderPerdasCards;
};