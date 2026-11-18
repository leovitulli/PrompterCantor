/**
 * CantaAí PRO — Compartilhamento Inteligente de Repertórios & Modo Maestro
 * - Link Mágico de Palco (?share=TOKEN) + QR Code + WhatsApp (para não cadastrados)
 * - Convite para Cadastro com Auto-Clone pós-signup (Motor Viral)
 * - Compartilhamento direto por @login para membros cadastrados
 * - Modo Maestro Ao Vivo via Supabase Realtime (sincronia de música no palco)
 */
(function () {
  'use strict';

  var PENDING_SHARE_KEY = 'cantaai_pending_share_token';
  var _currentShareRep = null;
  var _maestroChannel = null;
  var _maestroFollowEnabled = true;
  var _guestSongs = [];
  var _guestRep = null;
  var _isMaestroOwnerActive = false;

  function getSupabase() {
    return window.PrompterCloud && window.PrompterCloud.getClient ? window.PrompterCloud.getClient() : null;
  }

  function getUser() {
    return window.PrompterAuth && window.PrompterAuth.getUser ? window.PrompterAuth.getUser() : null;
  }

  function getProfile() {
    return window.PrompterAuth && window.PrompterAuth.getProfile ? window.PrompterAuth.getProfile() : null;
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function generateShareToken() {
    var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 10; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function buildShareUrl(token) {
    var base = window.location.origin + '/index.html';
    return base + '?share=' + encodeURIComponent(token);
  }

  // ════════════════════════════════════════
  //  MODAL DE COMPARTILHAMENTO (DONO)
  // ════════════════════════════════════════

  function ensureShareModalDOM() {
    if (document.getElementById('shareRepertoireModal')) return;

    var modalHtml =
      '<div id="shareRepertoireModal" class="modal hidden" style="z-index: 1000020;">' +
        '<div class="modal-overlay" id="shareModalOverlay"></div>' +
        '<div class="modal-card share-modal-card" style="max-width: 540px;">' +
          '<div class="modal-header">' +
            '<h2 id="shareModalTitle">🔗 Compartilhar Repertório</h2>' +
            '<button class="modal-close" id="btnCloseShareModal" aria-label="Fechar">✕</button>' +
          '</div>' +
          '<div class="modal-body" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">' +

            '<!-- Bloco 1: Link Mágico de Palco (Não Cadastrados & QR Code) -->' +
            '<div class="share-section-card">' +
              '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">' +
                '<div>' +
                  '<strong style="font-size:0.98rem; color:#f8fafc;">🌐 Link Mágico de Palco (Sem Cadastro)</strong>' +
                  '<p style="font-size:0.78rem; color:#94a3b8; margin:3px 0 0;">Qualquer músico abre no celular em modo leitura + teleprompter, com convite para criar conta.</p>' +
                '</div>' +
                '<button type="button" id="btnTogglePublicShare" class="btn btn-sm btn-primary">Ativar Link</button>' +
              '</div>' +

              '<div id="sharePublicActiveBox" class="hidden" style="margin-top: 0.9rem; display: flex; flex-direction: column; gap: 0.75rem;">' +
                '<div style="display:flex; gap:6px;">' +
                  '<input type="text" id="sharePublicUrlInput" class="form-control" readonly style="font-size:0.8rem; font-family:var(--font-mono);">' +
                  '<button type="button" id="btnCopyShareLink" class="btn btn-sm btn-primary" style="white-space:nowrap;">📋 Copiar</button>' +
                '</div>' +
                '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
                  '<button type="button" id="btnShareWhatsApp" class="btn btn-sm" style="background:#16a34a; color:#fff; border:none;">💬 Enviar no WhatsApp</button>' +
                  '<button type="button" id="btnShowShareQR" class="btn btn-sm btn-secondary">📱 Ver QR Code</button>' +
                  '<button type="button" id="btnRegenerateShareLink" class="btn btn-sm btn-outline" title="Invalida o link anterior e cria um novo">🔄 Novo Link</button>' +
                '</div>' +
                '<div id="shareQrBox" class="hidden" style="text-align:center; padding:12px; background:#fff; border-radius:12px; align-self:center;">' +
                  '<img id="shareQrImg" src="" alt="QR Code do Repertório" width="170" height="170" style="display:block; margin:0 auto;">' +
                  '<div style="color:#0f172a; font-size:0.74rem; font-weight:700; margin-top:6px;">Aponte a câmera para abrir o setlist</div>' +
                '</div>' +
                '<label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; color:#38bdf8; cursor:pointer; padding:8px 10px; background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:10px;">' +
                  '<input type="checkbox" id="chkMaestroLiveToggle" checked>' +
                  '<span><strong>📡 Modo Maestro Ao Vivo:</strong> Quando você abrir uma música no palco, a tela da banda muda junto automaticamente.</span>' +
                '</label>' +
              '</div>' +
            '</div>' +

            '<!-- Bloco 2: Membros Cadastrados (@login) -->' +
            '<div class="share-section-card">' +
              '<strong style="font-size:0.95rem; color:#f8fafc;">🎤 Enviar para Membro Cadastrado (@login)</strong>' +
              '<p style="font-size:0.78rem; color:#94a3b8; margin:3px 0 8px;">O músico verá o repertório sincronizado na aba "Compartilhados Comigo" sem poder alterar seu original.</p>' +
              '<div style="display:flex; gap:6px;">' +
                '<input type="text" id="shareHandleInput" class="form-control" placeholder="Ex: @joaoviolao" autocomplete="off">' +
                '<button type="button" id="btnSendShareToHandle" class="btn btn-sm btn-primary" style="white-space:nowrap;">➕ Convidar</button>' +
              '</div>' +
              '<div id="shareHandleFeedback" style="font-size:0.78rem; margin-top:6px; display:none;"></div>' +
              '<div id="shareMembersList" style="margin-top:10px; display:flex; flex-direction:column; gap:6px;"></div>' +
            '</div>' +

          '</div>' +
        '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('btnCloseShareModal').addEventListener('click', closeShareModal);
    document.getElementById('shareModalOverlay').addEventListener('click', closeShareModal);
    document.getElementById('btnTogglePublicShare').addEventListener('click', togglePublicLink);
    document.getElementById('btnCopyShareLink').addEventListener('click', copyShareLink);
    document.getElementById('btnShareWhatsApp').addEventListener('click', sendShareWhatsApp);
    document.getElementById('btnShowShareQR').addEventListener('click', toggleQR);
    document.getElementById('btnRegenerateShareLink').addEventListener('click', regenerateLink);
    document.getElementById('btnSendShareToHandle').addEventListener('click', inviteByHandle);
    document.getElementById('chkMaestroLiveToggle').addEventListener('change', function () {
      _isMaestroOwnerActive = !!this.checked;
      if (window.showToast) {
        window.showToast(_isMaestroOwnerActive ? '📡 Modo Maestro ativado para este repertório!' : '📡 Modo Maestro pausado.', 'info');
      }
    });
  }

  function closeShareModal() {
    var modal = document.getElementById('shareRepertoireModal');
    if (modal) modal.classList.add('hidden');
  }

  function openShareModal(repId) {
    var user = getUser();
    var sb = getSupabase();
    if (!user || !sb) {
      if (window.showToast) window.showToast('Faça login na sua conta para compartilhar repertórios.', 'warning');
      return;
    }

    ensureShareModalDOM();
    var modal = document.getElementById('shareRepertoireModal');
    modal.classList.remove('hidden');

    var titleEl = document.getElementById('shareModalTitle');
    if (titleEl) titleEl.textContent = '🔗 Compartilhar Repertório';

    sb.from('repertoires').select('*').eq('id', repId).limit(1).then(function (res) {
      if (res.error || !res.data || !res.data.length) {
        if (window.showToast) window.showToast('Não foi possível carregar os dados de compartilhamento.', 'warning');
        return;
      }
      _currentShareRep = res.data[0];
      if (titleEl) titleEl.textContent = '🔗 Compartilhar: ' + (_currentShareRep.name || 'Repertório');
      _isMaestroOwnerActive = document.getElementById('chkMaestroLiveToggle').checked;
      renderPublicShareUI();
      loadSharedMembers(repId);
    });
  }

  function renderPublicShareUI() {
    if (!_currentShareRep) return;
    var btnToggle = document.getElementById('btnTogglePublicShare');
    var activeBox = document.getElementById('sharePublicActiveBox');
    var urlInput = document.getElementById('sharePublicUrlInput');
    var qrBox = document.getElementById('shareQrBox');

    if (qrBox) qrBox.classList.add('hidden');

    if (_currentShareRep.is_shared && _currentShareRep.share_token) {
      btnToggle.textContent = '🟢 Link Ativo (Desativar)';
      btnToggle.className = 'btn btn-sm btn-secondary';
      activeBox.classList.remove('hidden');
      activeBox.style.display = 'flex';
      urlInput.value = buildShareUrl(_currentShareRep.share_token);
    } else {
      btnToggle.textContent = '🔗 Ativar Link Público';
      btnToggle.className = 'btn btn-sm btn-primary';
      activeBox.classList.add('hidden');
      activeBox.style.display = 'none';
      urlInput.value = '';
    }
  }

  function togglePublicLink() {
    if (!_currentShareRep) return;
    var sb = getSupabase();
    var profile = getProfile();
    if (!sb) return;

    var nextState = !_currentShareRep.is_shared;
    var token = _currentShareRep.share_token || generateShareToken();
    var ownerName = (profile && (profile.display_name || profile.singer_code)) || 'Cantor CantaAí';

    sb.from('repertoires')
      .update({ is_shared: nextState, share_token: token, shared_by_name: ownerName })
      .eq('id', _currentShareRep.id)
      .then(function (res) {
        if (res.error) {
          if (window.showToast) window.showToast('Erro ao atualizar link (execute o SQL atualizado no Supabase).', 'warning');
          return;
        }
        _currentShareRep.is_shared = nextState;
        _currentShareRep.share_token = token;
        renderPublicShareUI();
        if (window.showToast) {
          window.showToast(nextState ? '🔗 Link mágico de palco ativado!' : '🔒 Link público desativado.', nextState ? 'success' : 'info');
        }
      });
  }

  function regenerateLink() {
    if (!_currentShareRep) return;
    var sb = getSupabase();
    if (!sb) return;
    var newToken = generateShareToken();

    sb.from('repertoires')
      .update({ is_shared: true, share_token: newToken })
      .eq('id', _currentShareRep.id)
      .then(function (res) {
        if (res.error) return;
        _currentShareRep.is_shared = true;
        _currentShareRep.share_token = newToken;
        renderPublicShareUI();
        if (window.showToast) window.showToast('🔄 Novo link gerado! O anterior foi revogado.', 'success');
      });
  }

  function copyShareLink() {
    var input = document.getElementById('sharePublicUrlInput');
    if (!input || !input.value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function () {
        if (window.showToast) window.showToast('📋 Link copiado! Envie para a banda.', 'success');
      });
    } else {
      input.select();
      document.execCommand('copy');
      if (window.showToast) window.showToast('📋 Link copiado!', 'success');
    }
  }

  function sendShareWhatsApp() {
    var input = document.getElementById('sharePublicUrlInput');
    if (!input || !input.value || !_currentShareRep) return;
    var msg = '🎸 *Repertório: ' + _currentShareRep.name + '* (CantaAí PRO)\n' +
              'Acesse a lista completa com tons, cifras e teleprompter no seu celular (sem precisar instalar nada):\n' +
              input.value;
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  }

  function toggleQR() {
    var qrBox = document.getElementById('shareQrBox');
    var qrImg = document.getElementById('shareQrImg');
    var input = document.getElementById('sharePublicUrlInput');
    if (!qrBox || !qrImg || !input || !input.value) return;

    if (qrBox.classList.contains('hidden')) {
      qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(input.value);
      qrBox.classList.remove('hidden');
    } else {
      qrBox.classList.add('hidden');
    }
  }

  function inviteByHandle() {
    if (!_currentShareRep) return;
    var sb = getSupabase();
    var user = getUser();
    var profile = getProfile();
    var input = document.getElementById('shareHandleInput');
    var fb = document.getElementById('shareHandleFeedback');
    if (!sb || !user || !input) return;

    var handle = input.value.trim();
    if (!handle || handle.length < 2) {
      fb.style.display = 'block';
      fb.style.color = '#fbbf24';
      fb.textContent = 'Digite o @login do músico (ex: @joaoviolao).';
      return;
    }

    fb.style.display = 'block';
    fb.style.color = '#38bdf8';
    fb.textContent = '🔍 Buscando músico cadastrado...';

    sb.rpc('find_singer_by_handle', { p_handle: handle }).then(function (res) {
      if (res.error) {
        fb.style.color = '#f87171';
        fb.textContent = 'Erro ao buscar músico. Verifique se o SQL foi executado no Supabase.';
        return;
      }
      var list = res.data || [];
      if (list.length === 0) {
        fb.style.color = '#fbbf24';
        fb.textContent = 'Músico "' + handle + '" não encontrado. Use o Link Mágico acima para quem ainda não tem conta!';
        return;
      }

      var target = list[0];
      if (target.id === user.id) {
        fb.style.color = '#fbbf24';
        fb.textContent = 'Você já é o dono deste repertório!';
        return;
      }

      var ownerName = (profile && profile.display_name) || 'Cantor';
      var ownerCode = (profile && profile.singer_code) || '';

      sb.from('repertoire_shares').upsert({
        repertoire_id: _currentShareRep.id,
        owner_id: user.id,
        owner_name: ownerName,
        owner_singer_code: ownerCode,
        target_user_id: target.id,
        target_singer_code: target.singer_code || handle,
        permission: 'read'
      }, { onConflict: 'repertoire_id,target_user_id' }).then(function (insRes) {
        if (insRes.error) {
          fb.style.color = '#f87171';
          fb.textContent = 'Não foi possível compartilhar: ' + insRes.error.message;
          return;
        }
        input.value = '';
        fb.style.color = '#34d399';
        fb.textContent = '✅ Compartilhado com ' + (target.display_name || target.singer_code) + '!';
        loadSharedMembers(_currentShareRep.id);
      });
    });
  }

  function loadSharedMembers(repId) {
    var sb = getSupabase();
    var container = document.getElementById('shareMembersList');
    if (!sb || !container) return;

    sb.from('repertoire_shares').select('*').eq('repertoire_id', repId).then(function (res) {
      var rows = (res && res.data) ? res.data : [];
      if (rows.length === 0) {
        container.innerHTML = '<div style="font-size:0.76rem; color:#64748b;">Nenhum membro convidado diretamente ainda.</div>';
        return;
      }
      container.innerHTML = rows.map(function (r) {
        return (
          '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(255,255,255,0.04); border-radius:8px; font-size:0.82rem;">' +
            '<span>🎤 <strong>' + escapeHtml(r.target_singer_code) + '</strong> <span style="color:#94a3b8;">(Modo Leitura)</span></span>' +
            '<button type="button" class="btn btn-xs btn-outline btn-revoke-share" data-share-id="' + escapeHtml(r.id) + '" style="color:#f87171; border-color:rgba(239,68,68,0.35);">Remover</button>' +
          '</div>'
        );
      }).join('');

      container.querySelectorAll('.btn-revoke-share').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var sId = this.getAttribute('data-share-id');
          sb.from('repertoire_shares').delete().eq('id', sId).then(function () {
            loadSharedMembers(repId);
            if (window.showToast) window.showToast('Acesso removido.', 'info');
          });
        });
      });
    });
  }

  // ════════════════════════════════════════
  //  MODO MAESTRO AO VIVO (REALTIME)
  // ════════════════════════════════════════

  function broadcastMaestroSong(repertoire, song) {
    var sb = getSupabase();
    if (!sb || !repertoire || !song) return;
    if (!repertoire.is_shared || !repertoire.share_token) return;
    if (!_isMaestroOwnerActive && !repertoire.is_shared) return;

    var channelName = 'canta_ai_maestro_' + repertoire.share_token;
    if (!_maestroChannel || _maestroChannel._topic !== 'realtime:' + channelName) {
      if (_maestroChannel) { try { sb.removeChannel(_maestroChannel); } catch (e) {} }
      _maestroChannel = sb.channel(channelName);
      _maestroChannel.subscribe();
    }

    _maestroChannel.send({
      type: 'broadcast',
      event: 'maestro_song',
      payload: {
        songId: song.id,
        title: song.title,
        key: song.key || song.originalKey || ''
      }
    });
  }

  function subscribeMaestroGuest(token) {
    var sb = getSupabase();
    if (!sb || !token) return;
    var channelName = 'canta_ai_maestro_' + token;
    var ch = sb.channel(channelName);
    ch.on('broadcast', { event: 'maestro_song' }, function (msg) {
      if (!_maestroFollowEnabled || !msg || !msg.payload) return;
      var targetId = msg.payload.songId;
      var idx = -1;
      for (var i = 0; i < _guestSongs.length; i++) {
        if (_guestSongs[i].id === targetId) { idx = i; break; }
      }
      if (idx !== -1 && window.CantaApp && typeof window.CantaApp.openPrompterView === 'function') {
        window.CantaApp.openPrompterView(_guestSongs[idx], idx);
        if (window.showToast) {
          window.showToast('📡 Maestro abriu: ' + (_guestSongs[idx].title || ''), 'info');
        }
      }
    });
    ch.subscribe();
  }

  // ════════════════════════════════════════
  //  MODO CONVIDADO (?share=TOKEN)
  // ════════════════════════════════════════

  function renderGuestBanner(rep) {
    if (document.getElementById('guestShareBanner')) return;
    var isLogged = !!getUser();

    var banner = document.createElement('div');
    banner.id = 'guestShareBanner';
    banner.className = 'guest-share-banner';
    banner.innerHTML =
      '<div class="gsb-inner">' +
        '<div class="gsb-info">' +
          '<span class="gsb-badge">📡 MODO MAESTRO • LEITURA</span>' +
          '<span>Repertório <strong>' + escapeHtml(rep.name) + '</strong> de <strong>' + escapeHtml(rep.owner_name || 'Cantor') + '</strong></span>' +
        '</div>' +
        '<div class="gsb-actions">' +
          '<button type="button" id="btnGuestMaestroFollow" class="btn btn-sm btn-secondary" title="Acompanhar automaticamente a música aberta pelo cantor">📡 Seguir Cantor: ON</button>' +
          (isLogged
            ? '<button type="button" id="btnGuestCloneNow" class="btn btn-sm btn-primary">📥 Salvar na Minha Conta</button>'
            : '<button type="button" id="btnGuestSignupSave" class="btn btn-sm btn-primary">🚀 Criar Conta Grátis e Salvar</button>') +
        '</div>' +
      '</div>';

    document.body.insertBefore(banner, document.body.firstChild);

    document.getElementById('btnGuestMaestroFollow').addEventListener('click', function () {
      _maestroFollowEnabled = !_maestroFollowEnabled;
      this.textContent = _maestroFollowEnabled ? '📡 Seguir Cantor: ON' : '📡 Seguir Cantor: OFF';
      this.classList.toggle('btn-active-sort', _maestroFollowEnabled);
    });

    var btnClone = document.getElementById('btnGuestCloneNow');
    if (btnClone) {
      btnClone.addEventListener('click', function () {
        cloneSharedToMyAccount(rep.share_token);
      });
    }

    var btnSignup = document.getElementById('btnGuestSignupSave');
    if (btnSignup) {
      btnSignup.addEventListener('click', function () {
        try { localStorage.setItem(PENDING_SHARE_KEY, rep.share_token); } catch (e) {}
        if (window.openAuthModal) {
          window.openAuthModal('signup');
        } else {
          window.location.href = 'index.html?auth=signup';
        }
      });
    }
  }

  function enterGuestShareMode(token) {
    var sb = getSupabase();
    if (!sb || !token) return;

    document.body.classList.add('canta-read-only-share');
    document.documentElement.classList.add('canta-auth-active');

    var tabRep = document.getElementById('tabRepertoire');
    if (tabRep) {
      tabRep.classList.remove('hidden');
      tabRep.classList.add('active');
    }

    sb.rpc('get_shared_repertoire', { p_token: token }).then(function (res) {
      if (res.error || !res.data || !res.data.repertoire) {
        var mainView = document.getElementById('mainRepertoireView');
        if (mainView) {
          mainView.innerHTML =
            '<div class="empty-state">' +
              '<div class="empty-icon">🔒</div>' +
              '<h2>Link indisponível ou expirado</h2>' +
              '<p>O dono deste repertório desativou o compartilhamento ou gerou um novo link.</p>' +
              '<a href="landing_v3.html" class="btn btn-primary" style="margin-top:1rem;">Conhecer o CantaAí PRO</a>' +
            '</div>';
        }
        return;
      }

      _guestRep = res.data.repertoire;
      _guestSongs = (res.data.songs || []).map(function (s, idx) {
        return {
          id: s.id,
          repertoireId: s.repertoire_id,
          title: s.title,
          artist: s.artist,
          composer: s.composer,
          key: s.key,
          originalKey: s.original_key,
          rhythm: s.rhythm,
          youtubeUrl: s.youtube_url,
          youtubeId: s.youtube_id,
          spotifyUrl: s.spotify_url,
          content: s.content,
          trackNumber: s.track_number !== null ? s.track_number : (idx + 1),
          order: s.order
        };
      });

      renderGuestBanner(_guestRep);
      subscribeMaestroGuest(token);

      if (window.CantaApp && typeof window.CantaApp.renderSharedSongsView === 'function') {
        window.CantaApp.renderSharedSongsView(_guestRep, _guestSongs, true);
      }
    });
  }

  function cloneSharedToMyAccount(token) {
    var sb = getSupabase();
    var user = getUser();
    if (!sb || !user || !window.PrompterDB) return Promise.resolve(false);

    return sb.rpc('get_shared_repertoire', { p_token: token }).then(function (res) {
      if (res.error || !res.data || !res.data.repertoire) return false;
      var srcRep = res.data.repertoire;
      var srcSongs = res.data.songs || [];

      return window.PrompterDB.saveRepertoire({
        name: srcRep.name + ' (Compartilhado)',
        source: 'shared_clone',
        user_id: user.id
      }).then(function (newRepId) {
        if (!srcSongs.length) return newRepId;
        var batch = srcSongs.map(function (s, idx) {
          return {
            repertoireId: newRepId,
            title: s.title,
            artist: s.artist || '',
            composer: s.composer || '',
            key: s.key || '',
            originalKey: s.original_key || '',
            rhythm: s.rhythm || '',
            youtubeUrl: s.youtube_url || '',
            youtubeId: s.youtube_id || '',
            spotifyUrl: s.spotify_url || '',
            content: s.content || '',
            trackNumber: s.track_number !== null ? s.track_number : (idx + 1)
          };
        });
        return window.PrompterDB.saveSongsBatch(batch).then(function () { return newRepId; });
      }).then(function (newRepId) {
        try { localStorage.removeItem(PENDING_SHARE_KEY); } catch (e) {}
        document.body.classList.remove('canta-read-only-share');
        var banner = document.getElementById('guestShareBanner');
        if (banner) banner.remove();
        if (window.showToast) window.showToast('🎉 Repertório salvo na sua conta com sucesso!', 'success');
        if (window.CantaApp && typeof window.CantaApp.openRepertoireSongs === 'function') {
          window.CantaApp.loadRepertoires().then(function () {
            window.CantaApp.openRepertoireSongs(newRepId);
          });
        }
        return true;
      });
    });
  }

  // ════════════════════════════════════════
  //  SEÇÃO "COMPARTILHADOS COMIGO" (MEMBROS)
  // ════════════════════════════════════════

  function loadSharedWithMe() {
    var sb = getSupabase();
    var user = getUser();
    var mainView = document.getElementById('mainRepertoireView');
    if (!sb || !user || !mainView || document.body.classList.contains('canta-read-only-share')) return;

    sb.from('repertoire_shares')
      .select('id, repertoire_id, owner_name, owner_singer_code, repertoires(id, name, share_token, is_shared)')
      .eq('target_user_id', user.id)
      .then(function (res) {
        var existingSection = document.getElementById('sharedWithMeSection');
        if (existingSection) existingSection.remove();

        var shares = (res && res.data) ? res.data.filter(function (s) { return s.repertoires; }) : [];
        if (shares.length === 0) return;

        var sec = document.createElement('div');
        sec.id = 'sharedWithMeSection';
        sec.className = 'shared-with-me-section';
        sec.innerHTML =
          '<h3 class="shared-section-title">🤝 Compartilhados Comigo <span class="shared-count-pill">' + shares.length + '</span></h3>' +
          '<div class="repertoires-grid" id="sharedRepertoiresGrid">' +
            shares.map(function (s) {
              var r = s.repertoires;
              return (
                '<div class="rep-card shared-rep-card" data-shared-rep-id="' + escapeHtml(r.id) + '">' +
                  '<div class="rep-card-header">' +
                    '<h3 class="rep-card-title">' + escapeHtml(r.name) + '</h3>' +
                    '<span class="badge" style="background:rgba(56,189,248,0.16); color:#38bdf8; font-size:0.72rem;">🤝 De ' + escapeHtml(s.owner_singer_code || s.owner_name || 'Cantor') + '</span>' +
                  '</div>' +
                  '<div class="rep-card-actions" style="margin-top:0.8rem; display:flex; gap:8px;">' +
                    '<button type="button" class="btn btn-sm btn-primary btn-open-shared-rep" data-rep-id="' + escapeHtml(r.id) + '" data-rep-name="' + escapeHtml(r.name) + '" data-owner="' + escapeHtml(s.owner_name || '') + '" data-token="' + escapeHtml(r.share_token || '') + '">🎤 Abrir (Maestro)</button>' +
                  '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>';

        mainView.appendChild(sec);

        sec.querySelectorAll('.btn-open-shared-rep').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var rId = this.getAttribute('data-rep-id');
            var rName = this.getAttribute('data-rep-name');
            var owner = this.getAttribute('data-owner');
            var tok = this.getAttribute('data-token');

            sb.from('songs').select('*').eq('repertoire_id', rId).order('track_number', { ascending: true }).then(function (sRes) {
              var mapped = (sRes.data || []).map(function (s, idx) {
                return {
                  id: s.id,
                  repertoireId: s.repertoire_id,
                  title: s.title,
                  artist: s.artist,
                  composer: s.composer,
                  key: s.key,
                  originalKey: s.original_key,
                  rhythm: s.rhythm,
                  youtubeUrl: s.youtube_url,
                  youtubeId: s.youtube_id,
                  spotifyUrl: s.spotify_url,
                  content: s.content,
                  trackNumber: s.track_number !== null ? s.track_number : (idx + 1)
                };
              });
              _guestRep = { id: rId, name: rName, owner_name: owner, share_token: tok };
              _guestSongs = mapped;
              if (tok) subscribeMaestroGuest(tok);
              if (window.CantaApp && typeof window.CantaApp.renderSharedSongsView === 'function') {
                window.CantaApp.renderSharedSongsView(_guestRep, mapped, true);
              }
            });
          });
        });
      });
  }

  // Inicialização automática para ?share=TOKEN e auto-clone pós-cadastro
  document.addEventListener('DOMContentLoaded', function () {
    var params = new URLSearchParams(window.location.search);
    var shareToken = params.get('share');
    if (shareToken) {
      setTimeout(function () {
        enterGuestShareMode(shareToken);
      }, 150);
    }
  });

  window.addEventListener('cantaai:auth_ready', function () {
    var pending = null;
    try { pending = localStorage.getItem(PENDING_SHARE_KEY); } catch (e) {}
    if (pending && getUser()) {
      cloneSharedToMyAccount(pending);
    } else {
      setTimeout(loadSharedWithMe, 400);
    }
  });

  window.RepertoireShare = {
    openModal: openShareModal,
    closeModal: closeShareModal,
    broadcastMaestroSong: broadcastMaestroSong,
    loadSharedWithMe: loadSharedWithMe,
    enterGuestShareMode: enterGuestShareMode
  };
})();

