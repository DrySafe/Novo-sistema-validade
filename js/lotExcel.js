import {resumoGerencial,reportHeaders,reportCells,sortedReportRows,groupedReport,linhasResumo,linhasHistorico} from './lifecycleReports.js';
import {stockValue,lotValueLabel} from './stockValue.js';
const orange='C65D17', pale='FFF4E8', line='E8CCAF', ink='3E3025';
const rgb=value=>value.length===6?'FF'+value:value;
const brl='"R$" #,##0.00;[Red]-"R$" #,##0.00';
function styleRow(row,fill=undefined,bold=false){row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Calibri',size:11,color:{argb:rgb(ink)},bold};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'thin',color:{argb:rgb(line)}}};if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:rgb(fill)}};});}
function band(sheet,text,fill=orange,size=12){const row=sheet.addRow([text]);sheet.mergeCells(row.number,1,row.number,12);styleRow(row,fill,true);row.getCell(1).font={name:'Calibri',size,bold:true,color:{argb:fill===orange?'FFFFFFFF':rgb(ink)}};row.height=Math.max(size===16?30:28,Math.ceil(text.length/(sheet.columns.reduce((n,c)=>n+(c.width||10),0)-6))*16+8);return row;}
function rawSheet(book,name,records){
 const sheet=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});const keys=Object.keys(records[0]||{Informação:''});sheet.columns=keys.map(k=>({header:k,key:k,width:/Produto|Justificativa|Local|Responsável/.test(k)?32:20}));styleRow(sheet.getRow(1),orange,true);sheet.getRow(1).eachCell(c=>c.font={...c.font,color:{argb:'FFFFFFFF'}});sheet.getRow(1).height=32;
 for(const [i,record]of records.entries()){const row=sheet.addRow(keys.map(k=>record[k]??''));styleRow(row,i%2===0?pale:'FFFFFF');row.height=30;keys.forEach((key,n)=>{if(typeof record[key]==='number'&&/Preço|Valor/.test(key))row.getCell(n+1).numFmt=brl;});}
 sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:keys.length}};return sheet;
}
export function buildLotWorkbook(ExcelJS,items,profile,options={}){
 const book=new ExcelJS.Workbook();book.creator='ValidaSuper';book.created=new Date();book.calcProperties.fullCalcOnLoad=false;
 const summary=resumoGerencial(items),groups=groupedReport(summary,options);
 const sheet=book.addWorksheet('Resumo por lote',{views:[{state:'frozen',ySplit:7}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.25,right:0.25,top:0.4,bottom:0.4,header:0.2,footer:0.2}}});
 sheet.columns=[38,30,23,12,12,12,14,12,12,18,22,30].map(width=>({width}));
 band(sheet,'VALIDASUPER — RESUMO POR LOTE',orange,16);
 band(sheet,`Loja: ${profile.lojas?.nome||'Não informada'}  |  Emitido por: ${profile.nome||'Não informado'}`,'FCE0C2');
 band(sheet,'Emissão: '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' | Quantidades em unidades; valores em R$.','FFF4E8');
 band(sheet,`${items.length} itens · ${groups.size} lotes · Saldo: ${summary.balance} · Vendas: ${summary.sales} · Perdas: ${summary.losses} · Outras saídas: ${summary.other} · Vendido: ${summary.soldPercent==null?'N/D':summary.soldPercent.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}`,'FCE0C2');
 band(sheet,'Valor do saldo: '+lotValueLabel(items)+' · Saldo × preço unitário atual; não representa custo ou perda realizada.','FFF4E8');
 const note=sheet.addRow(['Perdas = descarte + avaria registrados. Outras saídas = troca + bonificação + uso da loja. Ajuste = correção de contagem. Vendas informadas pelos operadores, sem integração automática com ERP. * Histórico parcial.']);sheet.mergeCells(note.number,1,note.number,12);styleRow(note);note.height=32;
 const header=sheet.addRow(reportHeaders);styleRow(header,orange,true);header.eachCell(c=>c.font={...c.font,color:{argb:'FFFFFFFF'}});header.height=34;
 for(const [code,rows]of groups){
  band(sheet,'LOTE '+code+' · '+rows.length+' itens · Total: '+lotValueLabel(rows.map(r=>r.item)),'F2B780');
  for(const [index,r]of sortedReportRows(rows).entries()){
   const values=reportCells(r,options).map((v,i)=>v==null?(i===9||i===10?'Não informado':'N/D'):v);const row=sheet.addRow(values);styleRow(row,index%2===0?pale:'FFFFFF');
   row.height=Math.max(42,...values.map((v,index)=>typeof v==='string'?v.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(sheet.getColumn(index+1).width-2))),0)*16+10:0));
   for(let col=4;col<=9;col++){row.getCell(col).numFmt='#,##0;[Red]-#,##0';row.getCell(col).alignment={...row.getCell(col).alignment,horizontal:'right'};}
   for(const col of [10,11]){row.getCell(col).numFmt=brl;row.getCell(col).alignment={...row.getCell(col).alignment,horizontal:'right'};}
  }
  const total=stockValue(rows.map(r=>r.item));const row=sheet.addRow(['TOTAL DO LOTE','','','','','','','',rows.reduce((n,r)=>n+r.balance,0),'',total.cents/100,total.partial?'Total parcial: há valores não informados':'']);sheet.mergeCells(row.number,1,row.number,8);styleRow(row,'FCE0C2',true);row.getCell(11).numFmt=brl;row.height=30;sheet.addRow([]).height=10;
 }
 const grand=sheet.addRow(['TOTAL GERAL','','','','','','','',summary.balance,'',summary.value.cents/100,summary.value.partial?'Total parcial':'']);sheet.mergeCells(grand.number,1,grand.number,8);styleRow(grand,orange,true);grand.eachCell(c=>c.font={...c.font,color:{argb:'FFFFFFFF'}});grand.getCell(11).numFmt=brl;grand.height=32;
 sheet.pageSetup.printTitlesRow='1:7';sheet.pageSetup.printArea='A1:L'+sheet.rowCount;sheet.headerFooter.oddFooter='&LValidaSuper&C Página &P de &N';
 rawSheet(book,'Dados dos itens',linhasResumo(items));rawSheet(book,'Histórico',linhasHistorico(items));
 return book;
}
export async function downloadLotExcel(items,profile,options={}){
 await import('./vendor/exceljs-4.4.0.min.js');
 if(!window.ExcelJS?.Workbook)throw new Error('Biblioteca Excel indisponível. Recarregue a página.');
 const book=buildLotWorkbook(window.ExcelJS,items,profile,options);const data=await book.xlsx.writeBuffer();
 const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download='Resumo_Lotes_'+Date.now()+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
