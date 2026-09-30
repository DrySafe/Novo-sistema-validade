import { lifecycleService } from './lifecycleService.js';
import * as reportService from './lifecycleReports.js';

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
const date = value => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não disponível';

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

function editar(item, revisar, refresh) {
  const modal = dialog((revisar ? 'Revisão de preço — ' : 'Movimentação — ') + item.produto_nome);
  modal.append(node('p', `Lote de origem: ${item.origem_codigo} | Saldo: ${item.quantidade} | Preço: ${money(item.preco_atual)}`));
  if (revisar) modal.append(node('p', 'Registre as saídas ou correções antes de confirmar o saldo. O preço informado deve ser o efetivamente praticado; a referência TOTVS não envia a promoção ao ERP.'));
  const form = node('form');
  const destino = revisar ? null : field(form, 'Tipo de movimentação', null, 'Venda', [
    ...(!item.vencido_em && item.faixa !== 'VENC' ? [['Venda', 'Venda']] : []),
    ['Descarte', 'Descarte'], ['Troca', 'Troca'], ['Bonificação', 'Bonificação'], ['Uso Loja', 'Uso Loja'], ['Avaria', 'Avaria'], ['Correção', 'Correção de contagem']
  ]);
  if (destino && !destino.value) destino.selectedIndex = 0;
  const saldo = field(form, 'Saldo após a operação', 'number', item.quantidade);
  saldo.min = 0; saldo.step = 1; saldo.required = true;
  if (revisar) saldo.readOnly = true;
  const preco = revisar ? field(form, 'Preço praticado (R$)', 'number', item.preco_atual) : null;
  if (preco) { preco.min = 0; preco.step = '0.01'; preco.required = true; }
  const totvs = field(form, 'Referência da promoção / operação TOTVS', 'text', item.origem_codigo);
  const motivo = field(form, 'Justificativa obrigatória', 'text', revisar ? item.pendencias.join(' + ') : ''); motivo.required = true;
  const error = node('p'); error.setAttribute('role', 'alert');
  const save = node('button', 'Confirmar', 'btn btn-primary'); save.type = 'submit';
  form.append(error, save); modal.append(form);
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true; error.textContent = '';
    try {
      await lifecycleService.registrar(item, { destino: revisar ? 'REVISAO' : destino.value, saldo: Number(saldo.value), preco: preco ? Number(preco.value) : null, motivo: motivo.value, totvs: totvs.value });
      modal.close(); await refresh();
    } catch (err) { error.textContent = err.message; save.disabled = false; }
  };
}

function historico(item, profile) {
  const modal = dialog('Histórico — ' + item.produto_nome);
  modal.append(node('p', `Origem: ${item.origem_codigo} | Entrada: ${date(item.entrada_em)} | Dias até vencer na entrada: ${item.dias_entrada ?? 'Não disponível'}`));
  modal.append(node('p', `Quantidade inicial: ${item.quantidade_inicial ?? 'Não disponível'} | Preço inicial: ${money(item.preco_inicial)} | Saldo atual: ${item.quantidade}`));
  if (item.legado) modal.append(node('p', 'Registro anterior à implantação: preços e quantidades históricos ausentes não foram reconstruídos.'));
  if (item.vencido_em) modal.append(node('p', `Vencidos: ${item.lote_vencidos} | Transferência: ${date(item.vencido_em)} | Saldo transferido: ${item.saldo_vencimento}`));
  const list = node('ol');
  for (const e of item.eventos) list.append(node('li', `${new Date(e.ocorrido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${e.tipo} | Faixa ${e.faixa} | Saldo ${e.saldo_anterior} → ${e.saldo_novo} | Preço ${money(e.preco_anterior)} → ${money(e.preco_novo)} | TOTVS: ${e.referencia_totvs || 'Não informado'} | ${e.motivo} | Responsável: ${e.usuario_id || 'Rotina automática'}`));
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
    head.append(node('span', band === 'VENC' ? 'Vencido' : band + ' dias', 'vs-badge vs-band-' + band));
    card.append(head, node('p', `EAN ${item.produtos?.ean || '—'} · Lote ${item.origem_codigo}`, 'vs-meta'));
    const facts = node('dl', undefined, 'vs-facts');
    for (const [label, value] of [['Saldo', `${item.quantidade} un.`], ['Preço praticado', money(item.preco_atual)], ['Validade', date(item.data_vencimento)]]) {
      const fact = node('div'); fact.append(node('dt', label), node('dd', value)); facts.append(fact);
    }
    card.append(facts);
    if (item.vencido_em) card.append(node('p', `Lote diário: ${item.lote_vencidos}`));
    if (item.pendencias.length) card.append(node('strong', 'Pendente: ' + item.pendencias.join(' + '), 'vs-pendente'));
    const actions = node('div', undefined, 'vs-actions');
    if (item.status === 'ativo' && item.quantidade > 0) {
      if (item.tipo === 'VAL' && !item.vencido_em && item.faixa !== 'VENC') {
        const review = button('Revisar saldo e preço', () => editar(item, true, refresh)); review.className = 'btn btn-primary'; actions.append(review);
      }
      actions.append(button('Movimentar', () => editar(item, false, refresh)));
    }
    const history = button('Histórico', () => historico(item, profile)); history.classList.add('btn-quiet');
    actions.append(history); card.append(actions); container.append(card);
  }
}

export function renderPainel(snapshot, container, profile, refresh) {
  container.replaceChildren();
  const active = snapshot.itens.filter(i => i.tipo === 'VAL' && !i.vencido_em && i.status === 'ativo' && i.quantidade > 0);
  const overview = node('div', undefined, 'vs-overview');
  for (const [label, value] of [['Itens acompanhados', active.length], ['Revisões pendentes', active.filter(i => i.pendencias.length).length], ['Unidades com saldo', active.reduce((sum, i) => sum + i.quantidade, 0)]]) {
    const metric = node('div', undefined, 'vs-metric'); metric.append(node('span', label), node('strong', String(value))); overview.append(metric);
  }
  container.append(overview);
  const toolbar = node('div', undefined, 'vs-toolbar');
  const intro = node('div'); intro.append(node('h2', 'Revisões da quinzena'), node('p', `${date(snapshot.rodada.inicio)} a ${date(snapshot.rodada.fim)} · Todos os lotes com saldo`)); toolbar.append(intro);
  const filter = node('select'); filter.setAttribute('aria-label', 'Filtrar acompanhamento');
  for (const [value, label] of [['pendentes', 'Revisões pendentes'], ['todos', 'Todos os itens com saldo']]) { const opt = node('option', label); opt.value = value; filter.append(opt); }
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
  filter.onchange = render; render();
}
