# ValidaSuper

Controle de validades e prevenção de perdas por loja. Frontend estático HTML/CSS/JavaScript; Supabase para autenticação, lotes, revisões e movimentações. TOTVS é uma referência operacional registrada pelo usuário: este projeto não envia preços nem importa vendas automaticamente do ERP.

## Fluxo implementado

## Interface responsiva

O layout ocupa a janela completa, com cartões em colunas adaptáveis. Desktop usa navegação lateral de 180px; no mobile há três atalhos principais e o menu Mais para Uso da loja, Avarias e Equipe. Relatórios ficam em um menu compacto. A interface tem temas claro/escuro, alvos de toque de 44px, zoom liberado, foco visível e transições que respeitam a preferência por movimento reduzido. Prévia visual verificada em Edge a 320, 390, 768 e 1440px com dados demonstrativos, sem acesso ao Supabase.

## Operação

- Uma rodada de conferência começa a cada 15 dias, ancorada na primeira rodada da loja. A rodada abre um lote VAL para novos lançamentos.
- Itens de todos os lotes VAL anteriores com saldo retornam à fila. A mudança de faixa e a mudança de rodada exigem nova revisão; uma revisão atualizada pode atender às duas pendências simultaneamente.
- Faixas: 60+, 60, 45, 30, 15 e 7 dias. No próprio dia de validade o item é tratado como vencido e deixa a visualização operacional de validade.
- Cada saída é registrada com destino e justificativa. A revisão confirma o saldo existente e registra o preço praticado, sem presumir que diferenças de contagem foram vendas.
- No vencimento o saldo vai ao lote diário VENC da data de processamento da loja, com o código original preservado em vs_itens. Baixas parciais permitem destinos diferentes até zerar o saldo.
- Histórico e relatórios Excel/PDF preservam a entrada, dias restantes, revisões, preços, referências TOTVS, responsável, saldo ao vencer e quantidades por destino. Os relatórios do painel incluem itens concluídos e transferidos; as telas operacionais mostram somente itens com saldo.
- Itens legados são identificados. Preços e quantidades iniciais que não estavam registrados não são inventados.

## Instalação no Supabase

O projeto ControleValidade foi inspecionado pelo conector Supabase em 30/09/2026. As migrações abaixo já foram aplicadas nele; não reaplicar. Para outro ambiente, execute em ordem:

1. migrations/202609300001_acompanhamento.sql: acompanhamento, eventos e preservação da view legada.
2. migrations/20260930174445_acesso_validasuper.sql: cadastro, lojas e equipe via servidor. Novas contas começam como operador; metadados do usuário não concedem cargos nem lojas. A primeira loja criada por uma conta sem vínculos atribui administração somente da nova unidade.
3. migrations/20260930175223_privilegios_e_rotina.sql: remove privilégios diretos excessivos e fixa search_path das funções. Funções internas não são endpoints públicos.
4. Publique a Edge Function gerenciar-equipe com verificação de JWT habilitada. Ela valida a sessão e o gestor antes de criar a conta do funcionário, sem trocar a sessão do navegador. Não envia convites por e-mail. Remover um membro revoga o vínculo, preservando Auth e autoria do histórico.
5. Execute schedule.sql para habilitar pg_cron e agendar a sincronização às 00:05 de São Paulo.
6. Publique o frontend atualizado: a versão antiga gravava diretamente em tabelas e não é compatível com os novos privilégios.

Os novos endpoints são vs_criar (entrada atômica), vs_painel (snapshot para telas/relatórios), vs_registrar (revisão ou movimentação) e vs_sincronizar (rodada e vencimentos). Eventos são imutáveis para o cliente. Saldo e versão são conferidos sob bloqueio para rejeitar operações desatualizadas. A rotina de teste antiga e os geradores legados deixam de ser executáveis por clientes.

## Testes

Requer Node.js 24 e npm. Execute `npm ci` e `npm test`.

Os testes usam PostgreSQL em memória (PGlite) com um esquema de referência e DOM simulado (JSDOM): limites da régua, datas brasileiras, revisões nas duas situações, preservação do lote antigo, vencimento, baixas parciais, conflito de versão, isolamento e relatórios. Isso não confirma as políticas/triggers reais do Supabase nem substitui homologação em navegador e celulares.

## Publicação na Vercel

vercel.json usa framework Other, npm run build e saída dist. O build copia somente index.html, css e js. Pode configurar SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntos na Vercel para outro ambiente; sem eles, usa o projeto público já configurado. Nunca usar service_role ou secret no frontend: o build rejeita essas chaves.

O repositório já tem deploy automático da Vercel no projeto validade_eco. Atualizações da branch do PR geram preview; publicar em produção requer promover/mesclar após testar. A URL do preview pode exigir login da Vercel.

## Validação em 30/09/2026

Nove testes locais e build passaram. No Supabase real, RPCs foram verificadas em transação autenticada: painel, entrada, VENC no próprio dia, baixa parcial e privilégios; tudo foi revertido ao final. A rotina diária está ativa. A função de equipe foi publicada, mas criação real de funcionários e login completo ainda precisam de teste em navegador autenticado. O advisor mantém avisos esperados sobre RPCs SECURITY DEFINER autenticadas e informa proteção de senhas vazadas desabilitada. Scanner e exportações seguem bibliotecas CDN e precisam de teste com dispositivo real.
