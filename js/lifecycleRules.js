export function hojeBrasil(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(p => p.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function diasAte(date, today = hojeBrasil()) {
  return Math.round((Date.parse(date.slice(0, 10) + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}
export function faixaValidade(date, today = hojeBrasil()) {
  if (!date) return null;
  const days = diasAte(date, today);
  if (days <= 0) return 'VENC';
  for (const limit of [7, 15, 30, 45, 60]) if (days <= limit) return String(limit);
  return '60+';
}
export function pendencias(item, rodada, today = hojeBrasil()) {
  if (item.status !== 'ativo' || item.quantidade <= 0 || item.tipo !== 'VAL' || item.vencido_em || faixaValidade(item.data_vencimento, today) === 'VENC') return [];
  const reasons = [];
  if (item.ultima_rodada !== rodada) reasons.push('Conferência quinzenal');
  if (item.ultima_faixa !== faixaValidade(item.data_vencimento, today)) reasons.push('Revisão da faixa de validade');
  return reasons;
}
export function validarOperacao({ destino, saldo, preco, quantidadeAtual, motivo, vencido }) {
  if (!Number.isSafeInteger(saldo) || saldo < 0) throw new Error('Informe um saldo inteiro não negativo.');
  if (!motivo?.trim()) throw new Error('Informe a justificativa.');
  if (destino === 'Correção' && (motivo.trim().length < 10 || saldo === quantidadeAtual)) throw new Error('Informe um saldo diferente e explique a correção em pelo menos 10 caracteres.');
  if (destino !== 'Correção' && saldo > quantidadeAtual) throw new Error('Saldo maior exige correção de contagem.');
  if (destino === 'REVISAO' && (vencido || saldo !== quantidadeAtual || !Number.isFinite(preco) || preco < 0)) throw new Error('Confirme o saldo e informe um preço válido para revisar.');
  if (destino === 'Venda' && vencido) throw new Error('Não é permitido vender produto vencido.');
  if (!['REVISAO', 'Correção'].includes(destino) && saldo >= quantidadeAtual) throw new Error('Informe uma saída positiva.');
}

export function formatDate(value) {
  if (!value) return 'Não disponível';
  const day = value.includes('T') ? hojeBrasil(new Date(value)) : value.slice(0, 10);
  return day.split('-').reverse().join('/');
}
export function formatTimestamp(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não disponível';
}
export function responsible(event) {
  return event.usuario_nome || (event.responsavel_nome ? event.responsavel_nome + ' (nome atual do perfil)' : event.usuario_id ? 'Usuário ' + event.usuario_id : 'Rotina automática');
}
export function roundLabel(event) {
  return event.rodada_inicio ? `${formatDate(event.rodada_inicio)} a ${formatDate(event.rodada_fim)}` : event.rodada_id || '—';
}
