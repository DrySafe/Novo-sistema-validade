import { diasAte, faixaValidade, hojeBrasil } from './lifecycleRules.js';

// A faixa de revisão é um intervalo; esta apresentação mostra o prazo exato de hoje.
export function expiryStatus(item, today = hojeBrasil()) {
 const value = item.data_vencimento;
 const difference = value ? diasAte(value, today) : NaN;
 const days = Number.isFinite(difference) ? difference : null;
 const band = item.vencido_em || (!value && item.faixa === 'VENC') ? 'VENC' : days == null ? null : faixaValidade(value, today);
 const active = item.status === 'ativo' && Number(item.quantidade) > 0;
 const urgent = active && days != null && days <= 3;
 const soon = active && days != null && days <= 7;
 const text = days == null ? 'Sem validade informada' : days < 0 ? `Vencido há ${-days} ${days === -1 ? 'dia' : 'dias'}` : days === 0 ? 'Vence hoje' : days === 1 ? 'Vence amanhã' : `Faltam ${days} dias`;
 const ranges = {'7':'1–7','15':'8–15','30':'16–30','45':'31–45','60':'46–60'};
 const bandText = band === 'VENC' ? 'Faixa: vencidos' : band === '60+' ? 'Faixa: mais de 60 dias' : band ? `Faixa: ${ranges[band]} dias` : '';
 return {days,band,text,bandText,active,urgent,soon,action:urgent ? days <= 0 ? 'Destinação pendente' : 'Ação urgente' : soon ? 'Atenção à validade' : ''};
}

const calendarWatches = new WeakMap();
export function watchCalendarDay(target, render) {
 calendarWatches.get(target)?.();
 const view = target.ownerDocument.defaultView;
 let day = hojeBrasil();
 const stop = () => { view.clearInterval(timer); target.ownerDocument.removeEventListener('visibilitychange', update); calendarWatches.delete(target); };
 const update = () => {
  if (!target.isConnected) { stop(); return; }
  const current = hojeBrasil();
  if (current !== day) { day = current; render(); }
 };
 const timer = view.setInterval(update, 60_000);
 target.ownerDocument.addEventListener('visibilitychange', update);
 calendarWatches.set(target, stop);
}
