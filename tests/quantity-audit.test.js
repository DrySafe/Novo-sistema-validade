import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('migrações atuais: autorização, quantidade auditada, lote físico e isolamento', async t => {
 const db = new PGlite();
 const ids = { admin: '00000000-0000-0000-0000-000000000001', operator: '00000000-0000-0000-0000-000000000002', pricing: '00000000-0000-0000-0000-000000000003', audit: '00000000-0000-0000-0000-000000000004', store: '00000000-0000-0000-0000-000000000010', other: '00000000-0000-0000-0000-000000000020' };
 const q = async (sql, args) => (await db.query(sql, args)).rows;
 const as = async user => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${ids[user]}',false); select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`); };
 const panel = async () => (await q('select vs_painel($1) s', [ids.store]))[0].s;
 const payload = { lojaId: ids.store, setor: 'validade', ean: '7890000000001', produtoNome: 'Produto de teste', lote: 'FAB-123', quantidade: 12, precoAtual: 5.9, dataVencimento: '2026-12-31', localizacao: 'Depósito' };
 const create = async p => (await q('select vs_criar($1::jsonb) s', [JSON.stringify(p)]))[0].s;
 const current = async id => (await panel()).itens.find(i => i.id === id);
 const register = async (id, saldo, destino, motivo = 'Conferência física do estoque', override = {}) => {
  const i = { ...await current(id), ...override };
  return q('select vs_registrar($1,$2,$3,$4,$5,$6,$7,$8)', [id, saldo, destino === 'REVISAO' ? 5.5 : null, destino, motivo, '', i.quantidade, i.eventos.at(-1)?.id ?? 0]);
 };
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   alter default privileges grant execute on functions to anon,authenticated;
   create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
   ${fs.readFileSync(new URL('./fixtures/schema-real.sql', import.meta.url), 'utf8')}
   create function forcar_virada_ciclo_teste(uuid) returns text language sql as $$select 'legado'$$;
   create function gerar_codigo_lote(uuid) returns text language sql as $$select 'legado'$$;
   create function gerar_codigo_lote(uuid,varchar) returns text language sql as $$select 'legado'$$;
   create function get_meu_perfil() returns text language sql as $$select 'operador'$$;
   create function get_user_funcao() returns text language sql as $$select 'operador'$$;
   create function get_user_loja_id() returns uuid language sql as $$select null::uuid$$;
   create function usuario_tem_acesso_loja(uuid) returns boolean language sql as $$select true$$;
   insert into lojas(id,nome,numero_loja) values('${ids.store}','Centro','03'),('${ids.other}','Norte','04');
  `);
  for (const [name, role] of [['admin','administrador'],['operator','operador'],['pricing','precificacao'],['audit','adm']]) {
   await q('insert into auth.users(id) values($1)', [ids[name]]);
   await q('insert into perfis(id,nome,funcao,loja_id) values($1,$2,$3,$4)', [ids[name], 'Pessoa ' + name, role, ids.store]);
   await q('insert into usuario_lojas(usuario_id,loja_id) values($1,$2)', [ids[name], ids.store]);
  }
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const name of fs.readdirSync(migrations).sort()) await db.exec(fs.readFileSync(new URL(name, migrations), 'utf8'));
  await db.exec(`create or replace function vs_hoje() returns date language sql stable as $$select '2026-10-14'::date$$`);
  await as('admin');
  const entry = await create(payload); const id = entry.registro.id;

  await t.test('lote físico, nome/foto por entrada e duplicidade não apagam o catálogo', async () => {
   const first = await current(id);
   assert.equal(first.lote_fisico, 'FAB-123'); assert.equal(first.localizacao, 'Depósito');
   assert.equal((await create(payload)).isDuplicado, true);
   const second = await create({ ...payload, lote: 'FAB-456', produtoNome: 'Nome corrigido', imagemUrl: 'https://example.com/foto.jpg' });
   assert.equal(second.isDuplicado, false);
   const saved = await current(second.registro.id);
   assert.equal(saved.nome_entrada, 'Nome corrigido'); assert.equal(saved.imagem_entrada, 'https://example.com/foto.jpg');
   assert.equal(saved.produtos.nome, payload.produtoNome);
  });

  await t.test('operador não corrige quantidade nem altera preço; precificação não movimenta', async () => {
   await as('operator');
   await assert.rejects(register(id, 120, 'Correção'), /Cargo não autorizado/);
   await assert.rejects(register(id, 12, 'REVISAO'), /Cargo não autorizado/);
   await as('pricing');
   await assert.rejects(register(id, 11, 'Venda'), /Cargo não autorizado/);
   await assert.rejects(create({ ...payload, lote: 'NOVO' }), /Cargo não autorizado/);
   await register(id, 12, 'REVISAO');
   await as('audit');
   await assert.rejects(create({ ...payload, lote: 'NOVO' }), /Cargo não autorizado/);
   await as('admin');
  });

  await t.test('correção preserva a entrada, registra autor/data e invalida revisão anterior', async () => {
   const before = await current(id);
   await register(id, 120, 'Correção');
   const after = await current(id); const event = after.eventos.at(-1);
   assert.equal(after.quantidade, 120); assert.equal(after.quantidade_inicial, 12);
   assert.equal(after.ultima_rodada, null);
   assert.equal(event.usuario_id, ids.admin); assert.equal(event.usuario_nome, 'Pessoa admin');
   assert.equal(event.usuario_funcao, 'administrador'); assert.ok(event.ocorrido_em);
   assert.equal(event.saldo_anterior, 12); assert.equal(event.saldo_novo, 120);
   await assert.rejects(register(id, 10, 'Correção', 'Conferência completa', before), /Registro alterado/);
   await db.exec('reset role'); await q("update perfis set nome='Nome atualizado' where id=$1", [ids.admin]); await as('admin');
   assert.equal((await current(id)).eventos.at(-1).usuario_nome, 'Pessoa admin');
   await assert.rejects(q("update vs_eventos set motivo='apagado' where item_id=$1", [id]), /permission denied/);
   await assert.rejects(q('update lotes_validade set quantidade=999 where id=$1', [id]), /permission denied/);
  });

  await t.test('justificativa, versão e alteração efetiva são obrigatórias', async () => {
   await assert.rejects(register(id, 121, 'Correção', 'erro'), /justificativa/);
   await assert.rejects(register(id, 120, 'Correção'), /saldo diferente/);
   await assert.rejects(q("select vs_registrar($1,121,null,'Correção','Motivo completo','',null,null)", [id]), /versão esperados/);
  });

  await t.test('gestão pode corrigir zeramento errado sem apagar a saída nem histórico', async () => {
   await register(id, 0, 'Correção'); assert.equal((await current(id)).status, 'esgotado');
   await register(id, 10, 'Correção'); assert.equal((await current(id)).status, 'ativo');
   await as('operator'); await register(id, 9, 'Venda');
   assert.equal((await current(id)).eventos.filter(e => e.tipo === 'Correção').length, 3);
   await as('admin');
  });

  await t.test('avaria vencida não pode ser vendida; entradas AV/USO exigem motivo', async () => {
   await assert.rejects(create({ ...payload, setor: 'avarias', dataVencimento: '', lote: 'AV-1' }), /motivo da entrada/);
   const av = await create({ ...payload, setor: 'avarias', dataVencimento: '2026-10-13', motivo: 'Embalagem danificada', lote: 'AV-2' });
   await assert.rejects(register(av.registro.id, 11, 'Venda'), /Venda não permitida/);
   const uso = await create({ ...payload, setor: 'uso_loja', dataVencimento: '', motivo: 'Consumo interno planejado', lote: 'USO-1' });
   await register(uso.registro.id, 10, 'Uso Loja');
   assert.equal((await current(uso.registro.id)).eventos.at(-1).tipo, 'Uso Loja');
  });

  await t.test('equipe inclui vínculo secundário e edição não transfere loja principal', async () => {
   await db.exec('reset role');
   await q('insert into usuario_lojas(usuario_id,loja_id) values($1,$2)', [ids.admin, ids.other]);
   await q('insert into usuario_lojas(usuario_id,loja_id) values($1,$2)', [ids.operator, ids.other]);
   await as('admin');
   const team = (await q('select vs_equipe($1) t', [ids.other]))[0].t;
   assert.equal(team.length, 2);
   await q('select vs_editar_perfil($1,$2,$3,$4)', [ids.operator, 'Operador Renomeado', 'operador', ids.other]);
   assert.equal((await q('select loja_id from perfis where id=$1', [ids.operator]))[0].loja_id, ids.store);
   await as('pricing');
   assert.deepEqual((await q('select vs_equipe($1) t', [ids.store]))[0].t, []);
   await assert.rejects(q('select vs_painel($1)', [ids.other]), /não autorizada/);
  });
 } finally { await db.close(); }
});
