import {reportColumnHeaders} from './reportColumns.js';
import {priceSuggestion} from './priceSuggestion.js';
import {formatValue,itemValueCents,lotValueLabel} from './stockValue.js';
import {formatDate,hojeBrasil} from './lifecycleRules.js';

export const pdfHeaders=reportColumnHeaders.slice(0,9);
const widths=[25,37,84,33,27,32,34,33,39];
const pageWidth=360,pageHeight=202.5,margin=8,tableWidth=344,bottom=pageHeight-20;
const fontSize=9.5,detailSize=8.5;
const orange=[198,93,23],ink=[38,51,47],pale=[255,244,232];
const qty=value=>value==null?'N/D':Number(value).toLocaleString('pt-BR');
const missing=value=>value||'Não informado';

export function pdfRecord(row,options={},today=hojeBrasil(),totalLabel=''){
 const item=row.item,suggestion=priceSuggestion(item,today),unit=itemValueCents({...item,quantidade:1});
 const code=(options.groupBy==='vencidos'?item.lote_vencidos:item.origem_codigo)||item.origem_codigo||'Lote não identificado';
 const days=suggestion.days==null?'SEM VALIDADE':suggestion.days<0?'VENCIDO':suggestion.days===0?'VENCE HOJE':qty(suggestion.days);
 const primary=[item.codigo_produto_empresa||'-',item.produtos?.ean||'-',item.produto_nome||'Não informado',item.data_vencimento?formatDate(item.data_vencimento):'Sem validade',qty(item.quantidade),suggestion.suggestedCents==null?'-':formatValue(suggestion.suggestedCents),days,formatValue(unit),formatValue(itemValueCents(item))];
 const corrected=(item.eventos||[]).some(e=>e.tipo==='Correção');
 const status=row.status+(row.partial?' *':'')+(corrected?' · Quantidade corrigida':'');
 const lotContext=code+(options.groupBy==='vencidos'?' · Origem: '+missing(item.origem_codigo):'');
 const first=`Lote: ${lotContext}${totalLabel?' (total do lote: '+totalLabel+')':''} | Cód. embalagem: ${missing(item.codigo_embalagem_empresa)} | Lote físico: ${missing(item.lote_fisico)} | Local: ${missing(item.localizacao)} | Situação: ${status}`;
 const second=`Entrada: ${qty(row.initial)} | Vendas: ${qty(row.sales)} | Perdas: ${qty(row.losses)} | Outras saídas: ${qty(row.other)} | Ajuste: ${row.adjustment>0?'+':''}${qty(row.adjustment)} | Data de entrada: ${formatDate(item.entrada_em)} | Desconto: ${suggestion.discountPercent==null?'Não se aplica':suggestion.discountPercent+'%'} | Regra: ${suggestion.reason}`;
 return {primary,details:first+'\n'+second,days:suggestion.days,code};
}
function lineCount(doc,value,width,size,bold=false){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);return Math.max(1,doc.splitTextToSize(String(value),width).length);}
function textHeight(doc,lines,size){return lines*size/doc.internal.scaleFactor*doc.getLineHeightFactor();}
export function buildScreenPDF(jsPDF,rows,groups,summary,profile={},options={}){
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:[pageWidth,pageHeight],compress:true});
 doc.setDisplayMode('fullpage','continuous','UseNone');
 const today=hojeBrasil(),emitted=new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 const metadata=`Loja: ${profile.lojas?.nome||'Não informada'} | Emitido por: ${profile.nome||'Não informado'}`;
 const metaLines=lineCount(doc,metadata,tableWidth,9),cardY=17+textHeight(doc,metaLines,9),cardHeight=18;
 const rule='Sugestão: 46–60 dias = 5% | 31–45 = 10% | 16–30 = 15% | 1–15 = 40%. Vencidos, hoje, avarias e uso: sem sugestão de venda.';
 const ruleY=cardY+cardHeight+4,ruleLines=lineCount(doc,rule,tableWidth,8),tableY=ruleY+textHeight(doc,ruleLines,8)+2;
 const headHeight=textHeight(doc,Math.max(...pdfHeaders.map((v,i)=>lineCount(doc,v,widths[i]-4,fontSize,true))),fontSize)+2.4;
 const capacity=bottom-tableY-headHeight;
 const records=rows.map((row,index)=>{
  const code=(options.groupBy==='vencidos'?row.item.lote_vencidos:row.item.origem_codigo)||row.item.origem_codigo||'Lote não identificado';
  const record=pdfRecord(row,options,today,lotValueLabel((groups.get(code)||[row]).map(r=>r.item)));
  record.index=index;
  record.mainHeight=textHeight(doc,Math.max(...record.primary.map((v,i)=>lineCount(doc,v,widths[i]-4,fontSize))),fontSize)+2.4;
  record.detailHeight=textHeight(doc,lineCount(doc,record.details,tableWidth-4,detailSize),detailSize)+2;
  return record;
 });
 const chunks=[];let current=[],used=0;
 for(const record of records){
  const height=record.mainHeight+record.detailHeight;
  if(current.length&&used+height>capacity){chunks.push({records:current});current=[];used=0;}
  if(height>capacity){chunks.push({records:[record],oversized:true});continue;}
  current.push(record);used+=height;
 }
 if(current.length)chunks.push({records:current});
 const headed=new Set();
 function header(){
  const page=doc.internal.getCurrentPageInfo().pageNumber;if(headed.has(page))return;headed.add(page);
  doc.setTextColor(...orange);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('VALIDASUPER / RELATÓRIO DE PRODUTOS',margin,10);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(95,105,98);doc.text('Emissão: '+emitted,pageWidth-margin,10,{align:'right'});
  doc.setFontSize(9);doc.text(doc.splitTextToSize(metadata,tableWidth),margin,16);
  const cards=[{x:margin,w:76,label:'ITENS / LOTES',value:qty(rows.length)+' / '+qty(groups.size)}, {x:88,w:94,label:'UNIDADES EM SALDO',value:qty(summary.balance)}, {x:186,w:166,label:'VALOR DO SALDO ATUAL',value:formatValue(summary.value.cents)}];
  for(const card of cards){
   doc.setFillColor(...pale);doc.roundedRect(card.x,cardY,card.w,cardHeight,2,2,'F');
   doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(127,90,57);doc.text(card.label,card.x+3,cardY+4.5);
   doc.setFontSize(13);doc.setTextColor(...orange);doc.text(card.value,card.x+3,cardY+11);
   if(card.x===186&&summary.value.partial){doc.setFontSize(7.6);doc.text('PARCIAL: '+qty(summary.value.missing)+(summary.value.missing===1?' item sem valor calculável':' itens sem valor calculável'),card.x+3,cardY+15.5);}
  }
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(95,105,98);doc.text(doc.splitTextToSize(rule,tableWidth),margin,ruleY);
 }
 chunks.forEach((chunk,index)=>{
  if(index)doc.addPage();
  const body=chunk.records.flatMap(record=>[
   record.primary.map(value=>({content:value,styles:chunk.oversized?{}:{minCellHeight:record.mainHeight}})),
   [{content:record.details,colSpan:9,styles:{fontSize:detailSize,cellPadding:{top:1,right:2,bottom:1,left:2},...(chunk.oversized?{}:{minCellHeight:record.detailHeight})}}]
  ]);
  doc.autoTable({startY:tableY,margin:{top:tableY,bottom:20,left:margin,right:margin},tableWidth,
   head:[pdfHeaders],body,theme:'plain',showHead:'everyPage',rowPageBreak:chunk.oversized?'auto':'avoid',
   styles:{font:'helvetica',fontSize,textColor:ink,cellPadding:{top:1.2,right:2,bottom:1.2,left:2},overflow:'linebreak',valign:'middle',lineColor:[232,228,219],lineWidth:0.1},
   headStyles:{fontSize,fontStyle:'bold',fillColor:orange,textColor:[255,255,255],halign:'center'},
   columnStyles:Object.fromEntries(widths.map((cellWidth,i)=>[i,{cellWidth,halign:i===2?'left':[5,7,8].includes(i)?'right':'center'}])),
   willDrawPage:header,
   didParseCell:data=>{
    if(data.section!=='body')return;
    const record=chunk.records[Math.floor(data.row.index/2)];if(!record)return;
    data.cell.styles.fillColor=record.index%2?[255,248,240]:[255,255,255];
    if(data.row.index%2){data.cell.styles.halign='left';data.cell.styles.textColor=[85,96,89];}
    else if(data.column.index===6){data.cell.styles.fontStyle='bold';data.cell.styles.fillColor=record.days==null?[241,242,239]:record.days<=0?[253,232,231]:record.days<=3?[255,240,216]:[234,244,235];data.cell.styles.textColor=record.days!=null&&record.days<=0?[170,53,48]:ink;}
    else if(data.column.index===5)data.cell.styles.fillColor=[255,240,216];
   }
  });
 });
 const pages=doc.getNumberOfPages();
 for(let page=1;page<=pages;page++){
  doc.setPage(page);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(95,105,98);
  doc.text('Formato 16:9 / leitura em tela',margin,187.5);doc.text('Página '+page+' de '+pages,pageWidth-margin,187.5,{align:'right'});
  const sold=summary.soldPercent==null?'N/D':summary.soldPercent.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  doc.setFontSize(7.5);doc.text(`Vendas registradas: ${qty(summary.sales)} | Perdas: ${qty(summary.losses)} | Outras saídas: ${qty(summary.other)} | Vendido: ${sold}${summary.partial?' | * Há itens com histórico parcial.':''}`,margin,192.5);
  doc.text('Totais pelo preço atual. Sugestão informativa, sem alterar preço, saldo ou ERP. Perdas = descarte + avaria; outras saídas = troca + bonificação + uso. Histórico completo no app e Excel.',margin,197);
 }
 return doc;
}
