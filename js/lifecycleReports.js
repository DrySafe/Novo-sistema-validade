const date = value => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não disponível';
export function linhasHistorico(itens) {
  return itens.flatMap(i => i.eventos.map(e => ({
    'EAN': i.produtos?.ean || '', 'Produto': i.produto_nome, 'Lote origem': i.origem_codigo,
    'Entrada': date(i.entrada_em), 'Dias até vencer na entrada': i.dias_entrada ?? 'Não disponível',
    'Ocorrido em': new Date(e.ocorrido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    'Evento': e.tipo, 'Rodada': e.rodada_id || '', 'Faixa': e.faixa || '',
    'Saldo anterior': e.saldo_anterior, 'Saldo novo': e.saldo_novo, 'Quantidade saída': e.quantidade ?? '',
    'Preço anterior': e.preco_anterior ?? 'Não disponível', 'Preço praticado': e.preco_novo ?? 'Não disponível',
    'Referência TOTVS': e.referencia_totvs || '', 'Responsável ID': e.usuario_id || 'Rotina automática', 'Justificativa': e.motivo
  })));
}
export function linhasResumo(itens) {
  const total = (i, tipo) => i.eventos.filter(e => e.tipo === tipo).reduce((sum, e) => sum + (e.quantidade || 0), 0);
  return itens.map(i => ({
    'EAN': i.produtos?.ean || '', 'Produto': i.produto_nome, 'Lote origem': i.origem_codigo,
    'Entrada': date(i.entrada_em), 'Dias até vencer na entrada': i.dias_entrada ?? 'Não disponível',
    'Quantidade inicial': i.quantidade_inicial ?? 'Não disponível', 'Preço inicial': i.preco_inicial ?? 'Não disponível',
    'Preço atual': i.preco_atual ?? 'Não disponível', 'Saldo atual': i.quantidade,
    'Vencimento': date(i.data_vencimento), 'Transferido em': date(i.vencido_em),
    'Lote diário VENC': i.lote_vencidos || '', 'Saldo ao vencer': i.saldo_vencimento ?? '',
    'Vendas registradas': total(i, 'Venda'), 'Descarte': total(i, 'Descarte'), 'Troca': total(i, 'Troca'),
    'Bonificação': total(i, 'Bonificação'), 'Uso Loja': total(i, 'Uso Loja'), 'Avaria': total(i, 'Avaria'),
    'Correção de contagem (saída líquida)': total(i, 'Correção'),
    'Situação': i.quantidade > 0 ? (i.vencido_em ? 'Destinação pendente' : 'Em acompanhamento') : 'Concluído',
    'Histórico anterior indisponível': i.legado ? 'Sim' : 'Não'
  }));
}
export function exportLifecycleExcel(itens, profile) {
  if (!itens.length) return alert('Não há itens para exportar.');
  if (!window.XLSX) return alert('Biblioteca Excel indisponível. Recarregue a página.');
  const wb = window.XLSX.utils.book_new();
  for (const [nome, rows] of [['Resumo', linhasResumo(itens)], ['Eventos', linhasHistorico(itens)]]) {
    const sheet = window.XLSX.utils.json_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, sheet, nome);
  }
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([
    ['Loja', profile.lojas?.nome || ''], ['Emitido por', profile.nome],
    ['Observação', 'Vendas informadas pelo operador. Não há integração automática com TOTVS. Registros legados podem ter histórico incompleto.']
  ]), 'Identificação');
  window.XLSX.writeFile(wb, `Acompanhamento_${Date.now()}.xlsx`);
}
export function exportLifecyclePDF(itens, profile) {
  if (!itens.length) return alert('Não há itens para exportar.');
  if (!window.jspdf?.jsPDF) return alert('Biblioteca PDF indisponível. Recarregue a página.');
  const doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
  itens.forEach((i, index) => {
    if (index) doc.addPage();
    doc.setFontSize(13); doc.text('VALIDASUPER — HISTÓRICO DE ACOMPANHAMENTO', 14, 14);
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(`Loja: ${profile.lojas?.nome || ''} | Responsável: ${profile.nome} | Origem: ${i.origem_codigo} | Produto: ${i.produto_nome}`, 265), 14, 22);
    doc.autoTable({ startY: 35, head: [['Campo', 'Valor']], body: Object.entries(linhasResumo([i])[0]), styles: { fontSize: 8 }, columnStyles: { 0: { cellWidth: 90 } } });
    doc.addPage(); doc.setFontSize(11); doc.text('Eventos — ' + i.origem_codigo, 14, 14);
    doc.autoTable({ startY: 20, head: [['Data / Responsável', 'Evento / Rodada / Faixa', 'Saldo / Saída', 'Preços (R$)', 'TOTVS / Justificativa']],
      body: i.eventos.map(e => [
        `${new Date(e.ocorrido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n${e.usuario_id || 'Rotina automática'}`,
        `${e.tipo}\n${e.rodada_id || '—'}\n${e.faixa || '—'}`,
        `${e.saldo_anterior} → ${e.saldo_novo}\nSaída: ${e.quantidade ?? '—'}`,
        `${e.preco_anterior ?? 'Não disponível'} → ${e.preco_novo ?? 'Não disponível'}`,
        `${e.referencia_totvs || '—'}\n${e.motivo}`
      ]), styles: { fontSize: 7, overflow: 'linebreak' } });
  });
  doc.save(`Acompanhamento_${Date.now()}.pdf`);
}
