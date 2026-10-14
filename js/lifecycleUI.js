import { lifecycleService } from './lifecycleService.js';
import * as reportService from './lifecycleReports.js';
import { permissionsFor } from './permissions.js';
import { formatDate as date, formatTimestamp, responsible, roundLabel } from './lifecycleRules.js';

function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function button(text, callback) {
  const el = node('button', text, 'btn btn-secondary');
  el.type = 'button'; el.onclick = callback;
  return el;
}
const money = value => value == null ? 'Não disponível' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const panelFilters = new WeakMap();

function field(form, label, type, value, options) {
  const group = node('div', undefined, 'form-group');
  const input = node(options ? 'select' : 'input');
  input.id = 'vs-' + crypto.randomUUID();
  const title = node('label', label); title.htmlFor = input.id;
  if (options) for (const [key, text] of options) { const opt = node('option', text); opt.value = key; input.append(opt); }
  else input.type = type;
  input.value = value ?? ''; group.append(title, input); form.append(group);
  return input;
}

function dialog(title) {
  const modal = node('dialog', undefined, 'vs-dialog');
  const header = node('div', undefined, 'modal-header');
  const heading = node('h3', title); heading.id = 'dialog-' + crypto.randomUUID();
  modal.setAttribute('aria-labelledby', heading.id);
  header.append(heading, button('Fechar', () => modal.close()));
  modal.append(header);
  modal.addEventListener('close', () => modal.remove());
  document.body.append(modal); modal.showModal();
  return modal;
}

function editar(item, mode, refresh) {
  const revisar = mode === 'REVISAO', corrigir = mode === 'Correção';
  const modal = dialog((revisar ? 'Revisão de preço — ' : corrigir ? 'Correção auditada de quantidade — ' : 'Movimentação — ') + item.produto_nome);
  modal.append(node('p', `Lote de origem: ${item.origem_codigo} | Saldo: ${item.quantidade} | Preço: ${money(item.preco_atual)}`));
  if (revisar) modal.append(node('p', 'Registre as saídas ou correções antes de confirmar o saldo. O preço informado deve ser o efetivamente praticado; a referência TOTVS não envia a promoção ao ERP.'));
  if (mode === 'MOVIMENTACAO') modal.append(node('p', 'Informe uma saída realmente ocorrida. Para corrigir erro de digitação ou contagem, peça uma correção auditada à gestão; isso não deve ser registrado como venda.'));
  const form = node('form');
  if (corrigir) modal.append(node('p', 'A entrada original será preservada. Esta correção ficará identificada na tabela e no histórico, com seu nome, data, saldos e justificativa. Corrija o saldo existente hoje, considerando as saídas já registradas.'));
  const destino = revisar || corrigir ? null : field(form, 'Tipo de movimentação', null, 'Venda', [
    ...(item.tipo === 'VAL' && !item.vencido_em && item.faixa !== 'VENC' ? [['Venda', 'Venda']] : []),
    ['Descarte', 'Descarte'], ['Troca', 'Troca'], ['Bonificação', 'Bonificação'], ['Uso Loja', 'Uso Loja'], ['Avaria', 'Avaria']
  ]);
  if (destino && !destino.value) destino.selectedIndex = 0;
  const saldo = field(form, corrigir ? 'Saldo correto após conferência física' : 'Saldo após a operação', 'number', item.quantidade);
  saldo.min = 0; saldo.step = 1; saldo.required = true;
  if (!revisar && !corrigir) saldo.max = item.quantidade - 1;
  if (revisar) saldo.readOnly = true;
  const preco = revisar ? field(form, 'Preço praticado (R$)', 'number', item.preco_atual) : null;
  if (preco) { preco.min = 0; preco.step = '0.01'; preco.required = true; }
  const totvs = field(form, 'Referência da promoção / operação TOTVS', 'text', item.origem_codigo);
  const motivo = field(form, 'Justificativa obrigatória', 'text', revisar ? item.pendencias.join(' + ') : ''); motivo.required = true;
  let confirm;
  if (corrigir) {
    motivo.minLength = 10;
    const label = node('label', undefined, 'vs-confirm');
    confirm = node('input'); confirm.type = 'checkbox'; confirm.required = true;
    const summary = node('span');
    const update = () => { confirm.checked = false; summary.textContent = `Conferi o saldo e confirmo a alteração de ${item.quantidade} para ${saldo.value || '—'} unidades.`; };
    saldo.addEventListener('input', update); update();
    label.append(confirm, summary); form.append(label);
  }
  const error = node('p'); error.setAttribute('role', 'alert');
  const reload = button('Recarregar dados', async () => { modal.close(); await refresh(); }); reload.hidden = true;
  const save = node('button', 'Confirmar', 'btn btn-primary'); save.type = 'submit';
  form.append(error, reload, save); modal.append(form);
  form.onsubmit = async event => {
    event.preventDefault();
    if (corrigir && (!confirm.checked || Number(saldo.value) === item.quantidade)) { error.textContent = 'Confira e confirme um saldo diferente do atual.'; return; }
    save.disabled = true; error.textContent = '';
    try {
      await lifecycleService.registrar(item, { destino: revisar ? 'REVISAO' : corrigir ? 'Correção' : destino.value, saldo: Number(saldo.value), preco: preco ? Number(preco.value) : null, motivo: motivo.value, totvs: totvs.value });
      modal.close(); await refresh();
    } catch (err) { error.textContent = err.message; reload.hidden = !err.message.includes('Registro alterado'); save.disabled = false; }
  };
}

