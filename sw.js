const CACHE = 'fretboard-v11';
const ASSETS = [
  './',
  './index.html',
  './guide.html',
  './css/style.css',
  './js/app.js',
  './js/music.js',
  './js/fretboard.js',
  './js/audio.js',
  './js/game.js',
  './js/chordGame.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
