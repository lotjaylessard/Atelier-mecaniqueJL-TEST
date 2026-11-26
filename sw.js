// sw.js — simple caching service worker
const CACHE_NAME = 'garage-v2-cache-v1';
const FILES = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/db.js',
  '/js/pdf.js',
  '/js/pwa.js',
  '/img/gear-yellow.svg'
];

self.addEventListener('install', evt=>{
  evt.waitUntil(caches.open(CACHE_NAME).then(cache=> cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', evt=>{
  evt.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', evt=>{
  evt.respondWith(caches.match(evt.request).then(resp => resp || fetch(evt.request)));
});