function historico(item, profile) {
  const modal = dialog('Histórico — ' + item.produto_nome);
  modal.append(node('p', `Origem: ${item.origem_codigo} | Lote físico: ${item.lote_fisico || 'Não registrado'} | Local: ${item.localizacao || 'Não informado'} | Entrada: ${date(item.entrada_em)} | Dias até vencer na entrada: ${item.dias_entrada ?? 'Não disponível'}`));
  modal.append(node('p', `Quantidade inicial: ${item.quantidade_inicial ?? 'Não disponível'} | Preço inicial: ${money(item.preco_inicial)} | Saldo atual: ${item.quantidade}`));
  if (item.legado) modal.append(node('p', 'Registro anterior à implantação: preços e quantidades históricos ausentes não foram reconstruídos.'));
  if (item.vencido_em) modal.append(node('p', `Vencidos: ${item.lote_vencidos} | Transferência: ${date(item.vencido_em)} | Saldo transferido: ${item.saldo_vencimento}`));
  const list = node('ol');
  for (const e of item.eventos) list.append(node('li', `${new Date(e.ocorrido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${e.tipo} | Faixa ${e.faixa || 'Não se aplica'} | Rodada ${roundLabel(e)} | Saldo ${e.saldo_anterior} → ${e.saldo_novo} | Preço ${money(e.preco_anterior)} → ${money(e.preco_novo)} | TOTVS: ${e.referencia_totvs || 'Não informado'} | ${e.motivo} | Responsável: ${responsible(e)}`));
  modal.append(list, button('Excel do histórico', () => reportService.exportLifecycleExcel([item], profile)), button('PDF do histórico', () => reportService.exportLifecyclePDF([item], profile)));
}

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const correctionsOf = item => (item.eventos || []).filter(event => event.tipo === 'Correção');
const lotCode = (item, options) => (options.groupBy === 'vencidos' ? item.lote_vencidos : item.origem_codigo) || item.origem_codigo || 'Lote não identificado';
const itemSearch = item => normalize([item.produto_nome, item.produtos?.ean, item.lote_fisico, item.localizacao, item.origem_codigo].join(' '));

function itemActions(item, profile, refresh) {
  const permissions = permissionsFor(profile);
  const actions = node('div', undefined, 'vs-row-actions');
  const action = (short, label, callback, primary = false) => {
    const el = button(short, callback); el.setAttribute('aria-label', label);
    if (primary) { el.classList.remove('btn-secondary'); el.classList.add('btn-primary'); }
    actions.append(el);
  };
  if (item.status === 'ativo' && item.quantidade > 0) {
    if (permissions.revisao && item.tipo === 'VAL' && item.data_vencimento && !item.vencido_em && item.faixa !== 'VENC') action('Revisar', 'Revisar saldo e preço', () => editar(item, 'REVISAO', refresh), true);
    if (permissions.movimentacao) action('Movimentar', 'Movimentar', () => editar(item, 'MOVIMENTACAO', refresh));
  }
  if (permissions.correcao && ['ativo', 'esgotado'].includes(item.status)) action('Corrigir', 'Corrigir quantidade', () => editar(item, 'Correção', refresh));
  action('Histórico', 'Histórico', () => historico(item, profile));
  return actions;
}

