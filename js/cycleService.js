import { supabase } from './supabaseClient.js';

export const cycleService = {
  async getOrCreateActiveCycle(lojaId, tipo = 'VAL') {
    if (!lojaId) return null;
    if (tipo === 'VAL') {
      const { data: rodada, error } = await supabase.rpc('vs_sincronizar', { p_loja: lojaId });
      if (error) throw error;
      const { data: info, error: errInfo } = await supabase.from('vs_rodadas').select('lote_id').eq('id', rodada).single();
      if (errInfo) throw errInfo;
      const { data, error: errLote } = await supabase.from('ciclos_lotes').select('*').eq('id', info.lote_id).single();
      if (errLote) throw errLote;
      return data;
    }
    throw new Error('Lotes diários são criados automaticamente no lançamento ou vencimento.');
  }
};
