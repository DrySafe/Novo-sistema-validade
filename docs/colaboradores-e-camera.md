# Cadastro de colaboradores e câmera

O Gestor e os administradores autorizados encontram **Colaboradores** no topo do app e no menu, além de **Colaboradores e permissões** no perfil. No celular, o item do menu fica em **Mais → Colaboradores**. O cadastro fica aberto e permite informar nome, login fixo, senha inicial, lojas e liberações. A permissão de cadastrar itens vem marcada, mas pode ser removida para dar somente acesso de acompanhamento. Nenhum e-mail pessoal do funcionário é necessário.

Depois de criar a conta, uma janela mostra login e senha inicial, com opção de copiar as credenciais para entrega por um canal privado. Não há envio automático. Ao fechar, a senha é apagada dessa janela e não pode ser consultada na lista de funcionários. No primeiro acesso, o funcionário precisa substituir a senha inicial por outra de pelo menos 6 caracteres, podendo usar somente números. Até a troca efetiva, o servidor bloqueia o acesso às lojas e às operações. Depois ele pode alterar a própria senha pelo perfil. A exigência vale para novos cadastros e não força nova troca das contas que já estão em uso. As verificações de empresa/loja e permissões permanecem no servidor.

O CEO continua acessando somente o painel separado de criação de Gestores. Para operar uma empresa, é necessária uma conta Gestor ou um usuário autorizado dessa empresa; o botão não concede acesso empresarial ao CEO.

Contas antigas com função `administrador`, mas tipo `legado` e sem empresa vinculada, não são administradores de empresa para as funções de cadastro. A manutenção explícita `supabase/maintenance/regularizar-administrador-legado.sql` permite regularizar uma conta previamente autorizada, informada na configuração da transação. Preserva as lojas, quantidades, histórico e vínculos existentes, adicionando apenas a empresa e seus vínculos. Aborta se houver lojas com empresa, outros usuários não CEO vinculados ou uma conta sem o papel adequado. Não é executada automaticamente no setup ou no login. Fazer backup antes de aplicá-la e conferir o contexto de acesso e a preservação dos dados depois.

No lançamento, o botão de câmera abre o vídeo e solicita permissão. O vídeo usa reprodução silenciosa e inline. Quando BarcodeDetector não oferece EAN-13 e EAN-8, o app carrega o leitor ZXing local. O processamento da imagem ocorre no navegador. A leitura preenche o EAN e usa a mesma consulta de produto da digitação; não salva um lançamento automaticamente.

A câmera é encerrada ao ler, fechar o modal, tocar novamente no botão, sair da página ou ocultar o app. O leitor encerra após 60 segundos. As mensagens distinguem bloqueio de permissão, câmera ocupada, ausência de câmera e necessidade de HTTPS. A entrada manual continua disponível.

Testes automatizados cobrem reconhecimento de um EAN pelo decoder alternativo, cancelamento durante aquisição, liberação do stream, negação de permissão, criação de colaborador e limpeza das credenciais da interface. Emulação e câmera sintética no navegador não substituem teste final em aparelhos Android/iOS físicos.

A hierarquia atual, as liberações por loja e o fluxo de aprovação estão detalhados em [hierarquia-e-notificacoes.md](hierarquia-e-notificacoes.md).
