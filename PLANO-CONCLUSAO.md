# Estado da implementação

## Implementado nesta alteração

Rodadas de 15 dias separadas dos lotes de origem; acompanhamento contínuo de itens de lotes antigos; revisões obrigatórias por rodada e mudança de faixa; preços por item; movimentações com justificativa e baixas parciais; transferência para VENC diário preservando origem; histórico e relatórios Excel/PDF; endpoints transacionais e isolamento de loja; agendamento diário preparado; testes automatizados e CI.

## Implantação pendente

Não há acesso direto ao Supabase nesta conexão. Comparar `supabase/inspect-schema.sql` com o ambiente real, validar a migração em homologação, aplicar o SQL e o agendamento antes de publicar o frontend. Conferir backup, triggers existentes e eventuais rotinas de virada antigas; estas não devem continuar migrando os mesmos itens em paralelo com a nova rotina. Seguir README.md.

## Próximas etapas independentes

- Revisar criação de contas, convites de colaboradores e políticas de alteração de perfis/vínculos. O fluxo anterior de gestão de equipe permanece.
- Homologar câmera e exportações em navegadores móveis; scanner ainda depende de BarcodeDetector.
- Se desejado, integrar vendas e preços com TOTVS. A implementação atual registra os valores/referências informados pelo operador, sem comunicação automática com o ERP.
- Validar qualidade dos registros legados: informações históricas ausentes são sinalizadas e não podem ser reconstruídas automaticamente.
