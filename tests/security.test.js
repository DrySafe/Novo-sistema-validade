import test from 'node:test';
import assert from 'node:assert/strict';
import {marketDB} from './helpers/market-db.js';
import {accountHandler} from '../supabase/functions/gerenciar-equipe/handler.js';

test('tabelas antigas, catálogo e RPCs respeitam isolamento e bloqueiam escrita direta',async()=>{
 const x=await marketDB({extraSchema:`create table registros_perdas(id uuid default gen_random_uuid(),loja_id uuid,motivo text);create table promocoes(id uuid default gen_random_uuid(),loja_id uuid);alter table registros_perdas enable row level security;alter table promocoes enable row level security;create policy aberto on registros_perdas for all using(true) with check(true);create policy aberto on promocoes for all using(true) with check(true);create policy antiga_aberta on auditoria_eventos for select using(true);grant all on registros_perdas,promocoes,auditoria_eventos,produtos to anon,authenticated;`});
 const {db,q,as,ids,create,panel}=x;
 try{
  const payload={lojaId:ids.store,setor:'validade',ean:'7890000000991',produtoNome:"Produto '<script>alert(1)</script>",lote:'FAB-1',quantidade:10,precoAtual:9,dataVencimento:'2035-01-01',localizacao:'Gôndola'};
  await create(payload);assert.equal((await panel()).itens[0].produtos.preco_atual,undefined);
  await db.exec('reset role');
  await q('insert into produtos(ean,nome,preco_atual) values($1,$2,500)',['7890000000992','Outro tenant']);
  await q('insert into registros_perdas(loja_id,motivo) values($1,$2),($3,$4)',[ids.store,'Permitido',ids.other,'Segredo']);
  await q('insert into auditoria_eventos(loja_id,acao) values($1,$2),($3,$4)',[ids.store,'Permitido',ids.other,'Segredo']);
  await as();assert.deepEqual((await q('select ean from produtos')).map(r=>r.ean),[payload.ean]);
  await assert.rejects(q('select preco_atual from produtos'),/permission denied/);
  await as('operator');
  assert.deepEqual((await q('select motivo from registros_perdas')).map(r=>r.motivo),['Permitido']);assert.deepEqual((await q('select acao from auditoria_eventos')).map(r=>r.acao),['Permitido']);
  for(const table of ['produtos','auditoria_eventos','registros_perdas','promocoes','perfis']){
   await assert.rejects(q('delete from '+table),/permission denied/);
  }
  await assert.rejects(q('select vs_sec_base_vs_painel($1)',[ids.store]),/permission denied/);
  await assert.rejects(create({...payload,lojaId:"' or 1=1 --"}));assert.equal((await panel()).itens.length,1);
  await as('operator');await assert.rejects(q('select vs_consumir_limite($1,$2,1,60)',[ids.admin,'forjado']),/permission denied/);
  await db.exec('reset role;set role anon');
  for(const table of ['produtos','auditoria_eventos','registros_perdas','promocoes','perfis','lojas','vs_eventos','vs_limites_operacao'])await assert.rejects(q('select * from '+table),/permission denied/);
  await assert.rejects(q('select vs_painel($1)',[ids.store]),/permission denied/);
 }finally{await db.close();}
});

test('limites não são controlados pelo cliente e excesso devolve código HTTP 429',async()=>{
 const x=await marketDB();const {db,q,as,ids}=x;
 try{
  await db.exec('reset role');
  await q("insert into vs_limites_operacao(usuario,acao,janela,quantidade,expira_em) values($1,'vs_painel',date_trunc('minute',clock_timestamp()),240,clock_timestamp()+interval '1 minute')",[ids.admin]);
  await as();await assert.rejects(q('select vs_painel($1)',[ids.store]),e=>e.code==='PT429');
  await as('operator');assert.ok((await q('select vs_painel($1) s',[ids.store]))[0].s);
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);select set_config('request.jwt.claim.role','service_role',false);");
  assert.ok((await q('select vs_sincronizar($1) rodada',[ids.other]))[0].rodada);
  assert.equal((await q('select count(*)::int n from vs_limites_operacao where usuario is null'))[0].n,0);
 }finally{await db.close();}
});

test('CORS rejeita origem externa; validação limita corpo e não exige confiança no navegador',async()=>{
 let authCalls=0;const handler=accountHandler({auth:{getUser:async()=>{authCalls++;return {data:{user:{id:'ator'}}};}},rpc:async()=>({error:{code:'PT429'}})});
 const make=(body,origin='https://validadeeco.vercel.app',type='application/json')=>new Request('https://edge.test',{method:'POST',headers:{Origin:origin,Authorization:'Bearer real','Content-Type':type},body:JSON.stringify(body)});
 const forbidden=await handler(make({},'https://evil.example'));assert.equal(forbidden.status,403);assert.equal(forbidden.headers.get('Access-Control-Allow-Origin'),null);assert.equal(authCalls,0);
 const preflight=await handler(new Request('https://edge.test',{method:'OPTIONS',headers:{Origin:'https://validadeeco.vercel.app'}}));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://validadeeco.vercel.app');
 assert.equal((await handler(make({texto:'x'.repeat(17000)}))).status,413);
 assert.equal((await handler(make({},undefined,'text/plain'))).status,415);
 const limited=await handler(make({acao:'administrador',email:'adm@test.invalid',password:'123456'}));assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'600');
 assert.equal((await handler(new Request('https://edge.test',{method:'POST'}))).status,401);
});
