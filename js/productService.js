import { supabase } from './supabaseClient.js';

export const productService = {
  // 1. Busca na Open Food Facts quando o produto não existir localmente
  async fetchEanExternalApi(ean) {
  try {
    // Garantia de HTTPS na chamada da API
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === 1 && data.product) {
      const prod = data.product;
      
      // Força HTTPS no link da imagem para evitar bloqueio de Mixed Content na Vercel
      let imageUrl = prod.image_front_url || prod.image_url || '';
      if (imageUrl.startsWith('http://')) {
        imageUrl = imageUrl.replace('http://', 'https://');
      }

      return {
        nome: prod.product_name_pt || prod.product_name || '',
        categoria: prod.categories ? prod.categories.split(',')[0] : 'Geral',
        imagem_url: imageUrl
      };
    }
  } catch (error) {
    console.warn('Erro ao consultar a API Open Food Facts na Vercel:', error);
  }
  return null;
}

  // 2. Busca o produto localmente. Se não achar, consulta a API e salva local
  async getOrCreateProduto(ean, nomeInformado, imagemUrlInformada) {
    // 2a. Busca no Supabase
    const { data: existing } = await supabase
      .from('produtos')
      .select('id, nome, imagem_url')
      .eq('ean', ean)
      .maybeSingle();

    if (existing) {
      // Se não tinha imagem e agora recebemos uma, atualiza
      if (!existing.imagem_url && imagemUrlInformada) {
        await supabase.from('produtos').update({ imagem_url: imagemUrlInformada }).eq('id', existing.id);
      }
      return existing.id;
    }

    // 2b. Se não existe no banco local, insere o novo produto
    const { data: newProd, error } = await supabase
      .from('produtos')
      .insert({
        ean,
        nome: nomeInformado || 'Produto Sem Descrição',
        imagem_url: imagemUrlInformada || null
      })
      .select('id')
      .single();

    if (error) throw error;
    return newProd.id;
  },

  // 3. Busca lista da Régua de Vencimentos
  async getReguaVencimentos(lojaId) {
    const { data, error } = await supabase
      .from('vw_regua_vencimentos')
      .select('*')
      .eq('loja_id', lojaId)
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    return data;
  },

  // 4. Busca registros de perdas (Vencidos, Avarias, Uso Loja)
  async getRegistrosPerdas(lojaId, tipo) {
    const { data, error } = await supabase
      .from('registros_perdas')
      .select('*, produtos(ean, nome, categoria, imagem_url), perfis(nome)')
      .eq('loja_id', lojaId)
      .eq('tipo', tipo)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // 5. Salva novos lançamentos
  async createEntry(payload) {
    const produtoId = await this.getOrCreateProduto(payload.ean, payload.produtoNome, payload.imagemUrl);

    if (payload.setor === 'validade') {
      const { error } = await supabase
        .from('lotes_validade')
        .insert({
          loja_id: payload.lojaId,
          produto_id: produtoId,
          lote: payload.lote,
          quantidade: payload.quantidade,
          data_vencimento: payload.dataVencimento,
          localizacao: payload.localizacao,
          usuario_id: payload.usuarioId
        });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('registros_perdas')
        .insert({
          loja_id: payload.lojaId,
          produto_id: produtoId,
          tipo: payload.setor,
          quantidade: payload.quantidade,
          motivo: payload.motivo,
          usuario_id: payload.usuarioId
        });
      if (error) throw error;
    }
  }
};