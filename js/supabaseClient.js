/**
 * PrompterCantor — Supabase Cloud Integration
 * Gerencia a sincronização bidirecional entre o banco local (IndexedDB) e a nuvem (Supabase).
 */

(function () {
  'use strict';

  var client = null;
  var isSyncing = false;

  function initClient() {
    if (window.supabase && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) {
      try {
        client = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);
        console.log('✅ Supabase Client inicializado com sucesso.');
      } catch (err) {
        console.error('❌ Erro ao inicializar Supabase Client:', err);
      }
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

      if (rep.id) payload.id = Number(rep.id);

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
      if (!sb || !repId) return Promise.resolve();

      return sb.from('repertoires').delete().eq('id', Number(repId)).then(function (res) {
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
        repertoire_id: song.repertoireId ? Number(song.repertoireId) : null,
        title: song.title,
        key: song.key || '',
        original_key: song.originalKey || '',
        rhythm: song.rhythm || '',
        artist: song.artist || '',
        composer: song.composer || '',
        youtube_url: song.youtubeUrl || '',
        youtube_id: song.youtubeId || '',
        content: song.content || ''
      };

      if (song.id) payload.id = Number(song.id);

      return sb.from('songs').upsert(payload).select().then(function (res) {
        if (res.error) {
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

      var payloads = songsArray.map(function(song) {
        var p = {
          repertoire_id: song.repertoireId ? Number(song.repertoireId) : null,
          title: song.title || '',
          key: song.key || '',
          original_key: song.originalKey || '',
          rhythm: song.rhythm || '',
          artist: song.artist || '',
          composer: song.composer || '',
          youtube_url: song.youtubeUrl || '',
          youtube_id: song.youtubeId || '',
          content: song.content || ''
        };
        if (song.id) p.id = Number(song.id);
        return p;
      });

      return sb.from('songs').upsert(payloads).select().then(function (res) {
        if (res.error) {
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
      if (!sb || !songId) return Promise.resolve();

      return sb.from('songs').delete().eq('id', Number(songId)).then(function (res) {
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

        var cloudReps = cloudRepsRes.data || [];
        var cloudSongs = cloudSongsRes.data || [];

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
            var cRepId = Number(cSong.repertoire_id);

            // Procurar correspondência local por ID ou por (Título + Repertório)
            var local = localSongMap[cSong.id];
            if (!local) {
              for (var lid in localSongMap) {
                var ls = localSongMap[lid];
                if (ls.title && ls.title.trim().toLowerCase() === cTitleClean && Number(ls.repertoireId) === cRepId) {
                  local = ls;
                  break;
                }
              }
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
                  youtubeUrl: local.youtubeUrl || cSong.youtube_url || '',
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

          // 3. Enviar repertórios locais que não estão na nuvem
          localReps.forEach(function (lRep) {
            if (!cloudRepMap[lRep.id]) {
              savePromises.push(PrompterCloud.saveRepertoireToCloud(lRep));
            }
          });

          // Sincronizar todas as músicas locais que ainda não existem na nuvem
          var missingSongsInCloud = [];
          localSongs.forEach(function(lSong) {
            var existsInCloud = cloudSongs.some(function(cs) {
              return Number(cs.id) === Number(lSong.id) ||
                     (cs.title && lSong.title && cs.title.trim().toLowerCase() === lSong.title.trim().toLowerCase() && Number(cs.repertoire_id) === Number(lSong.repertoireId));
            });
            if (!existsInCloud) {
              missingSongsInCloud.push(lSong);
            }
          });

          if (missingSongsInCloud.length > 0) {
            savePromises.push(PrompterCloud.saveSongsBatchToCloud(missingSongsInCloud));
          }

          return Promise.all(savePromises).then(function () {
            updateSyncBadge('online');
            isSyncing = false;
            console.log('🎉 Sincronização bidirecional Supabase <-> IndexedDB concluída!');
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
        window.PrompterDB.getAllRepertoires(),
        window.PrompterDB.getAllSongs()
      ]).then(function (results) {
        var localReps = results[0] || [];
        var localSongs = results[1] || [];

        var promises = [];

        localReps.forEach(function (r) {
          promises.push(PrompterCloud.saveRepertoireToCloud(r));
        });

        localSongs.forEach(function (s) {
          promises.push(PrompterCloud.saveSongToCloud(s));
        });

        return Promise.all(promises).then(function () {
          updateSyncBadge('online');
          return {
            reps: localReps.length,
            songs: localSongs.length
          };
        });
      });
    }
  };

  window.PrompterCloud = PrompterCloud;
})();
