# ValidaSuper

Controle de validades e prevenção de perdas por loja. Frontend estático HTML/CSS/JavaScript; Supabase para autenticação, lotes, revisões e movimentações. TOTVS é uma referência operacional registrada pelo usuário: este projeto não envia preços nem importa vendas automaticamente do ERP.

## Fluxo implementado

- Uma rodada de conferência começa a cada 15 dias, ancorada na primeira rodada da loja. A rodada abre um lote VAL para novos lançamentos.
- Itens de todos os lotes VAL anteriores com saldo retornam à fila. A mudança de faixa e a mudança de rodada exigem nova revisão; uma revisão atualizada pode atender às duas pendências simultaneamente.
- Faixas: 60+, 60, 45, 30, 15 e 7 dias. No próprio dia de validade o item é tratado como vencido e deixa a visualização operacional de validade.
- Cada saída é registrada com destino e justificativa. A revisão confirma o saldo existente e registra o preço praticado, sem presumir que diferenças de contagem foram vendas.
- No vencimento o saldo vai ao lote diário VENC da data de processamento da loja, com o código original preservado em vs_itens. Baixas parciais permitem destinos diferentes até zerar o saldo.
- Histórico e relatórios Excel/PDF preservam a entrada, dias restantes, revisões, preços, referências TOTVS, responsável, saldo ao vencer e quantidades por destino. Os relatórios do painel incluem itens concluídos e transferidos; as telas operacionais mostram somente itens com saldo.
- Itens legados são identificados. Preços e quantidades iniciais que não estavam registrados não são inventados.

## Instalação no Supabase

A comparação com o esquema real enviado está em `supabase/COMPATIBILIDADE.md`. Tipos/constraints e o trigger operacional passaram no teste local; as políticas existentes de vínculos e cargos apresentam um bloqueio de segurança que precisa ser resolvido antes da produção.

1. Faça backup e aplique primeiro em homologação. A migração assume IDs UUID, os campos usados pelo frontend e as funções legadas fornecidas pelo proprietário. As definições completas de tabelas, constraints e triggers ainda devem ser comparadas ao ambiente real.
2. Execute `supabase/migrations/202609300001_acompanhamento.sql` como dono do banco. A transação aborta se houver incompatibilidade ou códigos de lote duplicados. Não reaplique uma migração já concluída.
3. Habilite a extensão pg_cron e execute `supabase/schedule.sql`. O agendamento diário roda às 00:05 de São Paulo. A abertura do app também sincroniza, mas sem o agendamento não há processamento independente de usuários conectados.
4. Publique o frontend somente depois da migração. A versão anterior escrevia diretamente em tabelas; a nova migração remove essas permissões para lotes/ciclos e usa RPCs transacionais.
5. Confirme vínculos em usuario_lojas/perfis. Os novos endpoints verificam a loja autorizada; revise as políticas antigas de edição desses vínculos e perfis para impedir autoatribuição de lojas/cargos. A autorização global de administrador das funções antigas não é usada neste acompanhamento.
6. Confira triggers existentes, especialmente validar_status_lote_para_insercao: se estiver ligado também a UPDATE, verifique compatibilidade com o acompanhamento de lotes antigos. Alterações de preços/saldo usam vs_registrar.

Os novos endpoints são vs_criar (entrada atômica), vs_painel (snapshot para telas/relatórios), vs_registrar (revisão ou movimentação) e vs_sincronizar (rodada e vencimentos). Eventos são imutáveis para o cliente. Saldo e versão são conferidos sob bloqueio para rejeitar operações desatualizadas. A rotina de teste antiga e os geradores legados deixam de ser executáveis por clientes.

## Testes

Requer Node.js 24 e npm. Execute `npm ci` e `npm test`.

Os testes usam PostgreSQL em memória (PGlite) com um esquema de referência e DOM simulado (JSDOM): limites da régua, datas brasileiras, revisões nas duas situações, preservação do lote antigo, vencimento, baixas parciais, conflito de versão, isolamento e relatórios. Isso não confirma as políticas/triggers reais do Supabase nem substitui homologação em navegador e celulares.

## Fora desta alteração

Gestão de colaboradores e onboarding continuam usando o fluxo anterior e precisam de validação separada de convites e permissões. Scanner e bibliotecas de exportação seguem as dependências CDN existentes.
