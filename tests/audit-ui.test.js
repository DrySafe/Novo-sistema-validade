import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { formatDate, validarOperacao } from '../js/lifecycleRules.js';
import { linhasResumo, linhasHistorico } from '../js/lifecycleReports.js';
import { permissionsFor } from '../js/permissions.js';

test('card mostra edição auditada, confirmação é renovada e operador não tem correção', async () => {
 const dom = new JSDOM('<div id="cards"></div>', { url: 'https://validasuper.test' });
 globalThis.window = dom.window; globalThis.document = dom.window.document;
 window.supabase = { createClient: () => ({}) };
 window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
 window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
 const { renderItens } = await import('../js/lifecycleUI.js');
 const item = { id: 'test', api_version: 2, tipo: 'VAL', status: 'ativo', quantidade: 120, quantidade_inicial: 12, faixa: '60+', pendencias: [], produto_nome: 'Produto', lote_fisico: 'FAB-1', localizacao: 'Depósito', origem_codigo: '03VAL1020260001', data_vencimento: '2026-12-31', eventos: [{ id: 2, tipo: 'Correção', saldo_anterior: 12, saldo_novo: 120, usuario_nome: 'Maria <script>', ocorrido_em: '2026-10-14T12:00:00Z', motivo: 'Correção de digitação' }] };
 const cards = document.getElementById('cards');
 renderItens([item], cards, { funcao: 'operador' }, async () => {});
 assert.match(cards.textContent, /quantidade corrigida/);
 cards.querySelector('.vs-lot-open').click();
 const table = document.querySelector('.vs-lot-dialog');
 assert.match(table.textContent, /12 → 120/);
 assert.match(table.textContent, /Maria <script>/); assert.match(table.textContent, /14\/10\/2026/);
 assert.equal(table.querySelector('script'), null);
 assert.equal(table.querySelector('[aria-label="Corrigir quantidade"]'), null);
 table.close();
 renderItens([item], cards, { funcao: 'administrador' }, async () => {});
 cards.querySelector('.vs-lot-open').click();
 document.querySelector('[aria-label="Corrigir quantidade"]').click();
 const form = document.querySelector('dialog form');
 const checkbox = form.querySelector('[type=checkbox]');
 assert.equal(checkbox.required, true);
 checkbox.checked = true;
 const balance = form.querySelector('[type=number]'); balance.value = 100; balance.dispatchEvent(new window.Event('input'));
 assert.equal(checkbox.checked, false);
 assert.match(form.textContent, /120 para 100/);
 const { lifecycleService } = await import('../js/lifecycleService.js');
 const original = lifecycleService.registrar;
 let calls = 0;
 lifecycleService.registrar = async () => { calls++; };
 try {
  await form.onsubmit(new window.Event('submit', { cancelable: true }));
  assert.equal(calls, 0);
  checkbox.checked = true;
  form.querySelectorAll('input[type=text]')[1].value = 'Conferência física detalhada';
  await form.onsubmit(new window.Event('submit', { cancelable: true }));
  assert.equal(calls, 1);
 } finally { lifecycleService.registrar = original; dom.window.close(); }
});

test('filtro persiste na atualização e não é herdado por outra loja', async () => {
 const dom = new JSDOM('<div id="cards"></div>', { url: 'https://validasuper.test' });
 globalThis.window = dom.window; globalThis.document = dom.window.document;
 window.supabase = { createClient: () => ({}) };
 const { renderPainel } = await import('../js/lifecycleUI.js');
 const cards = document.getElementById('cards');
 const snapshot = { rodada: { inicio: '2026-10-01', fim: '2026-10-15' }, itens: [] };
 renderPainel(snapshot, cards, { loja_id: 'A' }, () => {});
 const filter = cards.querySelector('select'); filter.value = 'todos'; filter.dispatchEvent(new window.Event('change'));
 renderPainel(snapshot, cards, { loja_id: 'A' }, () => {}); assert.equal(cards.querySelector('select').value, 'todos');
 renderPainel(snapshot, cards, { loja_id: 'B' }, () => {}); assert.equal(cards.querySelector('select').value, 'pendentes');
 dom.window.close();
});

test('relatórios distinguem entradas AV de saídas e preservam autor, local e data brasileira', () => {
 const item = { tipo: 'AV', produto_nome: 'Avaria', lote_fisico: 'FAB-1', localizacao: 'Depósito', entrada_em: '2026-10-15T01:00:00Z', quantidade_inicial: 12, quantidade: 10, eventos: [{ tipo: 'Avaria', quantidade: 2, usuario_nome: 'Maria', ocorrido_em: '2026-10-15T01:00:00Z', rodada_inicio: '2026-10-01', rodada_fim: '2026-10-15' }] };
 const summary = linhasResumo([item])[0]; const event = linhasHistorico([item])[0];
 assert.equal(summary['Quantidade entrada em AV'], 12); assert.equal(summary['Avaria (saídas)'], 2);
 assert.equal(summary.Localização, 'Depósito'); assert.equal(summary['Lote físico'], 'FAB-1');
 assert.equal(summary.Entrada, '14/10/2026'); assert.equal(event.Responsável, 'Maria'); assert.match(event.Rodada, /01\/10\/2026 a 15\/10\/2026/);
 assert.equal(formatDate('2026-10-15'), '15/10/2026');
 assert.throws(() => validarOperacao({ destino: 'Correção', quantidadeAtual: 12, saldo: 120, motivo: 'erro' }), /10 caracteres/);
 assert.equal(permissionsFor({ funcao: 'adm' }).entrada, false);
 assert.equal(permissionsFor({ funcao: 'precificacao' }).revisao, true);
});

test('Ciclos explica ausência de pendências e permite consultar lotes com saldo', async () => {
 const dom = new JSDOM('<div id="cards"></div>', { url: 'https://validasuper.test' });
 globalThis.window = dom.window; globalThis.document = dom.window.document;
 window.supabase = { createClient: () => ({}) };
 const { renderPainel } = await import('../js/lifecycleUI.js');
 const container = document.getElementById('cards');
 const profile = { loja_id: 'A' };
 const item = { id: '1', tipo: 'VAL', status: 'ativo', quantidade: 10, pendencias: [], origem_codigo: 'LOTE-1', produto_nome: 'Café', eventos: [] };
 const snapshot = { rodada: { inicio: '2026-10-01', fim: '2026-10-15' }, itens: [item] };
 renderPainel(snapshot, container, profile, async () => {});
 assert.match(container.textContent, /Nenhuma revisão pendente/);
 assert.match(container.textContent, /1 item ativo em 1 lote com saldo/);
 container.querySelector('.vs-panel-empty button').click();
 assert.equal(container.querySelector('select').value, 'todos');
 assert.equal(container.querySelectorAll('article').length, 1);
 renderPainel(snapshot, container, profile, async () => {});
 assert.equal(container.querySelectorAll('article').length, 1);
 renderPainel({ ...snapshot, itens: [] }, container, { loja_id: 'B' }, async () => {});
 assert.match(container.textContent, /Nenhum item VAL ativo com saldo/);
 assert.equal(container.querySelector('.vs-panel-empty button'), null);
 dom.window.close();
});
