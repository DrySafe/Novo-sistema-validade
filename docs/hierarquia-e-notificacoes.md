# Gestor, administradores de loja e notificações

## Hierarquia e limites

| Papel | Alcance | Permissões administrativas |
| --- | --- | --- |
| CEO | Painel separado do aplicativo | Cria somente contas de Gestor com e-mail e senha inicial. Não acessa lojas, contas ou dados operacionais. Há uma única conta CEO, protegida por índice único. |
| Gestor | Todas as lojas da sua empresa | Cria lojas; cadastra colaboradores; cria ou promove administradores para uma ou mais lojas; libera pedidos de edição cadastral; aprova ou recusa solicitações. Não acessa outra empresa nem cria Gestor/CEO. |
| Administrador de loja | Somente lojas atribuídas | Gerencia colaboradores dentro desse alcance. Não cria lojas ou administradores. Pode pedir alteração cadastral por loja se o Gestor liberar; não aprova pedidos. |
| Colaborador | Lojas atribuídas e liberações operacionais | Consulta dados e executa as operações liberadas. Pode enviar comunicação à administração ou ao Gestor da loja. Não administra pessoas/lojas. |

Os atuais administradores de empresa foram migrados para Gestor, preservando IDs, lojas, logins, senhas e dados. A coluna interna `vs_empresas.administrador_id` continua identificando o Gestor para compatibilidade. Novas contas de Gestor só são provisionadas pelo CEO. Não existe promoção pública de colaborador/administrador para Gestor ou CEO.

O trabalho continua compartilhado por loja. Administradores e colaboradores não ficam limitados aos itens que eles mesmos cadastraram. Administradores têm operações de gestão de estoque e acompanhamento nas suas lojas; colaboradores seguem suas liberações.

## Gestão de pessoas

Em **Colaboradores**, o Gestor escolhe o papel Colaborador ou Administrador de loja, seleciona as lojas e, para administradores, em quais delas libera pedidos de edição cadastral. Também pode alterar o papel de uma conta existente da própria empresa. Ninguém altera o próprio papel ou o login fixo por essa tela.

O administrador vê somente as lojas sob sua administração. Um colaborador que também atende lojas fora desse alcance aparece somente com as lojas visíveis e com edição bloqueada; a gestão dessa conta fica com o Gestor. Isso impede que uma alteração em liberações globais afete outra loja silenciosamente.

Desmarcar todas as lojas suspende o acesso. Contas sem lojas são reativadas pelo Gestor. Administradores não gerenciam outros administradores nem a conta do Gestor. Novas contas, inclusive administradores e Gestores, devem trocar a senha inicial no primeiro acesso; mínimo de seis caracteres, podendo usar somente números.

## Verificação do cadastro da loja

1. O Gestor atribui o administrador às lojas e marca a liberação de edição cadastral para as unidades desejadas.
2. No perfil, o administrador abre **Solicitar alteração da loja**, modifica os campos e envia para verificação.
3. O pedido recebe **Em verificação**; os dados vigentes permanecem inalterados. A mesma loja não aceita outro pedido pendente nem edição direta enquanto houver verificação em aberto.
4. Em **Notificações**, o Gestor abre **Verificar alteração** e compara campo a campo os valores vigentes no momento do envio e os propostos.
5. Aprovar aplica as alterações em uma única transação. Recusar exige justificativa de pelo menos dez caracteres e mantém os dados atuais. A decisão fica registrada e chega ao solicitante.
6. Uma solicitação já decidida não pode ser aplicada novamente. Se os dados vigentes tiverem sido alterados fora desse fluxo, a aprovação é bloqueada; o Gestor recusa e pede novo envio.

O Gestor pode editar diretamente dados das suas lojas quando não há pedido pendente. Alterações cadastrais não mudam quantidades, preços de itens, histórico ou códigos de lotes já existentes. O número da loja continua sendo usado pelos processos atuais para gerar códigos futuros; o Gestor deve conferir esse campo na revisão.

## Central de notificações

