import {buildScreenPDF} from './lotPdf.js';
import {itemValueCents,stockValue} from './stockValue.js';
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
  const summary=resumoGerencial(itens);
  const doc=buildScreenPDF(window.jspdf.jsPDF,sortedReportRows(summary.rows),groupedReport(summary,options),summary,profile,options);
  doc.save(`Resumo_Lotes_${Date.now()}.pdf`);
}

export const sortedReportRows=rows=>[...rows].sort((a,b)=>String(a.item.data_vencimento||'9999').localeCompare(String(b.item.data_vencimento||'9999'))||String(a.item.produto_nome).localeCompare(String(b.item.produto_nome),'pt-BR'));
export function groupedReport(summary,options={}){
 const groups=new Map();for(const row of summary.rows){const item=row.item;const code=(options.groupBy==='vencidos'?item.lote_vencidos:item.origem_codigo)||item.origem_codigo||'Lote não identificado';if(!groups.has(code))groups.set(code,[]);groups.get(code).push(row);}return groups;
}
