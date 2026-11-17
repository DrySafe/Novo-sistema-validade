# Dias restantes e urgência por lote

A tabela mostrava a faixa de revisão (por exemplo, 7 dias significa o intervalo de 1 a 7 dias), embora o cálculo dessa faixa já usasse a data atual. O rótulo podia ser interpretado como uma contagem exata ou congelada na entrada.

Agora a coluna Validade mostra a data e o prazo exato: Faltam 3 dias, Vence amanhã, Vence hoje ou Vencido há N dias. A faixa aparece separadamente como intervalo, por exemplo Faixa: 1–7 dias. O cálculo usa o calendário de São Paulo.

Itens ativos com saldo que vencem em até três dias ou já venceram recebem destaque textual e borda, além de indicação junto ao nome do produto para leitura no celular. O card do lote e o resumo da tabela mostram a quantidade desses itens urgentes. Itens sem saldo ou concluídos não entram nesse alerta.

A ordenação padrão prioriza itens ativos com saldo e a validade mais próxima; concluídos ficam ao final. Há filtros de urgência para até três dias, até sete dias ou vencidos, sempre considerando somente itens ativos com saldo. Os filtros de faixa, local, pendências e busca continuam disponíveis. A faixa é recalculada na apresentação, sem usar uma faixa antiga para filtrar o produto.

Com a tela aberta, o prazo é reavaliado a cada minuto quando muda a data em São Paulo e ao receber o evento de mudança de visibilidade. Busca, filtros e paginação são mantidos. Isso atualiza somente a apresentação; saldos, rodadas, revisões, notificações e transferências continuam seguindo as regras existentes do servidor. Na data de vencimento o app mantém sua regra anterior de tratar o produto como vencido.

O PDF resumido também mostra os dias restantes na coluna Validade. O Excel preserva os dias até vencer na entrada e acrescenta Dias restantes hoje.

Validação: 122 testes passaram. Consulta somente leitura ao Supabase confirmou, em 17/11/2026, Pasta Variegato Maracujá no lote 03VAL1020260005 com vencimento em 20/11/2026, três dias restantes e duas unidades. Componente exercitado no Chromium em 320, 390 e 1366 pixels, com destaque móvel, filtro e avanço de um dia preservando a busca. PDF real gerado e texto extraído para conferir a contagem atualizada. Nenhum dado operacional foi alterado por esta entrega.
