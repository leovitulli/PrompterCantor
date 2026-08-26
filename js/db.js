/**
 * PrompterCantor - Módulo de Banco de Dados Local (IndexedDB)
 * v2: Suporte a Repertórios separados por importação
 * Garante funcionamento 100% Offline em tablets e iPads no palco.
 */

var DB_NAME = 'PrompterCantorDB';
var DB_VERSION = 2;
var dbInstance = null;

function initDB() {
  return new Promise(function(resolve, reject) {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    if (!window.indexedDB) {
      return reject(new Error('IndexedDB não suportado.'));
    }

    var request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function(event) {
      var db = event.target.result;
      var oldVersion = event.oldVersion;

      // --- objectStore: songs ---
      if (!db.objectStoreNames.contains('songs')) {
        var songStore = db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
        songStore.createIndex('title', 'title', { unique: false });
        songStore.createIndex('artist', 'artist', { unique: false });
        songStore.createIndex('composer', 'composer', { unique: false });
        songStore.createIndex('key', 'key', { unique: false });
        songStore.createIndex('createdAt', 'createdAt', { unique: false });
        songStore.createIndex('repertoireId', 'repertoireId', { unique: false });
      } else if (oldVersion < 2) {
        // Migration: adicionar índice repertoireId
        var existingStore = event.target.transaction.objectStore('songs');
        if (!existingStore.indexNames.contains('repertoireId')) {
          existingStore.createIndex('repertoireId', 'repertoireId', { unique: false });
        }
      }

      // --- objectStore: repertoires (NOVO na v2) ---
      if (!db.objectStoreNames.contains('repertoires')) {
        var repStore = db.createObjectStore('repertoires', { keyPath: 'id', autoIncrement: true });
        repStore.createIndex('createdAt', 'createdAt', { unique: false });
        repStore.createIndex('name', 'name', { unique: false });
      }
    };

    request.onsuccess = function(event) {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

// ════════════════════════════════════════
//  REPERTÓRIOS
// ════════════════════════════════════════

function saveRepertoire(repertoire, skipCloudSync) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('repertoires', 'readwrite');
      var store = tx.objectStore('repertoires');

      var data = {
        name: (repertoire.name || 'Repertório').trim(),
        source: repertoire.source || 'local',
        isOfflinePinned: Boolean(repertoire.isOfflinePinned),
        createdAt: repertoire.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      if (repertoire.id) {
        data.id = repertoire.id;
        var req = store.put(data);
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function(e) { reject(e.target.error); };
      } else {
        var req2 = store.add(data);
        req2.onsuccess = function(e) { resolve(e.target.result); };
        req2.onerror = function(e) { reject(e.target.error); };
      }
    });
  }).then(function(savedId) {
    if (!skipCloudSync && window.PrompterCloud && typeof window.PrompterCloud.saveRepertoireToCloud === 'function') {
      try {
        var repToSync = Object.assign({}, repertoire, { id: savedId });
        window.PrompterCloud.saveRepertoireToCloud(repToSync).catch(function(e) {
          console.warn('Sync de repertório em segundo plano falhou:', e);
        });
      } catch (err) {
        console.warn('Erro ao disparar sync de repertório:', err);
      }
    }
    return savedId;
  });
}

function getAllRepertoires() {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('repertoires', 'readonly');
      var store = tx.objectStore('repertoires');
      var items = [];

      var req = store.openCursor();
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          // Ordenar por data de criação decrescente (mais recentes primeiro)
          items.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
          resolve(items);
        }
      };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
}

function getRepertoireById(id) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('repertoires', 'readonly');
      var store = tx.objectStore('repertoires');
      var req = store.get(id);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
}

