# PDF resumido por lote

O menu Relatórios → PDF resumido gera tabelas compactas por lote, com resumo de quantidades. O histórico de cada produto deixa de criar páginas individuais. Novas páginas são abertas apenas quando o conteúdo exige; cabeçalhos e numeração se repetem.

Dentro do lote, **PDF deste lote (filtrado)** exporta todos os itens que correspondem à busca, localização, faixa e filtro de pendências. A paginação de 25/50/100 linhas não limita essa exportação. O relatório geral continua incluindo todos os registros do módulo, conforme a indicação do menu Relatórios.

Colunas: produto/EAN, lote físico/local, validade, entrada original, vendas, perdas, outras saídas, ajuste de contagem, saldo atual, preço atual e situação. Produtos vencidos com saldo ficam identificados como aguardando destinação.

- Vendas: somente eventos de venda registrados, sem dedução por diferença de saldo.
- Perdas: saídas registradas por descarte ou avaria. A entrada no módulo Avarias não é tratada como baixa.
- Outras saídas: troca, bonificação e uso da loja, separadas de perdas e vendas.
- Ajuste: aumento ou redução por correção de contagem; preserva a entrada original e não representa venda.
- Percentual vendido: vendas / (entradas originais + ajustes líquidos), calculado somente com histórico completo, base positiva e saldos reconciliados. Registros legados, sem entrada original ou com divergência recebem a marca de histórico parcial; o percentual geral fica indisponível.

O resumo refere-se ao histórico registrado dos itens exportados, até a emissão, sem limitar as saídas a uma rodada. Não altera dados do banco. Histórico completo e autoria das correções continuam disponíveis no app e no Excel.

Validação: 111 testes passaram. PDFs reais com dados fictícios: oito itens em dois lotes em uma página; 120 itens em dez páginas, com 120 EANs únicos conferidos no texto extraído. Busca filtrada exportou quarenta itens, incluindo os que estavam fora da primeira página da tabela, sem incluir os produtos excluídos. Conferência visual do PDF em A4 horizontal.
