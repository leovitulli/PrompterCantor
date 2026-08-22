/**
 * PrompterCantor - Integração com o Google Drive
 * OAuth 2.0 via Google Identity Services (GIS) + Drive API v3
 */

var GDriveImporter = (function() {

  var CLIENT_ID = '1055680550347-h7258303eaieioavf0bu25rkct7mss2m.apps.googleusercontent.com';
  var SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
  var DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

  var _tokenClient = null;
  var _accessToken = null;
  var _gapiReady = false;
  var _gisReady = false;
  var _onAuthSuccess = null;

  // Extensões suportadas
  var TEXT_EXTS = ['.docx', '.doc', '.pdf', '.txt', '.rtf', '.odt', '.md'];
  var AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.opus', '.webm', '.wma', '.3gp', '.mp4', '.mov', '.mkv', '.avi'];

  // ─── Inicialização da GAPI ─────────────────────────────────────────────────

  function initGAPI() {
    return new Promise(function(resolve, reject) {
      if (_gapiReady) { resolve(); return; }
      if (typeof gapi === 'undefined') {
        reject(new Error('Google API (gapi) não carregada. Verifique a conexão.'));
        return;
      }
      gapi.load('client', function() {
        gapi.client.init({
          discoveryDocs: [DISCOVERY_DOC]
        }).then(function() {
          _gapiReady = true;
          resolve();
        }).catch(reject);
      });
    });
  }

  function initGIS() {
    return new Promise(function(resolve, reject) {
      if (_gisReady) { resolve(); return; }
      if (typeof google === 'undefined' || !google.accounts) {
        reject(new Error('Google Identity Services não carregado. Verifique a conexão.'));
        return;
      }
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: function(response) {
          if (response.error) {
            console.error('Erro de autenticação Google:', response);
            if (_onAuthSuccess) _onAuthSuccess(null, 'Autenticação cancelada ou falhou: ' + response.error);
            return;
          }
          _accessToken = response.access_token;
          gapi.client.setToken({ access_token: _accessToken });
          if (_onAuthSuccess) _onAuthSuccess(_accessToken, null);
        }
      });
      _gisReady = true;
      resolve();
    });
  }

  // ─── Autenticação ──────────────────────────────────────────────────────────

  function isConnected() {
    return !!_accessToken;
  }

  function connect(onSuccess) {
    _onAuthSuccess = onSuccess;
    Promise.all([initGAPI(), initGIS()])
      .then(function() {
        if (_accessToken) {
          // Já autenticado
          if (_onAuthSuccess) _onAuthSuccess(_accessToken, null);
        } else {
          // Solicitar token — abre popup do Google
          _tokenClient.requestAccessToken({ prompt: 'consent' });
        }
      })
      .catch(function(err) {
        if (_onAuthSuccess) _onAuthSuccess(null, err.message || 'Erro ao inicializar Google API.');
      });
  }

  function disconnect() {
    if (_accessToken && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(_accessToken, function() {});
    }
    _accessToken = null;
    gapi.client.setToken(null);
  }

  // ─── Listagem de Arquivos do Drive ─────────────────────────────────────────

  function extractFolderId(url) {
    if (!url) return null;
    // Suporta formatos:
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID
    // https://drive.google.com/open?id=FOLDER_ID
    var patterns = [
      /folders\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = url.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  // ─── Listagem Recursiva de Arquivos e Subpastas ────────────────────────────

  function listFolderRecursive(folderId, folderName, onProgress, currentPath) {
    currentPath = currentPath || (folderName || 'Pasta Principal');
    var results = {
      folderId: folderId,
      folderName: folderName || 'Pasta Principal',
      path: currentPath,
      files: [],
      subfolders: []
    };

    function fetchDirectChildren(fId) {
      var all = [];
      var pageToken = null;

      function page() {
        var params = {
          q: '"' + fId + '" in parents and trashed = false',
          fields: 'nextPageToken, files(id, name, mimeType, size)',
          pageSize: 100,
          orderBy: 'name'
        };
        if (pageToken) params.pageToken = pageToken;

        return gapi.client.drive.files.list(params).then(function(res) {
          var files = (res.result && res.result.files) || [];
          all = all.concat(files);
          if (res.result.nextPageToken) {
            pageToken = res.result.nextPageToken;
            return page();
          }
          return all;
        });
      }
      return page();
    }

    return fetchDirectChildren(folderId).then(function(items) {
      var fileItems = [];
      var subfolderItems = [];

      items.forEach(function(item) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          subfolderItems.push(item);
        } else {
          item.folderName = results.folderName;
          item.folderId = folderId;
          item.folderPath = currentPath;
          fileItems.push(item);
        }
      });

      results.files = fileItems;
      if (onProgress) onProgress(fileItems.length);

      if (subfolderItems.length === 0) {
        return results;
      }

      // Processar cada subpasta recursivamente
      var subPromises = subfolderItems.map(function(sf) {
        var subPath = currentPath + ' / ' + sf.name;
        return listFolderRecursive(sf.id, sf.name, onProgress, subPath);
      });

      return Promise.all(subPromises).then(function(subResults) {
        results.subfolders = subResults;
        return results;
      });
    });
  }

  function listFilesInFolder(folderId, onProgress) {
    // Busca informações da pasta pai para obter seu nome
    return gapi.client.drive.files.get({
      fileId: folderId,
      fields: 'id, name'
    }).then(function(res) {
      var folderName = res.result ? res.result.name : 'Pasta Drive';
      return listFolderRecursive(folderId, folderName, onProgress);
    }).catch(function() {
      return listFolderRecursive(folderId, 'Pasta Drive', onProgress);
    });
  }

  // ─── Download de Arquivos ──────────────────────────────────────────────────

  function downloadFileAsBlob(fileId, mimeType) {
    var url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media';

    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + _accessToken);
      xhr.responseType = 'blob';

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error('Erro ao baixar arquivo: HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function() {
        reject(new Error('Falha de rede ao baixar arquivo.'));
      };
      xhr.send();
    });
  }

  function exportGDocsAsText(fileId, mimeType) {
    var exportMime = 'text/plain';
    if (mimeType === 'application/vnd.google-apps.document') {
      exportMime = 'text/plain';
    }
    var url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '/export?mimeType=' + encodeURIComponent(exportMime);

    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + _accessToken);
      xhr.responseType = 'blob';

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error('Erro ao exportar Google Doc: HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function() { reject(new Error('Falha de rede.')); };
      xhr.send();
    });
  }

  // ─── Classificação e Paridade Inteligente de Arquivos ─────────────────────

  function getExtension(name) {
    var lower = (name || '').toLowerCase();
    var idx = lower.lastIndexOf('.');
    return idx !== -1 ? lower.substring(idx) : '';
  }

  function isTextFile(file) {
    if (file.mimeType === 'application/vnd.google-apps.document') return true;
    return TEXT_EXTS.indexOf(getExtension(file.name)) !== -1;
  }

  function isAudioFile(file) {
    return AUDIO_EXTS.indexOf(getExtension(file.name)) !== -1;
  }

  function extractTrackNumber(filename) {
    var match = (filename || '').match(/^(\d{1,3})[\s._-]/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    var numMatch = (filename || '').match(/(\d{1,3})/);
    return numMatch ? parseInt(numMatch[1], 10) : null;
  }

  function autoPairDriveFiles(files) {
    if (!Array.isArray(files)) files = [];
    var textFiles = files.filter(isTextFile);
    var audioFiles = files.filter(isAudioFile);
    var pairs = [];

    textFiles.forEach(function(tf) {
      var baseText = tf.name.replace(/\.[^/.]+$/, '').trim().toLowerCase();
      var textNum = extractTrackNumber(tf.name);
      var matched = null;

      // 1. Tentar por número da faixa se existir
      if (textNum !== null) {
        for (var a = 0; a < audioFiles.length; a++) {
          var afNum = extractTrackNumber(audioFiles[a].name);
          if (afNum === textNum) {
            matched = audioFiles[a];
            break;
          }
        }
      }

      // 2. Se não casou por número, tentar por correspondência de nome
      if (!matched) {
        for (var a2 = 0; a2 < audioFiles.length; a2++) {
          var af = audioFiles[a2];
          var baseAudio = af.name.replace(/\.[^/.]+$/, '').trim().toLowerCase();
          if (baseAudio === baseText || baseAudio.indexOf(baseText) !== -1 || baseText.indexOf(baseAudio) !== -1) {
            matched = af;
            break;
          }
        }
      }

      pairs.push({ textFile: tf, audioFile: matched, folderName: tf.folderName || '' });
    });

    // Áudios sem par de letra
    audioFiles.forEach(function(af) {
      var alreadyPaired = pairs.some(function(p) { return p.audioFile === af; });
      if (!alreadyPaired) {
        pairs.push({ textFile: null, audioFile: af, folderName: af.folderName || '' });
      }
    });

    return pairs;
  }

  // ─── Paridade de arquivos locais (mantida para compatibilidade) ────────────

  function autoPairTextAndAudioFiles(files) {
    var textFiles = [];
    var audioFiles = [];
    var pairs = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var ext = getExtension(file.name);
      if (TEXT_EXTS.indexOf(ext) !== -1) {
        textFiles.push(file);
      } else if (AUDIO_EXTS.indexOf(ext) !== -1) {
        audioFiles.push(file);
      }
    }

    for (var t = 0; t < textFiles.length; t++) {
      var textFile = textFiles[t];
      var baseTextName = textFile.name.replace(/\.[^/.]+$/, '').trim().toLowerCase();
      var textNum = extractTrackNumber(textFile.name);
      var matchedAudio = null;

      // 1. Tentar casar pelo número da faixa (ex: 01 com 01.mp3)
      if (textNum !== null) {
        for (var a = 0; a < audioFiles.length; a++) {
          var afNum = extractTrackNumber(audioFiles[a].name);
          if (afNum === textNum) {
            matchedAudio = audioFiles[a];
            break;
          }
        }
      }

      // 2. Se não casou por número, tentar por correspondência de nome
      if (!matchedAudio) {
        for (var a2 = 0; a2 < audioFiles.length; a2++) {
          var audioFile = audioFiles[a2];
          var baseAudioName = audioFile.name.replace(/\.[^/.]+$/, '').trim().toLowerCase();
          if (baseAudioName === baseTextName || baseAudioName.indexOf(baseTextName) !== -1 || baseTextName.indexOf(baseAudioName) !== -1) {
            matchedAudio = audioFile;
            break;
          }
        }
      }
      pairs.push({ textFile: textFile, audioFile: matchedAudio });
    }

    for (var m = 0; m < audioFiles.length; m++) {
      var aud = audioFiles[m];
      var alreadyPaired = pairs.some(function(p) { return p.audioFile === aud; });
      if (!alreadyPaired) {
        pairs.push({ textFile: null, audioFile: aud });
      }
    }

    return pairs;
  }

  function pairSongsWithAudioFiles(parsedSongs, audioFiles) {
    if (!parsedSongs) parsedSongs = [];
    if (!audioFiles) audioFiles = [];

    var pairedSongs = [];
    var usedAudioIndexes = {};

    for (var i = 0; i < parsedSongs.length; i++) {
      var song = parsedSongs[i];
      var matchedAudio = null;
      var songNum = song.trackNumber !== undefined && song.trackNumber !== null ? song.trackNumber : (i + 1);
      var songTitleNorm = (song.title || '').toLowerCase().replace(/[^a-z0-9à-ú]/g, '');

      // 1. Pareamento por número da faixa
      for (var a = 0; a < audioFiles.length; a++) {
        if (usedAudioIndexes[a]) continue;
        var af = audioFiles[a];
        var afNum = extractTrackNumber(af.name);
        if (afNum === songNum) {
          matchedAudio = af;
          usedAudioIndexes[a] = true;
          break;
        }
      }

      // 2. Pareamento por similaridade de título se número não casar
      if (!matchedAudio && songTitleNorm.length > 2) {
        for (var a2 = 0; a2 < audioFiles.length; a2++) {
          if (usedAudioIndexes[a2]) continue;
          var af2 = audioFiles[a2];
          var afNameNorm = (af2.name || '').toLowerCase().replace(/[^a-z0-9à-ú]/g, '');
          if (afNameNorm.indexOf(songTitleNorm) !== -1 || songTitleNorm.indexOf(afNameNorm) !== -1) {
            matchedAudio = af2;
            usedAudioIndexes[a2] = true;
            break;
          }
        }
      }

      // 3. Fallback por posição na lista se a quantidade de áudios for igual à quantidade de letras
      if (!matchedAudio && audioFiles[i] && !usedAudioIndexes[i] && audioFiles.length === parsedSongs.length) {
        matchedAudio = audioFiles[i];
        usedAudioIndexes[i] = true;
      }

      song.audioBlob = matchedAudio || null;
      song.audioName = matchedAudio ? matchedAudio.name : '';
      pairedSongs.push(song);
    }

    // Incluir áudios que não foram pareados com nenhuma letra
    for (var u = 0; u < audioFiles.length; u++) {
      if (!usedAudioIndexes[u]) {
        var orphanAudio = audioFiles[u];
        var afNumOrphan = extractTrackNumber(orphanAudio.name) || (parsedSongs.length + u + 1);
        pairedSongs.push({
          title: TextParser.cleanFilename(orphanAudio.name),
          trackNumber: afNumOrphan,
          key: '',
          artist: '',
          composer: '',
          content: '(Apenas áudio guia gravado)',
          audioBlob: orphanAudio,
          audioName: orphanAudio.name
        });
      }
    }

    return pairedSongs;
  }

  // ─── API Pública ───────────────────────────────────────────────────────────

  return {
    extractFolderId: extractFolderId,
    autoPairTextAndAudioFiles: autoPairTextAndAudioFiles,
    pairSongsWithAudioFiles: pairSongsWithAudioFiles,
    autoPairDriveFiles: autoPairDriveFiles,
    isConnected: isConnected,
    connect: connect,
    disconnect: disconnect,
    listFilesInFolder: listFilesInFolder,
    downloadFileAsBlob: downloadFileAsBlob,
    exportGDocsAsText: exportGDocsAsText,
    isTextFile: isTextFile,
    isAudioFile: isAudioFile
  };

})();

window.GDriveImporter = GDriveImporter;