function deleteRepertoire(id, skipCloudSync) {
  // Deleta o repertório E todas as suas músicas
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(['songs', 'repertoires'], 'readwrite');
      var songStore = tx.objectStore('songs');
      var repStore = tx.objectStore('repertoires');
      var targetId = String(id);

      repStore.delete(id);
      if (typeof id === 'string' && !isNaN(Number(id))) {
        repStore.delete(Number(id));
      }

      var req = songStore.openCursor();
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          if (cursor.value && String(cursor.value.repertoireId) === targetId) {
            cursor.delete();
          }
          cursor.continue();
        }
      };

      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  }).then(function(res) {
    if (!skipCloudSync && window.PrompterCloud && typeof window.PrompterCloud.deleteRepertoireFromCloud === 'function') {
      window.PrompterCloud.deleteRepertoireFromCloud(id);
    }
    return res;
  });
}

// ════════════════════════════════════════
//  MÚSICAS
// ════════════════════════════════════════

function saveSong(song, skipCloudSync) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('songs', 'readwrite');
      var store = tx.objectStore('songs');

      var songData = {
        title: (song.title || '').trim(),
        key: song.key || '',
        originalKey: song.originalKey || '',
        rhythm: song.rhythm || '',
        youtubeUrl: song.youtubeUrl || '',
        youtubeId: song.youtubeId || '',
        artist: song.artist || '',
        composer: song.composer || '',
        content: song.content || '',
        audioBlob: song.audioBlob || null,
        audioName: song.audioName || '',
        repertoireId: song.repertoireId || null,
        isOfflinePinned: Boolean(song.isOfflinePinned),
        trackNumber: song.trackNumber !== undefined ? song.trackNumber : null,
        order: song.order !== undefined ? song.order : null,
        createdAt: song.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      if (song.id) {
        songData.id = song.id;
        var req = store.put(songData);
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function(e) { reject(e.target.error); };
      } else {
        var req2 = store.add(songData);
        req2.onsuccess = function(e) { resolve(e.target.result); };
        req2.onerror = function(e) { reject(e.target.error); };
      }
    });
  }).then(function(savedId) {
    if (!skipCloudSync && window.PrompterCloud && typeof window.PrompterCloud.saveSongToCloud === 'function') {
      try {
        var songToSync = Object.assign({}, song, { id: savedId });
        window.PrompterCloud.saveSongToCloud(songToSync).catch(function(e) {
          console.warn('Sync de música em segundo plano falhou:', e);
        });
      } catch (err) {
        console.warn('Erro ao disparar sync de música:', err);
      }
    }
    return savedId;
  });
}

function saveSongsBatch(songsArray, skipCloudSync) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      if (!songsArray || songsArray.length === 0) return resolve([]);
      var tx = db.transaction('songs', 'readwrite');
      var store = tx.objectStore('songs');
      var savedSongs = [];

      for (var i = 0; i < songsArray.length; i++) {
        var song = songsArray[i];
        var songData = {
          title: (song.title || '').trim(),
          key: song.key || '',
          originalKey: song.originalKey || '',
          rhythm: song.rhythm || '',
          youtubeUrl: song.youtubeUrl || '',
          youtubeId: song.youtubeId || '',
          artist: song.artist || '',
          composer: song.composer || '',
          content: song.content || '',
          audioBlob: song.audioBlob || null,
          audioName: song.audioName || '',
          repertoireId: song.repertoireId || null,
          trackNumber: song.trackNumber !== undefined ? song.trackNumber : null,
          order: song.order !== undefined ? song.order : null,
          createdAt: song.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        if (song.id) {
          songData.id = song.id;
          store.put(songData);
          savedSongs.push(songData);
        } else {
          var req = store.add(songData);
          (function(sData) {
            req.onsuccess = function(e) {
              sData.id = e.target.result;
              savedSongs.push(sData);
            };
          })(songData);
        }
      }

      tx.oncomplete = function() {
        resolve(savedSongs.length > 0 ? savedSongs : songsArray);
      };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  }).then(function(savedResult) {
    if (!skipCloudSync && window.PrompterCloud && typeof window.PrompterCloud.saveSongsBatchToCloud === 'function') {
      try {
        window.PrompterCloud.saveSongsBatchToCloud(savedResult).catch(function(e) {
          console.warn('Sync de lote de músicas em segundo plano falhou:', e);
        });
      } catch (err) {
        console.warn('Erro ao disparar sync de lote de músicas:', err);
      }
    }
    return savedResult;
  });
}

