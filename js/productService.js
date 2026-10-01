import { buscarOpenFoodFacts } from './productLookup.js';
import { supabase } from './supabaseClient.js';
import { lifecycleService } from './lifecycleService.js';

export const productService = {
  async fetchEanExternalApi(ean) {
    return buscarOpenFoodFacts(ean);
  },
  async createEntry(payload) {
    const { data, error } = await supabase.rpc('vs_criar', { p: payload });
    if (error) throw error;
    return data;
  },
  async realizarBaixaProduto({ itemId, tipoBaixa, lojaId, qtd, motivo }) {
    const snapshot = await lifecycleService.carregar(lojaId);
    const item = snapshot.itens.find(i => i.id === itemId);
    if (!item) throw new Error('Item não encontrado.');
    return lifecycleService.registrar(item, { destino: tipoBaixa, saldo: item.quantidade - qtd, motivo });
  },
  async ajustarQuantidadeLote({ itemId, lojaId, qtdNova, motivo, observacao }) {
    const snapshot = await lifecycleService.carregar(lojaId);
    const item = snapshot.itens.find(i => i.id === itemId);
    if (!item) throw new Error('Item não encontrado.');
    const destino = ({ Venda: 'Venda', 'Uso Loja': 'Uso Loja', 'Perda/Avaria': 'Avaria' })[motivo] || 'Correção';
    return lifecycleService.registrar(item, { destino, saldo: qtdNova, motivo: [motivo, observacao].filter(Boolean).join(' — ') });
  }
};
