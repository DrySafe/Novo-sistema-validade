// Centavos inteiros evitam diferenças de arredondamento no saldo e nos subtotais.
export function itemValueCents(item) {
 const quantity = Number(item.quantidade);
 if (!Number.isSafeInteger(quantity) || quantity < 0) return null;
 if (quantity === 0) return 0;
 if (item.preco_atual == null || item.preco_atual === '') return null;
 const price = Number(item.preco_atual);
 if (!Number.isFinite(price) || price < 0) return null;
 const cents = Math.round((price + Number.EPSILON) * 100) * quantity;
 return Number.isSafeInteger(cents) ? cents : null;
}
export function stockValue(items) {
 let cents=0, missing=0;
 for(const item of items){const amount=itemValueCents(item);if(amount==null)missing++;else if(Number.isSafeInteger(cents+amount))cents+=amount;else missing++;}
 return {cents,missing,partial:missing>0};
}
export const formatValue = cents => cents == null ? 'Não informado' : (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const lotValueLabel = items => {
 const total=stockValue(items);
 return formatValue(total.cents)+(total.partial?` (parcial; ${total.missing} ${total.missing===1?'item sem valor calculável':'itens sem valor calculável'})`:'');
};
export const companyCodes = item => [item.codigo_produto_empresa ? 'Cód. produto: '+item.codigo_produto_empresa : '',item.codigo_embalagem_empresa ? 'Cód. embalagem: '+item.codigo_embalagem_empresa : ''].filter(Boolean);
