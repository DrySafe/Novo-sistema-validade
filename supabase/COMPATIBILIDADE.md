# Comparação com o inspect-schema enviado em 30/09/2026

## Validado localmente

Os tipos, defaults, chaves primárias/estrangeiras, constraints e o trigger de inserção de lotes enviados foram reproduzidos em `tests/fixtures/schema-real.sql`. O fluxo de entrada, revisão, vencimento e baixa parcial passou nesse esquema em PostgreSQL local (PGlite).

A migração amplia `ciclos_lotes.codigo_lote` de varchar(20) para varchar(30): o número de loja permite até 10 caracteres e os códigos VAL/diários podem chegar a 23/26 caracteres. As constraints de status e quantidade são compatíveis. O trigger `trg_validar_status_lote` atua somente em INSERT, portanto não impede revisões de saldo de itens antigos.

`agendamentos: false` indica que pg_cron não está instalado. É necessário habilitar a extensão no painel Supabase antes de executar schedule.sql.

## Bloqueio de segurança antes da produção

As políticas enviadas incluem INSERT com WITH CHECK true em usuario_lojas e perfis, além de UPDATE do próprio perfil sem restrição das colunas funcao/loja_id. Isso permite autoatribuir lojas e cargos; uma política permissiva mais restrita não anula outra mais ampla. A função antiga usuario_tem_acesso_loja também concede acesso global a administradores.

A migração de acompanhamento restringe leitura/escrita de lotes e ciclos, mas vs_acesso depende de vínculos/perfis confiáveis. Portanto a implementação ainda não garante isolamento completo enquanto essas permissões permanecerem. Antes de publicar, migrar criação de lojas, vínculos e gestão de perfis para operações autorizadas no servidor, remover permissões diretas sobre vínculos/cargos e testar onboarding/convites com os triggers de auth.users. Não basta remover políticas sem adaptar esses fluxos do frontend.

O inspect-schema recebido não lista triggers de auth.users nem privilégios GRANT ou agendamentos externos. O teste reproduz tabelas/constraints e o trigger operacional enviado; não é validação das permissões do ambiente real nem aplicação em produção.

## Atualização: inspeção e aplicação no ambiente real

Em 30/09/2026, com autorização do proprietário, as migrações de acompanhamento, acesso e privilégios foram aplicadas no ControleValidade. A view vw_regua_vencimentos foi preservada com security_invoker. Os três triggers de Auth foram inspecionados e deixaram de conceder administrador por cadastro/metadados. As escritas diretas em perfis, vínculos e lojas foram substituídas por RPCs autorizadas. Privilégios diretos padrão de anon/authenticated foram revogados explicitamente; a função interna vs_lote não pode ser chamada pelo cliente. pg_cron foi habilitado e o job diário ativado. Teste transacional no banco passou e foi revertido, sem manter itens de teste. O bloqueio descrito acima foi tratado nessas migrações; resta homologar login e cadastro de funcionários no frontend publicado.
