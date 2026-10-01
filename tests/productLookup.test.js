import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buscarOpenFoodFacts, configurarBuscaProduto } from '../js/productLookup.js';
test('API preenche nome português e imagem e distingue indisponibilidade de ausência', async () => {
 const produto=await buscarOpenFoodFacts('3017620422003',async url=>{
  assert.match(url,/api\/v2\/product\/3017620422003/);
  return {ok:true,json:async()=>({status:1,product:{product_name_pt:'Creme de avelã',selected_images:{front:{display:{pt:'https://images.openfoodfacts.org/foto.jpg'}}}}})};
 });
 assert.equal(produto.nome,'Creme de avelã'); assert.match(produto.imagem_url,/foto.jpg/);
 assert.equal(await buscarOpenFoodFacts('3017620422003',async()=>({status:404})),null);
 await assert.rejects(buscarOpenFoodFacts('3017620422003',async()=>({ok:false,status:503})),/indisponível/);
});
test('leitura direta preenche formulário e resposta anterior não troca produto atual',async()=>{
 const dom=new JSDOM('<input id="entry-ean"><input id="entry-product-name"><input id="entry-image-url"><div id="product-preview-box" class="hidden"><img id="preview-img"><span id="preview-title"></span></div>');
 const d=dom.window.document; let resolver;
 const buscar=configurarBuscaProduto(d,ean=>ean==='3017620422003'?new Promise(r=>resolver=r):Promise.resolve({nome:'Produto novo',imagem_url:'https://images.openfoodfacts.org/novo.jpg'}));
 d.getElementById('entry-ean').value='3017620422003'; const antigo=buscar();
 d.getElementById('entry-ean').value='7890000000001'; await buscar();
 resolver({nome:'Produto antigo',imagem_url:'https://images.openfoodfacts.org/antigo.jpg'}); await antigo;
 assert.equal(d.getElementById('entry-product-name').value,'Produto novo');
 assert.match(d.getElementById('preview-img').src,/novo.jpg/);
 assert.match(d.getElementById('entry-image-url').value,/novo.jpg/);
 assert.equal(d.getElementById('product-preview-box').classList.contains('hidden'),false);
 dom.window.close();
});
