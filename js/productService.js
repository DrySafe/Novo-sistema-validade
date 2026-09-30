import { supabase } from './supabaseClient.js';
import { lifecycleService } from './lifecycleService.js';

export const productService = {
  async fetchEanExternalApi(ean) {
    if (!/^[0-9]{8,14}$/.test(ean)) return null;
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
      if (!response.ok) return null;
      const { status, product } = await response.json();
      if (status !== 1 || !product) return null;
      return { ean, nome: product.product_name_pt || product.product_name || 'Produto sem nome', imagem_url: product.image_front_url || product.image_url || null };
    } catch { return null; }
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
