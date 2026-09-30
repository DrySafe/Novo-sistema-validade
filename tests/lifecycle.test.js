import test from 'node:test';
import assert from 'node:assert/strict';
import { faixaValidade, pendencias, hojeBrasil, diasAte, validarOperacao } from '../js/lifecycleRules.js';
import { linhasResumo, linhasHistorico } from '../js/lifecycleReports.js';

test('datas seguem São Paulo inclusive na virada UTC', () => {
  assert.equal(hojeBrasil(new Date('2026-10-01T01:00:00Z')), '2026-09-30');
  assert.equal(diasAte('2026-10-01', '2026-09-30'), 1);
});
test('limites da régua e vencimento no próprio dia', () => {
  for (const [date, band] of [['2026-09-29', 'VENC'], ['2026-09-30', 'VENC'], ['2026-10-07', '7'], ['2026-10-08', '15'], ['2026-10-15', '15'], ['2026-10-16', '30'], ['2026-10-30', '30'], ['2026-10-31', '45'], ['2026-11-14', '45'], ['2026-11-15', '60'], ['2026-11-29', '60'], ['2026-11-30', '60+']]) assert.equal(faixaValidade(date, '2026-09-30'), band);
});
test('mudança de faixa e quinzena geram revisão, mesmo em lote anterior', () => {
  const item = { status: 'ativo', quantidade: 100, tipo: 'VAL', data_vencimento: '2026-11-14', ultima_rodada: 'r1', ultima_faixa: '60' };
  assert.equal(pendencias(item, 'r2', '2026-09-30').length, 2);
  assert.equal(pendencias({ ...item, ultima_faixa: '45' }, 'r2', '2026-09-30').length, 1);
  assert.equal(pendencias({ ...item, ultima_faixa: '45' }, 'r1', '2026-09-30').length, 0);
  assert.deepEqual(pendencias({ ...item, quantidade: 0 }, 'r2', '2026-09-30'), []);
  assert.deepEqual(pendencias({ ...item, vencido_em: '2026-09-30' }, 'r2', '2026-09-30'), []);
});
test('revisão não presume vendas e baixas parciais preservam saldo', () => {
  assert.throws(() => validarOperacao({ destino: 'REVISAO', quantidadeAtual: 100, saldo: 70, preco: 8, motivo: 'Revisão' }));
  assert.doesNotThrow(() => validarOperacao({ destino: 'Descarte', quantidadeAtual: 12, saldo: 8, motivo: 'Embalagem danificada' }));
  assert.throws(() => validarOperacao({ destino: 'Venda', quantidadeAtual: 12, saldo: 8, motivo: 'Venda', vencido: true }));
  assert.throws(() => validarOperacao({ destino: 'Correção', quantidadeAtual: 12, saldo: -1, motivo: 'Contagem' }));
});
test('relatório preserva preços, entrada, transferências e destinos distintos', () => {
  const item = { produto_nome: 'Teste', origem_codigo: '03VAL0920260001', entrada_em: '2026-09-01', dias_entrada: 60, quantidade_inicial: 100, preco_inicial: 10, quantidade: 0, saldo_vencimento: 12, eventos: [
    { ocorrido_em: '2026-09-20T12:00:00Z', tipo: 'REVISAO', preco_anterior: 10, preco_novo: 8, saldo_anterior: 12, saldo_novo: 12 },
    { ocorrido_em: '2026-09-30T12:00:00Z', tipo: 'Descarte', quantidade: 4, saldo_anterior: 12, saldo_novo: 8 },
    { ocorrido_em: '2026-09-30T12:10:00Z', tipo: 'Troca', quantidade: 8, saldo_anterior: 8, saldo_novo: 0 }
  ] };
  const row = linhasResumo([item])[0];
  assert.equal(row.Descarte, 4); assert.equal(row.Troca, 8); assert.equal(row['Saldo ao vencer'], 12);
  assert.equal(row['Vendas registradas'], 0); assert.equal(row['Dias até vencer na entrada'], 60);
  assert.equal(linhasHistorico([item])[0]['Preço praticado'], 8);
});
