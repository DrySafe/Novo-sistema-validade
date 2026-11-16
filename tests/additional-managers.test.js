import test from 'node:test';
import assert from 'node:assert/strict';
import {marketDB} from './helpers/market-db.js';

test('Gestores adicionais compartilham somente a própria empresa e preservam CEO e administradores',async t=>{
 const {db,q,as,ids}=await marketDB();const lib={entrada:true,movimentacao:true,revisao:true,correcao:true};
 const create=async(key,actor,role='gestor',stores=[])=>{
  await db.exec('reset role');const email=key+'@usuarios.validasuper.invalid';const id=(await q('select vs_preparar_conta_equipe($1,$2,$3,$4,false) id',[ids[actor],email,role,stores]))[0].id;ids[key]=id;
  await q('insert into auth.users(id,email) values($1,$2)',[id,email]);await q("insert into perfis(id,nome,funcao) values($1,$2,'operador')",[id,key]);
  await q('select vs_provisionar_pessoa($1,$2,$3,$4,$5,$6,$7)',[ids[actor],id,key,key,stores,lib,role]);return id;
 };
 const activate=async(key)=>{await db.exec('reset role');await q("update auth.users set encrypted_password='personal' where id=$1",[ids[key]]);await as(key);};
 try{
  await db.exec('reset role');await q('insert into vs_donos(usuario_id) values($1)',[ids.operator]);
  await t.test('somente CEO cria nova empresa; somente Gestor cria Gestor interno',async()=>{
   await assert.rejects(q("select vs_preparar_conta_equipe($1,'denied@test.invalid','gestor','{}',true)",[ids.admin]),/CEO/);
   await assert.rejects(q("select vs_preparar_conta_equipe($1,'denied@test.invalid','gestor','{}',false)",[ids.operator]),/Somente Gestor/);
   await create('adminloja','admin','loja_admin',[ids.store]);await activate('adminloja');
   await db.exec('reset role');await assert.rejects(q("select vs_preparar_conta_equipe($1,'denied@test.invalid','gestor','{}',false)",[ids.adminloja]),/Somente o Gestor/);
  });
  await t.test('conta nova fica na mesma empresa, sem acesso antes de trocar a senha',async()=>{
   const id=await create('gestordois','admin');
   const profile=(await q('select tipo_conta,empresa_id,senha_inicial from perfis where id=$1',[id]))[0];assert.equal(profile.tipo_conta,'gestor');assert.equal(profile.empresa_id,ids.company);assert.equal(profile.senha_inicial,true);
   assert.equal((await q('select count(*)::int n from vs_empresas'))[0].n,1);
   await as('gestordois');assert.equal((await q('select vs_acesso($1) a',[ids.store]))[0].a,false);
   await activate('gestordois');const context=(await q('select vs_contexto_acesso() c'))[0].c;assert.equal(context.gestor_empresa,true);assert.equal(context.dono_app,false);assert.equal(context.lojas.length,2);
   assert.equal((await q('select vs_painel($1) p',[ids.other]))[0].p.permissoes.criarLoja,true);
  });
  await t.test('novo Gestor cria loja; ambos acessam lojas futuras e notificações',async()=>{
   const shop=(await q('select vs_salvar_loja($1) s',[{nome:'Terceira loja',numero_loja:'93'}]))[0].s;ids.newshop=shop.id;
   await as();assert.equal((await q('select vs_acesso($1) a',[shop.id]))[0].a,true);
   await as('gestordois');const notice=(await q('select vs_enviar_aviso($1,$2,$3,$4) id',[ids.store,'gestor','Nova gestão','Gestor adicional já acompanha a empresa']))[0].id;
   await as();assert.ok((await q('select vs_notificacoes_dados() n'))[0].n.itens.some(n=>n.id===notice));
  });
  await t.test('novo Gestor cria outro Gestor e administrador; pode aprovar edição cadastral',async()=>{
   await create('gestortres','gestordois');await activate('gestortres');assert.equal((await q('select vs_contexto_acesso() c'))[0].c.lojas.length,3);
   await as('gestordois');await q('select vs_salvar_pessoa($1,$2,$3,$4,$5,$6)',[ids.adminloja,'Admin Loja','loja_admin',[ids.store],lib,[ids.store]]);
   await as('adminloja');const pending=(await q('select vs_salvar_loja($1,$2) s',[{nome:'Aprovada pelo segundo Gestor'},ids.store]))[0].s;
   await as('gestordois');await q('select vs_decidir_loja($1,true,$2,1)',[pending.solicitacao_id,'Conferência pelo segundo Gestor']);assert.equal((await q('select nome from lojas where id=$1',[ids.store]))[0].nome,'Aprovada pelo segundo Gestor');
  });
  await t.test('Gestor promove colaborador; contas de Gestor e conta CEO ficam protegidas',async()=>{
   await create('colaborador','adminloja','funcionario',[ids.store]);await activate('colaborador');
   await as('adminloja');await assert.rejects(q('select vs_salvar_pessoa($1,$2,$3,$4,$5)',[ids.colaborador,'Colaborador','gestor',[],lib]),/Somente o Gestor/);
   await as('gestordois');await q('select vs_salvar_pessoa($1,$2,$3,$4,$5)',[ids.colaborador,'Novo Gestor','gestor',[],lib]);
   await as('colaborador');assert.equal((await q('select vs_contexto_acesso() c'))[0].c.lojas.length,3);
   await as();const listed=(await q('select vs_funcionarios() f'))[0].f;assert.equal(listed.find(p=>p.id===ids.gestordois).gerenciavel,false);assert.ok(!listed.some(p=>p.id===ids.operator));
   await assert.rejects(q('select vs_salvar_pessoa($1,$2,$3,$4,$5)',[ids.gestordois,'Demovido','funcionario',[ids.store],lib]),/protegida/);
   await db.exec('reset role');await assert.rejects(q("select vs_reservar_conta($1,'nova@test.invalid','empresa')",[ids.gestordois]),/CEO/);
   await assert.rejects(q("select vs_provisionar_empresa($1,$2,'Empresa falsa')",[ids.gestordois,ids.gestortres]),/CEO/);
  });
  await t.test('outro Gestor não ganha acesso a empresa externa nem à criação de CEO; anônimo bloqueado',async()=>{
   await db.exec('reset role');const id=(await q("select vs_preparar_conta_equipe($1,'externo@test.invalid','gestor','{}',true) id",[ids.operator]))[0].id;ids.externo=id;
   await q("insert into auth.users(id,email) values($1,'externo@test.invalid')",[id]);await q("insert into perfis(id,nome,funcao) values($1,'Externo','operador')",[id]);await q("select vs_provisionar_empresa($1,$2,'Externo')",[ids.operator,id]);await activate('externo');const shop=(await q('select vs_salvar_loja($1) s',[{nome:'Loja externa',numero_loja:'94'}]))[0].s;
   await as('gestordois');assert.equal((await q('select vs_acesso($1) a',[shop.id]))[0].a,false);await assert.rejects(q('select vs_painel($1)',[shop.id]),/autorizad/);
   await assert.rejects(q('insert into vs_donos(usuario_id) values($1)',[ids.gestordois]),/permission denied/);
   await db.exec('reset role;set role anon');await assert.rejects(q("select vs_preparar_conta_equipe($1,'denied@test.invalid','gestor','{}',false)",[ids.gestordois]),/permission denied/);
  });
 }finally{await db.close();}
});
