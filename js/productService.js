import { supabase } from './supabaseClient.js';

export const productService = {

  // 1. Consulta API externa Open Food Facts
  async fetchEanExternalApi(ean) {
    try {
      // API v0/v2 com User-Agent customizado para evitar bloqueios de taxa/CORS e erro 502
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`, {
        headers: {
          'User-Agent': 'ValidaSuperApp - Web - Version 1.0 - www.validadeeco.vercel.app'
        }
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.status === 1 && data.product) {
        const prod = data.product;
        
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
      console.warn('Open Food Facts indisponível ou produto não cadastrado:', error);
    }
    return null;
  },

  // 2. Busca ou cria o produto localmente no Supabase (Atualizado com Preço Atual)
  async getOrCreateProduto(ean, nomeInformado, imagemUrlInformada, precoAtualInformado) {
    const { data: existing } = await supabase
      .from('produtos')
      .select('id, nome, imagem_url, preco_atual')
      .eq('ean', ean)
      .maybeSingle();

    if (existing) {
      const updates = {};
      
      // Atualiza foto se não tinha
      if (!existing.imagem_url && imagemUrlInformada) {
        updates.imagem_url = imagemUrlInformada;
      }

      // Atualiza o preço atual se for informado um novo valor válido
      if (precoAtualInformado && precoAtualInformado > 0) {
        updates.preco_atual = precoAtualInformado;
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('produtos')
          .update(updates)
          .eq('id', existing.id);
      }

      return existing.id;
    }

    // Se o produto não existe no banco, cria o registro completo
    const { data: newProd, error } = await supabase
      .from('produtos')
      .insert({
        ean,
        nome: nomeInformado || 'Produto Sem Descrição',
        imagem_url: imagemUrlInformada || null,
        preco_atual: precoAtualInformado || 0.00
      })
      .select('id')
      .single();

    if (error) throw error;
    return newProd.id;
  },

  // 3. Busca lista da Régua de Vencimentos
  async getReguaVencimentos(lojaId) {
    const hoje = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('vw_regua_vencimentos')
      .select('*')
      .eq('loja_id', lojaId)
      .gt('data_vencimento', hoje)
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    return data;
  },

  // 4. Busca produtos que já venceram (data <= HOJE)
  async getProdutosVencidos(lojaId) {
    const hoje = new Date().toISOString().split('T')[0];

    const { data: lotesVencidos, error: errLotes } = await supabase
      .from('lotes_validade')
      .select('*, produtos(ean, nome, imagem_url, preco_atual, preco_custo), perfis(nome)')
      .eq('loja_id', lojaId)
      .lte('data_vencimento', hoje)
      .order('data_vencimento', { ascending: true });

    if (errLotes) throw errLotes;
    return lotesVencidos;
  },

  // 5. Busca registros de perdas (Avarias / Uso Loja)
  async getRegistrosPerdas(lojaId, tipo) {
    const { data, error } = await supabase
      .from('registros_perdas')
      .select('*, produtos(ean, nome, categoria, imagem_url, preco_atual), perfis(nome)')
      .eq('loja_id', lojaId)
      .eq('tipo', tipo)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // 6. Atualizar Preço de Custo Inline (Exclusivo ADM / Admin)
  async updatePrecoCusto(produtoId, novoPrecoCusto) {
    const valor = parseFloat(novoPrecoCusto);
    if (isNaN(valor) || valor < 0) throw new Error("Preço de custo inválido.");

    const { data, error } = await supabase
      .from('produtos')
      .update({ preco_custo: valor })
      .eq('id', produtoId)
      .select();

    if (error) throw error;
    return data;
  },

  // 7. Salva novos lançamentos no Supabase (Método Único)
  async createEntry(payload) {
    // A) Busca ou cria o produto e salva o Preço Atual
    const produtoId = await this.getOrCreateProduto(
      payload.ean, 
      payload.produtoNome, 
      payload.imagemUrl, 
      payload.precoAtual
    );

    // B) Lançamento do setor "validade" -> Tabela lotes_validade
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
    } 
    // C) Lançamento de perdas (avarias / uso_loja) -> Tabela registros_perdas
    else {
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