/**
 * PrompterCantor - Módulo Principal da Aplicação (App Controller)
 * v2: Sistema de Repertórios por importação, com gerenciamento de músicas
 * Compatível com navegadores antigos (Safari do iOS 9/10/11/12 em iPads antigos).
 */

document.addEventListener('DOMContentLoaded', function () {

  // ═══════════════════════════════════════
  //  ESTADO GLOBAL
  // ═══════════════════════════════════════

  var state = {
    repertoires: [],
    currentRepertoire: null,    // Repertório atualmente aberto
    currentRepertoireSongs: [], // Músicas do repertório aberto
    pendingImportSongs: [],
    searchQuery: '',
    editingSong: null,          // Música sendo editada
    targetRepertoireId: null    // Para "adicionar ao repertório X"
  };

  // ═══════════════════════════════════════
  //  REFERÊNCIAS DOM
  // ═══════════════════════════════════════

  var repertoiresListEl = document.getElementById('repertoiresList');
  var searchInput = document.getElementById('searchInput');
  var btnClearSearch = document.getElementById('btnClearSearch');

  // Modais
  var importModal = document.getElementById('importModal');
  var gDriveModal = document.getElementById('gDriveModal');
  var songEditorModal = document.getElementById('songEditorModal');

  // ═══════════════════════════════════════
  //  INICIALIZAÇÃO
  // ═══════════════════════════════════════

  if (window.Prompter) Prompter.init();
  if (window.MediaPlayer) MediaPlayer.init();
  if (window.AdvancedPlayer) AdvancedPlayer.init();
  initAuthAndAdminUI();

  ensureSambaRepertoireExists()
    .then(function() {
      return loadRepertoires();
    })
    .then(function() {
      restoreActiveState();
      if (window.PrompterCloud) {
        PrompterCloud.initRealtimeListeners(function(table, payload) {
          if (state.currentRepertoire) {
            PrompterDB.getSongsByRepertoire(state.currentRepertoire.id).then(function (songs) {
              state.currentRepertoireSongs = songs || [];
              renderSongsList(state.currentRepertoireSongs);
            });
          } else {
            loadRepertoires();
          }
        });
      }
    })
    .catch(function (err) {
      console.error('Erro ao inicializar app:', err);
      showToast('Aviso ao carregar dados do Supabase.', 'warning');
    });

  // Clique no Badge de Nuvem para atualizar imediatamente
  var syncBadgeEl = document.getElementById('supabaseSyncBadge');
  if (syncBadgeEl) {
    syncBadgeEl.style.cursor = 'pointer';
    syncBadgeEl.addEventListener('click', function () {
      showToast('⚡ Conectado diretamente à nuvem Supabase.', 'info');
      loadRepertoires();
    });
  }

  // Atualizar dados ao alternar para a aba
  window.addEventListener('focus', function () {
    if (state.currentRepertoire) {
      PrompterDB.getSongsByRepertoire(state.currentRepertoire.id).then(function (songs) {
        state.currentRepertoireSongs = songs || [];
        renderSongsList(state.currentRepertoireSongs);
      });
    } else {
      loadRepertoires();
    }
  });

  setupEventListeners();

  if (window.GDriveUI) {
    GDriveUI.init({
      onBatch: function (songsBatch, currentNum, totalNum) {
        onDriveStreamBatch(songsBatch);
      },
      onProgress: function (currentNum, totalNum) {
        updateImportBanner(currentNum, totalNum);
      },
      onComplete: function (totalNum) {
        finishImportBanner(totalNum);
      }
    });
  }

  // ═══════════════════════════════════════
  //  INICIALIZAÇÃO E MIGRAÇÃO DE REPERTÓRIOS
  // ═══════════════════════════════════════

  function ensureSambaRepertoireExists() {
    var user = (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
    var userEmail = user ? (user.email || '').toLowerCase() : '';
    if (user && userEmail !== 'leovitulli@gmail.com') return Promise.resolve();

    return PrompterDB.getAllRepertoires().then(function (reps) {
      var sambaRep = null;
      if (reps && reps.length > 0) {
        for (var i = 0; i < reps.length; i++) {
          if (reps[i].name === 'SAMBA') {
            sambaRep = reps[i];
            break;
          }
        }
      }

      if (sambaRep) {
        // Verificar se tem músicas no SAMBA
        return PrompterDB.getSongsByRepertoire(sambaRep.id).then(function (songs) {
          if ((!songs || songs.length === 0) && window.TextParser && window.SAMPLE_REPERTOIRE_TEXT) {
            console.log('🎶 Populando as 27 músicas do SAMBA no Supabase...');
            var sampleSongs = TextParser.splitMultipleSongs(window.SAMPLE_REPERTOIRE_TEXT, 'Repertório Principal.txt');
            for (var s = 0; s < sampleSongs.length; s++) {
              sampleSongs[s].repertoireId = sambaRep.id;
              sampleSongs[s].trackNumber = s + 1;
            }
            return PrompterDB.saveSongsBatch(sampleSongs);
          }
        });
      } else if (window.TextParser && window.SAMPLE_REPERTOIRE_TEXT) {
        console.log('🎶 Criando repertório SAMBA no Supabase...');
        var sampleSongs = TextParser.splitMultipleSongs(window.SAMPLE_REPERTOIRE_TEXT, 'Repertório Principal.txt');
        return PrompterDB.saveRepertoire({ 
          name: 'SAMBA', 
          source: 'sample' 
        }).then(function (newRepId) {
          for (var s = 0; s < sampleSongs.length; s++) {
            sampleSongs[s].repertoireId = newRepId;
            sampleSongs[s].trackNumber = s + 1;
          }
          return PrompterDB.saveSongsBatch(sampleSongs);
        });
      }
    });
  }

  // ═══════════════════════════════════════
  //  CARREGAMENTO DE REPERTÓRIOS
  // ═══════════════════════════════════════

  function loadRepertoires() {
    var mainView = document.getElementById('mainRepertoireView');
    var songsView = document.getElementById('repertoireSongsView');
    var prompterView = document.getElementById('prompterView');

    // Se estiver no Prompter ou com música aberta, não alterar a visibilidade da tela
    var isPrompterActive = state.currentSong || (prompterView && prompterView.style.display === 'flex' && !prompterView.classList.contains('hidden'));

    if (!state.currentRepertoire && !isPrompterActive) {
      if (mainView) mainView.classList.remove('hidden');
      if (songsView) songsView.classList.add('hidden');
    }

    return PrompterDB.getAllRepertoires().then(function (reps) {
      state.repertoires = reps || [];
      renderRepertoires();
    });
  }

  function promptCreateRepertoire() {
    var now = new Date();
    var dd = String(now.getDate()).padStart(2, '0');
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var defaultName = 'Novo Repertório ' + dd + '/' + mm;

    var name = prompt('Digite o nome do novo Repertório:', defaultName);
    if (name && name.trim()) {
      var repName = name.trim();
      PrompterDB.saveRepertoire({ name: repName, source: 'manual' }).then(function (newId) {
        showToast('Repertório "' + repName + '" criado com sucesso!', 'success');
        return loadRepertoires().then(function () {
          openRepertoireSongsView(newId);
        });
      }).catch(function (err) {
        console.error('Erro ao criar repertório:', err);
        showToast('Erro ao criar repertório.', 'warning');
      });
    }
  }

  // ═══════════════════════════════════════
  //  RENDER: TELA PRINCIPAL (cards de repertório)
  // ═══════════════════════════════════════

  function normalizeSearch(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function renderRepertoires() {
    var filtered = state.repertoires;

    // Filtro de busca global sem distinção de acentos/maiúsculas
    if (state.searchQuery) {
      var q = normalizeSearch(state.searchQuery);
      filtered = filtered.filter(function (r) {
        return r.name && normalizeSearch(r.name).indexOf(q) !== -1;
      });
    }

    if (!repertoiresListEl) return;

    if (!state.repertoires || state.repertoires.length === 0) {
      var user = (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
      var isOwner = (user && user.email === 'leovitulli@gmail.com') || (window.PrompterAuth && window.PrompterAuth.isAdmin());
      var sampleBtnHtml = isOwner
        ? '<button id="btnEmptySample" class="btn btn-outline btn-lg">🎶 Restaurar SAMBA (27 Músicas)</button>'
        : '';

      repertoiresListEl.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-icon">🎵</div>' +
        '<h2>Nenhum repertório ainda</h2>' +
        '<p>Importe músicas do seu computador ou Google Drive para criar seu primeiro repertório.</p>' +
        '<div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem;">' +
        '<button id="btnEmptyImport" class="btn btn-primary btn-lg">📂 Importar Arquivos</button>' +
        '<button id="btnEmptyGDrive" class="btn btn-gdrive btn-lg">☁️ Google Drive</button>' +
        sampleBtnHtml +
        '</div>' +
        '</div>';

      var bEI = document.getElementById('btnEmptyImport');
      if (bEI) bEI.addEventListener('click', function () { openModal(importModal); });
      var bEG = document.getElementById('btnEmptyGDrive');
      if (bEG) bEG.addEventListener('click', function () { openModal(gDriveModal); });
      var bES = document.getElementById('btnEmptySample');
      if (bES) bES.addEventListener('click', function () {
        if (window.TextParser && window.SAMPLE_REPERTOIRE_TEXT) {
          var sampleSongs = TextParser.splitMultipleSongs(window.SAMPLE_REPERTOIRE_TEXT, 'Repertório Principal.txt');
          PrompterDB.saveRepertoire({ name: 'SAMBA', source: 'sample' })
            .then(function (newRepId) {
              for (var s = 0; s < sampleSongs.length; s++) {
                sampleSongs[s].repertoireId = newRepId;
                sampleSongs[s].trackNumber = s + 1;
              }
              return PrompterDB.saveSongsBatch(sampleSongs);
            })
            .then(function () {
              showToast('Repertório SAMBA restaurado com sucesso!', 'success');
              loadRepertoires();
            });
        }
      });
      return;
    }

    // Renderizar HTML dos cards com badge unificado e consistente
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var rep = filtered[i];
      var sourceClass = (rep.source === 'sample' || rep.source === 'local') ? 'local' : (rep.source || 'local');
      var sourceIcon = rep.source === 'gdrive' ? '☁️' : rep.source === 'manual' ? '✏️' : '📁';
      var sourceLabel = rep.source === 'gdrive' ? 'Google Drive' : rep.source === 'manual' ? 'Criado Manual' : 'Importação Local';
      var dateStr = formatDate(rep.createdAt);
      var repId = rep.id;

      html +=
        '<div class="repertoire-card" data-rep-id="' + repId + '" draggable="true" data-rep-index="' + i + '">' +
        '<div class="rep-card-header">' +
        '<div style="display:flex;align-items:center;gap:0.5rem;">' +
        '<span class="rep-drag-handle" title="Segure para arrastar e reordenar">⋮⋮</span>' +
        '<div class="rep-source-badge rep-source-' + sourceClass + '">' + sourceIcon + ' ' + sourceLabel + '</div>' +
        '</div>' +
        '<div class="rep-card-actions-top">' +
        '<button class="btn-icon-sm btn-move-rep-left" data-rep-id="' + repId + '" title="Mover para a esquerda (anterior)">◀</button>' +
        '<button class="btn-icon-sm btn-move-rep-right" data-rep-id="' + repId + '" title="Mover para a direita (próximo)">▶</button>' +
        '<button class="btn-icon-sm btn-print-rep" data-rep-id="' + repId + '" title="Imprimir Repertório">🖨️</button>' +
        '<button class="btn-icon-sm btn-delete-rep" data-rep-id="' + repId + '" title="Excluir Repertório">🗑️</button>' +
        '</div>' +
        '</div>' +
        '<div class="rep-card-body">' +
        '<h3 class="rep-card-title" id="rep-title-' + repId + '">' + escapeHtml(rep.name) + '</h3>' +
        '<div class="rep-card-meta">' +
        '<span class="rep-song-count" id="rep-count-' + repId + '">... músicas</span>' +
        '<span class="rep-date">' + dateStr + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="rep-card-footer">' +
        '<button class="btn btn-primary btn-sm btn-open-rep" data-rep-id="' + repId + '">🎵 Ver Músicas</button>' +
        '<button class="btn btn-outline btn-sm btn-rename-rep" data-rep-id="' + repId + '">✏️ Renomear</button>' +
        '</div>' +
        '</div>';
    }

    repertoiresListEl.innerHTML = html;
    bindRepertoireCardEvents();

    // Atualizar contagens assincronamente sem bloquear a renderização dos cards
    filtered.forEach(function (rep) {
      PrompterDB.countSongsByRepertoire(rep.id).then(function (count) {
        var countEl = document.getElementById('rep-count-' + rep.id);
        if (countEl) {
          countEl.textContent = count + ' música' + (count !== 1 ? 's' : '');
        }
      }).catch(function () { });
    });
  }

  function bindRepertoireCardEvents() {
    var dragSrcCard = null;
    var cards = document.querySelectorAll('.repertoire-card');

    // Drag-and-Drop nos cards do Repertório
    for (var c = 0; c < cards.length; c++) {
      (function (card) {
        card.addEventListener('dragstart', function (e) {
          dragSrcCard = card;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.getAttribute('data-rep-id'));
          card.classList.add('dragging');
        });

        card.addEventListener('dragover', function (e) {
          if (e.preventDefault) e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          return false;
        });

        card.addEventListener('dragenter', function (e) {
          if (card !== dragSrcCard) card.classList.add('drag-over');
        });

        card.addEventListener('dragleave', function (e) {
          card.classList.remove('drag-over');
        });

        card.addEventListener('drop', function (e) {
          if (e.stopPropagation) e.stopPropagation();
          card.classList.remove('drag-over');
          if (dragSrcCard && dragSrcCard !== card) {
            var srcId = dragSrcCard.getAttribute('data-rep-id');
            var targetId = card.getAttribute('data-rep-id');

            var fromIdx = -1;
            var toIdx = -1;
            for (var i = 0; i < state.repertoires.length; i++) {
              if (String(state.repertoires[i].id) === String(srcId)) fromIdx = i;
              if (String(state.repertoires[i].id) === String(targetId)) toIdx = i;
            }

            if (fromIdx !== -1 && toIdx !== -1) {
              var moved = state.repertoires.splice(fromIdx, 1)[0];
              state.repertoires.splice(toIdx, 0, moved);

              var orderIds = state.repertoires.map(function (r) { return r.id; });
              PrompterDB.saveRepertoiresOrder(orderIds).then(function () {
                renderRepertoires();
                showToast('Ordem dos repertórios salva!', 'success');
              });
            }
          }
          return false;
        });

        card.addEventListener('dragend', function () {
          card.classList.remove('dragging');
          var allCards = document.querySelectorAll('.repertoire-card');
          for (var k = 0; k < allCards.length; k++) allCards[k].classList.remove('drag-over');
        });

        // Clique no card inteiro também abre (exceto se clicou nos botões ou drag handle)
        card.addEventListener('click', function (e) {
          if (e.target.closest('.btn-icon-sm') || e.target.closest('.btn') || e.target.closest('.rep-drag-handle')) return;
          openRepertoireSongs(card.getAttribute('data-rep-id'));
        });
      })(cards[c]);
    }

    // Botões de mover para a esquerda
    var moveLeftBtns = document.querySelectorAll('.btn-move-rep-left');
    for (var ml = 0; ml < moveLeftBtns.length; ml++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-rep-id');
          var idx = -1;
          for (var i = 0; i < state.repertoires.length; i++) {
            if (String(state.repertoires[i].id) === String(id)) { idx = i; break; }
          }
          if (idx > 0) {
            var temp = state.repertoires[idx];
            state.repertoires[idx] = state.repertoires[idx - 1];
            state.repertoires[idx - 1] = temp;
            var orderIds = state.repertoires.map(function (r) { return r.id; });
            PrompterDB.saveRepertoiresOrder(orderIds).then(function () {
              renderRepertoires();
              showToast('Ordem atualizada!', 'success');
            });
          }
        });
      })(moveLeftBtns[ml]);
    }

    // Botões de mover para a direita
    var moveRightBtns = document.querySelectorAll('.btn-move-rep-right');
    for (var mr = 0; mr < moveRightBtns.length; mr++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-rep-id');
          var idx = -1;
          for (var i = 0; i < state.repertoires.length; i++) {
            if (String(state.repertoires[i].id) === String(id)) { idx = i; break; }
          }
          if (idx !== -1 && idx < state.repertoires.length - 1) {
            var temp = state.repertoires[idx];
            state.repertoires[idx] = state.repertoires[idx + 1];
            state.repertoires[idx + 1] = temp;
            var orderIds = state.repertoires.map(function (r) { return r.id; });
            PrompterDB.saveRepertoiresOrder(orderIds).then(function () {
              renderRepertoires();
              showToast('Ordem atualizada!', 'success');
            });
          }
        });
      })(moveRightBtns[mr]);
    }

    // Abrir repertório
    var openBtns = document.querySelectorAll('.btn-open-rep');
    for (var i = 0; i < openBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          openRepertoireSongs(btn.getAttribute('data-rep-id'));
        });
      })(openBtns[i]);
    }

    // Imprimir
    var printBtns = document.querySelectorAll('.btn-print-rep');
    for (var p = 0; p < printBtns.length; p++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          printRepertoire(btn.getAttribute('data-rep-id'));
        });
      })(printBtns[p]);
    }

    // Excluir
    var deleteBtns = document.querySelectorAll('.btn-delete-rep');
    for (var d = 0; d < deleteBtns.length; d++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          confirmDeleteRepertoire(btn.getAttribute('data-rep-id'));
        });
      })(deleteBtns[d]);
    }

    // Renomear
    var renameBtns = document.querySelectorAll('.btn-rename-rep');
    for (var r = 0; r < renameBtns.length; r++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          renameRepertoire(btn.getAttribute('data-rep-id'));
        });
      })(renameBtns[r]);
    }

    // Toggle Offline Repertório
    var repOfflineBtns = document.querySelectorAll('.btn-toggle-rep-offline');
    for (var ro = 0; ro < repOfflineBtns.length; ro++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var repId = btn.getAttribute('data-rep-id');
          var isCurrentlyPinned = btn.classList.contains('pinned');
          PrompterDB.toggleRepertoireOffline(repId, !isCurrentlyPinned).then(function (newState) {
            showToast(newState ? '⚡ Repertório salvo offline para uso no palco!' : '⚡ Repertório removido do modo offline', newState ? 'success' : 'info');
            loadRepertoiresGrid();
          });
        });
      })(repOfflineBtns[ro]);
    }
  }

  // ═══════════════════════════════════════
  //  TELA INTERNA: MÚSICAS DO REPERTÓRIO
  // ═══════════════════════════════════════

  function openRepertoireSongs(repId) {
    PrompterDB.getRepertoireById(repId).then(function (rep) {
      if (!rep && state.repertoires) {
        for (var i = 0; i < state.repertoires.length; i++) {
          if (state.repertoires[i].id === repId) {
            rep = state.repertoires[i];
            break;
          }
        }
      }
      if (!rep) {
        showToast('Repertório não encontrado.', 'warning');
        return;
      }
      state.currentRepertoire = rep;

      return PrompterDB.getSongsByRepertoire(rep.id).then(function (songs) {
        if ((!songs || songs.length === 0) && rep.name === 'SAMBA' && window.TextParser && window.SAMPLE_REPERTOIRE_TEXT) {
          var sampleSongs = TextParser.splitMultipleSongs(window.SAMPLE_REPERTOIRE_TEXT, 'Repertório Principal.txt');
          for (var s = 0; s < sampleSongs.length; s++) {
            sampleSongs[s].repertoireId = rep.id;
            sampleSongs[s].trackNumber = s + 1;
          }
          return PrompterDB.saveSongsBatch(sampleSongs).then(function () {
            return PrompterDB.getSongsByRepertoire(rep.id);
          }).then(function (loadedSongs) {
            state.currentRepertoireSongs = loadedSongs || [];
            showRepertoireSongsView(rep, state.currentRepertoireSongs);
          });
        }
        state.currentRepertoireSongs = songs || [];
        showRepertoireSongsView(rep, state.currentRepertoireSongs);
      });
    }).catch(function (err) {
      console.error('Erro ao abrir repertório:', err);
      showToast('Erro ao carregar repertório.', 'warning');
    });
  }

  function showRepertoireSongsView(rep, songs) {
    var mainView = document.getElementById('mainRepertoireView');
    var songsView = document.getElementById('repertoireSongsView');

    if (mainView) mainView.classList.add('hidden');
    if (songsView) songsView.classList.remove('hidden');

    // Atualizar cabeçalho da tela interna
    var titleEl = document.getElementById('rsvTitle');
    var countEl = document.getElementById('rsvCount');
    if (titleEl) titleEl.textContent = rep.name;
    if (countEl) countEl.textContent = songs.length + ' música' + (songs.length !== 1 ? 's' : '');

    var btnOfflineHeader = document.getElementById('btnToggleRepOfflineHeader');
    var txtOfflineHeader = document.getElementById('rsvOfflineText');
    if (btnOfflineHeader) {
      if (rep.isOfflinePinned) {
        btnOfflineHeader.classList.add('pinned');
        if (txtOfflineHeader) txtOfflineHeader.textContent = 'Offline Ready ⚡';
      } else {
        btnOfflineHeader.classList.remove('pinned');
        if (txtOfflineHeader) txtOfflineHeader.textContent = 'Baixar Offline';
      }

      btnOfflineHeader.onclick = function () {
        var isCurrentlyPinned = rep.isOfflinePinned;
        PrompterDB.toggleRepertoireOffline(rep.id, !isCurrentlyPinned).then(function (newState) {
          rep.isOfflinePinned = newState;
          showToast(newState ? '⚡ Repertório salvo offline para uso no palco!' : '⚡ Repertório removido do modo offline', newState ? 'success' : 'info');
          openRepertoireSongs(rep.id);
        });
      };
    }

    renderSongsList(songs);
    saveActiveState('repertoire', { repertoireId: rep.id });
  }

  function resetActiveState() {
    closeYoutubeModal();
    if (typeof closeSpotifyModal === 'function') closeSpotifyModal();
    state.currentRepertoire = null;
    state.currentSong = null;
    state.currentRepertoireSongs = [];
    state.targetRepertoireId = null;
    state.repertoires = [];
    saveActiveState('main', {});
    var mainView = document.getElementById('mainRepertoireView');
    var songsView = document.getElementById('repertoireSongsView');
    var prompterView = document.getElementById('prompterView');
    if (mainView) mainView.classList.remove('hidden');
    if (songsView) songsView.classList.add('hidden');
    if (prompterView) {
      prompterView.style.display = 'none';
      prompterView.classList.add('hidden');
    }
  }

  window.CantaApp = {
    resetActiveState: resetActiveState,
    loadRepertoires: loadRepertoires
  };

  function closeRepertoireSongsView() {
    resetActiveState();
    loadRepertoires();
  }

  function renderSongsList(songs) {
    var listEl = document.getElementById('rsvSongsList');
    if (!listEl) return;

    if (songs.length === 0) {
      listEl.innerHTML =
        '<div class="songs-list-empty">' +
        '<p>Nenhuma música neste repertório.</p>' +
        '<p>Clique em <b>+ Importar Arquivo</b> ou <b>✏️ Nova Música</b> para começar.</p>' +
        '</div>';
      return;
    }

    var html = '<div class="songs-list-table">';
    for (var i = 0; i < songs.length; i++) {
      var song = songs[i];
      var preview = getFirstTwoLines(song.content);
      var displayTitle = (song.title || 'Sem Título').toUpperCase();
      var trackNum = (song.trackNumber || (i + 1));
      var trackNumStr = trackNum < 10 ? '0' + trackNum : '' + trackNum;

      var metaParts = [];
      if (song.artist) metaParts.push('🎤 ' + escapeHtml(song.artist));
      if (song.composer) metaParts.push('✍️ ' + escapeHtml(song.composer));
      if (preview) metaParts.push('💬 ' + escapeHtml(preview));

      html +=
        '<div class="song-list-row" data-song-id="' + song.id + '" draggable="true" title="Clique para abrir no Prompter">' +
          '<div class="song-drag-handle" title="Arraste para reposicionar">⋮⋮</div>' +
          '<div class="song-row-number">' + trackNumStr + '</div>' +
          '<div class="song-row-main">' +
            '<div class="song-row-title-line">' +
              '<span class="song-row-title">' + escapeHtml(displayTitle) + '</span>' +
              (song.key ? '<span class="badge badge-key song-row-key" title="Tom de Cantar">' + escapeHtml(song.key) + '</span>' : '<span class="badge badge-nokey">S/Tom</span>') +
              (song.rhythm ? '<span class="badge badge-rhythm" title="Toque / Ritmo">🥁 ' + escapeHtml(song.rhythm) + '</span>' : '') +
              (song.isOfflinePinned ? '<span class="badge badge-offline-mini" title="Salva offline">⚡</span>' : '') +
              (song.youtubeUrl ? '<span class="badge badge-yt-mini" title="Vídeo no YouTube">▶ Vídeo</span>' : '') +
              (song.audioBlob || song.audioUrl ? '<span class="song-audio-dot" title="Tem áudio guia local">🎵</span>' : '') +
            '</div>' +
            (metaParts.length > 0 ? '<div class="song-row-meta">' + metaParts.join(' <span class="meta-sep">•</span> ') + '</div>' : '') +
          '</div>' +
          '<div class="song-row-actions">' +
            '<button class="btn-icon-action btn-move-up" data-song-id="' + song.id + '" title="Mover para Cima">⬆️</button>' +
            '<button class="btn-icon-action btn-move-down" data-song-id="' + song.id + '" title="Mover para Baixo">⬇️</button>' +
            '<button class="btn-icon-action btn-edit-song" data-song-id="' + song.id + '" title="Editar Música">✏️</button>' +
            '<button class="btn-icon-action btn-delete-song" data-song-id="' + song.id + '" title="Excluir Música">🗑️</button>' +
          '</div>' +
        '</div>';
    }
    html += '</div>';
    listEl.innerHTML = html;

    // Bind Drag & Drop e Touch para Reordenar Músicas em Celulares, Tablets e Desktop
    var draggedRow = null;
    var allRows = listEl.querySelectorAll('.song-list-row');
    for (var dr = 0; dr < allRows.length; dr++) {
      (function (row) {
        // Drag HTML5 para Mouse / Desktop
        row.addEventListener('dragstart', function (e) {
          draggedRow = row;
          row.classList.add('dragging');
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragover', function (e) {
          if (e.preventDefault) e.preventDefault();
          if (row !== draggedRow) row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', function () {
          row.classList.remove('drag-over');
        });
        row.addEventListener('drop', function (e) {
          if (e.preventDefault) e.preventDefault();
          row.classList.remove('drag-over');
          if (draggedRow && draggedRow !== row) {
            var parent = row.parentNode;
            var rowsArr = Array.prototype.slice.call(parent.querySelectorAll('.song-list-row'));
            var fromIdx = rowsArr.indexOf(draggedRow);
            var toIdx = rowsArr.indexOf(row);

            if (fromIdx !== -1 && toIdx !== -1) {
              var movedSong = state.currentRepertoireSongs.splice(fromIdx, 1)[0];
              state.currentRepertoireSongs.splice(toIdx, 0, movedSong);
              for (var s = 0; s < state.currentRepertoireSongs.length; s++) {
                state.currentRepertoireSongs[s].trackNumber = s + 1;
                state.currentRepertoireSongs[s].order = s + 1;
              }
              PrompterDB.saveSongsBatch(state.currentRepertoireSongs).then(function () {
                renderSongsList(state.currentRepertoireSongs);
                showToast('Ordem salva no banco!', 'success');
              });
            }
          }
        });
        row.addEventListener('dragend', function () {
          row.classList.remove('dragging');
          var overs = listEl.querySelectorAll('.drag-over');
          for (var o = 0; o < overs.length; o++) overs[o].classList.remove('drag-over');
        });

        // Suporte a Touch Drag em Tablets e Smartphones
        var touchStartY = 0;
        var handle = row.querySelector('.song-drag-handle');
        if (handle) {
          handle.addEventListener('touchstart', function(e) {
            if (e.touches && e.touches[0]) {
              touchStartY = e.touches[0].clientY;
              row.classList.add('dragging');
            }
          }, false);

          handle.addEventListener('touchend', function(e) {
            row.classList.remove('dragging');
            if (e.changedTouches && e.changedTouches[0]) {
              var touchEndY = e.changedTouches[0].clientY;
              var diff = touchEndY - touchStartY;
              if (Math.abs(diff) > 25) {
                var sId = row.getAttribute('data-song-id');
                moveSongPosition(sId, diff < 0 ? -1 : 1);
              }
            }
          }, false);
        }

        // Clique na linha inteira abre a música no Prompter
        row.addEventListener('click', function (e) {
          if (e.target.closest('.song-row-actions') || e.target.closest('.song-drag-handle')) return;
          var id = row.getAttribute('data-song-id');
          var song = findSongById(id, state.currentRepertoireSongs);
          if (song) openPrompterView(song);
        });
      })(allRows[dr]);
    }

    // Botões Mover para Cima ⬆️ e Mover para Baixo ⬇️
    var moveUpBtns = listEl.querySelectorAll('.btn-move-up');
    for (var u = 0; u < moveUpBtns.length; u++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-song-id');
          moveSongPosition(id, -1);
        });
      })(moveUpBtns[u]);
    }

    var moveDownBtns = listEl.querySelectorAll('.btn-move-down');
    for (var d = 0; d < moveDownBtns.length; d++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-song-id');
          moveSongPosition(id, 1);
        });
      })(moveDownBtns[d]);
    }

    var editBtns = listEl.querySelectorAll('.btn-edit-song');
    for (var e = 0; e < editBtns.length; e++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-song-id');
          var song = findSongById(id, state.currentRepertoireSongs);
          if (song) openEditorModal(song);
        });
      })(editBtns[e]);
    }

    var deleteBtns = listEl.querySelectorAll('.btn-delete-song');
    for (var d = 0; d < deleteBtns.length; d++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-song-id');
          confirmDeleteSong(id);
        });
      })(deleteBtns[d]);
    }



    var songOfflineBtns = listEl.querySelectorAll('.btn-song-offline');
    for (var o = 0; o < songOfflineBtns.length; o++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-song-id');
          var isCurrentlyPinned = btn.classList.contains('pinned');
          PrompterDB.toggleSongOffline(id, !isCurrentlyPinned).then(function (newState) {
            showToast(newState ? '⚡ Música salva offline!' : '⚡ Música removida do modo offline', newState ? 'success' : 'info');
            if (state.currentRepertoire) openRepertoireSongs(state.currentRepertoire.id);
          });
        });
      })(songOfflineBtns[o]);
    }
  }

  function findSongById(id, list) {
    if (!id || !list) return null;
    var targetId = String(id);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === targetId) return list[i];
    }
    return null;
  }

  function moveSongPosition(songId, direction) {
    if (!state.currentRepertoireSongs || state.currentRepertoireSongs.length <= 1) return;

    var idx = -1;
    var targetId = String(songId);
    for (var i = 0; i < state.currentRepertoireSongs.length; i++) {
      if (state.currentRepertoireSongs[i] && String(state.currentRepertoireSongs[i].id) === targetId) {
        idx = i;
        break;
      }
    }

    if (idx === -1) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.currentRepertoireSongs.length) return;

    var temp = state.currentRepertoireSongs[idx];
    state.currentRepertoireSongs[idx] = state.currentRepertoireSongs[newIdx];
    state.currentRepertoireSongs[newIdx] = temp;

    for (var s = 0; s < state.currentRepertoireSongs.length; s++) {
      state.currentRepertoireSongs[s].trackNumber = s + 1;
      state.currentRepertoireSongs[s].order = s + 1;
    }

    renderSongsList(state.currentRepertoireSongs);

    PrompterDB.saveSongsBatch(state.currentRepertoireSongs).then(function () {
      showToast('Nova ordem salva no banco!', 'success');
    });
  }

  function getFirstTwoLines(content) {
    if (!content) return '';
    var lines = content.split('\n');
    var result = [];
    for (var i = 0; i < lines.length && result.length < 2; i++) {
      var line = lines[i].trim();
      if (line && line.length > 2) result.push(line);
    }
    return result.join(' / ');
  }

  // ═══════════════════════════════════════
  //  MODO PALCO / PROMPTER
  // ═══════════════════════════════════════

  function navigateSong(direction) {
    if (!state.currentSong) return;

    var ensureListPromise = Promise.resolve();
    var songList = (state.currentSetlist && state.currentSetlistSongs && state.currentSetlistSongs.length > 0)
      ? state.currentSetlistSongs
      : (state.currentRepertoireSongs || []);

    var rId = state.currentSong.repertoireId || (state.currentRepertoire ? state.currentRepertoire.id : null);

    if ((!songList || songList.length <= 1) && rId) {
      ensureListPromise = PrompterDB.getSongsByRepertoire(rId).then(function(songs) {
        if (songs && songs.length > 0) {
          state.currentRepertoireSongs = songs;
        }
        return state.currentRepertoireSongs || [];
      });
    }

    ensureListPromise.then(function() {
      var activeList = (state.currentSetlist && state.currentSetlistSongs && state.currentSetlistSongs.length > 0)
        ? state.currentSetlistSongs
        : (state.currentRepertoireSongs || []);

      if (!activeList || activeList.length === 0 || !state.currentSong) return;

      var curId = String(state.currentSong.id);
      var currentIndex = activeList.findIndex(function (s) { return String(s.id) === curId; });

      if (currentIndex === -1) currentIndex = 0;

      var newIndex = currentIndex + direction;
      if (newIndex >= 0 && newIndex < activeList.length) {
        if (state.currentSetlist) {
          state.currentSetlistIndex = newIndex;
        }
        var targetSong = activeList[newIndex];
        openPrompterView(targetSong);

        var scrollArea = document.getElementById('prompterScrollArea');
        if (scrollArea) scrollArea.scrollTop = 0;

        showToast((direction > 0 ? '▶ ' : '◀ ') + (targetSong.title || 'Música'), 'info');
      }
    });
  }

  function openPrompterView(song) {
    if (!song) return;
    state.currentSong = song;
    saveActiveState('prompter', { songId: song.id, repertoireId: song.repertoireId });

    // Ocultar 100% o cabeçalho, abas e containers da página principal
    var appHeader = document.getElementById('appHeader');
    var navTabs = document.getElementById('navTabs');
    var mainContainer = document.querySelector('.main-container');
    var songsView = document.getElementById('repertoireSongsView');
    var mainView = document.getElementById('mainRepertoireView');

    if (appHeader) appHeader.style.setProperty('display', 'none', 'important');
    if (navTabs) navTabs.style.setProperty('display', 'none', 'important');
    if (mainContainer) mainContainer.style.setProperty('display', 'none', 'important');
    if (songsView) songsView.style.setProperty('display', 'none', 'important');
    if (mainView) mainView.style.setProperty('display', 'none', 'important');

    // Exibir o Prompter como camada fixa de tela inteira
    var prompterView = document.getElementById('prompterView');
    if (prompterView) {
      prompterView.classList.remove('hidden');
      prompterView.style.setProperty('display', 'flex', 'important');
      prompterView.style.setProperty('position', 'fixed', 'important');
      prompterView.style.setProperty('top', '0', 'important');
      prompterView.style.setProperty('left', '0', 'important');
      prompterView.style.setProperty('width', '100vw', 'important');
      prompterView.style.setProperty('height', '100vh', 'important');
      prompterView.style.setProperty('z-index', '99999', 'important');
      prompterView.style.removeProperty('background-color');
    }

    document.getElementById('prompterSongTitle').textContent = (song.title || 'Música').toUpperCase();

    var keySelect = document.getElementById('prompterKeySelect');
    if (keySelect) {
      if (window.Transposer && typeof window.Transposer.setSelectKey === 'function') {
        window.Transposer.setSelectKey(keySelect, song.key);
      } else {
        keySelect.value = song.key || '';
      }

      keySelect.onchange = function () {
        var rawVal = this.value;
        var newKey = (window.Transposer && typeof window.Transposer.normalizeKey === 'function')
          ? window.Transposer.normalizeKey(rawVal)
          : rawVal;

        if (!state.currentSong) return;
        state.currentSong.key = newKey;

        // Atualizar lista em memória
        if (state.currentRepertoireSongs) {
          for (var k = 0; k < state.currentRepertoireSongs.length; k++) {
            if (state.currentRepertoireSongs[k].id === state.currentSong.id) {
              state.currentRepertoireSongs[k].key = newKey;
              break;
            }
          }
          renderSongsList(state.currentRepertoireSongs);
        }

        // Transpor cifras no prompter
        if (window.Prompter && typeof Prompter.transposeTo === 'function') {
          Prompter.transposeTo(newKey);
        }

        PrompterDB.saveSong(state.currentSong).then(function () {
          showToast(newKey ? 'Tom ' + newKey + ' salvo na música!' : 'Tom removido!', 'success');
        });
      };
    }

    var origKeyEl = document.getElementById('prompterSongOriginalKey');
    if (origKeyEl) {
      origKeyEl.textContent = 'Orig: ' + (song.originalKey || '—');
    }

    var btnPrompterYt = document.getElementById('btnPrompterYoutube');
    if (btnPrompterYt) {
      if (song.youtubeUrl || song.youtubeId) {
        btnPrompterYt.classList.remove('hidden');
        btnPrompterYt.onclick = function() {
          if (state.currentSong) openYoutubeModal(state.currentSong);
        };
      } else {
        btnPrompterYt.classList.add('hidden');
      }
    }

    var btnPrompterSpot = document.getElementById('btnPrompterSpotify');
    if (btnPrompterSpot) {
      if (song.spotifyUrl) {
        btnPrompterSpot.classList.remove('hidden');
        btnPrompterSpot.onclick = function() {
          if (state.currentSong) openSpotifyModal(state.currentSong);
        };
      } else {
        btnPrompterSpot.classList.add('hidden');
      }
    }

    var btnPrompterAddSetlist = document.getElementById('btnPrompterAddToSetlist');
    if (btnPrompterAddSetlist) {
      btnPrompterAddSetlist.onclick = function() {
        if (state.currentSong) openAddToSetlistModal(state.currentSong);
      };
    }

    var btnPrompterEdit = document.getElementById('btnPrompterEdit');
    if (btnPrompterEdit) {
      btnPrompterEdit.onclick = function () {
        if (state.currentSong) openEditorModal(state.currentSong);
      };
    }

    var artistEl = document.getElementById('prompterSongArtist');
    if (artistEl) {
      artistEl.textContent = song.artist ? '🎤 ' + song.artist : '';
      artistEl.style.display = song.artist ? 'inline-block' : 'none';
    }

    var composerEl = document.getElementById('prompterSongComposer');
    if (composerEl) {
      composerEl.textContent = song.composer ? '✍️ ' + song.composer : '';
      composerEl.style.display = song.composer ? 'inline-block' : 'none';
    }

    // Configurar Navegação de Palco (Repertório e Setlist)
    function updatePrompterNavUI(list) {
      var activeList = list || [];
      var curIndex = -1;
      if (activeList.length > 0) {
        curIndex = activeList.findIndex(function (s) { return String(s.id) === String(song.id); });
      }

      var btnPrev = document.getElementById('btnPrompterPrevSong');
      var btnNext = document.getElementById('btnPrompterNextSong');
      var showPos = document.getElementById('prompterShowPos');
      var nextBanner = document.getElementById('prompterNextSongBanner');
      var pnsbTitle = document.getElementById('pnsbTitle');
      var pnsbKey = document.getElementById('pnsbKey');
      var pnsbArtist = document.getElementById('pnsbArtist');
      var pnsbBtnGo = document.getElementById('pnsbBtnGo');

      if (curIndex !== -1 && activeList.length > 1) {
        if (btnPrev) {
          btnPrev.classList.remove('hidden');
          btnPrev.disabled = (curIndex === 0);
          btnPrev.classList.toggle('disabled', curIndex === 0);
          btnPrev.onclick = function(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            navigateSong(-1);
          };
        }
        if (btnNext) {
          btnNext.classList.remove('hidden');
          btnNext.disabled = (curIndex >= activeList.length - 1);
          btnNext.classList.toggle('disabled', curIndex >= activeList.length - 1);
          btnNext.onclick = function(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            navigateSong(1);
          };
        }
        if (showPos) {
          showPos.classList.remove('hidden');
          showPos.textContent = (curIndex + 1) + ' / ' + activeList.length;
        }

        // Configurar banner de Próxima Música no fim da página
        if (curIndex < activeList.length - 1 && nextBanner) {
          var nextSong = activeList[curIndex + 1];
          nextBanner.classList.remove('hidden');
          if (pnsbTitle) pnsbTitle.textContent = (curIndex + 2) + '. ' + (nextSong.title || 'Próxima');
          if (pnsbKey) {
            pnsbKey.textContent = nextSong.key ? 'Tom: ' + nextSong.key : 'Sem Tom';
            pnsbKey.style.display = nextSong.key ? 'inline-block' : 'none';
          }
          if (pnsbArtist) {
            pnsbArtist.textContent = nextSong.artist ? '🎤 ' + nextSong.artist : '';
            pnsbArtist.style.display = nextSong.artist ? 'inline-block' : 'none';
          }
          if (pnsbBtnGo) {
            pnsbBtnGo.onclick = function(e) {
              if (e) { e.preventDefault(); e.stopPropagation(); }
              navigateSong(1);
            };
          }
        } else if (nextBanner) {
          nextBanner.classList.add('hidden');
        }
      } else {
        if (btnPrev) btnPrev.classList.add('hidden');
        if (btnNext) btnNext.classList.add('hidden');
        if (showPos) showPos.classList.add('hidden');
        if (nextBanner) nextBanner.classList.add('hidden');
      }
    }

    var initialList = (state.currentSetlist && state.currentSetlistSongs && state.currentSetlistSongs.length > 0)
      ? state.currentSetlistSongs
      : (state.currentRepertoireSongs || []);

    var repIdForSong = song.repertoireId || (state.currentRepertoire ? state.currentRepertoire.id : null);

    if ((!initialList || initialList.length <= 1) && repIdForSong) {
      PrompterDB.getSongsByRepertoire(repIdForSong).then(function(loaded) {
        if (loaded && loaded.length > 0) {
          state.currentRepertoireSongs = loaded;
          updatePrompterNavUI(loaded);
        } else {
          updatePrompterNavUI(initialList);
        }
      }).catch(function() {
        updatePrompterNavUI(initialList);
      });
    } else {
      updatePrompterNavUI(initialList);
    }

    Prompter.loadContent(song.content, song.key, song.originalKey);

    if (song.audioBlob || song.audioUrl) {
      if (window.AdvancedPlayer) {
        AdvancedPlayer.loadSong(song);
      } else if (window.MediaPlayer) {
        MediaPlayer.loadMedia(song.audioBlob || song.audioUrl, song.audioName || song.title);
      }
    } else {
      if (window.AdvancedPlayer) AdvancedPlayer.hide();
      if (window.MediaPlayer) MediaPlayer.hide();
    }

    var btnSuggest = document.getElementById('apKeySuggest');
    if (btnSuggest) {
      btnSuggest.onclick = function () {
        var rawDetected = this.getAttribute('data-key');
        var detectedKey = (window.Transposer && typeof window.Transposer.normalizeKey === 'function')
          ? window.Transposer.normalizeKey(rawDetected)
          : rawDetected;

        if (!detectedKey || !state.currentSong) return;
        state.currentSong.key = detectedKey;

        var kSelect = document.getElementById('prompterKeySelect');
        if (kSelect) {
          if (window.Transposer && typeof window.Transposer.setSelectKey === 'function') {
            window.Transposer.setSelectKey(kSelect, detectedKey);
          } else {
            kSelect.value = detectedKey;
          }
        }

        if (state.currentRepertoireSongs) {
          for (var k = 0; k < state.currentRepertoireSongs.length; k++) {
            if (state.currentRepertoireSongs[k].id === state.currentSong.id) {
              state.currentRepertoireSongs[k].key = detectedKey;
              break;
            }
          }
          renderSongsList(state.currentRepertoireSongs);
        }

        if (window.Prompter && typeof Prompter.transposeTo === 'function') {
          Prompter.transposeTo(detectedKey);
        }

        PrompterDB.saveSong(state.currentSong).then(function() {
          showToast('Tom ' + detectedKey + ' salvo na música!', 'success');
        });
        this.classList.add('hidden');
      };
    }

    var btnClose = document.getElementById('btnClosePrompter');
    if (btnClose) {
      btnClose.onclick = function () {
        closePrompterView();
      };
    }

    window.scrollTo(0, 0);
  }

  function closePrompterView() {
    Prompter.stopScroll();
    if (window.AdvancedPlayer) AdvancedPlayer.stop();
    if (window.MediaPlayer) MediaPlayer.hide();
    closeYoutubeModal();

    var prompterView = document.getElementById('prompterView');
    if (prompterView) {
      prompterView.classList.add('hidden');
      prompterView.style.setProperty('display', 'none', 'important');
    }

    var appHeader = document.getElementById('appHeader');
    var navTabs = document.getElementById('navTabs');
    var mainContainer = document.querySelector('.main-container');
    var songsView = document.getElementById('repertoireSongsView');
    var mainView = document.getElementById('mainRepertoireView');

    if (appHeader) appHeader.style.removeProperty('display');
    if (navTabs) navTabs.style.removeProperty('display');
    if (mainContainer) mainContainer.style.removeProperty('display');

    state.currentSong = null;

    if (state.currentSetlist) {
      var setlistSongsView = document.getElementById('setlistSongsView');
      var mainSetlistsView = document.getElementById('mainSetlistsView');
      if (setlistSongsView) setlistSongsView.classList.remove('hidden');
      if (mainSetlistsView) mainSetlistsView.classList.add('hidden');
      openSetlistSongsView(state.currentSetlist.id);
    } else if (state.currentRepertoire) {
      if (mainView) mainView.classList.add('hidden');
      if (songsView) {
        songsView.classList.remove('hidden');
        songsView.style.removeProperty('display');
      }
      renderSongsList(state.currentRepertoireSongs);
      saveActiveState('repertoire', { repertoireId: state.currentRepertoire.id });
    } else {
      if (songsView) songsView.classList.add('hidden');
      if (mainView) {
        mainView.classList.remove('hidden');
        mainView.style.removeProperty('display');
      }
      loadRepertoires();
      saveActiveState('main', {});
    }
  }

  // ═══════════════════════════════════════
  //  GERENCIAR REPERTÓRIOS
  // ═══════════════════════════════════════

  function renameRepertoire(repId) {
    var rep = null;
    for (var i = 0; i < state.repertoires.length; i++) {
      if (state.repertoires[i].id === repId) { rep = state.repertoires[i]; break; }
    }
    if (!rep) return;

    var newName = prompt('Novo nome para o repertório:', rep.name);
    if (!newName || !newName.trim()) return;

    PrompterDB.saveRepertoire({ id: rep.id, name: newName.trim(), source: rep.source, createdAt: rep.createdAt })
      .then(function () {
        showToast('Repertório renomeado!', 'success');
        loadRepertoires();
      });
  }

  function confirmDeleteRepertoire(repId) {
    var rep = null;
    for (var i = 0; i < state.repertoires.length; i++) {
      if (String(state.repertoires[i].id) === String(repId)) { rep = state.repertoires[i]; break; }
    }
    var name = rep ? rep.name : null;

    if (!confirm('Excluir "' + (name || 'este repertório') + '" e TODAS as suas músicas?\n\nEsta ação não pode ser desfeita.')) return;

    showToast('Excluindo repertório...', 'info');

    PrompterDB.deleteRepertoire(repId)
      .then(function () {
        showToast('Repertório excluído com sucesso!', 'success');
        loadRepertoires();
      })
      .catch(function (err) {
        console.error(err);
        showToast('Erro ao excluir repertório.', 'warning');
      });
  }

  function confirmDeleteSong(songId) {
    if (!confirm('Excluir esta música do repertório?')) return;

    showToast('Excluindo música...', 'info');

    PrompterDB.deleteSong(songId)
      .then(function () {
        showToast('Música excluída!', 'success');
        if (state.currentRepertoire) {
          openRepertoireSongs(state.currentRepertoire.id);
        }
      })
      .catch(function (err) {
        console.error(err);
        showToast('Erro ao excluir música.', 'warning');
      });
  }

  // ═══════════════════════════════════════
  //  IMPORTAÇÃO LOCAL
  // ═══════════════════════════════════════

  function setupEventListeners() {
    // Busca global com Autocomplete Inteligente (ignora acentos e maiúsculas)
    var searchDropdown = document.getElementById('searchAutocompleteDropdown');
    var searchDebounce = null;

    function executeGlobalSearch(query) {
      state.searchQuery = query;
      var normQ = normalizeSearch(query);

      if (!normQ) {
        if (searchDropdown) {
          searchDropdown.innerHTML = '';
          searchDropdown.classList.add('hidden');
        }
        if (btnClearSearch) btnClearSearch.classList.add('hidden');
        renderRepertoires();
        return;
      }

      if (btnClearSearch) btnClearSearch.classList.remove('hidden');

      // Buscar repertórios e todas as músicas no banco de dados
      Promise.all([
        Promise.resolve(state.repertoires || []),
        PrompterDB.getAllSongs()
      ]).then(function (results) {
        var reps = results[0] || [];
        var allSongs = results[1] || [];

        var matchedReps = reps.filter(function (r) {
          return r.name && normalizeSearch(r.name).indexOf(normQ) !== -1;
        });

        var repMap = {};
        reps.forEach(function (r) { repMap[r.id] = r.name; });

        var matchedSongs = allSongs.filter(function (s) {
          var normTitle = s.title ? normalizeSearch(s.title) : '';
          var normArtist = s.artist ? normalizeSearch(s.artist) : '';
          var normComposer = s.composer ? normalizeSearch(s.composer) : '';
          var normRhythm = s.rhythm ? normalizeSearch(s.rhythm) : '';
          var fullText = s.content || s.body || s.lyrics || s.text || s.rawText || '';
          var normContent = fullText ? normalizeSearch(fullText) : '';

          var titleMatch = normTitle.indexOf(normQ) !== -1;
          var artistMatch = normArtist.indexOf(normQ) !== -1;
          var composerMatch = normComposer.indexOf(normQ) !== -1;
          var rhythmMatch = normRhythm.indexOf(normQ) !== -1;
          var contentMatch = normContent.indexOf(normQ) !== -1;

          s._matchedLyricSnippet = null;
          if (contentMatch && !titleMatch && !artistMatch && !composerMatch) {
            var lines = fullText.split('\n');
            for (var l = 0; l < lines.length; l++) {
              var lineNorm = normalizeSearch(lines[l]);
              if (lineNorm.indexOf(normQ) !== -1) {
                var cleanLine = lines[l].trim();
                if (cleanLine.length > 2) {
                  s._matchedLyricSnippet = cleanLine.slice(0, 60);
                  break;
                }
              }
            }
          }

          return titleMatch || artistMatch || composerMatch || rhythmMatch || contentMatch;
        });

        if (!searchDropdown) return;

        if (matchedReps.length === 0 && matchedSongs.length === 0) {
          searchDropdown.innerHTML = '<div class="search-auto-empty">🔍 Nenhum repertório ou música encontrado para "<strong>' + escapeHtml(query) + '</strong>"</div>';
          searchDropdown.classList.remove('hidden');
          return;
        }

        var html = '';

        if (matchedReps.length > 0) {
          html += '<div class="search-auto-section-title">📂 Repertórios (' + matchedReps.length + ')</div>';
          matchedReps.slice(0, 4).forEach(function (r) {
            html +=
              '<div class="search-auto-item search-item-rep" data-rep-id="' + r.id + '">' +
                '<div class="search-auto-info">' +
                  '<span class="search-auto-name">📂 ' + escapeHtml((r.name || '').toUpperCase()) + '</span>' +
                  '<span class="search-auto-meta">Abrir repertório</span>' +
                '</div>' +
              '</div>';
          });
        }

        if (matchedSongs.length > 0) {
          html += '<div class="search-auto-section-title">🎵 Músicas (' + matchedSongs.length + ')</div>';
          matchedSongs.slice(0, 20).forEach(function (s) {
            var repName = repMap[s.repertoireId] || 'Repertório';
            var metaParts = [repName];
            if (s.rhythm) metaParts.push(s.rhythm);
            if (s.artist) metaParts.push(s.artist);
            if (s._matchedLyricSnippet) {
              metaParts.push('💬 "' + s._matchedLyricSnippet + '..."');
            }

            var upperTitle = (s.title || 'Sem título').toUpperCase();

            html +=
              '<div class="search-auto-item search-item-song" data-song-id="' + s.id + '" data-rep-id="' + s.repertoireId + '">' +
                '<div class="search-auto-info">' +
                  '<span class="search-auto-name">🎵 ' + escapeHtml(upperTitle) + '</span>' +
                  '<span class="search-auto-meta">' + escapeHtml(metaParts.join(' • ')) + '</span>' +
                '</div>' +
                '<div class="search-auto-badges">' +
                  (s.key ? '<span class="badge badge-key" style="font-size:0.75rem;">' + escapeHtml(s.key) + '</span>' : '') +
                '</div>' +
              '</div>';
          });
        }

        searchDropdown.innerHTML = html;
        searchDropdown.classList.remove('hidden');

        // Binds de clique nos itens do autocomplete
        searchDropdown.querySelectorAll('.search-item-rep').forEach(function (el) {
          el.addEventListener('click', function () {
            var rId = this.getAttribute('data-rep-id');
            searchDropdown.classList.add('hidden');
            if (searchInput) searchInput.value = '';
            state.searchQuery = '';
            if (btnClearSearch) btnClearSearch.classList.add('hidden');
            openRepertoireSongs(rId);
          });
        });

        searchDropdown.querySelectorAll('.search-item-song').forEach(function (el) {
          el.addEventListener('click', function () {
            var sId = this.getAttribute('data-song-id');
            var rId = this.getAttribute('data-rep-id');
            searchDropdown.classList.add('hidden');
            if (searchInput) searchInput.value = '';
            state.searchQuery = '';
            if (btnClearSearch) btnClearSearch.classList.add('hidden');

            PrompterDB.getSongById(sId).then(function (song) {
              if (song) {
                if (rId) {
                  PrompterDB.getRepertoireById(rId).then(function (rep) {
                    if (rep) state.currentRepertoire = rep;
                  });
                  PrompterDB.getSongsByRepertoire(rId).then(function (songs) {
                    state.currentRepertoireSongs = songs || [];
                  });
                }
                openPrompterView(song);
              }
            }).catch(function (err) {
              console.error('Erro ao abrir música selecionada na busca:', err);
            });
          });
        });
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        clearTimeout(searchDebounce);
        var val = e.target.value;
        searchDebounce = setTimeout(function () {
          executeGlobalSearch(val);
        }, 120);
      });

      searchInput.addEventListener('focus', function () {
        this.removeAttribute('readonly');
        if (this.value) executeGlobalSearch(this.value);
      });

      // Purge definitivo contra autofill indevido de e-mail do Chrome/Safari
      var purgeSearchAutofill = function () {
        if (searchInput && searchInput.value && searchInput.value.indexOf('@') !== -1 && document.activeElement !== searchInput) {
          searchInput.value = '';
          if (searchDropdown) searchDropdown.classList.add('hidden');
        }
      };
      setTimeout(purgeSearchAutofill, 50);
      setTimeout(purgeSearchAutofill, 200);
      setTimeout(purgeSearchAutofill, 600);
      setTimeout(purgeSearchAutofill, 1200);
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        state.searchQuery = '';
        if (searchDropdown) {
          searchDropdown.innerHTML = '';
          searchDropdown.classList.add('hidden');
        }
        btnClearSearch.classList.add('hidden');
        renderRepertoires();
      });
    }

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', function (e) {
      if (searchDropdown && !searchDropdown.contains(e.target) && e.target !== searchInput) {
        searchDropdown.classList.add('hidden');
      }
    });

    // Fechar no Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && searchDropdown) {
        searchDropdown.classList.add('hidden');
      }
    });

    // Navegação de tabs
    var navTabs = document.querySelectorAll('.nav-tab');
    for (var t = 0; t < navTabs.length; t++) {
      (function (tab) {
        tab.addEventListener('click', function () {
          var target = tab.getAttribute('data-tab');
          document.querySelectorAll('.nav-tab').forEach(function (nt) { nt.classList.remove('active'); });
          document.querySelectorAll('.tab-content').forEach(function (tc) { tc.classList.remove('active'); });
          tab.classList.add('active');
          var el = document.getElementById(target);
          if (el) el.classList.add('active');

          if (target === 'tabRepertoire') {
            var mainView = document.getElementById('mainRepertoireView');
            var songsView = document.getElementById('repertoireSongsView');
            if (!state.currentRepertoire) {
              if (mainView) mainView.classList.remove('hidden');
              if (songsView) songsView.classList.add('hidden');
            }
            loadRepertoires();
          }
        });
      })(navTabs[t]);
    }

    // Logo → voltar home
    var btnGoHome = document.getElementById('btnGoHome');
    if (btnGoHome) {
      btnGoHome.addEventListener('click', function () {
        closeRepertoireSongsView();
        Prompter.stopScroll();
        MediaPlayer.hide();
        document.getElementById('prompterView').classList.add('hidden');
      });
    }

    // Botão Ordenar A-Z no Repertório
    var btnSortAZ = document.getElementById('btnRsvSortAZ');
    if (btnSortAZ) {
      btnSortAZ.addEventListener('click', function () {
        if (!state.currentRepertoireSongs || state.currentRepertoireSongs.length === 0) return;
        state.currentRepertoireSongs.sort(function (a, b) {
          return (a.title || '').localeCompare(b.title || '', 'pt', { sensitivity: 'base' });
        });
        for (var s = 0; s < state.currentRepertoireSongs.length; s++) {
          state.currentRepertoireSongs[s].trackNumber = s + 1;
          state.currentRepertoireSongs[s].order = s + 1;
        }
        PrompterDB.saveSongsBatch(state.currentRepertoireSongs).then(function () {
          renderSongsList(state.currentRepertoireSongs);
          showToast('Músicas ordenadas de A a Z e salvas no banco!', 'success');
        });
      });
    }

    // Menu Dropdown "+ Adicionar" unificado no cabeçalho
    var btnDropdownAdd = document.getElementById('btnDropdownAdd');
    var dropdownAddMenu = document.getElementById('dropdownAddMenu');
    if (btnDropdownAdd && dropdownAddMenu) {
      btnDropdownAdd.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdownAddMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', function (e) {
        if (dropdownAddMenu && !dropdownAddMenu.classList.contains('hidden') && !btnDropdownAdd.contains(e.target) && !dropdownAddMenu.contains(e.target)) {
          dropdownAddMenu.classList.add('hidden');
        }
      });
    }

    var btnMenuNewRepertoire = document.getElementById('btnMenuNewRepertoire');
    if (btnMenuNewRepertoire) {
      btnMenuNewRepertoire.addEventListener('click', function () {
        if (dropdownAddMenu) dropdownAddMenu.classList.add('hidden');
        promptCreateRepertoire();
      });
    }

    var btnMenuNewSong = document.getElementById('btnMenuNewSong');
    if (btnMenuNewSong) {
      btnMenuNewSong.addEventListener('click', function () {
        if (dropdownAddMenu) dropdownAddMenu.classList.add('hidden');
        openEditorModal(null);
      });
    }

    var btnMenuImportLocal = document.getElementById('btnMenuImportLocal');
    if (btnMenuImportLocal) {
      btnMenuImportLocal.addEventListener('click', function () {
        if (dropdownAddMenu) dropdownAddMenu.classList.add('hidden');
        state.targetRepertoireId = null;
        openModal(importModal);
        suggestRepertoireName('import');
      });
    }

    var btnMenuImportDrive = document.getElementById('btnMenuImportDrive');
    if (btnMenuImportDrive) {
      btnMenuImportDrive.addEventListener('click', function () {
        if (dropdownAddMenu) dropdownAddMenu.classList.add('hidden');
        openModal(gDriveModal);
      });
    }

    // Fechar modais
    bindModalClose('btnCloseImportModal', importModal);
    bindModalClose('btnCancelImport', importModal);
    bindModalClose('importModalOverlay', importModal);
    bindModalClose('btnCloseGDriveModal', gDriveModal);
    bindModalClose('btnCancelGDrive', gDriveModal);
    bindModalClose('gDriveModalOverlay', gDriveModal);
    bindModalClose('btnCloseEditorModal', songEditorModal);
    bindModalClose('songEditorOverlay', songEditorModal);

    // Drop Zone
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', function (e) {
        if (e.target !== fileInput) {
          fileInput.click();
        }
      });
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drop-zone-active');
      });
      dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('drop-zone-active');
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drop-zone-active');
        if (e.dataTransfer.files.length) {
          handleFilesToImport(Array.prototype.slice.call(e.dataTransfer.files));
        }
      });
      fileInput.addEventListener('change', function (e) {
        if (e.target.files.length) {
          handleFilesToImport(Array.prototype.slice.call(e.target.files));
        }
      });
    }

    // Salvar importação
    var btnSaveImportedSongs = document.getElementById('btnSaveImportedSongs');
    if (btnSaveImportedSongs) {
      btnSaveImportedSongs.addEventListener('click', function () {
        saveImportedFiles();
      });
    }

    // Fechar Prompter
    var btnClosePrompter = document.getElementById('btnClosePrompter');
    if (btnClosePrompter) {
      btnClosePrompter.onclick = function () {
        closePrompterView();
      };
    }

    // Fechar / Minimizar Dock do YouTube
    var btnCloseYtDock = document.getElementById('btnCloseYoutubeDock');
    if (btnCloseYtDock) {
      var handleCloseYt = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        closeYoutubeModal();
      };
      btnCloseYtDock.addEventListener('pointerdown', handleCloseYt, { passive: false });
      btnCloseYtDock.addEventListener('click', handleCloseYt, { passive: false });
    }

    // Fechar Dock do Spotify
    var btnCloseSpDock = document.getElementById('btnCloseSpotifyDock');
    if (btnCloseSpDock) {
      var handleCloseSp = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        closeSpotifyModal();
      };
      btnCloseSpDock.addEventListener('pointerdown', handleCloseSp, { passive: false });
      btnCloseSpDock.addEventListener('click', handleCloseSp, { passive: false });
    }

    var btnMinYtDock = document.getElementById('btnToggleMinYoutubeDock');
    if (btnMinYtDock) {
      var handleMinYt = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        toggleMinYoutubeModal();
      };
      btnMinYtDock.addEventListener('pointerdown', handleMinYt, { passive: false });
      btnMinYtDock.addEventListener('click', handleMinYt, { passive: false });
    }

    // Botão Flutuante Voltar ao Topo (Funciona Instantaneamente em qualquer momento, mesmo durante rolagem ativa)
    var btnScrollToTop = document.getElementById('btnScrollToTop');
    if (btnScrollToTop) {
      var handleTopClick = function (e) {
        if (e) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
        }
        if (window.Prompter && window.Prompter.scrollToTop) {
          window.Prompter.scrollToTop();
        } else {
          var area = document.getElementById('prompterScrollArea');
          if (area) area.scrollTop = 0;
          window.scrollTo(0, 0);
          if (document.documentElement) document.documentElement.scrollTop = 0;
          if (document.body) document.body.scrollTop = 0;
        }
      };

      btnScrollToTop.addEventListener('pointerdown', handleTopClick, { passive: false });
      btnScrollToTop.addEventListener('touchstart', handleTopClick, { passive: false });
      btnScrollToTop.addEventListener('click', handleTopClick, { passive: false });
    }

    // Alternar Tema (Claro / Escuro com persistência)
    var btnToggleTheme = document.getElementById('btnToggleTheme');
    var upmThemeIcon = document.getElementById('upmThemeIcon');

    function applyAppTheme(theme) {
      if (theme === 'light') {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
        if (btnToggleTheme) btnToggleTheme.innerText = '☀️';
        if (upmThemeIcon) upmThemeIcon.innerText = '☀️';
      } else {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        if (btnToggleTheme) btnToggleTheme.innerText = '🌙';
        if (upmThemeIcon) upmThemeIcon.innerText = '🌙';
      }
    }

    function toggleAppTheme() {
      var isLight = document.body.classList.contains('light-mode');
      var newTheme = isLight ? 'dark' : 'light';
      try {
        localStorage.setItem('prompter_theme', newTheme);
      } catch (e) {}
      applyAppTheme(newTheme);
    }

    var savedAppTheme = 'dark';
    try {
      savedAppTheme = localStorage.getItem('prompter_theme') || 'dark';
    } catch (e) {}
    applyAppTheme(savedAppTheme);

    if (btnToggleTheme) {
      btnToggleTheme.addEventListener('click', toggleAppTheme);
    }
    window.toggleAppTheme = toggleAppTheme;

    // Fechar tela interna de músicas
    var btnRsvBack = document.getElementById('btnRsvBack');
    if (btnRsvBack) {
      btnRsvBack.addEventListener('click', closeRepertoireSongsView);
    }

    // Imprimir dentro da tela interna
    var btnRsvPrint = document.getElementById('btnRsvPrint');
    if (btnRsvPrint) {
      btnRsvPrint.addEventListener('click', function () {
        if (state.currentRepertoire) printRepertoire(state.currentRepertoire.id);
      });
    }

    // Adicionar música dentro do repertório
    var btnRsvAddSong = document.getElementById('btnRsvAddSong');
    if (btnRsvAddSong) {
      btnRsvAddSong.addEventListener('click', function () {
        // Abre o modal de importação vinculado ao repertório atual
        if (state.currentRepertoire) {
          state.targetRepertoireId = state.currentRepertoire.id;
          openModal(importModal);
          // Preencher nome do repertório com o atual
          var nameInput = document.getElementById('importRepertoireName');
          if (nameInput) {
            nameInput.value = state.currentRepertoire.name;
            nameInput.setAttribute('disabled', 'true');
          }
        }
      });
    }

    // Ao fechar modal de importação, re-habilitar campo de nome
    var btnCloseImportModal2 = document.getElementById('btnCloseImportModal');
    if (btnCloseImportModal2) {
      btnCloseImportModal2.addEventListener('click', function () {
        var nameInput = document.getElementById('importRepertoireName');
        if (nameInput) nameInput.removeAttribute('disabled');
        state.targetRepertoireId = null;
      });
    }

    // Botão criar música manual dentro do repertório
    var btnRsvCreateManual = document.getElementById('btnRsvCreateManual');
    if (btnRsvCreateManual) {
      btnRsvCreateManual.addEventListener('click', function () {
        openEditorModal(null);
      });
    }

    // Botão Batch: Detectar Tons e Vídeos no Repertório
    var btnBatchKeyYt = document.getElementById('btnRsvAutoSearchKeyYt');
    if (btnBatchKeyYt) {
      btnBatchKeyYt.addEventListener('click', function() {
        runBatchKeyAndYoutubeDetection();
      });
    }

    // Botão Buscar no YouTube no Editor de Músicas
    var btnSearchYt = document.getElementById('btnSearchSongYoutube');
    if (btnSearchYt) {
      btnSearchYt.addEventListener('click', function() {
        var title = document.getElementById('editSongTitle').value.trim();
        var artist = document.getElementById('editSongArtist').value.trim();
        if (!title) {
          showToast('Informe o nome da música para pesquisar no YouTube.', 'warning');
          return;
        }
        var searchUrl = TextParser.getYouTubeSearchUrl(title, artist);
        window.open(searchUrl, '_blank');
      });
    }

    // Botão Tocar / Pesquisar no Spotify no Editor de Músicas (Direct App Embed)
    var btnOpenSpotify = document.getElementById('btnOpenSongSpotify');
    if (btnOpenSpotify) {
      btnOpenSpotify.addEventListener('click', function() {
        var spotifyUrl = document.getElementById('editSongSpotifyUrl').value.trim();
        var title = document.getElementById('editSongTitle').value.trim();
        var artist = document.getElementById('editSongArtist').value.trim();
        if (spotifyUrl || title) {
          openSpotifyModal({ spotifyUrl: spotifyUrl, title: title, artist: artist });
        } else {
          showToast('Informe a URL do Spotify ou o nome da música.', 'warning');
        }
      });
    }

    // Sanitizar automaticamente ao colar texto no Editor
    var editContentEl = document.getElementById('editSongContent');
    if (editContentEl) {
      editContentEl.addEventListener('paste', function () {
        setTimeout(function () {
          var raw = editContentEl.value;
          if (raw && window.TextParser) {
            var cleaned = TextParser.normalizeRawInputText(raw);
            if (cleaned !== raw) editContentEl.value = cleaned;
            var autoKey = TextParser.detectOriginalKey(cleaned);
            var origKeySelect = document.getElementById('editSongOriginalKey');
            var keySelect = document.getElementById('editSongKey');
            if (autoKey) {
              if (origKeySelect && !origKeySelect.value) origKeySelect.value = autoKey;
              if (keySelect && !keySelect.value) keySelect.value = autoKey;
            }
          }
        }, 40);
      });
    }

    // Modais YouTube
    bindModalClose('btnCloseYoutubeModal', document.getElementById('youtubeModal'));
    bindModalClose('youtubeModalOverlay', document.getElementById('youtubeModal'));

    // Salvar edição manual
    var btnSaveSong = document.getElementById('btnSaveSong');
    if (btnSaveSong) {
      btnSaveSong.addEventListener('click', function (e) {
        e.preventDefault();
        saveManualSong();
      });
    }

    // Deletar música no editor
    var btnDeleteSong = document.getElementById('btnDeleteSong');
    if (btnDeleteSong) {
      btnDeleteSong.addEventListener('click', function () {
        var id = document.getElementById('editSongId').value;
        if (id && confirm('Excluir esta música?')) {
          PrompterDB.deleteSong(id)
            .then(function () {
              showToast('Música excluída!', 'info');
              closeModal(songEditorModal);
              if (state.currentRepertoire) openRepertoireSongs(state.currentRepertoire.id);
            });
        }
      });
    }

    // Navegação por abas (Repertórios / Setlists)


    // Formulário de música: previne reload da página e salva com Enter
    var songForm = document.getElementById('songForm');
    if (songForm) {
      songForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveManualSong();
      });
    }

    // Tecla ESC para fechar modais abertos
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        var openModals = document.querySelectorAll('.modal:not(.hidden)');
        if (openModals.length > 0) {
          closeModal(openModals[openModals.length - 1]);
        }
      }

      // Atalhos de Palco e Pedais Bluetooth (Avançar / Voltar Música)
      var prompterView = document.getElementById('prompterView');
      var isPrompterActive = prompterView && !prompterView.classList.contains('hidden') && prompterView.style.display !== 'none';
      var isEditingText = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);

      if (isPrompterActive && !isEditingText) {
        // Seta Direita / PageDown / 'n' -> Próxima Música
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'n' || e.key === 'N') {
          navigateSong(1);
        }
        // Seta Esquerda / PageUp / 'p' -> Música Anterior
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'p' || e.key === 'P') {
          navigateSong(-1);
        }
      }
    });

    // Suporte a Gesto de Swipe no iPad (Deslizar para mudar de música)
    var touchStartX = 0;
    var touchStartY = 0;
    var prompterScrollArea = document.getElementById('prompterScrollArea');
    if (prompterScrollArea) {
      prompterScrollArea.addEventListener('touchstart', function(e) {
        if (e.touches && e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      prompterScrollArea.addEventListener('touchend', function(e) {
        if (e.changedTouches && e.changedTouches.length === 1) {
          var deltaX = e.changedTouches[0].clientX - touchStartX;
          var deltaY = e.changedTouches[0].clientY - touchStartY;
          // Gesto horizontal nítido (> 80px horizontal e < 60px vertical)
          if (Math.abs(deltaX) > 80 && Math.abs(deltaY) < 60) {
            if (deltaX < 0) {
              navigateSong(1); // Swipe esquerda -> Próxima
            } else {
              navigateSong(-1); // Swipe direita -> Anterior
            }
          }
        }
      }, { passive: true });
    }
  }

  // ═══════════════════════════════════════
  //  MODAL VÍDEO DO YOUTUBE & DETECÇÃO DE TOM
  // ═══════════════════════════════════════

  function openYoutubeModal(song) {
    var dock = document.getElementById('youtubePlayerDock');
    var container = document.getElementById('youtubePlayerContainer');
    var titleEl = document.getElementById('youtubeDockTitle');
    var btnExternal = document.getElementById('btnOpenExternalYoutube');

    if (!dock || !song) return;

    if (titleEl) titleEl.textContent = '🎵 Áudio Guia: ' + (song.title || 'Referência');
    var ytId = song.youtubeId || (song.youtubeUrl ? TextParser.extractYouTubeId(song.youtubeUrl) : '');

    if (ytId) {
      container.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + ytId + '?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    } else {
      var query = encodeURIComponent((song.title || '') + ' ' + (song.artist || ''));
      container.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed?listType=search&list=' + query + '&autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
    }

    if (btnExternal) {
      btnExternal.onclick = function() {
        var targetUrl = song.youtubeUrl || TextParser.getYouTubeSearchUrl(song.title, song.artist);
        window.open(targetUrl, '_blank');
      };
    }

    dock.classList.remove('hidden');
    dock.classList.add('minimized'); // Por padrão exibe em modo áudio (vídeo oculto no palco)
    var btnMin = document.getElementById('btnToggleMinYoutubeDock');
    if (btnMin) btnMin.textContent = '👁️ Mostrar vídeo';
  }

  function toggleMinYoutubeModal() {
    var dock = document.getElementById('youtubePlayerDock');
    var btnMin = document.getElementById('btnToggleMinYoutubeDock');
    if (!dock) return;

    if (dock.classList.contains('minimized')) {
      dock.classList.remove('minimized');
      if (btnMin) btnMin.textContent = '🙈 Ocultar vídeo (Só Áudio)';
    } else {
      dock.classList.add('minimized');
      if (btnMin) btnMin.textContent = '👁️ Mostrar vídeo';
    }
  }

  function closeYoutubeModal() {
    var dock = document.getElementById('youtubePlayerDock');
    var container = document.getElementById('youtubePlayerContainer');
    if (container) container.innerHTML = '';
    if (dock) {
      dock.classList.add('hidden');
      dock.classList.remove('minimized');
    }
  }

  // ═══════════════════════════════════════
  //  MODAL / DOCK DE ÁUDIO DO SPOTIFY
  // ═══════════════════════════════════════

  function convertSpotifyToEmbedUrl(url) {
    if (!url) return '';
    var cleanUrl = url.trim();
    if (cleanUrl.indexOf('open.spotify.com/embed/') !== -1) {
      return cleanUrl;
    }
    var match = cleanUrl.match(/open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/i);
    if (match) {
      return 'https://open.spotify.com/embed/' + match[1] + '/' + match[2] + '?utm_source=generator&theme=0';
    }
    return cleanUrl;
  }

  function openSpotifyModal(song) {
    var dock = document.getElementById('spotifyPlayerDock');
    var container = document.getElementById('spotifyPlayerContainer');
    var titleEl = document.getElementById('spotifyDockTitle');
    var btnExternal = document.getElementById('btnOpenExternalSpotify');

    if (!dock || !song) return;

    var rawUrl = song.spotifyUrl || '';
    var embedUrl = convertSpotifyToEmbedUrl(rawUrl);

    if (titleEl) titleEl.textContent = '🟢 Spotify: ' + (song.title || 'Áudio');

    if (btnExternal) {
      btnExternal.onclick = function() {
        var targetUrl = rawUrl || ('https://open.spotify.com/search/' + encodeURIComponent((song.title || '') + ' ' + (song.artist || '')));
        window.open(targetUrl, '_blank');
      };
    }

    if (embedUrl && embedUrl.indexOf('/embed/') !== -1) {
      container.innerHTML = '<iframe src="' + embedUrl + '" width="100%" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media; autoplay; clipboard-write; fullscreen"></iframe>';
      dock.classList.remove('hidden');
    } else if (rawUrl) {
      window.open(rawUrl, '_blank');
    } else {
      var searchUrl = 'https://open.spotify.com/search/' + encodeURIComponent((song.title || '') + ' ' + (song.artist || ''));
      window.open(searchUrl, '_blank');
    }
  }

  function closeSpotifyModal() {
    var dock = document.getElementById('spotifyPlayerDock');
    var container = document.getElementById('spotifyPlayerContainer');
    if (container) container.innerHTML = '';
    if (dock) dock.classList.add('hidden');
  }



  function runBatchKeyAndYoutubeDetection() {
    if (!state.currentRepertoireSongs || state.currentRepertoireSongs.length === 0) {
      showToast('Nenhuma música no repertório atual.', 'warning');
      return;
    }

    var updatedCount = 0;
    for (var i = 0; i < state.currentRepertoireSongs.length; i++) {
      var s = state.currentRepertoireSongs[i];
      var changed = false;

      if (!s.originalKey) {
        var detected = TextParser.detectOriginalKey(s.content);
        if (detected) {
          s.originalKey = detected;
          changed = true;
        }
      }

      if (!s.youtubeUrl && s.title) {
        s.youtubeUrl = TextParser.getYouTubeSearchUrl(s.title, s.artist);
        s.youtubeId = TextParser.extractYouTubeId(s.youtubeUrl);
        changed = true;
      }

      if (changed) updatedCount++;
    }

    if (updatedCount > 0) {
      PrompterDB.saveSongsBatch(state.currentRepertoireSongs).then(function() {
        renderSongsList(state.currentRepertoireSongs);
        showToast('⚡ Tons originais e links do YouTube atualizados em ' + updatedCount + ' música(s)!', 'success');
      });
    } else {
      showToast('Todas as músicas já possuem tom original e links configurados.', 'info');
    }
  }

  // ═══════════════════════════════════════
  //  PERSISTÊNCIA DE ESTADO (REFRESH RESILIENTE)
  // ═══════════════════════════════════════

  function saveActiveState(viewName, extra) {
    try {
      var activeState = Object.assign({ view: viewName }, extra || {});
      localStorage.setItem('prompter_active_state', JSON.stringify(activeState));
      if (viewName === 'prompter' && extra && extra.songId) {
        window.location.hash = 'song-' + extra.songId;
      } else if (viewName === 'repertoire' && extra && extra.repertoireId) {
        window.location.hash = 'rep-' + extra.repertoireId;
      } else if (viewName === 'main') {
        if (window.location.hash) history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {
      console.warn('Erro ao salvar estado:', e);
    }
  }

  function restoreActiveState() {
    try {
      var hash = window.location.hash || '';
      var songIdFromHash = null;
      var repIdFromHash = null;

      if (hash.indexOf('#song-') === 0) {
        songIdFromHash = hash.replace('#song-', '');
      } else if (hash.indexOf('#rep-') === 0) {
        repIdFromHash = hash.replace('#rep-', '');
      }

      var saved = localStorage.getItem('prompter_active_state');
      var parsed = saved ? JSON.parse(saved) : null;

      var targetSongId = songIdFromHash || (parsed && parsed.view === 'prompter' ? parsed.songId : null);
      var targetRepId = repIdFromHash || (parsed && (parsed.view === 'repertoire' || parsed.view === 'prompter') ? parsed.repertoireId : null);

      if (targetSongId) {
        return PrompterDB.getSongById(targetSongId).then(function (song) {
          if (song) {
            state.currentSong = song;
            var rId = song.repertoireId || targetRepId;
            if (rId) {
              return PrompterDB.getSongsByRepertoire(rId).then(function (songs) {
                state.currentRepertoireSongs = songs || [];
                return PrompterDB.getRepertoireById(rId);
              }).then(function (rep) {
                if (rep) state.currentRepertoire = rep;
                openPrompterView(song);
                return true;
              }).catch(function () {
                openPrompterView(song);
                return true;
              });
            } else {
              openPrompterView(song);
              return true;
            }
          } else if (targetRepId) {
            openRepertoireSongs(targetRepId);
            return true;
          }
        });
      } else if (targetRepId) {
        openRepertoireSongs(targetRepId);
        return true;
      }
    } catch (e) {
      console.warn('Erro ao restaurar estado:', e);
    }
    return false;
  }

  function bindModalClose(btnId, modalEl) {
    var btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', function () { closeModal(modalEl); });
    }
  }

  // ═══════════════════════════════════════
  //  PROCESSAR ARQUIVOS IMPORTADOS
  // ═══════════════════════════════════════

  function suggestRepertoireName(source) {
    var now = new Date();
    var dd = String(now.getDate()).padStart(2, '0');
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var hh = String(now.getHours()).padStart(2, '0');
    var min = String(now.getMinutes()).padStart(2, '0');
    var suggestion = (source === 'gdrive' ? 'Drive' : 'Importação') + ' ' + dd + '/' + mm + ' ' + hh + 'h' + min;

    var nameInput = document.getElementById('importRepertoireName');
    if (nameInput && !nameInput.value) nameInput.value = suggestion;

    var driveNameInput = document.getElementById('gdriveRepertoireName');
    if (driveNameInput && !driveNameInput.value) driveNameInput.value = 'Drive ' + dd + '/' + mm + ' ' + hh + 'h' + min;
  }

  function normalizeForCompare(str) {
    if (!str) return '';
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  function getLyricsFingerprint(content) {
    if (!content) return '';
    var lines = content.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(function(l) {
      return l && !/^(\s*([A-G][#b]?(m|maj|min|aug|dim|sus|add|[0-9])*)(\/[A-G][#b]?)?\s*)+$/.test(l);
    });
    return normalizeForCompare(lines.slice(0, 3).join(' '));
  }

  function handleFilesToImport(files) {
    var previewList = document.getElementById('importPreviewList');
    if (previewList) previewList.innerHTML = '<div style="text-align:center;padding:1rem;">Processando ' + files.length + ' arquivo(s)...</div>';

    var textFiles = [];
    var audioFiles = [];

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (['.docx', '.doc', '.pdf', '.txt'].indexOf(ext) !== -1) {
        textFiles.push(file);
      } else if (['.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac', '.mp4'].indexOf(ext) !== -1) {
        audioFiles.push(file);
      }
    }

    // Se houver 1 arquivo de texto, sugerir o nome do arquivo para o Repertório
    if (textFiles.length === 1 && !state.targetRepertoireId) {
      var rawName = textFiles[0].name.replace(/\.[^/.]+$/, '').trim();
      var repNameInput = document.getElementById('importRepertoireName');
      if (repNameInput && rawName) {
        repNameInput.value = rawName;
      }
    }

    var parsePromises = textFiles.map(function(tf) {
      return TextParser.parseFile(tf);
    });

    var getSongsPromise = (window.PrompterDB && typeof PrompterDB.getAllSongs === 'function')
      ? PrompterDB.getAllSongs()
      : Promise.resolve([]);

    var getRepsPromise = (window.PrompterDB && typeof PrompterDB.getAllRepertoires === 'function')
      ? PrompterDB.getAllRepertoires()
      : Promise.resolve([]);

    Promise.all([
      Promise.all(parsePromises),
      getSongsPromise,
      getRepsPromise
    ]).then(function(allResults) {
      var results = allResults[0] || [];
      var existingSongs = allResults[1] || [];
      var existingReps = allResults[2] || [];

      var repMap = {};
      existingReps.forEach(function(r) { repMap[r.id] = r.name; });

      var allParsedSongs = [];
      for (var r = 0; r < results.length; r++) {
        var songsInDoc = results[r] || [];
        for (var s = 0; s < songsInDoc.length; s++) {
          allParsedSongs.push(songsInDoc[s]);
        }
      }

      var songsToCreate = (window.GDriveImporter && GDriveImporter.pairSongsWithAudioFiles)
        ? GDriveImporter.pairSongsWithAudioFiles(allParsedSongs, audioFiles)
        : allParsedSongs;

      // Análise de Duplicidades (isolada por repertório de destino)
      var targetRepId = state.targetRepertoireId;
      var seenInBatchTitle = {};
      var seenInBatchLyrics = {};
      var existingTitleMap = {};
      var existingLyricsMap = {};

      if (targetRepId) {
        // Se estamos adicionando a um repertório existente, checa duplicatas apenas dentro dele
        existingSongs.forEach(function(s) {
          if (s.repertoireId === targetRepId) {
            var titleKey = normalizeForCompare(TextParser.cleanTitle(s.title));
            var lyricsKey = getLyricsFingerprint(s.content);
            if (titleKey) existingTitleMap[titleKey] = s;
            if (lyricsKey && lyricsKey.length >= 10) existingLyricsMap[lyricsKey] = s;
          }
        });
      }

      var duplicateCount = 0;
      var annotatedSongs = songsToCreate.map(function(song) {
        var titleKey = normalizeForCompare(TextParser.cleanTitle(song.title));
        var lyricsKey = getLyricsFingerprint(song.content);

        var isDuplicate = false;
        var dupReason = '';

        if (titleKey && seenInBatchTitle[titleKey]) {
          isDuplicate = true;
          dupReason = 'Duplicada no próprio arquivo';
        } else if (lyricsKey && lyricsKey.length >= 10 && seenInBatchLyrics[lyricsKey]) {
          isDuplicate = true;
          dupReason = 'Letra idêntica a outra música deste arquivo';
        }

        if (titleKey) seenInBatchTitle[titleKey] = true;
        if (lyricsKey && lyricsKey.length >= 10) seenInBatchLyrics[lyricsKey] = true;

        if (!isDuplicate && targetRepId) {
          if (titleKey && existingTitleMap[titleKey]) {
            isDuplicate = true;
            dupReason = 'Já existe neste repertório';
          } else if (lyricsKey && lyricsKey.length >= 10 && existingLyricsMap[lyricsKey]) {
            isDuplicate = true;
            dupReason = 'Letra já cadastrada neste repertório';
          }
        }

        if (isDuplicate) duplicateCount++;
        song.isDuplicate = isDuplicate;
        song.dupReason = dupReason;
        return song;
      });

      state.pendingImportSongs = annotatedSongs;

      var html = '';
      if (!annotatedSongs || annotatedSongs.length === 0) {
        html = '<div style="color:var(--text-muted);padding:1rem;text-align:center;">Nenhuma música reconhecida nos arquivos selecionados.</div>';
      } else {
        if (duplicateCount > 0) {
          html +=
            '<div class="import-dup-banner" style="background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.35);border-radius:10px;padding:0.75rem 1rem;margin-bottom:1rem;color:#facc15;font-size:0.88rem;">' +
              '<div style="font-weight:700;display:flex;align-items:center;gap:0.4rem;">⚠️ Notificação de Duplicidade: ' + duplicateCount + ' música(s) repetidas no arquivo.</div>' +
              '<label style="display:flex;align-items:center;gap:0.5rem;margin-top:0.4rem;cursor:pointer;color:var(--text-main);font-size:0.84rem;">' +
                '<input type="checkbox" id="chkIgnoreDuplicates"> ' +
                '<span><b>Ignorar duplicadas</b> (salvar apenas as músicas inéditas)</span>' +
              '</label>' +
            '</div>';
        }

        for (var k = 0; k < annotatedSongs.length; k++) {
          var song = annotatedSongs[k];
          var numTag = song.trackNumber ? (song.trackNumber < 10 ? '0' + song.trackNumber : song.trackNumber) + '. ' : '';
          var itemStyle = song.isDuplicate ? 'style="border-left: 3px solid #eab308; background: rgba(234,179,8,0.04);"' : '';
          html +=
            '<div class="import-preview-item" ' + itemStyle + '>' +
              '<span class="import-preview-icon">' + (song.isDuplicate ? '⚠️' : '🎵') + '</span>' +
              '<div class="import-preview-info">' +
                '<b>' + numTag + escapeHtml(song.title || 'Sem Título') + '</b>' +
                (song.key ? ' <span class="badge badge-key">' + escapeHtml(song.key) + '</span>' : '') +
                (song.rhythm ? ' <span class="badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;font-size:0.75rem;padding:2px 6px;border-radius:5px;">🥁 ' + escapeHtml(song.rhythm) + '</span>' : '') +
                (song.youtubeUrl ? ' <span class="badge" style="background:rgba(239,68,68,0.15);color:#f87171;font-size:0.75rem;padding:2px 6px;border-radius:5px;">▶ Vídeo</span>' : '') +
                (song.isDuplicate ? ' <span class="badge" style="background:rgba(234,179,8,0.2);color:#facc15;font-size:0.75rem;padding:2px 6px;border-radius:5px;">⚠️ ' + escapeHtml(song.dupReason) + '</span>' : '') +
                (song.audioBlob ? '<br><span class="import-audio-tag">🎵 ' + escapeHtml(song.audioName) + '</span>' : '') +
              '</div>' +
            '</div>';
        }
      }

      if (previewList) previewList.innerHTML = html;
      var btnSave = document.getElementById('btnSaveImportedSongs');
      if (btnSave && annotatedSongs.length > 0) btnSave.removeAttribute('disabled');
    }).catch(function(err) {
      console.error('Erro no processamento de arquivos:', err);
      if (previewList) previewList.innerHTML = '<div style="color:var(--danger-color);padding:1rem;">Erro ao ler arquivos (' + escapeHtml(err.message || 'Formato incompatível') + '). Tente novamente.</div>';
    });
  }

  function saveImportedFiles() {
    if (!state.pendingImportSongs || state.pendingImportSongs.length === 0) return;

    var nameInput = document.getElementById('importRepertoireName');
    var repName = (nameInput && nameInput.value.trim()) || ('Importação ' + formatDate(Date.now()));
    
    // Se o usuário está na visão principal (fora de um repertório), SEMPRE cria um novo repertório
    var targetRepId = state.currentRepertoire ? state.targetRepertoireId : null;

    var user = (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
    var curEmail = user ? (user.email || '').toLowerCase() : '';
    var curId = user ? user.id : 'local_anonymous';

    var chkIgnore = document.getElementById('chkIgnoreDuplicates');
    var shouldIgnoreDupes = chkIgnore ? chkIgnore.checked : false;

    var songsToSave = state.pendingImportSongs.filter(function(s) {
      return !shouldIgnoreDupes || !s.isDuplicate;
    });

    if (songsToSave.length === 0) {
      showToast('⚠️ Nenhuma música nova para salvar (todas eram duplicadas).', 'warning');
      return;
    }

    var count = songsToSave.length;
    var ignoredCount = state.pendingImportSongs.length - songsToSave.length;

    function doSave(repId) {
      PrompterDB.getSongsByRepertoire(repId).then(function(existing) {
        var startTrack = 0;
        if (existing && existing.length > 0) {
          existing.forEach(function(ex) {
            var num = parseInt(ex.trackNumber, 10) || 0;
            if (num > startTrack) startTrack = num;
          });
        }
        for (var s = 0; s < songsToSave.length; s++) {
          songsToSave[s].repertoireId = repId;
          songsToSave[s].user_id = curId;
          songsToSave[s].user_email = curEmail;
          songsToSave[s].trackNumber = startTrack + s + 1;
        }
        return PrompterDB.saveSongsBatch(songsToSave);
      }).then(function () {
        closeModal(importModal);
        state.pendingImportSongs = [];

        var previewList = document.getElementById('importPreviewList');
        if (previewList) previewList.innerHTML = '';
        var btnSave = document.getElementById('btnSaveImportedSongs');
        if (btnSave) btnSave.setAttribute('disabled', 'true');
        var ni = document.getElementById('importRepertoireName');
        if (ni) { ni.value = ''; ni.removeAttribute('disabled'); }
        state.targetRepertoireId = null;

        var successMsg = '🎉 ' + count + ' música(s) salvas no repertório!';
        if (ignoredCount > 0) {
          successMsg += ' (' + ignoredCount + ' duplicada(s) ignoradas)';
        }
        showToast(successMsg, 'success');

        if (state.currentRepertoire && state.currentRepertoire.id === repId) {
          openRepertoireSongs(repId);
        } else {
          var mainView = document.getElementById('mainRepertoireView');
          var songsView = document.getElementById('repertoireSongsView');
          if (mainView) mainView.classList.remove('hidden');
          if (songsView) songsView.classList.add('hidden');
          state.currentRepertoire = null;
          loadRepertoires();
        }
      }).catch(function (err) {
        console.error('Erro ao salvar músicas:', err);
        showToast('Erro ao salvar músicas no banco.', 'warning');
      });
    }

    if (targetRepId) {
      doSave(targetRepId);
    } else {
      PrompterDB.saveRepertoire({
        name: repName,
        source: 'local',
        user_id: curId,
        user_email: curEmail
      }).then(function (newRepId) {
        doSave(newRepId);
      });
    }
  }

  // ═══════════════════════════════════════
  //  IMPORTAÇÃO VIA GOOGLE DRIVE
  // ═══════════════════════════════════════

  // ═══════════════════════════════════════
  //  IMPORTAÇÃO STREAMING VIA GOOGLE DRIVE (EM SEGUNDO PLANO)
  // ═══════════════════════════════════════

  var repCache = {};

  function onDriveStreamBatch(songsBatch) {
    if (!songsBatch || songsBatch.length === 0) return;

    var defaultNameInput = document.getElementById('gdriveRepertoireName');
    var defaultName = (defaultNameInput && defaultNameInput.value.trim()) || ('Drive ' + formatDate(Date.now()));

    // Agrupar músicas por subpasta
    var groups = {};
    songsBatch.forEach(function (song) {
      var groupName = song.subfolderName || defaultName;
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(song);
    });

    var groupNames = Object.keys(groups);
    var promises = groupNames.map(function (gName) {
      var songsInGroup = groups[gName];

      if (repCache[gName]) {
        var repId = repCache[gName];
        songsInGroup.forEach(function (s) { s.repertoireId = repId; });
        return PrompterDB.saveSongsBatch(songsInGroup).then(function () {
          if (state.currentRepertoire && state.currentRepertoire.id === repId) {
            openRepertoireSongs(repId);
          } else {
            loadRepertoires();
          }
        });
      } else {
        return PrompterDB.saveRepertoire({ name: gName, source: 'gdrive' })
          .then(function (newRepId) {
            repCache[gName] = newRepId;
            songsInGroup.forEach(function (s) { s.repertoireId = newRepId; });
            return PrompterDB.saveSongsBatch(songsInGroup);
          })
          .then(function () {
            if (!state.currentRepertoire && repCache[gName]) {
              openRepertoireSongs(repCache[gName]);
            } else if (state.currentRepertoire && state.currentRepertoire.id === repCache[gName]) {
              openRepertoireSongs(repCache[gName]);
            } else {
              loadRepertoires();
            }
          });
      }
    });

    Promise.all(promises).catch(function (err) { console.error(err); });
  }

  function updateImportBanner(current, total) {
    var banner = document.getElementById('importProgressBanner');
    var fill = document.getElementById('ipbFill');
    var status = document.getElementById('ipbStatus');
    var title = document.getElementById('ipbTitle');

    if (!banner) return;
    banner.classList.remove('hidden');

    var pct = Math.round((current / total) * 100);
    if (fill) fill.style.width = pct + '%';
    if (status) status.textContent = current + ' / ' + total + ' (' + pct + '%)';
    if (title) title.textContent = '⚡ Baixando e organizando músicas do Google Drive em segundo plano...';
  }

  function finishImportBanner(total) {
    var banner = document.getElementById('importProgressBanner');
    var fill = document.getElementById('ipbFill');
    var status = document.getElementById('ipbStatus');
    var title = document.getElementById('ipbTitle');

    if (!banner) return;
    if (fill) fill.style.width = '100%';
    if (status) status.textContent = total + ' / ' + total + ' (100%)';
    if (title) title.textContent = '🎉 Importação concluída! ' + total + ' arquivo(s) adicionados ao repertório.';

    repCache = {};

    setTimeout(function () {
      banner.classList.add('hidden');
    }, 4000);
  }

  // ═══════════════════════════════════════
  //  EDITOR MANUAL DE MÚSICA
  // ═══════════════════════════════════════

  function openEditorModal(song) {
    var form = document.getElementById('songForm');
    if (form) form.reset();
    document.getElementById('currentAudioName').textContent = '';

    if (song) {
      state.editingSong = song;
      document.getElementById('editorModalTitle').textContent = 'Editar Música';
      document.getElementById('editSongId').value = song.id || '';
      document.getElementById('editSongTitle').value = song.title || '';
      var rhythmInput = document.getElementById('editSongRhythm');
      if (rhythmInput) rhythmInput.value = song.rhythm || '';

      var editKeyEl = document.getElementById('editSongKey');
      if (editKeyEl) {
        if (window.Transposer && typeof window.Transposer.setSelectKey === 'function') {
          window.Transposer.setSelectKey(editKeyEl, song.key);
        } else {
          editKeyEl.value = song.key || '';
        }
      }

      var origKeySelect = document.getElementById('editSongOriginalKey');
      if (origKeySelect) {
        if (window.Transposer && typeof window.Transposer.setSelectKey === 'function') {
          window.Transposer.setSelectKey(origKeySelect, song.originalKey);
        } else {
          origKeySelect.value = song.originalKey || '';
        }
      }
      var ytInput = document.getElementById('editSongYoutubeUrl');
      if (ytInput) ytInput.value = song.youtubeUrl || '';
      var spInput = document.getElementById('editSongSpotifyUrl');
      if (spInput) spInput.value = song.spotifyUrl || '';
      document.getElementById('editSongArtist').value = song.artist || '';
      document.getElementById('editSongComposer').value = song.composer || '';
      document.getElementById('editSongContent').value = song.content || '';
      if (song.audioName) {
        document.getElementById('currentAudioName').textContent = 'Áudio atual: ' + song.audioName;
      }
      document.getElementById('btnDeleteSong').classList.remove('hidden');
    } else {
      state.editingSong = null;
      document.getElementById('editorModalTitle').textContent = 'Nova Música';
      document.getElementById('editSongId').value = '';
      var rhythmInput2 = document.getElementById('editSongRhythm');
      if (rhythmInput2) rhythmInput2.value = '';
      var origKeySelect2 = document.getElementById('editSongOriginalKey');
      if (origKeySelect2) origKeySelect2.value = '';
      var ytInput2 = document.getElementById('editSongYoutubeUrl');
      if (ytInput2) ytInput2.value = '';
      var spInput2 = document.getElementById('editSongSpotifyUrl');
      if (spInput2) spInput2.value = '';
      document.getElementById('btnDeleteSong').classList.add('hidden');
    }

    var audioFileInput = document.getElementById('editSongAudioFile');
    if (audioFileInput && !audioFileInput._hasChangeListener) {
      audioFileInput._hasChangeListener = true;
      audioFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          document.getElementById('currentAudioName').textContent = '📎 Novo arquivo selecionado: ' + this.files[0].name;
        }
      });
    }

    openModal(songEditorModal);
  }

  function saveManualSong() {
    var id = document.getElementById('editSongId').value;
    var title = document.getElementById('editSongTitle').value.trim();
    var rhythmEl = document.getElementById('editSongRhythm');
    var rhythm = rhythmEl ? rhythmEl.value.trim() : '';
    var key = document.getElementById('editSongKey').value;
    var origKeyEl = document.getElementById('editSongOriginalKey');
    var originalKey = origKeyEl ? origKeyEl.value : '';
    var ytEl = document.getElementById('editSongYoutubeUrl');
    var youtubeUrl = ytEl ? ytEl.value.trim() : '';
    var spEl = document.getElementById('editSongSpotifyUrl');
    var spotifyUrl = spEl ? spEl.value.trim() : '';
    var artist = document.getElementById('editSongArtist').value.trim();
    var composer = document.getElementById('editSongComposer').value.trim();
    var content = document.getElementById('editSongContent').value;
    if (window.TextParser && typeof window.TextParser.normalizeRawInputText === 'function') {
      content = window.TextParser.normalizeRawInputText(content);
    }
    var audioFileInput = document.getElementById('editSongAudioFile');

    if (!title) {
      showToast('Por favor, informe o nome da música.', 'warning');
      return;
    }

    if (window.Transposer && typeof window.Transposer.normalizeKey === 'function') {
      if (key) key = window.Transposer.normalizeKey(key);
      if (originalKey) originalKey = window.Transposer.normalizeKey(originalKey);
    }

    if (!originalKey) {
      originalKey = TextParser.detectOriginalKey(content) || key;
    }

    var youtubeId = TextParser.extractYouTubeId(youtubeUrl);

    var repId = state.currentRepertoire ? state.currentRepertoire.id : 0;
    if (state.editingSong) repId = state.editingSong.repertoireId || repId;

    var songData = {
      title: title,
      key: key,
      originalKey: originalKey,
      rhythm: rhythm,
      youtubeUrl: youtubeUrl,
      youtubeId: youtubeId,
      spotifyUrl: spotifyUrl,
      artist: artist,
      composer: composer,
      content: content,
      repertoireId: repId
    };

    if (id) songData.id = id;

    // Preservar metadados existentes da música editada
    if (state.editingSong) {
      if (state.editingSong.trackNumber !== undefined) songData.trackNumber = state.editingSong.trackNumber;
      if (state.editingSong.order !== undefined) songData.order = state.editingSong.order;
      if (state.editingSong.isOfflinePinned !== undefined) songData.isOfflinePinned = state.editingSong.isOfflinePinned;
      if (state.editingSong.audioBlob) {
        songData.audioBlob = state.editingSong.audioBlob;
        songData.audioName = state.editingSong.audioName;
      }
    }

    if (audioFileInput && audioFileInput.files.length > 0) {
      var audioFile = audioFileInput.files[0];
      songData.audioBlob = audioFile;
      songData.audioName = audioFile.name;
    }

    var saveFunc = function (rId) {
      songData.repertoireId = rId;
      PrompterDB.saveSong(songData)
        .then(function (savedId) {
          songData.id = savedId;
          showToast('Música salva com sucesso!', 'success');
          closeModal(songEditorModal);

          // Atualizar lista em memória imediatamente
          if (state.currentRepertoireSongs && state.currentRepertoireSongs.length > 0) {
            var found = false;
            for (var k = 0; k < state.currentRepertoireSongs.length; k++) {
              if (state.currentRepertoireSongs[k].id === songData.id) {
                state.currentRepertoireSongs[k] = Object.assign({}, state.currentRepertoireSongs[k], songData);
                found = true;
                break;
              }
            }
            if (!found && rId === (state.currentRepertoire ? state.currentRepertoire.id : null)) {
              state.currentRepertoireSongs.push(songData);
            }
            renderSongsList(state.currentRepertoireSongs);
          }

          if (state.currentRepertoire && state.currentRepertoire.id === rId) {
            openRepertoireSongs(state.currentRepertoire.id);
          } else if (!state.currentRepertoire) {
            loadRepertoires();
          }

          // Se a música editada estiver aberta no modo Prompter / Palco, recarrega-la
          if (state.currentSong && state.currentSong.id === songData.id) {
            state.currentSong = Object.assign({}, state.currentSong, songData);
            openPrompterView(state.currentSong);
          }
        }).catch(function(err) {
          console.error('Erro ao salvar música:', err);
          showToast('Erro ao salvar música.', 'warning');
        });
    };

    if (!repId && !id) {
      PrompterDB.saveRepertoire({ name: 'Músicas Manuais', source: 'manual' })
        .then(function (newRepId) { saveFunc(newRepId); });
    } else {
      saveFunc(repId);
    }
  }

  // ═══════════════════════════════════════
  //  IMPRESSÃO
  // ═══════════════════════════════════════

  function printRepertoire(repId) {
    PrompterDB.getRepertoireById(repId).then(function (rep) {
      if (!rep) return;
      PrompterDB.getSongsByRepertoire(repId).then(function (songs) {
        buildPrintView(rep, songs);
        setTimeout(function () {
          window.print();
        }, 150);
      });
    });
  }

  function getSongLyricIntro(content) {
    if (!content) return '';
    var lines = content.split('\n');
    var lyricLines = [];

    for (var i = 0; i < lines.length && lyricLines.length < 2; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      // Pular tags e metadados
      if (/^(tom|ritmo|bpm|intro|introdução|refrão|estrofe|solo|interlúdio|parte\s+[a-z0-9]|compasso|afinação)\s*[:：]/i.test(line)) continue;
      if (/^\[.*\]$/.test(line)) continue;
      // Pular linhas de acordes se detectado
      if (window.TextParser && window.TextParser.isChordLine(line)) continue;
      // Pular linhas curtas de pontuação
      if (line.length < 3) continue;

      lyricLines.push(line);
    }
    return lyricLines.join(' / ');
  }

  function buildPrintView(rep, songs) {
    var printArea = document.getElementById('printArea');
    if (!printArea) return;

    var repName = (rep.name || 'REPERTÓRIO').toUpperCase();

    var html =
      '<div class="stage-setlist-container">' +
        '<div class="stage-setlist-header">' +
          '<h1 class="stage-setlist-title">SETLIST: ' + escapeHtml(repName) + '</h1>' +
          '<div class="stage-setlist-meta">' + songs.length + ' MÚSICAS</div>' +
        '</div>' +
        '<div class="stage-setlist-list">';

    for (var i = 0; i < songs.length; i++) {
      var s = songs[i];
      var num = (s.trackNumber !== null && s.trackNumber !== undefined) ? s.trackNumber : (i + 1);
      var numStr = (num < 10 ? '0' : '') + num + '.';
      var title = (s.title || 'SEM TÍTULO').toUpperCase();

      var metaParts = [];
      if (s.key) metaParts.push(s.key.toUpperCase());
      if (s.rhythm) metaParts.push(s.rhythm.toUpperCase());
      var metaStr = metaParts.length > 0 ? ' (' + escapeHtml(metaParts.join(' - ')) + ')' : '';

      var lyricIntro = getSongLyricIntro(s.content);

      html +=
        '<div class="stage-setlist-row">' +
          '<div class="stage-setlist-title-line">' +
            '<span class="stage-setlist-num">' + numStr + '</span>' +
            '<span class="stage-setlist-name">' + escapeHtml(title) + '</span>' +
            (metaStr ? '<span class="stage-setlist-key">' + metaStr + '</span>' : '') +
          '</div>' +
          (lyricIntro ? '<div class="stage-setlist-lyric-intro">' + escapeHtml(lyricIntro) + '</div>' : '') +
        '</div>';
    }

    html +=
        '</div>' +
      '</div>';

    printArea.innerHTML = html;
  }

  // ═══════════════════════════════════════
  //  UTILITÁRIOS
  // ═══════════════════════════════════════

  function openModal(modalEl) { if (modalEl) modalEl.classList.remove('hidden'); }
  function closeModal(modalEl) { if (modalEl) modalEl.classList.add('hidden'); }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function showToast(msg, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3500);
  }

  // Sugerir nome ao abrir o modal do Drive
  var gDriveModal2 = document.getElementById('gDriveModal');
  var btnGDriveModalTrigger = document.getElementById('btnGDriveModal');
  if (btnGDriveModalTrigger) {
    btnGDriveModalTrigger.addEventListener('click', function () {
      suggestRepertoireName('gdrive');
    });
  }

  // Botão: Salvar tudo no Servidor (Supabase)
  var btnPushCloud = document.getElementById('btnPushToCloud');
  if (btnPushCloud) {
    btnPushCloud.addEventListener('click', function () {
      showToast('☁️ Sincronização em tempo real ativa no Supabase!', 'info');
      loadRepertoiresGrid();
    });
  }

  function initAuthAndAdminUI() {
    var landingNav = document.getElementById('landingHeaderNav');
    var appHeader = document.getElementById('appHeader');
    var landingSec = document.getElementById('landingPageSection');
    var tabRep = document.getElementById('tabRepertoire');
    var authModal = document.getElementById('authModal');
    var authOverlay = document.getElementById('authModalOverlay');
    var btnCloseAuth = document.querySelector('.btn-close-auth');
    var tabAuthSignIn = document.getElementById('tabAuthSignIn');
    var tabAuthSignUp = document.getElementById('tabAuthSignUp');
    var btnSubmitAuth = document.getElementById('btnSubmitAuthPrimary');
    var authSubtitleText = document.getElementById('authSubtitleText');
    var btnOpenAdminPanel = document.getElementById('btnOpenAdminPanel');
    var btnAuthToggle = document.getElementById('btnAuthToggle');

    var currentAuthMode = 'signin'; // 'signin' ou 'signup'

    function showLanding() {
      document.documentElement.classList.remove('canta-auth-active');
      if (landingNav) landingNav.classList.remove('hidden');
      if (landingSec) landingSec.classList.remove('hidden');
      if (appHeader) appHeader.classList.add('hidden');
      if (tabRep) {
        tabRep.classList.add('hidden');
        tabRep.classList.remove('active');
      }
    }

    function showApp() {
      document.documentElement.classList.add('canta-auth-active');
      if (authModal) authModal.classList.add('hidden');
      if (landingNav) landingNav.classList.add('hidden');
      if (landingSec) landingSec.classList.add('hidden');
      if (appHeader) appHeader.classList.remove('hidden');
      if (tabRep) {
        tabRep.classList.remove('hidden');
        tabRep.classList.add('active');
      }
      if (searchInput) searchInput.value = '';
      loadRepertoires();
    }

    function closeAuthModal() {
      if (authModal) authModal.classList.add('hidden');
    }

    var forgotContainer = document.getElementById('forgotPasswordContainer');
    var btnForgotPassword = document.getElementById('btnForgotPassword');

    function setAuthMode(mode) {
      currentAuthMode = mode;
      var signUpFields = document.getElementById('signUpFieldsGroup');
      if (mode === 'signup') {
        if (tabAuthSignUp) tabAuthSignUp.classList.add('active');
        if (tabAuthSignIn) tabAuthSignIn.classList.remove('active');
        if (signUpFields) signUpFields.classList.remove('hidden');
        if (btnSubmitAuth) btnSubmitAuth.innerText = 'Finalizar Cadastro & Acessar';
        if (authSubtitleText) authSubtitleText.innerText = 'Preencha seus dados para criar sua conta de cantor';
        if (forgotContainer) forgotContainer.style.display = 'none';
      } else {
        if (tabAuthSignIn) tabAuthSignIn.classList.add('active');
        if (tabAuthSignUp) tabAuthSignUp.classList.remove('active');
        if (signUpFields) signUpFields.classList.add('hidden');
        if (btnSubmitAuth) btnSubmitAuth.innerText = 'Entrar na Conta';
        if (authSubtitleText) authSubtitleText.innerText = 'Acesse sua conta para ver seus repertórios';
        if (forgotContainer) forgotContainer.style.display = 'block';
      }
    }

    function openAuthModal(mode) {
      setAuthMode(mode || 'signin');
      if (authModal) authModal.classList.remove('hidden');
    }

    window.showLandingPage = showLanding;
    window.showAppDashboard = showApp;

    if (window.PrompterAuth) PrompterAuth.init();
    if (window.PrompterAdmin) PrompterAdmin.init();

    // Máscaras de Telefone e CPF
    var authPhoneInput = document.getElementById('authPhone');
    if (authPhoneInput) {
      authPhoneInput.addEventListener('input', function (e) {
        var v = e.target.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 6) {
          e.target.value = '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
        } else if (v.length > 2) {
          e.target.value = '(' + v.slice(0, 2) + ') ' + v.slice(2);
        } else if (v.length > 0) {
          e.target.value = '(' + v;
        }
      });
    }

    var authCpfInput = document.getElementById('authCpf');
    if (authCpfInput) {
      authCpfInput.addEventListener('input', function (e) {
        var v = e.target.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 9) {
          e.target.value = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9);
        } else if (v.length > 6) {
          e.target.value = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
        } else if (v.length > 3) {
          e.target.value = v.slice(0, 3) + '.' + v.slice(3);
        }
      });
    }

    var authSingerCodeInput = document.getElementById('authSingerCode');
    var authSingerCodeFeedback = document.getElementById('authSingerCodeFeedback');
    var singerCodeDebounce = null;

    if (authSingerCodeInput && authSingerCodeFeedback) {
      authSingerCodeInput.addEventListener('input', function (e) {
        var val = (e.target.value || '').trim();
        clearTimeout(singerCodeDebounce);
        if (!val) {
          authSingerCodeFeedback.style.display = 'none';
          return;
        }

        authSingerCodeFeedback.style.display = 'block';
        authSingerCodeFeedback.style.color = '#94a3b8';
        authSingerCodeFeedback.innerText = '🔍 Verificando disponibilidade...';

        singerCodeDebounce = setTimeout(function () {
          PrompterAuth.checkSingerCodeAvailability(val, null).then(function (res) {
            if (res.available) {
              authSingerCodeFeedback.style.display = 'block';
              authSingerCodeFeedback.style.color = '#34d399';
              authSingerCodeFeedback.innerText = '✅ ' + res.message;
            } else {
              authSingerCodeFeedback.style.display = 'block';
              authSingerCodeFeedback.style.color = '#f87171';
              authSingerCodeFeedback.innerText = '❌ ' + res.message;
            }
          });
        }, 300);
      });
    }

    if (tabAuthSignIn) {
      tabAuthSignIn.addEventListener('click', function () { setAuthMode('signin'); });
    }
    if (tabAuthSignUp) {
      tabAuthSignUp.addEventListener('click', function () { setAuthMode('signup'); });
    }

    if (btnCloseAuth) {
      btnCloseAuth.addEventListener('click', closeAuthModal);
    }
    if (authOverlay) {
      authOverlay.addEventListener('click', closeAuthModal);
    }

    if (btnForgotPassword) {
      btnForgotPassword.addEventListener('click', function (e) {
        e.preventDefault();
        var email = prompt('Digite o e-mail da sua conta para redefinir a senha:');
        if (email && email.trim()) {
          showToast('Enviando link de recuperação...', 'info');
          PrompterAuth.resetPassword(email.trim()).then(function () {
            showToast('Link de recuperação enviado para ' + email.trim() + '!', 'success');
          }).catch(function (err) {
            showToast(err.message || 'Erro ao enviar recuperação.', 'warning');
          });
        }
      });
    }

    function handleAuthSubmit() {
      var emailEl = document.getElementById('authEmail');
      var passEl = document.getElementById('authPassword');
      var email = emailEl ? emailEl.value.trim() : '';
      var pass = passEl ? passEl.value : '';

      if (!email || !pass) {
        showToast('Preencha e-mail e senha.', 'warning');
        return;
      }

      if (currentAuthMode === 'signup') {
        var nameEl = document.getElementById('authName');
        var singerCodeEl = document.getElementById('authSingerCode');
        var phoneEl = document.getElementById('authPhone');
        var cpfEl = document.getElementById('authCpf');
        var instaEl = document.getElementById('authInstagram');
        var couponEl = document.getElementById('authCouponCode');

        var name = nameEl ? nameEl.value.trim() : '';
        var singerCode = singerCodeEl ? singerCodeEl.value.trim() : '';
        var phone = phoneEl ? phoneEl.value.trim() : '';
        var cpf = cpfEl ? cpfEl.value.trim() : '';
        var instagram = instaEl ? instaEl.value.trim() : '';
        var couponCode = couponEl ? couponEl.value.trim() : '';

        if (!name) {
          showToast('Por favor, informe seu Nome Completo ou Artístico.', 'warning');
          return;
        }

        if (!singerCode) {
          showToast('Por favor, escolha seu @Login / Palco.', 'warning');
          return;
        }

        if (!phone) {
          showToast('Por favor, informe seu WhatsApp com DDD.', 'warning');
          return;
        }

        showToast('Verificando @Login / Palco...', 'info');
        PrompterAuth.checkSingerCodeAvailability(singerCode, null).then(function (checkRes) {
          if (!checkRes.available) {
            showToast(checkRes.message || 'Este @Login / Palco já está em uso.', 'warning');
            return;
          }

          showToast('Criando e configurando sua conta...', 'info');
          return PrompterAuth.signUp({
            name: name,
            singerCode: singerCode,
            phone: phone,
            cpf: cpf,
            instagram: instagram,
            couponCode: couponCode,
            email: email,
            password: pass
          }).then(function () {
            showToast('🎉 Conta criada com sucesso! Bem-vindo ao CantaAí PRO!', 'success');
            showApp();
          });
        }).catch(function (err) {
          showToast(err.message || 'Erro ao criar conta.', 'warning');
        });
      } else {
        showToast('Autenticando...', 'info');
        PrompterAuth.signIn(email, pass).then(function () {
          showToast('🎉 Bem-vindo ao CantaAí PRO!', 'success');
          showApp();
        }).catch(function (err) {
          showToast(err.message || 'E-mail ou senha incorretos.', 'warning');
        });
      }
    }

    if (btnSubmitAuth) {
      btnSubmitAuth.addEventListener('click', function (e) {
        e.preventDefault();
        handleAuthSubmit();
      });
    }

    var formAuth = document.getElementById('formAuth');
    if (formAuth) {
      formAuth.addEventListener('submit', function (e) {
        e.preventDefault();
        handleAuthSubmit();
      });
    }

    // ── CONTROLES DO DROPDOWN DE PERFIL DO USUÁRIO ENTERPRISE ──
    var btnUserProfileTrigger = document.getElementById('btnUserProfileTrigger');
    var userProfileMenu = document.getElementById('userProfileMenu');
    var btnProfileAdmin = document.getElementById('btnProfileAdminGovernance');
    var btnProfileLogout = document.getElementById('btnProfileLogout');
    var btnProfileDetails = document.getElementById('btnProfileAccountDetails');
    var btnProfileThemeToggle = document.getElementById('btnProfileThemeToggle');

    if (btnUserProfileTrigger && userProfileMenu) {
      btnUserProfileTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        userProfileMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', function (e) {
        if (!userProfileMenu.classList.contains('hidden') && !userProfileMenu.contains(e.target) && e.target !== btnUserProfileTrigger) {
          userProfileMenu.classList.add('hidden');
        }
      });
    }

    if (btnProfileAdmin) {
      btnProfileAdmin.addEventListener('click', function () {
        if (userProfileMenu) userProfileMenu.classList.add('hidden');
        if (window.PrompterAdmin) PrompterAdmin.openModal();
      });
    }

    // ── MODAL DE PERFIL DO CANTOR & GOVERNANÇA DE ASSINATURA ──
    var profileModal = document.getElementById('profileModal');
    var btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
    var btnCancelProfileModal = document.getElementById('btnCancelProfileModal');
    var profileModalOverlay = document.getElementById('profileModalOverlay');
    var btnSaveProfileSettings = document.getElementById('btnSaveProfileSettings');
    var profileDisplayNameInput = document.getElementById('profileDisplayNameInput');
    var profileSingerCodeInput = document.getElementById('profileSingerCodeInput');
    var profileModalAvatar = document.getElementById('profileModalAvatar');
    var profileModalEmail = document.getElementById('profileModalEmail');
    var profileModalCodePill = document.getElementById('profileModalCodePill');
    var profileSubPlanBadge = document.getElementById('profileSubPlanBadge');
    var btnUpgradePlan = document.getElementById('btnUpgradePlan');
    var btnManageOrCancelPlan = document.getElementById('btnManageOrCancelPlan');

    function openProfileModal() {
      if (!profileModal) return;
      var profile = PrompterAuth.getProfile();
      var user = PrompterAuth.getUser();
      var email = (profile && profile.email) ? profile.email : (user ? user.email : '');
      var isPro = (profile && profile.plan_tier === 'pro') || email === 'leovitulli@gmail.com';
      var isAdm = PrompterAuth.isAdmin();
      var code = (profile && profile.singer_code) ? profile.singer_code : (isAdm ? '#DEV-ADMIN' : '#CANTOR-PRO');
      var displayName = (profile && profile.display_name) ? profile.display_name : (email.split('@')[0] || 'Cantor');
      displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
      var initial = (displayName.charAt(0) || 'U').toUpperCase();

      if (profileModalAvatar) profileModalAvatar.innerText = initial;
      if (profileModalEmail) profileModalEmail.innerText = email;
      if (profileModalCodePill) profileModalCodePill.innerText = 'Código: ' + code;
      if (profileDisplayNameInput) profileDisplayNameInput.value = (profile && profile.display_name) ? profile.display_name : displayName;
      if (profileSingerCodeInput) profileSingerCodeInput.value = code;

      if (profileSubPlanBadge) {
        profileSubPlanBadge.innerHTML = isPro ? '👑 PLANO CANTAAÍ PRO' : '⚡ PLANO FREE';
      }
      if (btnUpgradePlan) {
        if (isPro) btnUpgradePlan.classList.add('hidden');
        else btnUpgradePlan.classList.remove('hidden');
      }

      openModal(profileModal);
    }

    function closeProfileModal() {
      if (profileModal) closeModal(profileModal);
    }

    if (btnProfileDetails) {
      btnProfileDetails.addEventListener('click', function () {
        if (userProfileMenu) userProfileMenu.classList.add('hidden');
        openProfileModal();
      });
    }

    if (btnCloseProfileModal) btnCloseProfileModal.addEventListener('click', closeProfileModal);
    if (btnCancelProfileModal) btnCancelProfileModal.addEventListener('click', closeProfileModal);
    if (profileModalOverlay) profileModalOverlay.addEventListener('click', closeProfileModal);

    if (btnSaveProfileSettings) {
      btnSaveProfileSettings.addEventListener('click', function () {
        var newName = (profileDisplayNameInput ? profileDisplayNameInput.value : '').trim();
        var newCode = (profileSingerCodeInput ? profileSingerCodeInput.value : '').trim();
        if (!newName) {
          showToast('Por favor, informe seu nome artístico ou de cantor.', 'warning');
          return;
        }
        PrompterAuth.saveProfileDetails(newName, newCode).then(function () {
          showToast('✅ Nome e @Login de Palco atualizados com sucesso!', 'success');
          closeProfileModal();
        }).catch(function (err) {
          showToast(err.message || 'Erro ao salvar alterações.', 'warning');
        });
      });
    }

    if (btnManageOrCancelPlan) {
      btnManageOrCancelPlan.addEventListener('click', function () {
        var isPro = (PrompterAuth.getProfile() && PrompterAuth.getProfile().plan_tier === 'pro') || (PrompterAuth.getUser() && PrompterAuth.getUser().email === 'leovitulli@gmail.com');
        if (isPro) {
          if (confirm('Deseja gerenciar ou cancelar sua assinatura PRO?\n\nAo cancelar, você continuará com acesso PRO ilimitado até o final do ciclo faturado.')) {
            showToast('Solicitação de gerenciamento enviada. Você mantém acesso até o fim do ciclo.', 'info');
          }
        } else {
          showToast('Você está no plano Free. Escolha o Plano PRO para desbloquear todos os recursos.', 'info');
        }
      });
    }

    var checkoutModal = document.getElementById('checkoutSaaSModal');
    var btnCloseCheckout = document.getElementById('btnCloseCheckoutModal');
    var checkoutOverlay = document.getElementById('checkoutModalOverlay');
    var cardPlanAnnual = document.getElementById('cardPlanAnnual');
    var cardPlanMonthly = document.getElementById('cardPlanMonthly');
    var btnPayPix = document.getElementById('btnPayPix');
    var btnPayCard = document.getElementById('btnPayCard');
    var checkoutPixBox = document.getElementById('checkoutPixBox');
    var checkoutCardBox = document.getElementById('checkoutCardBox');
    var btnApplyCoupon = document.getElementById('btnApplyCheckoutCoupon');
    var inputCoupon = document.getElementById('inputCheckoutCoupon');
    var couponAlert = document.getElementById('checkoutCouponAlert');
    var totalDisplay = document.getElementById('checkoutTotalDisplay');
    var btnConfirmCheckout = document.getElementById('btnConfirmSaaSCheckout');

    var selectedPlan = 'annual'; // 'annual' ou 'monthly'
    var appliedCoupon = null;

    function calculateCheckoutTotal() {
      var basePrice = selectedPlan === 'annual' ? 299.00 : 39.90;
      var finalPrice = basePrice;

      if (appliedCoupon) {
        if (appliedCoupon.type === 'vip' || appliedCoupon.code === 'VIP100') {
          finalPrice = 0.00;
        } else if (appliedCoupon.type === 'percent') {
          var pct = parseInt(appliedCoupon.discount, 10) || 50;
          finalPrice = basePrice * ((100 - pct) / 100);
        }
      }

      if (totalDisplay) {
        if (finalPrice === 0) {
          totalDisplay.innerHTML = '<span style="color:#34d399;">GRÁTIS (CUPOM VIP 100% OFF)</span>';
        } else {
          totalDisplay.innerText = finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + (selectedPlan === 'annual' ? ' /ano' : ' /mês');
        }
      }
      return finalPrice;
    }

    function openCheckoutSaaSModal() {
      if (!checkoutModal) return;
      var profile = PrompterAuth.getProfile() || {};
      var user = PrompterAuth.getUser() || {};

      var chkName = document.getElementById('chkName');
      var chkEmail = document.getElementById('chkEmail');
      var chkPhone = document.getElementById('chkPhone');
      var chkCpf = document.getElementById('chkCpf');

      if (chkName) chkName.value = profile.display_name || (user.email ? user.email.split('@')[0] : '');
      if (chkEmail) chkEmail.value = profile.email || user.email || '';
      if (chkPhone) chkPhone.value = profile.phone || '';
      if (chkCpf) chkCpf.value = profile.cpf || '';

      selectedPlan = 'annual';
      appliedCoupon = null;
      if (inputCoupon) inputCoupon.value = '';
      if (couponAlert) { couponAlert.style.display = 'none'; couponAlert.innerText = ''; }

      if (cardPlanAnnual) {
        cardPlanAnnual.style.borderColor = '#38bdf8';
        cardPlanAnnual.style.background = 'rgba(56, 189, 248, 0.08)';
      }
      if (cardPlanMonthly) {
        cardPlanMonthly.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        cardPlanMonthly.style.background = 'rgba(15, 23, 42, 0.6)';
      }

      calculateCheckoutTotal();
      openModal(checkoutModal);
    }

    function closeCheckoutSaaSModal() {
      if (checkoutModal) closeModal(checkoutModal);
    }

    if (btnUpgradePlan) {
      btnUpgradePlan.addEventListener('click', function () {
        closeProfileModal();
        openCheckoutSaaSModal();
      });
    }

    if (btnCloseCheckout) btnCloseCheckout.addEventListener('click', closeCheckoutSaaSModal);
    if (checkoutOverlay) checkoutOverlay.addEventListener('click', closeCheckoutSaaSModal);

    if (cardPlanAnnual) {
      cardPlanAnnual.addEventListener('click', function () {
        selectedPlan = 'annual';
        this.style.borderColor = '#38bdf8';
        this.style.background = 'rgba(56, 189, 248, 0.08)';
        if (cardPlanMonthly) {
          cardPlanMonthly.style.borderColor = 'rgba(255, 255, 255, 0.15)';
          cardPlanMonthly.style.background = 'rgba(15, 23, 42, 0.6)';
        }
        calculateCheckoutTotal();
      });
    }

    if (cardPlanMonthly) {
      cardPlanMonthly.addEventListener('click', function () {
        selectedPlan = 'monthly';
        this.style.borderColor = '#34d399';
        this.style.background = 'rgba(16, 185, 129, 0.08)';
        if (cardPlanAnnual) {
          cardPlanAnnual.style.borderColor = 'rgba(255, 255, 255, 0.15)';
          cardPlanAnnual.style.background = 'rgba(15, 23, 42, 0.6)';
        }
        calculateCheckoutTotal();
      });
    }

    if (btnPayPix) {
      btnPayPix.addEventListener('click', function () {
        this.classList.add('active');
        this.style.borderColor = '#34d399';
        this.style.color = '#34d399';
        if (btnPayCard) {
          btnPayCard.classList.remove('active');
          btnPayCard.style.borderColor = '';
          btnPayCard.style.color = '';
        }
        if (checkoutPixBox) checkoutPixBox.classList.remove('hidden');
        if (checkoutCardBox) checkoutCardBox.classList.add('hidden');
      });
    }

    if (btnPayCard) {
      btnPayCard.addEventListener('click', function () {
        this.classList.add('active');
        this.style.borderColor = '#38bdf8';
        this.style.color = '#38bdf8';
        if (btnPayPix) {
          btnPayPix.classList.remove('active');
          btnPayPix.style.borderColor = '';
          btnPayPix.style.color = '';
        }
        if (checkoutCardBox) checkoutCardBox.classList.remove('hidden');
        if (checkoutPixBox) checkoutPixBox.classList.add('hidden');
      });
    }

    if (btnApplyCoupon) {
      btnApplyCoupon.addEventListener('click', function () {
        var code = (inputCoupon ? inputCoupon.value : '').trim().toUpperCase();
        if (!code) {
          showToast('Digite um código de cupom.', 'warning');
          return;
        }

        if (code === 'VIP100' || code === 'CANTORVIP') {
          appliedCoupon = { code: code, type: 'vip', discount: '100% OFF' };
          if (couponAlert) {
            couponAlert.style.display = 'block';
            couponAlert.style.color = '#34d399';
            couponAlert.innerHTML = '👑 <strong>Cupom VIP Aplicado!</strong> 100% de Desconto (1 Ano Grátis).';
          }
        } else if (code === 'PRO50' || code === 'DESCONTO50') {
          appliedCoupon = { code: code, type: 'percent', discount: '50% OFF' };
          if (couponAlert) {
            couponAlert.style.display = 'block';
            couponAlert.style.color = '#38bdf8';
            couponAlert.innerHTML = '⚡ <strong>Cupom Aplicado!</strong> 50% de Desconto na Assinatura.';
          }
        } else {
          appliedCoupon = null;
          if (couponAlert) {
            couponAlert.style.display = 'block';
            couponAlert.style.color = '#f87171';
            couponAlert.innerText = '❌ Cupom inválido ou expirado.';
          }
        }
        calculateCheckoutTotal();
      });
    }

    if (btnConfirmCheckout) {
      btnConfirmCheckout.addEventListener('click', function () {
        var name = (document.getElementById('chkName') ? document.getElementById('chkName').value : '').trim();
        var email = (document.getElementById('chkEmail') ? document.getElementById('chkEmail').value : '').trim();
        var phone = (document.getElementById('chkPhone') ? document.getElementById('chkPhone').value : '').trim();
        var cpf = (document.getElementById('chkCpf') ? document.getElementById('chkCpf').value : '').trim();
        var chkAccept = document.getElementById('chkAcceptLegalTerms');

        if (!name || !email || !phone || !cpf) {
          showToast('Preencha todos os dados de faturamento (Nome, CPF, WhatsApp e E-mail).', 'warning');
          return;
        }

        if (!chkAccept || !chkAccept.checked) {
          showToast('É obrigatório concordar com os Termos de Uso e Contrato de Licença SaaS.', 'warning');
          return;
        }

        showToast('Processando assinatura e emitindo contrato...', 'info');

        var user = PrompterAuth.getUser();
        var profile = PrompterAuth.getProfile() || {};
        var planTier = 'pro';
        var planType = selectedPlan === 'annual' ? '💎 PRO ANUAL' : '⚡ PRO MENSAL';

        profile.plan_tier = planTier;
        profile.plan_type = planType;
        profile.display_name = name;
        profile.phone = phone;
        profile.cpf = cpf;

        PrompterAuth.saveSession(user, profile);
        PrompterAuth.updateUIForAuth();

        var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
        if (sb && user) {
          sb.from('profiles').upsert({
            id: user.id,
            email: email,
            display_name: name,
            phone: phone,
            cpf: cpf,
            plan_tier: planTier,
            plan_type: planType,
            updated_at: new Date().toISOString()
          }).catch(function() {});
        }

        closeCheckoutSaaSModal();
        showToast('🎉 Parabéns! Sua assinatura CANTAAÍ PRO foi ativada com sucesso!', 'success');
      });
    }

    // ── CENTRAL DE SUPORTE, FEEDBACK & CHAMADOS DO CANTOR (COM FOTO/PRINT) ──
    var userSupportModal = document.getElementById('userSupportModal');
    var btnCloseUserSupportModal = document.getElementById('btnCloseUserSupportModal');
    var userSupportOverlay = document.getElementById('userSupportOverlay');
    var btnProfileOpenSupport = document.getElementById('btnProfileOpenSupport');
    var btnProfileModalSupport = document.getElementById('btnProfileModalSupport');
    var btnSubmitTicket = document.getElementById('btnSubmitTicket');
    var ticketFileInput = document.getElementById('ticketFileInput');
    var ticketDropZone = document.getElementById('ticketDropZone');
    var ticketUploadPrompt = document.getElementById('ticketUploadPrompt');
    var ticketPreviewContainer = document.getElementById('ticketPreviewContainer');
    var ticketImagePreview = document.getElementById('ticketImagePreview');
    var btnRemoveTicketImage = document.getElementById('btnRemoveTicketImage');
    var currentTicketImageBase64 = '';

    function openUserSupportModal() {
      if (!userSupportModal) return;
      if (userProfileMenu) userProfileMenu.classList.add('hidden');
      if (profileModal) profileModal.classList.add('hidden');
      userSupportModal.classList.remove('hidden');
    }

    function closeUserSupportModal() {
      if (userSupportModal) userSupportModal.classList.add('hidden');
      resetSupportForm();
    }

    function resetSupportForm() {
      var tTitle = document.getElementById('ticketTitle');
      var tDesc = document.getElementById('ticketDescription');
      if (tTitle) tTitle.value = '';
      if (tDesc) tDesc.value = '';
      currentTicketImageBase64 = '';
      if (ticketPreviewContainer) ticketPreviewContainer.classList.add('hidden');
      if (ticketUploadPrompt) ticketUploadPrompt.classList.remove('hidden');
      if (ticketFileInput) ticketFileInput.value = '';
    }

    if (btnProfileOpenSupport) btnProfileOpenSupport.addEventListener('click', openUserSupportModal);
    if (btnProfileModalSupport) btnProfileModalSupport.addEventListener('click', openUserSupportModal);
    if (btnCloseUserSupportModal) btnCloseUserSupportModal.addEventListener('click', closeUserSupportModal);
    if (userSupportOverlay) userSupportOverlay.addEventListener('click', closeUserSupportModal);

    if (ticketDropZone && ticketFileInput) {
      ticketDropZone.addEventListener('click', function (e) {
        if (e.target !== btnRemoveTicketImage) {
          ticketFileInput.click();
        }
      });

      ticketFileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (evt) {
          currentTicketImageBase64 = evt.target.result;
          if (ticketImagePreview) ticketImagePreview.src = currentTicketImageBase64;
          if (ticketPreviewContainer) ticketPreviewContainer.classList.remove('hidden');
          if (ticketUploadPrompt) ticketUploadPrompt.classList.add('hidden');
        };
        reader.readAsDataURL(file);
      });
    }

    if (btnRemoveTicketImage) {
      btnRemoveTicketImage.addEventListener('click', function (e) {
        e.stopPropagation();
        currentTicketImageBase64 = '';
        if (ticketPreviewContainer) ticketPreviewContainer.classList.add('hidden');
        if (ticketUploadPrompt) ticketUploadPrompt.classList.remove('hidden');
        if (ticketFileInput) ticketFileInput.value = '';
      });
    }

    if (btnSubmitTicket) {
      btnSubmitTicket.addEventListener('click', function () {
        var cat = document.getElementById('ticketCategory').value;
        var title = (document.getElementById('ticketTitle').value || '').trim();
        var desc = (document.getElementById('ticketDescription').value || '').trim();

        if (!title || !desc) {
          showToast('Preencha o assunto e a descrição da mensagem.', 'warning');
          return;
        }

        var user = PrompterAuth.getUser();
        var profile = PrompterAuth.getProfile();
        var uEmail = (profile && profile.email) ? profile.email : (user ? user.email : 'cantor@cantaaipro.com');
        var uName = (profile && profile.display_name) ? profile.display_name : (user ? user.email.split('@')[0] : 'Cantor CantaAí');

        var newTicket = {
          id: 'tkt-' + Date.now(),
          user_id: user ? user.id : null,
          user_email: uEmail,
          user_name: uName,
          category: cat,
          title: title,
          description: desc,
          image_url: currentTicketImageBase64 || '',
          status: 'open',
          created_at: new Date().toISOString()
        };

        // Salvar localmente
        var raw = localStorage.getItem('canta_ai_support_tickets');
        var list = raw ? JSON.parse(raw) : [];
        list.unshift(newTicket);
        localStorage.setItem('canta_ai_support_tickets', JSON.stringify(list));

        // Salvar no Supabase
        var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
        if (sb) {
          sb.from('tickets').insert([newTicket]).catch(function() {});
        }

        closeUserSupportModal();
        showToast('🚀 Chamado enviado com sucesso! O desenvolvedor analisará sua solicitação.', 'success');
      });
    }

    if (btnProfileThemeToggle) {
      btnProfileThemeToggle.addEventListener('click', function () {
        if (window.toggleAppTheme) window.toggleAppTheme();
      });
    }

    if (btnProfileLogout) {
      btnProfileLogout.addEventListener('click', function () {
        if (userProfileMenu) userProfileMenu.classList.add('hidden');
        if (confirm('Deseja realmente sair da sua conta?')) {
          PrompterAuth.signOut().then(function () {
            showToast('Você saiu da sua conta.', 'info');
            showLanding();
          });
        }
      });
    }

    // ── CONTROLES DE BOTÕES DA LANDING PAGE ──
    var btnLandingNavLogin = document.getElementById('btnLandingNavLogin');
    var btnLandingNavSignUp = document.getElementById('btnLandingNavSignUp');
    var btnLandingStartFree = document.getElementById('btnLandingStartFree');
    var btnLandingOpenApp = document.getElementById('btnLandingOpenApp');
    var btnPricingFree = document.getElementById('btnPricingFree');
    var btnPricingPro = document.getElementById('btnPricingPro');
    var btnLandingLogo = document.getElementById('btnLandingLogo');

    window.showLandingPage = showLanding;
    window.showAppDashboard = showApp;

    if (btnLandingNavLogin) {
      btnLandingNavLogin.addEventListener('click', function () { openAuthModal('signin'); });
    }
    if (btnLandingNavSignUp) {
      btnLandingNavSignUp.addEventListener('click', function () { openAuthModal('signup'); });
    }
    if (btnLandingStartFree) {
      btnLandingStartFree.addEventListener('click', function () { openAuthModal('signup'); });
    }
    if (btnPricingFree) {
      btnPricingFree.addEventListener('click', function () { openAuthModal('signup'); });
    }
    if (btnPricingPro) {
      btnPricingPro.addEventListener('click', function () { openAuthModal('signup'); });
    }
    if (btnLandingOpenApp) {
      btnLandingOpenApp.addEventListener('click', function () { showApp(); });
    }
    if (btnLandingLogo) {
      btnLandingLogo.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Smooth scroll para os links de navegação da landing
    var navLinks = document.querySelectorAll('.landing-nav-link');
    for (var n = 0; n < navLinks.length; n++) {
      navLinks[n].addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          var targetEl = document.querySelector(href);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    }

    // Inicialização da visualização: se usuário logado, vai direto ao App
    if (window.PrompterAuth && window.PrompterAuth.getUser()) {
      showApp();
    } else {
      showLanding();
    }
  }
});
