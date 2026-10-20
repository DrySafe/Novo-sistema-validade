import {hojeBrasil,diasAte,formatDate} from './lifecycleRules.js';
const day=value=>value?hojeBrasil(new Date(value)):null;
const inRange=(date,from,to)=>!!date&&date>=from&&date<=to;
export function dailyQueue(items,state,today=hojeBrasil()){
 const cfg=state.config||{dias_alerta:15,cadencia_dias:1};
 return items.filter(i=>i.quantidade>0&&i.status==='ativo'&&['VAL','VENC'].includes(i.tipo)&&i.data_vencimento).map(i=>{
 const days=diasAte(i.data_vencimento,today);const last=(i.eventos||[]).filter(e=>e.tipo==='REVISAO').at(-1);
 const needsDaily=days<=cfg.dias_alerta&&(!last||diasAte(today,day(last.ocorrido_em))>=cfg.cadencia_dias);
 return {item:i,days,reason:days<=0?'Vencido: registrar destinação':needsDaily?'Conferência da fila diária':i.pendencias?.join(' + ')||'',taskOpen:(state.tarefas||[]).some(t=>t.item_id===i.id&&!['concluida','cancelada'].includes(t.estado))};
 }).filter(r=>r.reason).sort((a,b)=>a.days-b.days||a.item.produto_nome.localeCompare(b.item.produto_nome,'pt-BR'));
}
export function previousPeriod(from,to){const length=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;const end=new Date(Date.parse(from)-86400000).toISOString().slice(0,10);return {from:new Date(Date.parse(from)-length*86400000).toISOString().slice(0,10),to:end};}
export function followupMetrics(items,state,from,to,today=hojeBrasil()){
 const costs=new Map((state.custos||[]).map(c=>[c.item_id,Number(c.custo)]));const historic=new Map((state.custos_eventos||[]).map(c=>[String(c.evento_id),Number(c.custo_unitario)]));
 const result={unidadesRisco:0,valorRisco:0,semCustoRisco:0,unidadesVencidas:0,valorVencido:0,descarte:0,custoDescarte:0,descarteSemCusto:0,descarteVencido:0,custoDescarteVencido:0,vencidoSemCustoHistorico:0,vendasInformadas:0,avarias:0,concluidas:0,noPrazo:0,atrasadas:0};
 for(const i of items){
  const days=i.data_vencimento?diasAte(i.data_vencimento,today):null;
  if(i.quantidade>0&&i.status==='ativo'&&['VAL','VENC'].includes(i.tipo)&&days!==null&&days<=(state.config?.dias_alerta??15)){
   if(days<=0){result.unidadesVencidas+=i.quantidade;if(costs.has(i.id))result.valorVencido+=i.quantidade*costs.get(i.id);}
   else{result.unidadesRisco+=i.quantidade;if(costs.has(i.id))result.valorRisco+=i.quantidade*costs.get(i.id);}
   if(!costs.has(i.id))result.semCustoRisco+=i.quantidade;
  }
  for(const e of i.eventos||[]){if(!inRange(day(e.ocorrido_em),from,to))continue;const qty=Math.max(0,e.quantidade||0);
   if(e.tipo==='Venda')result.vendasInformadas+=qty;if(e.tipo==='Avaria')result.avarias+=qty;
   if(e.tipo==='Descarte'){if(i.data_vencimento&&day(e.ocorrido_em)>=i.data_vencimento.slice(0,10)){result.descarteVencido+=qty;if(historic.has(String(e.id)))result.custoDescarteVencido+=qty*historic.get(String(e.id));else result.vencidoSemCustoHistorico+=qty;}result.descarte+=qty;if(historic.has(String(e.id)))result.custoDescarte+=qty*historic.get(String(e.id));else result.descarteSemCusto+=qty;}
  }
 }
 for(const t of state.tarefas||[]){if(!['concluida','cancelada'].includes(t.estado)&&t.prazo<today)result.atrasadas++;
  if(t.estado==='concluida'&&inRange(day(t.concluido_em),from,to)){result.concluidas++;if(day(t.concluido_em)<=t.prazo)result.noPrazo++;}
 }
 for(const k of ['valorRisco','valorVencido','custoDescarte','custoDescarteVencido'])result[k]=Math.round((result[k]+Number.EPSILON)*100)/100;result.percentualPrazo=result.concluidas?Math.round(1000*result.noPrazo/result.concluidas)/10:null;return result;
}
export function actionRows(state,items){const names=new Map((state.participantes||[]).map(p=>[p.id,p.nome]));const byId=new Map(items.map(i=>[i.id,i]));return (state.tarefas||[]).map(t=>{const i=byId.get(t.item_id);return {'Ação ID':t.id,'Tipo':t.tipo,'Título':t.titulo,'Produto':i?.produto_nome||'Ação da loja','Lote físico':i?.lote_fisico||'','Local':i?.localizacao||'','Prazo':t.prazo,'Responsável':t.responsavel_nome||names.get(t.responsavel_id)||t.responsavel_id,'Situação':statusLabel(t.estado),'Concluída em':t.concluido_em||'','Resultado':t.resultado||'','Descrição':t.descricao||''};});}

export const statusLabel=value=>({aberta:'Aberta',em_andamento:'Em andamento',concluida:'Concluída',impedida:'Impedida',cancelada:'Cancelada'}[value]||value);
export const auditLabel=value=>({POSICAO:'Posição cadastrada ou atualizada',ROTINA:'Rotina ajustada',LOCALIZACAO:'Localização atualizada',CUSTO:'Custo informado',ACAO_CRIADA:'Ação criada',ACAO_ATUALIZADA:'Resultado atualizado',ENTRADA_ADICIONAL:'Entrada adicional confirmada'}[value]||value);
export function auditDetails(e,state={}){const d=e.dados||{};switch(e.acao){
 case 'LOCALIZACAO':return 'De '+d.anterior+' para '+d.nova+' · '+d.quantidade+' un.';
 case 'CUSTO':return 'Custo anterior: '+(d.anterior??'não informado')+' · novo: R$ '+d.novo;
 case 'ACAO_CRIADA':return (d.tipo||'Ação')+' · '+(d.titulo||'')+' · prazo '+formatDate(d.prazo);
 case 'ACAO_ATUALIZADA':return statusLabel(d.anterior)+' → '+statusLabel(d.nova);
 case 'POSICAO':return ((state.posicoes||[]).find(p=>p.id===d.id)?.nome||'Posição da loja')+' · '+(d.ativa?'ativa':'inativa');
 case 'ROTINA':return 'Janela até '+d.dias_alerta+' dias · conferência a cada '+d.cadencia_dias+' dia(s)';
 case 'ENTRADA_ADICIONAL':return 'Havia '+(d.registros_existentes?.length||0)+' registro(s) de estoque relacionado(s). Quantidade adicional no histórico de entrada do produto.';
 default:return '';}}
