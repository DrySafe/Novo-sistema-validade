import { supabase } from './supabaseClient.js';

export const cycleService = {

  /* ============================================================
     SEÇÃO 1: GERENCIAMENTO E CRIAÇÃO DE LOTES (VAL, AV, USO, VENC)
     ============================================================ */

  // Obtém ou cria um lote ativo por tipo ('VAL', 'AV', 'USO', 'VENC')
  async getOrCreateActiveCycle(lojaId, tipo = 'VAL') {
    if (!lojaId) {
      console.warn("⚠️ Nenhum lojaId fornecido para buscar/gerar ciclo.");
      return null;
    }

    const tipoUpper = (tipo || 'VAL').toUpperCase();

    // 1. Busca lote ativo existente do tipo específico para a loja
    // Para diários (AV, USO, VENC), busca um lote criado hoje
    const hojeStr = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('status', 'EM EDIÇÃO')
      .ilike('codigo_lote', `%${tipoUpper}%`);

    const { data: lotesAtivos, error: errBusca } = await query;
    if (errBusca) throw errBusca;

    if (lotesAtivos && lotesAtivos.length > 0) {
      // Se for diário, filtra o do dia atual se houver
      if (['AV', 'USO', 'VENC'].includes(tipoUpper)) {
        const loteHoje = lotesAtivos.find(l => l.created_at && l.created_at.startsWith(hojeStr));
        if (loteHoje) return loteHoje;
      } else {
        return lotesAtivos[0]; // Retorna o VAL em edição
      }
    }

    // 2. Se não existir, invoca a RPC para gerar um novo código de lote via banco
    const { data: novoLote, error: errRpc } = await supabase
      .rpc('gerar_codigo_lote', { p_loja_id: lojaId, p_tipo: tipoUpper });

    if (errRpc) throw new Error("Erro ao gerar novo código de lote (" + tipoUpper + "): " + errRpc.message);

    if (!novoLote || novoLote.length === 0) {
      throw new Error("RPC gerar_codigo_lote não retornou o ID do novo lote.");
    }

    // 3. Busca o registro recém-criado
    const { data: loteCriado, error: errCriado } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('id', novoLote[0].novo_id)
      .maybeSingle();

    if (errCriado) throw errCriado;
    return loteCriado;
  },

  /* ============================================================
     SEÇÃO 2: MÉTRICAS E CONSULTAS DOS CICLOS
     ============================================================ */

  async getCycleMetrics(lojaId) {
    if (!lojaId) return [];

    const { data: ciclos, error: errCiclos } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .order('created_at', { ascending: false });

    if (errCiclos) throw errCiclos;
    if (!ciclos || ciclos.length === 0) return [];

    const { data: registros, error: errReg } = await supabase
      .from('lotes_validade')
      .select('id, quantidade, data_vencimento, lote, status, ciclo_lote_id, tipo_baixa, baixado_em, origem_cadastro, lote_origem_codigo, produtos(nome, imagem_url, ean, preco_atual), perfis(nome), created_at')
      .eq('loja_id', lojaId);

    if (errReg) console.warn("Aviso ao buscar registros de lotes_validade:", errReg);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return ciclos.map(ciclo => {
      const itensLote = (registros || []).filter(r => 
        r.ciclo_lote_id === ciclo.id || r.lote === ciclo.codigo_lote
      );

      const metricas = {
        total: 0,
        d60: 0,
        d45: 0,
        d30: 0,
        d15: 0,
        d7: 0,
        vencidos: 0,
        itens: itensLote
      };

      itensLote.forEach(item => {
        const qtd = parseInt(item.quantidade || 0);
        metricas.total += qtd;

        if (item.data_vencimento) {
          const dtVenc = new Date(item.data_vencimento + 'T00:00:00');
          const diffDias = Math.ceil((dtVenc - hoje) / (1000 * 60 * 60 * 24));

          if (diffDias < 0) metricas.vencidos += qtd;
          else if (diffDias <= 7) metricas.d7 += qtd;
          else if (diffDias <= 15) metricas.d15 += qtd;
          else if (diffDias <= 30) metricas.d30 += qtd;
          else if (diffDias <= 45) metricas.d45 += qtd;
          else metricas.d60 += qtd;
        } else if (item.status === 'esgotado' || item.status === 'baixado') {
          metricas.vencidos += qtd;
        }
      });

      return {
        ...ciclo,
        metricas
      };
    });
  },

  async getCycleHistory(lojaId) {
    if (!lojaId) return [];

    const { data, error } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async updateCycleStatus(cycleId, newStatus) {
    const { data, error } = await supabase
      .from('ciclos_lotes')
      .update({ status: newStatus })
      .eq('id', cycleId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

};