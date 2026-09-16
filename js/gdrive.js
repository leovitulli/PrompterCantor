/**
 * PrompterCantor - Integração Simplificada com Google Drive (Sem OAuth / Sem API)
 * Suporta Links Públicos Compartilhados ("Qualquer pessoa com o link") e Seleção Direta de Pastas.
 */

var GDriveImporter = (function() {

  // Extensões suportadas
  var TEXT_EXTS = ['.docx', '.doc', '.pdf', '.txt', '.rtf', '.odt', '.md', '.cifra'];
  var AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.opus', '.webm', '.wma', '.3gp', '.mp4'];

  // ─── Modo Público (Zero Burocracia) ─────────────────────────────────────────

  function isConnected() {
    return true; // Sempre conectado em modo público
  }

  function connect(onSuccess) {
    if (onSuccess) onSuccess('public_access', null);
  }

  function disconnect() {
    // No-op em modo público
  }

  // ─── Extração Inteligente de Links do Google Drive ─────────────────────────

  function extractFolderId(url) {
    if (!url) return null;
    var cleanUrl = url.trim();

    // Se o link apontar para um arquivo ou documento individual, NUNCA é pasta
    if (cleanUrl.indexOf('/document/d/') !== -1 || cleanUrl.indexOf('/file/d/') !== -1 || cleanUrl.indexOf('/spreadsheets/d/') !== -1 || cleanUrl.indexOf('/presentation/d/') !== -1) {
      return null;
    }

    var patterns = [
      /folders\/([a-zA-Z0-9_-]{15,60})/,
      /[?&]id=([a-zA-Z0-9_-]{15,60})(?:&|$)/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = cleanUrl.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    // Se a própria string for apenas o ID (sem URL)
    if (/^[a-zA-Z0-9_-]{25,50}$/.test(cleanUrl)) {
      return cleanUrl;
    }
    return null;
  }

  function extractFileId(url) {
    if (!url) return null;
    var cleanUrl = url.trim();
    var patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]{15,60})/,
      /\/document\/d\/([a-zA-Z0-9_-]{15,60})/,
      /\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,60})/,
      /\/presentation\/d\/([a-zA-Z0-9_-]{15,60})/,
      /[?&]id=([a-zA-Z0-9_-]{15,60})(?:&|$)/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = cleanUrl.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  function isGoogleDocUrl(url) {
    return (url || '').indexOf('/document/d/') !== -1;
  }

  // ─── Listagem de Arquivos da Pasta Pública via Endpoint Serverless ───────────

  function listFilesInFolder(folderIdOrUrl, onProgress) {
    if (onProgress) onProgress(1);

    var input = (folderIdOrUrl || '').trim();
    var folderId = extractFolderId(input);

    if (folderId) {
      var apiUrl = '/api/drive-public?folderId=' + encodeURIComponent(folderId);

      return fetch(apiUrl)
        .then(function(res) {
          return res.json().then(function(data) {
            if (!res.ok || !data.success) {
              var errText = (data && data.error) ? data.error : ('Falha ao acessar pasta (HTTP ' + res.status + ')');
              throw new Error(errText);
            }
            if (onProgress) onProgress((data.files || []).length);
            return (data.files || []).map(function(f) {
              return {
                id: f.id,
                name: f.name,
                mimeType: f.mimeType || 'application/octet-stream',
                size: f.size || 0,
                downloadUrl: f.downloadUrl,
                folderName: 'Google Drive'
              };
            });
          }).catch(function(jsonErr) {
            if (jsonErr.message && jsonErr.message.indexOf('Falha') !== -1) throw jsonErr;
            throw new Error('Falha ao conectar com a pasta pública do Drive (HTTP ' + res.status + ').');
          });
        });
    }

    // Se o usuário colou o link de um único Google Docs ou arquivo do Drive
    var fileId = extractFileId(input);
    if (fileId) {
      var isDoc = isGoogleDocUrl(input);
      var checkUrl = '/api/drive-public?fileId=' + encodeURIComponent(fileId) + (isDoc ? '&isDoc=true' : '') + '&check=true';

      return fetch(checkUrl)
        .then(function(res) {
          return res.json().then(function(data) {
            if (!res.ok || !data.success) {
              var errMsg = (data && data.error) ? data.error : (isDoc
                ? 'Documento não encontrado no Google Docs. Verifique se o link foi copiado por completo.'
                : 'Arquivo não encontrado no Google Drive.');
              throw new Error(errMsg);
            }
            if (onProgress) onProgress((data.files || []).length);
            return data.files || [];
          }).catch(function(jsonErr) {
            if (jsonErr.message && jsonErr.message.indexOf('não encontrado') !== -1) throw jsonErr;
            if (jsonErr.message && jsonErr.message.indexOf('Acesso') !== -1) throw jsonErr;
            throw new Error(isDoc
              ? 'Não foi possível acessar este Google Docs. Verifique se o link está como "Qualquer pessoa com o link pode ver".'
              : 'Não foi possível acessar o arquivo do Drive.');
          });
        });
    }

    return Promise.reject(new Error('Link inválido. Cole o link público de uma pasta do Google Drive ou de um arquivo/Google Docs.'));
  }

  // ─── Download Seguro de Arquivo ─────────────────────────────────────────────

  function downloadFileAsBlob(fileIdOrObj, mimeType) {
    // Se já for um arquivo local (File/Blob do picker nativo), retorna direto!
    if (fileIdOrObj instanceof Blob || (fileIdOrObj && fileIdOrObj.rawFile instanceof Blob)) {
      return Promise.resolve(fileIdOrObj.rawFile || fileIdOrObj);
    }

    var fileId = (typeof fileIdOrObj === 'object') ? (fileIdOrObj.id || '') : fileIdOrObj;
    var downloadUrl = '/api/drive-public?fileId=' + encodeURIComponent(fileId);

    if (mimeType === 'application/vnd.google-apps.document') {
      downloadUrl += '&isDoc=true';
    }

    return fetch(downloadUrl)
      .then(function(res) {
        if (!res.ok) throw new Error('Erro ao baixar arquivo (HTTP ' + res.status + ')');
        return res.blob();
      });
  }

  function exportGDocsAsText(fileId, mimeType) {
    var downloadUrl = '/api/drive-public?fileId=' + encodeURIComponent(fileId) + '&isDoc=true';
    return fetch(downloadUrl)
      .then(function(res) {
        if (!res.ok) throw new Error('Erro ao exportar Google Doc (HTTP ' + res.status + ')');
        return res.blob();
      });
  }

  // ─── Classificação e Paridade Inteligente de Arquivos ─────────────────────

  function getExtension(name) {
    var lower = (name || '').toLowerCase();
    var idx = lower.lastIndexOf('.');
    return idx !== -1 ? lower.substring(idx) : '';
  }

  function isTextFile(file) {
    if (!file) return false;
    if (file.mimeType === 'application/vnd.google-apps.document') return true;
    return TEXT_EXTS.indexOf(getExtension(file.name)) !== -1;
  }

  function isAudioFile(file) {
    if (!file) return false;
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

    // Áudios sem par de letra (músicas puramente instrumentais ou playback)
    audioFiles.forEach(function(af) {
      var alreadyPaired = pairs.some(function(p) { return p.audioFile === af; });
      if (!alreadyPaired) {
        pairs.push({ textFile: null, audioFile: af, folderName: af.folderName || '' });
      }
    });

    return pairs;
  }

  function autoPairTextAndAudioFiles(files) {
    return autoPairDriveFiles(files);
  }

  function pairSongsWithAudioFiles(parsedSongs, audioFiles) {
    if (!parsedSongs) parsedSongs = [];
    if (!audioFiles) audioFiles = [];

    var pairedSongs = [];
    var matchedAudios = [];

    parsedSongs.forEach(function(song, idx) {
      var baseSongTitle = (song.title || '').trim().toLowerCase();
      var songTrackNum = song.trackNumber;
      var matchedAudio = null;

      // 1. Casamento por número de faixa
      if (songTrackNum !== null && songTrackNum !== undefined) {
        for (var i = 0; i < audioFiles.length; i++) {
          var af = audioFiles[i];
          if (matchedAudios.indexOf(af) === -1) {
            var afNum = extractTrackNumber(af.name);
            if (afNum === songTrackNum) {
              matchedAudio = af;
              matchedAudios.push(af);
              break;
            }
          }
        }
      }

      // 2. Casamento por nome do arquivo
      if (!matchedAudio && baseSongTitle) {
        for (var j = 0; j < audioFiles.length; j++) {
          var af2 = audioFiles[j];
          if (matchedAudios.indexOf(af2) === -1) {
            var baseAudio = af2.name.replace(/\.[^/.]+$/, '').trim().toLowerCase();
            if (baseAudio === baseSongTitle || baseAudio.indexOf(baseSongTitle) !== -1 || baseSongTitle.indexOf(baseAudio) !== -1) {
              matchedAudio = af2;
              matchedAudios.push(af2);
              break;
            }
          }
        }
      }

      pairedSongs.push({
        title: song.title,
        trackNumber: song.trackNumber || (idx + 1),
        key: song.key || '',
        artist: song.artist || '',
        composer: song.composer || '',
        content: song.content || '',
        audioBlob: matchedAudio || null,
        audioName: matchedAudio ? matchedAudio.name : ''
      });
    });

    // Áudios órfãos
    for (var u = 0; u < audioFiles.length; u++) {
      if (matchedAudios.indexOf(audioFiles[u]) === -1) {
        var orphanAudio = audioFiles[u];
        var afNumOrphan = extractTrackNumber(orphanAudio.name) || (parsedSongs.length + u + 1);
        pairedSongs.push({
          title: orphanAudio.name.replace(/\.[^/.]+$/, ''),
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
    extractFileId: extractFileId,
    isGoogleDocUrl: isGoogleDocUrl,
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
