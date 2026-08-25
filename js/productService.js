import { supabase } from './supabaseClient.js';
import { cycleService } from './cycleService.js';

export const productService = {

  // 1. Consulta API externa Open Food Facts
  async fetchEanExternalApi(ean) {
    try {
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

  // 2. Busca ou cria o produto na tabela global 'produtos'
  async getOrCreateProduto(ean, nomeInformado, imagemUrlInformada, precoAtualInformado) {
    const { data: existing } = await supabase
      .from('produtos')
      .select('id, nome, imagem_url, preco_atual')
      .eq('ean', ean)
      .maybeSingle();

    if (existing) {
      const updates = {};
      if (!existing.imagem_url && imagemUrlInformada) updates.imagem_url = imagemUrlInformada;
      if (precoAtualInformado && precoAtualInformado > 0) updates.preco_atual = precoAtualInformado;

      if (Object.keys(updates).length > 0) {
        await supabase.from('produtos').update(updates).eq('id', existing.id);
      }
      return existing.id;
    }

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

  // 3. Checagem Inteligente de Duplicidade dentro do ciclo atual
  async verificarDuplicidade(cicloLoteId, produtoId, lote, dataVencimento) {
    const { data, error } = await supabase
      .from('lotes_validade')
      .select('*, perfis(nome)')
      .eq('ciclo_lote_id', cicloLoteId)
      .eq('produto_id', produtoId)
      .eq('lote', lote)
      .eq('data_vencimento', dataVencimento)
      .maybeSingle();

    if (error) throw error;
    return data; // Retorna o registro existente com nome de quem cadastrou e local se for duplicado
  },

  // 4. Salva novo lançamento vinculado ao CICLO ATIVO
  async createEntry(payload) {
    // A) Obtém ou cria o ciclo em edição para a loja
    const cicloAtivo = await cycleService.getOrCreateActiveCycle(payload.lojaId);

    // B) Obtém ou cria o produto
    const produtoId = await this.getOrCreateProduto(
      payload.ean, 
      payload.produtoNome, 
      payload.imagemUrl, 
      payload.precoAtual
    );

    // C) Se for do setor validade e NÃO for confirmação de duplicidade, verifica duplicidade
    if (payload.setor === 'validade' && !payload.forcarInsercao) {
      const duplicado = await this.verificarDuplicidade(
        cicloAtivo.id,
        produtoId,
        payload.lote,
        payload.dataVencimento
      );

      if (duplicado) {
        return {
          isDuplicado: true,
          registroExistente: duplicado
        };
      }
    }

    // D) Inserção no banco
    if (payload.setor === 'validade') {
      const { error } = await supabase
        .from('lotes_validade')
        .insert({
          loja_id: payload.lojaId,
          ciclo_lote_id: cicloAtivo.id,
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

    // E) Registra evento de auditoria
    await cycleService.registrarAuditoria({
      cicloLoteId: cicloAtivo.id,
      produtoId,
      usuarioId: payload.usuarioId,
      acao: 'PRODUTO_ADICIONADO',
      detalhes: { quantidade: payload.quantidade, setor: payload.setor }
    });

    return { isDuplicado: false, success: true };
  },

  // 5. Busca Régua de Vencimentos filtrada por Loja/Ciclo
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

  // 6. Busca produtos vencidos
  async getProdutosVencidos(lojaId) {
    const hoje = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('lotes_validade')
      .select('*, produtos(ean, nome, imagem_url, preco_atual, preco_custo), perfis(nome), ciclos_lotes(codigo_lote)')
      .eq('loja_id', lojaId)
      .lte('data_vencimento', hoje)
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    return data;
  },

  // 7. Busca registros de perdas
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

  // 8. Atualizar Preço de Custo Inline
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
  }
};