/**
 * PrompterCantor - Controlador da UI do Google Drive (Modo Público + Pasta Local)
 * Permite importar repertórios via Links Públicos do Drive / Docs ou seleção direta de pastas.
 */

var GDriveUI = (function() {

  var _state = {
    driveFiles: [],         // Todos os arquivos encontrados na pasta ou seleção local
    selectedFileIds: {},    // IDs dos arquivos selecionados (chave: id, valor: true)
    folderPairs: [],        // Pares texto+áudio
    importing: false
  };

  // ─── Helpers de UI ─────────────────────────────────────────────────────────

  function setStatus(msg, type) {
    var el = document.getElementById('gdriveAuthStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-text status-' + (type || 'default');
  }

  function setConnectBtn(connected) {
    var btnModal = document.getElementById('btnGDriveConnect');
    var btnHeader = document.getElementById('btnGDriveModal');

    if (btnModal) {
      btnModal.innerHTML = '🌐 Modo Público Ativo (Sem Login)';
      btnModal.className = 'btn btn-gdrive-connected btn-lg';
    }

    if (btnHeader) {
      btnHeader.innerHTML = '<span class="btn-icon">☁️</span> <span class="btn-text">Google Drive</span>';
    }
  }

  function setLoading(msg) {
    var list = document.getElementById('gdriveFilesList');
    if (!list) return;
    list.innerHTML =
      '<div class="gdrive-loading">' +
        '<div class="gdrive-spinner"></div>' +
        '<p>' + (msg || 'Carregando...') + '</p>' +
      '</div>';
  }

  function showError(msg) {
    var list = document.getElementById('gdriveFilesList');
    if (!list) return;
    list.innerHTML =
      '<div class="gdrive-error">' +
        '<span class="gdrive-error-icon">⚠️</span>' +
        '<p>' + escapeHtml(msg) + '</p>' +
      '</div>';
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    var n = parseInt(bytes, 10);
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function getFileIcon(file) {
    if (!file) return '📄';
    if (file.mimeType === 'application/vnd.google-apps.document') return '📝';
    var ext = (file.name || '').toLowerCase().split('.').pop();
    var audioExts = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus', 'webm', 'wma', '3gp'];
    var videoExts = ['mp4', 'mov', 'mkv', 'avi'];
    if (audioExts.indexOf(ext) !== -1) return '🎵';
    if (videoExts.indexOf(ext) !== -1) return '🎬';
    if (ext === 'pdf') return '📕';
    if (ext === 'docx' || ext === 'doc') return '📄';
    if (ext === 'txt') return '📝';
    return '📁';
  }

  // ─── Renderização dos arquivos listados ────────────────────────────────────

  function renderFilesList(pairs) {
    var list = document.getElementById('gdriveFilesList');
    if (!list) return;

    if (!pairs || pairs.length === 0) {
      list.innerHTML =
        '<div class="gdrive-empty-folder">' +
          '<p>Nenhum arquivo de música compatível encontrado.</p>' +
          '<p style="font-size:0.85rem; color:var(--text-muted)">Formatos aceitos: .docx, .doc, .pdf, .txt, Google Docs, .mp3, .m4a, .wav, .aac, etc.</p>' +
        '</div>';
      return;
    }

    _state.selectedFileIds = {};

    // Seleciona todos por padrão
    pairs.forEach(function(pair) {
      if (pair.textFile) _state.selectedFileIds[pair.textFile.id] = true;
      if (pair.audioFile) _state.selectedFileIds[pair.audioFile.id] = true;
    });

    var html = '<div class="gdrive-files-header">' +
      '<span>' + pairs.length + ' música(s) identificada(s)</span>' +
      '<button type="button" id="btnGDriveSelectAll" class="btn btn-outline btn-sm">Selecionar Todos</button>' +
    '</div>';

    pairs.forEach(function(pair, idx) {
      var textFile = pair.textFile;
      var audioFile = pair.audioFile;
      var itemId = 'gdrive-pair-' + idx;
      var isSelected = textFile ? !!_state.selectedFileIds[textFile.id] : false;

      html += '<div class="gdrive-file-item ' + (isSelected ? 'selected' : '') + '" id="' + itemId + '" data-pair-idx="' + idx + '">';
      html +=   '<div class="gdrive-file-check">';
      html +=     '<input type="checkbox" id="chk-' + itemId + '" data-pair-idx="' + idx + '" ' + (isSelected ? 'checked' : '') + '>';
      html +=   '</div>';
      html +=   '<div class="gdrive-file-info">';

      if (textFile) {
        html += '<div class="gdrive-file-row">' +
          '<span class="gdrive-file-icon">' + getFileIcon(textFile) + '</span>' +
          '<span class="gdrive-file-name">' + escapeHtml(textFile.name) + '</span>' +
          (textFile.size ? '<span class="gdrive-file-size">' + formatSize(textFile.size) + '</span>' : '') +
        '</div>';
      }

      if (audioFile) {
        html += '<div class="gdrive-file-row gdrive-audio-row">' +
          '<span class="gdrive-file-icon">' + getFileIcon(audioFile) + '</span>' +
          '<span class="gdrive-file-name">' + escapeHtml(audioFile.name) + '</span>' +
          (audioFile.size ? '<span class="gdrive-file-size">' + formatSize(audioFile.size) + '</span>' : '') +
        '</div>';
      }

      if (!textFile && audioFile) {
        html += '<div class="gdrive-file-row gdrive-audio-row">' +
          '<span class="gdrive-file-icon">' + getFileIcon(audioFile) + '</span>' +
          '<span class="gdrive-file-name">' + escapeHtml(audioFile.name) + '</span>' +
          (audioFile.size ? '<span class="gdrive-file-size">' + formatSize(audioFile.size) + '</span>' : '') +
        '</div>';
      }

      html +=   '</div>';
      html += '</div>';
    });

    list.innerHTML = html;

    // Eventos de checkbox
    var checkboxes = list.querySelectorAll('input[type=checkbox]');
    for (var c = 0; c < checkboxes.length; c++) {
      (function(chk) {
        chk.addEventListener('change', function() {
          var pairIdx = parseInt(chk.getAttribute('data-pair-idx'), 10);
          var pair = _state.folderPairs[pairIdx];
          var itemEl = document.getElementById('gdrive-pair-' + pairIdx);

          if (chk.checked) {
            if (pair.textFile) _state.selectedFileIds[pair.textFile.id] = true;
            if (pair.audioFile) _state.selectedFileIds[pair.audioFile.id] = true;
            if (itemEl) itemEl.classList.add('selected');
          } else {
            if (pair.textFile) delete _state.selectedFileIds[pair.textFile.id];
            if (pair.audioFile) delete _state.selectedFileIds[pair.audioFile.id];
            if (itemEl) itemEl.classList.remove('selected');
          }
          updateImportBtn();
        });
      })(checkboxes[c]);
    }

    // Clique no item inteiro
    var items = list.querySelectorAll('.gdrive-file-item');
    for (var i = 0; i < items.length; i++) {
      (function(itemEl) {
        itemEl.addEventListener('click', function(e) {
          if (e.target.type === 'checkbox') return;
          var chk = itemEl.querySelector('input[type=checkbox]');
          if (chk) { chk.checked = !chk.checked; chk.dispatchEvent(new Event('change')); }
        });
      })(items[i]);
    }

    // Selecionar Todos
    var btnSelectAll = document.getElementById('btnGDriveSelectAll');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', function() {
        var allChecked = checkboxes.length > 0;
        for (var c2 = 0; c2 < checkboxes.length; c2++) {
          if (!checkboxes[c2].checked) { allChecked = false; break; }
        }
        for (var c3 = 0; c3 < checkboxes.length; c3++) {
          checkboxes[c3].checked = !allChecked;
          checkboxes[c3].dispatchEvent(new Event('change'));
        }
      });
    }

    updateImportBtn();
  }

  function updateImportBtn() {
    var btn = document.getElementById('btnImportSelectedGDrive');
    if (!btn) return;
    var count = Object.keys(_state.selectedFileIds).length;
    if (count > 0) {
      btn.removeAttribute('disabled');
      var pairsSelected = _state.folderPairs.filter(function(p) {
        return (p.textFile && _state.selectedFileIds[p.textFile.id]) ||
               (p.audioFile && _state.selectedFileIds[p.audioFile.id]);
      }).length;
      btn.textContent = '⬇️ Importar ' + pairsSelected + ' música(s)';
    } else {
      btn.setAttribute('disabled', 'true');
      btn.textContent = 'Importar Selecionados';
    }
  }

  function flattenTree(treeNode) {
    var allFiles = [];
    if (!treeNode) return allFiles;
    if (Array.isArray(treeNode)) return treeNode;

    function collect(node) {
      if (!node) return;
      if (Array.isArray(node.files) && node.files.length > 0) {
        node.files.forEach(function(f) {
          f.subfolderName = node.folderName || '';
          f.folderPath = node.path || '';
          allFiles.push(f);
        });
      }
      if (Array.isArray(node.subfolders) && node.subfolders.length > 0) {
        node.subfolders.forEach(function(sf) {
          collect(sf);
        });
      }
    }

    collect(treeNode);
    return allFiles;
  }

  // ─── Carregar pasta / link do Drive ────────────────────────────────────────

  function loadFolder() {
    var urlInput = document.getElementById('gdriveFolderUrl');
    var url = urlInput ? urlInput.value.trim() : '';

    if (!url) {
      showError('Por favor, cole o link público de uma pasta do Google Drive ou Google Docs.');
      return;
    }

    setLoading('Conectando ao Google Drive e buscando arquivos...');

    GDriveImporter.listFilesInFolder(url, function(count) {
      setLoading('Escaneando pasta... (' + count + ' arquivos encontrados)');
    }).then(function(treeResult) {
      var allFiles = flattenTree(treeResult);
      _state.driveFiles = allFiles;
      _state.folderPairs = GDriveImporter.autoPairDriveFiles(allFiles);
      renderFilesList(_state.folderPairs);
    }).catch(function(err) {
      console.error('Erro ao listar pasta:', err);
      var msg = err.message || 'Erro ao acessar pasta do Drive.';
      if (msg.indexOf('403') !== -1 || msg.indexOf('401') !== -1) {
        msg = 'Sem permissão para acessar esta pasta. Certifique-se de que ela está configurada como "Qualquer pessoa com o link pode ver".';
      } else if (msg.indexOf('404') !== -1) {
        msg = 'Pasta não encontrada. Verifique o link fornecido.';
      }
      showError(msg);
    });
  }

  // ─── Carregar arquivos / pasta local do dispositivo ────────────────────────

  function handleLocalFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    setLoading('Processando ' + fileList.length + ' arquivos selecionados...');

    var descriptors = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      // Ignora arquivos de sistema
      if (f.name.startsWith('.') || f.name.startsWith('~')) continue;

      var relPath = f.webkitRelativePath || f.name;
      var pathParts = relPath.split('/');
      var subfolder = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';

      descriptors.push({
        id: 'local_' + i + '_' + encodeURIComponent(f.name),
        name: f.name,
        mimeType: f.type || 'application/octet-stream',
        size: f.size,
        subfolderName: subfolder,
        folderPath: subfolder,
        rawFile: f
      });
    }

    _state.driveFiles = descriptors;
    _state.folderPairs = GDriveImporter.autoPairDriveFiles(descriptors);
    renderFilesList(_state.folderPairs);
  }

  // ─── Importação em Streaming (com progresso em 2º plano) ───────────────────

  function importSelected(onSongBatchDownloaded, onProgress, onComplete) {
    if (_state.importing) return;

    var selectedPairs = _state.folderPairs.filter(function(p) {
      return (p.textFile && _state.selectedFileIds[p.textFile.id]) ||
             (!p.textFile && p.audioFile && _state.selectedFileIds[p.audioFile.id]);
    });

    if (selectedPairs.length === 0) return;

    _state.importing = true;

    // FECHA O MODAL IMEDIATAMENTE (Streaming em background)
    var modalEl = document.getElementById('gDriveModal');
    if (modalEl) modalEl.classList.add('hidden');

    var totalPairs = selectedPairs.length;
    var pairIdx = 0;

    function processNext() {
      if (pairIdx >= totalPairs) {
        _state.importing = false;
        if (onComplete) onComplete(totalPairs);
        return;
      }

      var pair = selectedPairs[pairIdx++];
      var currentNum = pairIdx;

      if (onProgress) onProgress(currentNum, totalPairs);

      var subfolder = pair.folderName || (pair.textFile && pair.textFile.subfolderName) || (pair.audioFile && pair.audioFile.subfolderName) || '';

      var downloadPromise;
      var createdSongs = [];

      if (pair.textFile) {
        var tf = pair.textFile;
        var isGDoc = tf.mimeType === 'application/vnd.google-apps.document';

        var getBlobPromise;
        if (tf.rawFile) {
          getBlobPromise = Promise.resolve(tf.rawFile);
        } else if (isGDoc) {
          getBlobPromise = GDriveImporter.exportGDocsAsText(tf.id, tf.mimeType);
        } else {
          getBlobPromise = GDriveImporter.downloadFileAsBlob(tf.id, tf.mimeType);
        }

        downloadPromise = getBlobPromise.then(function(blob) {
          var ext = isGDoc ? '.txt' : tf.name.substring(tf.name.lastIndexOf('.'));
          var fileName = isGDoc ? (tf.name + '.txt') : tf.name;
          var file = (blob instanceof File) ? blob : new File([blob], fileName, { type: blob.type || 'text/plain' });

          return window.TextParser.parseFile(file).then(function(parsedSongs) {
            for (var j = 0; j < parsedSongs.length; j++) {
              var ps = parsedSongs[j];
              createdSongs.push({
                title: ps.title,
                key: ps.key,
                artist: ps.artist,
                composer: ps.composer,
                content: ps.content,
                audioBlob: null,
                audioName: '',
                subfolderName: subfolder
              });
            }

            if (pair.audioFile && _state.selectedFileIds[pair.audioFile.id]) {
              var audioPromise = pair.audioFile.rawFile
                ? Promise.resolve(pair.audioFile.rawFile)
                : GDriveImporter.downloadFileAsBlob(pair.audioFile.id, pair.audioFile.mimeType);

              return audioPromise.then(function(audioBlob) {
                if (createdSongs.length > 0 && audioBlob) {
                  createdSongs[0].audioBlob = (audioBlob instanceof File) ? audioBlob : new File([audioBlob], pair.audioFile.name, { type: audioBlob.type || 'audio/mpeg' });
                  createdSongs[0].audioName = pair.audioFile.name;
                }
              }).catch(function(e) { console.warn('Erro ao carregar áudio:', e); });
            }
          });
        });

      } else if (pair.audioFile) {
        var audioOnlyPromise = pair.audioFile.rawFile
          ? Promise.resolve(pair.audioFile.rawFile)
          : GDriveImporter.downloadFileAsBlob(pair.audioFile.id, pair.audioFile.mimeType);

        downloadPromise = audioOnlyPromise.then(function(audioBlob) {
          createdSongs.push({
            title: window.TextParser ? window.TextParser.cleanFilename(pair.audioFile.name) : pair.audioFile.name.replace(/\.[^/.]+$/, ''),
            key: '', artist: '', composer: '',
            content: '(Apenas áudio guia gravado)',
            audioBlob: (audioBlob instanceof File) ? audioBlob : new File([audioBlob], pair.audioFile.name, { type: audioBlob.type || 'audio/mpeg' }),
            audioName: pair.audioFile.name,
            subfolderName: subfolder
          });
        });
      } else {
        processNext();
        return;
      }

      downloadPromise
        .then(function() {
          if (createdSongs.length > 0 && onSongBatchDownloaded) {
            onSongBatchDownloaded(createdSongs, currentNum, totalPairs);
          }
          processNext();
        })
        .catch(function(err) {
          console.error('Erro ao processar par de arquivos:', err);
          processNext();
        });
    }

    processNext();
  }

  // ─── Inicialização ─────────────────────────────────────────────────────────

  function init(callbacks) {
    var onBatch = typeof callbacks === 'function' ? null : (callbacks && callbacks.onBatch);
    var onProgress = callbacks && callbacks.onProgress;
    var onComplete = callbacks && callbacks.onComplete;
    var legacyCallback = typeof callbacks === 'function' ? callbacks : null;

    // Botão abrir pasta no Drive
    var btnOpenDrive = document.getElementById('btnOpenDrivePreset');
    if (btnOpenDrive) {
      btnOpenDrive.addEventListener('click', function() {
        var urlInput = document.getElementById('gdriveFolderUrl');
        var url = (urlInput && urlInput.value.trim()) || 'https://drive.google.com/drive';
        window.open(url, '_blank');
      });
    }

    // Campo de URL da pasta
    var urlInput = document.getElementById('gdriveFolderUrl');
    if (urlInput) {
      urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          loadFolder();
        }
      });
    }

    // Botão de carregar link do Drive
    var btnLoadFolder = document.getElementById('btnLoadGDriveFolder');
    if (btnLoadFolder) {
      btnLoadFolder.addEventListener('click', function() {
        loadFolder();
      });
    }

    // Opção 2: Selecionar Pasta Local / Drive Sincronizado
    var btnPickFolder = document.getElementById('btnPickDriveLocalFolder');
    var inputLocalFolder = document.getElementById('gdriveLocalFolderInput');
    if (btnPickFolder && inputLocalFolder) {
      btnPickFolder.addEventListener('click', function() {
        inputLocalFolder.click();
      });
      inputLocalFolder.addEventListener('change', function() {
        if (this.files && this.files.length > 0) {
          handleLocalFiles(this.files);
        }
      });
    }

    // Opção 2: Selecionar Arquivos Avulsos
    var btnPickFiles = document.getElementById('btnPickDriveLocalFiles');
    var inputLocalFiles = document.getElementById('gdriveLocalFilesInput');
    if (btnPickFiles && inputLocalFiles) {
      btnPickFiles.addEventListener('click', function() {
        inputLocalFiles.click();
      });
      inputLocalFiles.addEventListener('change', function() {
        if (this.files && this.files.length > 0) {
          handleLocalFiles(this.files);
        }
      });
    }

    // Botão importar selecionados
    var btnImport = document.getElementById('btnImportSelectedGDrive');
    if (btnImport) {
      btnImport.addEventListener('click', function() {
        importSelected(
          onBatch || legacyCallback,
          onProgress,
          onComplete
        );
      });
    }

    // Estado inicial
    setStatus('Modo público ativo (sem login)', 'success');
  }

  return {
    init: init,
    loadFolder: loadFolder,
    renderFilesList: renderFilesList
  };

})();

window.GDriveUI = GDriveUI;
