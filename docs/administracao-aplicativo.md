# Administração do aplicativo e empresas

Esta versão exige a migração de 16/10/2026 e sua correção `202610160002_reserva_identidade_auth.sql`, além da nova Edge Function antes do frontend. Não publicar o frontend sozinho: ele recusa entrar em um servidor sem `vs_contexto_acesso`.

## Hierarquia

- Dono do aplicativo: tabela `vs_donos`, alterável somente pelo servidor/SQL administrativo. Cadastra empresas e os respectivos administradores com e-mail. O cargo `administrador` antigo não concede esse poder.
- Administrador da empresa: uma conta responsável por cada empresa; cria quantas lojas precisar, cria funcionários sem e-mail de contato e escolhe lojas e liberações. Não cria outros administradores de empresa.
- Funcionário: login único de 3 a 40 caracteres (`a-z`, números, ponto, hífen e sublinhado); consulta apenas lojas atribuídas. Entradas, movimentações, revisões e correções têm liberações independentes. Nenhuma dessas liberações permite criar lojas ou usuários.
- Todos podem trocar a própria senha após informar a senha atual. Login não é editável, inclusive por chamada direta ao Auth. Senhas iniciais/novas: pelo menos 12 caracteres e no máximo 72 bytes em UTF-8, compatível com o bcrypt do Auth; acentos e emojis podem exigir uma senha mais curta. A política adicional do Supabase também se aplica.

O Supabase Auth usa um identificador de e-mail técnico para funcionários (`login@usuarios.validasuper.invalid`). Não é um endereço de contato, não é solicitado ao funcionário e não envia mensagens. Na tela, ele informa somente login e senha. Administradores de empresa usam seu e-mail. As contas antigas continuam usando o e-mail atual; a migração não reinventa credenciais nem exige alteração de senha.

## Implantação

