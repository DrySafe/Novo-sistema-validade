export async function buscarOpenFoodFacts(ean, fetcher = fetch) {
 ean = String(ean).trim();
 if (!/^[0-9]{8,14}$/.test(ean)) throw new Error('Informe um código de barras com 8 a 14 números.');
 const fields = 'product_name_pt,product_name,generic_name_pt,generic_name,image_front_url,image_url,selected_images';
 const response = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${fields}`, { signal: AbortSignal.timeout(12000) });
 if (response.status === 404) return null;
 if (!response.ok) throw new Error('Open Food Facts indisponível. Tente novamente ou preencha manualmente.');
 const { status, product } = await response.json();
 if (Number(status) !== 1 || !product) return null;
 const nome = [product.product_name_pt, product.product_name, product.generic_name_pt, product.generic_name].find(v => typeof v === 'string' && v.trim());
 const front = product.selected_images?.front?.display || {};
 const imagem = product.image_front_url || product.image_url || front.pt || Object.values(front)[0] || null;
 return { ean, nome: nome?.trim() || '', imagem_url: imagem };
}

export function configurarBuscaProduto(document, buscar) {
 const input = document.getElementById('entry-ean');
 const nome = document.getElementById('entry-product-name');
 const imagem = document.getElementById('entry-image-url');
 const box = document.getElementById('product-preview-box');
 const foto = document.getElementById('preview-img');
 const titulo = document.getElementById('preview-title');
 const aviso = document.createElement('p');
 aviso.setAttribute('role','status'); aviso.setAttribute('aria-live','polite');
 aviso.className = 'product-lookup-status'; input.insertAdjacentElement('afterend', aviso);
 let versao = 0, pendente = null, codigoAtual = '', nomeAutomatico = '';
 const pesquisar = async () => {
  const ean = input.value.trim();
  if (ean === codigoAtual && pendente) return pendente;
  const atual = ++versao; codigoAtual = ean;
  if (nome.value === nomeAutomatico) nome.value = '';
  nomeAutomatico = ''; imagem.value = ''; foto.removeAttribute('src'); box.classList.add('hidden');
  if (!ean) { aviso.textContent = ''; return; }
  aviso.textContent = 'Buscando produto…';
  pendente = (async () => {
   try {
    const produto = await buscar(ean);
    if (atual !== versao || input.value.trim() !== ean) return;
    if (!produto) { aviso.textContent = 'Produto não encontrado. Preencha o nome manualmente.'; return; }
    if (!nome.value && produto.nome) { nome.value = produto.nome; nomeAutomatico = produto.nome; }
    imagem.value = produto.imagem_url || '';
    titulo.textContent = produto.nome || 'Produto sem nome cadastrado';
    foto.hidden = !produto.imagem_url;
    if (produto.imagem_url) foto.src = produto.imagem_url;
    box.classList.remove('hidden');
    aviso.textContent = produto.nome ? (produto.imagem_url ? 'Produto encontrado.' : 'Produto encontrado, sem foto cadastrada.') : 'Produto sem nome cadastrado. Preencha manualmente.';
   } catch { if (atual === versao) aviso.textContent = 'Não foi possível consultar o produto. Verifique sua conexão e tente novamente ou preencha manualmente.'; }
   finally { if (atual === versao) pendente = null; }
  })();
  return pendente;
 };
 input.addEventListener('change', pesquisar);
 input.addEventListener('blur', pesquisar);
 return pesquisar;
}
