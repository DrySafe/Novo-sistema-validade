import {itemValueCents,stockValue,formatValue,lotValueLabel,companyCodes} from './stockValue.js';
import { expiryStatus } from './expiryStatus.js';
import { formatDate as date, responsible, roundLabel } from './lifecycleRules.js';
export function linhasHistorico(itens) {
  return itens.flatMap(i => i.eventos.map(e => ({
    'Código do produto (empresa)':i.codigo_produto_empresa||'', 'Cód. da Embalagem (empresa)':i.codigo_embalagem_empresa||'', 'EAN': i.produtos?.ean || '', 'Produto': i.produto_nome, 'Lote físico': i.lote_fisico || 'Não registrado', 'Localização': i.localizacao || 'Não informado', 'Tipo de entrada': i.tipo || 'VAL', 'Lote origem': i.origem_codigo,
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
    'Código do produto (empresa)':i.codigo_produto_empresa||'', 'Cód. da Embalagem (empresa)':i.codigo_embalagem_empresa||'', 'EAN': i.produtos?.ean || '', 'Produto': i.produto_nome, 'Lote físico': i.lote_fisico || 'Não registrado', 'Localização': i.localizacao || 'Não informado', 'Tipo de entrada': i.tipo || 'VAL', 'Lote origem': i.origem_codigo,
    'Entrada': date(i.entrada_em), 'Dias até vencer na entrada': i.dias_entrada ?? 'Não disponível',
    'Quantidade inicial': i.quantidade_inicial ?? 'Não disponível', 'Preço inicial': i.preco_inicial ?? 'Não disponível',
    'Quantidade entrada em AV': i.tipo === 'AV' ? i.quantidade_inicial ?? 'Não disponível' : 0,
    'Quantidade entrada em USO': i.tipo === 'USO' ? i.quantidade_inicial ?? 'Não disponível' : 0,
    'Preço atual': i.preco_atual ?? 'Não disponível', 'Valor do saldo (R$)':itemValueCents(i)==null?'Não informado':itemValueCents(i)/100, 'Saldo atual': i.quantidade,
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
export async function exportLifecycleExcel(itens, profile, options = {}) {
  if (!itens.length) return alert('Não há itens para exportar.');
  const snapshot=itens.map(item=>({...item,produtos:item.produtos?{...item.produtos}:null,eventos:(item.eventos||[]).map(event=>({...event}))}));
  const identity={nome:profile.nome,lojas:profile.lojas?{...profile.lojas}:null},settings={...options};
  const {downloadLotExcel}=await import('./lotExcel.js');
  await downloadLotExcel(snapshot,identity,settings);
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
  return {rows, value:stockValue(itens), sales:sum('sales'), losses:sum('losses'), other:sum('other'), balance:sum('balance'), partial,
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
  doc.text('Valor do saldo: '+lotValueLabel(itens)+' | Saldo x preço unitário atual; não representa custo nem perda realizada.',14,43);
  doc.text(note,14,48);
  const legend = 'Perdas = descarte + avaria registrados. Outras saídas = troca + bonificação + uso da loja. Ajuste = correção de contagem (+/-).';
  doc.text(legend,14,54);
  doc.text('Vencido com saldo ainda aguarda destinação; não é baixa automática. * Histórico parcial: totais de saídas podem estar incompletos.',14,59);
  let y = 67;
  for (const [code, rows] of groups) {
    const titleLines = doc.splitTextToSize('Lote: ' + code + ' | ' + rows.length + (rows.length===1?' item':' itens') + ' | Saldo: ' + number(rows.reduce((sum,r)=>sum+r.balance,0)) + ' | Total: ' + lotValueLabel(rows.map(r=>r.item)),width);
    const titleHeight = titleLines.length * 4 + 3;
    if (y + titleHeight + 20 > bottom) { doc.addPage(); header(); headedPages.add(doc.internal.getCurrentPageInfo().pageNumber); y = 38; }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(titleLines,14,y); doc.setFont('helvetica','normal');
    doc.autoTable({startY:y+titleHeight,margin:{top:38,bottom:16,left:14,right:14},theme:'grid',
      head:[reportHeaders],
      body:sortedReportRows(rows).map(r=>reportCells(r,options).map((value,index)=>index>=3&&index<=8?quantity(value):index===9||index===10?price(value):value)),
      styles:{fontSize:8,cellPadding:2,overflow:'linebreak',valign:'middle'},headStyles:{fillColor:[19,121,104]},
      columnStyles:Object.fromEntries([44,33,23,16,16,14,15,13,13,18,25,39].map((cellWidth,index)=>[index,{cellWidth,...(index>=3&&index<=10?{halign:'right'}:{})}])),
      rowPageBreak:'avoid',
      willDrawPage: () => { const page = doc.internal.getCurrentPageInfo().pageNumber; if (!headedPages.has(page)) { header(); headedPages.add(page); doc.setFontSize(8); doc.text(doc.splitTextToSize('Lote: '+code,width).slice(0,1),14,35); } },
      didParseCell: data => { if(data.section==='body' && data.column.index===11 && data.cell.raw.startsWith('Vencido:'))data.cell.styles.textColor=[170,45,45]; }
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

export const reportHeaders=['Produto / EAN / Códigos','Lote físico / local','Validade','Entrada','Vendas','Perdas','Outras saídas','Ajuste','Saldo','Preço unitário','Valor do saldo','Situação'];
export const sortedReportRows=rows=>[...rows].sort((a,b)=>String(a.item.data_vencimento||'9999').localeCompare(String(b.item.data_vencimento||'9999'))||String(a.item.produto_nome).localeCompare(String(b.item.produto_nome),'pt-BR'));
export function reportCells(r,options={}){
 const item=r.item;
 return [
  [item.produto_nome||'Não informado',item.produtos?.ean?'EAN: '+item.produtos.ean:'',...companyCodes(item)].filter(Boolean).join('\n'),
  (item.lote_fisico||'Não registrado')+'\n'+(item.localizacao||'Local não informado')+(options.groupBy==='vencidos'?'\nOrigem: '+item.origem_codigo:''),
  item.data_vencimento?date(item.data_vencimento)+'\n'+expiryStatus(item).text:'Sem validade',
  r.initial,r.sales,r.losses,r.other,r.adjustment,r.balance,item.preco_atual==null?null:Number(item.preco_atual),itemValueCents(item)==null?null:itemValueCents(item)/100,
  r.status+(r.partial?' *':'')+((item.eventos||[]).some(e=>e.tipo==='Correção')?'\nQuantidade corrigida':'')
 ];
}
export function groupedReport(summary,options={}){
 const groups=new Map();for(const row of summary.rows){const item=row.item;const code=(options.groupBy==='vencidos'?item.lote_vencidos:item.origem_codigo)||item.origem_codigo||'Lote não identificado';if(!groups.has(code))groups.set(code,[]);groups.get(code).push(row);}return groups;
}
