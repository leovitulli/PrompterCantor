/**
 * PrompterCantor - Service Worker
 * Garante funcionamento 100% Offline em Smartphones, Tablets e iPads no palco.
 */

var CACHE_NAME = 'prompter-cantor-v8';
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/polyfills.js',
  './js/db.js',
  './js/textParser.js',
  './js/sampleRepertoire.js',
  './js/gdrive.js',
  './js/gdriveUI.js',
  './js/advancedPlayer.js',
  './js/prompter.js',
  './js/mediaPlayer.js',
  './js/app.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@500;700&display=swap'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  // Estratégia Network First com Fallback para Cache
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        if (response && response.status === 200) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(function() {
        return caches.match(event.request).then(function(cachedResponse) {
          return cachedResponse || caches.match('./index.html');
        });
      })
  );
});
