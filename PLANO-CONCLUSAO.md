# ValidaSuper

Webapp de prevenção de perdas para supermercados: organiza conferências de validade por loja e ciclo, consulta produtos por EAN, registra quantidades e permite exportar relatórios. Frontend estático em HTML/CSS/JavaScript, Supabase para autenticação e persistência, publicação indicada na Vercel.

## Correções iniciais
- renderPerdasCards voltou ao escopo do módulo, evitando ReferenceError durante a inicialização.
- Implementado showLoginScreen.
- Cabeçalho usa a loja ativa e o ID correto do seletor.
- Removida consulta indiscriminada a todas as lojas como fallback; seleção salva é validada contra os vínculos carregados. Isso não substitui RLS.

## Pendências para concluir
1. Versionar esquema, migrations, políticas RLS e RPCs do Supabase. Validar isolamento entre lojas e permissões de gestor no banco.
2. Implementar renderEquipeCards, openCycleDetails, renderCycleModalItems e finalizarCicloAtual, hoje referenciados sem implementação.
3. Unificar perdas: createEntry grava em lotes_validade inclusive AV/USO, mas getRegistrosPerdas consulta registros_perdas. Definir tabela canônica e preservar motivo, setor e rastreabilidade.
4. Tornar baixa e auditoria uma transação no banco, com controle de concorrência. Hoje há duas operações e erros de auditoria são ignorados.
5. Corrigir cadastro com confirmação de e-mail e gestão de colaboradores. signUp no cliente principal pode trocar a sessão do gestor; convite deve passar por backend autorizado.
6. Uniformizar datas: hoje UTC, horário local e lte/lt discordam sobre vencimento no dia atual. Exportações também podem exibir o dia anterior.
7. Validar quantidades, duplicidades por produto/validade/local e impedir envios simultâneos.
8. Restaurar ações de ajuste/baixa e badges nos cards de validade; revisar exportações por loja/setor e dados desatualizados.
9. Remover a simulação de virada da operação normal, disponibilizar scanner compatível e consolidar CSS conflitante.
10. Validar ponta a ponta: cadastro, confirmação, login, onboarding, duas lojas, EAN, validade, perdas, baixa, auditoria, encerramento e exportações.

## Validação desta etapa
node --check js/app.js passou. Teste local em VM confirmou avaliação do módulo sem ReferenceError, retorno ao login e renderização do estado vazio de perdas. Não foram acessados dados de produção nem verificadas RLS/RPCs; não é confirmação de funcionamento ponta a ponta.
