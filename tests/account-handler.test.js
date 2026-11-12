import test from 'node:test';
import assert from 'node:assert/strict';
import { accountHandler } from '../supabase/functions/gerenciar-equipe/handler.js';
const payload={acao:'funcionario',nome:'Maria',login:'maria',password:'senha-provisoria-123',lojas:['00000000-0000-0000-0000-000000000010'],liberacoes:{entrada:true,movimentacao:false,revisao:false,correcao:false},ator:'forjado'};
const request=body=>new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer sessao','Content-Type':'application/json'},body:JSON.stringify(body)});
function stub(){const calls=[];const admin={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='vs_reservar_conta'?'nonce':{id:'novo'},error:null};},auth:{getUser:async()=>({data:{user:{id:'ator-real'}}}),admin:{createUser:async args=>{calls.push(['createUser',args]);return {data:{user:{id:'novo'}}};},deleteUser:async id=>{calls.push(['deleteUser',id]);return {error:null};}}}};return {admin,calls};}
test('Edge usa ator do JWT, e-mail técnico e UUID reservado de Auth Admin',async()=>{
 const {admin,calls}=stub();const response=await accountHandler(admin)(request(payload));assert.equal(response.status,200);
 const create=calls.find(c=>c[0]==='createUser')[1];assert.equal(create.email,'maria@usuarios.validasuper.invalid');assert.equal(create.id,'nonce');assert.equal(create.app_metadata,undefined);
 assert.equal(calls.find(c=>c[0]==='vs_provisionar_funcionario')[1].p_ator,'ator-real');assert.ok(calls.some(c=>c[0]==='vs_cancelar_reserva'));
});
test('Edge nega cargo falso antes de criar Auth e compensa somente conta recém-criada',async()=>{
 const a=stub();a.admin.rpc=async()=>({error:{message:'negado'}});assert.equal((await accountHandler(a.admin)(request(payload))).status,403);assert.ok(!a.calls.some(c=>c[0]==='createUser'));
 const b=stub(), rpc=b.admin.rpc;b.admin.rpc=async(name,args)=>name==='vs_provisionar_funcionario'?{error:{message:'loja indevida'}}:rpc(name,args);
 assert.equal((await accountHandler(b.admin)(request(payload))).status,400);assert.deepEqual(b.calls.find(c=>c[0]==='deleteUser'),['deleteUser','novo']);
});
test('CEO envia somente e-mail e senha; vincular conta ou loja é recusado antes de criar Auth',async()=>{
 for(const forbidden of [{lojas:['00000000-0000-0000-0000-000000000010']},{vincularExistente:true},{nome:'Empresa'}]){
  const {admin,calls}=stub();const response=await accountHandler(admin)(request({acao:'administrador',email:'admin@test.example',password:'senha-inicial-123',...forbidden}));
  assert.equal(response.status,400);assert.equal(calls.length,0);
 }
 const {admin,calls}=stub();const response=await accountHandler(admin)(request({acao:'administrador',email:'admin@test.example',password:'senha-inicial-123'}));
 assert.equal(response.status,200);assert.ok(!calls.some(c=>c[0]==='vs_conta_email'));
 assert.deepEqual(calls.find(c=>c[0]==='vs_provisionar_empresa')[1].p_lojas,[]);
});

test('senhas acima do limite UTF-8 do Auth são recusadas antes de reservar ou criar conta',async()=>{
 for(const password of ['a'.repeat(73),'🔑'.repeat(19)]){
  const {admin,calls}=stub();const response=await accountHandler(admin)(request({...payload,password}));
  assert.equal(response.status,400);assert.match((await response.json()).error,/Senha longa demais/);assert.equal(calls.length,0);
 }
});

test('cadastro aceita seis caracteres para ADM e funcionário e recusa cinco antes do Auth',async()=>{
 for(const body of [payload,{acao:'administrador',email:'admin@test.example'}]){
  const valid=stub();assert.equal((await accountHandler(valid.admin)(request({...body,password:'Abc123'}))).status,200);
  assert.equal(valid.calls.find(c=>c[0]==='createUser')[1].password,'Abc123');
  const invalid=stub();const response=await accountHandler(invalid.admin)(request({...body,password:'Ab123'}));
  assert.equal(response.status,400);assert.match((await response.json()).error,/6 caracteres/);assert.equal(invalid.calls.length,0);
 }
});

test('duplicidade explica que senha existente não muda; falha interna não se apresenta como dado inválido',async()=>{
 for(const [code,status] of [['email_exists',409],['unexpected_failure',503],['weak_password',400]]){
  const {admin,calls}=stub();admin.auth.admin.createUser=async()=>({data:{user:null},error:{code,message:'detalhe privado'}});
  const response=await accountHandler(admin)(request(payload));const body=await response.json();
  assert.equal(response.status,status);assert.equal(body.code,code);assert.doesNotMatch(body.error,/detalhe privado/);
  if(code==='email_exists')assert.match(body.error,/não altera a senha existente/);
  assert.ok(!calls.some(c=>c[0]==='deleteUser'||c[0]==='vs_provisionar_funcionario'));assert.ok(calls.some(c=>c[0]==='vs_cancelar_reserva'));
 }
});