1. Fazer backup e testar em homologação com as mesmas tabelas/triggers do projeto. Verificar as cinco migrações anteriores aplicadas.
2. Em Authentication > configuração de cadastro, desativar a criação pública de usuários. Manter apenas os provedores de autenticação usados pelo produto (e-mail/senha). A migração também acrescenta uma proteção no banco para rejeitar chamadas diretas de cadastro.
3. Executar `supabase/migrations/202610160001_administracao_aplicativo.sql` e depois `supabase/migrations/202610160002_reserva_identidade_auth.sql`, uma vez cada, como administrador do banco, no SQL Editor. É uma transação. Não reaplicar nem editar as migrações anteriores.
4. Executar `supabase/ativar-dono.sql`. Ele procura a conta **já existente e confirmada** `danielregisrj@gmail.com` e a promove a dono. Se não existir, criar/confirmar essa conta pelo painel administrativo do Supabase antes de executar a migração que fecha cadastros; o script não cria nem altera senha. Conferir esse e-mail antes de executar.
5. Publicar a função: `supabase functions deploy gerenciar-equipe --project-ref uuwdajgkbmaqbzqhsoid`. Usar a chave administrativa apenas nos segredos da Edge Function; o ambiente hospedado do Supabase disponibiliza `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Nunca usar essa chave no build/VITE/browser. O handler valida o JWT do solicitante com `auth.getUser` e a hierarquia no banco.
6. Publicar o frontend (`npm run build`, saída `dist`). Entrar com a conta do dono e clicar no avatar (**Minha Conta & Gestão**) e abrir **Administrar aplicativo**.
7. Para a empresa já em uso, marcar **Vincular conta já existente**, informar o e-mail do administrador e selecionar **todas** as lojas pertencentes àquela empresa na lista de migração. Isso preserva a senha e os registros. O servidor rejeita lojas já vinculadas e vínculos de funcionários que atravessam a seleção. Revisar essas associações antes de tentar novamente; não há transferência silenciosa de loja ou empresa.
8. Para uma empresa nova, informar nome da empresa, e-mail e senha inicial do administrador. Este entra com seu e-mail e cadastra a primeira loja. Em **Minha Conta & Gestão > Liberações** ou **Equipe**, adiciona funcionários e escolhe lojas/operações. Remover todas as lojas de um funcionário suspende o acesso aos dados sem apagar o histórico.

As lojas e contas legadas não são agrupadas automaticamente: acesso aos dados e operações existentes é preservado enquanto o dono migra cada empresa explicitamente. Contas legadas não podem criar novas lojas ou usuários pelo novo fluxo. Ao migrar lojas, as liberações dos funcionários existentes são preenchidas conforme o cargo anterior e passam a ser editáveis. Somente o responsável selecionado torna-se administrador da empresa.

O frontend não cria banco/projeto Supabase por empresa. As empresas compartilham o projeto, com isolamento por empresa, loja, vínculo e RLS. Ser dono do aplicativo não concede automaticamente leitura operacional de todas as lojas; o painel do dono lista empresas e permite a migração administrativa.

## Proteções e limites

- Cadastro por Auth Admin usa uma reserva curta de UUID, criada somente pelo servidor e vinculada ao e-mail de acesso. A API Auth Admin recebe esse UUID na criação; o trigger consome a reserva no INSERT. O GoTrue aplica `app_metadata` depois do INSERT, portanto a autorização não depende desses metadados. `user_metadata` não autoriza cadastro ou elevação. Reservas são consumidas uma única vez e canceladas/expiram.
- RPCs de provisionamento recebem o ator validado pelo servidor e só podem ser chamadas por `service_role`. Usuários autenticados não podem forjar esse ator.
- Vínculos e liberações são salvos juntos em transação, validados contra a empresa e auditados com autor, data, lojas e permissões anteriores/novas. Identidade e cargo não são definidos pelo funcionário.
- Criação no Auth e vínculo no banco são duas operações: falha no vínculo tenta excluir apenas a conta recém-criada. Contas existentes nunca são excluídas ou têm senha redefinida por essa compensação. Uma conta órfã não recebe lojas/acessos; se a compensação falhar, a operação requer conferência administrativa no Supabase.
- Os dados já carregados no navegador não podem ser apagados remotamente de uma sessão aberta. Cada nova leitura/gravação consulta permissões vigentes no servidor. Revogar lojas ou operações impede novas ações imediatamente no banco.
- Recuperação de senha de funcionários sem e-mail não é pública. Nesta versão, o usuário precisa conhecer a senha atual para trocá-la; um fluxo administrativo de redefinição ainda não está incluído. Não excluir/recriar contas para trocar senha, pois preservam a autoria.

## Verificação

Os testes `company-access.test.js` aplicam **todas** as migrações com PostgreSQL em memória e verificam o bloqueio de cadastro público, UUID reservado, hierarquia, RPCs, RLS em consultas diretas, lojas e permissões. `account-handler.test.js` verifica a fronteira da Edge Function, ator do JWT e compensação. `access-admin-ui.test.js` verifica login, reautenticação, ausência de cadastro público e edição de liberações.

Os testes de quantidade também aplicam todas as migrações e usam uma empresa com lojas e funcionários migrados, verificando a preservação de auditoria, preços, isolamento e conflitos de versão.

## Implantação de 16/10/2026

As migrações `202610160001` e `202610160002` foram aplicadas no projeto real, o cadastro público foi desativado e a conta confirmada `danielregisrj@gmail.com` foi ativada como dona do aplicativo. A segunda migração adapta a reserva de identidade à ordem real de gravação do GoTrue: UUID antes do INSERT; `app_metadata` somente depois dele.

A função `gerenciar-equipe` foi publicada pela Management API com verificação de JWT habilitada. O token administrativo foi usado apenas por HTTPS para `api.supabase.com`, sem ser incluído nos arquivos do aplicativo. Cópias locais privadas dos dados operacionais e da função anterior foram preservadas fora do repositório. As lojas antigas continuam aguardando associação explícita às empresas pelo dono; não houve agrupamento automático.

A homologação real com contas temporárias verificou cadastro de empresa, múltiplas lojas, funcionário sem e-mail de contato, RLS em consulta direta, bloqueio de outras lojas, negativas de criação/autoelevação, mudança de loja permitida, troca da própria senha, suspensão e bloqueio do cadastro público. Os dados de homologação foram removidos ao fim. O frontend local foi conferido com a conta real do dono no Chromium em 320, 390, 768 e 1440px, sem erros de JavaScript ou transbordamento horizontal.
