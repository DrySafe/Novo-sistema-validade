import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marketDB} from './helpers/market-db.js';
const maintenance=fs.readFileSync(new URL('../supabase/maintenance/regularizar-administrador-legado.sql',import.meta.url),'utf8');
test('regularização de legado preserva lojas, nega vínculos ambíguos e libera cadastro só para o titular',async()=>{
 const x=await marketDB({adminEmail:'legado@teste.invalid'});const {db,q,ids,as}=x;
 try{
  await db.exec("reset role;update lojas set empresa_id=null;update perfis set empresa_id=null,tipo_conta='legado';delete from vs_empresas;");
  await q("select set_config('validasuper.legacy_admin_email','legado@teste.invalid',false)");
  await assert.rejects(db.exec(maintenance),/outros usuários/);
  assert.equal((await q('select count(*)::int n from vs_empresas'))[0].n,0);
  await q('delete from usuario_lojas where usuario_id=$1',[ids.operator]);await q('update perfis set loja_id=null where id=$1',[ids.operator]);
  await q('insert into usuario_lojas(usuario_id,loja_id) values($1,$2)',[ids.admin,ids.other]);
  const before=await q('select id,nome from lojas order by id');
  await db.exec(maintenance);
  assert.deepEqual(await q('select id,nome from lojas order by id'),before);
  assert.equal((await q('select count(*)::int n from vs_empresas'))[0].n,1);
  await db.exec(maintenance);assert.equal((await q('select count(*)::int n from vs_empresas'))[0].n,1);
  await as();const ctx=(await q('select vs_contexto_acesso() c'))[0].c;assert.equal(ctx.empresa_admin,true);assert.equal(ctx.lojas.length,2);
  await as('operator');const denied=(await q('select vs_contexto_acesso() c'))[0].c;assert.equal(denied.empresa_admin,false);assert.equal(denied.lojas.length,0);
  await db.exec('reset role');await q('insert into vs_donos(usuario_id) values($1)',[ids.admin]);await assert.rejects(db.exec(maintenance),/CEO/);
 }finally{await db.close();}
});