function openLot(code, initialItems, profile, refresh, options) {
  const modal = dialog('Lote ' + code);
  modal.classList.add('vs-lot-dialog');
  let items = initialItems, page = 1;
  const summary = node('p', undefined, 'vs-lot-summary');
  const toolbar = node('div', undefined, 'vs-table-toolbar');
  const search = node('input'); search.type = 'search'; search.placeholder = 'Produto, EAN ou lote físico'; search.setAttribute('aria-label', 'Buscar itens do lote');
  const select = (label, values) => {
    const el = node('select'); el.setAttribute('aria-label', label);
    for (const [value, text] of values) { const opt = node('option', text); opt.value = value; el.append(opt); }
    return el;
  };
  const band = select('Filtrar faixa de validade', [['todos', 'Todas as faixas'], ...['60+', '60', '45', '30', '15', '7'].map(v => [v, v + ' dias']), ['VENC', 'Vencidos'], ['sem', 'Sem validade']]);
  const local = select('Filtrar localização', [['', 'Todos os locais']]);
  const order = select('Ordenar itens', [['validade', 'Validade mais próxima'], ['produto', 'Produto A–Z'], ['saldo', 'Menor saldo']]);
  const size = select('Itens por página', [['25', '25 por página'], ['50', '50 por página'], ['100', '100 por página']]);
  const pendingLabel = node('label', undefined, 'vs-pending-filter');
  const pending = node('input'); pending.type = 'checkbox'; pending.checked = Boolean(options.pendingOnly);
  pendingLabel.append(pending, node('span', 'Somente pendentes'));
  toolbar.append(search, band, local, order, size, pendingLabel);
  const scroll = node('div', undefined, 'vs-table-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Tabela de itens do lote, com rolagem');
  const table = node('table', undefined, 'vs-items-table');
  const caption = node('caption', 'Itens do lote ' + code); caption.className = 'sr-only'; table.append(caption);
  const head = node('thead'); const header = node('tr');
  for (const label of ['Produto / EAN', 'Lote físico / local', 'Validade', 'Saldo', 'Preço', 'Situação / auditoria', 'Ações']) { const th = node('th', label); th.scope = 'col'; header.append(th); }
  head.append(header); table.append(head);
  const body = node('tbody'); table.append(body); scroll.append(table);
  const footer = node('div', undefined, 'vs-pagination');
  const count = node('span'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const previous = button('Anterior', () => { page--; render(); scroll.scrollTop = 0; });
  const next = button('Próxima', () => { page++; render(); scroll.scrollTop = 0; });
  footer.append(count, previous, next);
  const error = node('p'); error.setAttribute('role', 'alert');
  const hint = node('p', 'Em telas pequenas, deslize a tabela para visualizar as outras colunas.', 'vs-table-hint');
  modal.append(summary, toolbar, hint, scroll, footer, error);

  const updateLocals = () => {
    const selected = local.value;
    local.replaceChildren();
    for (const value of ['', ...new Set(items.map(i => i.localizacao).filter(Boolean))]) { const opt = node('option', value || 'Todos os locais'); opt.value = value; local.append(opt); }
    local.value = [...local.options].some(o => o.value === selected) ? selected : '';
  };
  const refreshLot = async () => {
    const snapshot = await refresh();
    if (!modal.isConnected) return;
    if (snapshot?.itens) {
      const source = options.selectItems ? options.selectItems(snapshot.itens) : snapshot.itens;
      items = source.filter(i => lotCode(i, options) === code);
      updateLocals();
    }
    render();
  };
  const render = () => {
    summary.textContent = `${items.length} itens · ${items.reduce((sum, i) => sum + i.quantidade, 0)} unidades · ${items.filter(i => i.pendencias?.length).length} pendentes · ${items.filter(i => correctionsOf(i).length).length} itens com correção`;
    const term = normalize(search.value.trim());
    const selected = items.filter(i => (!term || itemSearch(i).includes(term)) && (band.value === 'todos' || (i.vencido_em ? 'VENC' : i.faixa || 'sem') === band.value) && (!local.value || i.localizacao === local.value) && (!pending.checked || i.pendencias?.length));
    selected.sort((a, b) => order.value === 'produto' ? a.produto_nome.localeCompare(b.produto_nome, 'pt-BR') : order.value === 'saldo' ? a.quantidade - b.quantidade : String(a.data_vencimento || '9999').localeCompare(String(b.data_vencimento || '9999')) || a.produto_nome.localeCompare(b.produto_nome, 'pt-BR'));
    const limit = Number(size.value), pages = Math.max(1, Math.ceil(selected.length / limit));
    page = Math.min(Math.max(1, page), pages);
    const start = (page - 1) * limit;
    body.replaceChildren();
    if (!selected.length) { const row = node('tr'); const cell = node('td', 'Nenhum item corresponde aos filtros.'); cell.colSpan = 7; row.append(cell); body.append(row); }
    for (const item of selected.slice(start, start + limit)) {
      const row = node('tr'); row.dataset.itemId = item.id;
      const product = node('th'); product.scope = 'row'; product.append(node('strong', item.produto_nome), node('small', 'EAN ' + (item.produtos?.ean || '—')));
      const physical = node('td'); physical.append(node('span', item.lote_fisico || 'Não registrado'), node('small', item.localizacao || 'Local não informado'));
      if (options.groupBy === 'vencidos') physical.append(node('small', 'Origem: ' + item.origem_codigo));
      const expiry = node('td'); const bandValue = item.vencido_em ? 'VENC' : item.faixa;
      expiry.append(node('span', date(item.data_vencimento)), node('span', bandValue === 'VENC' ? 'Vencido' : bandValue ? bandValue + ' dias' : 'Sem validade', 'vs-badge vs-band-' + bandValue));
      const balance = node('td', String(item.quantidade), 'vs-number');
      const price = node('td', money(item.preco_atual), 'vs-number');
      const status = node('td');
      status.append(node('span', item.status !== 'ativo' || item.quantidade <= 0 ? 'Concluído' : item.pendencias?.length ? 'Pendente' : 'Conferido', item.pendencias?.length ? 'vs-status-pending' : ''));
      if (item.pendencias?.length) { const reason = node('small', item.pendencias.join(' + ')); status.append(reason); }
      const corrections = correctionsOf(item);
      if (corrections.length) {
        const last = corrections.at(-1), audit = node('details', undefined, 'vs-row-audit');
        audit.append(node('summary', `Corrigido (${corrections.length}) · ${responsible(last)}`), node('p', `${last.saldo_anterior} → ${last.saldo_novo} un. · ${formatTimestamp(last.ocorrido_em)} · ${last.motivo}`)); status.append(audit);
      }
      const actions = node('td'); actions.append(itemActions(item, profile, refreshLot));
      row.append(product, physical, expiry, balance, price, status, actions); body.append(row);
    }
    count.textContent = `${selected.length ? start + 1 : 0}–${Math.min(start + limit, selected.length)} de ${selected.length} itens · Página ${page} de ${pages}`;
    previous.disabled = page === 1; next.disabled = page === pages;
  };
  search.addEventListener('input', () => { page = 1; render(); scroll.scrollTop = 0; });
  for (const el of [band, local, order, size, pending]) el.addEventListener('change', () => { page = 1; render(); scroll.scrollTop = 0; });
  updateLocals(); render();
}

export function renderItens(items, container, profile, refresh, options = {}) {
  container.replaceChildren(); container.className = 'vs-lots';
  if (!items.length) { container.append(node('p', 'Nenhum lote nesta seleção.')); return; }
  const groups = new Map();
  for (const item of items) { const code = lotCode(item, options); if (!groups.has(code)) groups.set(code, []); groups.get(code).push(item); }
  const search = node('input'); search.type = 'search'; search.placeholder = 'Buscar lote, produto ou EAN'; search.setAttribute('aria-label', 'Buscar lotes');
  const list = node('div', undefined, 'vs-lot-grid');
  const footer = node('div', undefined, 'vs-pagination');
  let page = 1;
  const count = node('span'); count.setAttribute('role', 'status');
  const previous = button('Anterior', () => { page--; render(); });
  const next = button('Próxima', () => { page++; render(); });
  footer.append(count, previous, next); container.append(search, list, footer);
  const render = () => {
    const term = normalize(search.value.trim());
    const selected = [...groups].filter(([code, lot]) => !term || normalize(code).includes(term) || lot.some(i => itemSearch(i).includes(term)));
    const pages = Math.max(1, Math.ceil(selected.length / 12)); page = Math.min(Math.max(1, page), pages);
    list.replaceChildren();
    for (const [code, lot] of selected.slice((page - 1) * 12, page * 12)) {
      const card = node('article', undefined, 'vs-card vs-lot-card');
      const open = node('button', undefined, 'vs-lot-open'); open.type = 'button'; open.setAttribute('aria-label', 'Abrir lote ' + code);
      open.append(node('h3', code));
      const pending = lot.filter(i => i.pendencias?.length).length;
      const corrected = lot.filter(i => correctionsOf(i).length).length;
      open.append(node('p', `${lot.length} itens · ${lot.reduce((sum, i) => sum + i.quantidade, 0)} unidades`, 'vs-lot-totals'));
      open.append(node('span', pending ? `${pending} revisões pendentes` : 'Sem revisão pendente', pending ? 'vs-pendente' : 'vs-meta'));
      if (corrected) open.append(node('span', `${corrected} ${corrected === 1 ? 'item com quantidade corrigida' : 'itens com quantidade corrigida'}`, 'vs-lot-corrected'));
      open.append(node('span', 'Abrir tabela de itens →', 'vs-lot-link'));
      open.onclick = () => openLot(code, lot, profile, refresh, options);
      card.append(open); list.append(card);
    }
    if (!selected.length) list.append(node('p', 'Nenhum lote corresponde à busca.'));
    count.textContent = `${selected.length} lotes · Página ${page} de ${pages}`;
    previous.disabled = page === 1; next.disabled = page === pages; footer.hidden = pages === 1;
  };
  search.addEventListener('input', () => { page = 1; render(); }); render();
}

export function renderPainel(snapshot, container, profile, refresh) {
  container.replaceChildren();
  const active = snapshot.itens.filter(i => i.tipo === 'VAL' && !i.vencido_em && i.status === 'ativo' && i.quantidade > 0);
  const overview = node('div', undefined, 'vs-overview');
  for (const [label, value] of [['Itens VAL ativos', active.length], ['Revisões pendentes', active.filter(i => i.pendencias.length).length], ['Unidades VAL com saldo', active.reduce((sum, i) => sum + i.quantidade, 0)]]) {
    const metric = node('div', undefined, 'vs-metric'); metric.append(node('span', label), node('strong', String(value))); overview.append(metric);
  }
  container.append(overview);
  const toolbar = node('div', undefined, 'vs-toolbar');
  const intro = node('div'); intro.append(node('h2', 'Revisões da quinzena'), node('p', `${date(snapshot.rodada.inicio)} a ${date(snapshot.rodada.fim)} · Todos os lotes com saldo`)); toolbar.append(intro);
  const filter = node('select'); filter.setAttribute('aria-label', 'Filtrar acompanhamento');
  for (const [value, label] of [['pendentes', 'Revisões pendentes'], ['todos', 'Todos os itens com saldo']]) { const opt = node('option', label); opt.value = value; filter.append(opt); }
  const store = profile.lojas?.id || profile.loja_id;
  const previous = panelFilters.get(container);
  if (previous && previous.store === store) filter.value = previous.value;
  toolbar.append(filter);
  const list = node('div'); container.append(toolbar, list);
  const render = () => {
    list.replaceChildren();
    const selected = filter.value === 'pendentes' ? active.filter(i => i.pendencias.length) : active;
    if (!selected.length) {
      list.className = 'vs-panel-empty';
      if (active.length) {
        const totalLots = new Set(active.map(i => lotCode(i, {}))).size;
        list.append(node('h3', 'Nenhuma revisão pendente nesta quinzena'), node('p', `${active.length} ${active.length === 1 ? 'item ativo' : 'itens ativos'} em ${totalLots} ${totalLots === 1 ? 'lote com saldo. O lote continua disponível para consulta.' : 'lotes com saldo. Os lotes continuam disponíveis para consulta.'}`));
        list.append(button('Ver todos os lotes com saldo', () => { filter.value = 'todos'; filter.onchange(); }));
      } else {
        list.append(node('h3', 'Nenhum item VAL ativo com saldo'), node('p', 'Este painel acompanha revisões de validade. Consulte Vencidos ou os itens concluídos em Validades para visualizar registros que saíram do acompanhamento.'));
      }
      return;
    }
    const codes = new Set(selected.map(i => i.origem_codigo));
    const lotItems = active.filter(i => codes.has(i.origem_codigo));
    renderItens(lotItems, list, profile, refresh, {
      pendingOnly: filter.value === 'pendentes',
      selectItems: items => items.filter(i => i.tipo === 'VAL' && !i.vencido_em && i.status === 'ativo' && i.quantidade > 0)
    });
  };
  filter.onchange = () => { panelFilters.set(container, { store, value: filter.value }); render(); }; render();
}
