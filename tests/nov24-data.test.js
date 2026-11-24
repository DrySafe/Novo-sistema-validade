import test from 'node:test';
import assert from 'node:assert/strict';
import {marketDB} from './helpers/market-db.js';
import {itemValueCents,stockValue,lotValueLabel} from '../js/stockValue.js';

test('valor usa saldo e preço atual em centavos, distingue preço ausente de zero',()=>{
 assert.equal(itemValueCents({quantidade:3,preco_atual:0.1}),30);assert.equal(itemValueCents({quantidade:7,preco_atual:'12.99'}),9093);
 assert.equal(itemValueCents({quantidade:0,preco_atual:null}),0);assert.equal(itemValueCents({quantidade:3,preco_atual:null}),null);
 const total=stockValue([{quantidade:3,preco_atual:0.1},{quantidade:7,preco_atual:'12.99'},{quantidade:2,preco_atual:null}]);assert.equal(total.cents,9123);assert.equal(total.missing,1);assert.ok(total.partial);
 assert.match(lotValueLabel([{quantidade:2,preco_atual:null}]),/parcial/);assert.equal(itemValueCents({quantidade:3,preco_atual:-1}),null);
});

test('códigos internos preservam zeros e são validados e isolados no lançamento de VAL/AV/USO',async()=>{
 const {db,q,as,create,panel,ids}=await marketDB();try{
  for(const [index,setor]of ['validade','avarias','uso_loja'].entries()){
   const p={lojaId:ids.store,setor,ean:'789000000000'+index,produtoNome:'Produto teste '+index,lote:'FAB-'+index,quantidade:3,precoAtual:2.99,dataVencimento:'2026-12-20',localizacao:'Gôndola',motivo:'Conferência física da entrada',codigoProdutoEmpresa:'000123',codigoEmbalagemEmpresa:'CX-0004'};
   const result=(await q('select vs_criar_acomp($1) r',[p]))[0].r;const item=(await panel()).itens.find(i=>i.id===result.registro.id);assert.equal(item.codigo_produto_empresa,'000123');assert.equal(item.codigo_embalagem_empresa,'CX-0004');
   for(const invalid of ['x'.repeat(81),'linha\nindevida',123,{codigo:'123'}])await assert.rejects(create({...p,ean:'7890000000010',codigoProdutoEmpresa:invalid}),/Código interno/);
  }
  await as('operator');await assert.rejects(create({lojaId:ids.other,setor:'validade',ean:'7890000000099',produtoNome:'Negado',lote:'FAB',quantidade:1,precoAtual:1,dataVencimento:'2026-12-20',codigoProdutoEmpresa:'0001'}),/Loja não autorizada/);
 }finally{await db.close();}
});

test('edição de setor e exclusão bloqueiam JWT existente sem apagar autoria e estoque',async()=>{
 const {db,q,as,create,panel,ids}=await marketDB();const lib={entrada:true,movimentacao:true,revisao:false,correcao:false};try{
  await db.exec('reset role');await q("update perfis set login='operador.teste' where id=$1",[ids.operator]);await as('operator');
  const result=await create({lojaId:ids.store,setor:'validade',ean:'7891234567890',produtoNome:'Item com autoria',lote:'FAB',quantidade:10,precoAtual:2,dataVencimento:'2026-12-20'});const id=result.registro.id;
  await as();await q('select vs_salvar_pessoa($1,$2,$3,$4,$5)',[ids.operator,'Operador novo setor','funcionario',[ids.other],lib]);
  await as('operator');await assert.rejects(panel(ids.store),/Loja não autorizada/);assert.equal((await panel(ids.other)).api_version,2);
  await assert.rejects(q('select vs_excluir_colaborador($1,$2)',[ids.admin,'Tentativa sem autorização']),/protegida/);
  await as();await assert.rejects(q('select vs_excluir_colaborador($1,$2)',[ids.admin,'Não pode excluir a si mesmo']),/protegida/);
  await assert.rejects(q('select vs_excluir_colaborador($1,$2)',[ids.operator,'curto']),/10 a 500/);
  await q('select vs_excluir_colaborador($1,$2)',[ids.operator,'Desligamento registrado pela gestão']);
  assert.equal((await panel(ids.store)).itens.find(i=>i.id===id).quantidade,10);
  const listed=(await q('select vs_funcionarios() p'))[0].p.find(p=>p.id===ids.operator);assert.ok(listed.desativado_em);assert.equal(listed.gerenciavel,false);assert.equal(listed.login,'operador.teste');
  await as('operator');const ctx=(await q('select vs_contexto_acesso() c'))[0].c;assert.equal(ctx.conta_desativada,true);assert.deepEqual(ctx.lojas,[]);
  await assert.rejects(panel(ids.other),/Conta excluída/);await assert.rejects(q('select vs_contar_notificacoes()'),/Conta excluída/);assert.equal((await q('select id from lotes_validade where id=$1',[id])).length,0);
  await assert.rejects(q("select vs_meu_nome('Nome alterado')"),/Conta excluída/);await assert.rejects(q('select vs_usuario_ativo($1)',[ids.operator]),/permission denied/);
  await as();assert.ok((await panel(ids.store)).itens.find(i=>i.id===id).eventos.some(e=>e.usuario_id===ids.operator));
 }finally{await db.close();}
});
