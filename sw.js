/**
 * PrompterCantor - Service Worker
 * Garante funcionamento 100% Offline em Smartphones, Tablets e iPads no palco.
 */

var CACHE_NAME = 'prompter-cantor-v71';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/polyfills.js',
  './js/config.js',
  './js/supabaseClient.js',
  './js/db.js',
  './js/textParser.js',
  './js/sampleRepertoire.js',
  './js/transposer.js',
  './js/prompter.js',
  './js/mediaPlayer.js',
  './js/advancedPlayer.js',
  './js/gdrive.js',
  './js/gdriveUI.js',
  './js/app.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS).catch(function(err) {
        console.warn('Falha no pré-cache de alguns assets:', err);
      });
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
  if (event.request.method !== 'GET') return;

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
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
