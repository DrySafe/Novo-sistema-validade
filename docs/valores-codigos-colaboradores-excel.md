# Valores, códigos internos, equipe e Excel formatado

## Valores na tabela e nos relatórios

A coluna **Valor do saldo** fica ao lado do preço unitário e calcula quantidade existente × preço unitário atual. Cards e resumo do lote mostram a soma em R$, nos módulos de Validades, Avarias, Uso da loja e Vencidos. PDF e Excel incluem os mesmos valores e subtotais. O valor se refere aos registros do módulo exportado; ao exportar um lote filtrado, soma somente os itens correspondentes ao filtro, incluindo todas as páginas da tabela.

Os cálculos usam centavos inteiros. Sem saldo, o total é zero. Saldo positivo sem preço calculável é mostrado como Não informado, e o subtotal conhecido recebe a indicação de parcial. Preço explicitamente zero difere de preço ausente. Esses valores usam preço de venda atual: não são custo, perda realizada ou faturamento. As métricas por custo em Ações e resultados continuam separadas.

## Códigos da empresa

Novo lançamento aceita Código do produto e Cód. da Embalagem, ambos opcionais, textuais, com até 80 caracteres e zeros à esquerda preservados. Não substituem o EAN e não convertem unidades ou somam caixas automaticamente.

Ficam em `vs_itens.codigo_produto_empresa` e `vs_itens.codigo_embalagem_empresa`, vinculados ao lançamento e à loja. Não alteram o catálogo global por EAN. Aparecem na busca e identificação do produto, PDF e Excel; a aba Dados dos itens mantém colunas próprias para esses códigos. Registros anteriores permanecem sem códigos, sem inferência automática. Mantidas as regras existentes de entrada adicional e duplicidade.

## Edição e exclusão de colaboradores

Colaboradores oferece botões visíveis para Editar cadastro e acessos e Excluir colaborador. A edição altera nome, lojas, papel autorizado e liberações; o login continua fixo. Para troca de setor, edite as lojas e liberações.

A exclusão exige confirmação e motivo de 10 a 500 caracteres. É lógica: mantém a identidade, histórico, estoque e autoria; bloqueia a autorização no banco mesmo para JWT emitido antes da exclusão. Ao recarregar ou tentar novo acesso pelo app, a conta recebe a explicação de bloqueio. Não há apagamento dos lançamentos ou reutilização do login. Os excluídos saem da lista ativa e podem ser consultados em Mostrar colaboradores excluídos.

Gestor gerencia pessoas da própria empresa; administrador de loja gerencia somente colaboradores cujo conjunto completo de lojas está no seu alcance. Gestores, CEO, a própria conta e contas de outra empresa ficam protegidos. Excluídos não podem receber novas tarefas. A exclusão é registrada na auditoria e gera notificação aos Gestores. Tarefas e eventos anteriores permanecem no histórico; não são concluídos automaticamente.

## Excel

A aba principal **Resumo por lote** segue as colunas do PDF, com cabeçalhos laranja, faixas claras alternadas, separação de lotes, subtotais, total geral, cabeçalho congelado, larguras e alturas ajustadas, moeda numérica em R$ e impressão horizontal. Dados dos itens e Histórico preservam os detalhes adicionais.

ExcelJS 4.4.0 oficial, licença MIT e hash em `js/vendor`, é carregado da própria origem somente ao exportar. O app escreve `.xlsx` e não interpreta arquivos enviados. Textos são células de texto; não são transformados em fórmulas. A exportação captura dados e identificação da loja antes de carregar a biblioteca para evitar mistura ao trocar de loja durante a geração.

## Migração e validação

Migração `202611240001_codigos_e_exclusao_colaboradores.sql`: campos opcionais no lançamento e exclusão lógica no perfil; RPC autenticada e com escopo; helper privado de atividade nas autorizações; manutenção dos limites, RLS e APIs existentes. O cadastro padrão continua pelo caminho anterior, encapsulado com validação dos códigos; a função interna não é executável pelo cliente.

125 testes passaram. Navegador com CSP sem unsafe-eval validou valores, códigos, exportação real e edição/exclusão; XLSX lido com openpyxl para conferir cores, moeda, subtotais, zeros e ausência de fórmulas; PDF conferido por texto e imagem. Teste real em empresa temporária confirmou lançamento VAL com dois códigos e R$ 8,97, AV R$ 9,00 e USO R$ 5,00, troca de loja, bloqueio da loja anterior, exclusão com JWT antigo, auditoria e notificação. Empresa, produtos, lojas e usuários temporários removidos. As 27 tabelas comparadas preservaram os registros e hashes anteriores, excluindo somente os novos campos nulos e contadores de limite.