function getSongsByRepertoire(repertoireId) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      if (!repertoireId) return resolve([]);
      var tx = db.transaction('songs', 'readonly');
      var store = tx.objectStore('songs');
      var songs = [];
      var targetId = String(repertoireId);

      var req = store.openCursor();
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          if (cursor.value && String(cursor.value.repertoireId) === targetId) {
            songs.push(cursor.value);
          }
          cursor.continue();
        } else {
          songs.sort(function(a, b) {
            var orderA = (a.order !== null && a.order !== undefined) ? Number(a.order) : ((a.trackNumber !== null && a.trackNumber !== undefined) ? Number(a.trackNumber) : 99999);
            var orderB = (b.order !== null && b.order !== undefined) ? Number(b.order) : ((b.trackNumber !== null && b.trackNumber !== undefined) ? Number(b.trackNumber) : 99999);
            if (orderA !== orderB) return orderA - orderB;
            return (a.title || '').localeCompare(b.title || '', 'pt', { sensitivity: 'base' });
          });
          resolve(songs);
        }
      };
      req.onerror = function() { resolve([]); };
    });
  });
}

function getAllSongs() {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('songs', 'readonly');
      var store = tx.objectStore('songs');
      var songs = [];

      var req = store.openCursor();
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          if (cursor.value) songs.push(cursor.value);
          cursor.continue();
        } else {
          resolve(songs);
        }
      };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
}

function getSongById(id) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('songs', 'readonly');
      var store = tx.objectStore('songs');
      var req = store.get(id);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
}

function deleteSong(id, skipCloudSync) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('songs', 'readwrite');
      var store = tx.objectStore('songs');
      var req = store.delete(id);
      if (typeof id === 'string' && !isNaN(Number(id))) {
        store.delete(Number(id));
      }
      req.onsuccess = function() { resolve(true); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  }).then(function(res) {
    if (!skipCloudSync && window.PrompterCloud && typeof window.PrompterCloud.deleteSongFromCloud === 'function') {
      window.PrompterCloud.deleteSongFromCloud(id);
    }
    return res;
  });
}

function countSongsByRepertoire(repertoireId) {
  return getSongsByRepertoire(repertoireId).then(function(songs) {
    return songs.length;
  });
}

// Mantida para compatibilidade
function deduplicateSongsList(songs) {
  var uniqueMap = {};
  var result = [];
  for (var i = 0; i < songs.length; i++) {
    var s = songs[i];
    var normTitle = (s.title || '').trim().toLowerCase();
    if (!normTitle) normTitle = 'sem_titulo_' + i;
    if (!uniqueMap[normTitle]) {
      uniqueMap[normTitle] = s;
      result.push(s);
    } else {
      var existing = uniqueMap[normTitle];
      if (s.audioBlob && !existing.audioBlob) {
        existing.audioBlob = s.audioBlob;
        existing.audioName = s.audioName;
      }
      if (s.key && !existing.key) existing.key = s.key;
      if (s.artist && !existing.artist) existing.artist = s.artist;
      if (s.composer && !existing.composer) existing.composer = s.composer;
    }
  }
  return result;
}

// ════════════════════════════════════════
//  SETLISTS / SHOWS
// ════════════════════════════════════════

function toggleRepertoireOffline(repId, isPinned) {
  return getRepertoireById(repId).then(function(rep) {
    if (!rep) return false;
    rep.isOfflinePinned = Boolean(isPinned);
    return saveRepertoire(rep, true).then(function() {
      return getSongsByRepertoire(repId).then(function(songs) {
        var promises = songs.map(function(s) {
          s.isOfflinePinned = Boolean(isPinned);
          return saveSong(s, true);
        });
        return Promise.all(promises).then(function() { return rep.isOfflinePinned; });
      });
    });
  });
}

