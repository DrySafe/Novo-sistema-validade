import test from 'node:test';
import assert from 'node:assert/strict';
import {marketDB} from './helpers/market-db.js';

test('Gestor, administradores por loja, verificação e notificações preservam isolamento e dados',async t=>{
 const x=await marketDB();const {db,q,as,ids}=x;const lib={entrada:true,movimentacao:false,revisao:false,correcao:false};let request,requestId,notice;
 const rpc=async(name,args=[])=>(await q('select '+name,args));
 const context=async()=>(await q('select vs_contexto_acesso() c'))[0].c;
 const load=async(loja=null,tipo=null)=>(await q('select vs_notificacoes_dados($1,$2) d',[loja,tipo]))[0].d;
 const person=async(key,actor,stores,role='funcionario',edits=[])=>{
  await db.exec('reset role');
  const email=key+'@usuarios.validasuper.invalid';const id=(await q('select vs_preparar_conta($1,$2,$3,$4) id',[ids[actor],email,role,stores]))[0].id;ids[key]=id;
  await q('insert into auth.users(id,email) values($1,$2)',[id,email]);await q("insert into perfis(id,nome,funcao) values($1,$2,'operador')",[id,key]);
  await q('select vs_provisionar_pessoa($1,$2,$3,$4,$5,$6,$7,$8)',[ids[actor],id,key,key,stores,lib,role,edits]);
  await q("update auth.users set encrypted_password='personal' where id=$1",[id]);return id;
 };
 try{
  await db.exec('reset role');await q('insert into vs_donos(usuario_id) values($1)',[ids.operator]);await q("update perfis set tipo_conta='gestor',funcao='gestor' where id=$1",[ids.admin]);
  await person('admina','admin',[ids.store],'loja_admin');await person('adminb','admin',[ids.other],'loja_admin');await person('shared','admin',[ids.store,ids.other]);await person('staffa','admina',[ids.store]);
  await t.test('CEO é único, não opera lojas e só ele cria Gestores',async()=>{
   await as();await db.exec('reset role');await assert.rejects(q("select vs_preparar_conta($1,'gestor@test.invalid','gestor','{}')",[ids.admin]),/CEO/);
   await as('operator');assert.deepEqual((await context()).lojas,[]);await assert.rejects(q("select vs_salvar_loja('{\"nome\":\"Proibida\"}')"),/CEO/);
   await db.exec('reset role');await assert.rejects(q('insert into vs_donos(usuario_id) values($1)',[ids.admin]),/unique|duplicate/);
  });
  await t.test('administrador consulta e cadastra somente nas suas lojas; não cria loja nem administradores',async()=>{
   await as('admina');const c=await context();assert.equal(c.admin_loja,true);assert.equal(c.gestor_empresa,false);assert.equal(c.pode_gerenciar_usuarios,true);assert.deepEqual(c.lojas.map(l=>l.id),[ids.store]);
   assert.equal((await q('select vs_painel($1) p',[ids.store]))[0].p.permissoes.criarLoja,false);
   await assert.rejects(q("select vs_salvar_loja('{\"nome\":\"Proibida\"}')"),/Somente o Gestor/);
   await db.exec('reset role');await assert.rejects(q("select vs_preparar_conta($1,'bad@test.invalid','funcionario',$2)",[ids.admina,[ids.other]]),/escopo/);
   await assert.rejects(q("select vs_preparar_conta($1,'bad@test.invalid','loja_admin',$2)",[ids.admina,[ids.store]]),/Somente o Gestor/);
  });
  await t.test('usuário compartilhado fora do alcance não perde nem ganha permissões por administrador parcial',async()=>{
   await as('admina');const list=(await q('select vs_funcionarios() f'))[0].f;const shared=list.find(p=>p.id===ids.shared);assert.equal(shared.gerenciavel,false);assert.deepEqual(shared.lojas,[ids.store]);
   await assert.rejects(q('select vs_salvar_pessoa($1,$2,$3,$4,$5)',[ids.shared,'Forjado','funcionario',[ids.store],lib]),/fora do escopo/);
   await assert.rejects(q('select vs_salvar_pessoa($1,$2,$3,$4,$5)',[ids.staffa,'Forjado','loja_admin',[ids.store],lib]),/Somente o Gestor/);
  });
  await t.test('liberação de edição é por loja e só o Gestor a concede',async()=>{
   await as('admina');await assert.rejects(q('select vs_salvar_loja($1,$2)',[{nome:'Pedido não autorizado'},ids.store]),/não liberada/);
   await as();await q('select vs_salvar_pessoa($1,$2,$3,$4,$5,$6)',[ids.admina,'Admin A','loja_admin',[ids.store],lib,[ids.store]]);
   await as('admina');assert.equal((await context()).lojas[0].pode_editar_cadastro,true);
   await assert.rejects(q('select vs_salvar_loja($1,$2)',[{nome:'Loja errada'},ids.other]),/não liberada/);
  });
  await t.test('salvar gera EM VERIFICAÇÃO e não modifica o cadastro vigente',async()=>{
   await as('admina');const result=(await q('select vs_salvar_loja($1,$2) r',[{nome:'Nome aprovado',numero_loja:'91',telefone:'21999990000'},ids.store]))[0].r;requestId=result.solicitacao_id;assert.equal(result.estado,'EM_VERIFICACAO');
   assert.equal((await q('select nome from lojas where id=$1',[ids.store]))[0].nome,'Mercado teste');
   await assert.rejects(q('select vs_salvar_loja($1,$2)',[{nome:'Segundo pedido'},ids.store]),/em verificação/);
   const own=await load(ids.store,'ALTERACAO_LOJA');assert.equal(own.itens.length,1);request=own.itens[0].alteracao;assert.equal(request.id,requestId);assert.equal(request.dados_propostos.nome,'Nome aprovado');
  });
  await t.test('administrador não aprova; outra loja não vê solicitação nem marca notificação alheia',async()=>{
   await as('admina');await assert.rejects(q('select vs_decidir_loja($1,true,$2,1)',[requestId,'Aprovação falsa']),/Somente o Gestor/);
   await as('adminb');assert.equal((await q('select id from vs_loja_alteracoes where id=$1',[requestId])).length,0);
   await assert.rejects(load(ids.store),/Loja não autorizada/);
   await as();const box=await load(ids.store,'ALTERACAO_LOJA');assert.equal(box.itens.length,1);const id=box.itens[0].id;
   await as('adminb');await assert.rejects(q('select vs_ler_notificacoes($1)',[[id]]),/fora do seu acesso/);
  });
  await t.test('aprovação aplica exatamente uma vez e mantém autoria e decisão',async()=>{
   await as();await q('select vs_decidir_loja($1,true,$2,1)',[requestId,'Conferência aprovada pelo Gestor']);
   assert.equal((await q('select nome from lojas where id=$1',[ids.store]))[0].nome,'Nome aprovado');
   await assert.rejects(q('select vs_decidir_loja($1,true,$2,1)',[requestId,'Tentativa repetida']),/já analisada/);
   await as('admina');const box=await load(ids.store,'DECISAO_LOJA');assert.equal(box.itens.length,1);assert.equal(box.itens[0].alteracao.estado,'APROVADA');assert.equal(box.itens[0].alteracao.decidido_por,ids.admin);
  });
  await t.test('recusa exige justificativa e preserva os dados; conflito não sobrepõe cadastro',async()=>{
   await as('admina');const r=(await q('select vs_salvar_loja($1,$2) r',[{nome:'Não aplicar'},ids.store]))[0].r;
   await as();await assert.rejects(q('select vs_decidir_loja($1,false,$2,1)',[r.solicitacao_id,'não']),/justificativa/);
   await q('select vs_decidir_loja($1,false,$2,1)',[r.solicitacao_id,'Dados não conferem com os documentos']);assert.equal((await q('select nome from lojas where id=$1',[ids.store]))[0].nome,'Nome aprovado');
   await as('admina');const conflict=(await q('select vs_salvar_loja($1,$2) r',[{nome:'Conflitante'},ids.store]))[0].r;
   await db.exec('reset role');await q('update lojas set telefone=$1 where id=$2',['21988887777',ids.store]);
   await as();await assert.rejects(q('select vs_decidir_loja($1,true,$2,1)',[conflict.solicitacao_id,'Não deve aplicar dados antigos']),/dados vigentes mudaram/);
   await q('select vs_decidir_loja($1,false,$2,1)',[conflict.solicitacao_id,'Solicitar novo envio após atualização']);
  });
  await t.test('comunicações respeitam audiência e leitura é individual',async()=>{
   await as('staffa');await assert.rejects(q('select vs_enviar_aviso($1,$2,$3,$4)',[ids.store,'loja','Aviso','Mensagem sem permissão de broadcast']),/Destinatário/);
   notice=(await q('select vs_enviar_aviso($1,$2,$3,$4) id',[ids.store,'administradores','Produto fora do local','Encontramos produtos em uma ponta não identificada']))[0].id;
   assert.ok((await load()).itens.some(n=>n.id===notice));
   await as('admina');assert.ok((await load()).itens.some(n=>n.id===notice));const unread=(await q('select vs_contar_notificacoes() n'))[0].n;
   await as();await q('select vs_ler_notificacoes($1)',[[notice]]);
   await as('admina');assert.equal((await q('select vs_contar_notificacoes() n'))[0].n,unread);
   await as('adminb');assert.ok(!(await load()).itens.some(n=>n.id===notice));
  });
  await t.test('atraso gera um aviso por dia e não fica não lido novamente a cada consulta',async()=>{
   await as();await q('select vs_criar_tarefa($1,$2)',[ids.store,{tipo:'Conferência',titulo:'Conferir ponta da loja',descricao:'Verificar validade e posição',prazo:'2026-10-19',responsavel_id:ids.staffa}]);
   await as('staffa');const box=await load();const alert=box.itens.find(n=>n.tipo==='ACAO_ATRASADA');assert.ok(alert);
   await q('select vs_ler_notificacoes($1)',[[alert.id]]);const after=(await q('select vs_contar_notificacoes() n'))[0].n;assert.equal((await q('select vs_contar_notificacoes() n'))[0].n,after);
   assert.equal((await load(null,'ACAO_ATRASADA')).itens.length,1);
  });
  await t.test('Gestor não lê nem administra notificações ou pessoas de outra empresa',async()=>{
   await db.exec('reset role');
   const foreign=(await q("select vs_preparar_conta($1,'foreign@test.invalid','gestor','{}') id",[ids.operator]))[0].id;ids.foreign=foreign;
   await q("insert into auth.users(id,email) values($1,'foreign@test.invalid')",[foreign]);await q("insert into perfis(id,nome,funcao) values($1,'Gestor externo','operador')",[foreign]);
   await q("select vs_provisionar_empresa($1,$2,'Gestor externo')",[ids.operator,foreign]);await q("update auth.users set encrypted_password='personal' where id=$1",[foreign]);
   await as('foreign');const foreignStore=(await q('select vs_salvar_loja($1) s',[{nome:'Loja externa',numero_loja:'94'}]))[0].s;
   const foreignNotice=(await q('select vs_enviar_aviso($1,$2,$3,$4) id',[foreignStore.id,'loja','Restrito externo','Somente pessoas da empresa externa']))[0].id;
   await person('staffother','foreign',[foreignStore.id]);
   await as();assert.equal((await q('select id from vs_notificacoes where id=$1',[foreignNotice])).length,0);assert.ok(!(await load()).itens.some(n=>n.id===foreignNotice));
   assert.ok(!(await q('select vs_funcionarios() f'))[0].f.some(p=>p.id===ids.staffother));await assert.rejects(load(foreignStore.id),/Loja não autorizada/);
  });
  await t.test('nenhuma escrita direta, forja de notificação ou leitura anônima é permitida',async()=>{
   await as('admina');for(const table of ['vs_notificacoes','vs_loja_alteracoes','vs_administradores_loja','vs_notificacoes_leituras'])await assert.rejects(q('delete from '+table),/permission denied/);
   await assert.rejects(q("select vs_aplicar_loja($1,'{}')",[ids.store]),/permission denied/);
   await assert.rejects(q("select vs_notificar($1,$2,'loja',null,'AVISO','Falso','Forja')",[ids.company,ids.store]),/permission denied/);
   await db.exec('reset role;set role anon');for(const table of ['vs_notificacoes','vs_loja_alteracoes'])await assert.rejects(q('select * from '+table),/permission denied/);
  });
 }finally{await db.close();}
});
