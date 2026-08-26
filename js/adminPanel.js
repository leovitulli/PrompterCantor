/**
 * PrompterCantor PRO - Painel de Governança e Operações do Desenvolvedor (Admin Dashboard)
 * Permite monitorar usuários online, gerenciar planos, inspecionar e clonar silenciosamente
 * repertórios de qualquer cantor do SaaS para o perfil do desenvolvedor.
 */

(function () {
  'use strict';

  var adminModal = null;

  var PrompterAdmin = {
    init: function () {
      this.createAdminModalHTML();
      this.bindEvents();
    },

    // ═══════════════════════════════════════
    //  CRIAÇÃO DO MODAL DO PAINEL ADMIN
    // ═══════════════════════════════════════
    createAdminModalHTML: function () {
      if (document.getElementById('adminPanelModal')) return;

      var modalHtml =
        '<div id="adminPanelModal" class="modal-overlay hidden">' +
          '<div class="modal-card admin-modal-card">' +
            '<div class="modal-header">' +
              '<div class="admin-title-group">' +
                '<h2>👑 Painel de Governança do Desenvolvedor</h2>' +
                '<span class="badge badge-pro">PRO ADMIN</span>' +
              '</div>' +
              '<button class="modal-close btn-close-admin">✕</button>' +
            '</div>' +
            '<div class="modal-body admin-modal-body">' +
              '<!-- CARDS DE MÉTRICAS DA PLATAFORMA -->' +
              '<div class="admin-metrics-grid">' +
                '<div class="metric-card">' +
                  '<div class="metric-icon">👥</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Usuários Cadastrados</span>' +
                    '<span class="metric-value" id="admMetricTotalUsers">0</span>' +
                  '</div>' +
                '</div>' +
                '<div class="metric-card">' +
                  '<div class="metric-icon">⚡</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Usuários Online Agora</span>' +
                    '<span class="metric-value metric-green" id="admMetricOnlineUsers">0</span>' +
                  '</div>' +
                '</div>' +
                '<div class="metric-card">' +
                  '<div class="metric-icon">⭐</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Assinantes PRO</span>' +
                    '<span class="metric-value metric-gold" id="admMetricProUsers">0</span>' +
                  '</div>' +
                '</div>' +
                '<div class="metric-card">' +
                  '<div class="metric-icon">🎵</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Total de Músicas no Banco</span>' +
                    '<span class="metric-value" id="admMetricTotalSongs">0</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- TABELA DE USUÁRIOS DO SAAS -->' +
              '<div class="admin-section-header">' +
                '<h3>Gestão de Cantores & Usuários</h3>' +
                '<button id="btnRefreshAdminData" class="btn btn-secondary btn-sm">🔄 Atualizar Dados</button>' +
              '</div>' +
              '<div class="admin-table-container">' +
                '<table class="admin-table">' +
                  '<thead>' +
                    '<tr>' +
                      '<th>Status</th>' +
                      '<th>E-mail</th>' +
                      '<th>Código do Cantor</th>' +
                      '<th>Plano</th>' +
                      '<th>Último Acesso</th>' +
                      '<th>Ações de Governança</th>' +
                    '</tr>' +
                  '</thead>' +
                  '<tbody id="adminUsersTableBody">' +
                    '<tr><td colspan="6" class="text-center">Carregando usuários...</td></tr>' +
                  '</tbody>' +
                '</table>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      adminModal = document.getElementById('adminPanelModal');
    },

    bindEvents: function () {
      var btnClose = adminModal ? adminModal.querySelector('.btn-close-admin') : null;
      if (btnClose) {
        btnClose.addEventListener('click', function () {
          PrompterAdmin.closeModal();
        });
      }

      var btnRefresh = document.getElementById('btnRefreshAdminData');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', function () {
          PrompterAdmin.loadDashboardData();
        });
      }
    },

    openModal: function () {
      if (!window.PrompterAuth || !window.PrompterAuth.isAdmin()) {
        if (window.showToast) window.showToast('Acesso restrito ao perfil de Desenvolvedor.', 'warning');
        return;
      }

      if (adminModal) {
        adminModal.classList.remove('hidden');
        this.loadDashboardData();
      }
    },

    closeModal: function () {
      if (adminModal) adminModal.classList.add('hidden');
    },

    // ═══════════════════════════════════════
    //  CARREGAMENTO DE DADOS & MÉTRICAS
    // ═══════════════════════════════════════
    loadDashboardData: function () {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb) return;

      Promise.all([
        sb.from('profiles').select('*'),
        sb.from('repertoires').select('*'),
        sb.from('songs').select('*')
      ]).then(function (results) {
        var profiles = (results[0] && results[0].data) || [];
        var repertoires = (results[1] && results[1].data) || [];
        var songs = (results[2] && results[2].data) || [];

        // Calcular Métricas
        var totalUsers = profiles.length;
        var proUsers = profiles.filter(function (p) { return p.plan_tier === 'pro'; }).length;
        var now = Date.now();
        var onlineUsers = profiles.filter(function (p) {
          if (!p.last_seen_at) return false;
          var lastSeen = new Date(p.last_seen_at).getTime();
          return (now - lastSeen) < (5 * 60 * 1000); // Visto nos últimos 5 min
        }).length;

        document.getElementById('admMetricTotalUsers').innerText = totalUsers || '1';
        document.getElementById('admMetricOnlineUsers').innerText = Math.max(1, onlineUsers);
        document.getElementById('admMetricProUsers').innerText = proUsers || '1';
        document.getElementById('admMetricTotalSongs').innerText = songs.length || '0';

        // Renderizar Tabela de Usuários
        PrompterAdmin.renderUsersTable(profiles, repertoires);
      }).catch(function (err) {
        console.warn('Erro ao carregar dados do Admin Dashboard:', err);
      });
    },

    renderUsersTable: function (profiles, repertoires) {
      var tbody = document.getElementById('adminUsersTableBody');
      if (!tbody) return;

      if (!profiles || profiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum usuário cadastrado ainda.</td></tr>';
        return;
      }

      var now = Date.now();
      var html = '';

      profiles.forEach(function (user) {
        var lastSeen = user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
        var isOnline = (now - lastSeen) < (5 * 60 * 1000);
        var statusDot = isOnline ? '<span class="status-dot dot-online" title="Online Agora"></span> Online' : '<span class="status-dot dot-offline" title="Offline"></span> Offline';
        var userRepsCount = repertoires.filter(function (r) { return r.user_id === user.id; }).length;
        var planBadge = user.plan_tier === 'pro' ? '<span class="badge badge-pro">PRO</span>' : '<span class="badge badge-free">FREE</span>';
        var dateStr = user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : 'Hoje';

        html +=
          '<tr>' +
            '<td>' + statusDot + '</td>' +
            '<td><strong>' + (user.email || 'Usuário') + '</strong></td>' +
            '<td><code>' + (user.singer_code || '#CANTOR-0000') + '</code></td>' +
            '<td>' + planBadge + '</td>' +
            '<td>' + dateStr + '</td>' +
            '<td class="admin-actions-cell">' +
              '<button class="btn btn-sm btn-secondary btn-inspect-reps" data-user-id="' + user.id + '" data-user-email="' + user.email + '" title="Inspecionar Repertórios de ' + user.email + '">🔍 Inspecionar (' + userRepsCount + ')</button> ' +
              '<button class="btn btn-sm btn-outline btn-toggle-plan" data-user-id="' + user.id + '" data-current-plan="' + user.plan_tier + '">⚡ Alterar Plano</button>' +
            '</td>' +
          '</tr>';
      });

      tbody.innerHTML = html;

      // Eventos dos botões da tabela
      tbody.querySelectorAll('.btn-inspect-reps').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var uEmail = this.getAttribute('data-user-email');
          PrompterAdmin.inspectUserRepertoires(uId, uEmail);
        });
      });

      tbody.querySelectorAll('.btn-toggle-plan').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var currentPlan = this.getAttribute('data-current-plan');
          PrompterAdmin.toggleUserPlan(uId, currentPlan);
        });
      });
    },

    // ═══════════════════════════════════════
    //  INSPEÇÃO & CLONAGEM SILENCIOSA DE REPERTÓRIOS
    // ═══════════════════════════════════════
    inspectUserRepertoires: function (userId, userEmail) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb) return;

      Promise.all([
        sb.from('repertoires').select('*'),
        sb.from('songs').select('*')
      ]).then(function (results) {
        var allReps = (results[0] && results[0].data) || [];
        var allSongs = (results[1] && results[1].data) || [];

        var userReps = allReps.filter(function (r) { return r.user_id === userId; });

        if (userReps.length === 0) {
          if (window.showToast) window.showToast('O usuário ' + userEmail + ' não possui repertórios criados.', 'info');
          return;
        }

        var message = '📋 REPERTÓRIOS DO USUÁRIO (' + userEmail + '):\n\n';
        userReps.forEach(function (r, index) {
          var songCount = allSongs.filter(function (s) { return s.repertoire_id === r.id; }).length;
          message += (index + 1) + '. ' + r.name + ' (' + songCount + ' músicas)\n';
        });

        message += '\nDeseja CLONAR SILENCIOSAMENTE todos os repertórios deste usuário para a sua conta de Desenvolvedor?';

        if (confirm(message)) {
          PrompterAdmin.silentCloneUserRepertoires(userReps, allSongs);
        }
      });
    },

    silentCloneUserRepertoires: function (userReps, allSongs) {
      if (!userReps || userReps.length === 0) return;

      var currentDevUser = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var devUserId = currentDevUser ? currentDevUser.id : null;

      if (window.showToast) window.showToast('Clonando silenciosamente repertórios para o seu perfil...', 'info');

      var clonePromises = userReps.map(function (rep) {
        var repSongs = allSongs.filter(function (s) { return s.repertoire_id === rep.id; });

        var newRepData = {
          name: rep.name + ' (Cópia Admin)',
          source: 'cloned',
          user_id: devUserId
        };

        return window.PrompterCloud.saveRepertoireToCloud(newRepData).then(function (savedRep) {
          if (savedRep && savedRep.id) {
            var clonedSongsPayload = repSongs.map(function (s) {
              return {
                repertoireId: savedRep.id,
                title: s.title,
                key: s.key || '',
                originalKey: s.original_key || '',
                rhythm: s.rhythm || '',
                artist: s.artist || '',
                composer: s.composer || '',
                content: s.content || '',
                user_id: devUserId
              };
            });

            return window.PrompterCloud.saveSongsBatchToCloud(clonedSongsPayload);
          }
        });
      });

      Promise.all(clonePromises).then(function () {
        if (window.showToast) window.showToast('🎉 Repertórios clonados silenciosamente para o seu perfil!', 'success');
        if (typeof window.loadRepertoires === 'function') window.loadRepertoires();
      }).catch(function (err) {
        console.warn('Erro na clonagem silenciosa:', err);
        if (window.showToast) window.showToast('Erro ao clonar repertórios.', 'warning');
      });
    },

    toggleUserPlan: function (userId, currentPlan) {
      var newPlan = currentPlan === 'pro' ? 'free' : 'pro';
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb) return;

      sb.from('profiles').upsert({ id: userId, plan_tier: newPlan }).then(function () {
        if (window.showToast) window.showToast('Plano do usuário alterado para ' + newPlan.toUpperCase() + '!', 'success');
        PrompterAdmin.loadDashboardData();
      });
    }
  };

  window.PrompterAdmin = PrompterAdmin;
})();
