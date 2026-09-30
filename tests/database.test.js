import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('migração e fluxo completo com isolamento, concorrência, preços e destinações', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role',true),current_setting('request.jwt.claims',true)::jsonb->>'role') $$;
      ${fs.readFileSync(new URL('./fixtures/schema-real.sql', import.meta.url), 'utf8')}
      create function forcar_virada_ciclo_teste(uuid) returns text language sql as $$ select 'legado' $$;
      create function gerar_codigo_lote(uuid) returns text language sql as $$ select 'legado' $$;
      create function gerar_codigo_lote(uuid,varchar) returns text language sql as $$ select 'legado' $$;
      insert into auth.users values('00000000-0000-0000-0000-000000000001');
      insert into lojas(id,numero_loja,nome) values('00000000-0000-0000-0000-000000000010','03','Loja 03'),('00000000-0000-0000-0000-000000000020','04','Loja 04');
      insert into perfis(id,loja_id,nome,funcao) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','Operador','operador');
      select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
      select set_config('request.jwt.claim.role','authenticated',false);
    `);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/202609300001_acompanhamento.sql', import.meta.url), 'utf8'));
    await db.exec(`create table test_clock(day date); insert into test_clock values('2026-09-01');
      create or replace function vs_hoje() returns date language sql stable set search_path=public as $$ select day from test_clock $$;`);
    const loja = '00000000-0000-0000-0000-000000000010';
    const query = async (sql, params) => (await db.query(sql, params)).rows;
    const payload = { lojaId: loja, ean: '7890000000001', produtoNome: 'Produto teste', quantidade: 100, precoAtual: 10, dataVencimento: '2026-10-31', setor: 'validade', localizacao: 'Gôndola' };
    assert.equal((await query("select character_maximum_length n from information_schema.columns where table_name='ciclos_lotes' and column_name='codigo_lote'"))[0].n,30);
    await db.exec("update lojas set numero_loja='1234567890' where id='00000000-0000-0000-0000-000000000020'");
    const create = async p => (await query('select vs_criar($1::jsonb) as resultado', [JSON.stringify(p)]))[0].resultado;
    const entry = await create(payload); const itemId = entry.registro.id;
    assert.equal(entry.isDuplicado, false);
    assert.equal((await create(payload)).isDuplicado, true);
    assert.equal((await query('select quantidade_inicial,dias_entrada,preco_inicial from vs_itens where item_id=$1', [itemId]))[0].dias_entrada, 60);
    const state = async () => (await query('select l.quantidade,i.*, (select max(id) from vs_eventos where item_id=l.id) versao from lotes_validade l join vs_itens i on i.item_id=l.id where l.id=$1', [itemId]))[0];
    const operation = async (destino, saldo, preco = null, stale = null) => {
      const s = stale || await state();
      return query('select vs_registrar($1,$2,$3,$4,$5,$6,$7,$8)', [itemId, saldo, preco, destino, 'Justificativa', s.origem_codigo, s.quantidade, s.versao]);
    };
    await operation('REVISAO',100,10);
    const old = await state();
    await operation('Venda',70);
    await assert.rejects(operation('REVISAO',100,8,old), /Registro alterado/);
    await assert.rejects(operation('REVISAO',50,8), /saldo confirmado/);
    await db.exec(`update test_clock set day='2026-09-16'`);
    await query('select vs_sincronizar($1)', [loja]);
    assert.equal((await query('select count(*) n from vs_rodadas'))[0].n, 2);
    await operation('REVISAO',70,8);
    const revised = await state(); assert.equal(revised.ultima_faixa, '45'); assert.equal(revised.preco_atual, '8');
    const panel = (await query('select vs_painel($1) painel',[loja]))[0].painel;
    assert.equal(panel.itens[0].origem_codigo,revised.origem_codigo);
    assert.equal(panel.itens[0].eventos.filter(e => e.tipo==='REVISAO').length,2);
    await operation('Venda',12);
    await db.exec(`update test_clock set day='2026-10-31'`);
    await query('select vs_sincronizar($1)', [loja]);
    await query('select vs_sincronizar($1)', [loja]);
    const expired = await state();
    assert.equal(expired.saldo_vencimento,12); assert.match(expired.lote_vencidos,/03VENC31102026/);
    assert.match(expired.origem_codigo,/03VAL092026/);
    assert.equal((await query("select count(*) n from vs_eventos where tipo='VENCIMENTO'"))[0].n,1);
    await assert.rejects(operation('Venda',11), /Venda não permitida/);
    await operation('Descarte',8);
    assert.equal((await state()).quantidade,8);
    await operation('Troca',0);
    await query('select vs_painel($1)',[loja]);
    assert.equal((await query('select status from ciclos_lotes where codigo_lote=$1',[expired.origem_codigo]))[0].status,'ARQUIVADO');
    assert.equal((await query('select status from lotes_validade where id=$1', [itemId]))[0].status,'esgotado');
    await assert.rejects(operation('Troca',0), /já concluído/);
    const destinations = await query("select tipo,quantidade from vs_eventos where tipo in ('Descarte','Troca') order by id");
    assert.deepEqual(destinations.map(e => [e.tipo,e.quantidade]), [['Descarte',4],['Troca',8]]);
    await assert.rejects(create({ ...payload, lojaId: '00000000-0000-0000-0000-000000000020' }), /não autorizada/);
    const avaria = await create({ ...payload, setor: 'avarias', dataVencimento: '', motivo: 'Quebra', quantidade: 3 });
    assert.equal((await query('select tipo from vs_itens where item_id=$1',[avaria.registro.id]))[0].tipo,'AV');
    const before = (await query('select count(*) n from vs_eventos'))[0].n;
    await assert.rejects(create({ ...payload, quantidade: -1 }), /obrigatórios/);
    assert.equal((await query('select count(*) n from vs_eventos'))[0].n,before);
    await query('select vs_rotina_diaria()');
    assert.equal((await query("select count(*) n from vs_rodadas where loja_id='00000000-0000-0000-0000-000000000020'"))[0].n,1);
    assert.equal((await query("select length(codigo_lote) n from ciclos_lotes where loja_id='00000000-0000-0000-0000-000000000020'"))[0].n,23);
    await db.exec(`insert into lotes_validade(loja_id,produto_id,lote,data_vencimento,quantidade,localizacao,usuario_id,status,ciclo_lote_id,origem_cadastro)
      select '00000000-0000-0000-0000-000000000020',p.id,c.codigo_lote,'2026-12-31',1,'Gôndola',auth.uid(),'ativo',c.id,'PADRAO'
      from produtos p cross join ciclos_lotes c where p.ean='7890000000001' and c.loja_id='00000000-0000-0000-0000-000000000020' limit 1;`);
    // Testa privilégios reais do cliente: acesso direto de escrita foi removido.
    await db.exec('set role authenticated');
    await assert.rejects(query('update lotes_validade set quantidade=999 where id=$1',[itemId]), /permission denied/);
    await assert.rejects(query("update vs_eventos set motivo='alterado'"), /permission denied/);
    await assert.rejects(query("select forcar_virada_ciclo_teste($1)",[loja]), /permission denied/);
    const rows = await query('select * from vs_itens'); assert.ok(rows.every(r => r.loja_id===loja));
    const lots = await query('select * from lotes_validade'); assert.ok(lots.every(r => r.loja_id===loja));
    await assert.rejects(query("select vs_painel('00000000-0000-0000-0000-000000000020')"),/não autorizada/);
    await assert.rejects(query('select vs_rotina_diaria()'),/permission denied/);
  } finally { await db.close(); }
});
