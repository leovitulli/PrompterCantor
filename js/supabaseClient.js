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
              return restRequest('GET', table, 'select=' + encodeURIComponent(cols || '*'));
            },
            upsert: function(payload) {
              var headers = { 'Prefer': 'resolution=merge-duplicates,return=representation' };
              return restRequest('POST', table, '', payload, headers);
            },
            delete: function() {
              var currentTable = table;
              return {
                eq: function(col, val) {
                  return restRequest('DELETE', currentTable, col + '=eq.' + encodeURIComponent(val));
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

    deleteRepertoireFromCloud: function (repId) {
      var sb = this.getClient();
      if (!sb || !repId || !isValidUUID(repId)) return Promise.resolve();

      return sb.from('repertoires').delete().eq('id', repId).then(function (res) {
        if (res.error) console.warn('Erro ao deletar repertório na nuvem:', res.error);
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

    deleteSongFromCloud: function (songId) {
      var sb = this.getClient();
      if (!sb || !songId || !isValidUUID(songId)) return Promise.resolve();

      return sb.from('songs').delete().eq('id', songId).then(function (res) {
        if (res.error) console.warn('Erro ao deletar música na nuvem:', res.error);
      }).catch(function (e) { console.warn(e); });
    },

    // ═══════════════════════════════════════
    //  SINCRONIZAÇÃO COMPLETA BIDIRECIONAL
    // ═══════════════════════════════════════
    syncAllWithCloud: function () {
      var sb = this.getClient();
      if (!sb || isSyncing) return Promise.resolve();

      isSyncing = true;
      updateSyncBadge('syncing');

      // 1. Buscar tudo da nuvem
      return Promise.all([
        sb.from('repertoires').select('*'),
        sb.from('songs').select('*')
      ]).then(function (results) {
        var cloudRepsRes = results[0];
        var cloudSongsRes = results[1];

        if (cloudRepsRes.error || cloudSongsRes.error) {
          console.warn('Tabelas do Supabase ainda não foram criadas ou erro de conexão:', cloudRepsRes.error || cloudSongsRes.error);
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

        // 2. Buscar tudo do banco local IndexedDB
        return Promise.all([
          window.PrompterDB.getAllRepertoires(),
          window.PrompterDB.getAllSongs()
        ]).then(function (localResults) {
          var localReps = localResults[0] || [];
          var localSongs = localResults[1] || [];

          var savePromises = [];

          var localRepMap = {};
          localReps.forEach(function (r) { localRepMap[r.id] = r; });

          var localSongMap = {};
          localSongs.forEach(function (s) { localSongMap[s.id] = s; });

          var cloudRepMap = {};
          cloudReps.forEach(function (r) { cloudRepMap[r.id] = r; });

          var cloudSongMap = {};
          cloudSongs.forEach(function (s) { cloudSongMap[s.id] = s; });

          // 1. Processar repertórios da nuvem
          cloudReps.forEach(function (cRep) {
            var cNameClean = (cRep.name || '').trim().toLowerCase();
            for (var lid in localRepMap) {
              var lr = localRepMap[lid];
              if (lr.name && lr.name.trim().toLowerCase() === cNameClean && String(lr.id) !== String(cRep.id)) {
                savePromises.push(window.PrompterDB.deleteRepertoire(lr.id, true));
              }
            }

            savePromises.push(window.PrompterDB.saveRepertoire({
              id: cRep.id,
              name: cRep.name,
              source: cRep.source,
              createdAt: cRep.created_at ? new Date(cRep.created_at).getTime() : Date.now()
            }, true));
          });

          // 2. Processar músicas da nuvem com fusão por ID e por Título + Repertório
          cloudSongs.forEach(function (cSong) {
            var cTitleClean = (cSong.title || '').trim().toLowerCase();
            var cRepId = cSong.repertoire_id;

            // Procurar correspondência local por ID ou por (Título + Repertório)
            var local = localSongMap[cSong.id];
            if (!local) {
              for (var lid in localSongMap) {
                var ls = localSongMap[lid];
                if (ls.title && ls.title.trim().toLowerCase() === cTitleClean && String(ls.repertoireId) === String(cRepId)) {
                  local = ls;
                  break;
                }
              }
            }

            // Se encontrou item local com ID diferente (ex: ID numérico antigo), remove o item antigo
            if (local && local.id && String(local.id) !== String(cSong.id)) {
              savePromises.push(window.PrompterDB.deleteSong(local.id, true));
            }

            var keyToUse = cSong.key;
            var rhythmToUse = cSong.rhythm;
            var origKeyToUse = cSong.original_key;
            var audioBlobToUse = null;
            var audioNameToUse = '';
            var trackNumToUse = cSong.track_number !== undefined ? cSong.track_number : null;
            var orderToUse = cSong.order !== undefined ? cSong.order : null;

            if (local) {
              var cloudUpdated = cSong.updated_at ? new Date(cSong.updated_at).getTime() : 0;
              var localUpdated = local.updatedAt || 0;

              // Se o item local foi modificado pelo usuário mais recentemente, ele prevalece na nuvem
              if (localUpdated > cloudUpdated) {
                var localWinsSong = Object.assign({}, local, {
                  id: cSong.id,
                  title: local.title || cSong.title,
                  key: local.key || cSong.key || '',
                  originalKey: local.originalKey || cSong.original_key || '',
                  rhythm: local.rhythm || cSong.rhythm || '',
                  content: local.content || cSong.content || '',
                  artist: local.artist || cSong.artist || '',
                  composer: local.composer || cSong.composer || '',
                  youtubeUrl: local.youtubeUrl || cSong.youtube_id || '',
                  youtubeId: local.youtubeId || cSong.youtube_id || '',
                  repertoireId: cSong.repertoire_id || local.repertoireId
                });

                savePromises.push(window.PrompterDB.saveSong(localWinsSong, true));
                savePromises.push(PrompterCloud.saveSongToCloud(localWinsSong));
                return;
              }

              if (local.audioBlob) audioBlobToUse = local.audioBlob;
              if (local.audioName) audioNameToUse = local.audioName;
            }

            var mergedSong = {
              id: cSong.id,
              repertoireId: cSong.repertoire_id,
              title: cSong.title,
              key: keyToUse || '',
              originalKey: origKeyToUse || '',
              rhythm: rhythmToUse || '',
              artist: cSong.artist || '',
              composer: cSong.composer || '',
              youtubeUrl: cSong.youtube_url || '',
              youtubeId: cSong.youtube_id || '',
              content: cSong.content || '',
              audioBlob: audioBlobToUse,
              audioName: audioNameToUse,
              trackNumber: trackNumToUse,
              order: orderToUse,
              createdAt: cSong.created_at ? new Date(cSong.created_at).getTime() : (local ? local.createdAt : Date.now()),
              updatedAt: local && local.updatedAt ? local.updatedAt : Date.now()
            };

            savePromises.push(window.PrompterDB.saveSong(mergedSong, true));
          });

          // 3. Enviar repertórios locais que não estão na nuvem (por ID ou Nome)
          localReps.forEach(function (lRep) {
            var existsInCloud = cloudReps.some(function (cr) {
              return String(cr.id) === String(lRep.id) || (cr.name && lRep.name && cr.name.trim().toLowerCase() === lRep.name.trim().toLowerCase());
            });
            if (!existsInCloud) {
              savePromises.push(PrompterCloud.saveRepertoireToCloud(lRep));
            }
          });

          // 4. Sincronizar todas as músicas locais que ainda não existem na nuvem
          var missingSongsInCloud = [];
          localSongs.forEach(function(lSong) {
            var targetCloudRepId = lSong.repertoireId;
            var lRep = localRepMap[lSong.repertoireId] || localRepMap[String(lSong.repertoireId)];
            if (lRep && lRep.name) {
              var matchingCloudRep = cloudReps.find(function(cr) {
                return cr.name && cr.name.trim().toLowerCase() === lRep.name.trim().toLowerCase();
              });
              if (matchingCloudRep) {
                targetCloudRepId = matchingCloudRep.id;
              }
            }

            var existsInCloud = cloudSongs.some(function(cs) {
              return String(cs.id) === String(lSong.id) ||
                     (cs.title && lSong.title && cs.title.trim().toLowerCase() === lSong.title.trim().toLowerCase() && String(cs.repertoire_id) === String(targetCloudRepId));
            });

            if (!existsInCloud) {
              var songToSend = Object.assign({}, lSong, { repertoireId: targetCloudRepId });
              missingSongsInCloud.push(songToSend);
            }
          });

          if (missingSongsInCloud.length > 0) {
            console.log('☁️ Enviando ' + missingSongsInCloud.length + ' músicas locais para a nuvem...');
            savePromises.push(PrompterCloud.saveSongsBatchToCloud(missingSongsInCloud));
          }

          return Promise.all(savePromises).then(function () {
            return window.PrompterDB.cleanUpDuplicates().then(function() {
              updateSyncBadge('online');
              isSyncing = false;
              console.log('🎉 Sincronização bidirecional Supabase <-> IndexedDB concluída com desduplicação!');
            });
          });
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
