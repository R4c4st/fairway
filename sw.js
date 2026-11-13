/* Fairway — service worker : appli dispo hors ligne sur le parcours */
const VERSION = 'fairway-v26';
const SHELL = ['./', 'index.html', 'app.js', 'core.js', 'courses.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const LIBS = /cdn\.jsdelivr\.net|unpkg\.com/;
const TILES = /arcgisonline\.com/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/supabase\.co/.test(url.host)) return; // API : jamais en cache
  // Fichiers de l'appli : réseau d'abord (mises à jour), cache si hors ligne
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  // Bibliothèques et tuiles satellite : cache d'abord
  if (LIBS.test(url.host) || TILES.test(url.host)) {
    const store = TILES.test(url.host) ? VERSION + '-tiles' : VERSION + '-libs';
    e.respondWith(caches.open(store).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }))));
  }
});
