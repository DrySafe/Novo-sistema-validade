import { supabase } from './supabaseClient.js';

export const cycleService = {
  // 1. Obtém o lote ativo (EM EDIÇÃO) da loja. Se não existir, gera o primeiro automaticamente.
  async getOrCreateActiveCycle(lojaId) {
    if (!lojaId) throw new Error("ID da loja é obrigatório para obter o ciclo.");

    // Busca lote atualmente em edição
    const { data: loteAtivo, error } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('status', 'EM EDIÇÃO')
      .maybeSingle();

    if (error) throw error;
    if (loteAtivo) return loteAtivo;

    // Se não existir lote em edição, chama a função do PostgreSQL para gerar um novo ID imutável
    const { data: novoLote, error: errGerar } = await supabase
      .rpc('gerar_codigo_lote', { p_loja_id: lojaId });

    if (errGerar) throw new Error("Erro ao gerar novo código de lote: " + errGerar.message);

    // Retorna os dados do lote recém-criado
    const { data: loteCriado, error: errBusca } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('id', novoLote[0].novo_id)
      .single();

    if (errBusca) throw errBusca;

    // Registra evento na auditoria
    await this.registrarAuditoria({
      cicloLoteId: loteCriado.id,
      acao: 'LOTE_CRIADO',
      detalhes: { codigo_lote: loteCriado.codigo_lote }
    });

    return loteCriado;
  },

  // 2. Busca histórico de todos os lotes/ciclos da loja para a visão do Dashboard/Esteira
  async getCyclesByStore(lojaId) {
    const { data, error } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // 3. Atualiza o status do lote (Respeitando a esteira)
  async updateCycleStatus(cicloLoteId, novoStatus, usuarioId) {
    const updates = { status: novoStatus };

    if (novoStatus === 'AGUARDANDO CONFERÊNCIA') {
      updates.data_fechamento = new Date().toISOString();
      updates.fechado_por = usuarioId;
    } else if (novoStatus === 'ENVIADO PARA PRECIFICAÇÃO') {
      updates.data_enviado_precificacao = new Date().toISOString();
      updates.enviado_precificacao_por = usuarioId;
    }

    const { data, error } = await supabase
      .from('ciclos_lotes')
      .update(updates)
      .eq('id', cicloLoteId)
      .select()
      .single();

    if (error) throw error;

    await this.registrarAuditoria({
      cicloLoteId,
      usuarioId,
      acao: `STATUS_ALTERADO_${novoStatus.replace(/\s+/g, '_')}`,
      detalhes: { novo_status: novoStatus }
    });

    return data;
  },

  // 4. Registra Logs de Auditoria Imutáveis
  async registrarAuditoria({ cicloLoteId, produtoId, usuarioId, acao, detalhes }) {
    try {
      await supabase
        .from('auditoria_eventos')
        .insert({
          ciclo_lote_id: cicloLoteId || null,
          produto_id: produtoId || null,
          usuario_id: usuarioId || null,
          acao,
          detalhes: detalhes || {}
        });
    } catch (err) {
      console.warn('Falha ao registrar auditoria:', err.message);
    }
  }
};