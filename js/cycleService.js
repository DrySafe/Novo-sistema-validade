import { supabase } from './supabaseClient.js';

async getOrCreateActiveCycle(lojaId) {
    if (!lojaId) {
      console.warn("⚠️ Nenhum lojaId fornecido para buscar/gerar ciclo.");
      return null;
    }

    // 1. Busca lote ativo existente
    const { data: loteAtivo, error: errBusca } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('status', 'EM EDIÇÃO')
      .maybeSingle();

    if (errBusca) throw errBusca;
    if (loteAtivo) return loteAtivo;

    // 2. Se não existir, gera novo código via RPC/Insert
    const { data: novoLote, error: errRpc } = await supabase
      .rpc('gerar_codigo_lote', { p_loja_id: lojaId });

    if (errRpc) throw new Error("Erro ao gerar novo código de lote: " + errRpc.message);

    const { data: loteCriado, error: errCriado } = await supabase
      .from('ciclos_lotes')
      .select('*')
      .eq('id', novoLote[0].novo_id)
      .maybeSingle();

    if (errCriado) throw errCriado;
    return loteCriado;
  }

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