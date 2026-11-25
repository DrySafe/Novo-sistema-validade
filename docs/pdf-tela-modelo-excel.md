# PDF para tela no modelo do Excel

O PDF resumido utiliza páginas horizontais de 360 × 202,5 mm, proporção 16:9, com preferência de abertura ajustada à página. A largura das nove colunas principais cabe na página inteira. O estilo usa tons de laranja, linhas alternadas, prazos destacados e três indicadores no topo: itens/lotes, saldo e valor atual do saldo.

A ordem é compartilhada com o Excel por `reportColumns.js`:

1. Código Winthor.
2. Código de barras.
3. Produto.
4. Data de validade.
5. Quantidade.
6. Sugestão R$.
7. Dias que faltam.
8. Preço unitário R$.
9. Valor do saldo R$.

Os campos seguintes do Excel continuam logo abaixo do produto, na mesma sequência: lote, embalagem, lote físico, localização, situação, quantidade inicial, vendas, perdas, outras saídas, ajuste, data da entrada, desconto e regra da sugestão. O lote inclui seu total em R$ para o conjunto de itens exportado; os vencidos preservam a referência ao lote de origem. Códigos e EANs mantêm os zeros à esquerda.

A sugestão usa `priceSuggestion.js`, com a mesma base, faixas, arredondamento e impedimentos do Excel. Preço atual, saldo e totais permanecem pelos valores cadastrados. Valores ausentes geram total parcial; dados históricos parciais continuam sinalizados. O rodapé apresenta os resultados já calculados, a numeração e as definições relevantes.

A paginação mede os textos antes de desenhar: em condições normais, a linha principal e os complementos do produto permanecem na mesma página. Não há redução progressiva de fonte para espremer uma lista inteira em uma página. Relatórios maiores recebem páginas de mesma largura, com cabeçalhos repetidos. Texto excepcionalmente extenso pode continuar em outra página, mantendo todo o conteúdo.

Validação: 130 testes passaram. Exportação real no Chromium com CSP restrita: oito itens em dois lotes em uma página; 120 itens com códigos e nomes longos preservados, sem separar seus complementos; e texto extenso com o final preservado em múltiplas páginas. Arquivos conferidos com PyMuPDF, proporção 16:9, posição dos textos, EANs, numeração e preferência de ajuste à página. Prévia renderizada em 1366 × 768 para conferir leitura. Não há alteração no banco ou nas permissões.
