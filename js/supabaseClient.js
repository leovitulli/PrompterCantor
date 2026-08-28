/**
 * CantaAí PRO — Supabase Cloud Service (com Suporte Total a iPad Legado & Safari iOS 9-12)
 * Gerencia a conexão direta com o Supabase PostgreSQL, autenticação REST e escuta Realtime.
 */

(function () {
  'use strict';

  var client = null;

  function isValidUUID(str) {
    if (!str) return false;
    var s = String(str).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  function getStoredAccessToken() {
    try {
      var raw = localStorage.getItem('prompter_auth_user');
      if (raw) {
        var u = JSON.parse(raw);
        if (u && u.access_token) return u.access_token;
      }
    } catch (e) {}
    return null;
  }

  function initClient() {
    if (window.supabase && typeof window.supabase.createClient === 'function' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) {
      try {
        client = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);
        console.log('✅ Supabase Client oficial conectado.');
        updateSyncBadge('online');
        return client;
      } catch (err) {
        console.warn('⚠️ Erro ao inicializar cliente Supabase oficial, usando fallback REST:', err);
      }
    }

    // FALLBACK REST CLIENT UNIVERSAL (SAFARI / IPAD LEGADO / IOS 9-12)
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key) {
      var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1/';
      var authUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/auth/v1/';
      var apiKey = window.SUPABASE_CONFIG.key;

      function restRequest(method, table, query, body, headers) {
        return new Promise(function(resolve) {
          var url = baseUrl + table + (query ? '?' + query : '');
          var xhr = new XMLHttpRequest();
          xhr.open(method, url, true);
          xhr.setRequestHeader('apikey', apiKey);

          var userToken = getStoredAccessToken();
          xhr.setRequestHeader('Authorization', 'Bearer ' + (userToken || apiKey));
          xhr.setRequestHeader('Content-Type', 'application/json');

          if (headers) {
            for (var h in headers) {
              if (Object.prototype.hasOwnProperty.call(headers, h)) {
                xhr.setRequestHeader(h, headers[h]);
              }
            }
          }

          xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                var data = xhr.responseText ? JSON.parse(xhr.responseText) : [];
                resolve({ data: data, error: null });
              } catch (e) {
                resolve({ data: [], error: null });
              }
            } else {
              try {
                var errJson = JSON.parse(xhr.responseText);
                resolve({ data: null, error: errJson });
              } catch (e) {
                resolve({ data: null, error: { message: 'HTTP ' + xhr.status } });
              }
            }
          };
          xhr.onerror = function() {
            resolve({ data: null, error: { message: 'Erro de conexão com o Supabase' } });
          };

          if (body) {
            xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
          } else {
            xhr.send();
          }
        });
      }

      function authRequest(endpoint, body) {
        return new Promise(function(resolve) {
          var url = authUrl + endpoint;
          var xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.setRequestHeader('apikey', apiKey);
          xhr.setRequestHeader('Content-Type', 'application/json');

          xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                var data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                resolve({ data: data, error: null });
              } catch (e) {
                resolve({ data: {}, error: null });
              }
            } else {
              try {
                var errJson = JSON.parse(xhr.responseText);
                resolve({ data: null, error: errJson });
              } catch (e) {
                resolve({ data: null, error: { message: 'HTTP ' + xhr.status } });
              }
            }
          };
          xhr.onerror = function() {
            resolve({ data: null, error: { message: 'Erro de conexão com o Supabase Auth' } });
          };

          xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
        });
      }

      client = {
        auth: {
          signInWithPassword: function(credentials) {
            return authRequest('token?grant_type=password', {
              email: (credentials.email || '').trim().toLowerCase(),
              password: credentials.password
            }).then(function(res) {
              if (res.error) {
                var errMsg = res.error.msg || res.error.message || res.error.error_description || 'Erro ao autenticar.';
                return { data: null, error: new Error(errMsg) };
              }
              var data = res.data || {};
              var user = data.user || null;
              if (user && data.access_token) {
                user.access_token = data.access_token;
              }
              return { data: { user: user, session: data }, error: null };
            });
          },
          signUp: function(credentials) {
            return authRequest('signup', {
              email: (credentials.email || '').trim().toLowerCase(),
              password: credentials.password
            }).then(function(res) {
              if (res.error) {
                var errMsg = res.error.msg || res.error.message || res.error.error_description || 'Erro ao cadastrar.';
                return { data: null, error: new Error(errMsg) };
              }
              var data = res.data || {};
              var user = data.user || (data.id ? data : null);
              if (user && data.access_token) {
                user.access_token = data.access_token;
              }
              return { data: { user: user, session: data }, error: null };
            });
          },
          signOut: function() {
            return Promise.resolve({ error: null });
          },
          getUser: function() {
            var raw = localStorage.getItem('prompter_auth_user');
            if (raw) {
              try {
                return Promise.resolve({ data: { user: JSON.parse(raw) }, error: null });
              } catch(e) {}
            }
            return Promise.resolve({ data: { user: null }, error: null });
          },
          resetPasswordForEmail: function(email) {
            return authRequest('recover', {
              email: (email || '').trim().toLowerCase()
            });
          }
        },
        from: function(table) {
          return {
            select: function(cols) {
              var p = restRequest('GET', table, 'select=' + encodeURIComponent(cols || '*'));
              p.select = function() { return p; };
              p.eq = function(col, val) {
                return restRequest('GET', table, 'select=' + encodeURIComponent(cols || '*') + '&' + col + '=eq.' + encodeURIComponent(val));
              };
              p.single = function() { return p; };
              p.order = function() { return p; };
              return p;
            },
            upsert: function(payload) {
              var headers = { 'Prefer': 'resolution=merge-duplicates,return=representation' };
              var p = restRequest('POST', table, '', payload, headers);
              p.select = function() { return p; };
              return p;
            },
            delete: function() {
              var currentTable = table;
              return {
                eq: function(col, val) {
                  var p = restRequest('DELETE', currentTable, col + '=eq.' + encodeURIComponent(val));
                  p.select = function() { return p; };
                  return p;
                }
              };
            }
          };
        },
        channel: function() {
          return {
            on: function() { return this; },
            subscribe: function() { return this; }
          };
        }
      };
      updateSyncBadge('online');
    }
    return client;
  }

  function updateSyncBadge(status) {
    var badge = document.getElementById('supabaseSyncBadge');
    if (!badge) return;

    badge.className = 'sync-badge-minimal sync-' + status;
    if (status === 'online') {
      badge.innerHTML = '<span class="sync-dot dot-online"></span><span class="sync-label">Supabase Cloud ⚡</span>';
      badge.title = 'Conectado à nuvem Supabase em tempo real.';
    } else {
      badge.innerHTML = '<span class="sync-dot dot-offline"></span><span class="sync-label">Modo Palco (Offline)</span>';
      badge.title = 'Operando no modo palco offline.';
    }
  }

  var PrompterCloud = {
    getClient: function () {
      if (!client) initClient();
      return client;
    },

    updateSyncBadge: updateSyncBadge,

    initRealtimeListeners: function (onUpdateCallback) {
      var sb = this.getClient();
      var user = (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
      if (!sb || !user || !user.id || typeof sb.channel !== 'function') return;

      try {
        sb.channel('user_prompter_' + user.id)
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'songs', 
            filter: 'user_id=eq.' + user.id 
          }, function (payload) {
            console.log('⚡ Evento Realtime (música do usuário):', payload);
            if (typeof onUpdateCallback === 'function') onUpdateCallback('songs', payload);
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'repertoires', 
            filter: 'user_id=eq.' + user.id 
          }, function (payload) {
            console.log('⚡ Evento Realtime (repertório do usuário):', payload);
            if (typeof onUpdateCallback === 'function') onUpdateCallback('repertoires', payload);
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime listener não pôde ser ativado:', err);
      }
    }
  };

  window.PrompterCloud = PrompterCloud;
})();
