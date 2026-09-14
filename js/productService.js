import { supabase } from './supabaseClient.js';
import { cycleService } from './cycleService.js';

export const productService = {

  /* ============================================================
     SEÇÃO 1: CONSULTA DE API EXTERNA (EAN / OPEN FOOD FACTS)
     ============================================================ */

  async fetchEanExternalApi(ean) {
    if (!ean || ean.length < 8) return null;
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
      const data = await response.json();
      if (data.status === 1 && data.product) {
        return {
          ean: ean,
          nome: data.product.product_name || data.product.product_name_pt || 'Produto sem nome',
          imagem_url: data.product.image_front_url || data.product.image_url || null,
          categoria: data.product.categories_tags?.[0]?.replace('en:', '') || 'Geral'
        };
      }
    } catch (err) {
      console.warn("Aviso ao buscar API externa:", err);
    }
    return null;
  },

  /* ============================================================
     SEÇÃO 2: CRIAÇÃO E LANÇAMENTO DE REGISTROS (COM REQUISIÇÃO DE TIPO)
     ============================================================ */

  async createEntry(payload) {
    const { 
      lojaId, usuarioId, setor, ean, produtoNome, 
      precoAtual, imagemUrl, lote, quantidade, 
      dataVencimento, localizacao, motivo, forcarInsercao 
    } = payload;

    if (!lojaId || !ean || !quantidade || !dataVencimento) {
      throw new Error("Preencha todos os campos obrigatórios (EAN, Quantidade, Data de Vencimento).");
    }

    // 1. Determina o tipo de lote com base no setor e na data de vencimento
    const hojeStr = new Date().toISOString().split('T')[0];
    let tipoLote = 'VAL';
    let origemCadastro = 'PADRAO';

    if (setor === 'vencidos' || dataVencimento < hojeStr) {
      tipoLote = 'VENC';
      origemCadastro = 'ADICIONADO_VENCIDO';
    } else if (setor === 'avarias') {
      tipoLote = 'AV';
    } else if (setor === 'uso') {
      tipoLote = 'USO';
    }

    // 2. Busca ou cria o ciclo/lote ativo para este tipo na loja
    const cicloAtivo = await cycleService.getOrCreateActiveCycle(lojaId, tipoLote);
    if (!cicloAtivo) {
      throw new Error("Não foi possível gerar ou recuperar o lote ativo para o tipo: " + tipoLote);
    }

    // 3. Garante que o produto existe na tabela base 'produtos'
    let produtoId = null;
    const { data: prodExistente } = await supabase
      .from('produtos')
      .select('id')
      .eq('ean', ean)
      .maybeSingle();

    if (prodExistente) {
      produtoId = prodExistente.id;
      // Atualiza imagem ou nome se necessário
      await supabase
        .from('produtos')
        .update({ nome: produtoNome, imagem_url: imagemUrl || null, preco_atual: precoAtual || 0 })
        .eq('id', produtoId);
    } else {
      const { data: novoProd, error: errNovoProd } = await supabase
        .from('produtos')
        .insert({
          ean,
          nome: produtoNome || 'Produto Sem Nome',
          imagem_url: imagemUrl || null,
          preco_atual: precoAtual || 0
        })
        .select('id')
        .single();

      if (errNovoProd) throw new Error("Erro ao cadastrar produto: " + errNovoProd.message);
      produtoId = novoProd.id;
    }

    // 4. Verifica duplicidade no mesmo lote (se não for forçado)
    if (!forcarInsercao) {
      const { data: dupCheck } = await supabase
        .from('lotes_validade')
        .select('*, perfis(nome)')
        .eq('loja_id', lojaId)
        .eq('ciclo_lote_id', cicloAtivo.id)
        .eq('produto_id', produtoId)
        .eq('status', 'ativo')
        .maybeSingle();

      if (dupCheck) {
        return { isDuplicado: true, registroExistente: dupCheck };
      }
    }

    // 5. Insere o registro na tabela 'lotes_validade'
    const { data: loteVal, error: errLoteVal } = await supabase
      .from('lotes_validade')
      .insert({
        loja_id: lojaId,
        produto_id: produtoId,
        lote: lote || cicloAtivo.codigo_lote,
        data_vencimento: dataVencimento,
        quantidade: quantidade,
        localizacao: localizacao || 'Gôndola',
        usuario_id: usuarioId,
        status: 'ativo',
        ciclo_lote_id: cicloAtivo.id,
        origem_cadastro: origemCadastro
      })
      .select()
      .single();

    if (errLoteVal) throw new Error("Erro ao registrar lote de validade: " + errLoteVal.message);

    return { isDuplicado: false, registro: loteVal };
  },

  /* ============================================================
     SEÇÃO 3: CONSULTAS DE VALIDADE E VENCIDOS
     ============================================================ */

  async getReguaVencimentos(lojaId) {
    const { data, error } = await supabase
      .from('lotes_validade')
      .select('*, produtos(*), ciclos_lotes(codigo_lote)')
      .eq('loja_id', lojaId)
      .eq('status', 'ativo')
      .order('data_vencimento', { ascending: true });

    if (error) throw error;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return (data || []).map(item => {
      let statusRegua = '🟢 60d+';
      if (item.data_vencimento) {
        const dtVenc = new Date(item.data_vencimento + 'T00:00:00');
        const diffDias = Math.ceil((dtVenc - hoje) / (1000 * 60 * 60 * 24));

        if (diffDias < 0) statusRegua = '🚫 VENCIDO';
        else if (diffDias <= 7) statusRegua = '🔴 7d (Crítico)';
        else if (diffDias <= 15) statusRegua = '🟠 15d (Oferta)';
        else if (diffDias <= 30) statusRegua = '🟡 30d';
        else if (diffDias <= 45) statusRegua = '🔵 45d';
      }

      return {
        ...item,
        produto_nome: item.produtos?.nome || 'Produto sem nome',
        imagem_url: item.produtos?.imagem_url,
        preco_atual: item.produtos?.preco_atual || 0,
        codigo_lote: item.ciclos_lotes?.codigo_lote || item.lote,
        status_regua: statusRegua
      };
    });
  },

  async getProdutosVencidos(lojaId) {
    if (!lojaId) return [];

    const hojeStr = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('lotes_validade')
      .select('*, produtos(*), ciclos_lotes(codigo_lote)')
      .eq('loja_id', lojaId)
      .eq('status', 'ativo')
      .lte('data_vencimento', hojeStr)
      .order('data_vencimento', { ascending: true });

    if (error) throw error;

    return (data || []).map(item => ({
      ...item,
      produto_nome: item.produtos?.nome || 'Produto sem nome',
      imagem_url: item.produtos?.imagem_url,
      preco_atual: item.produtos?.preco_atual || 0,
      codigo_lote: item.ciclos_lotes?.codigo_lote || item.lote,
      status_regua: '🚫 VENCIDO'
    }));
  },

  async getRegistrosPerdas(lojaId, setor) {
    const tipoFiltro = setor === 'avarias' ? 'avaria' : 'uso';
    const { data, error } = await supabase
      .from('registros_perdas')
      .select('*, produtos(*)')
      .eq('loja_id', lojaId)
      .eq('tipo', tipoFiltro)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /* ============================================================
     SEÇÃO 4: BAIXA INTELIGENTE (DESCARTE, TROCA, VENDA, BONIFICAÇÃO)
     ============================================================ */

  async realizarBaixaProduto({ itemId, tipoBaixa, usuarioId, lojaId, produtoId, qtd, motivo }) {
    if (!['Descarte', 'Troca', 'Venda', 'Bonificação'].includes(tipoBaixa)) {
      throw new Error("Tipo de baixa inválido.");
    }

    // 1. Atualiza o lote como baixado
    const { error: errUpdate } = await supabase
      .from('lotes_validade')
      .update({
        status: 'baixado',
        tipo_baixa: tipoBaixa,
        baixado_em: new Date().toISOString(),
        quantidade: 0
      })
      .eq('id', itemId);

    if (errUpdate) throw new Error("Erro ao realizar baixa: " + errUpdate.message);

    // 2. Registra o evento na tabela de auditoria para fins de TOTVS
    await supabase.from('auditoria_eventos').insert({
      loja_id: lojaId,
      lote_validade_id: itemId,
      produto_id: produtoId,
      usuario_id: usuarioId,
      acao: 'BAIXA_COMERCIAL_' + tipoBaixa.toUpperCase(),
      qtd_anterior: qtd,
      qtd_nova: 0,
      motivo: motivo || 'Baixa comercial para TOTVS',
      observacao: `Destino: ${tipoBaixa}`
    });

    return true;
  },

  /* ============================================================
     SEÇÃO 5: AJUSTES E CUSTOS
     ============================================================ */

  async updatePrecoCusto(produtoId, novoCusto) {
    const { data, error } = await supabase
      .from('produtos')
      .update({ preco_custo: parseFloat(novoCusto) || 0 })
      .eq('id', produtoId)
      .select();

    if (error) throw new Error("Erro ao atualizar custo: " + error.message);
    return data;
  },

  async ajustarQuantidadeLote(payload) {
    const { 
      itemId, cicloLoteId, lojaId, produtoId, usuarioId, 
      qtdAnterior, qtdNova, motivo, observacao 
    } = payload;

    let novoStatus = 'ativo';
    if (qtdNova === 0) {
      novoStatus = (motivo === 'Perda/Avaria') ? 'baixado' : 'esgotado';
    }

    const { error: errUpdate } = await supabase
      .from('lotes_validade')
      .update({ 
        quantidade: qtdNova,
        status: novoStatus
      })
      .eq('id', itemId);

    if (errUpdate) throw new Error("Erro ao atualizar quantidade: " + errUpdate.message);

    await supabase.from('auditoria_eventos').insert({
      loja_id: lojaId,
      ciclo_lote_id: cicloLoteId || null,
      lote_validade_id: itemId,
      produto_id: produtoId || null,
      usuario_id: usuarioId,
      acao: qtdNova === 0 ? 'ZERAMENTO_ESTOQUE' : 'AJUSTE_QUANTIDADE',
      qtd_anterior: qtdAnterior,
      qtd_nova: qtdNova,
      motivo: motivo,
      observacao: observacao || null
    });

    return true;
  }

};