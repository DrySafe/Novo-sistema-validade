import { expiryStatus } from './expiryStatus.js';
import { formatDate as date, responsible, roundLabel } from './lifecycleRules.js';
export function linhasHistorico(itens) {
  return itens.flatMap(i => i.eventos.map(e => ({
    'EAN': i.produtos?.ean || '', 'Produto': i.produto_nome, 'Lote físico': i.lote_fisico || 'Não registrado', 'Localização': i.localizacao || 'Não informado', 'Tipo de entrada': i.tipo || 'VAL', 'Lote origem': i.origem_codigo,
    'Entrada': date(i.entrada_em), 'Dias até vencer na entrada': i.dias_entrada ?? 'Não disponível',
    'Ocorrido em': new Date(e.ocorrido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    'Evento': e.tipo, 'Rodada': roundLabel(e), 'Faixa': e.faixa || '',
    'Saldo anterior': e.saldo_anterior, 'Saldo novo': e.saldo_novo, 'Quantidade saída': e.quantidade ?? '',
    'Preço anterior': e.preco_anterior ?? 'Não disponível', 'Preço praticado': e.preco_novo ?? 'Não disponível',
    'Referência TOTVS': e.referencia_totvs || '', 'Responsável': responsible(e), 'Cargo no evento': e.usuario_funcao || 'Não registrado', 'Responsável ID': e.usuario_id || 'Rotina automática', 'Justificativa': e.motivo
  })));
}
export function linhasResumo(itens) {
  const total = (i, tipo) => i.eventos.filter(e => e.tipo === tipo).reduce((sum, e) => sum + (e.quantidade || 0), 0);
  return itens.map(i => ({
    'EAN': i.produtos?.ean || '', 'Produto': i.produto_nome, 'Lote físico': i.lote_fisico || 'Não registrado', 'Localização': i.localizacao || 'Não informado', 'Tipo de entrada': i.tipo || 'VAL', 'Lote origem': i.origem_codigo,
    'Entrada': date(i.entrada_em), 'Dias até vencer na entrada': i.dias_entrada ?? 'Não disponível',
    'Quantidade inicial': i.quantidade_inicial ?? 'Não disponível', 'Preço inicial': i.preco_inicial ?? 'Não disponível',
    'Quantidade entrada em AV': i.tipo === 'AV' ? i.quantidade_inicial ?? 'Não disponível' : 0,
    'Quantidade entrada em USO': i.tipo === 'USO' ? i.quantidade_inicial ?? 'Não disponível' : 0,
    'Preço atual': i.preco_atual ?? 'Não disponível', 'Saldo atual': i.quantidade,
    'Dias restantes hoje': expiryStatus(i).days ?? 'Não disponível', 'Vencimento': date(i.data_vencimento), 'Transferido em': date(i.vencido_em),
    'Lote diário VENC': i.lote_vencidos || '', 'Saldo ao vencer': i.saldo_vencimento ?? '',
    'Vendas registradas': total(i, 'Venda'), 'Descarte': total(i, 'Descarte'), 'Troca': total(i, 'Troca'),
    'Bonificação': total(i, 'Bonificação'), 'Uso Loja (saídas)': total(i, 'Uso Loja'), 'Avaria (saídas)': total(i, 'Avaria'),
    'Correção de contagem (saída líquida)': total(i, 'Correção'),
    'Número de correções': i.eventos.filter(e => e.tipo === 'Correção').length,
    'Última correção por': i.eventos.filter(e => e.tipo === 'Correção').at(-1) ? responsible(i.eventos.filter(e => e.tipo === 'Correção').at(-1)) : '',
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
    ['Observação', 'Vendas informadas pelo operador. Não há integração automática com TOTVS. Entradas em AV/USO aguardam destinação e não são somadas às saídas. Correções preservam a entrada original. Registros legados podem ter histórico incompleto.']
  ]), 'Identificação');
  window.XLSX.writeFile(wb, `Acompanhamento_${Date.now()}.xlsx`);
}
// O PDF é gerencial; o histórico completo permanece no app e no Excel.
const number = value => Number(value).toLocaleString('pt-BR');
const quantity = value => value == null ? 'N/D' : number(value);
const price = value => value == null ? 'N/D' : Number(value).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
export function resumoGerencial(itens) {
  const rows = itens.map(item => {
    const events = item.eventos || [];
    const total = types => events.filter(e => types.includes(e.tipo)).reduce((sum, e) => sum + Number(e.quantidade || 0), 0);
    const corrections = events.filter(e => e.tipo === 'Correção');
    const adjustment = corrections.reduce((sum, e) => sum + (e.saldo_novo != null && e.saldo_anterior != null ? Number(e.saldo_novo) - Number(e.saldo_anterior) : -Number(e.quantidade || 0)), 0);
    const sales = total(['Venda']), losses = total(['Descarte', 'Avaria']), other = total(['Troca', 'Bonificação', 'Uso Loja']);
    const initial = item.quantidade_inicial == null ? null : Number(item.quantidade_inicial);
    const balance = Number(item.quantidade);
    const partial = Boolean(item.legado) || initial == null || initial + adjustment - sales - losses - other !== balance;
    const status = balance <= 0 ? 'Concluído' : expiryStatus(item).band === 'VENC' ? 'Vencido: destinar' : item.pendencias?.length ? 'Conferência pendente' : 'Em acompanhamento';
    return {item, initial, sales, losses, other, adjustment, balance, partial, status};
  });
  const sum = key => rows.reduce((total, row) => total + (row[key] || 0), 0);
  const partial = rows.some(row => row.partial);
  const base = sum('initial') + sum('adjustment');
  return {rows, sales:sum('sales'), losses:sum('losses'), other:sum('other'), balance:sum('balance'), partial,
    soldPercent: !partial && base > 0 ? sum('sales') / base * 100 : null};
}
export function exportLifecyclePDF(itens, profile, options = {}) {
  if (!itens.length) return alert('Não há itens para exportar.');
  if (!window.jspdf?.jsPDF) return alert('Biblioteca PDF indisponível. Recarregue a página.');
  const doc = new window.jspdf.jsPDF({ orientation: 'landscape', format:'a4', compress:true });
  const width = 269, bottom = 194;
  const summary = resumoGerencial(itens);
  const groups = new Map();
  for (const row of summary.rows) {
    const code = (options.groupBy === 'vencidos' ? row.item.lote_vencidos : row.item.origem_codigo) || row.item.origem_codigo || 'Lote não identificado';
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(row);
  }
  const generated = new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'});
  const header = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(19,121,104);
    doc.text('VALIDASUPER - RESUMO POR LOTE', 14, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(45,55,65);
    doc.text(doc.splitTextToSize('Loja: ' + (profile.lojas?.nome || 'Não informada') + ' | Emitido por: ' + (profile.nome || 'Não informado'), width).slice(0,2),14,19);
    doc.text('Emissão: ' + generated + ' | Quantidades em unidades; preços em R$.',14,29);
  };
  header();
  const headedPages = new Set([1]);
  doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(`${itens.length} itens | ${groups.size} lotes | Saldo: ${number(summary.balance)} | Vendas registradas: ${number(summary.sales)} | Perdas: ${number(summary.losses)} | Outras saídas: ${number(summary.other)}`,14,37);
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  const note = summary.soldPercent == null ? 'Percentual vendido: não disponível (histórico parcial ou sem base de entrada).' : 'Vendido: ' + summary.soldPercent.toLocaleString('pt-BR',{maximumFractionDigits:1}) + '% das entradas ajustadas por correções.';
  doc.text(note,14,43);
  const legend = 'Perdas = descarte + avaria registrados. Outras saídas = troca + bonificação + uso da loja. Ajuste = correção de contagem (+/-).';
  doc.text(legend,14,49);
  doc.text('Vencido com saldo ainda aguarda destinação; não é baixa automática. * Histórico parcial: totais de saídas podem estar incompletos.',14,54);
  let y = 62;
  for (const [code, rows] of groups) {
    const titleLines = doc.splitTextToSize('Lote: ' + code + ' | ' + rows.length + ' itens | Saldo: ' + number(rows.reduce((sum,r)=>sum+r.balance,0)),width);
    const titleHeight = titleLines.length * 4 + 3;
    if (y + titleHeight + 20 > bottom) { doc.addPage(); header(); headedPages.add(doc.internal.getCurrentPageInfo().pageNumber); y = 38; }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(titleLines,14,y); doc.setFont('helvetica','normal');
    doc.autoTable({startY:y+titleHeight,margin:{top:38,bottom:16,left:14,right:14},theme:'grid',
      head:[['Produto / EAN','Lote físico / local','Validade','Entrada','Vendas','Perdas','Outras saídas','Ajuste','Saldo','Preço atual','Situação']],
      body:[...rows].sort((a,b)=>String(a.item.data_vencimento||'9999').localeCompare(String(b.item.data_vencimento||'9999')) || String(a.item.produto_nome).localeCompare(String(b.item.produto_nome),'pt-BR')).map(r=>[
        (r.item.produto_nome || 'Não informado') + (r.item.produtos?.ean ? '\n' + r.item.produtos.ean : ''),
        (r.item.lote_fisico || 'Não registrado') + '\n' + (r.item.localizacao || 'Local não informado') + (options.groupBy==='vencidos' ? '\nOrigem: '+r.item.origem_codigo : ''),
        r.item.data_vencimento ? date(r.item.data_vencimento) + '\n' + expiryStatus(r.item).text : 'Sem validade', quantity(r.initial), number(r.sales), number(r.losses), number(r.other), (r.adjustment>0?'+':'')+number(r.adjustment), number(r.balance), price(r.item.preco_atual), r.status + (r.partial?' *':'') + ((r.item.eventos||[]).some(e=>e.tipo==='Correção')?'\nQuantidade corrigida':'')
      ]),
      styles:{fontSize:8,cellPadding:2,overflow:'linebreak',valign:'middle'},headStyles:{fillColor:[19,121,104]},
      columnStyles:{0:{cellWidth:47},1:{cellWidth:42},2:{cellWidth:21},3:{cellWidth:16,halign:'right'},4:{cellWidth:16,halign:'right'},5:{cellWidth:16,halign:'right'},6:{cellWidth:18,halign:'right'},7:{cellWidth:16,halign:'right'},8:{cellWidth:16,halign:'right'},9:{cellWidth:21,halign:'right'},10:{cellWidth:40}},
      rowPageBreak:'avoid',
      willDrawPage: () => { const page = doc.internal.getCurrentPageInfo().pageNumber; if (!headedPages.has(page)) { header(); headedPages.add(page); doc.setFontSize(8); doc.text(doc.splitTextToSize('Lote: '+code,width).slice(0,1),14,35); } },
      didParseCell: data => { if(data.section==='body' && data.column.index===10 && data.cell.raw.startsWith('Vencido:'))data.cell.styles.textColor=[170,45,45]; }
    });
    y = doc.lastAutoTable.finalY + 10;
  }
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){
    doc.setPage(page);doc.setFontSize(8);doc.setTextColor(80,90,100);
    doc.text('Histórico completo no app e no Excel. Vendas informadas pelos operadores.',14,204);
    doc.text('Página '+page+' de '+pages,283,204,{align:'right'});
  }
  doc.save(`Resumo_Lotes_${Date.now()}.pdf`);
}
