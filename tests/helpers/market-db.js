import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export async function marketDB(){
 const db=new PGlite();const ids={admin:'00000000-0000-0000-0000-000000000001',operator:'00000000-0000-0000-0000-000000000002',store:'00000000-0000-0000-0000-000000000010',other:'00000000-0000-0000-0000-000000000020',company:'00000000-0000-0000-0000-000000000099'};
 const q=async(sql,args)=>(await db.query(sql,args)).rows;
 await db.exec(`create role anon;create role authenticated;create role service_role;
 alter default privileges grant execute on functions to anon,authenticated;
 create schema auth;create table auth.users(id uuid primary key,email text,phone text,encrypted_password text default 'initial',raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 ${fs.readFileSync(new URL('../fixtures/schema-real.sql',import.meta.url),'utf8')}
 create function forcar_virada_ciclo_teste(uuid) returns text language sql as $$select 'legado'$$;
 create function gerar_codigo_lote(uuid) returns text language sql as $$select 'legado'$$;
 create function gerar_codigo_lote(uuid,varchar) returns text language sql as $$select 'legado'$$;
 create function get_meu_perfil() returns text language sql as $$select 'operador'$$;
 create function get_user_funcao() returns text language sql as $$select 'operador'$$;
 create function get_user_loja_id() returns uuid language sql as $$select null::uuid$$;
 create function usuario_tem_acesso_loja(uuid) returns boolean language sql as $$select true$$;
 insert into lojas(id,nome,numero_loja) values('${ids.store}','Mercado teste','91'),('${ids.other}','Outra loja','92');
 insert into auth.users(id) values('${ids.admin}'),('${ids.operator}');
 insert into perfis(id,nome,funcao,loja_id) values('${ids.admin}','Gestor teste','administrador','${ids.store}'),('${ids.operator}','Operador teste','operador','${ids.store}');
 insert into usuario_lojas(usuario_id,loja_id) values('${ids.admin}','${ids.store}'),('${ids.operator}','${ids.store}');`);
 const migrations=new URL('../../supabase/migrations/',import.meta.url);
 for(const name of fs.readdirSync(migrations).sort())await db.exec(fs.readFileSync(new URL(name,migrations),'utf8'));
 await db.exec(`insert into vs_empresas(id,nome,administrador_id) values('${ids.company}','Mercado teste','${ids.admin}');update lojas set empresa_id='${ids.company}';
 update perfis set empresa_id='${ids.company}',tipo_conta=case when id='${ids.admin}' then 'empresa_admin' else 'funcionario' end,liberacoes='{"entrada":true,"movimentacao":true,"revisao":false,"correcao":false}';
 create table market_test_clock(day date);insert into market_test_clock values('2026-10-20');
 create or replace function vs_hoje() returns date language sql stable security definer as $$select day from market_test_clock$$;`);
 const as=async(user='admin')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${ids[user]}',false);select set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
 await as();
 const advance=async(day)=>{await db.exec('reset role');await q('update market_test_clock set day=$1',[day]);await as();};
 const panel=async(store=ids.store)=>(await q('select vs_painel($1) s',[store]))[0].s;
 const create=async(p)=>(await q('select vs_criar($1::jsonb) s',[JSON.stringify(p)]))[0].s;
 const op=async(item,destino,saldo,preco=5.9,motivo='Conferência física comprovada',override={})=>{
  const i={...(await panel()).itens.find(x=>x.id===item),...override};
  return q('select vs_registrar($1,$2,$3,$4,$5,$6,$7,$8)',[item,saldo,destino==='REVISAO'?preco:null,destino,motivo,'',i.quantidade,i.eventos.at(-1)?.id||0]);
 };
 return {db,q,as,advance,panel,create,op,ids};
}
