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
        data.id = Number(repertoire.id);
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
      var req = store.get(Number(id));
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
}

function deleteRepertoire(id, skipCloudSync) {
  // Deleta o repertório E todas as suas músicas
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      // 1. Buscar músicas do repertório
      var txRead = db.transaction('songs', 'readonly');
      var songStore = txRead.objectStore('songs');
      var index = songStore.index('repertoireId');
      var songIds = [];

      var cursorReq = index.openCursor(IDBKeyRange.only(Number(id)));
      cursorReq.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          songIds.push(cursor.primaryKey);
          cursor.continue();
        } else {
          // 2. Deletar músicas e o repertório em transação de escrita
          var txWrite = db.transaction(['songs', 'repertoires'], 'readwrite');
          var writeSongs = txWrite.objectStore('songs');
          var writeReps = txWrite.objectStore('repertoires');

          for (var i = 0; i < songIds.length; i++) {
            writeSongs.delete(songIds[i]);
          }
          writeReps.delete(Number(id));

          txWrite.oncomplete = function() { resolve(true); };
          txWrite.onerror = function(e) { reject(e.target.error); };
        }
      };
      cursorReq.onerror = function(e) { reject(e.target.error); };
    });
  }).then(function(res) {
    if (!skipCloudSync && window.PrompterCloud) {
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
        repertoireId: song.repertoireId ? Number(song.repertoireId) : 0,
        isOfflinePinned: Boolean(song.isOfflinePinned),
        trackNumber: song.trackNumber !== undefined ? song.trackNumber : null,
        order: song.order !== undefined ? song.order : null,
        createdAt: song.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      if (song.id) {
        songData.id = Number(song.id);
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

function saveSongsBatch(songsArray) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      if (!songsArray || songsArray.length === 0) return resolve(true);
      var tx = db.transaction('songs', 'readwrite');
      var store = tx.objectStore('songs');

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
          repertoireId: song.repertoireId ? Number(song.repertoireId) : 0,
          trackNumber: song.trackNumber !== undefined ? song.trackNumber : null,
          order: song.order !== undefined ? song.order : null,
          createdAt: song.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        if (song.id) {
          songData.id = Number(song.id);
          store.put(songData);
        } else {
          store.add(songData);
        }
      }

      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  });
}

function getSongsByRepertoire(repertoireId) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('songs', 'readonly');
      var store = tx.objectStore('songs');
      var index = store.index('repertoireId');
      var songs = [];

      var req = index.openCursor(IDBKeyRange.only(Number(repertoireId)));
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          songs.push(cursor.value);
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
      req.onerror = function(e) { reject(e.target.error); };
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
      var req = store.get(Number(id));
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
      var req = store.delete(Number(id));
      req.onsuccess = function() { resolve(true); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  }).then(function(res) {
    if (!skipCloudSync && window.PrompterCloud) {
      window.PrompterCloud.deleteSongFromCloud(id);
    }
    return res;
  });
}

function countSongsByRepertoire(repertoireId) {
  return initDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('songs', 'readonly');
      var store = tx.objectStore('songs');
      var index = store.index('repertoireId');
      var req = index.count(IDBKeyRange.only(Number(repertoireId)));
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { resolve(0); };
    });
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

window.PrompterDB = {
  initDB: initDB,
  // Repertórios
  saveRepertoire: saveRepertoire,
  getAllRepertoires: getAllRepertoires,
  getRepertoireById: getRepertoireById,
  deleteRepertoire: deleteRepertoire,
  countSongsByRepertoire: countSongsByRepertoire,
  toggleRepertoireOffline: toggleRepertoireOffline,
  // Músicas
  saveSong: saveSong,
  saveSongsBatch: saveSongsBatch,
  getAllSongs: getAllSongs,
  getSongById: getSongById,
  getSongsByRepertoire: getSongsByRepertoire,
  deleteSong: deleteSong,
  deduplicateSongsList: deduplicateSongsList,
  toggleSongOffline: toggleSongOffline
};
