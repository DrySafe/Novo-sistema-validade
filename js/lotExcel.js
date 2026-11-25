import {resumoGerencial,sortedReportRows,groupedReport,linhasResumo,linhasHistorico} from './lifecycleReports.js';
import {stockValue,itemValueCents} from './stockValue.js';
import {priceSuggestion} from './priceSuggestion.js';
import {hojeBrasil,formatDate} from './lifecycleRules.js';
const orange='C65D17', pale='FFF4E8', line='E8CCAF', ink='26332F';
const rgb=value=>value.length===6?'FF'+value:value;
const brl='"R$" #,##0.00;[Red]-"R$" #,##0.00';
export const excelHeaders=['CÓDIGO WINTHOR','CÓDIGO DE BARRAS','PRODUTO','DATA DE VALIDADE','QUANTIDADE','SUGESTÃO R$','DIAS QUE FALTAM','PREÇO UNITÁRIO R$','VALOR DO SALDO R$','LOTE DE ACOMPANHAMENTO','CÓD. DA EMBALAGEM','LOTE FÍSICO','LOCALIZAÇÃO','SITUAÇÃO','QUANTIDADE INICIAL','VENDAS REGISTRADAS','PERDAS','OUTRAS SAÍDAS','AJUSTE','DATA DE ENTRADA','DESCONTO SUGERIDO %','REGRA DA SUGESTÃO'];
function styleRow(row,fill=undefined,bold=false){row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Aptos',size:11,color:{argb:rgb(ink)},bold};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'thin',color:{argb:rgb(line)}}};if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:rgb(fill)}};});}
function merged(sheet,row,from,to,value,{fill,bold=false,size=11,color=ink}={}){
 sheet.mergeCells(row,from,row,to);const cell=sheet.getCell(row,from);cell.value=value;cell.font={name:'Aptos',size,bold,color:{argb:rgb(color)}};cell.alignment={vertical:'middle',wrapText:true,indent:1};if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:rgb(fill)}};return cell;
}
function rawSheet(book,name,records){
 const sheet=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});const keys=Object.keys(records[0]||{Informação:''});sheet.columns=keys.map(k=>({header:k,key:k,width:/Produto|Justificativa|Local|Responsável/.test(k)?32:20}));styleRow(sheet.getRow(1),orange,true);sheet.getRow(1).eachCell(c=>c.font={...c.font,color:{argb:'FFFFFFFF'}});sheet.getRow(1).height=32;
 for(const [i,record]of records.entries()){const row=sheet.addRow(keys.map(k=>record[k]??''));styleRow(row,i%2===0?pale:'FFFFFF');row.height=30;keys.forEach((key,n)=>{if(typeof record[key]==='number'&&/Preço|Valor|Sugestão R\$/.test(key))row.getCell(n+1).numFmt=brl;});}
 sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:keys.length}};return sheet;
}
function excelDate(value){
 const text=formatDate(value);if(text==='Não disponível')return null;
 const [d,m,y]=text.split('/').map(Number);const date=new Date(Date.UTC(y,m-1,d));return Number.isFinite(date.getTime())?date:null;
}
function daysColor(days){return days==null?['F1F2EF','687169']:days<=0?['FDE8E7','AA3530']:days<=3?['FFF0D8','9B570C']:days<=7?['FFF7DD','877023']:['EAF4EB','38694B'];}
export function buildLotWorkbook(ExcelJS,items,profile,options={}){
 const today=hojeBrasil(),summary=resumoGerencial(items),groups=groupedReport(summary,options);
 const book=new ExcelJS.Workbook();book.creator='ValidaSuper';book.created=new Date();book.calcProperties.fullCalcOnLoad=false;
 const sheet=book.addWorksheet('Produtos',{views:[{state:'frozen',xSplit:3,ySplit:7,topLeftCell:'D8',showGridLines:false}],pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:2,fitToHeight:0,margins:{left:0.25,right:0.25,top:0.4,bottom:0.4,header:0.2,footer:0.2}}});
 sheet.columns=[18,24,44,22,18,19,21,21,24,28,24,21,28,29,21,22,16,20,16,23,23,49].map(width=>({width}));
 merged(sheet,1,1,9,'VALIDASUPER / ACOMPANHAMENTO DE VALIDADE',{bold:true,size:19});sheet.getRow(1).height=36;
 merged(sheet,2,1,9,`Loja: ${profile.lojas?.nome||'Não informada'} · Emitido por: ${profile.nome||'Não informado'} · Emissão: ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`,{color:'687169'});sheet.getRow(2).height=30;
 for(const [start,end,label,value,format]of [[1,2,'ITENS ACOMPANHADOS',items.length,'0'],[3,5,'SALDO EM UNIDADES',summary.balance,'0'],[6,9,'VALOR DO SALDO ATUAL',summary.value.cents/100,brl]]){
  merged(sheet,3,start,end,label,{fill:pale,bold:true,size:10,color:'7F5A39'});const cell=merged(sheet,4,start,end,value,{fill:pale,bold:true,size:19,color:orange});cell.numFmt=format;
 }
 sheet.getRow(3).height=23;sheet.getRow(4).height=36;
 merged(sheet,5,1,9,'Sugestão: 46–60 dias = 5% · 31–45 = 10% · 16–30 = 15% · 1–15 = 40%. Vencidos/hoje, avarias e uso: sem sugestão de venda.',{size:10,color:'687169'});sheet.getRow(5).height=32;
 merged(sheet,6,1,9,`Saldo valorizado pelo preço atual, sem aplicar a sugestão. ${summary.value.partial?'TOTAL PARCIAL: '+summary.value.missing+' itens sem valor calculável. ':''}Vendas são informadas; sem integração automática com ERP.`,{size:10,color:summary.value.partial?'9B570C':'687169'});sheet.getRow(6).height=30;
 const header=sheet.getRow(7);header.values=excelHeaders;styleRow(header,orange,true);header.eachCell((cell,col)=>{cell.font={...cell.font,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:rgb(col===6?'96501C':col<=7?orange:'59675F')}};});header.height=43;
 const suggestions=new Map();let index=0;
 for(const r of sortedReportRows(summary.rows)){
   const item=r.item,code=(options.groupBy==='vencidos'?item.lote_vencidos:item.origem_codigo)||item.origem_codigo||'Lote não identificado',suggestion=priceSuggestion(item,today),unit=itemValueCents({...item,quantidade:1}),value=itemValueCents(item);suggestions.set(item,suggestion);
   const days=suggestion.days==null?'SEM VALIDADE':suggestion.days<0?'VENCIDO':suggestion.days===0?'VENCE HOJE':suggestion.days;
   const values=[item.codigo_produto_empresa||'',item.produtos?.ean||'',item.produto_nome||'Não informado',excelDate(item.data_vencimento),item.quantidade,suggestion.suggestedCents==null?null:suggestion.suggestedCents/100,days,unit==null?'Não informado':unit/100,value==null?'Não informado':value/100,code,item.codigo_embalagem_empresa||'',item.lote_fisico||'Não registrado',item.localizacao||'Local não informado',r.status+(r.partial?' · Histórico parcial':''),r.initial??'N/D',r.sales,r.losses,r.other,r.adjustment,excelDate(item.entrada_em),suggestion.discountPercent==null?null:suggestion.discountPercent/100,suggestion.reason];
   const row=sheet.addRow(values);styleRow(row,index++%2===0?'FFFFFF':'F7F8F5');
   row.height=Math.max(36,...values.map((v,n)=>typeof v==='string'?v.split('\n').reduce((sum,part)=>sum+Math.max(1,Math.ceil(part.length/(sheet.getColumn(n+1).width-2))),0)*15+8:0));
   for(const col of [1,2,11])row.getCell(col).numFmt='@';
   for(const col of [4,20])row.getCell(col).numFmt='dd/mm/yyyy';
   for(const col of [6,8,9]){row.getCell(col).numFmt=brl;row.getCell(col).alignment={vertical:'middle',horizontal:'right'};}
   for(const col of [1,2,4,5,7,15,16,17,18,19,20,21])row.getCell(col).alignment={...row.getCell(col).alignment,horizontal:'center'};
   row.getCell(21).numFmt='0%';row.getCell(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF0D8'}};row.getCell(6).note='Sugestão calculada sobre o preço unitário atual, por dias restantes na emissão. Não altera o preço cadastrado, estoque ou ERP.';
   const [fill,color]=daysColor(suggestion.days);row.getCell(7).fill={type:'pattern',pattern:'solid',fgColor:{argb:rgb(fill)}};row.getCell(7).font={name:'Aptos',size:11,bold:true,color:{argb:rgb(color)}};
 }
 sheet.autoFilter={from:{row:7,column:1},to:{row:Math.max(7,sheet.rowCount),column:excelHeaders.length}};sheet.pageSetup.printTitlesRow='1:7';sheet.pageSetup.printArea='A1:V'+sheet.rowCount;sheet.headerFooter.oddFooter='&LValidaSuper&C Página &P de &N';
 const totals=book.addWorksheet('Totais por lote',{views:[{state:'frozen',xSplit:1,ySplit:1,showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 totals.columns=[{header:'LOTE',width:32},{header:'ITENS',width:14},{header:'SALDO EM UNIDADES',width:24},{header:'VALOR DO SALDO R$',width:26},{header:'COBERTURA DOS PREÇOS',width:43}];styleRow(totals.getRow(1),orange,true);totals.getRow(1).eachCell(c=>c.font={...c.font,color:{argb:'FFFFFFFF'}});totals.getRow(1).height=34;
 for(const [code,rows]of groups){const total=stockValue(rows.map(r=>r.item));const row=totals.addRow([code,rows.length,rows.reduce((n,r)=>n+r.balance,0),total.cents/100,total.partial?'Parcial · '+total.missing+' itens sem valor calculável':'Completo']);styleRow(row,row.number%2===0?pale:'FFFFFF');row.getCell(4).numFmt=brl;row.height=32;}
 totals.autoFilter={from:{row:1,column:1},to:{row:totals.rowCount,column:5}};
 const grand=totals.addRow(['TOTAL GERAL',items.length,summary.balance,summary.value.cents/100,summary.value.partial?'Total parcial':'Completo']);styleRow(grand,orange,true);grand.eachCell(c=>c.font={...c.font,color:{argb:'FFFFFFFF'}});grand.getCell(4).numFmt=brl;grand.height=34;totals.pageSetup.printTitlesRow='1:1';totals.headerFooter.oddFooter='&LValores pelo preço atual, sem aplicar sugestão&R&P / &N';
 rawSheet(book,'Dados dos itens',linhasResumo(items).map((row,n)=>{const s=suggestions.get(items[n]);return {...row,'Sugestão R$':s.suggestedCents==null?'Não se aplica':s.suggestedCents/100,'Desconto sugerido (%)':s.discountPercent??'Não se aplica','Regra da sugestão':s.reason};}));
 rawSheet(book,'Histórico',linhasHistorico(items));return book;
}
export async function downloadLotExcel(items,profile,options={}){
 await import('./vendor/exceljs-4.4.0.min.js');
 if(!window.ExcelJS?.Workbook)throw new Error('Biblioteca Excel indisponível. Recarregue a página.');
 const book=buildLotWorkbook(window.ExcelJS,items,profile,options);const data=await book.xlsx.writeBuffer();
 const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download='Resumo_Lotes_'+Date.now()+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
