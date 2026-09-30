import { cp, mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'css', 'js']) {
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
 await writeFile(new URL('js/supabaseClient.js', output), `export const supabase = window.supabase.createClient(${JSON.stringify(url)}, ${JSON.stringify(key)});\n`);
}
console.log('Build estático concluído em dist');
