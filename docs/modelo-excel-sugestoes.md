# Modelo aprovado de Excel e sugestão de preço

A exportação do app usa o modelo aprovado com estes sete primeiros cabeçalhos, nesta ordem:

1. CÓDIGO WINTHOR — Código do produto (empresa), sem inferir a partir do EAN.
2. CÓDIGO DE BARRAS — EAN, como texto para preservar zeros.
3. PRODUTO.
4. DATA DE VALIDADE — data nativa do Excel.
5. QUANTIDADE — saldo existente.
6. SUGESTÃO R$ — preço unitário sugerido.
7. DIAS QUE FALTAM — dias reais em São Paulo na emissão, VENCE HOJE, VENCIDO ou SEM VALIDADE.

As informações adicionais vêm depois: preço unitário atual, valor do saldo, lote, embalagem, lote físico, localização, situação, entrada original, vendas, perdas, outras saídas, ajuste, data de entrada, percentual e regra da sugestão. O primeiro relatório é uma tabela contínua para filtrar e ordenar sem linhas de subtotal misturadas aos produtos. Há cabeçalhos laranja, linhas alternadas, indicação de urgência, altura/largura ajustadas e congelamento das três primeiras colunas e das sete primeiras linhas. Dados ordenados pela validade mais próxima; sem validade ao final.

Totais por lote ficam em uma aba própria, com total geral e cobertura dos preços. Dados dos itens e Histórico continuam disponíveis. Totais sempre usam saldo × preço atual registrado; não são projeções pelo preço sugerido.

## Regra de desconto

| Dias restantes | Desconto sobre o preço atual |
| --- | --- |
| Acima de 60 | 0%, manter preço atual |
| 46 a 60 | 5% |
| 31 a 45 | 10% |
| 16 a 30 | 15% |
| 1 a 15 | 40% |
| Vence hoje ou já venceu | Sem sugestão de venda |

De 1 a 7 dias permanece a regra de até 15 dias, com 40%. O cálculo considera a data atual, não a entrada do lote. A base é o preço atual informado do item; preços históricos permanecem nas informações adicionais. Cálculo em centavos inteiros, com arredondamento de meio centavo para cima, sem modificar o objeto original.

Avarias, uso da loja, produtos já transferidos a vencidos, sem validade, sem preço calculável ou sem saldo ativo ficam sem preço sugerido. A última coluna explica a razão. Na data de vencimento, permanece a regra existente do app de não permitir venda.

Exemplo com preço atual R$ 100: a sugestão será R$ 95, R$ 90, R$ 85 ou R$ 60, conforme a faixa. A exportação é uma referência: não muda o preço cadastrado, estoque, promoções, permissões ou ERP. O arquivo contém valores calculados na emissão, sem fórmulas executáveis. Não há migração SQL nesta entrega.

## Validação

128 testes passaram, incluindo limites 61/60, 46/45, 31/30, 16/15, 7/1/0 e vencidos, arredondamento, AV/USO, dados ausentes, preservação do preço e do item, ordem do cabeçalho e totais pelo preço atual. Exportação real no Chromium com CSP sem unsafe-eval; arquivo relido com openpyxl para conferir sugestões, valores monetários, datas, zeros à esquerda, filtros, congelamento, abas e cores. Trocar loja e preço durante a geração não alterou o snapshot do relatório. Nenhum registro de produção foi alterado.
