# Auditoria de segurança — ValidaSuper

## Escopo e decisão de acesso

Revisão do frontend, build, autenticação, Edge Function `gerenciar-equipe`, RPCs, privilégios e políticas no Supabase, dependências e rotas públicas. A regra confirmada pelo titular é **compartilhamento nas lojas autorizadas, com isolamento entre lojas/empresas**, sem restringir o estoque ao funcionário que fez o lançamento. O CEO permanece separado da operação. Dados financeiros complementares continuam restritos à gestão.

As páginas e scripts são recursos públicos; os dados operacionais exigem sessão e autorização no servidor. Alterações de estoque, tarefas, perfis e acessos passam pelos RPCs autorizados. Não foi criada exclusão livre de registros: histórico e auditoria permanecem preservados.

## Achados e correções

| Achado | Risco | Medida aplicada |
| --- | --- | --- |
| Privilégios antigos permitiam escrita direta em produtos e tabelas legadas | Alteração fora da validação e da auditoria das operações | Revogadas escritas diretas de `authenticated` e permissões de `PUBLIC`/`anon` em tabelas e sequências; RPCs continuam com autorização por loja/operação |
| Política permissiva antiga liberava leitura global da auditoria a autenticados | Consulta de registros de outras lojas | Políticas restritivas por `vs_acesso(loja_id)` para auditoria antiga, perdas e promoções, inclusive diante de políticas permissivas antigas |
| Catálogo e painel incluíam preço global de produto | Informação comercial de outra loja com o mesmo EAN | Leitura do catálogo limitada a produtos de lojas autorizadas e às colunas públicas; painel usa nome/foto da entrada e remove o preço global do catálogo, preservando o preço do item da própria loja |
| CORS `*`, pouca validação de corpo no cadastro | Superfície desnecessária e consumo excessivo de recursos | Origens explícitas, JWT obrigatório, ator obtido do Auth, JSON limitado a 16 KiB, validação de UUIDs, quantidade de lojas, liberações e campos antes de criar Auth |
| Ausência de limite próprio nas operações e cadastros | Automação abusiva com uma conta válida | Contador transacional privado por usuário/ação; HTTP 429; implementações internas sem execução direta pelo cliente |
| CSP permitia scripts inline, eval e origens HTTPS genéricas | Maior impacto de XSS e dependência de scripts remotos | Scripts locais versionados; `script-src 'self'`, `script-src-attr 'none'`, sem eval; eventos ligados por código; fontes, imagens, conexão e câmera com origens/permissões limitadas |
| Logs do app incluíam objetos de erro e leitura de código de barras | Exposição desnecessária no console | Logs de diagnóstico removidos do código próprio, debug do Auth desativado; erros de conta retornam mensagem/código público sem corpo, senha ou token |
| Dependência transitiva de teste com alertas | Vulnerabilidades no ambiente de desenvolvimento | `undici` atualizado no lockfile para 7.30.2; npm audit com zero alertas no momento da validação |
| Build mantinha arquivos antigos e não verificava credenciais | Publicação acidental de arquivo obsoleto/segredo | `dist` recriado, artefatos verificados para padrões de chaves privadas e JWT não público; build falha sem imprimir valores |

## Chaves e ambiente

- O frontend contém a URL do projeto e uma chave **anon pública**. Isso é necessário para o SDK e não concede papel administrativo. A proteção dos dados está no JWT do usuário, nos grants, nas RLS e nas verificações dos RPCs.
- Não foram encontrados tokens privados nos padrões pesquisados no código e em 343 blobs de texto do histórico anterior à auditoria. Isso não substitui inventário/rotação no provedor se houver evidência de vazamento fora do repositório.
- Nenhum `.env` está versionado. Credenciais de teste e `SUPABASE_ACCESS_TOKEN` ficam nas configurações do ambiente; o token administrativo só é enviado ao Management API, com proxy e TLS preservados.
- `SUPABASE_SERVICE_ROLE_KEY` é lida exclusivamente na Edge Function. Não há essa chave no bundle do frontend.
- O SDK do browser não aceita sessão injetada pelo fragmento da URL; login operacional e sessão do CEO continuam separados. A troca obrigatória da senha inicial permanece no servidor.

## Limites e autenticação

