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
      for (var k in localStorage) {
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') !== -1) {
          var sbAuth = JSON.parse(localStorage.getItem(k));
          if (sbAuth && sbAuth.access_token) return sbAuth.access_token;
        }
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

      function authRequest(endpoint, body, customHeaders, method) {
        return new Promise(function(resolve) {
          var url = authUrl + endpoint;
          var xhr = new XMLHttpRequest();
          xhr.open(method || 'POST', url, true);
          xhr.setRequestHeader('apikey', apiKey);
          xhr.setRequestHeader('Content-Type', 'application/json');
          if (customHeaders) {
            for (var h in customHeaders) {
              if (customHeaders.hasOwnProperty(h)) {
                xhr.setRequestHeader(h, customHeaders[h]);
              }
            }
          }

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

          if (body) {
            xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
          } else {
            xhr.send();
          }
        });
      }

      function createQueryBuilder(table) {
        var queryParams = {
          select: '*',
          filters: [],
          orders: [],
          isSingle: false
        };

        var builder = {
          select: function(cols) {
            if (cols) queryParams.select = cols;
            return builder;
          },
          eq: function(col, val) {
            queryParams.filters.push(encodeURIComponent(col) + '=eq.' + encodeURIComponent(val));
            return builder;
          },
          neq: function(col, val) {
            queryParams.filters.push(encodeURIComponent(col) + '=neq.' + encodeURIComponent(val));
            return builder;
          },
          ilike: function(col, val) {
            queryParams.filters.push(encodeURIComponent(col) + '=ilike.' + encodeURIComponent(val));
            return builder;
          },
          order: function(col, opts) {
            var asc = (!opts || opts.ascending !== false) ? 'asc' : 'desc';
            var nulls = (opts && opts.nullsFirst) ? '.nullsfirst' : '';
            queryParams.orders.push(encodeURIComponent(col) + '.' + asc + nulls);
            return builder;
          },
          single: function() {
            queryParams.isSingle = true;
            return builder;
          },
          limit: function(num) {
            queryParams.limit = num;
            return builder;
          },
          then: function(onResolve, onReject) {
            var queryStringParts = ['select=' + encodeURIComponent(queryParams.select)];
            if (queryParams.filters.length > 0) {
              queryStringParts.push(queryParams.filters.join('&'));
            }
            if (queryParams.orders.length > 0) {
              queryStringParts.push('order=' + queryParams.orders.join(','));
            }
            if (queryParams.limit) {
              queryStringParts.push('limit=' + queryParams.limit);
            }

            var fullQuery = queryStringParts.join('&');
            return restRequest('GET', table, fullQuery).then(function(res) {
              if (queryParams.isSingle) {
                var singleData = (res && res.data && res.data[0]) ? res.data[0] : (res && res.data && !Array.isArray(res.data) ? res.data : null);
                return { data: singleData, error: res ? res.error : null };
              }
              return res;
            }).then(onResolve, onReject);
          },
          catch: function(onReject) {
            return builder.then(null, onReject);
          }
        };

        return builder;
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
          resetPasswordForEmail: function(email, options) {
            var redirectParam = '';
            var rUrl = (options && options.redirectTo) || (window.location.origin + window.location.pathname);
            if (rUrl) {
              redirectParam = '?redirect_to=' + encodeURIComponent(rUrl);
            }
            return authRequest('recover' + redirectParam, {
              email: (email || '').trim().toLowerCase()
            });
          },
          updateUser: function(attributes) {
            var token = getStoredAccessToken();
            var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
            return authRequest('user', attributes, headers, 'PUT').then(function(res) {
              if (res.error) {
                var msg = res.error.msg || res.error.message || 'Erro ao atualizar usuário.';
                return { data: null, error: new Error(msg) };
              }
              return { data: { user: res.data }, error: null };
            });
          },
          onAuthStateChange: function(callback) {
            return {
              data: {
                subscription: {
                  unsubscribe: function() {}
                }
              }
            };
          }
        },
        from: function(table) {
          return {
            select: function(cols) {
              var qb = createQueryBuilder(table);
              return qb.select(cols);
            },
            upsert: function(payload) {
              var builder = {
                select: function() {
                  return builder;
                },
                then: function(onResolve, onReject) {
                  var headers = { 'Prefer': 'resolution=merge-duplicates,return=representation' };
                  return restRequest('POST', table, '', payload, headers).then(onResolve, onReject);
                },
                catch: function(onReject) {
                  return builder.then(null, onReject);
                }
              };
              return builder;
            },
            update: function(payload) {
              var filters = [];
              var builder = {
                eq: function(col, val) {
                  filters.push(encodeURIComponent(col) + '=eq.' + encodeURIComponent(val));
                  return builder;
                },
                then: function(onResolve, onReject) {
                  var fullQuery = filters.join('&');
                  var headers = { 'Prefer': 'return=representation' };
                  return restRequest('PATCH', table, fullQuery, payload, headers).then(onResolve, onReject);
                },
                catch: function(onReject) {
                  return builder.then(null, onReject);
                }
              };
              return builder;
            },
            delete: function() {
              var filters = [];
              var builder = {
                eq: function(col, val) {
                  filters.push(encodeURIComponent(col) + '=eq.' + encodeURIComponent(val));
                  return builder;
                },
                then: function(onResolve, onReject) {
                  var fullQuery = filters.join('&');
                  return restRequest('DELETE', table, fullQuery).then(onResolve, onReject);
                },
                catch: function(onReject) {
                  return builder.then(null, onReject);
                }
              };
              return builder;
            },
            insert: function(payload) {
              var builder = {
                select: function() {
                  return builder;
                },
                then: function(onResolve, onReject) {
                  var headers = { 'Prefer': 'return=representation' };
                  return restRequest('POST', table, '', payload, headers).then(onResolve, onReject);
                },
                catch: function(onReject) {
                  return builder.then(null, onReject);
                }
              };
              return builder;
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
      badge.innerHTML = '<span class="sync-dot dot-offline"></span><span class="sync-label">Modo Offline</span>';
      badge.title = 'Operando em modo 100% offline.';
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
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  BARRAMENTO REALTIME GLOBAL (ZERO REFRESH / ZERO MANUAL SYNC)
    // ══════════════════════════════════════════════════════════════════════════
    _liveChannel: null,
    _localBroadcastChannel: null,
    _liveHandlers: {},

    playLiveChime: function (type) {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        var ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(function () {});
        }

        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
          // Triplo acorde de celebração (ex: ativação VIP)
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
          gain.gain.setValueAtTime(0.01, now);
          gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.52);
        } else if (type === 'alert') {
          // Notificação de chamado ou aviso urgente
          osc.type = 'sine';
          osc.frequency.setValueAtTime(784, now);
          osc.frequency.setValueAtTime(659, now + 0.12);
          gain.gain.setValueAtTime(0.01, now);
          gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
          osc.start(now);
          osc.stop(now + 0.36);
        } else {
          // 'message': Suave e amigável (estilo WhatsApp/Telegram)
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880.00, now + 0.09); // A5
          gain.gain.setValueAtTime(0.01, now);
          gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
          osc.start(now);
          osc.stop(now + 0.34);
        }
      } catch (e) {
        // Silencioso se áudio não for suportado ou bloqueado por política de autoplay
      }
    },

    getLiveChannel: function () {
      if (this._liveChannel) return this._liveChannel;
      var self = this;

      // Inicializa canal HTML5 BroadcastChannel local (1ms entre abas do mesmo navegador)
      if (!this._localBroadcastChannel && typeof window.BroadcastChannel === 'function') {
        try {
          this._localBroadcastChannel = new window.BroadcastChannel('canta_ai_live_bus');
          this._localBroadcastChannel.onmessage = function (e) {
            if (e && e.data && e.data.event) {
              self._triggerLiveEvent(e.data.event, e.data.payload);
            }
          };
        } catch (e) {}
      }

      var sb = this.getClient();
      if (sb && typeof sb.channel === 'function') {
        try {
          this._liveChannel = sb.channel('canta_ai_live_bus', {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: '' }
            }
          });

          // Registra ouvinte global de broadcast
          this._liveChannel.on('broadcast', { event: '*' }, function (msg) {
            if (msg && msg.event) {
              var payload = (msg.payload !== undefined) ? msg.payload : msg;
              self._triggerLiveEvent(msg.event, payload);
            }
          });

          this._liveChannel.subscribe(function (status) {
            console.log('⚡ Supabase Live Bus Conectado:', status);
          });
        } catch (err) {
          console.warn('⚠️ Falha ao registrar Live Bus Supabase:', err);
        }
      }

      return this._liveChannel;
    },

    _triggerLiveEvent: function (eventName, payload) {
      var handlers = this._liveHandlers[eventName] || [];
      for (var i = 0; i < handlers.length; i++) {
        try {
          handlers[i](payload);
        } catch (e) {
          console.error('Erro no handler do evento em tempo real (' + eventName + '):', e);
        }
      }
      // Notifica ouvintes genéricos de '*'
      var wildcards = this._liveHandlers['*'] || [];
      for (var j = 0; j < wildcards.length; j++) {
        try {
          wildcards[j](eventName, payload);
        } catch (e) {}
      }
    },

    broadcastEvent: function (eventName, payload) {
      if (!eventName) return;
      var self = this;

      // 1. WebSocket Broadcast pelo Supabase (entre dispositivos / navegadores distintos: Chrome <-> Safari <-> Mobile)
      var ch = this.getLiveChannel();
      if (ch && typeof ch.send === 'function') {
        try {
          ch.send({
            type: 'broadcast',
            event: eventName,
            payload: payload
          });
        } catch (err) {
          console.warn('Erro ao transmitir broadcast Supabase:', err);
        }
      }

      // 2. BroadcastChannel HTML5 (entre abas locais na mesma máquina / navegador em ~1ms)
      if (this._localBroadcastChannel) {
        try {
          this._localBroadcastChannel.postMessage({
            event: eventName,
            payload: payload,
            timestamp: Date.now()
          });
        } catch (e) {}
      }
    },

    onLiveEvent: function (eventName, handler) {
      if (!eventName || typeof handler !== 'function') return;
      if (!this._liveHandlers[eventName]) {
        this._liveHandlers[eventName] = [];
      }
      this._liveHandlers[eventName].push(handler);

      // Garante canal ativo
      this.getLiveChannel();
    }
  };

  window.PrompterCloud = PrompterCloud;
})();
