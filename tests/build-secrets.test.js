import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('build bloqueia uma chave privada sem imprimir seu valor e remove arquivos obsoletos',async()=>{
 const root=await mkdtemp(join(tmpdir(),'validasuper-build-'));
 try{
  for(const dir of ['scripts','css','js','icons','dist'])await mkdir(join(root,dir));
  await cp(new URL('../scripts/build.mjs',import.meta.url),join(root,'scripts/build.mjs'));
  for(const file of ['index.html','admin.html','manifest.webmanifest','sw.js','offline.html'])await writeFile(join(root,file),'Teste público');
  const canary='sb_secret_'+('fake-only-'.repeat(5));await writeFile(join(root,'js/canary.js'),JSON.stringify(canary));
  await writeFile(join(root,'dist/obsolete.js'),'obsoleto');
  const env={...process.env};delete env.SUPABASE_URL;delete env.SUPABASE_PUBLISHABLE_KEY;
  const blocked=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,env,encoding:'utf8'});
  assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/Credencial privada detectada/);assert.ok(!blocked.stderr.includes(canary));
  await rm(join(root,'js/canary.js'));
  const safe=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,env,encoding:'utf8'});assert.equal(safe.status,0,safe.stderr);
  const {existsSync}=await import('node:fs');assert.equal(existsSync(join(root,'dist/obsolete.js')),false);assert.equal(existsSync(join(root,'dist/js/canary.js')),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