function toggleSongOffline(songId, isPinned) {
  return getSongById(songId).then(function(song) {
    if (!song) return false;
    song.isOfflinePinned = Boolean(isPinned);
    return saveSong(song, true).then(function() {
      return song.isOfflinePinned;
    });
  });
}

function cleanUpDuplicates() {
  return initDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(['songs', 'repertoires'], 'readwrite');
      var songStore = tx.objectStore('songs');
      var repStore = tx.objectStore('repertoires');

      var seenReps = {};
      repStore.openCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          var rep = cursor.value;
          var normName = (rep.name || '').trim().toLowerCase();
          if (seenReps[normName]) {
            cursor.delete();
          } else {
            seenReps[normName] = rep.id;
          }
          cursor.continue();
        }
      };

      var seenSongs = {};
      songStore.openCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          var song = cursor.value;
          var normTitle = (song.title || '').trim().toLowerCase();
          var key = (song.repertoireId || 'no_rep') + '|' + normTitle;
          if (seenSongs[key]) {
            cursor.delete();
          } else {
            seenSongs[key] = song.id;
          }
          cursor.continue();
        }
      };

      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  });
}

function replaceLocalWithCloud(cloudReps, cloudSongs) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(['songs', 'repertoires'], 'readwrite');
      var songStore = tx.objectStore('songs');
      var repStore = tx.objectStore('repertoires');

      songStore.clear();
      repStore.clear();

      if (cloudReps && cloudReps.length) {
        cloudReps.forEach(function(cRep) {
          repStore.put({
            id: cRep.id,
            name: cRep.name,
            source: cRep.source || 'manual',
            createdAt: cRep.created_at ? new Date(cRep.created_at).getTime() : Date.now(),
            updatedAt: cRep.updated_at ? new Date(cRep.updated_at).getTime() : Date.now()
          });
        });
      }

      if (cloudSongs && cloudSongs.length) {
        cloudSongs.forEach(function(cSong) {
          songStore.put({
            id: cSong.id,
            repertoireId: cSong.repertoire_id,
            title: cSong.title,
            key: cSong.key || '',
            originalKey: cSong.original_key || '',
            rhythm: cSong.rhythm || '',
            artist: cSong.artist || '',
            composer: cSong.composer || '',
            youtubeUrl: cSong.youtube_url || '',
            youtubeId: cSong.youtube_id || '',
            content: cSong.content || '',
            trackNumber: cSong.track_number !== undefined ? cSong.track_number : null,
            order: cSong.order !== undefined ? cSong.order : null,
            createdAt: cSong.created_at ? new Date(cSong.created_at).getTime() : Date.now(),
            updatedAt: cSong.updated_at ? new Date(cSong.updated_at).getTime() : Date.now()
          });
        });
      }

      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  });
}

window.PrompterDB = {
  initDB: initDB,
  // Repertórios
  saveRepertoire: saveRepertoire,
  getAllRepertoires: getAllRepertoires,
  getRepertoireById: getRepertoireById,
  deleteRepertoire: deleteRepertoire,
  countSongsByRepertoire: countSongsByRepertoire,
  toggleRepertoireOffline: toggleRepertoireOffline,
  cleanUpDuplicates: cleanUpDuplicates,
  replaceLocalWithCloud: replaceLocalWithCloud,
  // Músicas
  saveSong: saveSong,
  saveSongsBatch: saveSongsBatch,
  getAllSongs: getAllSongs,
  getSongById: getSongById,
  getSong: getSongById,
  getSongsByRepertoire: getSongsByRepertoire,
  deleteSong: deleteSong,
  deduplicateSongsList: deduplicateSongsList,
  toggleSongOffline: toggleSongOffline
};
