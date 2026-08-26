/**
 * PrompterCantor — Supabase Cloud Integration
 * Gerencia a sincronização bidirecional entre o banco local (IndexedDB) e a nuvem (Supabase).
 */

(function () {
  'use strict';

  var client = null;
  var isSyncing = false;

  function isValidUUID(str) {
    if (!str) return false;
    var s = String(str).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  function initClient() {
    if (window.supabase && typeof window.supabase.createClient === 'function' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) {
      try {
        client = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);
        console.log('✅ Supabase Client oficial inicializado com sucesso.');
        return;
      } catch (err) {
        console.warn('⚠️ Erro ao inicializar cliente oficial Supabase, usando fallback REST:', err);
      }
    }

    // FALLBACK REST CLIENT PARA SAFARI 10 / IPAD 4 / NAVEGADORES LEGADOS
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key) {
      console.log('⚡ Ativando cliente Supabase REST Fallback (Compatível com iPad 4 / iOS 10)...');
      var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1/';
      var apiKey = window.SUPABASE_CONFIG.key;

      function restRequest(method, table, query, body, headers) {
        return new Promise(function(resolve) {
          var url = baseUrl + table + (query ? '?' + query : '');
          var xhr = new XMLHttpRequest();
          xhr.open(method, url, true);
          xhr.setRequestHeader('apikey', apiKey);
          xhr.setRequestHeader('Authorization', 'Bearer ' + apiKey);
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
            resolve({ data: null, error: { message: 'Erro de rede ou conexão no iPad 4' } });
          };

          if (body) {
            xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
          } else {
            xhr.send();
          }
        });
      }

      client = {
        from: function(table) {
          return {
            select: function(cols) {
              var p = restRequest('GET', table, 'select=' + encodeURIComponent(cols || '*'));
              p.select = function() { return p; };
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
    }
  }

  function updateSyncBadge(status, message) {
    var badge = document.getElementById('supabaseSyncBadge');
    if (!badge) return;

    badge.className = 'sync-badge-minimal sync-' + status;
    if (status === 'online') {
      badge.innerHTML = '<span class="sync-dot dot-online"></span><span class="sync-label">Nuvem Online</span>';
      badge.title = 'Conectado à nuvem. Dados sincronizados automaticamente.';
    } else if (status === 'syncing') {
      badge.innerHTML = '<span class="sync-dot dot-syncing"></span><span class="sync-label">Sincronizando...</span>';
      badge.title = 'Sincronizando com a nuvem...';
    } else {
      badge.innerHTML = '<span class="sync-dot dot-offline"></span><span class="sync-label">Local</span>';
      badge.title = 'Operando localmente. Use "⚡ Offline" no repertório para baixar para o palco.';
    }
  }

  var PrompterCloud = {
    getClient: function () {
      if (!client) initClient();
      return client;
    },

    // ═══════════════════════════════════════
    //  REPERTÓRIOS
    // ═══════════════════════════════════════
    saveRepertoireToCloud: function (rep) {
      var sb = this.getClient();
      if (!sb || !rep) return Promise.resolve(null);

      var payload = {
        name: rep.name,
        source: rep.source || 'manual'
      };
      if (rep.id && isValidUUID(rep.id)) {
        payload.id = rep.id;
      }

      return sb.from('repertoires').upsert(payload).select().then(function (res) {
        if (res.error) {
          console.warn('Erro ao salvar repertório na nuvem:', res.error);
          updateSyncBadge('offline');
          throw res.error;
        }
        updateSyncBadge('online');
        return res.data && res.data[0] ? res.data[0] : null;
      }).catch(function (e) {
        console.warn('Falha na requisição Supabase:', e);
        updateSyncBadge('offline');
        throw e;
      });
    },

    deleteRepertoireFromCloud: function (repId, repName) {
      var sb = this.getClient();
      if (!sb || !repId) return Promise.resolve();

      var deleteReq;
      if (isValidUUID(repId)) {
        deleteReq = sb.from('repertoires').delete().eq('id', repId);
      } else if (repName) {
        deleteReq = sb.from('repertoires').delete().eq('name', repName);
      } else {
        deleteReq = sb.from('repertoires').delete().eq('id', String(repId));
      }

      return deleteReq.then(function (res) {
        if (res.error) console.warn('Erro ao deletar repertório na nuvem:', res.error);
        return res;
      }).catch(function (e) { console.warn(e); });
    },

    // ═══════════════════════════════════════
    //  MÚSICAS
    // ═══════════════════════════════════════
    saveSongToCloud: function (song) {
      var sb = this.getClient();
      if (!sb || !song) return Promise.resolve(null);

      var payload = {
        title: song.title,
        key: song.key || '',
        original_key: song.originalKey || '',
        artist: song.artist || '',
        composer: song.composer || '',
        youtube_url: song.youtubeUrl || '',
        youtube_id: song.youtubeId || '',
        content: song.content || ''
      };
      if (song.repertoireId && isValidUUID(song.repertoireId)) payload.repertoire_id = song.repertoireId;
      if (song.rhythm) payload.rhythm = song.rhythm;
      if (song.id && isValidUUID(song.id)) payload.id = song.id;

      return sb.from('songs').upsert(payload).select().then(function (res) {
        if (res.error) {
          if (res.error.code === 'PGRST204' || (res.error.message && res.error.message.indexOf('rhythm') !== -1)) {
            delete payload.rhythm;
            return sb.from('songs').upsert(payload).select().then(function (res2) {
              if (res2.error) throw res2.error;
              updateSyncBadge('online');
              return res2.data && res2.data[0] ? res2.data[0] : null;
            });
          }
          console.warn('Erro ao salvar música na nuvem:', res.error);
          updateSyncBadge('offline');
          throw res.error;
        }
        updateSyncBadge('online');
        return res.data && res.data[0] ? res.data[0] : null;
      }).catch(function (e) {
        console.warn('Falha na requisição Supabase:', e);
        updateSyncBadge('offline');
        throw e;
      });
    },

    saveSongsBatchToCloud: function (songsArray) {
      var sb = this.getClient();
      if (!sb || !songsArray || songsArray.length === 0) return Promise.resolve([]);

      function buildPayloads(includeRhythm) {
        return songsArray.map(function(song) {
          var p = {
            title: song.title || '',
            key: song.key || '',
            original_key: song.originalKey || '',
            artist: song.artist || '',
            composer: song.composer || '',
            youtube_url: song.youtubeUrl || '',
            youtube_id: song.youtubeId || '',
            content: song.content || ''
          };
          if (song.id && isValidUUID(song.id)) p.id = song.id;
          if (song.repertoireId && isValidUUID(song.repertoireId)) p.repertoire_id = song.repertoireId;
          if (includeRhythm && song.rhythm) p.rhythm = song.rhythm;
          return p;
        });
      }

      return sb.from('songs').upsert(buildPayloads(true)).select().then(function (res) {
        if (res.error) {
          if (res.error.code === 'PGRST204' || (res.error.message && res.error.message.indexOf('rhythm') !== -1)) {
            return sb.from('songs').upsert(buildPayloads(false)).select().then(function (res2) {
              if (res2.error) throw res2.error;
              updateSyncBadge('online');
              return res2.data || [];
            });
          }
          console.warn('Erro ao salvar lote de músicas na nuvem:', res.error);
          updateSyncBadge('offline');
          throw res.error;
        }
        updateSyncBadge('online');
        return res.data || [];
      }).catch(function (e) {
        console.warn('Falha na requisição Supabase:', e);
        updateSyncBadge('offline');
        throw e;
      });
    },

    deleteSongFromCloud: function (songId, songTitle) {
      var sb = this.getClient();
      if (!sb || !songId) return Promise.resolve();

      var deleteReq;
      if (isValidUUID(songId)) {
        deleteReq = sb.from('songs').delete().eq('id', songId);
      } else if (songTitle) {
        deleteReq = sb.from('songs').delete().eq('title', songTitle);
      } else {
        deleteReq = sb.from('songs').delete().eq('id', String(songId));
      }

      return deleteReq.then(function (res) {
        if (res.error) console.warn('Erro ao deletar música na nuvem:', res.error);
        return res;
      }).catch(function (e) { console.warn(e); });
    },

    // ═══════════════════════════════════════
    //  SINCRONIZAÇÃO DIRETA COM SUPABASE (FONTE DA VERDADE)
    // ═══════════════════════════════════════
    syncAllWithCloud: function () {
      var sb = this.getClient();
      if (!sb || isSyncing) return Promise.resolve();

      isSyncing = true;
      updateSyncBadge('syncing');

      // 1. Buscar estado exato da nuvem Supabase
      return Promise.all([
        sb.from('repertoires').select('*'),
        sb.from('songs').select('*')
      ]).then(function (results) {
        var cloudRepsRes = results[0];
        var cloudSongsRes = results[1];

        if (cloudRepsRes.error || cloudSongsRes.error) {
          console.warn('Erro ao buscar dados do Supabase:', cloudRepsRes.error || cloudSongsRes.error);
          updateSyncBadge('offline');
          isSyncing = false;
          return;
        }

        var cloudRepsRaw = cloudRepsRes.data || [];
        var cloudSongsRaw = cloudSongsRes.data || [];

        // Deduplicar repertórios na nuvem por nome
        var cloudReps = [];
        var seenRepNames = {};
        cloudRepsRaw.forEach(function(cr) {
          var normName = (cr.name || '').trim().toLowerCase();
          if (!normName) return;
          if (!seenRepNames[normName]) {
            seenRepNames[normName] = cr;
            cloudReps.push(cr);
          } else {
            PrompterCloud.deleteRepertoireFromCloud(cr.id);
          }
        });

        // Deduplicar músicas na nuvem por (repertoire_id + título)
        var cloudSongs = [];
        var seenSongKeys = {};
        cloudSongsRaw.forEach(function(cs) {
          var normTitle = (cs.title || '').trim().toLowerCase();
          if (!normTitle) return;
          var groupKey = (cs.repertoire_id || 'no_rep') + '|' + normTitle;
          if (!seenSongKeys[groupKey]) {
            seenSongKeys[groupKey] = cs;
            cloudSongs.push(cs);
          } else {
            PrompterCloud.deleteSongFromCloud(cs.id);
          }
        });

        // 2. Atualizar o IndexedDB local para ser ESPELHO EXATO do Supabase (Fonte da Verdade)
        return window.PrompterDB.replaceLocalWithCloud(cloudReps, cloudSongs).then(function() {
          updateSyncBadge('online');
          isSyncing = false;
          console.log('🎉 Dados sincronizados diretamente do Supabase com sucesso!');
        });
      }).catch(function (e) {
        console.warn('Erro ao sincronizar com Supabase:', e);
        updateSyncBadge('offline');
        isSyncing = false;
      });
    },

    initRealtimeListeners: function (onUpdateCallback) {
      var sb = this.getClient();
      if (!sb) return;

      try {
        sb.channel('public:prompter_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, function (payload) {
            console.log('⚡ Evento Realtime Supabase (songs):', payload);
            PrompterCloud.syncAllWithCloud().then(function() {
              if (typeof onUpdateCallback === 'function') onUpdateCallback();
            });
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'repertoires' }, function (payload) {
            console.log('⚡ Evento Realtime Supabase (repertoires):', payload);
            PrompterCloud.syncAllWithCloud().then(function() {
              if (typeof onUpdateCallback === 'function') onUpdateCallback();
            });
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime listener não pôde ser ativado:', err);
      }
    },

    pushAllLocalToCloud: function () {
      var sb = this.getClient();
      if (!sb) return Promise.reject(new Error('Supabase não inicializado.'));

      updateSyncBadge('syncing');

      return Promise.all([
        sb.from('repertoires').select('*'),
        window.PrompterDB.getAllRepertoires(),
        window.PrompterDB.getAllSongs()
      ]).then(function (results) {
        if (results[0] && results[0].error) throw results[0].error;
        var cloudReps = (results[0] && results[0].data) || [];
        var localReps = results[1] || [];
        var localSongs = results[2] || [];

        var repPromises = [];
        var repIdMap = {};

        localReps.forEach(function (r) {
          var matchingCloud = cloudReps.find(function(cr) {
            return String(cr.id) === String(r.id) || (cr.name && r.name && cr.name.trim().toLowerCase() === r.name.trim().toLowerCase());
          });

          if (matchingCloud) {
            repIdMap[r.id] = matchingCloud.id;
            if (!isValidUUID(r.id)) {
              window.PrompterDB.deleteRepertoire(r.id, true);
              window.PrompterDB.saveRepertoire(Object.assign({}, r, { id: matchingCloud.id }), true);
            }
          } else {
            var repToPush = Object.assign({}, r);
            if (!isValidUUID(repToPush.id)) delete repToPush.id;

            repPromises.push(PrompterCloud.saveRepertoireToCloud(repToPush).then(function(savedRep) {
              if (savedRep && savedRep.id) {
                repIdMap[r.id] = savedRep.id;
                if (r.id && String(r.id) !== String(savedRep.id)) {
                  window.PrompterDB.deleteRepertoire(r.id, true);
                  window.PrompterDB.saveRepertoire(Object.assign({}, r, { id: savedRep.id }), true);
                }
              }
            }));
          }
        });

        return Promise.all(repPromises).then(function() {
          var songPromises = [];
          localSongs.forEach(function (s) {
            var targetRepId = repIdMap[s.repertoireId] || s.repertoireId;
            if (!isValidUUID(targetRepId)) targetRepId = null;

            var songToPush = Object.assign({}, s, { repertoireId: targetRepId });
            if (!isValidUUID(songToPush.id)) delete songToPush.id;

            songPromises.push(PrompterCloud.saveSongToCloud(songToPush).then(function(savedSong) {
              if (savedSong && savedSong.id && s.id && String(s.id) !== String(savedSong.id)) {
                window.PrompterDB.deleteSong(s.id, true);
                window.PrompterDB.saveSong(Object.assign({}, s, { id: savedSong.id, repertoireId: savedSong.repertoire_id || targetRepId }), true);
              }
            }));
          });

          return Promise.all(songPromises).then(function() {
            updateSyncBadge('online');
            return {
              reps: localReps.length,
              songs: localSongs.length
            };
          });
        });
      }).catch(function(err) {
        console.warn('Erro em pushAllLocalToCloud:', err);
        updateSyncBadge('offline');
        throw err;
      });
    }
  };

  window.PrompterCloud = PrompterCloud;
})();
