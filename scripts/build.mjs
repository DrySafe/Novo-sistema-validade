import { cp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
await rm(output, {recursive:true,force:true});
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'admin.html', 'css', 'js', 'manifest.webmanifest', 'sw.js', 'offline.html', 'icons']) {
 await cp(new URL(`../${name}`, import.meta.url), new URL(name, output), { recursive: true });
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (Boolean(url) !== Boolean(key)) throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntos');
if (url && key) {
 const parsed = new URL(url);
 if (parsed.protocol !== 'https:') throw new Error('SUPABASE_URL deve usar HTTPS');
 if (!key.startsWith('sb_publishable_')) {
  let payload;
  try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch {}
  if (payload?.role !== 'anon') throw new Error('Use somente chave publishable ou anon pública no frontend');
 }
 await writeFile(new URL('js/supabaseConfig.js', output), `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`);
}
// Impede publicação acidental de credenciais privilegiadas nos artefatos públicos.
async function inspect(dir) {
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=new URL(entry.name+(entry.isDirectory()?'/':''),dir);
  if(entry.isDirectory()){await inspect(path);continue;}
  if(!/\.(js|html|json|webmanifest|css)$/.test(entry.name))continue;
  const text=await readFile(path,'utf8');
  if(/sb_secret_[A-Za-z0-9_-]{12,}|sbp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}/.test(text))throw new Error('Credencial privada detectada no build; publicação bloqueada');
  for(const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
   let payload;try{payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{continue;}
   if(payload.role!=='anon')throw new Error('JWT não público detectado no build; publicação bloqueada');
  }
 }
}
await inspect(output);
console.log('Build estático concluído em dist; verificação de credenciais aprovada');
