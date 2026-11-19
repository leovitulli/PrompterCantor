/**
 * PrompterCantor - Service Worker
 * Garante funcionamento 100% Offline em Smartphones e Tablets nos shows.
 */

var CACHE_NAME = 'canta-ai-pro-v184';
var NETWORK_TIMEOUT_MS = 3500;

var ASSETS = [
  './',
  './index.html',
  './landing_v3.html',
  './manifest.json',
  './css/style.css',
  './css/admin.css',
  './css/landing.css',
  './css/landing_v3.css',
  './css/brand.css',
  './css/notifications.css',
  './css/interactiveTour.css',
  './assets/brand/favicon-32.png',
  './assets/brand/favicon-180.png',
  './assets/brand/favicon-192.png',
  './assets/brand/favicon-512.png',
  './assets/brand/simbolo-mono.svg',
  './assets/brand/fonts/BricolageGrotesque-ExtraBold.ttf',
  './assets/brand/fonts/DMSans-Regular.ttf',
  './assets/brand/fonts/DMSans-Medium.ttf',
  './assets/brand/fonts/DMSans-SemiBold.ttf',
  './js/rota.js',
  './js/polyfills.js',
  './js/config.js',
  './js/supabaseClient.js',
  './js/auth.js',
  './js/adminPanel.js',
  './js/db.js',
  './js/textParser.js',
  './js/sampleRepertoire.js',
  './js/transposer.js',
  './js/prompter.js',
  './js/mediaPlayer.js',
  './js/advancedPlayer.js',
  './js/gdrive.js',
  './js/gdriveUI.js',
  './js/notificationsCenter.js',
  './js/interactiveTour.js',
  './js/pwaInstaller.js',
  './js/repertoireShare.js',
  './js/tomColor.js',
  './js/brandIcons.js',
  './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        ASSETS.map(function (assetUrl) {
          return cache.add(assetUrl).catch(function (err) {
            console.warn('SW: falha ao pré-cachear asset individual:', assetUrl, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

function fetchWithTimeout(request, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error('Network timeout'));
    }, timeoutMs);

    fetch(request).then(function (response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function (err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  var url = event.request.url || '';
  // Não interceptar chamadas dinâmicas de API ou Supabase REST/Auth/Realtime
  if (url.indexOf('/api/') !== -1 || url.indexOf('supabase.co/') !== -1 || url.indexOf('mercadopago.com/') !== -1) {
    return;
  }

  event.respondWith(
    fetchWithTimeout(event.request, NETWORK_TIMEOUT_MS)
      .then(function (response) {
        if (response && response.status === 200) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(event.request).then(function (exactMatch) {
          if (exactMatch) return exactMatch;
          return caches.match(event.request, { ignoreSearch: true });
        }).then(function (cachedResponse) {
          if (cachedResponse) return cachedResponse;
          var acceptHeader = event.request.headers.get('accept') || '';
          if (acceptHeader.indexOf('text/html') !== -1) {
            return caches.match('./index.html', { ignoreSearch: true });
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
  );
});
