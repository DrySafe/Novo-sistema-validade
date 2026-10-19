// Cache apenas de recursos públicos. Sessões, páginas do app e APIs ficam na rede.
const CACHE = 'validasuper-public-v1';
const PUBLIC_FILES = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
 event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('validasuper-public-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
 // Nunca interceptar chamadas ao Supabase, POSTs ou consultas de dados.
 if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
 event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