Acesso pelo sino no topo ou **Mais → Notificações** no celular; no computador, também pelo menu lateral. Há contador de não lidas e filtros por loja, perfil de origem, tipo de registro e leitura. Paginação de cinquenta registros, leituras individuais e marcação por mensagem/página.

As mensagens respeitam a autorização atual: notificações de outra empresa ou loja sem acesso não são exibidas, mesmo que a pessoa conheça o ID. O Gestor recebe as ocorrências administrativas da empresa; administradores recebem somente das suas lojas. Comunicações direcionadas e tarefas pessoais respeitam os destinatários. Avisos manuais enviados pelo próprio usuário também ficam disponíveis para acompanhamento, enquanto ele tiver acesso à loja.

| Ocorrência | Comportamento |
| --- | --- |
| Pedido de alteração de loja | Gestor recebe a pendência; solicitante acompanha seu pedido. |
| Aprovação/recusa | Solicitante recebe a decisão; o pedido passa a exibir o resultado atualizado. |
| Cadastro e liberação de usuários | Gestor recebe registro com papel e autor; nenhuma senha é gravada nas notificações. |
| Correção de quantidade | Gestão da loja recebe alerta para conferir saldo e histórico. |
| Descarte/avaria | Resumo por dia, loja e autor, sem uma mensagem por produto. |
| Vencimento | Resumo diário por loja, identificado como Sistema, para a gestão providenciar destinação. |
| Ação atribuída | Responsável recebe aviso. |
| Ação impedida/concluída | Gestão da loja recebe confirmação ou impedimento. |
| Ação atrasada | Alerta diário para responsável e gestão; consultas repetidas não geram duplicatas nem desfazem a leitura do mesmo aviso. |
| Comunicação manual | Colaborador envia ao Gestor/administração; Gestor e administradores podem também comunicar a equipe da loja autorizada. |

Entradas, vendas e revisões rotineiras não geram alertas individuais. Isso evita excesso de mensagens em operações com muitos lançamentos. O histórico completo continua nas ferramentas já existentes. Alertas automáticos passam a ser gerados para os novos eventos; tarefas já atrasadas são identificadas quando a central/contador é consultada.

São notificações internas: atualização ao abrir e a cada minuto enquanto o app está em uso. Não há envio de e-mail, SMS ou push externo. Avisos não devem conter senhas/chaves. Alertas e mensagens não alteram estoque ou executam movimentações automaticamente.

## Segurança e migração

Migração: `202611120004_gestores_administradores_notificacoes.sql`. Quatro tabelas novas com RLS e sem escrita direta pelo cliente. Funções privadas não podem ser chamadas para forjar ator, aprovar por outro usuário ou aplicar cadastro sem decisão. As autorizações são verificadas no banco, independentemente do que a tela exibe.

A Edge Function verifica o ator pelo JWT e valida o papel e todas as lojas antes de criar o usuário Auth. A etapa final repete a autorização e consome a reserva de identidade. Cadastro não autorizado é recusado antes de criar conta. Mantidos limites de requisição, CORS restrito, CSP, tratamento de senhas e proteção contra cadastro público.

Os testes cobrem escopo por loja e empresa, único CEO, papéis, compartilhamento protegido, primeira senha, liberação de edição, cadastro vigente preservado, aprovação/recusa, repetição/conflito, autoria, leitura individual, alertas sem duplicação, XSS e escrita direta negada. O fluxo também foi exercitado no navegador com contas temporárias e Supabase real, em telas de 320 a 1366 pixels.

Validação desta entrega: 106 testes passaram; 32 funções do servidor foram comparadas com a migração final. Matriz de privilégios verificada nas 28 tabelas públicas. Testes reais confirmaram recusa de criação de Gestor/administrador por administrador de loja, rejeição de ator forjado, bloqueio de loja fora do escopo, proteção de usuário compartilhado e preservação do cadastro em recusa. Contas, lojas e notificações temporárias foram removidas; hashes de dez tabelas operacionais permaneceram iguais ao início dos testes online.
