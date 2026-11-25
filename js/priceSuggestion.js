import {expiryStatus} from './expiryStatus.js';
import {itemValueCents} from './stockValue.js';
import {hojeBrasil} from './lifecycleRules.js';

// Referência para o relatório: não altera preço, estoque ou promoção no ERP.
export function priceSuggestion(item,today=hojeBrasil()){
 const {days}=expiryStatus(item,today);
 const none=reason=>({days,discountPercent:null,suggestedCents:null,reason});
 if(item.vencido_em||item.tipo==='VENC'||(days!=null&&days<=0))return none('Vencido ou vence hoje: não sugerir venda');
 if(item.tipo&&item.tipo!=='VAL')return none('Avaria ou uso da loja: não sugerir venda');
 if(item.status!=='ativo'||!Number.isSafeInteger(Number(item.quantidade))||Number(item.quantidade)<=0)return none('Sem saldo ativo para venda');
 if(days==null)return none('Validade não informada');
 const unit=itemValueCents({...item,quantidade:1});
 if(unit==null)return none('Preço atual não informado ou não calculável');
 const discountPercent=days<=15?40:days<=30?15:days<=45?10:days<=60?5:0;
 const suggestedCents=Number((BigInt(unit)*BigInt(100-discountPercent)+50n)/100n);
 const reason=discountPercent?`De ${discountPercent===40?1:discountPercent===15?16:discountPercent===10?31:46} a ${discountPercent===40?15:discountPercent===15?30:discountPercent===10?45:60} dias: ${discountPercent}% de desconto`:'Mais de 60 dias: manter preço atual';
 return {days,discountPercent,suggestedCents,reason};
}
