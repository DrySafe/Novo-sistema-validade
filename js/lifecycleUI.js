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
  header.append(node('h3', title), button('Fechar', () => modal.close()));
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
  if (corrigir) modal.append(node('p', 'A entrada original será preservada. Esta correção ficará identificada no card e no histórico, com seu nome, data, saldos e justificativa. Corrija o saldo existente hoje, considerando as saídas já registradas.'));
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

export function renderItens(items, container, profile, refresh) {
  container.replaceChildren();
  container.className = 'product-card-list vs-list';
  if (!items.length) { container.append(node('p', 'Nenhum item nesta seção.')); return; }
  for (const item of items) {
    const card = node('article', undefined, 'vs-card');
    const head = node('div', undefined, 'vs-card-head');
    head.append(node('h4', item.produto_nome));
    const band = item.vencido_em ? 'VENC' : item.faixa;
    const concluded = item.quantidade <= 0 || item.status !== 'ativo';
    head.append(node('span', concluded ? 'Concluído' : band === 'VENC' ? 'Vencido' : band ? band + ' dias' : 'Sem validade informada', 'vs-badge vs-band-' + band));
    card.append(head, node('p', `EAN ${item.produtos?.ean || '—'} · Lote físico: ${item.lote_fisico || 'Não registrado'} · Acompanhamento: ${item.origem_codigo} · Local: ${item.localizacao || 'Não informado'}`, 'vs-meta'));
    const facts = node('dl', undefined, 'vs-facts');
    for (const [label, value] of [['Saldo', `${item.quantidade} un.`], ['Preço praticado', money(item.preco_atual)], ['Validade', date(item.data_vencimento)]]) {
      const fact = node('div'); fact.append(node('dt', label), node('dd', value)); facts.append(fact);
    }
    card.append(facts);
    if (item.vencido_em) card.append(node('p', `Lote diário: ${item.lote_vencidos}`));
    if (item.pendencias.length) card.append(node('strong', 'Pendente: ' + item.pendencias.join(' + '), 'vs-pendente'));
    const corrections = (item.eventos || []).filter(e => e.tipo === 'Correção');
    if (corrections.length) {
      const last = corrections.at(-1);
      const audit = node('div', undefined, 'vs-correction');
      audit.append(node('strong', `Quantidade corrigida (${corrections.length} ${corrections.length === 1 ? 'correção' : 'correções'})`),
        node('p', `${last.saldo_anterior} → ${last.saldo_novo} un. por ${responsible(last)}, em ${formatTimestamp(last.ocorrido_em)}`),
        node('p', 'Justificativa: ' + last.motivo));
      card.append(audit);
    }
    const permissions = permissionsFor(profile);
    const actions = node('div', undefined, 'vs-actions');
    if (item.status === 'ativo' && item.quantidade > 0) {
      if (permissions.revisao && item.tipo === 'VAL' && item.data_vencimento && !item.vencido_em && item.faixa !== 'VENC') {
        const review = button('Revisar saldo e preço', () => editar(item, 'REVISAO', refresh)); review.className = 'btn btn-primary'; actions.append(review);
      }
      if (permissions.movimentacao) actions.append(button('Movimentar', () => editar(item, 'MOVIMENTACAO', refresh)));
    }
    if (permissions.correcao && ['ativo', 'esgotado'].includes(item.status)) actions.append(button('Corrigir quantidade', () => editar(item, 'Correção', refresh)));
    const history = button('Histórico', () => historico(item, profile)); history.classList.add('btn-quiet');
    actions.append(history); card.append(actions); container.append(card);
  }
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
    const groups = new Map();
    for (const i of selected) { if (!groups.has(i.origem_codigo)) groups.set(i.origem_codigo, []); groups.get(i.origem_codigo).push(i); }
    if (!groups.size) list.append(node('p', 'Nenhuma revisão pendente nesta seleção.'));
    for (const [codigo, itens] of groups) {
      const section = node('section', undefined, 'vs-lot-section'); section.append(node('h3', 'Lote ' + codigo));
      const cards = node('div'); section.append(cards); renderItens(itens, cards, profile, refresh); list.append(section);
    }
  };
  filter.onchange = () => { panelFilters.set(container, { store, value: filter.value }); render(); }; render();
}