- RPCs protegidos: 240 operações/minuto por usuário e função; criação/edição de lojas e liberações: 30/minuto. A sincronização também possui limite; execução automática sem usuário continua autorizada somente pelo caminho existente de serviço/dono do banco.
- Criação de contas: 10 tentativas autorizadas por 10 minutos por ator, antes de criar o usuário Auth. HTTP 429 informa `Retry-After` no cadastro.
- Limites de RPC são transacionais: uma transação que falha desfaz seu incremento. Eles não substituem proteção por IP, WAF ou limites do provedor contra requisições inválidas/distribuídas.
- Cadastro público e usuários anônimos do Auth permanecem desativados. Limites nativos de refresh/OTP/verificação do Supabase foram inspecionados. Não foi implementado um bloqueio apenas no frontend como suposta proteção contra força bruta.
- Senha mínima de seis caracteres e possibilidade de apenas números foram mantidas conforme instrução do titular. Para CEO/ADM, senhas mais longas e MFA são recomendações adicionais; não foram ativadas exigências que bloqueassem as contas existentes.
- CORS não substitui autenticação. Clientes sem `Origin`, como ferramentas administrativas autorizadas, ainda precisam de JWT válido e autorização no backend.

## Evidências de validação

- 91 testes automatizados: regras de acesso, anonimato, escrita direta, isolamento, autoria, primeira senha, concorrência, estoque, CORS, limite de corpo, HTTP 429, tentativas de injeção, proteção do build e carregamento.
- Ao final da migração: 24 tabelas públicas com RLS; `anon` sem leitura de colunas; `authenticated` sem escrita direta. Zero funções públicas executáveis por `anon`. Sem privilégio CREATE no schema público para os dois papéis.
- A view pública legada usa `security_invoker=true`; seus dados continuam sujeitos às permissões/RLS das tabelas. Storage sem buckets ou políticas de objetos configurados no projeto auditado.
- Testes HTTPS reais contra o Supabase: leituras anônimas recusadas em dez tabelas representativas; helper de limite privado recusado; HTTP 429 após simular a quota de uma conta temporária, sem rajadas sobre a operação; origem externa recusada na Edge Function.
- Navegador com a CSP de produção aplicada: login, controles do perfil sem inline handlers, cadastro real de colaborador, câmera sintética com fallback, Excel/PDF e carregamento do app/CEO. O fluxo real de primeira senha foi validado em teste separado. Um script inline inserido deliberadamente foi bloqueado.
- Strings que começam com `=` são exportadas como texto, sem fórmula. Nomes/motivos usam nós de texto; tentativas de HTML não viram elementos executáveis.
- Migrações preservaram hashes/contagens de dez tabelas operacionais. Empresa, lojas e contas usadas nos testes foram temporárias e removidas.
- Screenshot do carregamento e resultados técnicos foram gerados fora do repositório, sem credenciais reais.

## Carregamento e transições

Splash do app e da Área Administrativa, animação discreta e indicação textual de progresso; skeleton ao trocar módulos/lojas; recuperação após demora; botão de login bloqueado durante envio; suporte a movimento reduzido. O script de recuperação independe do SDK, e scripts grandes são carregados com defer para permitir a exibição inicial. Dados autenticados continuam fora do cache público do service worker.

## Limitações e acompanhamento

1. **XLSX 0.18.5:** usada somente para exportar; o aplicativo não importa planilhas. Vulnerabilidades conhecidas de leitura de versões antigas não foram tratadas como caminhos seguros para habilitar importação. A distribuição oficial 0.20.3 não pôde ser obtida porque `cdn.sheetjs.com` está bloqueado na política do ambiente. Atualizar a partir da fonte oficial antes de adicionar importação. Não houve substituição por fork não verificado. `npm audit` não cobre bundles vendorizados.
2. Tokens de uma SPA ficam no navegador; a CSP reduz a superfície de XSS, mas não equivale a uma arquitetura com sessão em cookie HttpOnly/BFF.
3. Paginação do histórico no servidor, testes de carga sustentados e proteção WAF/CAPTCHA/MFA completa são trabalhos adicionais; não foram certificados por esta auditoria.
4. Não foi realizado teste físico de câmera em todos os modelos de celular nem pentest exaustivo da infraestrutura dos provedores. O comportamento de navegador e as permissões descritas acima foram testados concretamente.

Migrações desta entrega: `202611120002_seguranca_e_limites.sql` e `202611120003_limite_sincronizacao.sql`. Edge Function publicada com `verify_jwt=true`, versão 8.
