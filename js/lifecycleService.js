import { supabase } from './supabaseClient.js';
import { faixaValidade, pendencias, validarOperacao } from './lifecycleRules.js';

export const lifecycleService = {
  async carregar(loja) {
    const { data: snapshot, error } = await supabase.rpc('vs_painel', { p_loja: loja });
    if (error) throw new Error('Não foi possível carregar o acompanhamento. Verifique a migração Supabase: ' + error.message);
    snapshot.itens = snapshot.itens.map(item => {
      item.versao = item.eventos.at(-1)?.id || 0;
      item.produto_nome = item.nome_entrada || item.produtos?.nome || 'Produto sem nome';
      item.faixa = faixaValidade(item.data_vencimento);
      item.api_version = snapshot.api_version;
      item.pendencias = pendencias(item, snapshot.rodadaId);
      item.codigo_lote = item.origem_codigo;
      item.status_regua = item.vencido_em || item.faixa === 'VENC' ? 'VENCIDO' : item.faixa ? `${item.faixa} dias` : 'Sem validade informada';
      return item;
    });
    return snapshot;
  },
  async registrar(item, values) {
    if (item.api_version !== 2) throw new Error('Atualização do servidor necessária antes de registrar operações. Contate o administrador.');
    validarOperacao({ ...values, quantidadeAtual: item.quantidade, vencido: Boolean(item.vencido_em) || item.faixa === 'VENC' });
    const { error } = await supabase.rpc('vs_registrar', {
      p_item: item.id, p_saldo: values.saldo, p_preco: values.destino === 'REVISAO' ? values.preco : null,
      p_destino: values.destino, p_motivo: values.motivo.trim(), p_totvs: values.totvs || '',
      p_esperado: item.quantidade, p_versao: item.versao
    });
    if (error) throw error;
  }
};
