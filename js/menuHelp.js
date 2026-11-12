const HELP = {
 ciclos: {
  title: 'Ciclos e acompanhamento',
  intro: 'Visão geral dos lotes da loja selecionada. Use este painel para localizar pendências e acompanhar o estoque ao longo das rodadas de conferência.',
  sections: [
   ['Como começar', ['Confira a loja selecionada no topo. Abra o card de um lote para visualizar seus produtos na tabela e procure por produto, código de barras ou lote físico.', 'Confira saldo, validade, localização e situação de cada item. Use as ações da linha para revisar, movimentar, corrigir ou consultar o histórico, conforme suas permissões.']],
   ['Como funcionam os 15 dias', ['As rodadas são da loja, contadas a partir do início do acompanhamento; não são 15 dias individuais para cada produto.', 'Ao iniciar outra rodada, o saldo positivo continua registrado e pode exigir nova conferência. A passagem do tempo não significa venda, descarte ou baixa automática.']],
   ['Lote de acompanhamento e lote físico', ['O código do card identifica o acompanhamento interno. O lote físico é o do fabricante, informado no lançamento. Confira ambos para distinguir estoques com origens diferentes.']],
   ['Conferência e relatórios', ['Revisar saldo e preço registra uma conferência. Use Movimentar para saídas reais e Corrigir quantidade para erro de contagem ou digitação, com justificativa.', 'Os relatórios gerais do módulo incluem registros concluídos e transferidos; o filtro visual da lista não limita essa exportação.']]
  ]
 },
 acompanhamento: {
  title: 'Ações e resultados',
  intro: 'Organiza o trabalho preventivo da loja: o que conferir, onde agir, quem é responsável e quando concluir. Também reúne indicadores para avaliar o acompanhamento.',
  sections: [
   ['1. Consulte a fila de trabalho', ['A fila sugerida destaca produtos que precisam de atenção, considerando validade, pendências e a rotina configurada. Confira a posição do estoque para localizar os produtos.', 'A sugestão não atribui automaticamente um funcionário. Abra o item e planeje uma ação quando precisar registrar um responsável e um prazo.']],
   ['2. Planeje uma ação', ['Use Nova ação ou a opção Acompanhar do produto. Registre uma conferência, exposição antecipada, remanejamento, desconto, devolução ou outra ação preventiva.', 'Informe uma descrição clara, responsável e prazo. A gestão pode atribuir colaboradores da loja; os demais usuários autorizados planejam para si. As opções dependem das suas liberações.']],
   ['3. Acompanhe e confirme a execução', ['Use os filtros para ver ações de hoje ou atrasadas, abertas, suas ações ou concluídas. Atualize para Em andamento, Concluída ou Impedida e descreva o resultado ou a dificuldade.', 'A gestão pode cancelar ou reabrir ações. O histórico registra as alterações, o responsável e quando foram feitas.']],
   ['4. Cadastre posições e ajuste a rotina', ['Em Posições e rotina, a gestão cadastra locais como gôndola, depósito, ponta, ilha e câmara, com nomes que ajudem a encontrar o estoque.', 'Configure a janela de vencimento e a frequência da conferência complementar. Isso não altera as rodadas de 15 dias. A fila é consultada no app; não envia avisos externos automaticamente.']],
   ['5. Leia os indicadores e exporte', ['Escolha De e Até para consultar saídas e conclusões no período, comparar com o período anterior e exportar Excel ou PDF do acompanhamento.', 'Estoque em risco e vencidos com saldo mostram a posição atual. Custos ficam restritos à gestão; valores sem custo informado são indicados e os totais podem ser parciais.', 'Ações concluídas no prazo ajudam a avaliar a execução. Vendas informadas e ações concluídas, isoladamente, não comprovam perdas evitadas.']],
   ['Planejamento e estoque são registros separados', ['Concluir uma ação não altera saldo ou preço e não executa desconto no caixa ou devolução ao fornecedor. Registre a operação efetiva nas ações do produto.', 'Alterar a posição de um registro move a identificação de todo o seu saldo. Não há transferência parcial de quantidades entre locais; planejar remanejamento não realiza essa transferência.']]
  ]
 },
 validade: {
  title: 'Validades',
  intro: 'Acompanhe os produtos cadastrados para controle de validade, separados por lote de acompanhamento. O objetivo é conferir o estoque e agir antes do vencimento.',
  sections: [
   ['Cadastre e localize', ['Use Novo lançamento para informar produto, quantidade adicional, preço, validade, lote físico e local. A câmera preenche o código de barras; confira os dados antes de salvar.', 'Abra um card de lote para consultar a tabela compacta de produtos e suas ações. Confira também outros locais onde o mesmo produto pode estar exposto.']],
   ['Entrada não é recontagem', ['Para reconferir unidades já registradas, abra o item existente. Não faça uma nova entrada do mesmo estoque: isso pode duplicar o acompanhamento.', 'Se o app indicar estoque semelhante, confira o registro. Confirme uma entrada adicional com justificativa apenas quando forem outras unidades de fato. As entradas ficam em registros separados.']],
   ['Use a operação correta', ['Revisar saldo e preço registra a conferência. Movimentar registra uma saída real, informando o saldo que restou. Corrigir quantidade exige liberação e justificativa e deixa auditoria.', 'Acompanhar permite planejar ações e consultar informações complementares. Histórico mostra os registros anteriores.']],
   ['Ao vencer', ['Na data da validade, o produto já é tratado como vencido e passa ao acompanhamento de Vencidos quando a sincronização é executada. A venda deixa de ser permitida.', 'O saldo não é descartado automaticamente. Registre a destinação física realizada.']]
  ]
 },
 vencidos: {
  title: 'Vencidos',
  intro: 'Reúne produtos cuja validade chegou ao limite e que precisam de identificação, separação e destinação. Esta tela ajuda a acompanhar o saldo até sua resolução.',
  sections: [
   ['Localize e separe', ['Abra o lote para consultar produto, validade, saldo, lote físico e posição. Verifique os locais em que o estoque foi encontrado e siga o procedimento da empresa para retirar produtos vencidos da venda.', 'A data da própria validade já é considerada vencida. O histórico preserva a origem do acompanhamento e a passagem para vencidos.']],
   ['Registre a destinação real', ['Em Movimentar, escolha a destinação disponível e informe o saldo restante e o motivo. Venda de produto vencido é bloqueada.', 'Descarte ou troca precisam corresponder ao que ocorreu fisicamente. Uma tarefa de devolução concluída não substitui o registro da saída.']],
   ['Acompanhe a conclusão', ['Os itens com saldo continuam pendentes de resolução. Os filtros permitem consultar registros concluídos e o histórico.', 'A passagem para Vencidos não apaga nem zera quantidades automaticamente. Use os indicadores de Ações e resultados para acompanhar descartes registrados e ações pendentes.']]
  ]
 },
 uso_loja: {
  title: 'Uso da loja',
  intro: 'Organiza os itens destinados ou separados para uso interno da loja, mantendo rastreabilidade do que ainda aguarda destinação e do que já foi consumido.',
  sections: [
   ['Entrada na fila', ['No lançamento, identifique produto, quantidade, local e motivo. Esse cadastro coloca as unidades no acompanhamento; ainda não representa sua saída definitiva.']],
   ['Consumo e movimentação', ['Quando a utilização ocorrer, abra o lote, use Movimentar e registre a destinação apropriada, o saldo restante e a justificativa.', 'Não registre uma nova entrada para reconferir o mesmo estoque. Se houver erro na quantidade, use a correção autorizada, preservando a auditoria.']],
   ['Conferência e consulta', ['Confira as unidades pendentes e consulte o histórico para identificar quem registrou cada operação e quando.', 'Selecione o filtro adequado para consultar itens ativos, concluídos ou todos. As operações disponíveis dependem das liberações da sua conta.']]
  ]
 },
 avarias: {
  title: 'Avarias',
  intro: 'Acompanhe produtos danificados, suas quantidades e os motivos, até que recebam a destinação adequada. A fila ajuda a evitar itens separados sem resolução.',
  sections: [
   ['Registre a ocorrência', ['Informe produto, quantidade, local e motivo da avaria no lançamento. Identifique o lote físico quando disponível para localizar e distinguir o estoque.', 'Cadastrar uma ocorrência coloca o saldo na fila; não equivale a descartar ou devolver essas unidades.']],
   ['Resolva e dê baixa', ['Após a destinação física, use Movimentar para registrar a operação, o saldo que restou e a justificativa.', 'Use Acompanhar para planejar uma ação com responsável e prazo. Concluir essa ação não baixa a quantidade automaticamente.']],
   ['Mantenha a rastreabilidade', ['Consulte o histórico antes de corrigir ou registrar outra operação. Correção de quantidade é destinada a erros de contagem ou digitação, com liberação e justificativa.', 'Os filtros permitem consultar saldo ativo e registros concluídos. Os relatórios dependem das operações efetivamente registradas.']]
  ]
 },
 equipe: {
  title: 'Colaboradores',
  intro: 'O administrador da empresa cadastra funcionários e define a quais lojas e operações cada um terá acesso. Não é necessário e-mail pessoal para o colaborador.',
  sections: [
   ['Cadastre o acesso', ['Preencha nome, login e senha inicial de pelo menos 6 caracteres. O login é único no aplicativo e não pode ser alterado depois.', 'Selecione pelo menos uma loja e confira as liberações. Cadastrar itens vem marcado inicialmente; desmarque se o colaborador deve apenas consultar os dados.']],
   ['Escolha as permissões', ['Cadastrar itens permite novas entradas. Movimentações autoriza saídas; revisão permite conferir saldo e preço; correção de quantidade exige a liberação específica e deixa auditoria.', 'Sem liberações de operação, o colaborador mantém a consulta às lojas selecionadas. Ele não passa a ser administrador nem pode criar empresas ou outros usuários.']],
   ['Entregue e gerencie', ['Após criar, copie as credenciais e entregue por um canal privado. A senha inicial deixa de ser exibida quando a janela é fechada; não há envio automático.', 'No primeiro acesso, o colaborador deve trocar a senha inicial por uma senha pessoal de pelo menos 6 caracteres; pode usar somente números. Depois pode alterá-la pelo perfil. Acesse o cadastro na lista para ajustar lojas e liberações; desmarcar todas as lojas suspende o acesso aos dados.']],
   ['Empresa e Área Administrativa', ['Este menu gerencia funcionários da sua empresa. A Área Administrativa do rodapé é separada e exclusiva do CEO para criar novos administradores de empresas.']]
  ]
 },
 administrativo: {
  title: 'Área Administrativa',
  intro: 'Área exclusiva do CEO para autorizar novos administradores de empresas no aplicativo.',
  sections: [
   ['Criação de administrador', ['Entre com a conta CEO. Informe somente e-mail e senha inicial do novo administrador. Ele deverá definir sua senha pessoal no primeiro acesso e cadastrar suas próprias lojas.']],
   ['Cadastro de funcionários', ['Para adicionar funcionários a uma empresa existente, entre no app com o administrador daquela empresa e abra Colaboradores. Selecione lojas e liberações para cada pessoa.']],
   ['Separação dos acessos', ['O CEO cria contas ADM, mas não acessa as lojas, dados ou senhas pessoais dessas empresas. Este painel não oferece acesso às contas que foram criadas.']]
  ]
 }
};

