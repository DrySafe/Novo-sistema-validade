# Estado da implementação — 14/10/2026

As correções da revisão e a edição auditada de quantidade estão implementadas no checkout. A política e as instruções de implantação estão em [docs/correcao-quantidade.md](docs/correcao-quantidade.md).

## Validado

- 23 testes automatizados passaram e o build estático passou.
- O Chromium executou o frontend com PGlite migrado: correção de 12 para 120 unidades, autoria/data/motivo visíveis, concorrência rejeitada e entrada original preservada.
- Política de cargos validada no papel PostgreSQL authenticated, com recusa de alteração direta de saldo/eventos.
- Layout inspecionado em 320, 390, 768 e 1440 px.

## Implantação pendente

A migração foi aplicada pelo proprietário e confirmada no Supabase real em 14/10/2026: API versão 2 e permissões corretas. O frontend atualizado passou em login, leitura dos módulos, equipe, histórico e exportações usando a conta administrativa configurada. A consulta de perfil não retorna mais HTTP 300. Falta publicar o frontend na Vercel, começando por prévia e homologação. Nenhuma correção ou movimentação manual de estoque foi criada nessa validação.

## Homologação real após implantação

Validar contas de operador, precificação, ADM, gerente e administrador; correções e conflitos concorrentes; filas AV/USO e vencidos; equipe multiunidade; câmera e exportações em celulares. A política atual permite uma correção por pessoa autorizada com trilha completa, sem aprovação obrigatória de uma segunda pessoa.
