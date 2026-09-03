import { supabase } from './supabaseClient.js';

export const cycleService = {

  /* ============================================================
     SEÇÃO 1: CONSULTA E GERAÇÃO DE CICLOS DE LOTE
     ============================================================ */

  // 1.1 Obtém o lote ativo no estado "EM EDIÇÃO" ou gera um novo código via RPC
  async getOrCreateActiveCycle(lojaId) {
    if (!lojaId) {
      console.warn("⚠️ Nenhum lojaId fornecido para buscar/gerar ciclo.");
      return null;
    }

    // Busca lote ativo existente para a loja
    const { data: loteAtivo, error: errBusca } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('status', 'EM EDIÇÃO')
      .maybeSingle();

    if (errBusca) throw errBusca;
    if (loteAtivo) return loteAtivo;

    // Se não existir, invoca a RPC para gerar um novo código de lote
    const { data: novoLote, error: errRpc } = await supabase
      .rpc('gerar_codigo_lote', { p_loja_id: lojaId });

    if (errRpc) throw new Error("Erro ao gerar novo código de lote: " + errRpc.message);

    if (!novoLote || novoLote.length === 0) {
      throw new Error("RPC gerar_codigo_lote não retornou o ID do novo lote.");
    }

    // Busca o registro do lote recém-criado de forma segura
    const { data: loteCriado, error: errCriado } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('id', novoLote[0].novo_id)
      .maybeSingle();

    if (errCriado) throw errCriado;
    return loteCriado;
  },

  /* ============================================================
     SEÇÃO 2: MÉTRICAS QUINZENAIS E AUDITORIA DA RÉGUA
     ============================================================ */

  // 2.1 Obtém o histórico de ciclos com contagem consolidada por régua
  async getCycleMetrics(lojaId) {
    if (!lojaId) return [];

    // 1. Busca os ciclos registrados para a loja
    const { data: ciclos, error: errCiclos } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .order('created_at', { ascending: false });

    if (errCiclos) throw errCiclos;
    if (!ciclos || ciclos.length === 0) return [];

    // 2. Busca todos os lançamentos de validade vinculados à loja
    const { data: registros, error: errReg } = await supabase
      .from('registros_validade')
      .select('id, quantidade, data_vencimento, lote, status, produtos(nome, imagem_url, ean, preco_atual), perfis(nome), created_at')
      .eq('loja_id', lojaId);

    if (errReg) console.warn("Aviso ao buscar registros de validade:", errReg);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // 3. Agrupa e calcula as contagens de régua por lote
    return ciclos.map(ciclo => {
      const itensLote = (registros || []).filter(r => r.lote === ciclo.codigo_lote);

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
        } else if (item.status === 'VENCIDO') {
          metricas.vencidos += qtd;
        }
      });

      return {
        ...ciclo,
        metricas
      };
    });
  },

  /* ============================================================
     SEÇÃO 3: HISTÓRICO E ALTERAÇÃO DE STATUS
     ============================================================ */

  // 3.1 Lista todos os ciclos cadastrados para a loja
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

  // 3.2 Altera o status do ciclo (ex: de "EM EDIÇÃO" para "FINALIZADO")
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