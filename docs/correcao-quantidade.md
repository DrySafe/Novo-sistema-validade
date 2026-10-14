# Correção segura de quantidade

A correção altera o **saldo atual**, sem apagar nem reescrever a quantidade da entrada original. Vendas, perdas e consumo realmente ocorridos são movimentações com seus próprios destinos. Diferença de contagem não deve ser presumida como venda.

## Permissões

Esta matriz é aplicada no servidor e refletida na interface. Todas as ações exigem vínculo com a loja.

| Cargo | Entradas | Movimentações | Revisar saldo/preço | Corrigir quantidade |
| --- | --- | --- | --- | --- |
| Administrador / admin | Sim | Sim | Sim | Sim |
| Gestor / gerente | Sim | Sim | Sim | Sim |
| Operador | Sim | Sim | Não | Não |
| Precificação | Não | Não | Sim | Não |
| ADM / auditoria | Não | Não | Não | Sim |

A equipe e a edição da loja seguem `vs_gestor`: administração, gestão e ADM. Somente administrador/admin cria unidades adicionais e gerencia cargos de gestão; os demais gestores cadastram/gerenciam apenas operadores, conforme as RPCs existentes.

## Como corrigir

1. Conferir fisicamente o saldo existente, considerando as saídas já registradas.
2. Um usuário autorizado abre **Corrigir quantidade** no card.
3. Informa saldo inteiro, não negativo, diferente do atual, e justificativa de pelo menos 10 caracteres.
4. Marca a confirmação com **saldo anterior → saldo novo**. Mudar o número desmarca a confirmação.
5. O servidor verifica cargo, loja, saldo e versão, bloqueia o registro e grava a identidade da sessão.
6. O card mostra número de correções, último saldo anterior/novo, responsável, data/hora e motivo. Todas ficam no histórico e nas exportações.

Novos eventos preservam nome e cargo mesmo após renomear o perfil. Eventos antigos sem nome capturado usam o nome atual do perfil, explicitamente indicado, ou o ID. Dados históricos ausentes não são inventados.

Uma operação concorrente rejeita o formulário antigo como **Registro alterado**. **Recarregar dados** permite conferir novamente antes de tentar salvar. O saldo de outra pessoa nunca é substituído automaticamente.

A correção exige nova revisão para VAL. Gestão/auditoria pode corrigir zeramento errado de item `esgotado`, preservando o evento que zerou o saldo; itens legados `baixado` não são reabertos. Saldo restaurado com validade vencida não pode ser vendido e é sincronizado para destinação.

Não há aprovação obrigatória de duas pessoas: uma pessoa autorizada pode corrigir, deixando a trilha visível. Alterar a matriz exige atualizar SQL e `js/permissions.js`.

## Outras correções

- Lote físico obrigatório separado do acompanhamento interno; duplicidade também considera lote físico.
- Nome/foto registrados por entrada, sem sobrescrever o catálogo global de outros itens.
- Localização, autor e período da rodada no histórico/relatórios; timestamps no fuso de São Paulo.
- AV/USO são filas aguardando destinação, com motivo obrigatório; entradas e saídas têm colunas distintas.
- Venda somente para VAL com validade informada e futura, validada no servidor.
- Equipe inclui vínculos secundários; editar nome/cargo não transfere a loja principal.
- Relação do perfil explicita `perfis_loja_id_fkey`, eliminando a ambiguidade PostgREST.
- Login mostra erros; senha provisória de funcionário exige 8 caracteres.
- Sem validade não recebe faixa fictícia; ativos/concluídos têm filtro; filtros e rolagem persistem na mesma visão.
- Layout em 320 px mantém datas legíveis; falhas e cancelamentos do scanner encerram a câmera.

## Implantação

1. Validar em homologação e aplicar **somente** `supabase/migrations/202610140001_auditoria_e_correcao_segura.sql`, após as quatro migrações de setembro, sem reaplicar as antigas. O arquivo é transacional e conserva registros existentes.
2. Confirmar `api_version: 2` e permissões em `vs_painel`. A migração solicita recarga do cache PostgREST. Lotes físicos descartados no passado continuam como não registrados.
3. Publicar o frontend atualizado após o SQL. Sobre API antiga, o frontend permite leitura e bloqueia entradas/operações, sem apresentar a correção como segura.
4. Homologar contas dos cargos da matriz: correção autorizada, negativa para operador, conflito de versão, auditoria no card/histórico/exportação, zeramento, avaria vencida e loja não autorizada.

A conta administrativa **do app** não permite administrar SQL. A migração foi aplicada pelo proprietário e confirmada no Supabase real em 14/10/2026 (`api_version: 2`). O frontend atualizado passou nas consultas autenticadas de painel, equipe, histórico e exportações contra esse banco; a publicação do frontend permanece pendente. A conta do app não foi usada para aplicar SQL. Não inserir `service_role` ou senha de banco no frontend.

## Validação

- `npm test`: 23 testes passaram, incluindo todas as migrações e restrições do papel `authenticated`.
- `npm run build`: passou.
- Chromium com PGlite migrado: entrada original 12, correção para 120, card com autoria/data/motivo, venda concorrente para 119 e correção desatualizada rejeitada. Saldo final 119, entrada original 12 e somente uma correção registrada.
- Interface inspecionada em 320, 390, 768 e 1440 px, sem rolagem horizontal da página nos tamanhos móveis testados.

Não foram criadas operações de estoque, usuários ou lojas no Supabase real durante a implementação.