export function initializeMenuHelp(doc = document, initialSector = 'ciclos') {
 const button = doc.getElementById('btn-menu-help');
 let sector = initialSector;
 const element = (tag, text) => { const node = doc.createElement(tag); if (text) node.textContent = text; return node; };
 const update = next => {
  if (!HELP[next]) return;
  sector = next;
  button.setAttribute('aria-label', 'Ajuda sobre ' + HELP[sector].title);
  button.title = 'Como usar este menu';
 };
 button.addEventListener('click', () => {
  const existing = doc.getElementById('menu-help-dialog');
  if (existing) { existing.querySelector('button').focus(); return; }
  const content = HELP[sector], dialog = element('dialog');
  dialog.id = 'menu-help-dialog'; dialog.className = 'vs-dialog menu-help-dialog';
  dialog.setAttribute('aria-labelledby', 'menu-help-heading');
  dialog.setAttribute('aria-describedby', 'menu-help-intro');
  const header = element('div'); header.className = 'modal-header';
  const heading = element('h2', 'Como usar: ' + content.title); heading.id = 'menu-help-heading';
  const close = element('button', 'Fechar'); close.type = 'button'; close.className = 'btn btn-secondary'; close.autofocus = true;
  close.addEventListener('click', () => dialog.close());
  header.append(heading, close);
  const intro = element('p', content.intro); intro.id = 'menu-help-intro';
  dialog.append(header, intro);
  for (const [title, paragraphs] of content.sections) {
   const section = element('section'); section.append(element('h3', title));
   for (const paragraph of paragraphs) section.append(element('p', paragraph));
   dialog.append(section);
  }
  dialog.addEventListener('click', event => {
   if (event.target !== dialog) return;
   const rect = dialog.getBoundingClientRect();
   if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { dialog.remove(); button.focus(); });
  doc.body.append(dialog); dialog.showModal();
 });
 update(initialSector);
 return update;
}
