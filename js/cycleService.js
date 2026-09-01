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

    // Busca o registro do lote recém-criado de forma segura com .maybeSingle()
    const { data: loteCriado, error: errCriado } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('id', novoLote[0].novo_id)
      .maybeSingle();

    if (errCriado) throw errCriado;
    return loteCriado;
  },

  /* ============================================================
     SEÇÃO 2: HISTÓRICO E ALTERAÇÃO DE STATUS DO CICLO
     ============================================================ */

  // 2.1 Lista todos os ciclos e lotes cadastrados para a loja
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

  // 2.2 Altera o status do ciclo (ex: de "EM EDIÇÃO" para "FINALIZADO")
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