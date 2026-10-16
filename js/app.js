import { openAccessAdmin, openPasswordChange, renderCompanyAccess } from './accessAdmin.js';
import { permissionsFor } from './permissions.js';
import { configurarBuscaProduto } from './productLookup.js';
import { lifecycleService } from './lifecycleService.js';
import { initializeLayout } from './layout.js';
import { renderPainel, renderItens } from './lifecycleUI.js';
import * as lifecycleReports from './lifecycleReports.js';
import { authService } from './authService.js';
import { productService } from './productService.js';
import { cycleService } from './cycleService.js';
import { supabase } from './supabaseClient.js';

/* ============================================================
   SEÇÃO 1: CONFIGURAÇÕES, CONSTANTES E ESTADOS GLOBAIS
   ============================================================ */

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 24 24' fill='%239ca3af'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

let currentProfile = null;
let accessContext = null;
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
  initializeLayout();
  checkSession();
});

/* ============================================================
   SEÇÃO 2: GERENCIAMENTO DE SESSÃO E CARREGAMENTO DE CICLOS
   ============================================================ */

async function checkSession() {
  console.log('🔍 Verificando sessão ativa...');

  try {
    currentProfile = await authService.getCurrentProfile();


    if (currentProfile) {
      accessContext = await authService.getAccessContext();
      currentProfile.accessContext = accessContext;
      if (accessContext.dono_app) {
        await supabase.auth.signOut({ scope: 'local' });
        activeLojaId=null; localStorage.removeItem('active_loja_id'); currentData=[];
        showLoginScreen();
        const message=document.getElementById('login-alert'); message.textContent='Seu acesso CEO fica na Área Administrativa, no rodapé.'; message.classList.remove('hidden');
        return;
      }
      if (accessContext.senha_inicial) {
        loginScreen.classList.add('hidden'); appScreen.classList.remove('hidden');
        document.querySelector('.workspace-header').classList.add('hidden'); document.getElementById('bottom-nav').classList.add('hidden');
        document.getElementById('cycle-section-container').classList.add('hidden');
        document.getElementById('btn-access-admin').classList.add('hidden'); document.getElementById('btn-change-password').classList.remove('hidden');
        const gate=document.getElementById('product-card-container'); gate.classList.remove('hidden');
        gate.textContent='Antes de começar, substitua a senha inicial por uma senha pessoal. Ela não será exibida ao CEO.';
        const change=document.createElement('button'); change.type='button'; change.className='btn btn-primary'; change.textContent='Definir minha senha pessoal';
        change.onclick=()=>openPasswordChange(async()=>{window.closeAllModals();await checkSession();}); gate.append(change);
        return;
      }
      document.getElementById('btn-access-admin').classList.toggle('hidden', !accessContext.empresa_admin);
      document.getElementById('btn-access-admin').textContent = 'Liberações';
      document.getElementById('btn-change-password').classList.remove('hidden');
      if (!accessContext.lojas.length) {
        activeLojaId=null; userLojas=[]; localStorage.removeItem('active_loja_id');
        document.getElementById('store-selector-container').classList.add('hidden');
        document.getElementById('store-selector-container').style.display='none';
        loginScreen.classList.add('hidden'); appScreen.classList.remove('hidden');
        document.getElementById('bottom-nav').classList.add('hidden');
        document.querySelector('.workspace-header').classList.add('hidden');
        document.getElementById('cycle-section-container').classList.add('hidden');
        const empty = document.getElementById('product-card-container'); empty.classList.remove('hidden');
        empty.textContent = accessContext.empresa_admin ? 'Nenhuma loja cadastrada. Crie a primeira unidade para começar.' : 'Nenhuma loja liberada para sua conta. Solicite acesso ao administrador.';
        if (accessContext.empresa_admin) {
          const create = document.createElement('button'); create.type='button'; create.className='btn btn-primary'; create.textContent='Criar primeira loja';
          create.onclick=()=>document.getElementById('tab-btn-nova-loja').click(); empty.append(create);
        }
        updateActionPermissions();
        return;
      }
      document.querySelector('.workspace-header').classList.remove('hidden');

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
        btnEquipe.classList.toggle('hidden', !permissionsFor(currentProfile).equipe);
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
    const message=document.getElementById('login-alert'); if(message){message.textContent=err.message;message.classList.remove('hidden');}
  }
}


// Função updateCycleTopbarDisplay limpa e com o console.log no lugar certo
function updateCycleTopbarDisplay() {


  const elLojaNome = document.getElementById('display-loja-nome');
  const elLoteBadge = document.getElementById('display-lote-badge');

  const nomeLoja = currentProfile?.lojas?.nome || userLojas.find(l => l.id === activeLojaId)?.nome || 'Loja';

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

    userLojas = accessContext.lojas;

    if (!userLojas.some(l => l.id === activeLojaId)) activeLojaId = userLojas[0]?.id || null;
    if (activeLojaId) currentProfile.lojas = userLojas.find(l => l.id === activeLojaId);

    userLojas = userLojas.filter((loja, index, self) =>
      index === self.findIndex((t) => t.id === loja.id)
    );

    if (userLojas.length > 1) {
      select.replaceChildren(...userLojas.map(l => { const option=document.createElement('option'); option.value=l.id; option.textContent=l.nome; return option; }));

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

        window.closeAllModals();
        currentCycle = null;
        currentData = [];
        updateCycleTopbarDisplay();
        await loadSectorData();
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
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
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

window.openUserProfileModal = function() {
  window.closeAllModals();

  setTimeout(() => {
    if (!currentProfile) return;

    const inputSelfName = document.getElementById('self-name');
    const inputSelfRole = document.getElementById('self-role');

    if (inputSelfName) inputSelfName.value = currentProfile.nome || '';
    const oldLogin = document.getElementById('self-login');
    if (oldLogin) oldLogin.value = currentProfile.login_display || currentProfile.login || 'Conta existente';
    if (inputSelfRole) inputSelfRole.value = (currentProfile.funcao || 'Operador').toUpperCase();

    const modalProfile = document.getElementById('modal-user-profile');
    if (modalProfile) modalProfile.classList.add('active');
    updateActionPermissions();
  }, 30);
};

window.openRecontagemModal = function(itemId, produtoId, cicloId, nome, lote, qtdAnterior, imgUrl) {
  const userRole = (currentProfile.funcao || '').toLowerCase();
  
  if (!['administrador', 'admin', 'gerente', 'gestor', 'adm'].includes(userRole)) {
    alert("⛔ Apenas perfis de Gestão/Auditoria podem ajustar quantidades.");
    return;
  }

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

  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    if (currentSector !== 'equipe') lifecycleReports.exportLifecycleExcel(currentData, currentProfile);
    else alert('Selecione um módulo operacional para exportar o acompanhamento.');
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    if (currentSector !== 'equipe') lifecycleReports.exportLifecyclePDF(currentData, currentProfile);
    else alert('Selecione um módulo operacional para exportar o acompanhamento.');
  });

  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    if (btnToggleTheme) btnToggleTheme.textContent = '◐';
  }

  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      btnToggleTheme.textContent = '◐';
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  document.getElementById('btn-access-admin').onclick = async () => { try { window.closeAllModals(); await openAccessAdmin(await authService.getAccessContext(), checkSession); } catch(err) { alert(err.message); } };
  document.getElementById('btn-change-password').onclick = () => { window.closeAllModals(); openPasswordChange(async()=>{window.closeAllModals();await checkSession();}); };
  const formLogin = document.getElementById('form-login');

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
          alertBox.textContent = err.status === 400 || err.code === 'invalid_credentials' ? 'Login ou senha incorretos. Tente novamente.' : 'Não foi possível entrar. Verifique a conexão e tente novamente.';
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
      window.closeAllModals();
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

    if (currentSector !== 'equipe' && !permissionsFor(currentProfile).entrada) {
      alert('Seu perfil não permite novos lançamentos.');
      return;
    }

    const mEntry = document.getElementById('modal-entry');
    const mEmployee = document.getElementById('modal-employee');

    if (mEntry) mEntry.classList.remove('active');
    if (mEmployee) mEmployee.classList.remove('active');

    if (currentSector === 'equipe') {
      if (!permissionsFor(currentProfile).equipe) return;
      openAccessAdmin(accessContext, loadSectorData);
    } else {
      document.getElementById('form-entry').reset();
      buscarProdutoLido();
      const entrySector = document.getElementById('entry-sector');
      if (entrySector) entrySector.value = currentSector === 'ciclos' ? 'validade' : currentSector;
      
      const isValidade = ['validade', 'ciclos', 'vencidos'].includes(currentSector);
      document.getElementById('entry-expiration').required = isValidade;
      document.getElementById('entry-expiration-group').classList.toggle('hidden', !isValidade);
      document.getElementById('entry-validity-row').style.gridTemplateColumns = isValidade ? '1fr 1fr' : '1fr';
      const needsReason = ['avarias', 'uso_loja'].includes(currentSector);
      document.getElementById('entry-reason-group').classList.toggle('hidden', !needsReason);
      document.getElementById('entry-reason').required = needsReason;
      document.getElementById('entry-context').textContent = needsReason
        ? 'Entrada na fila de avarias/uso, aguardando destinação. Registre a saída em Movimentar para contabilizá-la. Nome e foto valem para esta entrada.'
        : 'Informe o lote físico do fabricante. O acompanhamento interno é automático; nome e foto valem para esta entrada.';

      if (mEntry) mEntry.classList.add('active');
    }
  });

  const formEntry = document.getElementById('form-entry');
  if (formEntry) {
    formEntry.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (formEntry.dataset.saving === 'true') return;
      formEntry.dataset.saving = 'true';
      const submitEntry = formEntry.querySelector('[type="submit"]');
      if (submitEntry) submitEntry.disabled = true;

      const payload = {
        lojaId: activeLojaId || currentProfile.loja_id,
        usuarioId: currentProfile.id,
        setor: currentSector === 'ciclos' ? 'validade' : currentSector,
        ean: document.getElementById('entry-ean').value,
        produtoNome: document.getElementById('entry-product-name').value,
        precoAtual: parseFloat(document.getElementById('entry-price')?.value || 0),
        imagemUrl: document.getElementById('entry-image-url').value,
        lote: document.getElementById('entry-batch').value,
        quantidade: Number(document.getElementById('entry-qty').value),
        dataVencimento: document.getElementById('entry-expiration').value,
        localizacao: document.getElementById('entry-location').value,
        motivo: document.getElementById('entry-reason')?.value || '',
        forcarInsercao: false
      };

      try {
        let result = await productService.createEntry(payload);

        if (result.isDuplicado) {
          const dup = result.registroExistente;
          const dataHora = new Date(dup.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const quemCadastrou = dup.perfis?.nome || 'Outro Operador';

          const confirmar = confirm(
            `⚠️ ATENÇÃO: PRODUTO JÁ CADASTRADO NESTE LOTE!\n\n` +
            `• Cadastrado por: ${quemCadastrou}\n` +
            `• Local: ${dup.localizacao}\n` +
            `• Data/Hora: ${dataHora}\n` +
            `• Acompanhamento: ${dup.lote} | Lote físico: ${payload.lote} | Qtd: ${dup.quantidade} un\n\n` +
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
      } finally {
        formEntry.dataset.saving = 'false';
        if (submitEntry) submitEntry.disabled = false;
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
          qtdAnterior: Number(document.getElementById('recontagem-qtd-anterior').value),
          qtdNova: Number(document.getElementById('recontagem-qtd-nova').value),
          motivo: document.getElementById('recontagem-motivo').value,
          observacao: document.getElementById('recontagem-obs').value
        });

        alert('✅ Quantidade atualizada e registrada na auditoria com sucesso!');
        window.closeAllModals();

        await loadSectorData();

      } catch (err) {
        alert('Erro ao ajustar quantidade: ' + err.message);
      }
    });
  }


}

