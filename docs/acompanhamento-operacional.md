# Ações e resultados (extensão de acompanhamento)

A extensão acrescenta posições opcionais, ações preventivas e indicadores. As regras de `vs_criar`, `vs_registrar`, ciclos de 15 dias, quantidades, revisão e vencimento permanecem as mesmas. Dados existentes não recebem posição, custo, tarefas ou resultados inventados.

## Uso

- **Ações e resultados → Posições e rotina:** a gestão cadastra gôndolas, corredores, pontas, ilhas, câmaras e outros pontos. Nomes são únicos por loja, têm IDs e podem ser desativados; não se renomeia uma posição histórica.
- **Novo lançamento → Posição da loja:** opcional. Sem seleção, mantém Gôndola/Depósito e o fluxo anterior. A posição selecionada define o texto de localização daquele registro.
- **Acompanhar**, na tabela do lote: planejar ação, consultar seu histórico, informar custo (gestão) ou atualizar a posição do registro inteiro (permissão de movimentação). A mudança de posição é auditada e não transfere parte da quantidade, não altera saldo e não gera venda. Remanejamento parcial pode ser planejado como ação; sua movimentação de quantidades continua exigindo o processo atual, sem criar um recebimento fictício.
- **Nova ação:** tipo, produto opcional, orientações, prazo e responsável. A gestão atribui pessoas com acesso à loja; operadores criam para si. Somente responsável ou gestão atualizam; somente gestão cancela ou reabre encerradas. Resultado/justificativa de ao menos 10 caracteres, versão e autoria são exigidos.
- Concluir ação não altera saldo, preço, promoção no ERP ou revisão. Esses registros permanecem nas opções atuais. Uma ação de desconto registra planejamento/execução informada, não publica promoção automaticamente.
- A fila de produtos combina pendências atuais com uma janela complementar (padrão 15 dias) e frequência de conferência (padrão 1 dia). A gestão pode configurar. Não altera as faixas ou ciclos existentes e não envia push/e-mail.

## Entrada adicional e compatibilidade

O novo formulário usa `vs_criar_acomp`: procura estoque ativo com mesmo EAN, lote físico, validade e localização em todas as rodadas. Exibe os registros e oferece consultar o existente ou confirmar uma entrada adicional com justificativa e confirmação física. A entrada adicional continua criando outra linha, sem somar nem corrigir o registro antigo; há evento separado de acompanhamento identificando o motivo e os registros relacionados.

A RPC original `vs_criar` foi preservada para compatibilidade com clientes anteriores. Portanto, essa extensão não constitui uma proibição global de duplicidades em integrações antigas; o aviso e o registro da entrada adicional pertencem ao novo formulário/endpoint. Os controles de permissão de lançamento existentes continuam no servidor. Não há como comprovar fisicamente um recebimento apenas pelo software.

## Custos e indicadores

Custos unitários são opcionais e restritos à gestão. Não alteram preço de venda nem o custo do catálogo global. O risco financeiro usa o custo atual informado por registro. Eventos futuros capturam o custo que estiver informado naquele momento; atualizar custo posteriormente não reprecifica saídas antigas. Não há backfill de custos históricos desconhecidos.

Indicadores distinguem unidades a vencer, vencidas com saldo, descarte total, descarte de itens já vencidos, vendas informadas, saídas por avaria e execução de ações. Um descarte classificado como vencido é aquele cuja data de operação já alcançou a data de validade, conforme a política atual do app. Não significa automaticamente que o motivo exclusivo da perda tenha sido a validade.

Valores financeiros são parciais e exibem cobertura sem custo. Custo ausente não é zero. Vendas informadas não são rotuladas como perdas evitadas. A posição em risco é atual, não uma reconstrução histórica. Descartes e conclusões podem ser comparados com período anterior de mesma duração; o sistema não fabrica série histórica de estoque.

Excel e PDF incluem indicadores, ações por prazo/conclusão no período e auditoria complementar. Os relatórios atuais de saldo e eventos operacionais permanecem disponíveis. O relatório novo não substitui os registros existentes.

## Implantação e validação

Aplicar `supabase/migrations/202610200001_acompanhamento_operacional.sql` e, em seguida, `202610200002_indices_acompanhamento.sql` antes de publicar o frontend. A migração é transacional e adiciona tabelas com RLS, RPCs autorizadas, coluna opcional de posição e trigger de captura de custo em eventos futuros. Escrita direta e adulteração da auditoria são negadas; CEO e usuários de outra loja não acessam os novos dados. Nenhum segredo é enviado ao frontend.

`npm test` executa regressões de mercado e testes da extensão, incluindo versões, isolamento, conclusões sem efeitos no estoque, custo histórico e fronteiras de data em São Paulo. A publicação deve ser validada com contas/lojas temporárias e limpeza posterior. Não executar scripts de volume em dados reais.
