import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Auth Admin é simulado apenas na fronteira Auth; todas as regras/RPCs são PostgreSQL real.
test('hierarquia do aplicativo, cadastro fechado, lojas e liberações no servidor', async t => {
 const db=new PGlite();
 const reservedIds=new Map();
 const id=n=>reservedIds.get(n)||`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const q=async(sql,args)=>(await db.query(sql,args)).rows;
 const as=async(n,role='authenticated')=>db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false); select set_config('request.jwt.claim.role','${role}',false); set role ${role};`);
 const lib={entrada:true,movimentacao:false,revisao:false,correcao:false};
 let company,store,otherCompany,otherStore,store2;

 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 alter default privileges grant execute on functions to anon,authenticated;
 create schema auth;
 create table auth.users(id uuid primary key,email text unique,phone text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 ${fs.readFileSync(new URL('./fixtures/schema-real.sql',import.meta.url),'utf8')}
 create function forcar_virada_ciclo_teste(uuid) returns text language sql as $$select 'legado'$$;
 create function gerar_codigo_lote(uuid) returns text language sql as $$select 'legado'$$;
 create function gerar_codigo_lote(uuid,varchar) returns text language sql as $$select 'legado'$$;
 create function get_meu_perfil() returns text language sql as $$select 'operador'$$;
 create function get_user_funcao() returns text language sql as $$select 'operador'$$;
 create function get_user_loja_id() returns uuid language sql as $$select null::uuid$$;
 create function usuario_tem_acesso_loja(uuid) returns boolean language sql as $$select true$$;
 insert into auth.users(id,email) values('${id(1)}','dono@test.example'),('${id(2)}','empresa@test.example'),('${id(3)}','outra@test.example'),('${id(4)}','sem-loja@test.example');
 insert into perfis(id,nome,funcao) values('${id(1)}','Dono','administrador'),('${id(2)}','Empresa','administrador'),('${id(3)}','Outra','administrador'),('${id(4)}','Sem vínculo','operador');
 `);
 const migrations=new URL('../supabase/migrations/',import.meta.url);
 for(const name of fs.readdirSync(migrations).sort()) await db.exec(fs.readFileSync(new URL(name,migrations),'utf8'));
 await db.exec(`create trigger profile after insert on auth.users for each row execute function handle_new_user_profile();insert into vs_donos values('${id(1)}');`);
 await t.test('somente dono provisiona empresa; nova conta sem vínculo não cria primeira loja',async()=>{
  await as(4);await assert.rejects(q(`select vs_salvar_loja('{"nome":"Escalada"}')`),/Somente o administrador/);
  await assert.rejects(q('select vs_reservar_conta($1,$2,$3)',[id(4),'a@b.example','empresa']),/permission denied/);
  await db.exec('reset role');await assert.rejects(q('select vs_provisionar_empresa($1,$2,$3)',[id(2),id(4),'Escalada']),/Somente o dono/);
  company=(await q('select vs_provisionar_empresa($1,$2,$3) e',[id(1),id(2),'Empresa A']))[0].e;
  otherCompany=(await q('select vs_provisionar_empresa($1,$2,$3) e',[id(1),id(3),'Empresa B']))[0].e;
  await as(2);store=(await q(`select vs_salvar_loja('{"nome":"Loja A"}') s`))[0].s;store2=(await q(`select vs_salvar_loja('{"nome":"Loja A2"}') s`))[0].s;
  await as(3);otherStore=(await q(`select vs_salvar_loja('{"nome":"Loja B"}') s`))[0].s;
  await as(2);await assert.rejects(q('select vs_salvar_loja($1,$2)',[JSON.stringify({nome:'Invadida'}),otherStore.id]),/fora da empresa/);
 });
 await t.test('cadastro exige UUID reservado; metadados não concedem identidade ou cargo',async()=>{
  await db.exec('reset role');await assert.rejects(q('insert into auth.users(id,email) values($1,$2)',[id(5),'publico@test.example']),/Cadastro público desativado/);
  const nonce=(await q("select vs_reservar_conta($1,$2,'funcionario') id",[id(2),'operador@usuarios.validasuper.invalid']))[0].id;
  await assert.rejects(q('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id(5),'operador@usuarios.validasuper.invalid',JSON.stringify({vs_provisionamento:nonce,funcao:'administrador'})]),/Cadastro público desativado/);
  await assert.rejects(q('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id(5),'operador@usuarios.validasuper.invalid',JSON.stringify({vs_provisionamento:nonce})]),/Cadastro público desativado/);
  reservedIds.set(5,nonce);
  await q('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id(5),'operador@usuarios.validasuper.invalid',JSON.stringify({provider:'email',providers:['email']})]);
  await assert.rejects(q('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id(6),'reuso@test.example',JSON.stringify({vs_provisionamento:nonce})]),/Cadastro público desativado/);
  await q('select vs_provisionar_funcionario($1,$2,$3,$4,$5,$6)',[id(2),id(5),'Operador','operador',[store.id],lib]);
 });
 await t.test('funcionário vê somente lojas atribuídas e permissões vencem o cargo',async()=>{
  await as(5);
  assert.equal((await q('select vs_acesso($1) ok',[store.id]))[0].ok,true);
  for(const s of [store2,otherStore]) assert.equal((await q('select vs_acesso($1) ok',[s.id]))[0].ok,false);
  await assert.rejects(q('select vs_painel($1)',[otherStore.id]),/Loja não autorizada/);
  assert.deepEqual((await q('select id from lojas')).map(l=>l.id),[store.id]);
  assert.deepEqual((await q('select id from perfis')).map(p=>p.id),[id(5)]);
  assert.deepEqual((await q('select loja_id from usuario_lojas')).map(u=>u.loja_id),[store.id]);
  const context=(await q('select vs_contexto_acesso() c'))[0].c;assert.deepEqual(context.lojas.map(l=>l.id),[store.id]);assert.equal(context.empresa_admin,false);assert.deepEqual(context.empresas,[]);
  assert.equal((await q("select vs_permitido($1,'ENTRADA') ok",[store.id]))[0].ok,true);
  assert.equal((await q("select vs_permitido($1,'CORRECAO') ok",[store.id]))[0].ok,false);
  await assert.rejects(q('select vs_salvar_acessos($1,$2,$3,$4)',[id(5),'Escalada',[store2.id],lib]),/fora da empresa/);
  await assert.rejects(q(`select vs_salvar_loja('{"nome":"Escalada"}')`),/Somente o administrador/);
  await assert.rejects(q('select vs_reservar_conta($1,$2,$3)',[id(2),'outro@test.example','funcionario']),/permission denied/);
  await assert.rejects(q('select vs_editar_perfil($1,$2,$3,$4)',[id(5),'Operador','administrador',store.id]),/permission denied/);
 });
 await t.test('RPCs de negócio aplicam liberações e recusam outra loja',async()=>{
  await as(5);
  const payload={lojaId:store.id,setor:'validade',ean:'7890000000999',produtoNome:'Produto permitido',lote:'FAB-99',quantidade:10,precoAtual:2,dataVencimento:'2030-01-01',localizacao:'Depósito'};
  const entry=(await q('select vs_criar($1) e',[payload]))[0].e;
  await assert.rejects(q('select vs_criar($1)',[{...payload,lojaId:otherStore.id}]),/Loja não autorizada/);
  await assert.rejects(q('select vs_registrar($1,$2,$3,$4,$5,$6,$7,$8)',[entry.registro.id,9,null,'Venda','Venda registrada','',10,0]),/Cargo não autorizado/);
 });
 await t.test('admin escolhe lojas, pode suspender e não altera outra empresa nem a si próprio',async()=>{
  await as(2);
  await assert.rejects(q('select vs_salvar_acessos($1,$2,$3,$4)',[id(5),'Pessoa',[otherStore.id],lib]),/fora da empresa/);
  await assert.rejects(q('select vs_salvar_acessos($1,$2,$3,$4)',[id(2),'Admin',[store.id],lib]),/conta protegida/);
  await assert.rejects(q('select vs_salvar_acessos($1,$2,$3,$4)',[id(5),'Pessoa',[store.id],{...lib,equipe:true}]),/inválidas/);
  await q('select vs_salvar_acessos($1,$2,$3,$4)',[id(5),'Operador',[store2.id],{...lib,entrada:false,correcao:true}]);
  await as(5);assert.equal((await q('select vs_acesso($1) ok',[store.id]))[0].ok,false);assert.equal((await q("select vs_permitido($1,'CORRECAO') ok",[store2.id]))[0].ok,true);
  await as(2);await q('select vs_salvar_acessos($1,$2,$3,$4)',[id(5),'Suspenso',[],lib]);
  await as(5);assert.deepEqual((await q('select vs_contexto_acesso() c'))[0].c.lojas,[]);
  await db.exec('reset role');const log=(await q("select detalhes from vs_acessos_auditoria where usuario=$1 and acao='Liberações alteradas' order by id desc limit 1",[id(5)]))[0].detalhes;assert.deepEqual(log.lojas_antes,[store2.id]);
 });
 await t.test('identificador Auth não muda; dados de identidade não são graváveis pelo funcionário',async()=>{
  await db.exec('reset role');await assert.rejects(q('update auth.users set email=$1 where id=$2',['outro@usuarios.validasuper.invalid',id(5)]),/login do funcionário/);
  await assert.rejects(q('update auth.users set phone=$1 where id=$2',['5511999999999',id(5)]),/login do funcionário/);
  await as(5);await assert.rejects(q('update perfis set login=$1 where id=$2',['outro',id(5)]),/permission denied/);
 });
 } finally {await db.close();}
});