/* ============================================================
   SEÇÃO 6: CONSULTA E CARREGAMENTO DE DADOS DOS SETORES
   ============================================================ */

let loadVersion = 0;
let refreshing = false;
async function loadSectorData() {
  const version = ++loadVersion;
  const sector = currentSector;
  const loja = activeLojaId || currentProfile?.loja_id;
  if (!loja || !accessContext?.lojas.length) return;
  const cards = document.getElementById('product-card-container');
  const cycles = document.getElementById('cycle-section-container');
  const container = sector === 'ciclos' ? cycles : cards;
  const viewport = document.getElementById('app-screen');
  const viewKey = loja + ':' + sector;
  const sameView = viewport.dataset.viewKey === viewKey;
  const scrollTop = sameView ? viewport.scrollTop : 0;
  viewport.dataset.viewKey = viewKey;
  cycles?.classList.toggle('hidden', sector !== 'ciclos');
  cards?.classList.toggle('hidden', sector === 'ciclos');
  if (!container) return;
  currentData = [];
  container.textContent = 'Carregando acompanhamento...';
  refreshing = true;
  try {
    updateActionPermissions();
    if (sector === 'equipe') {
      container.className = '';
      if (version !== loadVersion) return;
      await renderCompanyAccess(container, await authService.getAccessContext(), async () => {});
      return;
    }
    const snapshot = await lifecycleService.carregar(loja);
    if (version !== loadVersion) return;
    currentProfile.permissoes = snapshot.api_version === 2 ? snapshot.permissoes : { entrada: false, movimentacao: false, revisao: false, correcao: false, equipe: false };
    updateActionPermissions();
    if (sector === 'ciclos') {
      currentData = snapshot.itens; // Relatório inclui concluídos e transferidos.
      renderPainel(snapshot, container, currentProfile, loadSectorData);
    } else {
      currentData = snapshot.itens.filter(i => {
        if (sector === 'validade') return i.tipo === 'VAL';
        if (sector === 'vencidos') return Boolean(i.vencido_em);
        return i.tipo === (sector === 'avarias' ? 'AV' : 'USO');
      });
      renderSectorItems(currentData, container, sector, loja);
    }
    currentCycle = await cycleService.getOrCreateActiveCycle(loja);
    if (version === loadVersion) updateCycleTopbarDisplay();
    return snapshot;
  } catch (err) {
    if (version === loadVersion) container.textContent = 'Erro ao carregar: ' + err.message;
  } finally { if (version === loadVersion) { refreshing = false; viewport.scrollTop = scrollTop; } }
}
// Atualiza pendências após mudanças de dia/rodada, sem fechar uma operação em andamento.
setInterval(() => {
  if (currentProfile && !refreshing && !document.hidden && !document.querySelector('dialog[open], .modal.active') && currentSector !== 'equipe') loadSectorData();
}, 60000);

