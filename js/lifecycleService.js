import { supabase } from './supabaseClient.js';
import { faixaValidade, pendencias, validarOperacao } from './lifecycleRules.js';

export const lifecycleService = {
  async carregar(loja) {
    const { data: snapshot, error } = await supabase.rpc('vs_painel', { p_loja: loja });
    if (error) throw new Error('Não foi possível carregar o acompanhamento. Verifique a migração Supabase: ' + error.message);
    snapshot.itens = snapshot.itens.map(item => {
      item.versao = item.eventos.at(-1)?.id || 0;
      item.produto_nome = item.produtos?.nome || 'Produto sem nome';
      item.faixa = faixaValidade(item.data_vencimento || '9999-12-31');
      item.pendencias = pendencias(item, snapshot.rodadaId);
      item.codigo_lote = item.origem_codigo;
      item.status_regua = item.vencido_em ? 'VENCIDO' : `${item.faixa} dias`;
      return item;
    });
    return snapshot;
  },
  async registrar(item, values) {
    validarOperacao({ ...values, quantidadeAtual: item.quantidade, vencido: Boolean(item.vencido_em) || item.faixa === 'VENC' });
    const { error } = await supabase.rpc('vs_registrar', {
      p_item: item.id, p_saldo: values.saldo, p_preco: values.destino === 'REVISAO' ? values.preco : null,
      p_destino: values.destino, p_motivo: values.motivo.trim(), p_totvs: values.totvs || '',
      p_esperado: item.quantidade, p_versao: item.versao
    });
    if (error) throw error;
  }
};
