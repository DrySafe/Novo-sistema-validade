# Área Administrativa do CEO

O rodapé da tela pública tem o link **Área Administrativa**, que abre `admin.html` em outra aba. A conta CEO autorizada é `danielregisrj@gmail.com`. O login do CEO é separado do login operacional das empresas; cada aba administrativa usa sessão própria em `sessionStorage`, com chave diferente da sessão operacional e das outras abas administrativas.

## O CEO somente cadastra

O painel apresenta somente **e-mail e senha inicial do novo ADM**. Não pede nome de empresa, não cadastra nem seleciona lojas, não lista contas ou empresas, não vincula contas existentes e não oferece edição, redefinição de senha ou acesso à conta criada. A mesma restrição vale para as RPCs e consultas diretas ao banco, inclusive se o CEO tiver vínculos antigos com lojas.

O servidor cria automaticamente um espaço isolado para o novo administrador. Esse registro interno é a fronteira de isolamento, sem uma tela de criação de empresa no CEO. Ao entrar pelo acesso normal, o ADM precisa substituir a senha inicial por uma senha pessoal antes de criar lojas ou funcionários. Ele próprio organiza suas unidades e define as lojas e liberações dos funcionários.

A senha inicial é temporária e conhecida por quem a define. Quem possui uma credencial válida pode se autenticar com ela; o sistema separa identidades e privilégios, não identifica a pessoa física que digitou a senha. Depois de o responsável definir sua senha pessoal, a Área Administrativa não fornece meios de consultá-la, redefini-la ou entrar naquela conta. Credenciais administrativas de infraestrutura do Supabase continuam sendo um acesso distinto, fora deste painel do aplicativo.

## Empresas e funcionários

- O ADM de empresa cria lojas e funcionários no acesso operacional. Cada funcionário consulta somente lojas atribuídas.
- **Liberações** autoriza entradas, movimentações, revisões e correções de quantidade, sem permitir ao funcionário criar outra empresa ou se tornar ADM.
- Funcionários novos usam login único de 3 a 40 caracteres (`a-z`, números, ponto, hífen e sublinhado) e senha, sem e-mail de contato. O Auth utiliza internamente `login@usuarios.validasuper.invalid`; não envia mensagens.
- Login não é editável. Todos podem trocar sua própria senha; senhas têm pelo menos 12 caracteres e até 72 bytes UTF-8, de acordo com o Auth.
- Retirar todas as lojas de um funcionário suspende seu acesso aos dados e conserva o histórico.

As contas e lojas existentes são preservadas. O CEO perde a consulta operacional inclusive de seus vínculos legados. A Área Administrativa não faz migrações ou transferências de dados para contas novas; qualquer reorganização dos registros antigos exige uma tarefa administrativa específica e identificação explícita do responsável, sem criar cópias nem misturar empresas.

## Implantação

As migrações anteriores permanecem imutáveis. Para uma instalação que já recebeu `202610160001` e `202610160002`:

1. Aplicar `supabase/migrations/202610160003_ceo_somente_cadastro.sql` em transação, usando acesso administrativo ao projeto.
2. Publicar a versão atual de `gerenciar-equipe`. O endpoint aceita `acao: "administrador"` com somente e-mail e senha para o CEO, e `acao: "funcionario"` para administradores de empresa autorizados.
3. Publicar o frontend completo, incluindo `admin.html`, `js/ceo.js`, `js/ceoClient.js` e o módulo público `js/supabaseConfig.js`. O build recusa chaves administrativas no frontend.
4. Validar o rodapé, login exclusivo do CEO, negativas de acesso às lojas e primeiro acesso de um novo ADM.

O cadastro público permanece desativado no Supabase Auth e também protegido por trigger. A reserva de UUID de uso único é criada somente pelo servidor e consumida no INSERT de Auth. A migração atual registra a origem desse cadastro em uma tabela privada; a criação de ADM exige prova de uma conta nova, criada pelo CEO, sem vínculos ou reaproveitamento de usuário existente. Metadados fornecidos pelo usuário não concedem privilégios.

A senha pessoal é reconhecida por trigger quando o Auth efetivamente altera o hash da senha. A alteração do campo de controle no perfil não é permitida ao usuário. Antes disso, as RPCs de operação e criação de lojas/funcionários permanecem bloqueadas.

Use `SUPABASE_ACCESS_TOKEN` somente pela Management API em `api.supabase.com`. As chaves privadas da Edge Function ficam no servidor. Não usar `service_role` ou tokens administrativos em variáveis `VITE_`, no código público, em logs ou em arquivos do repositório.