function showLoginScreen() {
  accessContext = null;
  document.getElementById('btn-access-admin')?.classList.add('hidden');
  document.getElementById('btn-change-password')?.classList.add('hidden');
  loginScreen?.classList.remove('hidden');
  appScreen?.classList.add('hidden');
  document.getElementById('bottom-nav')?.classList.add('hidden');
  document.getElementById('store-selector-container')?.classList.add('hidden');
  window.closeAllModals();
}








function updateActionPermissions() {
  const p = permissionsFor(currentProfile || {});
  if (accessContext) { p.equipe = accessContext.empresa_admin; p.criarLoja = accessContext.empresa_admin; p.editarLoja = accessContext.empresa_admin && accessContext.lojas.length > 0; }
  const add = document.getElementById('btn-open-modal');
  add.classList.toggle('hidden', currentSector === 'equipe' ? !p.equipe : !p.entrada);
  add.textContent = currentSector === 'equipe' ? '+ Cadastrar colaborador' : '+ Novo lançamento';
  document.getElementById('nav-item-equipe').classList.toggle('hidden', !p.equipe);
  document.getElementById('tab-btn-gestao-loja').classList.toggle('hidden', !p.editarLoja);
  document.getElementById('tab-btn-nova-loja').classList.toggle('hidden', !p.criarLoja);
  const admin = ['administrador', 'admin'].includes(currentProfile?.funcao);
  for (const option of document.querySelectorAll('#emp-role option, #edit-user-role option')) option.disabled = !admin && option.value !== 'operador';
}
const sectorFilters = new Map();
function renderSectorItems(items, container, sector, loja) {
  container.replaceChildren();
  container.className = '';
  const filter = document.createElement('select');
  filter.setAttribute('aria-label', 'Situação dos itens');
  for (const [value, label] of [['ativos', 'Itens ativos com saldo'], ['concluidos', 'Itens concluídos'], ['todos', 'Todos os registros']]) {
    const opt = document.createElement('option'); opt.value = value; opt.textContent = label; filter.append(opt);
  }
  const key = loja + ':' + sector; filter.value = sectorFilters.get(key) || 'ativos';
  const list = document.createElement('div'); container.append(filter, list);
  const selectItems = source => source.filter(i => {
    if (sector === 'validade' && i.tipo !== 'VAL') return false;
    if (sector === 'vencidos' && !i.vencido_em) return false;
    if (sector === 'avarias' && i.tipo !== 'AV') return false;
    if (sector === 'uso_loja' && i.tipo !== 'USO') return false;
    const active = i.status === 'ativo' && i.quantidade > 0;
    if (filter.value === 'concluidos') return !active;
    if (filter.value === 'todos') return true;
    return active && (sector !== 'validade' || !i.vencido_em);
  });
  const render = () => renderItens(selectItems(items), list, currentProfile, loadSectorData, {
    groupBy: sector === 'vencidos' ? 'vencidos' : 'origem', selectItems
  });
  filter.onchange = () => { sectorFilters.set(key, filter.value); render(); }; render();
}
