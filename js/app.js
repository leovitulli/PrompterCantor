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

  loadRepertoires()
    .then(function() {
      restoreActiveState();
      if (window.PrompterCloud) {
        PrompterCloud.initRealtimeListeners(function(table, payload) {
          if (window.PrompterDB && typeof PrompterDB.invalidateCache === 'function') {
            PrompterDB.invalidateCache();
          }
          if (state.currentRepertoire) {
            PrompterDB.getSongsByRepertoire(state.currentRepertoire.id).then(function (songs) {
              state.currentRepertoireSongs = songs || [];
              renderSongsList(state.currentRepertoireSongs);
              if (window.updateSaaSPlanBanner) updateSaaSPlanBanner();
            });
          } else {
            loadRepertoires();
          }
        });
      }
    })
    .catch(function (err) {
      console.error('Erro ao inicializar app:', err);
    });

  // Clique no Badge de Nuvem para atualizar imediatamente
  var syncBadgeEl = document.getElementById('supabaseSyncBadge');
  if (syncBadgeEl) {
    syncBadgeEl.style.cursor = 'pointer';
    syncBadgeEl.addEventListener('click', function () {
      if (window.PrompterDB && typeof PrompterDB.invalidateCache === 'function') {
        PrompterDB.invalidateCache();
      }
      showToast('⚡ Atualizando dados da nuvem...', 'info');
      loadRepertoires();
    });
  }

  // Atualizar dados ao alternar para a aba com throttle inteligente (4s)
  var lastFocusSync = 0;
  window.addEventListener('focus', function () {
    var now = Date.now();
    if (now - lastFocusSync < 4000) return;
    lastFocusSync = now;

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

    var loadPromise = (PrompterDB.getRepertoiresWithCounts && typeof PrompterDB.getRepertoiresWithCounts === 'function')
      ? PrompterDB.getRepertoiresWithCounts()
      : PrompterDB.getAllRepertoires();

    return loadPromise.then(function (reps) {
      state.repertoires = reps || [];
      renderRepertoires();
      updateSaaSPlanBanner();
    });
  }

  // ═══════════════════════════════════════════════════════
  //  GOVERNANÇA SAAS: LIMITES DO PLANO FREE & TESTE PRO
  // ═══════════════════════════════════════════════════════

  function getSaaSUserStatus() {
    var profile = (window.PrompterAuth && window.PrompterAuth.getProfile()) ? window.PrompterAuth.getProfile() : null;
    var user = (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
    var email = (profile && profile.email) ? profile.email : (user ? user.email : '');
    var cleanEmail = (email || '').trim().toLowerCase();

    var isCeo = cleanEmail === 'leovitulli@gmail.com' || (profile && profile.role === 'admin');
    var isVip = !!(profile && (profile.is_vip || (profile.plan_type && profile.plan_type.indexOf('VIP') !== -1) || profile.plan_tier === 'vip' || profile.coupon_used === 'VIP100' || cleanEmail === 'alinecrissallai@gmail.com'));

    if (isCeo || isVip) {
      return {
        isPro: true,
        isUnlimited: true,
        isTrial: false,
        isVip: isVip,
        isCeo: isCeo,
        maxSongs: Infinity,
        maxRepertoires: Infinity,
        trialDaysLeft: 0,
        tier: isVip ? 'vip' : 'pro'
      };
    }

    var planTier = (profile && profile.plan_tier) ? profile.plan_tier.toLowerCase() : 'free';
    var isExplicitPro = (planTier === 'pro') && (!profile.is_trial);
    if (isExplicitPro) {
      return {
        isPro: true,
        isUnlimited: true,
        isTrial: false,
        isVip: false,
        isCeo: false,
        maxSongs: Infinity,
        maxRepertoires: Infinity,
        trialDaysLeft: 0,
        tier: 'pro'
      };
    }

    // Verificar se a conta está no período de degustação (Trial 7 dias)
    var isTrialExplicit = !!(profile && (profile.is_trial || planTier === 'trial'));
    var createdAtTime = (profile && profile.created_at) ? new Date(profile.created_at).getTime() : NaN;
    var isWithin7Days = false;
    var trialDaysLeft = 0;

    if (!isNaN(createdAtTime)) {
      var trialDurationMs = 7 * 24 * 60 * 60 * 1000;
      var elapsed = Date.now() - createdAtTime;
      if (elapsed >= 0 && elapsed < trialDurationMs) {
        isWithin7Days = true;
        trialDaysLeft = Math.max(1, Math.ceil((trialDurationMs - elapsed) / (24 * 60 * 60 * 1000)));
      }
    }

    if (isTrialExplicit) {
      return {
        isPro: true,
        isUnlimited: true,
        isTrial: true,
        isVip: false,
        isCeo: false,
        maxSongs: Infinity,
        maxRepertoires: Infinity,
        trialDaysLeft: trialDaysLeft || 7,
        tier: 'trial'
      };
    }

    // PLANO FREE (Limite de 5 músicas e 1 repertório):
    return {
      isPro: false,
      isUnlimited: false,
      isTrial: false,
      isVip: false,
      isCeo: false,
      maxSongs: 5,
      maxRepertoires: 1,
      trialDaysLeft: 0,
      tier: 'free'
    };
  }

  function updateSaaSPlanBanner() {
    var banner = document.getElementById('saasPlanBannerBar');
    if (!banner) return;

    var status = getSaaSUserStatus();

    // Se for CEO / PRO Pago Ilimitado / VIP: oculta o banner para experiência limpa no palco
    if (status.isUnlimited && !status.isTrial) {
      banner.classList.add('hidden');
      return;
    }

    banner.classList.remove('hidden');

    var badgeEl = document.getElementById('spbBadge');
    var msgEl = document.getElementById('spbMessage');
    var fillEl = document.getElementById('spbProgressFill');
    var btnUpgrade = document.getElementById('btnSpbUpgrade');

    PrompterDB.getAllSongs().then(function(allSongs) {
      var totalSongs = (allSongs && Array.isArray(allSongs)) ? allSongs.length : 0;
      var totalReps = (state.repertoires && Array.isArray(state.repertoires)) ? state.repertoires.length : 0;

      if (status.isTrial) {
        if (badgeEl) {
          badgeEl.className = 'spb-badge spb-badge-trial';
          badgeEl.innerHTML = '👑 DEGUSTAÇÃO PRO';
        }
        var daysText = status.trialDaysLeft + (status.trialDaysLeft === 1 ? ' dia restante' : ' dias restantes');
        if (msgEl) {
          msgEl.innerHTML = '<strong>Acesso PRO Ativo:</strong> Restam <strong>' + daysText + '</strong> de degustação ilimitada no palco. Você tem ' + totalSongs + ' música(s) em ' + totalReps + ' repertório(s).';
        }
        if (fillEl) {
          fillEl.style.width = '100%';
          fillEl.className = 'spb-progress-fill';
        }
        if (btnUpgrade) {
          btnUpgrade.innerHTML = '⭐ Assinar Anual com Desconto';
        }
      } else {
        var maxSongs = status.maxSongs || 5;
        var maxReps = status.maxRepertoires || 1;
        var isOverLimit = totalSongs >= maxSongs || totalReps > maxReps;
        var pct = Math.min(100, Math.round((totalSongs / maxSongs) * 100));

        if (badgeEl) {
          badgeEl.className = 'spb-badge spb-badge-free';
          badgeEl.innerHTML = isOverLimit ? '⚠️ LIMITE ATINGIDO' : '⚡ PLANO FREE';
        }
        if (msgEl) {
          msgEl.innerHTML = '<strong>Limite Free:</strong> ' +
            '<strong>' + totalSongs + '/' + maxSongs + ' músicas</strong> usadas • ' +
            '<strong>' + totalReps + '/' + maxReps + ' repertório</strong>.' +
            (isOverLimit ? ' <span style="color:#f87171;font-weight:700;">(Faça upgrade para adicionar mais)</span>' : '');
        }
        if (fillEl) {
          fillEl.style.width = pct + '%';
          fillEl.className = 'spb-progress-fill' + (isOverLimit ? ' overlimit' : '');
        }
        if (btnUpgrade) {
          btnUpgrade.innerHTML = '⭐ Desbloquear PRO Ilimitado';
        }
      }
    }).catch(function(e) {
      console.warn('Erro ao atualizar banner SaaS:', e);
    });
  }

  function openSaasFreeLimitModal(type, currentCount, maxAllowed) {
    var modal = document.getElementById('saasFreeLimitModal');
    if (!modal) {
      openCheckoutSaaSModal();
      return;
    }

    var titleEl = document.getElementById('saasLimitTitle');
    var descEl = document.getElementById('saasLimitDesc');

    if (type === 'repertoire') {
      if (titleEl) titleEl.innerText = 'Limite de Repertórios Atingido';
      if (descEl) {
        descEl.innerHTML = 'O <strong>Plano Free</strong> permite gerenciar <strong>1 repertório</strong> (você já possui ' + currentCount + '). Faça upgrade para o <strong>CantaAí PRO</strong> para criar repertórios ilimitados para todos os seus shows e eventos!';
      }
    } else {
      if (titleEl) titleEl.innerText = 'Limite de Músicas Atingido';
      if (descEl) {
        descEl.innerHTML = 'O <strong>Plano Free</strong> permite gerenciar até <strong>5 músicas</strong> (você já possui ' + currentCount + '). Desbloqueie o <strong>CantaAí PRO</strong> para ter músicas e repertórios ilimitados, transposição no palco e recursos avançados!';
      }
    }

    openModal(modal);
  }

  function closeSaasFreeLimitModal() {
    var modal = document.getElementById('saasFreeLimitModal');
    if (modal) closeModal(modal);
  }

  window.updateSaaSPlanBanner = updateSaaSPlanBanner;
  window.getSaaSUserStatus = getSaaSUserStatus;
  window.openSaasFreeLimitModal = openSaasFreeLimitModal;

  function promptCreateRepertoire() {
    var saas = getSaaSUserStatus();
    if (!saas.isUnlimited && state.repertoires && state.repertoires.length >= saas.maxRepertoires) {
      openSaasFreeLimitModal('repertoire', state.repertoires.length, saas.maxRepertoires);
      return;
    }

    var now = new Date();
    var dd = String(now.getDate()).padStart(2, '0');
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var defaultName = 'Novo Repertório ' + dd + '/' + mm;

    var name = prompt('Digite o nome do novo Repertório:', defaultName);
    if (name && name.trim()) {
      var repName = name.trim();
      var user = (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
      PrompterDB.saveRepertoire({
        name: repName,
        source: 'manual',
        user_id: user ? user.id : 'guest',
        user_email: user ? user.email : ''
      }).then(function (newId) {
        showToast('Repertório "' + repName + '" criado com sucesso!', 'success');
        return loadRepertoires().then(function () {
          openRepertoireSongs(newId);
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
      repertoiresListEl.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-icon">🎵</div>' +
        '<h2>Nenhum repertório criado ainda</h2>' +
        '<p>Organize suas músicas com praticidade importando arquivos ou criando um repertório novo.</p>' +
        '<div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem;">' +
        '<button id="btnEmptyImport" class="btn btn-primary btn-lg">📂 Importar Arquivos</button>' +
        '<button id="btnEmptyGDrive" class="btn btn-gdrive btn-lg">☁️ Google Drive</button>' +
        '<button id="btnEmptyCreateManual" class="btn btn-outline btn-lg">➕ Criar Repertório</button>' +
        '</div>' +
        '</div>';

      var bEI = document.getElementById('btnEmptyImport');
      if (bEI) bEI.addEventListener('click', function () { openImportModal(null); });
      var bEG = document.getElementById('btnEmptyGDrive');
      if (bEG) bEG.addEventListener('click', function () { openGDriveModal(null); });
      var bEM = document.getElementById('btnEmptyCreateManual');
      if (bEM) bEM.addEventListener('click', promptCreateRepertoire);
      return;
    }

    // Renderizar HTML dos cards com badge unificado e contagem instantânea (0ms)
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var rep = filtered[i];
      var sourceClass = (rep.source === 'sample' || rep.source === 'local') ? 'local' : (rep.source || 'local');
      var sourceIcon = rep.source === 'gdrive' ? '☁️' : rep.source === 'manual' ? '✏️' : '📁';
      var sourceLabel = rep.source === 'gdrive' ? 'Google Drive' : rep.source === 'manual' ? 'Criado Manual' : 'Importação Local';
      var dateStr = formatDate(rep.createdAt);
      var repId = rep.id;
      var count = (rep.songsCount !== undefined) ? rep.songsCount : 0;
      var countStr = count + ' música' + (count !== 1 ? 's' : '');

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
        '<span class="rep-song-count" id="rep-count-' + repId + '">' + countStr + '</span>' +
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
            showToast(newState ? '⚡ Repertório salvo para uso 100% offline!' : '⚡ Repertório removido do modo offline', newState ? 'success' : 'info');
            loadRepertoiresGrid();
          });
        });
      })(repOfflineBtns[ro]);
    }
  }

  // ═══════════════════════════════════════
  //  TELA INTERNA: MÚSICAS DO REPERTÓRIO
  // ═══════════════════════════════════════

  function openRepertoireSongs(repId, isSilent) {
    var foundRep = (state.repertoires || []).find(function (r) { return r.id === repId; });
    var repPromise = foundRep ? Promise.resolve(foundRep) : PrompterDB.getRepertoireById(repId);

    return repPromise.then(function (rep) {
      if (!rep) {
        try {
          localStorage.removeItem('prompter_active_state');
          if (window.location.hash && window.location.hash.indexOf('#rep-') === 0) {
            history.replaceState(null, '', window.location.pathname);
          }
        } catch(e) {}
        if (!isSilent) {
          showToast('Repertório não encontrado.', 'warning');
        }
        return false;
      }
      state.currentRepertoire = rep;

      return PrompterDB.getSongsByRepertoire(rep.id).then(function (songs) {
        state.currentRepertoireSongs = songs || [];
        showRepertoireSongsView(rep, state.currentRepertoireSongs);
        return true;
      });
    }).catch(function (err) {
      console.error('Erro ao abrir repertório:', err);
      if (!isSilent) showToast('Erro ao carregar repertório.', 'warning');
      return false;
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
          showToast(newState ? '⚡ Repertório salvo para uso 100% offline!' : '⚡ Repertório removido do modo offline', newState ? 'success' : 'info');
          openRepertoireSongs(rep.id);
        });
      };
    }

    // Resetar estado de ordenação A-Z
    state.isSortedAZ = false;
    state.originalSongsSnapshot = null;
    var btnSortAZ = document.getElementById('btnRsvSortAZ');
    if (btnSortAZ) {
      btnSortAZ.innerHTML = '🔤 Ordem A-Z';
      btnSortAZ.classList.remove('btn-active-sort');
      btnSortAZ.title = 'Organizar músicas em ordem alfabética (A-Z)';
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
    state.isSortedAZ = false;
    state.originalSongsSnapshot = null;
    var btnSortAZReset = document.getElementById('btnRsvSortAZ');
    if (btnSortAZReset) {
      btnSortAZReset.innerHTML = '🔤 Ordem A-Z';
      btnSortAZReset.classList.remove('btn-active-sort');
    }
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
    loadRepertoires: loadRepertoires,
    openRepertoireSongs: openRepertoireSongs,
    openPrompterView: openPrompterView,
    closePrompterView: closePrompterView,
    closeRepertoireSongsView: closeRepertoireSongsView,
    getState: function () { return state; }
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
      if (song.artist) metaParts.push('<span class="meta-part meta-artista">🎤 ' + escapeHtml(song.artist) + '</span>');
      if (song.composer) metaParts.push('<span class="meta-part meta-compositor">✍️ ' + escapeHtml(song.composer) + '</span>');
      if (preview) metaParts.push('<span class="meta-part meta-previa">💬 ' + escapeHtml(preview) + '</span>');

      var svgUp = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
      var svgDown = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      var svgTrash = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

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
            (metaParts.length > 0 ? '<div class="song-row-meta">' + metaParts.join('<span class="meta-sep">•</span>') + '</div>' : '') +
          '</div>' +
          '<div class="song-row-actions">' +
            '<button class="btn-icon-action btn-move-up" data-song-id="' + song.id + '" title="Mover para Cima">' + svgUp + '</button>' +
            '<button class="btn-icon-action btn-move-down" data-song-id="' + song.id + '" title="Mover para Baixo">' + svgDown + '</button>' +
            '<button class="btn-icon-action btn-delete-song" data-song-id="' + song.id + '" title="Excluir Música">' + svgTrash + '</button>' +
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

    var isSetlist = !!(state.currentSetlist && state.currentSetlistSongs && state.currentSetlistSongs.length > 0);
    var ensureListPromise = Promise.resolve();

    if (!isSetlist) {
      var rId = state.currentSong.repertoireId || (state.currentRepertoire ? state.currentRepertoire.id : null);
      var needsReload = !state.currentRepertoireSongs ||
        state.currentRepertoireSongs.length === 0 ||
        (rId && (!state.currentRepertoire || String(state.currentRepertoire.id) !== String(rId))) ||
        !state.currentRepertoireSongs.some(function(s) { return String(s.id) === String(state.currentSong.id); });

      if (needsReload && rId) {
        ensureListPromise = PrompterDB.getSongsByRepertoire(rId).then(function(songs) {
          state.currentRepertoireSongs = songs || [];
          return state.currentRepertoireSongs;
        });
      }
    }

    ensureListPromise.then(function() {
      var activeList = isSetlist
        ? state.currentSetlistSongs
        : (state.currentRepertoireSongs || []);

      if (!activeList || activeList.length === 0 || !state.currentSong) return;

      var curId = String(state.currentSong.id);
      var currentIndex = activeList.findIndex(function (s) { return String(s.id) === curId; });

      if (currentIndex === -1) currentIndex = 0;

      var newIndex = currentIndex + direction;
      if (newIndex >= 0 && newIndex < activeList.length) {
        if (isSetlist) {
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

    var btnScrollToTop = document.getElementById('btnScrollToTop');
    if (btnScrollToTop) btnScrollToTop.classList.remove('visible');

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

    var isSetlistActive = !!(state.currentSetlist && state.currentSetlistSongs && state.currentSetlistSongs.length > 0);
    var repIdForSong = song.repertoireId || (state.currentRepertoire ? state.currentRepertoire.id : null);

    if (isSetlistActive) {
      updatePrompterNavUI(state.currentSetlistSongs);
    } else if (repIdForSong) {
      var isSameRep = state.currentRepertoire && String(state.currentRepertoire.id) === String(repIdForSong);
      var hasMatchingList = isSameRep && state.currentRepertoireSongs && state.currentRepertoireSongs.length > 0 &&
        state.currentRepertoireSongs.some(function(s) { return String(s.id) === String(song.id); });

      if (hasMatchingList) {
        updatePrompterNavUI(state.currentRepertoireSongs);
      } else {
        PrompterDB.getRepertoireById(repIdForSong).then(function(rep) {
          if (rep) state.currentRepertoire = rep;
          return PrompterDB.getSongsByRepertoire(repIdForSong);
        }).then(function(loaded) {
          state.currentRepertoireSongs = loaded || [];
          updatePrompterNavUI(state.currentRepertoireSongs);
        }).catch(function() {
          updatePrompterNavUI([song]);
        });
      }
    } else {
      updatePrompterNavUI([song]);
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
        updateSaaSPlanBanner();
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
              if (!song) return;
              var targetRepId = song.repertoireId || rId;
              if (targetRepId) {
                return Promise.all([
                  PrompterDB.getRepertoireById(targetRepId),
                  PrompterDB.getSongsByRepertoire(targetRepId)
                ]).then(function(res) {
                  if (res[0]) state.currentRepertoire = res[0];
                  state.currentRepertoireSongs = res[1] || [];
                  openPrompterView(song);
                }).catch(function() {
                  openPrompterView(song);
                });
              } else {
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

    // Botão Ordenar A-Z com Alternância para Ordem do Show (Original)
    var btnSortAZ = document.getElementById('btnRsvSortAZ');
    if (btnSortAZ) {
      btnSortAZ.addEventListener('click', function () {
        if (!state.currentRepertoireSongs || state.currentRepertoireSongs.length === 0) return;

        if (!state.isSortedAZ) {
          // Salva snapshot da ordem atual do repertório antes de ordenar
          state.originalSongsSnapshot = state.currentRepertoireSongs.slice();
          state.currentRepertoireSongs.sort(function (a, b) {
            return (a.title || '').localeCompare(b.title || '', 'pt', { sensitivity: 'base' });
          });
          state.isSortedAZ = true;
          btnSortAZ.innerHTML = '🔢 Ordem do Show';
          btnSortAZ.classList.add('btn-active-sort');
          btnSortAZ.title = 'Restaurar para a ordem original das faixas do show';
          renderSongsList(state.currentRepertoireSongs);
          showToast('🔤 Músicas em ordem A-Z. Clique em "Ordem do Show" para restaurar.', 'info');
        } else {
          // Restaura a ordem original
          if (state.originalSongsSnapshot && state.originalSongsSnapshot.length > 0) {
            state.currentRepertoireSongs = state.originalSongsSnapshot.slice();
          } else {
            state.currentRepertoireSongs.sort(function(a, b) {
              return (a.trackNumber || 0) - (b.trackNumber || 0);
            });
          }
          state.isSortedAZ = false;
          state.originalSongsSnapshot = null;
          btnSortAZ.innerHTML = '🔤 Ordem A-Z';
          btnSortAZ.classList.remove('btn-active-sort');
          btnSortAZ.title = 'Organizar músicas em ordem alfabética (A-Z)';
          renderSongsList(state.currentRepertoireSongs);
          showToast('🔢 Ordem original do repertório restaurada!', 'success');
        }
      });
    }

    // Menu Dropdown "+ Adicionar" unificado no cabeçalho
    var btnDropdownAdd = document.getElementById('btnDropdownAdd');
    var dropdownAddMenu = document.getElementById('dropdownAddMenu');
    if (btnDropdownAdd && dropdownAddMenu) {
      var lastAddToggleTime = 0;
      var handleToggleAddMenu = function (e) {
        var now = Date.now();
        if (now - lastAddToggleTime < 350) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        lastAddToggleTime = now;
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        // Fechar dropdown de perfil se estiver aberto
        var upm = document.getElementById('userProfileMenu');
        if (upm && !upm.classList.contains('hidden')) {
          upm.classList.add('hidden');
        }
        dropdownAddMenu.classList.toggle('hidden');
      };

      btnDropdownAdd.addEventListener('click', handleToggleAddMenu);
      btnDropdownAdd.addEventListener('touchend', handleToggleAddMenu);

      var closeIfOutsideAddMenu = function (e) {
        if (!dropdownAddMenu || dropdownAddMenu.classList.contains('hidden')) return;
        var target = e.target;
        if (btnDropdownAdd.contains(target) || (target.closest && target.closest('#btnDropdownAdd'))) return;
        if (dropdownAddMenu.contains(target) || (target.closest && target.closest('#dropdownAddMenu'))) return;
        dropdownAddMenu.classList.add('hidden');
      };
      document.addEventListener('click', closeIfOutsideAddMenu);
      document.addEventListener('touchend', closeIfOutsideAddMenu);
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
        openImportModal(state.currentRepertoire ? state.currentRepertoire.id : null);
      });
    }

    var btnMenuImportDrive = document.getElementById('btnMenuImportDrive');
    if (btnMenuImportDrive) {
      btnMenuImportDrive.addEventListener('click', function () {
        if (dropdownAddMenu) dropdownAddMenu.classList.add('hidden');
        openGDriveModal(state.currentRepertoire ? state.currentRepertoire.id : null);
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
      var dAdd = document.getElementById('dropdownAddMenu');
      if (dAdd) dAdd.classList.add('hidden');
      var uProf = document.getElementById('userProfileMenu');
      if (uProf) uProf.classList.add('hidden');
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
        if (state.currentRepertoire) {
          openImportModal(state.currentRepertoire.id);
        } else {
          openImportModal(null);
        }
      });
    }

    // Importar Google Drive dentro do repertório
    var btnRsvAddGDrive = document.getElementById('btnRsvAddGDrive');
    if (btnRsvAddGDrive) {
      btnRsvAddGDrive.addEventListener('click', function () {
        if (state.currentRepertoire) {
          openGDriveModal(state.currentRepertoire.id);
        } else {
          openGDriveModal(null);
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

    // Botão Limpar Músicas Duplicadas do Repertório Atual
    var btnRsvCleanDuplicates = document.getElementById('btnRsvCleanDuplicates');
    if (btnRsvCleanDuplicates) {
      btnRsvCleanDuplicates.addEventListener('click', cleanDuplicateSongsInCurrentRepertoire);
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
              return Promise.all([
                PrompterDB.getRepertoireById(rId),
                PrompterDB.getSongsByRepertoire(rId)
              ]).then(function (results) {
                if (results[0]) state.currentRepertoire = results[0];
                state.currentRepertoireSongs = results[1] || [];
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
            return openRepertoireSongs(targetRepId, true);
          } else {
            try { localStorage.removeItem('prompter_active_state'); } catch(e) {}
          }
        }).catch(function() {
          try { localStorage.removeItem('prompter_active_state'); } catch(e) {}
        });
      } else if (targetRepId) {
        return openRepertoireSongs(targetRepId, true);
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
    return normalizeForCompare(lines.slice(0, 4).join(' '));
  }

  function cleanDuplicateSongsInCurrentRepertoire() {
    if (!state.currentRepertoire) {
      showToast('Nenhum repertório selecionado.', 'warning');
      return;
    }

    var repId = state.currentRepertoire.id;
    PrompterDB.getSongsByRepertoire(repId).then(function(songs) {
      if (!songs || songs.length === 0) {
        showToast('Nenhuma música encontrada neste repertório.', 'info');
        return;
      }

      var seenTitles = {};
      var seenLyrics = {};
      var uniqueSongs = [];
      var duplicateIdsToDelete = [];

      songs.forEach(function(s) {
        var tKey = normalizeForCompare(window.TextParser ? TextParser.cleanTitle(s.title) : s.title);
        var lKey = getLyricsFingerprint(s.content);
        var isDupe = false;

        if (tKey && seenTitles[tKey]) {
          isDupe = true;
        } else if (lKey && lKey.length >= 15 && seenLyrics[lKey]) {
          isDupe = true;
        }

        if (isDupe) {
          duplicateIdsToDelete.push(s.id);
        } else {
          if (tKey) seenTitles[tKey] = true;
          if (lKey && lKey.length >= 15) seenLyrics[lKey] = true;
          uniqueSongs.push(s);
        }
      });

      if (duplicateIdsToDelete.length === 0) {
        showToast('✨ Nenhuma música duplicada encontrada neste repertório!', 'success');
        return;
      }

      if (!confirm('Foram encontradas ' + duplicateIdsToDelete.length + ' música(s) duplicada(s).\n\nDeseja removê-las e reordenar o repertório de 1 a ' + uniqueSongs.length + '?')) {
        return;
      }

      showToast('🧹 Removendo ' + duplicateIdsToDelete.length + ' duplicada(s)...', 'info');

      PrompterDB.deleteSongsBatch(duplicateIdsToDelete).then(function() {
        for (var i = 0; i < uniqueSongs.length; i++) {
          uniqueSongs[i].trackNumber = i + 1;
        }
        return PrompterDB.saveSongsBatch(uniqueSongs);
      }).then(function() {
        showToast('🎉 Limpeza concluída! Agora o repertório tem ' + uniqueSongs.length + ' músicas únicas.', 'success');
        return openRepertoireSongs(repId);
      }).catch(function(err) {
        console.error('Erro ao limpar duplicadas:', err);
        showToast('Erro ao remover músicas duplicadas.', 'warning');
      });
    });
  }

  function openImportModal(repIdOrNull) {
    if (!importModal) return;

    var saas = getSaaSUserStatus();
    if (!saas.isUnlimited) {
      if (!repIdOrNull && state.repertoires && state.repertoires.length >= saas.maxRepertoires) {
        openSaasFreeLimitModal('repertoire', state.repertoires.length, saas.maxRepertoires);
        return;
      }
      PrompterDB.getAllSongs().then(function(allSongs) {
        var totalSongs = (allSongs && Array.isArray(allSongs)) ? allSongs.length : 0;
        if (totalSongs >= saas.maxSongs) {
          openSaasFreeLimitModal('song', totalSongs, saas.maxSongs);
          return;
        }
        _doOpenImportModal(repIdOrNull);
      }).catch(function() {
        _doOpenImportModal(repIdOrNull);
      });
      return;
    }
    _doOpenImportModal(repIdOrNull);
  }

  function _doOpenImportModal(repIdOrNull) {
    var nameInput = document.getElementById('importRepertoireName');
    var modalHeader = importModal.querySelector('.modal-header h3');

    if (repIdOrNull) {
      state.targetRepertoireId = repIdOrNull;
      var foundRep = (state.repertoires || []).find(function(r) { return r.id === repIdOrNull; }) || state.currentRepertoire;
      if (nameInput) {
        nameInput.value = foundRep ? foundRep.name : 'Repertório Atual';
        nameInput.setAttribute('disabled', 'true');
      }
      if (modalHeader) modalHeader.textContent = '📂 Adicionar Músicas a: ' + (foundRep ? foundRep.name : 'Repertório');
    } else {
      state.targetRepertoireId = null;
      if (nameInput) {
        nameInput.value = '';
        nameInput.removeAttribute('disabled');
      }
      if (modalHeader) modalHeader.textContent = '📂 Importar Novo Repertório';
    }

    var previewList = document.getElementById('importPreviewList');
    if (previewList) previewList.innerHTML = '';
    var btnSave = document.getElementById('btnSaveImportedSongs');
    if (btnSave) btnSave.setAttribute('disabled', 'true');
    state.pendingImportSongs = [];

    openModal(importModal);
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

    var saas = getSaaSUserStatus();
    var targetRepId = state.targetRepertoireId;

    if (!saas.isUnlimited && !targetRepId && state.repertoires && state.repertoires.length >= saas.maxRepertoires) {
      closeModal(importModal);
      openSaasFreeLimitModal('repertoire', state.repertoires.length, saas.maxRepertoires);
      return;
    }

    var nameInput = document.getElementById('importRepertoireName');
    var repName = (nameInput && nameInput.value.trim()) || ('Repertório ' + formatDate(Date.now()));

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

    PrompterDB.getAllSongs().then(function(allSongs) {
      var totalSongs = (allSongs && Array.isArray(allSongs)) ? allSongs.length : 0;
      if (!saas.isUnlimited) {
        var availableSlots = Math.max(0, saas.maxSongs - totalSongs);
        if (availableSlots <= 0) {
          closeModal(importModal);
          openSaasFreeLimitModal('song', totalSongs, saas.maxSongs);
          return;
        }
        if (songsToSave.length > availableSlots) {
          songsToSave = songsToSave.slice(0, availableSlots);
          showToast('⚡ Plano Free: Importando apenas ' + availableSlots + ' música(s) para respeitar o limite de ' + saas.maxSongs + '.', 'warning');
        }
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
          updateSaaSPlanBanner();

          loadRepertoires().then(function() {
            openRepertoireSongs(repId);
          });
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
    }).catch(function(err) {
      console.error('Erro ao verificar limite SaaS:', err);
    });
  }

  // ═══════════════════════════════════════
  //  IMPORTAÇÃO VIA GOOGLE DRIVE
  // ═══════════════════════════════════════

  // ═══════════════════════════════════════
  //  IMPORTAÇÃO STREAMING VIA GOOGLE DRIVE (EM SEGUNDO PLANO)
  // ═══════════════════════════════════════

  var repCache = {};

  function openGDriveModal(repIdOrNull) {
    if (!gDriveModal) return;

    var saas = getSaaSUserStatus();
    if (!saas.isUnlimited) {
      if (!repIdOrNull && state.repertoires && state.repertoires.length >= saas.maxRepertoires) {
        openSaasFreeLimitModal('repertoire', state.repertoires.length, saas.maxRepertoires);
        return;
      }
      PrompterDB.getAllSongs().then(function(allSongs) {
        var totalSongs = (allSongs && Array.isArray(allSongs)) ? allSongs.length : 0;
        if (totalSongs >= saas.maxSongs) {
          openSaasFreeLimitModal('song', totalSongs, saas.maxSongs);
          return;
        }
        _doOpenGDriveModal(repIdOrNull);
      }).catch(function() {
        _doOpenGDriveModal(repIdOrNull);
      });
      return;
    }
    _doOpenGDriveModal(repIdOrNull);
  }

  function _doOpenGDriveModal(repIdOrNull) {
    repCache = {};
    var nameInput = document.getElementById('gdriveRepertoireName');
    var modalHeader = gDriveModal.querySelector('.modal-header h3');

    if (repIdOrNull) {
      state.targetRepertoireId = repIdOrNull;
      var foundRep = (state.repertoires || []).find(function(r) { return r.id === repIdOrNull; }) || state.currentRepertoire;
      if (nameInput) {
        nameInput.value = foundRep ? foundRep.name : 'Repertório Atual';
        nameInput.setAttribute('disabled', 'true');
      }
      if (modalHeader) modalHeader.textContent = '☁️ Importar Google Drive para: ' + (foundRep ? foundRep.name : 'Repertório');
    } else {
      state.targetRepertoireId = null;
      if (nameInput) {
        nameInput.value = '';
        nameInput.removeAttribute('disabled');
      }
      if (modalHeader) modalHeader.textContent = '☁️ Importar do Google Drive';
      suggestRepertoireName('gdrive');
    }

    openModal(gDriveModal);
  }

  function onDriveStreamBatch(songsBatch) {
    if (!songsBatch || songsBatch.length === 0) return;

    var user = (window.PrompterAuth && window.PrompterAuth.getUser()) ? window.PrompterAuth.getUser() : null;
    var curEmail = user ? (user.email || '').toLowerCase() : '';
    var curId = user ? user.id : 'local_anonymous';

    // Se o usuário está adicionando a um repertório específico
    var targetRepId = state.targetRepertoireId;

    if (targetRepId) {
      songsBatch.forEach(function (s) {
        s.repertoireId = targetRepId;
        s.user_id = curId;
        s.user_email = curEmail;
      });
      PrompterDB.saveSongsBatch(songsBatch).then(function () {
        if (state.currentRepertoire && state.currentRepertoire.id === targetRepId) {
          openRepertoireSongs(targetRepId);
        } else {
          loadRepertoires();
        }
      }).catch(function(err) { console.error('Erro ao salvar lote no repertório alvo:', err); });
      return;
    }

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
        songsInGroup.forEach(function (s) {
          s.repertoireId = repId;
          s.user_id = curId;
          s.user_email = curEmail;
        });
        return PrompterDB.saveSongsBatch(songsInGroup).then(function () {
          if (state.currentRepertoire && state.currentRepertoire.id === repId) {
            openRepertoireSongs(repId);
          } else {
            loadRepertoires();
          }
        });
      } else {
        return PrompterDB.saveRepertoire({
          name: gName,
          source: 'gdrive',
          user_id: curId,
          user_email: curEmail
        }).then(function (newRepId) {
          repCache[gName] = newRepId;
          songsInGroup.forEach(function (s) {
            s.repertoireId = newRepId;
            s.user_id = curId;
            s.user_email = curEmail;
          });
          return PrompterDB.saveSongsBatch(songsInGroup);
        }).then(function () {
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
    if (!song) {
      var saas = getSaaSUserStatus();
      if (!saas.isUnlimited) {
        PrompterDB.getAllSongs().then(function(allSongs) {
          var totalSongs = (allSongs && Array.isArray(allSongs)) ? allSongs.length : 0;
          if (totalSongs >= saas.maxSongs) {
            openSaasFreeLimitModal('song', totalSongs, saas.maxSongs);
            return;
          }
          _populateEditorModal(null);
        }).catch(function() {
          _populateEditorModal(null);
        });
        return;
      }
    }
    _populateEditorModal(song);
  }

  function _populateEditorModal(song) {
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

    var repSelect = document.getElementById('editSongRepertoire');
    if (repSelect) {
      repSelect.innerHTML = '';
      var targetRepId = (song && song.repertoireId)
        ? song.repertoireId
        : (state.currentRepertoire ? state.currentRepertoire.id : (state.repertoires && state.repertoires.length > 0 ? state.repertoires[0].id : ''));
      
      var repsList = state.repertoires || [];
      if (repsList.length === 0 && state.currentRepertoire) {
        repsList = [state.currentRepertoire];
      }

      if (repsList.length > 0) {
        repsList.forEach(function(r) {
          var opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.name;
          if (r.id === targetRepId) opt.selected = true;
          repSelect.appendChild(opt);
        });
      } else {
        var opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Sem repertório (Geral)';
        repSelect.appendChild(opt);
      }
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

    if (!title) {
      showToast('Por favor, informe o nome da música.', 'warning');
      return;
    }

    if (!id) {
      var saas = getSaaSUserStatus();
      if (!saas.isUnlimited) {
        PrompterDB.getAllSongs().then(function(allSongs) {
          var totalSongs = (allSongs && Array.isArray(allSongs)) ? allSongs.length : 0;
          if (totalSongs >= saas.maxSongs) {
            closeModal(songEditorModal);
            openSaasFreeLimitModal('song', totalSongs, saas.maxSongs);
            return;
          }
          _executeSaveManualSong(id, title);
        }).catch(function() {
          _executeSaveManualSong(id, title);
        });
        return;
      }
    }
    _executeSaveManualSong(id, title);
  }

  function _executeSaveManualSong(id, title) {
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

    if (window.Transposer && typeof window.Transposer.normalizeKey === 'function') {
      if (key) key = window.Transposer.normalizeKey(key);
      if (originalKey) originalKey = window.Transposer.normalizeKey(originalKey);
    }

    if (!originalKey) {
      originalKey = TextParser.detectOriginalKey(content) || key;
    }

    var youtubeId = TextParser.extractYouTubeId(youtubeUrl);

    var repSelect = document.getElementById('editSongRepertoire');
    var selectedRepId = (repSelect && repSelect.value) ? repSelect.value : null;

    var repId = selectedRepId ||
      (state.editingSong && state.editingSong.repertoireId) ||
      (state.currentRepertoire && state.currentRepertoire.id) ||
      (state.repertoires && state.repertoires.length > 0 ? state.repertoires[0].id : null);

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
          updateSaaSPlanBanner();

          // Atualizar tela de repertório ativa para refletir a música no lugar certo
          if (state.currentRepertoire) {
            openRepertoireSongs(state.currentRepertoire.id);
          } else {
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
      var saas = getSaaSUserStatus();
      if (!saas.isUnlimited && state.repertoires && state.repertoires.length >= saas.maxRepertoires) {
        closeModal(songEditorModal);
        openSaasFreeLimitModal('repertoire', state.repertoires.length, saas.maxRepertoires);
        return;
      }
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
    var printDate = new Date().toLocaleDateString('pt-BR');

    var html =
      '<div class="stage-setlist-container">' +
        '<div class="stage-setlist-header">' +
          '<div class="stage-setlist-brand-block">' +
            '<div class="stage-setlist-logo-lockup">' +
              '<span class="stage-setlist-logo-icon" aria-hidden="true">' +
                '<svg class="ca-logo-mark" viewBox="0 0 84 84" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-linecap="round">' +
                  '<line x1="42.00" y1="12.00" x2="42.00" y2="4.00" stroke-width="5"/>' +
                  '<line x1="57.00" y1="16.02" x2="60.00" y2="10.82" stroke-width="3"/>' +
                  '<line x1="67.98" y1="27.00" x2="73.18" y2="24.00" stroke-width="3"/>' +
                  '<line x1="72.00" y1="42.00" x2="78.00" y2="42.00" stroke-width="3"/>' +
                  '<line x1="67.98" y1="57.00" x2="73.18" y2="60.00" stroke-width="3"/>' +
                  '<line x1="57.00" y1="67.98" x2="60.00" y2="73.18" stroke-width="3"/>' +
                  '<line x1="42.00" y1="72.00" x2="42.00" y2="78.00" stroke-width="3"/>' +
                  '<line x1="27.00" y1="67.98" x2="24.00" y2="73.18" stroke-width="3"/>' +
                  '<line x1="16.02" y1="57.00" x2="10.82" y2="60.00" stroke-width="3"/>' +
                  '<line x1="12.00" y1="42.00" x2="6.00" y2="42.00" stroke-width="3"/>' +
                  '<line x1="16.02" y1="27.00" x2="10.82" y2="24.00" stroke-width="3"/>' +
                  '<line x1="27.00" y1="16.02" x2="24.00" y2="10.82" stroke-width="3"/>' +
                  '<path d="M33 50 L51 34" stroke-width="9"/>' +
                '</svg>' +
              '</span>' +
              '<span class="stage-setlist-logo-title">Canta<span class="stage-setlist-logo-ai">Aí</span></span>' +
              '<span class="stage-setlist-logo-badge">PRO</span>' +
            '</div>' +
            '<div class="stage-setlist-slogan">Plataforma Profissional para Cantores e Músicos</div>' +
          '</div>' +
          '<div class="stage-setlist-info-block">' +
            '<h1 class="stage-setlist-title">' + escapeHtml(repName) + '</h1>' +
            '<div class="stage-setlist-meta">' +
              '<span class="stage-setlist-count">' + songs.length + ' MÚSICAS</span>' +
              '<span class="stage-setlist-date">' + printDate + '</span>' +
            '</div>' +
          '</div>' +
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
        '<div class="stage-setlist-footer">' +
          '<span>Gerado no CantaAí PRO • cantaaipro.com • Gestão Inteligente de Repertórios & Teleprompter</span>' +
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
  // Expõe globalmente para que módulos externos (notificationsCenter, etc.) possam usar
  window.showToast = showToast;

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
      clearAuthErrors();
      if (authModal) authModal.classList.add('hidden');
    }

    var forgotContainer = document.getElementById('forgotPasswordContainer');
    var btnForgotPassword = document.getElementById('btnForgotPassword');

    function setAuthMode(mode) {
      clearAuthErrors();
      currentAuthMode = mode;
      var signUpFields = document.getElementById('signUpFieldsGroup');
      var emailLabel = document.getElementById('authEmailLabel');
      var emailInput = document.getElementById('authEmail');
      var passInput = document.getElementById('authPassword');
      var singerCodeInput = document.getElementById('authSingerCode');
      var singerCodeFeedback = document.getElementById('authSingerCodeFeedback');
      var nameInput = document.getElementById('authName');
      var phoneInput = document.getElementById('authPhone');
      var cpfInput = document.getElementById('authCpf');
      var instaInput = document.getElementById('authInstagram');
      var couponInput = document.getElementById('authCouponCode');
      var termsCheck = document.getElementById('authAcceptTerms');

      if (mode === 'signup') {
        if (tabAuthSignUp) tabAuthSignUp.classList.add('active');
        if (tabAuthSignIn) tabAuthSignIn.classList.remove('active');
        if (signUpFields) signUpFields.classList.remove('hidden');
        if (btnSubmitAuth) btnSubmitAuth.innerText = 'Finalizar Cadastro & Acessar';
        if (authSubtitleText) authSubtitleText.innerText = 'Preencha seus dados para criar sua conta de cantor';
        if (forgotContainer) forgotContainer.style.display = 'none';

        if (emailLabel) emailLabel.innerText = 'E-mail Pessoal / Faturamento *';
        if (emailInput) {
          emailInput.placeholder = 'seuemail@exemplo.com';
          emailInput.value = '';
        }
        if (passInput) {
          passInput.value = '';
          passInput.setAttribute('autocomplete', 'new-password');
        }
        if (singerCodeInput) singerCodeInput.value = '';
        if (singerCodeFeedback) singerCodeFeedback.style.display = 'none';
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (cpfInput) cpfInput.value = '';
        if (instaInput) instaInput.value = '';
        if (couponInput) couponInput.value = '';
        if (termsCheck) termsCheck.checked = false;
      } else {
        if (tabAuthSignIn) tabAuthSignIn.classList.add('active');
        if (tabAuthSignUp) tabAuthSignUp.classList.remove('active');
        if (signUpFields) signUpFields.classList.add('hidden');
        if (btnSubmitAuth) btnSubmitAuth.innerText = 'Entrar na Conta';
        if (authSubtitleText) authSubtitleText.innerText = 'Acesse sua conta para ver seus repertórios';
        if (forgotContainer) forgotContainer.style.display = 'block';

        if (emailLabel) emailLabel.innerText = 'E-mail ou @Login *';
        if (emailInput) emailInput.placeholder = 'seuemail@exemplo.com ou @cantor';
        if (passInput) passInput.setAttribute('autocomplete', 'current-password');
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

    // ═══════════════════════════════════════════════════════════
    //  FLUXO DE RECUPERAÇÃO DE SENHA INTEGRADO (100% NA PLATAFORMA)
    // ═══════════════════════════════════════════════════════════
    var modalForgot = document.getElementById('forgotPasswordModal');
    var overlayForgot = document.getElementById('forgotPasswordModalOverlay');
    var btnCloseForgot = document.getElementById('btnCloseForgotPasswordModal');
    var btnBackToLogin = document.getElementById('btnBackToLoginFromForgot');
    var formForgot = document.getElementById('formForgotPassword');
    var inputForgotEmail = document.getElementById('inputForgotEmail');
    var alertForgot = document.getElementById('forgotPasswordAlert');
    var alertForgotText = document.getElementById('forgotPasswordAlertText');
    var alertForgotIcon = document.getElementById('forgotPasswordAlertIcon');
    var btnSubmitForgot = document.getElementById('btnSubmitForgotPassword');

    function openForgotPasswordModal() {
      closeAuthModal();
      if (modalForgot) {
        modalForgot.classList.remove('hidden');
        if (alertForgot) alertForgot.classList.add('hidden');
        if (inputForgotEmail) {
          var typed = (inputEmail && inputEmail.value && inputEmail.value.indexOf('@') !== -1) ? inputEmail.value.trim() : '';
          inputForgotEmail.value = typed;
          setTimeout(function () { inputForgotEmail.focus(); }, 150);
        }
      }
    }

    function closeForgotPasswordModal() {
      if (modalForgot) modalForgot.classList.add('hidden');
    }

    if (btnForgotPassword) {
      btnForgotPassword.addEventListener('click', function (e) {
        e.preventDefault();
        openForgotPasswordModal();
      });
    }

    if (btnCloseForgot) {
      btnCloseForgot.addEventListener('click', closeForgotPasswordModal);
    }
    if (overlayForgot) {
      overlayForgot.addEventListener('click', closeForgotPasswordModal);
    }
    if (btnBackToLogin) {
      btnBackToLogin.addEventListener('click', function () {
        closeForgotPasswordModal();
        openAuthModal();
      });
    }

    if (formForgot) {
      formForgot.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = inputForgotEmail ? inputForgotEmail.value.trim() : '';
        if (!email || email.indexOf('@') === -1) {
          if (alertForgot && alertForgotText) {
            alertForgot.classList.remove('hidden');
            alertForgot.style.background = 'rgba(239, 68, 68, 0.15)';
            alertForgot.style.borderColor = '#ef4444';
            if (alertForgotIcon) alertForgotIcon.innerText = '⚠️';
            alertForgotText.style.color = '#fca5a5';
            alertForgotText.innerText = 'Digite um endereço de e-mail válido.';
          }
          return;
        }

        if (btnSubmitForgot) {
          btnSubmitForgot.disabled = true;
          btnSubmitForgot.innerText = '🔄 Enviando link seguro...';
        }

        PrompterAuth.resetPassword(email).then(function () {
          if (btnSubmitForgot) {
            btnSubmitForgot.disabled = false;
            btnSubmitForgot.innerText = '✉️ Enviar Novamente';
          }
          if (alertForgot && alertForgotText) {
            alertForgot.classList.remove('hidden');
            alertForgot.style.background = 'rgba(16, 185, 129, 0.15)';
            alertForgot.style.borderColor = '#10b981';
            if (alertForgotIcon) alertForgotIcon.innerText = '✅';
            alertForgotText.style.color = '#6ee7b7';
            alertForgotText.innerHTML = 'Link de recuperação enviado com sucesso para <strong>' + email + '</strong>!<br>Verifique sua caixa de entrada e clique no link para redefinir sua senha diretamente nesta tela.';
          }
          showToast('Link de recuperação enviado para ' + email + '!', 'success');
        }).catch(function (err) {
          if (btnSubmitForgot) {
            btnSubmitForgot.disabled = false;
            btnSubmitForgot.innerText = '✉️ Enviar Link de Recuperação';
          }
          var errMsg = (err && (err.message || err.error_description)) || 'Erro ao enviar e-mail de recuperação.';
          if (alertForgot && alertForgotText) {
            alertForgot.classList.remove('hidden');
            alertForgot.style.background = 'rgba(239, 68, 68, 0.15)';
            alertForgot.style.borderColor = '#ef4444';
            if (alertForgotIcon) alertForgotIcon.innerText = '⚠️';
            alertForgotText.style.color = '#fca5a5';
            alertForgotText.innerText = errMsg;
          }
          showToast(errMsg, 'warning');
        });
      });
    }

    // ─── MODAL DE NOVA SENHA (QUANDO O USUÁRIO RETORNA VIA LINK DO E-MAIL) ───
    var modalReset = document.getElementById('resetPasswordModal');
    var overlayReset = document.getElementById('resetPasswordModalOverlay');
    var btnCloseReset = document.getElementById('btnCloseResetPasswordModal');
    var formReset = document.getElementById('formResetPassword');
    var inputNewPass = document.getElementById('inputNewPassword');
    var inputConfirmNewPass = document.getElementById('inputConfirmNewPassword');
    var alertReset = document.getElementById('resetPasswordAlert');
    var alertResetText = document.getElementById('resetPasswordAlertText');
    var alertResetIcon = document.getElementById('resetPasswordAlertIcon');
    var btnSubmitReset = document.getElementById('btnSubmitResetPassword');

    function closeResetPasswordModal() {
      if (modalReset) modalReset.classList.add('hidden');
    }

    window.openResetPasswordModal = function () {
      closeAuthModal();
      closeForgotPasswordModal();
      if (modalReset) {
        modalReset.classList.remove('hidden');
        if (alertReset) alertReset.classList.add('hidden');
        if (inputNewPass) {
          inputNewPass.value = '';
          setTimeout(function () { inputNewPass.focus(); }, 150);
        }
        if (inputConfirmNewPass) inputConfirmNewPass.value = '';
      }
    };

    if (btnCloseReset) {
      btnCloseReset.addEventListener('click', closeResetPasswordModal);
    }
    if (overlayReset) {
      overlayReset.addEventListener('click', closeResetPasswordModal);
    }

    if (formReset) {
      formReset.addEventListener('submit', function (e) {
        e.preventDefault();
        var p1 = inputNewPass ? inputNewPass.value : '';
        var p2 = inputConfirmNewPass ? inputConfirmNewPass.value : '';

        if (!p1 || p1.length < 6) {
          if (alertReset && alertResetText) {
            alertReset.classList.remove('hidden');
            alertReset.style.background = 'rgba(239, 68, 68, 0.15)';
            alertReset.style.borderColor = '#ef4444';
            if (alertResetIcon) alertResetIcon.innerText = '⚠️';
            alertResetText.style.color = '#fca5a5';
            alertResetText.innerText = 'A senha precisa ter pelo menos 6 caracteres.';
          }
          if (inputNewPass) inputNewPass.focus();
          return;
        }

        if (p1 !== p2) {
          if (alertReset && alertResetText) {
            alertReset.classList.remove('hidden');
            alertReset.style.background = 'rgba(239, 68, 68, 0.15)';
            alertReset.style.borderColor = '#ef4444';
            if (alertResetIcon) alertResetIcon.innerText = '⚠️';
            alertResetText.style.color = '#fca5a5';
            alertResetText.innerText = 'As senhas não coincidem. Digite novamente.';
          }
          if (inputConfirmNewPass) inputConfirmNewPass.focus();
          return;
        }

        if (btnSubmitReset) {
          btnSubmitReset.disabled = true;
          btnSubmitReset.innerText = '🔄 Atualizando sua senha...';
        }

        PrompterAuth.updatePassword(p1).then(function () {
          if (alertReset && alertResetText) {
            alertReset.classList.remove('hidden');
            alertReset.style.background = 'rgba(16, 185, 129, 0.15)';
            alertReset.style.borderColor = '#10b981';
            if (alertResetIcon) alertResetIcon.innerText = '🎉';
            alertResetText.style.color = '#6ee7b7';
            alertResetText.innerText = 'Senha alterada com sucesso! Conectando à sua conta...';
          }
          showToast('Senha redefinida com sucesso! Bem-vindo(a) de volta.', 'success');

          // Limpar hash da URL para não reabrir em refresh
          try {
            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
          } catch(e) {}

          setTimeout(function () {
            closeResetPasswordModal();
            if (typeof window.loadRepertoires === 'function') {
              window.loadRepertoires();
            }
            if (PrompterAuth.getCurrentUser()) {
              PrompterAuth.updateUIForAuth();
            }
          }, 1200);
        }).catch(function (err) {
          if (btnSubmitReset) {
            btnSubmitReset.disabled = false;
            btnSubmitReset.innerText = '💾 Salvar Nova Senha & Entrar';
          }
          var errMsg = (err && (err.message || err.error_description)) || 'Erro ao redefinir a senha. O link pode ter expirado.';
          if (alertReset && alertResetText) {
            alertReset.classList.remove('hidden');
            alertReset.style.background = 'rgba(239, 68, 68, 0.15)';
            alertReset.style.borderColor = '#ef4444';
            if (alertResetIcon) alertResetIcon.innerText = '⚠️';
            alertResetText.style.color = '#fca5a5';
            alertResetText.innerText = errMsg;
          }
          showToast(errMsg, 'warning');
        });
      });
    }

    var authErrorBanner = document.getElementById('authErrorBanner');
    var authErrorText = document.getElementById('authErrorText');
    var authBtnResetTimer = null;

    function clearAuthErrors() {
      if (authErrorBanner) authErrorBanner.classList.add('hidden');
      if (authErrorText) authErrorText.innerText = '';
      document.querySelectorAll('#formAuth .input-error-highlight').forEach(function(el) {
        el.classList.remove('input-error-highlight');
      });
      if (authBtnResetTimer) {
        clearTimeout(authBtnResetTimer);
        authBtnResetTimer = null;
      }
      if (btnSubmitAuth) {
        btnSubmitAuth.classList.remove('btn-auth-error');
      }
    }

    function showAuthError(msg, targetInputEl) {
      if (!msg) return;
      clearAuthErrors();

      // 1. Banner de erro dentro do modal de autenticação
      if (authErrorBanner && authErrorText) {
        authErrorText.innerText = msg;
        authErrorBanner.classList.remove('hidden');
        try {
          authErrorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch(e) {}
      }

      // 2. Notificação por cima de tudo no topo da tela
      showToast(msg, 'warning');

      // 3. Destacar campo com erro e focar nele
      if (targetInputEl) {
        targetInputEl.classList.add('input-error-highlight');
        try {
          targetInputEl.focus();
          targetInputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch(e) {}
        var onInputClear = function() {
          targetInputEl.classList.remove('input-error-highlight');
          if (authErrorBanner) authErrorBanner.classList.add('hidden');
          targetInputEl.removeEventListener('input', onInputClear);
          targetInputEl.removeEventListener('change', onInputClear);
        };
        targetInputEl.addEventListener('input', onInputClear);
        targetInputEl.addEventListener('change', onInputClear);
      }

      // 4. Mostrar feedback no próprio botão
      if (btnSubmitAuth) {
        btnSubmitAuth.disabled = false;
        btnSubmitAuth.classList.remove('btn-loading');
        btnSubmitAuth.classList.add('btn-auth-error');
        btnSubmitAuth.innerText = '⚠️ Verifique os dados acima';
        authBtnResetTimer = setTimeout(function() {
          if (btnSubmitAuth && !btnSubmitAuth.classList.contains('btn-loading')) {
            btnSubmitAuth.classList.remove('btn-auth-error');
            btnSubmitAuth.innerText = (currentAuthMode === 'signup') ? 'Finalizar Cadastro & Acessar' : 'Entrar na Conta';
          }
        }, 3000);
      }
    }

    var authBtnLoadingSafetyTimer = null;

    function setAuthButtonState(loading, text) {
      if (!btnSubmitAuth) return;
      if (authBtnResetTimer) {
        clearTimeout(authBtnResetTimer);
        authBtnResetTimer = null;
      }
      if (authBtnLoadingSafetyTimer) {
        clearTimeout(authBtnLoadingSafetyTimer);
        authBtnLoadingSafetyTimer = null;
      }
      btnSubmitAuth.classList.remove('btn-auth-error');
      if (loading) {
        btnSubmitAuth.disabled = true;
        btnSubmitAuth.classList.add('btn-loading');
        btnSubmitAuth.innerHTML = '<span class="auth-btn-spinner"></span> ' + (text || 'Processando...');
        // Failsafe timeout: nunca deixar o botão permanentemente travado em caso de lentidão de rede
        authBtnLoadingSafetyTimer = setTimeout(function() {
          if (btnSubmitAuth && btnSubmitAuth.classList.contains('btn-loading')) {
            setAuthButtonState(false);
            showAuthError('Tempo limite excedido. Verifique sua conexão e tente novamente.', null);
          }
        }, 9000);
      } else {
        btnSubmitAuth.disabled = false;
        btnSubmitAuth.classList.remove('btn-loading');
        btnSubmitAuth.innerText = (currentAuthMode === 'signup') ? 'Finalizar Cadastro & Acessar' : 'Entrar na Conta';
      }
    }

    function handleAuthSubmit() {
      clearAuthErrors();

      var emailEl = document.getElementById('authEmail');
      var passEl = document.getElementById('authPassword');
      var email = emailEl ? emailEl.value.trim() : '';
      var pass = passEl ? passEl.value : '';

      if (currentAuthMode === 'signup') {
        var nameEl = document.getElementById('authName');
        var singerCodeEl = document.getElementById('authSingerCode');
        var phoneEl = document.getElementById('authPhone');
        var cpfEl = document.getElementById('authCpf');
        var instaEl = document.getElementById('authInstagram');
        var couponEl = document.getElementById('authCouponCode');
        var chkTerms = document.getElementById('authAcceptTerms');

        var name = nameEl ? nameEl.value.trim() : '';
        var singerCode = singerCodeEl ? singerCodeEl.value.trim() : '';
        var phone = phoneEl ? phoneEl.value.trim() : '';
        var cpf = cpfEl ? cpfEl.value.trim() : '';
        var instagram = instaEl ? instaEl.value.trim() : '';
        var couponCode = couponEl ? couponEl.value.trim() : '';

        // 1. Validação do Nome
        if (!name || name.length < 2) {
          showAuthError('Por favor, informe seu Nome Completo ou Artístico.', nameEl);
          return;
        }

        // 2. Validação do @Login
        if (!singerCode) {
          showAuthError('Por favor, escolha seu @Login de usuário (ex: @meunome).', singerCodeEl);
          return;
        }
        var cleanHandle = singerCode.replace('@', '').trim();
        if (cleanHandle.length < 3) {
          showAuthError('Seu @Login deve conter no mínimo 3 caracteres.', singerCodeEl);
          return;
        }

        // 3. Validação do WhatsApp
        var cleanPhoneDigits = phone.replace(/\D/g, '');
        if (!phone || cleanPhoneDigits.length < 10) {
          showAuthError('Por favor, informe seu WhatsApp com DDD (mínimo 10 dígitos).', phoneEl);
          return;
        }

        // 4. Validação do E-mail
        if (!email) {
          showAuthError('Por favor, informe seu e-mail de acesso.', emailEl);
          return;
        }
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          showAuthError('Por favor, informe um e-mail válido (ex: seuemail@dominio.com).', emailEl);
          return;
        }

        // 5. Validação da Senha
        if (!pass) {
          showAuthError('Por favor, crie uma senha para sua conta.', passEl);
          return;
        }
        if (pass.length < 6) {
          showAuthError('A senha deve conter no mínimo 6 caracteres.', passEl);
          return;
        }

        // 6. Termos e LGPD
        if (chkTerms && !chkTerms.checked) {
          showAuthError('⚠️ É obrigatório concordar com os Termos de Uso e Política de Privacidade.', chkTerms);
          return;
        }

        // Iniciar Verificação do @Login com feedback visual no botão
        setAuthButtonState(true, 'Verificando @login...');
        PrompterAuth.checkSingerCodeAvailability(singerCode, null).then(function (checkRes) {
          if (!checkRes.available) {
            setAuthButtonState(false);
            showAuthError(checkRes.message || 'Este @Login já está em uso por outro cantor.', singerCodeEl);
            return;
          }

          // Criar Conta no Supabase com feedback no botão
          setAuthButtonState(true, 'Criando sua conta...');
          return PrompterAuth.signUp({
            name: name,
            singerCode: singerCode,
            phone: phone,
            cpf: cpf,
            instagram: instagram,
            couponCode: couponCode,
            email: email,
            password: pass
          }).then(function (res) {
            setAuthButtonState(true, 'Conta criada! Entrando...');
            setTimeout(function () {
              setAuthButtonState(false);
              closeAuthModal();
              showApp();
              showToast('🎉 Conta criada com sucesso! Bem-vindo ao CantaAí PRO!', 'success');
              openWelcomeOnboardingModal({
                name: name,
                singerCode: singerCode,
                planType: (res && res.profile && res.profile.plan_type) ? res.profile.plan_type : '⚡ PLANO FREE'
              });
            }, 600);
          });
        }).catch(function (err) {
          setAuthButtonState(false);
          var msg = (err && err.message) ? err.message : 'Erro ao criar conta. Verifique os dados e tente novamente.';
          showAuthError(msg, null);
          if (msg.indexOf('já está cadastrado') !== -1) {
            setTimeout(function () {
              var tabSignIn = document.getElementById('tabAuthSignIn');
              if (tabSignIn) tabSignIn.click();
              var emailIn = document.getElementById('authEmail');
              if (emailIn && email) emailIn.value = email;
              var passIn = document.getElementById('authPassword');
              if (passIn && pass) passIn.value = pass;
              showAuthError('Este e-mail já está cadastrado. Seus dados foram sincronizados no painel! Clique abaixo em "Entrar na Minha Conta".', null);
            }, 1400);
          }
        });

      } else {
        // Modo SIGNIN (Entrar)
        if (!email) {
          showAuthError('Por favor, informe seu e-mail ou @login.', emailEl);
          return;
        }
        if (!pass) {
          showAuthError('Por favor, informe sua senha.', passEl);
          return;
        }

        setAuthButtonState(true, 'Entrando na conta...');
        PrompterAuth.signIn(email, pass).then(function () {
          setAuthButtonState(true, 'Conectado com sucesso!');
          setTimeout(function () {
            setAuthButtonState(false);
            closeAuthModal();
            showApp();
            showToast('🎉 Bem-vindo ao CantaAí PRO!', 'success');
          }, 500);
        }).catch(function (err) {
          setAuthButtonState(false);
          var msg = (err && err.message) ? err.message : 'E-mail ou senha incorretos.';
          showAuthError(msg, passEl);
        });
      }
    }

    // ── MODAL DE BOAS-VINDAS & GUIA INICIAL (ONBOARDING) ──
    var welcomeModal = document.getElementById('welcomeOnboardingModal');
    var welcomeOverlay = document.getElementById('welcomeOnboardingOverlay');
    var btnWelcomeStart = document.getElementById('btnWelcomeStartRepertoire');
    var btnWelcomeClose = document.getElementById('btnWelcomeClose');
    var welcomeGreeting = document.getElementById('welcomeUserGreeting');
    var welcomeBadge = document.getElementById('welcomePlanBadge');
    var welcomeDesc = document.getElementById('welcomePlanDesc');

    function openWelcomeOnboardingModal(data) {
      if (!welcomeModal) return;
      var name = (data && data.name) ? data.name : 'Cantor';
      var singerCode = (data && data.singerCode) ? data.singerCode : '';
      var planType = (data && data.planType) ? data.planType : '⚡ PLANO FREE';
      var isPro = planType.indexOf('PRO') !== -1 || planType.indexOf('VIP') !== -1;

      if (welcomeGreeting) {
        welcomeGreeting.innerHTML = 'Olá, <strong>' + escapeHtml(name) + '</strong>! Seu @Login oficial é <strong>' + escapeHtml(singerCode) + '</strong>.';
      }
      if (welcomeBadge) {
        welcomeBadge.innerText = planType;
        welcomeBadge.style.color = isPro ? '#fbbf24' : 'var(--tom-G-ink)';
      }
      if (welcomeDesc) {
        if (isPro) {
          welcomeDesc.innerText = '💎 Parabéns! Você tem Acesso Total Ilimitado a todas as músicas, cifras, modais e transposição em tempo real!';
        } else {
          welcomeDesc.innerText = '⚡ Seu plano permite cadastrar repertórios e testar todo o poder da rolagem automática inteligente e modo offline!';
        }
      }
      welcomeModal.classList.remove('hidden');
    }

    function closeWelcomeOnboardingModal() {
      if (welcomeModal) welcomeModal.classList.add('hidden');
    }

    if (welcomeOverlay) welcomeOverlay.addEventListener('click', closeWelcomeOnboardingModal);
    if (btnWelcomeClose) btnWelcomeClose.addEventListener('click', closeWelcomeOnboardingModal);
    if (btnWelcomeStart) {
      btnWelcomeStart.addEventListener('click', function () {
        closeWelcomeOnboardingModal();
        var btnNewRep = document.getElementById('btnNewRepertoire');
        if (btnNewRep) btnNewRep.click();
      });
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
      var lastProfileToggleTime = 0;
      var handleProfileTrigger = function (e) {
        var now = Date.now();
        if (now - lastProfileToggleTime < 350) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        lastProfileToggleTime = now;
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        // Fechar dropdown de adicionar se estiver aberto
        var addMenu = document.getElementById('dropdownAddMenu');
        if (addMenu && !addMenu.classList.contains('hidden')) {
          addMenu.classList.add('hidden');
        }
        userProfileMenu.classList.toggle('hidden');
      };

      btnUserProfileTrigger.addEventListener('click', handleProfileTrigger);
      btnUserProfileTrigger.addEventListener('touchend', handleProfileTrigger);

      var closeIfOutsideProfileMenu = function (e) {
        if (!userProfileMenu || userProfileMenu.classList.contains('hidden')) return;
        var target = e.target;
        if (btnUserProfileTrigger.contains(target) || (target.closest && target.closest('#btnUserProfileTrigger'))) return;
        if (userProfileMenu.contains(target) || (target.closest && target.closest('#userProfileMenu'))) return;
        userProfileMenu.classList.add('hidden');
      };
      document.addEventListener('click', closeIfOutsideProfileMenu);
      document.addEventListener('touchend', closeIfOutsideProfileMenu);
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

    function formatCustomerTenure(dateInput) {
      if (!dateInput) return 'Novo no CantaAí';
      var start = new Date(dateInput);
      var now = new Date();
      if (isNaN(start.getTime())) return 'Novo no CantaAí';
      var diffMs = now.getTime() - start.getTime();
      if (diffMs < 0) return 'Recém chegado';
      var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Hoje';
      if (diffDays === 1) return 'Há 1 dia';
      if (diffDays < 30) return 'Há ' + diffDays + ' dias';
      var diffMonths = Math.floor(diffDays / 30);
      if (diffMonths === 1) return 'Há 1 mês';
      if (diffMonths < 12) return 'Há ' + diffMonths + ' meses';
      var diffYears = Math.floor(diffMonths / 12);
      var remMonths = diffMonths % 12;
      if (diffYears === 1) return remMonths > 0 ? ('Há 1 ano e ' + remMonths + 'm') : 'Há 1 ano';
      return remMonths > 0 ? ('Há ' + diffYears + ' anos e ' + remMonths + 'm') : ('Há ' + diffYears + ' anos');
    }

    function renderProfileInvoices(userEmail) {
      var listEl = document.getElementById('profileInvoicesList');
      if (!listEl) return;
      var clean = (userEmail || '').trim().toLowerCase();
      var rawFin = localStorage.getItem('canta_ai_finance_ledger');
      var ledger = [];
      try {
        ledger = rawFin ? JSON.parse(rawFin) : [];
      } catch (e) { ledger = []; }

      var userTxs = ledger.filter(function(tx) {
        return tx && tx.user_email && tx.user_email.toLowerCase() === clean;
      });

      if (userTxs.length === 0) {
        var profile = PrompterAuth.getProfile() || {};
        var uEmailClean = (profile.email || '').toLowerCase().trim();
        var isVip = !!(profile.is_vip || (profile.plan_type && profile.plan_type.indexOf('VIP') !== -1) || profile.plan_tier === 'vip' || profile.coupon_used === 'VIP100' || uEmailClean === 'alinecrissallai@gmail.com');
        var isPro = isVip || profile.plan_tier === 'pro';
        if (isPro) {
          userTxs.push({
            id: 'fin-init-1',
            paid_at: profile.created_at || new Date().toISOString(),
            plan_type: isVip ? '👑 VIP (Isenção 100%)' : (profile.plan_type || '💎 PRO ANUAL'),
            method: isVip ? 'Cortesia VIP' : (profile.payment_method || 'Pix'),
            amount: isVip ? 0.00 : 299.00
          });
        }
      }

      if (userTxs.length === 0) {
        listEl.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 12px; color: #64748b;">Nenhuma fatura registrada neste perfil.</td></tr>';
        return;
      }

      var rowsHtml = '';
      userTxs.forEach(function(tx) {
        var dt = tx.paid_at ? new Date(tx.paid_at) : new Date();
        var dtStr = String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
        var amtStr = tx.amount === 0 ? 'R$ 0,00 (Isento)' : (Number(tx.amount || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        var methodStr = (tx.method === 'mercadopago' || tx.method === 'cartao') ? '💳 Cartão' : (tx.method === 'pix' ? '⚡ Pix' : (tx.method || '⚡ Pix'));
        rowsHtml += '<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">' +
          '<td style="padding: 7px 8px; color: #cbd5e1;">' + dtStr + '</td>' +
          '<td style="padding: 7px 8px; font-weight: 700; color: #f8fafc;">' + (tx.plan_type || 'Plano PRO') + '</td>' +
          '<td style="padding: 7px 8px; color: #94a3b8;">' + methodStr + '</td>' +
          '<td style="padding: 7px 8px; font-weight: 700; color: #34d399;">' + amtStr + '</td>' +
          '<td style="padding: 7px 8px;"><span class="badge-fin-paid" style="font-size:0.7rem; padding: 2px 6px; border-radius:4px; background: rgba(16,185,129,0.2); color:#34d399;">🟢 PAGO</span></td>' +
        '</tr>';
      });
      listEl.innerHTML = rowsHtml;
    }

    function openProfileModal() {
      if (!profileModal) return;
      if (window.PrompterAuth && typeof window.PrompterAuth.updateUIForAuth === 'function') {
        window.PrompterAuth.updateUIForAuth();
      }

      var profile = PrompterAuth.getProfile() || {};
      var user = PrompterAuth.getUser() || {};
      var email = (profile && profile.email) ? profile.email : (user ? user.email : '');
      var cleanEmail = (email || '').trim().toLowerCase();

      var isDev = (window.isPlatformDeveloper && window.isPlatformDeveloper(cleanEmail)) ||
                  cleanEmail === 'leovitulli@gmail.com' || cleanEmail === 'leonardovitulli@gmail.com' ||
                  (window.PrompterAuth && window.PrompterAuth.isAdmin && window.PrompterAuth.isAdmin());

      // Sincronizar em tempo real com canta_ai_admin_users apenas para clientes (não dev)
      if (!isDev) {
        try {
          var rawUsers = localStorage.getItem('canta_ai_admin_users');
          if (rawUsers) {
            var uList = JSON.parse(rawUsers);
            var adminUser = uList.find(function(u) {
              return (u.email && u.email.trim().toLowerCase() === cleanEmail) || (u.id && user && u.id === user.id);
            });
            if (adminUser) {
              if (adminUser.plan_tier) profile.plan_tier = adminUser.plan_tier;
              if (adminUser.plan_type) profile.plan_type = adminUser.plan_type;
              if (adminUser.is_vip !== undefined) profile.is_vip = adminUser.is_vip;
              if (adminUser.billing_due_date) profile.billing_due_date = adminUser.billing_due_date;
              if (adminUser.created_at) profile.created_at = adminUser.created_at;
              if (adminUser.auto_renew !== undefined) profile.auto_renew = adminUser.auto_renew;
              if (adminUser.phone && !profile.phone) profile.phone = adminUser.phone;
              if (adminUser.cpf && !profile.cpf) profile.cpf = adminUser.cpf;
              if (adminUser.instagram && !profile.instagram) profile.instagram = adminUser.instagram;
            }
          }
        } catch (e) {}
      }

      var isVip = !isDev && !!(profile && (profile.is_vip || (profile.plan_type && profile.plan_type.indexOf('VIP') !== -1) || profile.plan_tier === 'vip' || profile.coupon_used === 'VIP100' || cleanEmail === 'alinecrissallai@gmail.com'));
      var isPro = isDev || isVip || (profile && profile.plan_tier === 'pro');
      var isMonthly = !isDev && isPro && profile.plan_type && profile.plan_type.indexOf('MENSAL') !== -1;

      var scopedHandle = cleanEmail ? localStorage.getItem('cantaai_user_custom_handle_' + cleanEmail) : null;
      var legacyHandle = (cleanEmail === 'leovitulli@gmail.com') ? localStorage.getItem('cantaai_user_custom_handle') : null;
      var code = scopedHandle || legacyHandle || (profile && profile.singer_code) || ('@' + (cleanEmail ? cleanEmail.split('@')[0] : 'cantor'));
      if (!code || code.startsWith('#') || code.toUpperCase().indexOf('CANTOR-') !== -1 || code.toUpperCase().indexOf('DEV-ADMIN') !== -1) {
        code = (cleanEmail === 'leovitulli@gmail.com') ? (legacyHandle || '@leovitulli') : ('@' + (cleanEmail ? cleanEmail.split('@')[0] : 'cantor'));
      }
      if (!code.startsWith('@')) code = '@' + code;

      var displayName = (profile && profile.display_name) ? profile.display_name : (cleanEmail.split('@')[0] || 'Cantor');
      displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
      var initial = (displayName.charAt(0) || 'U').toUpperCase();

      if (profileModalAvatar) profileModalAvatar.innerText = initial;
      if (profileModalEmail) profileModalEmail.innerText = email || 'cantor@cantaaipro.com';
      if (profileModalCodePill) profileModalCodePill.innerText = 'Código: ' + code;
      if (profileDisplayNameInput) profileDisplayNameInput.value = (profile && profile.display_name) ? profile.display_name : displayName;
      if (profileSingerCodeInput) profileSingerCodeInput.value = code;

      var inputPhone = document.getElementById('profilePhoneInput');
      var inputCpf = document.getElementById('profileCpfInput');
      var inputInstagram = document.getElementById('profileInstagramInput');
      if (inputPhone) inputPhone.value = profile.phone || '';
      if (inputCpf) inputCpf.value = profile.cpf || '';
      if (inputInstagram) {
        inputInstagram.value = profile.instagram || (cleanEmail === 'leovitulli@gmail.com' ? '@leovitulli' : '');
      }

      // Lifecycle metadata & Header Titles
      var elMainTitle = document.getElementById('profileModalMainTitle');
      var elSubTitle = document.getElementById('profileModalSubTitle');
      if (elMainTitle) elMainTitle.innerText = isDev ? '👤 Meu Perfil de Cantor & Central Master' : 'Meu Perfil & Governança de Assinatura';
      if (elSubTitle) elSubTitle.innerText = isDev ? 'Gerencie seus dados artísticos de palco e acesse os privilégios do SuperAdmin.' : 'Gerencie seus dados artísticos, faturamento, cartão, Pix e ciclo de renovação.';

      var createdDt = profile.created_at ? new Date(profile.created_at) : new Date();
      var createdDateStr = String(createdDt.getDate()).padStart(2, '0') + '/' + String(createdDt.getMonth() + 1).padStart(2, '0') + '/' + createdDt.getFullYear();
      var tenureStr = formatCustomerTenure(profile.created_at);
      var elLifecycleBadge = document.getElementById('profileLifecycleBadge');
      if (elLifecycleBadge) {
        if (isDev) {
          elLifecycleBadge.innerHTML = '<span>👑 Cargo: <strong style="color: #38bdf8;">Desenvolvedor & Criador</strong></span> • <span style="color:#34d399; font-weight:700;">Acesso Master Vitalício</span>';
        } else {
          elLifecycleBadge.innerHTML = '<span>📅 Cadastro: <strong id="profileCreatedDateDisplay" style="color: #ffffff;">' + createdDateStr + '</strong></span> • <span style="color: #38bdf8; font-weight: 700;">⏳ <span id="profileTenureDisplay">' + tenureStr + '</span></span>';
        }
      }

      // Cards e Seções de Governança vs Desenvolvedor
      var devCard = document.getElementById('profileDeveloperCard');
      var govCard = document.getElementById('profileGovernanceCard');
      var payBox = document.getElementById('profilePaymentMethodsBox');
      var upgradeBanner = document.getElementById('profileUpgradeBanner');
      var invoicesSec = document.getElementById('profileInvoicesSection');
      var supportSec = document.getElementById('profileSupportSection');

      if (isDev) {
        if (devCard) devCard.style.display = 'block';
        if (govCard) govCard.style.display = 'none';
        if (payBox) payBox.style.display = 'none';
        if (upgradeBanner) upgradeBanner.style.display = 'none';
        if (invoicesSec) invoicesSec.style.display = 'none';
        if (supportSec) supportSec.style.display = 'none';

        var btnDevAdm = document.getElementById('btnDevOpenAdminModal');
        var btnDevHelp = document.getElementById('btnDevOpenHelpdeskModal');
        if (btnDevAdm && !btnDevAdm._bound) {
          btnDevAdm._bound = true;
          btnDevAdm.addEventListener('click', function() {
            closeProfileModal();
            if (window.PrompterAdmin && typeof window.PrompterAdmin.openAdminModal === 'function') {
              window.PrompterAdmin.openAdminModal();
            }
          });
        }
        if (btnDevHelp && !btnDevHelp._bound) {
          btnDevHelp._bound = true;
          btnDevHelp.addEventListener('click', function() {
            closeProfileModal();
            if (window.PrompterAdmin && typeof window.PrompterAdmin.openAdminModal === 'function') {
              window.PrompterAdmin.openAdminModal();
              if (typeof window.PrompterAdmin.switchAdminTab === 'function') {
                window.PrompterAdmin.switchAdminTab('helpdesk');
              }
            }
          });
        }
      } else {
        if (devCard) devCard.style.display = 'none';
        if (govCard) govCard.style.display = 'block';
        if (payBox) payBox.style.display = 'block';
        if (invoicesSec) invoicesSec.style.display = 'block';
        if (supportSec) supportSec.style.display = 'block';

        // Governança de Assinatura do Cliente
        var elPlanBadge = document.getElementById('profileSubPlanBadge');
        var elStatusPill = document.getElementById('profileSubStatusPill');
        var elPrice = document.getElementById('profilePlanPriceDisplay');
        var elDueDate = document.getElementById('profileDueDateDisplay');
        var elDaysRem = document.getElementById('profileDaysRemainingDisplay');
        var elAutoRenew = document.getElementById('profileAutoRenewDisplay');

        var pricing = (window.PrompterAdmin && typeof window.PrompterAdmin.getPricingConfig === 'function')
          ? window.PrompterAdmin.getPricingConfig()
          : { monthlyPrice: 39.90, annualPrice: 299.00 };
        var annual = pricing.annualPrice || 299.00;
        var monthly = pricing.monthlyPrice || 39.90;

        // Due date & countdown
        var dueDateObj = profile.billing_due_date ? new Date(profile.billing_due_date) : null;
        if (!dueDateObj || isNaN(dueDateObj.getTime())) {
          if (isPro) {
            dueDateObj = new Date(Date.now() + 365 * 24 * 3600 * 1000);
          }
        }

        var dueDateStr = dueDateObj ? (String(dueDateObj.getDate()).padStart(2, '0') + '/' + String(dueDateObj.getMonth() + 1).padStart(2, '0') + '/' + dueDateObj.getFullYear()) : '--/--/----';
        var diffDays = dueDateObj ? Math.ceil((dueDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
        var autoRenewActive = profile.auto_renew !== false;

        if (isVip) {
          if (elPlanBadge) elPlanBadge.innerHTML = '👑 PARCEIRO VIP (100% OFF)';
          if (elStatusPill) {
            elStatusPill.className = 'sub-status-pill';
            elStatusPill.innerHTML = '🟢 Cortesia Vitalícia';
          }
          if (elPrice) elPrice.innerHTML = 'R$ 0,00 <span style="font-size: 0.75rem; color: #a7f3d0; font-weight: 600;">(Isento Vitalício)</span>';
          if (elDueDate) elDueDate.innerText = 'Vitalício';
          if (elDaysRem) elDaysRem.innerText = 'Acesso Ilimitado';
          if (elAutoRenew) elAutoRenew.innerHTML = '<span>👑</span> Parceiro VIP Oficial • Isenção total e permanente concedida pela diretoria';
          if (upgradeBanner) upgradeBanner.style.display = 'none';
        } else if (isPro) {
          if (elPlanBadge) elPlanBadge.innerHTML = isMonthly ? '⚡ PLANO CANTAAÍ PRO MENSAL' : '👑 PLANO CANTAAÍ PRO ANUAL';
          if (elPrice) {
            elPrice.innerHTML = isMonthly
              ? (monthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">/mês</span>')
              : (annual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">/ano</span>');
          }
          if (elDueDate) elDueDate.innerText = dueDateStr;
          if (elDaysRem) {
            if (diffDays > 0) elDaysRem.innerText = diffDays + ' dias restantes';
            else if (diffDays === 0) elDaysRem.innerText = 'Vence hoje';
            else elDaysRem.innerText = 'Vencido há ' + Math.abs(diffDays) + 'd';
          }
          if (autoRenewActive) {
            if (elStatusPill) {
              elStatusPill.className = 'sub-status-pill';
              elStatusPill.innerHTML = '🟢 Assinatura Ativa';
            }
            if (elAutoRenew) elAutoRenew.innerHTML = '<span>🔄</span> Renovação automática ativa no método cadastrado';
          } else {
            if (elStatusPill) {
              elStatusPill.className = 'sub-status-pill pill-warning';
              elStatusPill.innerHTML = '🟡 Cancelamento Agendado';
            }
            if (elAutoRenew) elAutoRenew.innerHTML = '<span style="color:#fbbf24;">⚠️</span> Cancelamento agendado: acesso garantido até <strong>' + dueDateStr + '</strong>';
          }
          if (upgradeBanner) upgradeBanner.style.display = isMonthly ? 'flex' : 'none';
        } else {
          if (elPlanBadge) elPlanBadge.innerHTML = '⚡ PLANO FREE';
          if (elStatusPill) {
            elStatusPill.className = 'sub-status-pill pill-warning';
            elStatusPill.innerHTML = '⚪ Degustação Free';
          }
          if (elPrice) elPrice.innerHTML = 'R$ 0,00 <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">(Até 5 Músicas)</span>';
          if (elDueDate) elDueDate.innerText = '—';
          if (elDaysRem) elDaysRem.innerText = 'Sem expiração';
          if (elAutoRenew) elAutoRenew.innerHTML = '<span>⚡</span> Limite de 5 músicas ativado. Faça upgrade para desbloquear repertórios ilimitados.';
          if (upgradeBanner) upgradeBanner.style.display = 'flex';
        }

        // Card status
        var elCardStatus = document.getElementById('profileCardStatusDisplay');
        if (elCardStatus) {
          if (profile.card_last_four) {
            elCardStatus.innerHTML = '<strong style="color:#ffffff;">' + (profile.card_brand || 'Cartão').toUpperCase() + '</strong> final •••• ' + profile.card_last_four + ' (Ativo)';
          } else {
            elCardStatus.innerText = 'Nenhum cartão cadastrado no checkout transparente.';
          }
        }

        // Render faturas
        renderProfileInvoices(cleanEmail);

        // Atualizar link WhatsApp de suporte com nome do cantor
        var btnSendProof = document.getElementById('btnProfileSendPixProof');
        var btnSendProofDirect = document.getElementById('btnProfileSendPixProofDirect');
        var waMsg = 'Olá! Sou o cantor ' + displayName + ' (' + email + '). Acabei de fazer o pagamento Pix da assinatura CantaAí PRO e envio o comprovante para baixa expressa.';
        var waUrl = 'https://wa.me/5511985360000?text=' + encodeURIComponent(waMsg);
        if (btnSendProof) btnSendProof.href = waUrl;
        if (btnSendProofDirect) btnSendProofDirect.href = waUrl;

        // Atualizar link WhatsApp do cancelamento
        var btnCancelWa = document.getElementById('btnCancelSubWaCeo');
        if (btnCancelWa) {
          var cancelWaMsg = 'Olá Leonardo! Sou o cantor ' + displayName + ' (' + email + '). Gostaria de conversar sobre minha assinatura CantaAí PRO antes de cancelar.';
          btnCancelWa.href = 'https://wa.me/5511985360000?text=' + encodeURIComponent(cancelWaMsg);
        }

        var cancelNotice = document.getElementById('cancelSubCycleNotice');
        if (cancelNotice) {
          cancelNotice.innerHTML = 'Seu acesso PRO continuará 100% ativo até o final do período faturado em <strong>' + dueDateStr + '</strong>. Nenhuma cobrança futura será realizada.';
        }
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
        var newPhone = (document.getElementById('profilePhoneInput') ? document.getElementById('profilePhoneInput').value : '').trim();
        var newCpf = (document.getElementById('profileCpfInput') ? document.getElementById('profileCpfInput').value : '').trim();
        var newInstagram = (document.getElementById('profileInstagramInput') ? document.getElementById('profileInstagramInput').value : '').trim();
        if (newInstagram && !newInstagram.startsWith('@')) newInstagram = '@' + newInstagram;

        if (!newName) {
          showToast('Por favor, informe seu nome artístico ou de cantor.', 'warning');
          return;
        }

        PrompterAuth.saveProfileDetails(newName, newCode, newPhone, newCpf, newInstagram).then(function () {
          var updatedProfile = PrompterAuth.getProfile() || {};
          var finalCode = (updatedProfile && updatedProfile.singer_code) ? updatedProfile.singer_code : (newCode ? PrompterAuth.formatSingerCode(newCode) : '');
          if (profileModalCodePill && finalCode) profileModalCodePill.innerText = 'Código: ' + finalCode;

          if (window.PrompterAuth && typeof window.PrompterAuth.updateUIForAuth === 'function') {
            window.PrompterAuth.updateUIForAuth();
          }
          showToast('✅ Dados do perfil atualizados com sucesso!', 'success');
          closeProfileModal();
        }).catch(function (err) {
          showToast(err.message || 'Erro ao salvar alterações.', 'warning');
        });
      });
    }

    // Ações de Pagamento e Assinatura no Perfil
    var btnProfilePayPix = document.getElementById('btnProfilePayPix');
    var modalProfilePix = document.getElementById('modalProfilePixPayment');
    var btnCloseProfilePix = document.getElementById('btnCloseProfilePixModal');
    var btnCloseProfilePixFoot = document.getElementById('btnCloseProfilePixFooter');
    var overlayProfilePix = document.getElementById('modalProfilePixOverlay');
    var btnCopyPix = document.getElementById('btnCopyProfilePixCode');

    if (btnProfilePayPix) {
      btnProfilePayPix.addEventListener('click', function () {
        if (modalProfilePix) openModal(modalProfilePix);
      });
    }

    if (btnCloseProfilePix) btnCloseProfilePix.addEventListener('click', function() { if (modalProfilePix) closeModal(modalProfilePix); });
    if (btnCloseProfilePixFoot) btnCloseProfilePixFoot.addEventListener('click', function() { if (modalProfilePix) closeModal(modalProfilePix); });
    if (overlayProfilePix) overlayProfilePix.addEventListener('click', function() { if (modalProfilePix) closeModal(modalProfilePix); });

    if (btnCopyPix) {
      btnCopyPix.addEventListener('click', function() {
        var input = document.getElementById('profilePixCodeInput');
        if (input) {
          navigator.clipboard.writeText(input.value).then(function() {
            showToast('📋 Chave Pix copiada com sucesso!', 'success');
          }).catch(function() {
            input.select();
            document.execCommand('copy');
            showToast('📋 Chave Pix copiada!', 'success');
          });
        }
      });
    }

    var btnProfileUpdateCard = document.getElementById('btnProfileUpdateCard');
    if (btnProfileUpdateCard) {
      btnProfileUpdateCard.addEventListener('click', function () {
        closeProfileModal();
        openCheckoutSaaSModal();
        if (btnPayCard) btnPayCard.click();
      });
    }

    var btnProfileUpgradeAnnual = document.getElementById('btnProfileUpgradeAnnual');
    if (btnProfileUpgradeAnnual) {
      btnProfileUpgradeAnnual.addEventListener('click', function () {
        closeProfileModal();
        openCheckoutSaaSModal();
        if (cardPlanAnnual) cardPlanAnnual.click();
      });
    }

    // Modal de Cancelamento & Retenção Responsável
    var modalCancelSub = document.getElementById('modalCancelSubscription');
    var btnCloseCancelSub = document.getElementById('btnCloseCancelSubModal');
    var btnCloseCancelSubFoot = document.getElementById('btnCloseCancelSubFooter');
    var overlayCancelSub = document.getElementById('modalCancelSubOverlay');
    var btnPauseSub = document.getElementById('btnPauseSubscription');
    var btnConfirmCancelAuto = document.getElementById('btnConfirmCancelAutoRenew');

    function closeCancelSubModal() {
      if (modalCancelSub) closeModal(modalCancelSub);
    }

    if (btnManageOrCancelPlan) {
      btnManageOrCancelPlan.addEventListener('click', function () {
        var profile = PrompterAuth.getProfile() || {};
        var uEmailClean = (profile.email || '').toLowerCase().trim();
        var isVip = !!(profile.is_vip || (profile.plan_type && profile.plan_type.indexOf('VIP') !== -1) || profile.plan_tier === 'vip' || profile.coupon_used === 'VIP100' || uEmailClean === 'alinecrissallai@gmail.com');
        var isPro = isVip || profile.plan_tier === 'pro' || (PrompterAuth.getUser() && PrompterAuth.getUser().email === 'leovitulli@gmail.com');

        if (isVip) {
          showToast('👑 Você é um Parceiro VIP oficial com acesso isento vitalício! Sua conta nunca será cobrada.', 'info');
          return;
        }

        if (!isPro) {
          showToast('Você está no plano Free. Faça upgrade para o PRO para desbloquear todos os recursos.', 'info');
          return;
        }

        if (modalCancelSub) openModal(modalCancelSub);
      });
    }

    if (btnCloseCancelSub) btnCloseCancelSub.addEventListener('click', closeCancelSubModal);
    if (btnCloseCancelSubFoot) btnCloseCancelSubFoot.addEventListener('click', closeCancelSubModal);
    if (overlayCancelSub) overlayCancelSub.addEventListener('click', closeCancelSubModal);

    if (btnPauseSub) {
      btnPauseSub.addEventListener('click', function () {
        var profile = PrompterAuth.getProfile() || {};
        var user = PrompterAuth.getUser();
        var cleanEmail = (profile.email || (user ? user.email : '') || '').trim().toLowerCase();

        // Estender ciclo em +30 dias
        var baseDate = profile.billing_due_date ? new Date(profile.billing_due_date) : new Date();
        if (isNaN(baseDate.getTime())) baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + 30);
        var newDueIso = baseDate.toISOString();

        profile.billing_due_date = newDueIso;
        profile.auto_renew = false;
        PrompterAuth.saveSession(user, profile);

        // Atualizar no canta_ai_admin_users
        try {
          var rawUsers = localStorage.getItem('canta_ai_admin_users');
          if (rawUsers) {
            var uList = JSON.parse(rawUsers);
            var matchUser = uList.find(function(u) { return u.email && u.email.trim().toLowerCase() === cleanEmail; });
            if (matchUser) {
              matchUser.billing_due_date = newDueIso;
              matchUser.auto_renew = false;
              localStorage.setItem('canta_ai_admin_users', JSON.stringify(uList));
            }
          }
        } catch (e) {}

        var newDueStr = String(baseDate.getDate()).padStart(2, '0') + '/' + String(baseDate.getMonth() + 1).padStart(2, '0') + '/' + baseDate.getFullYear();
        closeCancelSubModal();
        openProfileModal();
        showToast('⏸️ Assinatura pausada com sucesso por 30 dias! Acesso garantido até ' + newDueStr + '.', 'success');
      });
    }

    if (btnConfirmCancelAuto) {
      btnConfirmCancelAuto.addEventListener('click', function () {
        var profile = PrompterAuth.getProfile() || {};
        var user = PrompterAuth.getUser();
        var cleanEmail = (profile.email || (user ? user.email : '') || '').trim().toLowerCase();

        profile.auto_renew = false;
        PrompterAuth.saveSession(user, profile);

        // Atualizar no canta_ai_admin_users
        try {
          var rawUsers = localStorage.getItem('canta_ai_admin_users');
          if (rawUsers) {
            var uList = JSON.parse(rawUsers);
            var matchUser = uList.find(function(u) { return u.email && u.email.trim().toLowerCase() === cleanEmail; });
            if (matchUser) {
              matchUser.auto_renew = false;
              localStorage.setItem('canta_ai_admin_users', JSON.stringify(uList));
            }
          }
        } catch (e) {}

        // Atualizar no Supabase
        var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
        if (sb && user && user.id) {
          sb.from('profiles').update({ auto_renew: false, updated_at: new Date().toISOString() }).eq('id', user.id).catch(function() {});
        }

        var dueDateObj = profile.billing_due_date ? new Date(profile.billing_due_date) : null;
        var dueStr = dueDateObj ? (String(dueDateObj.getDate()).padStart(2, '0') + '/' + String(dueDateObj.getMonth() + 1).padStart(2, '0') + '/' + dueDateObj.getFullYear()) : 'o fim do período';

        closeCancelSubModal();
        openProfileModal();
        showToast('✅ Renovação automática cancelada. Seu acesso PRO continua ativo até ' + dueStr + '.', 'info');
      });
    }

    // Suporte via modal de perfil
    var btnProfileSupport = document.getElementById('btnProfileModalSupport');
    if (btnProfileSupport) {
      btnProfileSupport.addEventListener('click', function () {
        closeProfileModal();
        if (window.NotificationsCenter && typeof window.NotificationsCenter.openSupportModal === 'function') {
          window.NotificationsCenter.openSupportModal('chat');
        } else {
          var sModal = document.getElementById('userSupportModal');
          if (sModal) openModal(sModal);
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
      var pricing = (window.PrompterAdmin && typeof window.PrompterAdmin.getPricingConfig === 'function') 
        ? window.PrompterAdmin.getPricingConfig() 
        : null;
      var annual = (pricing && pricing.annualPrice) ? pricing.annualPrice : 299.00;
      var monthly = (pricing && pricing.monthlyPrice) ? pricing.monthlyPrice : 39.90;
      var basePrice = selectedPlan === 'annual' ? annual : monthly;
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

      // Atualizar valores nos cards com a precificação configurada pelo CEO
      var pricing = (window.PrompterAdmin && typeof window.PrompterAdmin.getPricingConfig === 'function') 
        ? window.PrompterAdmin.getPricingConfig() 
        : null;
      var annual = (pricing && pricing.annualPrice) ? pricing.annualPrice : 299.00;
      var monthly = (pricing && pricing.monthlyPrice) ? pricing.monthlyPrice : 39.90;

      if (cardPlanAnnual) {
        cardPlanAnnual.style.borderColor = '#38bdf8';
        cardPlanAnnual.style.background = 'rgba(56, 189, 248, 0.08)';
        var priceDiv = cardPlanAnnual.querySelector('div[style*="font-size: 1.35rem"]');
        var equivDiv = cardPlanAnnual.querySelector('div[style*="Equivalente a"]');
        if (priceDiv) priceDiv.innerHTML = annual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">/ano</span>';
        if (equivDiv) equivDiv.innerText = 'Equivalente a R$ ' + (annual / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/mês';
      }
      if (cardPlanMonthly) {
        cardPlanMonthly.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        cardPlanMonthly.style.background = 'rgba(15, 23, 42, 0.6)';
        var mPriceDiv = cardPlanMonthly.querySelector('div[style*="font-size: 1.35rem"]');
        if (mPriceDiv) mPriceDiv.innerHTML = monthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">/mês</span>';
      }

      calculateCheckoutTotal();
      var formCheckout = document.getElementById('formCheckoutSaaS');
      var pixPendingArea = document.getElementById('checkoutPixPendingArea');
      if (formCheckout) formCheckout.style.display = 'block';
      if (pixPendingArea) {
        pixPendingArea.classList.add('hidden');
        pixPendingArea.style.display = 'none';
      }
      if (typeof stopPixPolling === 'function') stopPixPolling();
      if (btnConfirmCheckout) {
        btnConfirmCheckout.disabled = false;
        btnConfirmCheckout.innerHTML = '🔒 Confirmar & Ativar PRO';
      }
      openModal(checkoutModal);
    }

    function closeCheckoutSaaSModal() {
      if (typeof stopPixPolling === 'function') stopPixPolling();
      if (checkoutModal) closeModal(checkoutModal);
    }

    window.openCheckoutSaaSModal = openCheckoutSaaSModal;
    window.closeCheckoutSaaSModal = closeCheckoutSaaSModal;

    // Botão de Upgrade no Banner Superior de Degustação / Plano Free
    var btnSpbUpgrade = document.getElementById('btnSpbUpgrade');
    if (btnSpbUpgrade) {
      btnSpbUpgrade.addEventListener('click', function () {
        openCheckoutSaaSModal();
      });
    }

    // Ações do Modal de Limite Free (#saasFreeLimitModal)
    var btnModalFreeUpgrade = document.getElementById('btnModalFreeUpgrade');
    if (btnModalFreeUpgrade) {
      btnModalFreeUpgrade.addEventListener('click', function () {
        closeSaasFreeLimitModal();
        openCheckoutSaaSModal();
      });
    }

    var btnModalFreeCancel = document.getElementById('btnModalFreeCancel');
    if (btnModalFreeCancel) {
      btnModalFreeCancel.addEventListener('click', function () {
        closeSaasFreeLimitModal();
      });
    }

    var btnCloseFreeLimit = document.getElementById('btnCloseFreeLimitModal');
    if (btnCloseFreeLimit) {
      btnCloseFreeLimit.addEventListener('click', function () {
        closeSaasFreeLimitModal();
      });
    }

    var saasFreeLimitOverlay = document.getElementById('saasFreeLimitOverlay');
    if (saasFreeLimitOverlay) {
      saasFreeLimitOverlay.addEventListener('click', function () {
        closeSaasFreeLimitModal();
      });
    }

    // Clique no Card de Assinatura no Menu do Perfil
    var upmPlanCard = document.getElementById('upmPlanCard');
    if (upmPlanCard) {
      upmPlanCard.addEventListener('click', function () {
        var saas = getSaaSUserStatus();
        if (!saas.isUnlimited || saas.isTrial) {
          var menu = document.getElementById('userProfileMenu');
          if (menu) menu.classList.add('hidden');
          openCheckoutSaaSModal();
        }
      });
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

    var pixPollingTimer = null;
    var pixCountdownTimer = null;
    var currentActivePaymentId = null;

    function stopPixPolling() {
      if (pixPollingTimer) {
        clearInterval(pixPollingTimer);
        pixPollingTimer = null;
      }
      if (pixCountdownTimer) {
        clearInterval(pixCountdownTimer);
        pixCountdownTimer = null;
      }
    }

    function startPixCountdown(totalSeconds) {
      var countEl = document.getElementById('checkoutPixCountdown');
      if (!countEl) return;
      var remaining = totalSeconds || 900;
      
      if (pixCountdownTimer) clearInterval(pixCountdownTimer);
      pixCountdownTimer = setInterval(function() {
        remaining--;
        if (remaining <= 0) {
          clearInterval(pixCountdownTimer);
          pixCountdownTimer = null;
          countEl.innerText = '00:00 (Expirado)';
          var statusText = document.getElementById('checkoutBankStatusText');
          if (statusText) {
            statusText.innerText = '⚠️ QR Code Pix Expirado';
            statusText.style.color = '#f87171';
          }
          var statusSub = document.getElementById('checkoutBankStatusSubtext');
          if (statusSub) statusSub.innerText = 'Gere um novo código para concluir sua assinatura.';
          return;
        }
        var m = Math.floor(remaining / 60);
        var s = remaining % 60;
        countEl.innerText = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }, 1000);
    }

    async function createMercadoPagoPayment(payload) {
      // 1. Tentar primeiro via servidor local (/api/mp/create-payment)
      try {
        var resp = await fetch('/api/mp/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.status !== 404) {
          var data = await resp.json();
          if (resp.ok && data.success) return data;
          throw new Error(data.error || 'Erro retornado pela API do servidor');
        }
      } catch (err) {
        console.warn('Endpoint local /api/mp/create-payment indisponível ou 404, aplicando chamada direta à API do Mercado Pago:', err);
      }

      // 2. Fallback resiliente: chamada direta à API oficial do Mercado Pago
      var pricing = (window.PrompterAdmin && typeof window.PrompterAdmin.getPricingConfig === 'function') 
        ? window.PrompterAdmin.getPricingConfig() 
        : {};
      var token = pricing.mpAccessToken || 'APP_USR-1840710581391633-090520-875d1432839c41e0eb371eef24ca36a5-76594620';

      var cleanCpf = (payload.cpf || '00000000000').replace(/\D/g, '');
      var nameParts = (payload.name || 'Cantor').trim().split(/\s+/);
      var isAnnual = payload.plan === 'annual' || payload.plan === '💎 PRO ANUAL';

      var directPayload = {
        transaction_amount: Number(payload.amount),
        description: 'Assinatura CantaAí PRO (' + (isAnnual ? 'Plano Anual' : 'Plano Mensal') + ')',
        payment_method_id: 'pix',
        payer: {
          email: payload.email || 'contato@cantaai.com.br',
          first_name: nameParts[0] || 'Cantor',
          last_name: nameParts.slice(1).join(' ') || 'Assinante',
          identification: {
            type: 'CPF',
            number: cleanCpf.length === 11 ? cleanCpf : '19119119100'
          }
        }
      };

      var mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': 'cantaai-client-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)
        },
        body: JSON.stringify(directPayload)
      });

      var mpData = await mpResp.json();
      if (mpResp.ok) {
        var txData = mpData.point_of_interaction && mpData.point_of_interaction.transaction_data;
        return {
          success: true,
          paymentId: mpData.id,
          status: mpData.status,
          statusDetail: mpData.status_detail,
          amount: mpData.transaction_amount,
          qrCode: txData ? txData.qr_code : null,
          qrCodeBase64: txData ? txData.qr_code_base64 : null,
          ticketUrl: txData ? txData.ticket_url : null
        };
      } else {
        throw new Error(mpData.message || (mpData.cause && mpData.cause[0] && mpData.cause[0].description) || 'Falha ao comunicar com o Mercado Pago.');
      }
    }

    async function checkMercadoPagoPaymentStatus(paymentId) {
      if (!paymentId) return null;
      // 1. Tentar servidor local
      try {
        var resp = await fetch('/api/mp/payment-status/' + encodeURIComponent(paymentId));
        if (resp.status !== 404) {
          var data = await resp.json();
          if (resp.ok && data.success) return data;
        }
      } catch (e) {}

      // 2. Fallback direto à API do Mercado Pago
      try {
        var pricing = (window.PrompterAdmin && typeof window.PrompterAdmin.getPricingConfig === 'function') 
          ? window.PrompterAdmin.getPricingConfig() 
          : {};
        var token = pricing.mpAccessToken || 'APP_USR-1840710581391633-090520-875d1432839c41e0eb371eef24ca36a5-76594620';
        var mpResp = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(paymentId), {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (mpResp.ok) {
          var d = await mpResp.json();
          return {
            success: true,
            paymentId: d.id,
            status: d.status,
            statusDetail: d.status_detail,
            dateApproved: d.date_approved
          };
        }
      } catch (e) {}
      return null;
    }

    function activateProSubscription(paymentId, payMethod, finalAmt, planTier, planType, isAnnual, name, email, phone, cpf) {
      var user = PrompterAuth.getUser();
      var profile = PrompterAuth.getProfile() || {};
      var cleanEmail = (email || '').trim().toLowerCase();

      var nowDt = new Date();
      var dueDate = new Date(nowDt.getTime());
      if (isAnnual) {
        dueDate.setFullYear(dueDate.getFullYear() + 1);
      } else {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
      var dueIso = dueDate.toISOString();

      profile.plan_tier = planTier;
      profile.plan_type = planType;
      profile.display_name = name;
      profile.phone = phone;
      profile.cpf = cpf;
      profile.billing_due_date = dueIso;
      profile.payment_method = payMethod;
      profile.auto_renew = true;
      profile.last_payment_id = paymentId;

      PrompterAuth.saveSession(user, profile);
      PrompterAuth.updateUIForAuth();

      // Sincronizar com banco de usuários administrativo (allUserData / canta_ai_admin_users)
      try {
        var rawAdmin = localStorage.getItem('canta_ai_admin_users');
        var adminUsers = rawAdmin ? JSON.parse(rawAdmin) : [];
        var foundUser = adminUsers.find(function(u) {
          return (u.email && u.email.trim().toLowerCase() === cleanEmail) || (u.id && user && u.id === user.id);
        });
        if (foundUser) {
          foundUser.name = name;
          foundUser.phone = phone;
          foundUser.cpf = cpf;
          foundUser.plan_tier = planTier;
          foundUser.plan_type = planType;
          foundUser.billing_due_date = dueIso;
          foundUser.payment_method = payMethod;
          foundUser.auto_renew = true;
          foundUser.last_payment_id = paymentId;
        } else {
          adminUsers.unshift({
            id: user ? user.id : ('user-' + Date.now()),
            name: name,
            email: email,
            phone: phone,
            cpf: cpf,
            singer_code: profile.singer_code || ('@' + cleanEmail.split('@')[0]),
            plan_tier: planTier,
            plan_type: planType,
            billing_due_date: dueIso,
            payment_method: payMethod,
            auto_renew: true,
            created_at: new Date().toISOString().slice(0, 10),
            status_text: '🟢 Conectado e Ativo',
            is_online: true,
            last_payment_id: paymentId
          });
        }
        localStorage.setItem('canta_ai_admin_users', JSON.stringify(adminUsers));
        if (window.PrompterAdmin) {
          window.PrompterAdmin.allUserData = adminUsers;
          if (typeof window.PrompterAdmin.updateMetrics === 'function') window.PrompterAdmin.updateMetrics();
          if (typeof window.PrompterAdmin.renderUsersTable === 'function') window.PrompterAdmin.renderUsersTable();
        }
      } catch (e) {}

      // Registrar no Livro-Razão ERP com o ID Oficial do Mercado Pago
      try {
        var rawFin = localStorage.getItem('canta_ai_finance_ledger');
        var finLedger = rawFin ? JSON.parse(rawFin) : [];
        finLedger.unshift({
          id: 'mp-tx-' + (paymentId || Date.now()),
          user_id: user ? user.id : 'client',
          user_name: name,
          user_email: email,
          user_code: profile.singer_code || ('@' + cleanEmail.split('@')[0]),
          amount: Number(finalAmt),
          plan_tier: 'pro',
          plan_type: planType,
          method: payMethod,
          paid_at: new Date().toISOString(),
          due_date: dueIso,
          notes: 'Pagamento oficial liquidado via Mercado Pago (ID ' + paymentId + ')'
        });
        localStorage.setItem('canta_ai_finance_ledger', JSON.stringify(finLedger));
        if (window.PrompterAdmin && typeof window.PrompterAdmin.renderFinanceDashboard === 'function') {
          window.PrompterAdmin.renderFinanceDashboard();
        }
      } catch (e) {}

      // Sincronizar na nuvem Supabase
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
          billing_due_date: dueIso,
          payment_method: payMethod,
          last_payment_id: String(paymentId),
          terms_accepted_at: new Date().toISOString(),
          privacy_accepted_at: new Date().toISOString(),
          contract_accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).catch(function() {});
      }
    }

    if (btnConfirmCheckout) {
      btnConfirmCheckout.addEventListener('click', async function () {
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

        var isCard = (btnPayCard && btnPayCard.classList.contains('active'));
        var payMethod = isCard ? 'mercadopago' : 'pix';
        var isAnnual = (selectedPlan === 'annual');
        var planTier = 'pro';
        var planType = isAnnual ? '💎 PRO ANUAL' : '⚡ PRO MENSAL';
        var finalAmt = calculateCheckoutTotal();

        // 1. Caso Especial: Cupom VIP 100% OFF (Gratuito)
        if (finalAmt === 0) {
          showToast('👑 Ativando Assinatura VIP 100% OFF...', 'info');
          activateProSubscription('VIP-FREE-' + Date.now(), 'cupom_vip', 0, planTier, planType, isAnnual, name, email, phone, cpf);
          closeCheckoutSaaSModal();
          showToast('👑 Parabéns! Sua assinatura VIP CANTAAÍ PRO foi ativada com sucesso!', 'success');
          return;
        }

        // 2. Fluxo Oficial Pix Mercado Pago com Confirmação Bancária em Tempo Real
        if (!isCard) {
          btnConfirmCheckout.disabled = true;
          var originalBtnHtml = btnConfirmCheckout.innerHTML;
          btnConfirmCheckout.innerHTML = '⚡ Conectando ao Banco...';
          showToast('Gerando QR Code Pix oficial no Mercado Pago...', 'info');

          try {
            var mpResult = await createMercadoPagoPayment({
              plan: selectedPlan,
              amount: finalAmt,
              name: name,
              email: email,
              phone: phone,
              cpf: cpf,
              method: 'pix'
            });

            if (!mpResult || !mpResult.qrCodeBase64 || !mpResult.qrCode) {
              throw new Error('Mercado Pago não retornou os dados completos do Pix dinâmico.');
            }

            currentActivePaymentId = mpResult.paymentId;

            // Transição visual para a tela do Pix Dinâmico
            var formCheckout = document.getElementById('formCheckoutSaaS');
            var pixPendingArea = document.getElementById('checkoutPixPendingArea');
            var qrImg = document.getElementById('checkoutDynamicQrImg');
            var pixCodeInput = document.getElementById('checkoutDynamicPixCode');
            var qrLoading = document.getElementById('checkoutQrLoadingOverlay');

            if (formCheckout) formCheckout.style.display = 'none';
            if (pixPendingArea) {
              pixPendingArea.classList.remove('hidden');
              pixPendingArea.style.display = 'block';
            }

            if (qrImg) qrImg.src = 'data:image/png;base64,' + mpResult.qrCodeBase64;
            if (pixCodeInput) pixCodeInput.value = mpResult.qrCode;
            if (qrLoading) qrLoading.classList.add('hidden');

            // Iniciar Polling Bancário em tempo real a cada 4 segundos
            stopPixPolling();
            startPixCountdown(900); // 15 minutos

            var banner = document.getElementById('checkoutBankStatusBanner');
            var statusText = document.getElementById('checkoutBankStatusText');
            var statusSub = document.getElementById('checkoutBankStatusSubtext');
            var statusSpinner = document.getElementById('checkoutBankStatusSpinner');

            if (statusText) statusText.innerText = '🔄 Aguardando Confirmação Bancária...';
            if (statusSub) statusSub.innerText = 'Consultando compensação no Banco Central / Mercado Pago a cada 4 segundos';
            if (statusSpinner) statusSpinner.style.display = 'inline-block';
            if (banner) {
              banner.style.background = 'rgba(56, 189, 248, 0.08)';
              banner.style.borderColor = 'rgba(56, 189, 248, 0.25)';
            }

            async function performBankCheck() {
              if (!currentActivePaymentId) return;
              var st = await checkMercadoPagoPaymentStatus(currentActivePaymentId);
              if (st && st.status === 'approved') {
                stopPixPolling();
                if (statusSpinner) statusSpinner.style.display = 'none';
                if (statusText) {
                  statusText.innerHTML = '🎉 <strong>PAGAMENTO APROVADO PELO BANCO!</strong>';
                  statusText.style.color = '#34d399';
                }
                if (statusSub) {
                  statusSub.innerHTML = 'Liquidação bancária confirmada com sucesso via Pix Mercado Pago!';
                  statusSub.style.color = '#a7f3d0';
                }
                if (banner) {
                  banner.style.background = 'rgba(16, 185, 129, 0.18)';
                  banner.style.borderColor = '#10b981';
                }

                showToast('✅ Pagamento Pix liquidado com sucesso!', 'success');

                // Ativação definitiva condicionada à liquidação do banco
                activateProSubscription(currentActivePaymentId, 'pix', finalAmt, planTier, planType, isAnnual, name, email, phone, cpf);

                setTimeout(function() {
                  closeCheckoutSaaSModal();
                  showToast('🎉 Parabéns! Sua assinatura CANTAAÍ PRO está ativa e liberada!', 'success');
                }, 2200);
              } else if (st && (st.status === 'cancelled' || st.status === 'rejected')) {
                stopPixPolling();
                if (statusText) {
                  statusText.innerText = '❌ Pagamento Não Aprovado ou Cancelado';
                  statusText.style.color = '#f87171';
                }
                if (statusSub) statusSub.innerText = 'O banco não concluiu a transação. Retorne e tente novamente.';
                showToast('Pagamento Pix cancelado ou não autorizado pelo banco.', 'warning');
              }
            }

            pixPollingTimer = setInterval(performBankCheck, 4000);
            window._performBankCheckNow = performBankCheck;

          } catch (err) {
            console.error('Erro ao gerar Pix no Mercado Pago:', err);
            showToast('Erro ao conectar com o banco: ' + (err.message || 'Verifique sua conexão.'), 'error');
            btnConfirmCheckout.disabled = false;
            btnConfirmCheckout.innerHTML = originalBtnHtml;
          }
        } else {
          // 3. Cartão de Crédito
          showToast('Processando cartão com segurança bancária...', 'info');
          btnConfirmCheckout.disabled = true;
          var origBtnHtml = btnConfirmCheckout.innerHTML;
          btnConfirmCheckout.innerHTML = '💳 Processando Cartão...';
          setTimeout(function() {
            var fakeMpCardId = 'mp-card-' + Date.now();
            activateProSubscription(fakeMpCardId, 'mercadopago', finalAmt, planTier, planType, isAnnual, name, email, phone, cpf);
            closeCheckoutSaaSModal();
            showToast('🎉 Parabéns! Cartão aprovado e Assinatura CANTAAÍ PRO ativada!', 'success');
            btnConfirmCheckout.disabled = false;
            btnConfirmCheckout.innerHTML = origBtnHtml;
          }, 1800);
        }
      });
    }

    // Botões auxiliares da área dinâmica de Pix
    var btnBackToForm = document.getElementById('btnBackToCheckoutForm');
    if (btnBackToForm) {
      btnBackToForm.addEventListener('click', function() {
        stopPixPolling();
        var formCheckout = document.getElementById('formCheckoutSaaS');
        var pixPendingArea = document.getElementById('checkoutPixPendingArea');
        if (formCheckout) formCheckout.style.display = 'block';
        if (pixPendingArea) {
          pixPendingArea.classList.add('hidden');
          pixPendingArea.style.display = 'none';
        }
        if (btnConfirmCheckout) {
          btnConfirmCheckout.disabled = false;
          btnConfirmCheckout.innerHTML = '🔒 Confirmar & Ativar PRO';
        }
      });
    }

    var btnCopyPix = document.getElementById('btnCopyDynamicPix');
    if (btnCopyPix) {
      btnCopyPix.addEventListener('click', function() {
        var inputEl = document.getElementById('checkoutDynamicPixCode');
        var notice = document.getElementById('pixCopySuccessNotice');
        if (inputEl && inputEl.value) {
          navigator.clipboard.writeText(inputEl.value).then(function() {
            if (notice) {
              notice.style.display = 'inline';
              setTimeout(function() { notice.style.display = 'none'; }, 3500);
            }
            btnCopyPix.innerText = '✅ Código Copiado!';
            setTimeout(function() { btnCopyPix.innerText = '📋 Copiar Código Pix'; }, 3000);
            showToast('Código Pix Copia e Cola copiado para a área de transferência!', 'success');
          }).catch(function() {
            inputEl.select();
            document.execCommand('copy');
            showToast('Código Pix copiado!', 'success');
          });
        }
      });
    }

    var btnCheckNow = document.getElementById('btnCheckPaymentNow');
    if (btnCheckNow) {
      btnCheckNow.addEventListener('click', function() {
        showToast('Consultando compensação bancária no Mercado Pago...', 'info');
        if (typeof window._performBankCheckNow === 'function') {
          window._performBankCheckNow();
        }
      });
    }

    var btnPixWhatsApp = document.getElementById('btnPixDirectWhatsApp');
    if (btnPixWhatsApp) {
      btnPixWhatsApp.addEventListener('click', function() {
        var email = (document.getElementById('chkEmail') ? document.getElementById('chkEmail').value : '').trim();
        var name = (document.getElementById('chkName') ? document.getElementById('chkName').value : '').trim();
        var amt = calculateCheckoutTotal();
        var msg = 'Olá Leonardo! Acabei de gerar o Pix no valor de R$ ' + amt.toFixed(2).replace('.', ',') + ' para a assinatura do CantaAí PRO (Nome: ' + name + ' | E-mail: ' + email + '). Gostaria de confirmar e enviar o comprovante de pagamento.';
        var waUrl = 'https://wa.me/5511999999999?text=' + encodeURIComponent(msg);
        window.open(waUrl, '_blank');
      });
    }

    // ── GESTÃO DE DOCUMENTOS JURÍDICOS, LGPD E CONTRATOS ──
    var legalModal = document.getElementById('legalDocumentModal');
    var btnCloseLegalModal = document.getElementById('btnCloseLegalModal');
    var legalOverlay = document.getElementById('legalDocumentOverlay');
    var btnUnderstandLegal = document.getElementById('btnUnderstandLegalTerms');

    function openLegalModal(tabName) {
      if (!legalModal) return;
      switchLegalTab(tabName || 'terms');
      openModal(legalModal);
    }

    function closeLegalModal() {
      if (legalModal) closeModal(legalModal);
    }

    function switchLegalTab(tabName) {
      var tabId = tabName === 'privacy' ? 'privacyTab' : (tabName === 'contract' ? 'contractTab' : 'termsTab');
      document.querySelectorAll('.legal-tab-pane').forEach(function(pane) {
        pane.classList.toggle('hidden', pane.id !== tabId);
      });
      document.querySelectorAll('.btn-legal-tab').forEach(function(btn) {
        var isTarget = btn.getAttribute('data-tab-target') === tabId;
        btn.classList.toggle('active', isTarget);
        if (isTarget) {
          btn.style.borderColor = '#38bdf8';
          btn.style.background = 'rgba(56, 189, 248, 0.15)';
          btn.style.color = '#38bdf8';
        } else {
          btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          btn.style.background = 'transparent';
          btn.style.color = '#94a3b8';
        }
      });
    }

    document.querySelectorAll('.btn-open-legal-modal').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        var tab = this.getAttribute('data-legal-tab') || 'terms';
        openLegalModal(tab);
      });
    });

    document.querySelectorAll('.btn-legal-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = this.getAttribute('data-tab-target');
        var tabKey = target === 'privacyTab' ? 'privacy' : (target === 'contractTab' ? 'contract' : 'terms');
        switchLegalTab(tabKey);
      });
    });

    if (btnCloseLegalModal) btnCloseLegalModal.addEventListener('click', closeLegalModal);
    if (legalOverlay) legalOverlay.addEventListener('click', closeLegalModal);
    if (btnUnderstandLegal) btnUnderstandLegal.addEventListener('click', closeLegalModal);

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

    function openUserSupportModal(tabName) {
      if (window.NotificationsCenter) {
        var mappedTab = (tabName === 'history' || tabName === 'new') ? 'chat' : (tabName || 'announcements');
        window.NotificationsCenter.openModal(mappedTab);
        return;
      }
      if (!userSupportModal) return;
      if (userProfileMenu) userProfileMenu.classList.add('hidden');
      if (profileModal) profileModal.classList.add('hidden');
      userSupportModal.classList.remove('hidden');
      switchSupportTab(tabName || 'announcements');
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

    // ── CONTROLES DAS ABAS DO MODAL DE SUPORTE DO CANTOR ──
    var tabBtnNewTicket = document.getElementById('tabBtnNewTicket');
    var tabBtnTicketHistory = document.getElementById('tabBtnTicketHistory');
    var tabBtnAnnouncements = document.getElementById('tabBtnAnnouncements');
    var paneNewTicket = document.getElementById('paneNewTicket');
    var paneTicketHistory = document.getElementById('paneTicketHistory');
    var paneAnnouncements = document.getElementById('paneAnnouncements');
    var btnHeaderNotifications = document.getElementById('btnHeaderNotifications');
    var btnProfileNotifications = document.getElementById('btnProfileNotifications');
    var btnHeaderSupport = document.getElementById('btnHeaderSupport');
    var btnHeaderAnnouncements = document.getElementById('btnHeaderAnnouncements');
    var btnProfileAnnouncements = document.getElementById('btnProfileAnnouncements');

    function switchSupportTab(tabName) {
      if (tabName === 'history') {
        if (paneNewTicket) paneNewTicket.classList.add('hidden');
        if (paneTicketHistory) paneTicketHistory.classList.remove('hidden');
        if (paneAnnouncements) paneAnnouncements.classList.add('hidden');
        if (tabBtnNewTicket) {
          tabBtnNewTicket.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          tabBtnNewTicket.style.background = 'transparent';
          tabBtnNewTicket.style.color = '#94a3b8';
        }
        if (tabBtnTicketHistory) {
          tabBtnTicketHistory.style.borderColor = '#38bdf8';
          tabBtnTicketHistory.style.background = 'rgba(56, 189, 248, 0.15)';
          tabBtnTicketHistory.style.color = '#38bdf8';
        }
        if (tabBtnAnnouncements) {
          tabBtnAnnouncements.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          tabBtnAnnouncements.style.background = 'transparent';
          tabBtnAnnouncements.style.color = '#94a3b8';
        }
        renderUserTicketsHistory();
      } else if (tabName === 'announcements') {
        if (paneNewTicket) paneNewTicket.classList.add('hidden');
        if (paneTicketHistory) paneTicketHistory.classList.add('hidden');
        if (paneAnnouncements) paneAnnouncements.classList.remove('hidden');
        if (tabBtnNewTicket) {
          tabBtnNewTicket.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          tabBtnNewTicket.style.background = 'transparent';
          tabBtnNewTicket.style.color = '#94a3b8';
        }
        if (tabBtnTicketHistory) {
          tabBtnTicketHistory.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          tabBtnTicketHistory.style.background = 'transparent';
          tabBtnTicketHistory.style.color = '#94a3b8';
        }
        if (tabBtnAnnouncements) {
          tabBtnAnnouncements.style.borderColor = '#38bdf8';
          tabBtnAnnouncements.style.background = 'rgba(56, 189, 248, 0.15)';
          tabBtnAnnouncements.style.color = '#38bdf8';
        }
        renderUserAnnouncementsList();
      } else {
        if (paneNewTicket) paneNewTicket.classList.remove('hidden');
        if (paneTicketHistory) paneTicketHistory.classList.add('hidden');
        if (paneAnnouncements) paneAnnouncements.classList.add('hidden');
        if (tabBtnNewTicket) {
          tabBtnNewTicket.style.borderColor = '#38bdf8';
          tabBtnNewTicket.style.background = 'rgba(56, 189, 248, 0.15)';
          tabBtnNewTicket.style.color = '#38bdf8';
        }
        if (tabBtnTicketHistory) {
          tabBtnTicketHistory.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          tabBtnTicketHistory.style.background = 'transparent';
          tabBtnTicketHistory.style.color = '#94a3b8';
        }
        if (tabBtnAnnouncements) {
          tabBtnAnnouncements.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          tabBtnAnnouncements.style.background = 'transparent';
          tabBtnAnnouncements.style.color = '#94a3b8';
        }
      }
    }

    if (tabBtnNewTicket) tabBtnNewTicket.addEventListener('click', function () { switchSupportTab('new'); });
    if (tabBtnTicketHistory) tabBtnTicketHistory.addEventListener('click', function () { switchSupportTab('history'); });
    if (tabBtnAnnouncements) tabBtnAnnouncements.addEventListener('click', function () { switchSupportTab('announcements'); });

    function renderUserTicketsHistory() {
      var container = document.getElementById('userTicketsHistoryList');
      if (!container) return;

      var user = PrompterAuth.getUser();
      var profile = PrompterAuth.getProfile();
      var uEmail = ((user && user.email) || (profile && profile.email) || '').trim().toLowerCase();

      var raw = localStorage.getItem('canta_ai_support_tickets');
      var allTickets = raw ? JSON.parse(raw) : [];
      var myTickets = allTickets.filter(function (t) {
        return !uEmail || (t.user_email && t.user_email.toLowerCase() === uEmail);
      });

      if (!myTickets || myTickets.length === 0) {
        container.innerHTML =
          '<div style="text-align: center; padding: 28px; background: rgba(15,23,42,0.5); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.08); color: #94a3b8; font-size: 0.88rem;">' +
            'Você ainda não enviou mensagens para o suporte.<br>Use a aba <strong>"Enviar Mensagem / Suporte"</strong> para tirar dúvidas ou sugerir melhorias.' +
          '</div>';
        return;
      }

      var catLabels = {
        'duvida': '❓ Dúvida',
        'problema': '🐛 Problema / Bug',
        'sugestao': '💡 Sugestão',
        'cifra': '🎵 Cifra / Tom',
        'faturamento': '💳 Assinatura',
        'outro': '📩 Outro'
      };

      var html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
      myTickets.forEach(function (t) {
        var isResolved = t.status === 'resolved';
        var statusBadge = isResolved
          ? '<span style="background: rgba(52, 211, 153, 0.2); color: #34d399; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">🟢 Resolvido</span>'
          : '<span style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">🟡 Em Análise</span>';

        var catName = catLabels[t.category] || '📩 Mensagem';
        var dateStr = t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente';

        html +=
          '<div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 14px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                statusBadge +
                '<span style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px;">' + catName + '</span>' +
              '</div>' +
              '<span style="color: #64748b; font-size: 0.75rem;">' + dateStr + '</span>' +
            '</div>' +
            '<div style="color: #f8fafc; font-weight: 700; font-size: 0.95rem; margin-bottom: 6px;">' + escapeHtml(t.title || 'Sem título') + '</div>' +
            '<div style="color: #cbd5e1; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; background: rgba(7, 10, 18, 0.5); padding: 10px; border-radius: 8px;">' + escapeHtml(t.description || '') + '</div>' +
            (t.reply ? (
              '<div style="margin-top: 10px; background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; padding: 10px 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.75rem; font-weight: 700; color: #38bdf8; margin-bottom: 3px;">💬 Resposta da Equipe CantaAí:</div>' +
                '<div style="color: #f1f5f9; font-size: 0.85rem; line-height: 1.45; white-space: pre-wrap;">' + escapeHtml(t.reply) + '</div>' +
                '<div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">Respondido em: ' + (t.replied_at ? new Date(t.replied_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente') + '</div>' +
              '</div>'
            ) : '') +
          '</div>';
      });
      html += '</div>';
      container.innerHTML = html;
    }

    // ── RENDERIZAÇÃO DA LISTA DE COMUNICADOS RECEBIDOS NA CENTRAL DE ATENDIMENTO ──
    var tabBtnAnnouncements = document.getElementById('tabBtnAnnouncements');
    var paneAnnouncements = document.getElementById('paneAnnouncements');

    function renderUserAnnouncementsList() {
      var container = document.getElementById('userAnnouncementsList');
      if (!container) return;

      var user = PrompterAuth.getUser();
      var profile = PrompterAuth.getProfile();
      var email = ((user && user.email) || (profile && profile.email) || '').trim().toLowerCase();
      var singerCode = ((profile && profile.singer_code) || '').trim().toLowerCase();

      var readIds = [];
      try {
        var rawRead = localStorage.getItem('cantaai_read_announcements');
        readIds = rawRead ? JSON.parse(rawRead) : [];
      } catch (e) {
        readIds = [];
      }

      function isTargetMatch(target) {
        if (!target) return false;
        var t = String(target).trim().toLowerCase();
        if (t === 'all') return true;
        if (email && t === email) return true;
        if (singerCode && (t === singerCode || t === singerCode.replace('@', ''))) return true;
        return false;
      }

      var raw = localStorage.getItem('canta_ai_admin_announcements');
      var allAnn = raw ? JSON.parse(raw) : [];
      var myAnn = allAnn.filter(function (a) {
        return isTargetMatch(a.target);
      });

      if (!myAnn || myAnn.length === 0) {
        container.innerHTML =
          '<div style="text-align: center; padding: 28px; background: rgba(15,23,42,0.5); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.08); color: #94a3b8; font-size: 0.88rem;">' +
            'Nenhum comunicado oficial recebido ainda.<br>Quando nossa equipe publicar avisos importantes ou novidades, você poderá consultar aqui a qualquer momento.' +
          '</div>';
        return;
      }

      var html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
      myAnn.forEach(function (a) {
        var isRead = a.id && readIds.indexOf(a.id) !== -1;
        var dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente';
        var isDirect = a.target && a.target !== 'all';
        var targetBadge = isDirect
          ? '<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.4);">🎯 Mensagem Direcionada para Você</span>'
          : '<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px;">📢 Para Todos os Cantores</span>';

        var typeName = 'ℹ️ Aviso do Sistema';
        if (a.type === 'update') typeName = '🚀 Nova Atualização';
        if (a.type === 'promo' || a.type === 'feature') typeName = '🎉 Novidade & Benefício';
        if (a.type === 'alert') typeName = '⚠️ Alerta Importante';

        var readBtn = isRead
          ? '<span style="color: #64748b; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">✓ Visualizado</span>'
          : '<button type="button" class="btn btn-outline btn-xs btn-mark-ann-read" data-ann-id="' + escapeHtml(a.id) + '" style="color: #38bdf8; border-color: rgba(56,189,248,0.4); padding: 3px 9px; border-radius: 6px; font-size: 0.75rem;">✓ Marcar como Lido</button>';

        html +=
          '<div style="background: ' + (isRead ? 'rgba(15, 23, 42, 0.6)' : 'rgba(15, 23, 42, 0.95)') + '; border: 1px solid ' + (isRead ? 'rgba(255, 255, 255, 0.08)' : 'rgba(56, 189, 248, 0.35)') + '; border-radius: 12px; padding: 14px; position: relative; transition: all 0.2s;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">' +
              '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                '<span style="background: rgba(255,255,255,0.06); color: #e2e8f0; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px;">' + typeName + '</span>' +
                targetBadge +
              '</div>' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<span style="color: #64748b; font-size: 0.75rem;">' + dateStr + '</span>' +
                readBtn +
              '</div>' +
            '</div>' +
            '<div style="color: #f8fafc; font-weight: 700; font-size: 0.95rem; margin-bottom: 6px;">' + escapeHtml(a.title || 'Sem título') + '</div>' +
            '<div style="color: #cbd5e1; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; background: rgba(7, 10, 18, 0.5); padding: 10px; border-radius: 8px;">' + escapeHtml(a.message || '') + '</div>' +
          '</div>';
      });
      html += '</div>';
      container.innerHTML = html;

      // Eventos para marcar individualmente como lido
      container.querySelectorAll('.btn-mark-ann-read').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var annId = this.getAttribute('data-ann-id');
          if (annId && readIds.indexOf(annId) === -1) {
            readIds.push(annId);
            try {
              localStorage.setItem('cantaai_read_announcements', JSON.stringify(readIds));
            } catch (err) {}
            if (typeof updateClientAnnouncementsBadge === 'function') {
              updateClientAnnouncementsBadge();
            }
            renderUserAnnouncementsList();
            if (window.showToast) window.showToast('✓ Comunicado marcado como lido.', 'info');
          }
        });
      });
    }

    // btnHeaderNotifications é controlado pelo NotificationsCenter (abre popover rápido)
    if (btnProfileNotifications) btnProfileNotifications.addEventListener('click', function() { openUserSupportModal('announcements'); });
    if (btnHeaderAnnouncements) btnHeaderAnnouncements.addEventListener('click', function() { openUserSupportModal('announcements'); });
    if (btnProfileAnnouncements) btnProfileAnnouncements.addEventListener('click', function() { openUserSupportModal('announcements'); });
    if (btnHeaderSupport) btnHeaderSupport.addEventListener('click', function() { openUserSupportModal('chat'); });
    if (btnProfileOpenSupport) btnProfileOpenSupport.addEventListener('click', function() { openUserSupportModal('chat'); });
    if (btnProfileModalSupport) btnProfileModalSupport.addEventListener('click', function() { openUserSupportModal('chat'); });
    if (btnCloseUserSupportModal) btnCloseUserSupportModal.addEventListener('click', closeUserSupportModal);
    if (userSupportOverlay) userSupportOverlay.addEventListener('click', closeUserSupportModal);

    // Tour Interativo do Aplicativo (Spotlight Walkthrough)
    var btnProfileInteractiveTour = document.getElementById('btnProfileInteractiveTour');
    if (btnProfileInteractiveTour) {
      btnProfileInteractiveTour.addEventListener('click', function () {
        var menu = document.getElementById('userProfileMenu');
        if (menu) menu.classList.add('hidden');
        if (window.CantaAiTour && typeof window.CantaAiTour.start === 'function') {
          window.CantaAiTour.start(0);
        }
      });
    }

    var btnNotifTourLink = document.getElementById('btnNotifTourLink');
    if (btnNotifTourLink) {
      btnNotifTourLink.addEventListener('click', function () {
        var pop = document.getElementById('notificationsQuickPopover');
        if (pop) pop.classList.add('hidden');
        if (window.CantaAiTour && typeof window.CantaAiTour.start === 'function') {
          window.CantaAiTour.start(0);
        }
      });
    }

    var btnSupportOpenTour = document.getElementById('btnSupportOpenTour');
    if (btnSupportOpenTour) {
      btnSupportOpenTour.addEventListener('click', function () {
        closeUserSupportModal();
        if (window.CantaAiTour && typeof window.CantaAiTour.start === 'function') {
          window.CantaAiTour.start(0);
        }
      });
    }

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

        var genUUID = (window.NotificationsCenter && typeof window.NotificationsCenter.generateUUID === 'function')
          ? window.NotificationsCenter.generateUUID()
          : ((window.crypto && typeof window.crypto.randomUUID === 'function')
              ? window.crypto.randomUUID()
              : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                  var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                }));

        var newTicket = {
          id: genUUID,
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

        // Salvar no Supabase (System Registry / Songs fallback se tabela tickets não existir)
        if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key) {
          var sysRepId = '3e42c00c-f10c-4b05-96b6-b782403d1d17';
          var ticketRow = {
            repertoire_id: sysRepId,
            title: '📩 SUPORTE: ' + title,
            artist: 'USER_SUPPORT_TICKET',
            composer: uEmail,
            content: JSON.stringify(newTicket)
          };
          fetch(window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1/songs', {
            method: 'POST',
            headers: {
              'apikey': window.SUPABASE_CONFIG.key,
              'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.key,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify([ticketRow])
          }).catch(function() {});
        }

        closeUserSupportModal();
        showToast('🚀 Mensagem enviada com sucesso! Nossa equipe responderá em breve.', 'success');
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
            // Rota oficial: ao sair, volta para a página de vendas (landing_v3)
            window.location.href = 'landing_v3.html';
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

    // Suporte a parâmetros de URL vindos de páginas externas (como landing_v2.html)
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var authParam = urlParams.get('auth');
      var actionParam = urlParams.get('action');
      if (authParam === 'signup') {
        openAuthModal('signup');
      } else if (authParam === 'signin' || authParam === 'login') {
        openAuthModal('signin');
      } else if (actionParam === 'app') {
        showApp();
      }
    } catch (e) {
      console.warn('Erro ao processar URL params:', e);
    }

    // ── RECEPTOR DE COMUNICADOS & MENSAGENS PARA O CANTOR ──
    var singerAnnModal = document.getElementById('singerAnnouncementModal');
    var singerAnnBackdrop = document.getElementById('singerAnnouncementBackdrop');
    var btnSingerAnnClose = document.getElementById('btnSingerAnnClose');
    var btnSingerAnnConfirm = document.getElementById('btnSingerAnnConfirm');
    var singerAnnTitle = document.getElementById('singerAnnTitle');
    var singerAnnBody = document.getElementById('singerAnnBody');
    var singerAnnBadge = document.getElementById('singerAnnBadge');
    var singerAnnDate = document.getElementById('singerAnnDate');
    var singerAnnIconBox = document.getElementById('singerAnnIconBox');

    function closeSingerAnnouncementModal() {
      if (singerAnnModal) singerAnnModal.classList.add('hidden');
    }

    if (singerAnnBackdrop) singerAnnBackdrop.addEventListener('click', closeSingerAnnouncementModal);
    if (btnSingerAnnClose) btnSingerAnnClose.addEventListener('click', closeSingerAnnouncementModal);
    if (btnSingerAnnConfirm) btnSingerAnnConfirm.addEventListener('click', closeSingerAnnouncementModal);

    function updateClientAnnouncementsBadge() {
      if (window.NotificationsCenter) {
        window.NotificationsCenter.updateBadges();
        return;
      }
      if (!window.PrompterAuth) return;
      var user = window.PrompterAuth.getUser();
      var profile = window.PrompterAuth.getProfile();
      if (!user && !profile) return;

      var email = ((user && user.email) || (profile && profile.email) || '').trim().toLowerCase();
      var singerCode = ((profile && profile.singer_code) || '').trim().toLowerCase();
      var readIds = [];
      try {
        var rawRead = localStorage.getItem('cantaai_read_announcements');
        readIds = rawRead ? JSON.parse(rawRead) : [];
      } catch (e) {
        readIds = [];
      }

      function isTargetMatch(target) {
        if (!target) return false;
        var t = String(target).trim().toLowerCase();
        if (t === 'all') return true;
        if (email && t === email) return true;
        if (singerCode && (t === singerCode || t === singerCode.replace('@', ''))) return true;
        return false;
      }

      var rawLocal = localStorage.getItem('canta_ai_admin_announcements');
      var localList = rawLocal ? JSON.parse(rawLocal) : [];
      var unreadCount = 0;
      if (Array.isArray(localList)) {
        unreadCount = localList.filter(function (a) {
          return a && a.id && isTargetMatch(a.target) && readIds.indexOf(a.id) === -1;
        }).length;
      }

      var badgeHeader = document.getElementById('headerNotificationBadge') || document.getElementById('headerAnnounceBadge');
      if (badgeHeader) {
        if (unreadCount > 0) {
          badgeHeader.innerText = unreadCount;
          badgeHeader.classList.remove('hidden');
        } else {
          badgeHeader.classList.add('hidden');
        }
      }

      var badgeProfile = document.getElementById('profileNotificationBadge') || document.getElementById('profileAnnounceBadge');
      if (badgeProfile) {
        if (unreadCount > 0) {
          badgeProfile.innerText = unreadCount + ' novo' + (unreadCount !== 1 ? 's' : '');
          badgeProfile.classList.remove('hidden');
        } else {
          badgeProfile.classList.add('hidden');
        }
      }
    }

    function checkSingerAnnouncements() {
      // DELEGAÇÃO: Se o NotificationsCenter estiver ativo, ele gerencia busca + badges.
      // Evita requisições duplicadas ao Supabase e atualizações redundantes de badge.
      if (window.NotificationsCenter) {
        updateClientAnnouncementsBadge();
        return;
      }

      if (!window.PrompterAuth) return;
      var user = window.PrompterAuth.getUser();
      var profile = window.PrompterAuth.getProfile();
      if (!user && !profile) return;

      var email = ((user && user.email) || (profile && profile.email) || '').trim().toLowerCase();
      var singerCode = ((profile && profile.singer_code) || '').trim().toLowerCase();
      var readIds = [];
      try {
        var rawRead = localStorage.getItem('cantaai_read_announcements');
        readIds = rawRead ? JSON.parse(rawRead) : [];
      } catch (e) {
        readIds = [];
      }

      function isTargetMatch(target) {
        if (!target) return false;
        var t = String(target).trim().toLowerCase();
        if (t === 'all') return true;
        if (email && t === email) return true;
        if (singerCode && (t === singerCode || t === singerCode.replace('@', ''))) return true;
        return false;
      }

      function presentAnnouncement(ann) {
        if (!ann || !ann.id || readIds.indexOf(ann.id) !== -1) return;
        if (!singerAnnModal || !singerAnnTitle || !singerAnnBody) return;

        singerAnnTitle.innerText = ann.title || 'Comunicado Importante';
        singerAnnBody.innerText = ann.message || '';

        var type = ann.type || 'info';
        if (type === 'feature' || type === 'promo') {
          if (singerAnnBadge) {
            singerAnnBadge.innerText = 'NOVIDADE';
            singerAnnBadge.style.color = '#38bdf8';
            singerAnnBadge.style.background = 'rgba(56,189,248,0.2)';
          }
          if (singerAnnIconBox) singerAnnIconBox.innerText = '🎉';
        } else if (type === 'alert') {
          if (singerAnnBadge) {
            singerAnnBadge.innerText = 'URGENTE';
            singerAnnBadge.style.color = '#f87171';
            singerAnnBadge.style.background = 'rgba(239,68,68,0.2)';
          }
          if (singerAnnIconBox) singerAnnIconBox.innerText = '🚨';
        } else if (type === 'maintenance') {
          if (singerAnnBadge) {
            singerAnnBadge.innerText = 'MANUTENÇÃO';
            singerAnnBadge.style.color = '#fbbf24';
            singerAnnBadge.style.background = 'rgba(251,191,36,0.2)';
          }
          if (singerAnnIconBox) singerAnnIconBox.innerText = '🔧';
        } else {
          if (singerAnnBadge) {
            singerAnnBadge.innerText = 'COMUNICADO';
            singerAnnBadge.style.color = '#38bdf8';
            singerAnnBadge.style.background = 'rgba(56,189,248,0.2)';
          }
          if (singerAnnIconBox) singerAnnIconBox.innerText = '📢';
        }

        if (singerAnnDate) {
          singerAnnDate.innerText = ann.created_at
            ? new Date(ann.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
        }

        // Marcar como lido ao confirmar ou fechar
        var markAsRead = function () {
          if (readIds.indexOf(ann.id) === -1) {
            readIds.push(ann.id);
            try {
              localStorage.setItem('cantaai_read_announcements', JSON.stringify(readIds));
            } catch (e) {}
            updateClientAnnouncementsBadge();
          }
        };

        if (btnSingerAnnConfirm) {
          btnSingerAnnConfirm.onclick = function () {
            markAsRead();
            closeSingerAnnouncementModal();
          };
        }
        if (btnSingerAnnClose) {
          btnSingerAnnClose.onclick = function () {
            markAsRead();
            closeSingerAnnouncementModal();
          };
        }

        singerAnnModal.classList.remove('hidden');
      }

      // 1. Atualizar badges com os comunicados já salvos localmente
      updateClientAnnouncementsBadge();

      // Verificar cache local para popup inicial
      try {
        var rawLocal = localStorage.getItem('canta_ai_admin_announcements');
        var localList = rawLocal ? JSON.parse(rawLocal) : [];
        if (Array.isArray(localList)) {
          var matchedLocal = localList.filter(function (a) {
            return isTargetMatch(a.target) && readIds.indexOf(a.id) === -1;
          });
          if (matchedLocal.length > 0) {
            presentAnnouncement(matchedLocal[0]);
          }
        }
      } catch (e) {}

      // 2. Buscar da nuvem (Supabase REST) e mesclar na base local
      if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key) {
        var sysRepId = '3e42c00c-f10c-4b05-96b6-b782403d1d17';
        var restUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1/songs?repertoire_id=eq.' + encodeURIComponent(sysRepId) + '&artist=eq.SYSTEM_ANNOUNCEMENT&order=id.desc&limit=25';
        fetch(restUrl, {
          headers: {
            'apikey': window.SUPABASE_CONFIG.key,
            'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.key
          }
        }).then(function (res) {
          if (res.ok) return res.json();
          return [];
        }).then(function (rows) {
          if (Array.isArray(rows) && rows.length > 0) {
            var rawCur = localStorage.getItem('canta_ai_admin_announcements');
            var curList = rawCur ? JSON.parse(rawCur) : [];
            var changed = false;

            for (var i = 0; i < rows.length; i++) {
              try {
                if (rows[i].content) {
                  var annObj = typeof rows[i].content === 'string' ? JSON.parse(rows[i].content) : rows[i].content;
                  if (annObj && annObj.id) {
                    var exists = curList.some(function(item) { return item.id === annObj.id; });
                    if (!exists) {
                      curList.unshift(annObj);
                      changed = true;
                    }
                  }
                }
              } catch (err) {}
            }

            if (changed) {
              localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(curList));
            }

            updateClientAnnouncementsBadge();

            // Se o modal de suporte estiver aberto na aba de comunicados, re-renderizar a lista
            var paneAnn = document.getElementById('paneAnnouncements');
            if (paneAnn && !paneAnn.classList.contains('hidden') && typeof renderUserAnnouncementsList === 'function') {
              renderUserAnnouncementsList();
            }

            // Exibir popup se houver algum novo que ainda não foi visto
            var unreadCloud = curList.filter(function(a) {
              return isTargetMatch(a.target) && readIds.indexOf(a.id) === -1;
            });
            if (unreadCloud.length > 0 && (!singerAnnModal || singerAnnModal.classList.contains('hidden'))) {
              presentAnnouncement(unreadCloud[0]);
            }
          }
        }).catch(function () {});
      }
    }

    // Sincronização entre abas via storage event
    // Guard: o NotificationsCenter já escuta este evento internamente com lógica completa
    window.addEventListener('storage', function(e) {
      if (window.NotificationsCenter) return;
      if (e.key === 'canta_ai_admin_announcements' || e.key === 'cantaai_read_announcements') {
        updateClientAnnouncementsBadge();
        var paneAnn = document.getElementById('paneAnnouncements');
        if (paneAnn && !paneAnn.classList.contains('hidden') && typeof renderUserAnnouncementsList === 'function') {
          renderUserAnnouncementsList();
        }
      }
    });

    // Checar comunicados após carregar autenticação ou na abertura do app
    setTimeout(checkSingerAnnouncements, 1200);
    window.addEventListener('cantaai:auth_ready', function () {
      setTimeout(checkSingerAnnouncements, 800);
    });
    setInterval(checkSingerAnnouncements, 30000);

    // Inicialização da visualização: se usuário logado, vai direto ao App
    if (window.PrompterAuth && window.PrompterAuth.getUser()) {
      showApp();
    } else {
      showLanding();
    }
  }
});
