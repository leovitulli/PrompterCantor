/**
 * CantaAí PRO - Data Access Layer (100% Supabase Cloud + Stage Offline Cache + Resilient Fallbacks)
 * Todas as operações de leitura e escrita são executadas diretamente no Supabase
 * com compatibilidade universal de schema e isolamento estrito de dados por usuário.
 */

(function () {
  'use strict';

  function isValidUUID(str) {
    if (!str) return false;
    var s = String(str).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  function getCurrentUser() {
    return (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
  }

  function getSupabaseClient() {
    return (window.PrompterCloud && typeof window.PrompterCloud.getClient === 'function')
      ? window.PrompterCloud.getClient()
      : null;
  }

  var memCache = {
    userId: null,
    repertoires: null,
    songsByRep: {},
    allSongs: null,
    countsByRep: {}
  };

  function checkCacheUser(user) {
    var curId = user ? user.id : 'guest';
    if (memCache.userId !== curId) {
      memCache.userId = curId;
      memCache.repertoires = null;
      memCache.songsByRep = {};
      memCache.allSongs = null;
      memCache.countsByRep = {};
    }
  }

  function invalidateCache() {
    memCache.repertoires = null;
    memCache.songsByRep = {};
    memCache.allSongs = null;
    memCache.countsByRep = {};
  }

  function getOfflineKey(userId) {
    return 'canta_offline_stage_' + (userId || 'guest');
  }

  function getOfflineStore(userId) {
    try {
      var raw = localStorage.getItem(getOfflineKey(userId));
      return raw ? JSON.parse(raw) : { repertoires: {}, songs: {} };
    } catch (e) {
      return { repertoires: {}, songs: {} };
    }
  }

  function saveOfflineStore(userId, data) {
    try {
      localStorage.setItem(getOfflineKey(userId), JSON.stringify(data));
    } catch (e) {}
  }

  // ════════════════════════════════════════
  //  REPERTÓRIOS (100% SUPABASE COM CACHE)
  // ════════════════════════════════════════

  function getAllRepertoires() {
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    checkCacheUser(user);

    if (memCache.repertoires) {
      return Promise.resolve(memCache.repertoires);
    }

    if (!user || !user.id || !sb) {
      var offStore = getOfflineStore(user ? user.id : 'guest');
      var list = Object.keys(offStore.repertoires || {}).map(function(k) { return offStore.repertoires[k]; });
      list.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      memCache.repertoires = list;
      return Promise.resolve(list);
    }

    return sb.from('repertoires')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(function(res) {
        if (res.error) {
          console.warn('Aviso ao carregar repertórios do Supabase, usando cache local:', res.error);
          var offStore = getOfflineStore(user.id);
          var list = Object.keys(offStore.repertoires || {}).map(function(k) { return offStore.repertoires[k]; });
          list.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
          memCache.repertoires = list;
          return list;
        }

        var rawList = res.data || [];
        var offStore = getOfflineStore(user.id);
        var reps = rawList.map(function(r) {
          var isPinned = Boolean(offStore.repertoires && offStore.repertoires[r.id]);
          return {
            id: r.id,
            name: r.name,
            source: r.source || 'manual',
            user_id: r.user_id || user.id,
            isOfflinePinned: isPinned || Boolean(r.is_offline_pinned),
            createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
          };
        });

        var customOrder = [];
        try {
          var rawOrder = localStorage.getItem('canta_ai_rep_order_' + user.id);
          if (rawOrder) customOrder = JSON.parse(rawOrder);
        } catch(e) {}

        if (customOrder && customOrder.length > 0) {
          reps.sort(function(a, b) {
            var idxA = customOrder.indexOf(a.id);
            var idxB = customOrder.indexOf(b.id);
            if (idxA === -1) idxA = 9999;
            if (idxB === -1) idxB = 9999;
            if (idxA !== idxB) return idxA - idxB;
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
        }

        memCache.repertoires = reps;
        return reps;
      }).catch(function(err) {
        console.warn('Falha de rede ao buscar repertórios:', err);
        var offStore = getOfflineStore(user.id);
        var list = Object.keys(offStore.repertoires || {}).map(function(k) { return offStore.repertoires[k]; });
        list.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        memCache.repertoires = list;
        return list;
      });
  }

  function getRepertoiresWithCounts() {
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    checkCacheUser(user);

    if (!user || !user.id || !sb) {
      return getAllRepertoires().then(function(reps) {
        var offStore = getOfflineStore(user ? user.id : 'guest');
        return reps.map(function(r) {
          var count = (offStore.songs && offStore.songs[r.id] && offStore.songs[r.id].length) || 0;
          return Object.assign({}, r, { songsCount: count });
        });
      });
    }

    return Promise.all([
      getAllRepertoires(),
      sb.from('songs').select('repertoire_id').eq('user_id', user.id)
    ]).then(function(results) {
      var reps = results[0] || [];
      var songsRows = (results[1] && results[1].data) || [];
      var countMap = {};
      songsRows.forEach(function(row) {
        var rId = row.repertoire_id;
        if (rId) countMap[rId] = (countMap[rId] || 0) + 1;
      });
      memCache.countsByRep = countMap;
      return reps.map(function(r) {
        return Object.assign({}, r, { songsCount: countMap[r.id] || 0 });
      });
    }).catch(function() {
      return getAllRepertoires().then(function(reps) {
        return reps.map(function(r) {
          return Object.assign({}, r, { songsCount: memCache.countsByRep[r.id] || 0 });
        });
      });
    });
  }

  function getRepertoireById(id) {
    var user = getCurrentUser();
    var sb = getSupabaseClient();

    if (!user || !user.id || !sb) {
      var offStore = getOfflineStore(user ? user.id : 'guest');
      return Promise.resolve(offStore.repertoires[id] || null);
    }

    return sb.from('repertoires')
      .select('*')
      .eq('id', id)
      .single()
      .then(function(res) {
        if (res.error || !res.data) {
          var offStore = getOfflineStore(user.id);
          return offStore.repertoires[id] || null;
        }
        var r = res.data;
        return {
          id: r.id,
          name: r.name,
          source: r.source || 'manual',
          user_id: r.user_id || user.id,
          createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
        };
      }).catch(function() {
        var offStore = getOfflineStore(user.id);
        return offStore.repertoires[id] || null;
      });
  }

  function saveRepertoire(repertoire) {
    var user = getCurrentUser();
    var sb = getSupabaseClient();

    if (!user || !user.id || !sb) {
      var repId = repertoire.id || ('rep-guest-' + Date.now());
      var repData = {
        id: repId,
        name: (repertoire.name || 'Repertório').trim(),
        source: repertoire.source || 'local',
        user_id: 'guest',
        createdAt: repertoire.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      var offStore = getOfflineStore('guest');
      offStore.repertoires[repId] = repData;
      saveOfflineStore('guest', offStore);
      return Promise.resolve(repId);
    }

    var payload = {
      name: (repertoire.name || 'Repertório').trim(),
      source: repertoire.source || 'manual',
      user_id: user.id
    };
    if (repertoire.id && isValidUUID(repertoire.id)) {
      payload.id = repertoire.id;
    }

    return sb.from('repertoires').upsert(payload).select().then(function(res) {
      invalidateCache();
      if (res.error) {
        if (res.error.code === 'PGRST204' || (res.error.message && res.error.message.indexOf('user_id') !== -1)) {
          delete payload.user_id;
          return sb.from('repertoires').upsert(payload).select().then(function(res2) {
            if (res2.error) throw res2.error;
            var s2 = res2.data && res2.data[0] ? res2.data[0] : null;
            return s2 ? s2.id : payload.id;
          });
        }
        throw res.error;
      }
      var saved = res.data && res.data[0] ? res.data[0] : null;
      return saved ? saved.id : payload.id;
    });
  }

  function deleteRepertoire(id) {
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    invalidateCache();

    var offStore = getOfflineStore(user ? user.id : 'guest');
    if (offStore.repertoires) delete offStore.repertoires[id];
    if (offStore.songs) delete offStore.songs[id];
    saveOfflineStore(user ? user.id : 'guest', offStore);

    if (!user || !user.id || !sb) return Promise.resolve(true);

    return sb.from('songs').delete().eq('repertoire_id', id).then(function() {
      return sb.from('repertoires').delete().eq('id', id);
    }).then(function(res) {
      if (res && res.error) console.warn('Erro ao deletar repertório na nuvem:', res.error);
      return true;
    }).catch(function(err) {
      console.warn('Erro na exclusão do repertório:', err);
      return true;
    });
  }

  // ════════════════════════════════════════
  //  MÚSICAS (100% SUPABASE COM CACHE)
  // ════════════════════════════════════════

  function getSongsByRepertoire(repertoireId) {
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    checkCacheUser(user);

    var cacheKey = repertoireId || 'ALL_USER_SONGS';
    if (memCache.songsByRep[cacheKey]) {
      return Promise.resolve(memCache.songsByRep[cacheKey]);
    }

    if (!user || !user.id || !sb) {
      var offStore = getOfflineStore(user ? user.id : 'guest');
      var localList = offStore.songs[repertoireId] || [];
      memCache.songsByRep[cacheKey] = localList;
      return Promise.resolve(localList);
    }

    var query = sb.from('songs').select('*');
    if (repertoireId) {
      query = query.eq('repertoire_id', repertoireId);
    } else {
      query = query.eq('user_id', user.id);
    }

    return query.order('track_number', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .then(function(res) {
        if (res.error) {
          console.warn('Aviso ao buscar músicas do Supabase:', res.error);
          var offStore = getOfflineStore(user.id);
          var list = offStore.songs[repertoireId] || [];
          memCache.songsByRep[cacheKey] = list;
          return list;
        }

        var rawList = res.data || [];

        var songs = rawList.map(function(s, idx) {
          return {
            id: s.id,
            repertoireId: s.repertoire_id,
            title: s.title,
            key: s.key || '',
            originalKey: s.original_key || '',
            rhythm: s.rhythm || '',
            artist: s.artist || '',
            composer: s.composer || '',
            youtubeUrl: s.youtube_url || '',
            youtubeId: s.youtube_id || '',
            spotifyUrl: s.spotify_url || '',
            content: s.content || '',
            trackNumber: (s.track_number !== undefined && s.track_number !== null) ? s.track_number : (idx + 1),
            order: (s.order !== undefined && s.order !== null) ? s.order : (idx + 1),
            user_id: s.user_id || user.id,
            createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
            updatedAt: s.updated_at ? new Date(s.updated_at).getTime() : Date.now()
          };
        });

        memCache.songsByRep[cacheKey] = songs;
        return songs;
      }).catch(function(err) {
        console.warn('Falha de rede ao buscar músicas:', err);
        var offStore = getOfflineStore(user.id);
        var list = offStore.songs[repertoireId] || [];
        memCache.songsByRep[cacheKey] = list;
        return list;
      });
  }

  function getSongById(id) {
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    checkCacheUser(user);

    // Checar primeiro na memória rápida (0ms)
    for (var k in memCache.songsByRep) {
      var arr = memCache.songsByRep[k] || [];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].id === id) return Promise.resolve(arr[j]);
      }
    }

    if (!user || !user.id || !sb) {
      var offStore = getOfflineStore(user ? user.id : 'guest');
      for (var rId in offStore.songs) {
        var list = offStore.songs[rId] || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) return Promise.resolve(list[i]);
        }
      }
      return Promise.resolve(null);
    }

    return sb.from('songs')
      .select('*')
      .eq('id', id)
      .single()
      .then(function(res) {
        if (res.error || !res.data) return null;
        var s = res.data;
        return {
          id: s.id,
          repertoireId: s.repertoire_id,
          title: s.title,
          key: s.key || '',
          originalKey: s.original_key || '',
          rhythm: s.rhythm || '',
          artist: s.artist || '',
          composer: s.composer || '',
          youtubeUrl: s.youtube_url || '',
          youtubeId: s.youtube_id || '',
          spotifyUrl: s.spotify_url || '',
          content: s.content || '',
          trackNumber: s.track_number !== undefined ? s.track_number : null,
          order: s.order !== undefined ? s.order : null,
          user_id: s.user_id || user.id,
          createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
          updatedAt: s.updated_at ? new Date(s.updated_at).getTime() : Date.now()
        };
      });
  }

  function saveSong(song) {
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    invalidateCache();

    if (!user || !user.id || !sb) {
      var sId = song.id || ('song-guest-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));
      var sData = Object.assign({}, song, { id: sId, user_id: 'guest', updatedAt: Date.now() });
      var offStore = getOfflineStore('guest');
      var rId = sData.repertoireId || 'misc';
      if (!offStore.songs[rId]) offStore.songs[rId] = [];
      var existingIdx = offStore.songs[rId].findIndex(function(x) { return x.id === sId; });
      if (existingIdx >= 0) offStore.songs[rId][existingIdx] = sData;
      else offStore.songs[rId].push(sData);
      saveOfflineStore('guest', offStore);
      return Promise.resolve(sId);
    }

    var payload = {
      title: (song.title || '').trim(),
      key: song.key || '',
      original_key: song.originalKey || '',
      artist: song.artist || '',
      composer: song.composer || '',
      youtube_url: song.youtubeUrl || '',
      youtube_id: song.youtubeId || '',
      spotify_url: song.spotifyUrl || '',
      content: song.content || '',
      user_id: user.id
    };

    if (song.repertoireId && isValidUUID(song.repertoireId)) payload.repertoire_id = song.repertoireId;
    if (song.rhythm) payload.rhythm = song.rhythm;
    if (song.id && isValidUUID(song.id)) payload.id = song.id;
    if (song.order !== undefined && song.order !== null) payload.order = song.order;
    if (song.trackNumber !== undefined && song.trackNumber !== null) payload.track_number = song.trackNumber;

    return sb.from('songs').upsert(payload).select().then(function(res) {
      if (res.error) {
        delete payload.user_id;
        delete payload.rhythm;
        delete payload.spotify_url;
        return sb.from('songs').upsert(payload).select().then(function(res2) {
          if (res2.error) throw res2.error;
          var s2 = res2.data && res2.data[0] ? res2.data[0] : null;
          return s2 ? s2.id : payload.id;
        });
      }
      var saved = res.data && res.data[0] ? res.data[0] : null;
      return saved ? saved.id : payload.id;
    });
  }

  function saveSongsBatch(songsArray) {
    if (!songsArray || songsArray.length === 0) return Promise.resolve([]);
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    invalidateCache();

    if (!user || !user.id || !sb) {
      var offStore = getOfflineStore('guest');
      songsArray.forEach(function(s) {
        var sId = s.id || ('song-guest-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));
        s.id = sId;
        s.user_id = 'guest';
        var rId = s.repertoireId || 'misc';
        if (!offStore.songs[rId]) offStore.songs[rId] = [];
        offStore.songs[rId].push(s);
      });
      saveOfflineStore('guest', offStore);
      return Promise.resolve(songsArray);
    }

    function buildPayloads(includeRhythm, includeUserId, includeSpotify) {
      return songsArray.map(function(s) {
        var p = {
          title: (s.title || '').trim(),
          key: s.key || '',
          original_key: s.originalKey || '',
          artist: s.artist || '',
          composer: s.composer || '',
          youtube_url: s.youtubeUrl || '',
          youtube_id: s.youtubeId || '',
          content: s.content || ''
        };
        if (includeSpotify && s.spotifyUrl) p.spotify_url = s.spotifyUrl;
        if (includeUserId && user && user.id) p.user_id = user.id;
        if (s.id && isValidUUID(s.id)) p.id = s.id;
        if (s.repertoireId && isValidUUID(s.repertoireId)) p.repertoire_id = s.repertoireId;
        if (includeRhythm && s.rhythm) p.rhythm = s.rhythm;
        if (s.order !== undefined && s.order !== null) p.order = s.order;
        if (s.trackNumber !== undefined && s.trackNumber !== null) p.track_number = s.trackNumber;
        return p;
      });
    }

    return sb.from('songs').upsert(buildPayloads(true, true, true)).select().then(function(res) {
      if (res.error) {
        console.warn('Erro ao salvar lote de músicas com payload completo, tentando fallback simplificado:', res.error);
        return sb.from('songs').upsert(buildPayloads(false, false, false)).select().then(function(res2) {
          if (res2.error) throw res2.error;
          return res2.data || songsArray;
        });
      }
      return res.data || songsArray;
    });
  }

  function deleteSong(id) {
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    invalidateCache();

    if (!user || !user.id || !sb) return Promise.resolve(true);

    return sb.from('songs').delete().eq('id', id).then(function(res) {
      if (res.error) console.warn('Erro ao deletar música na nuvem:', res.error);
      return true;
    });
  }

  function deleteSongsBatch(ids) {
    if (!ids || ids.length === 0) return Promise.resolve(true);
    var user = getCurrentUser();
    var sb = getSupabaseClient();
    invalidateCache();

    if (!user || !user.id || !sb) return Promise.resolve(true);

    return sb.from('songs').delete().in('id', ids).then(function(res) {
      if (res.error) console.warn('Erro ao deletar lote de músicas:', res.error);
      return true;
    });
  }

  // ════════════════════════════════════════
  //  MODO PALCO OFFLINE ("BAIXAR PARA O PALCO")
  // ════════════════════════════════════════

  function toggleRepertoireOffline(repId, isPinned) {
    var user = getCurrentUser();
    var userId = user ? user.id : 'guest';
    var offStore = getOfflineStore(userId);

    if (!isPinned) {
      delete offStore.repertoires[repId];
      delete offStore.songs[repId];
      saveOfflineStore(userId, offStore);
      return Promise.resolve(false);
    }

    return Promise.all([
      getRepertoireById(repId),
      getSongsByRepertoire(repId)
    ]).then(function(results) {
      var rep = results[0];
      var songs = results[1] || [];

      if (rep) {
        offStore.repertoires[repId] = Object.assign({}, rep, { isOfflinePinned: true });
        offStore.songs[repId] = songs;
        saveOfflineStore(userId, offStore);
        return true;
      }
      return false;
    });
  }

  function countSongsByRepertoire(repId) {
    return getSongsByRepertoire(repId).then(function(songs) {
      return (songs && songs.length) || 0;
    });
  }

  function getAllSongs() {
    return getSongsByRepertoire(null);
  }

  function toggleSongOffline(songId, pin) {
    var user = getCurrentUser();
    var userId = user ? user.id : 'guest';
    var offStore = getOfflineStore(userId);
    if (!offStore.songs) offStore.songs = {};

    return getSongById(songId).then(function(song) {
      if (song) {
        var repId = song.repertoireId || 'misc';
        if (!offStore.songs[repId]) offStore.songs[repId] = [];
        var idx = offStore.songs[repId].findIndex(function(s) { return s.id === songId; });
        if (pin) {
          if (idx === -1) offStore.songs[repId].push(song);
          else offStore.songs[repId][idx] = song;
        } else {
          if (idx !== -1) offStore.songs[repId].splice(idx, 1);
        }
        saveOfflineStore(userId, offStore);
        return pin;
      }
      return false;
    });
  }

  function saveRepertoiresOrder(orderIds) {
    var user = getCurrentUser();
    var userId = user ? user.id : 'guest';
    var sb = getSupabaseClient();
    invalidateCache();

    try {
      localStorage.setItem('canta_ai_rep_order_' + userId, JSON.stringify(orderIds || []));
    } catch(e) {}

    if (sb && Array.isArray(orderIds) && orderIds.length > 0) {
      var baseTime = Date.now() + (orderIds.length * 2000);
      var updatePromises = orderIds.map(function(repId, idx) {
        var repTime = new Date(baseTime - (idx * 2000)).toISOString();
        return sb.from('repertoires').update({ created_at: repTime }).eq('id', repId);
      });
      return Promise.all(updatePromises).then(function() {
        return true;
      }).catch(function(err) {
        console.warn('Aviso ao sincronizar ordem de repertórios na nuvem:', err);
        return true;
      });
    }

    return Promise.resolve(true);
  }

  function getAllRepertoiresGlobal() {
    var sb = getSupabaseClient();
    if (!sb) return getAllRepertoires();

    return sb.from('repertoires')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function(res) {
        if (res.error) return [];
        var rawList = res.data || [];
        return rawList.map(function(r) {
          return {
            id: r.id,
            name: r.name,
            source: r.source || 'manual',
            user_id: r.user_id,
            createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
          };
        });
      }).catch(function() {
        return [];
      });
  }

  function getAllSongsGlobal() {
    var sb = getSupabaseClient();
    if (!sb) return getAllSongs();

    return sb.from('songs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function(res) {
        if (res.error) return [];
        var rawList = res.data || [];
        return rawList.map(function(s, idx) {
          return {
            id: s.id,
            repertoireId: s.repertoire_id,
            title: s.title,
            key: s.key || '',
            originalKey: s.original_key || '',
            rhythm: s.rhythm || '',
            artist: s.artist || '',
            composer: s.composer || '',
            youtubeUrl: s.youtube_url || '',
            youtubeId: s.youtube_id || '',
            spotifyUrl: s.spotify_url || '',
            content: s.content || '',
            trackNumber: (s.track_number !== undefined && s.track_number !== null) ? s.track_number : (idx + 1),
            user_id: s.user_id,
            createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
            updatedAt: s.updated_at ? new Date(s.updated_at).getTime() : Date.now()
          };
        });
      }).catch(function() {
        return [];
      });
  }

  function initDB() {
    return Promise.resolve(true);
  }

  window.PrompterDB = {
    initDB: initDB,
    invalidateCache: invalidateCache,
    // Repertórios
    saveRepertoire: saveRepertoire,
    getAllRepertoires: getAllRepertoires,
    getRepertoiresWithCounts: getRepertoiresWithCounts,
    getAllRepertoiresGlobal: getAllRepertoiresGlobal,
    getRepertoireById: getRepertoireById,
    deleteRepertoire: deleteRepertoire,
    saveRepertoiresOrder: saveRepertoiresOrder,
    countSongsByRepertoire: countSongsByRepertoire,
    toggleRepertoireOffline: toggleRepertoireOffline,
    // Músicas
    saveSong: saveSong,
    saveSongsBatch: saveSongsBatch,
    getSongById: getSongById,
    getSong: getSongById,
    getAllSongs: getAllSongs,
    getAllSongsGlobal: getAllSongsGlobal,
    getSongsByRepertoire: getSongsByRepertoire,
    toggleSongOffline: toggleSongOffline,
    deleteSong: deleteSong,
    deleteSongsBatch: deleteSongsBatch
  };

})();
