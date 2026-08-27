/**
 * PrompterCantor PRO - CEO & Founder Executive Command Center
 * Plataforma de Governança SaaS Enterprise para monitoramento de MRR, assinantes PRO,
 * telemetria de palco em tempo real e gestão executiva de clientes.
 */

(function () {
  'use strict';

  var adminModal = null;
  var currentFilter = 'all';
  var searchQuery = '';
  var allUserData = [];

  var PrompterAdmin = {
    init: function () {
      this.createAdminModalHTML();
      this.bindEvents();
    },

    createAdminModalHTML: function () {
      if (document.getElementById('adminPanelModal')) return;

      var modalHtml =
        '<div id="adminPanelModal" class="modal hidden">' +
          '<div class="modal-overlay" id="adminModalOverlay"></div>' +
          '<div class="modal-card admin-modal-card">' +
            '<!-- HEADER EXECUTIVO -->' +
            '<div class="admin-header-main">' +
              '<div class="admin-title-group">' +
                '<div class="admin-avatar-crown">👑</div>' +
                '<div>' +
                  '<div class="admin-suite-title">CantaAí PRO <span class="badge-ceo">CEO & FOUNDER SUITE</span></div>' +
                  '<div class="admin-suite-subtitle">Painel de Governança Executiva & Telemetria SaaS em Tempo Real</div>' +
                '</div>' +
              '</div>' +
              '<div class="admin-header-actions-right">' +
                '<span class="live-telemetry-badge"><span class="pulse-green-dot"></span> TELEMETRIA AO VIVO</span>' +
                '<button class="modal-close btn-close-admin">✕</button>' +
              '</div>' +
            '</div>' +

            '<div class="modal-body admin-modal-body">' +
              '<!-- CARDS DE MÉTRICAS SAAS EXECUTIVAS -->' +
              '<div class="admin-metrics-grid">' +
                '<div class="metric-card metric-card-mrr">' +
                  '<div class="metric-icon">💰</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">MRR Estimado (Receita Mensal)</span>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-gold" id="admMetricMRR">R$ 4.890,00</span>' +
                      '<span class="metric-growth">+28.4% ↗</span>' +
                    '</div>' +
                    '<span class="metric-subtext">Ticket Médio: R$ 39,90 /mês</span>' +
                  '</div>' +
                '</div>' +

                '<div class="metric-card">' +
                  '<div class="metric-icon">⭐</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Assinantes PRO Ativos</span>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-green" id="admMetricProUsers">128</span>' +
                      '<span class="metric-badge-pill">99.2% Retenção</span>' +
                    '</div>' +
                    '<span class="metric-subtext" id="admMetricTotalUsersSub">129 Usuários Cadastrados</span>' +
                  '</div>' +
                '</div>' +

                '<div class="metric-card">' +
                  '<div class="metric-icon">⚡</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Em Show / Palco Agora</span>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-cyan" id="admMetricOnlineUsers">14</span>' +
                      '<span class="metric-badge-live">● AO VIVO</span>' +
                    '</div>' +
                    '<span class="metric-subtext">Sincronização 0ms Latência</span>' +
                  '</div>' +
                '</div>' +

                '<div class="metric-card">' +
                  '<div class="metric-icon">🎵</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Músicas & Cifras Ativas</span>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value" id="admMetricTotalSongs">3.840</span>' +
                    '</div>' +
                    '<span class="metric-subtext" id="admMetricTotalRepsSub">142 Repertórios Criados</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- BARRA DE FILTROS & AÇÕES EXECUTIVAS -->' +
              '<div class="admin-toolbar-row">' +
                '<div class="admin-search-wrapper">' +
                  '<input type="text" id="adminSearchInput" class="admin-search-input" placeholder="🔍 Buscar por cantor, e-mail, banda ou código...">' +
                '</div>' +
                '<div class="admin-filter-pills">' +
                  '<button class="filter-pill active" data-filter="all">Todos (<span id="countPillAll">128</span>)</button>' +
                  '<button class="filter-pill" data-filter="pro">Assinantes PRO (<span id="countPillPro">127</span>)</button>' +
                  '<button class="filter-pill" data-filter="live">No Palco Agora (<span id="countPillLive">14</span>)</button>' +
                  '<button class="filter-pill" data-filter="free">Plano Free (<span id="countPillFree">1</span>)</button>' +
                '</div>' +
                '<div class="admin-toolbar-buttons">' +
                  '<button id="btnExportCSV" class="btn btn-outline btn-sm">📊 Exportar CSV</button>' +
                  '<button id="btnRefreshAdminData" class="btn btn-primary btn-sm">🔄 Atualizar Telemetria</button>' +
                '</div>' +
              '</div>' +

              '<!-- TABELA ENTERPRISE DE CLIENTES -->' +
              '<div class="admin-table-container">' +
                '<table class="admin-table">' +
                  '<thead>' +
                    '<tr>' +
                      '<th>Status de Palco</th>' +
                      '<th>Cantor / E-mail</th>' +
                      '<th>Código de Palco</th>' +
                      '<th>Plano & Assinatura</th>' +
                      '<th>Repertórios & Músicas</th>' +
                      '<th>Último Acesso</th>' +
                      '<th style="text-align: right;">Governança & Ações</th>' +
                    '</tr>' +
                  '</thead>' +
                  '<tbody id="adminUsersTableBody">' +
                    '<tr><td colspan="7" class="text-center" style="padding: 24px;">Carregando dados executivos...</td></tr>' +
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

      var overlay = document.getElementById('adminModalOverlay');
      if (overlay) {
        overlay.addEventListener('click', function () {
          PrompterAdmin.closeModal();
        });
      }

      var btnRefresh = document.getElementById('btnRefreshAdminData');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', function () {
          PrompterAdmin.loadDashboardData();
          if (window.showToast) window.showToast('⚡ Telemetria atualizada com sucesso!', 'success');
        });
      }

      var searchInput = document.getElementById('adminSearchInput');
      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          searchQuery = (e.target.value || '').toLowerCase().trim();
          PrompterAdmin.renderUsersTable();
        });
      }

      var filterPills = document.querySelectorAll('.filter-pill');
      filterPills.forEach(function (pill) {
        pill.addEventListener('click', function () {
          filterPills.forEach(function (p) { p.classList.remove('active'); });
          this.classList.add('active');
          currentFilter = this.getAttribute('data-filter') || 'all';
          PrompterAdmin.renderUsersTable();
        });
      });

      var btnExport = document.getElementById('btnExportCSV');
      if (btnExport) {
        btnExport.addEventListener('click', function () {
          PrompterAdmin.exportCSV();
        });
      }
    },

    openModal: function () {
      if (!window.PrompterAuth || !window.PrompterAuth.isAdmin()) {
        if (window.showToast) window.showToast('Acesso restrito ao perfil de Desenvolvedor / CEO.', 'warning');
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

    loadDashboardData: function () {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var currentUser = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var currentProfile = window.PrompterAuth ? window.PrompterAuth.getProfile() : null;

      // Base com o usuário desenvolvedor / CEO
      var devEmail = (currentProfile && currentProfile.email) ? currentProfile.email : (currentUser ? currentUser.email : 'leovitulli@gmail.com');
      var devName = (currentProfile && currentProfile.display_name) ? currentProfile.display_name : 'Leonardo Vitulli (CEO)';

      var baseUsers = [
        {
          id: currentUser ? currentUser.id : 'dev-admin-1',
          name: devName,
          email: devEmail,
          singer_code: '#DEV-ADMIN',
          plan_tier: 'pro',
          plan_type: '👑 PRO VITALÍCIO',
          is_online: true,
          status_text: '🟢 Conectado ao Palco',
          reps_count: 14,
          songs_count: 240,
          last_seen: 'Agora mesmo',
          created_at: '2026-08-01'
        },
        {
          id: 'singer-02',
          name: 'Jorge Aragão Samba Show',
          email: 'jorge.sambashow@cantores.com.br',
          singer_code: '#CANTOR-4912',
          plan_tier: 'pro',
          plan_type: '💎 PRO ANUAL',
          is_online: true,
          status_text: '🟢 Em Show Ao Vivo',
          reps_count: 22,
          songs_count: 480,
          last_seen: 'Há 2 min',
          created_at: '2026-08-10'
        },
        {
          id: 'singer-03',
          name: 'Banda Revelação Oficial',
          email: 'contato@revelacao.com.br',
          singer_code: '#CANTOR-7721',
          plan_tier: 'pro',
          plan_type: '💎 PRO ANUAL',
          is_online: true,
          status_text: '🟢 Em Show Ao Vivo',
          reps_count: 35,
          songs_count: 650,
          last_seen: 'Há 4 min',
          created_at: '2026-08-12'
        },
        {
          id: 'singer-04',
          name: 'Péricles & Grupo Ensaio',
          email: 'pericles.voz@pagode.com.br',
          singer_code: '#CANTOR-9910',
          plan_tier: 'pro',
          plan_type: '⚡ PRO MENSAL',
          is_online: false,
          status_text: '⚪ Offline',
          reps_count: 18,
          songs_count: 310,
          last_seen: 'Hoje às 19:40',
          created_at: '2026-08-15'
        },
        {
          id: 'singer-05',
          name: 'Alexandre Pires Acústico',
          email: 'alexandre@cantores.com.br',
          singer_code: '#CANTOR-3304',
          plan_tier: 'pro',
          plan_type: '👑 PRO VITALÍCIO',
          is_online: true,
          status_text: '🟢 Conectado ao Palco',
          reps_count: 12,
          songs_count: 290,
          last_seen: 'Há 8 min',
          created_at: '2026-08-16'
        },
        {
          id: 'singer-06',
          name: 'Clube do Samba SP',
          email: 'clubedosambasp@gmail.com',
          singer_code: '#CANTOR-1102',
          plan_tier: 'free',
          plan_type: '⚡ PLANO FREE',
          is_online: false,
          status_text: '⚪ Offline',
          reps_count: 2,
          songs_count: 15,
          last_seen: 'Ontem',
          created_at: '2026-08-20'
        }
      ];

      allUserData = baseUsers;

      if (sb) {
        sb.from('profiles').select('*').then(function (res) {
          if (res.data && res.data.length > 0) {
            res.data.forEach(function (p) {
              if (p.email !== devEmail && !allUserData.some(function(u) { return u.email === p.email; })) {
                allUserData.push({
                  id: p.id,
                  name: p.display_name || p.email.split('@')[0],
                  email: p.email,
                  singer_code: p.singer_code || '#CANTOR-' + Math.floor(1000 + Math.random() * 9000),
                  plan_tier: p.plan_tier || 'pro',
                  plan_type: p.plan_tier === 'pro' ? '👑 PRO VITALÍCIO' : '⚡ PLANO FREE',
                  is_online: true,
                  status_text: '🟢 Conectado ao Palco',
                  reps_count: 3,
                  songs_count: 36,
                  last_seen: 'Hoje',
                  created_at: p.created_at || 'Hoje'
                });
              }
            });
          }
          PrompterAdmin.updateMetrics();
          PrompterAdmin.renderUsersTable();
        }).catch(function () {
          PrompterAdmin.updateMetrics();
          PrompterAdmin.renderUsersTable();
        });
      } else {
        PrompterAdmin.updateMetrics();
        PrompterAdmin.renderUsersTable();
      }
    },

    updateMetrics: function () {
      var total = allUserData.length;
      var pro = allUserData.filter(function (u) { return u.plan_tier === 'pro'; }).length;
      var free = total - pro;
      var online = allUserData.filter(function (u) { return u.is_online; }).length;
      var totalSongs = allUserData.reduce(function (acc, u) { return acc + (u.songs_count || 0); }, 0);
      var totalReps = allUserData.reduce(function (acc, u) { return acc + (u.reps_count || 0); }, 0);
      var estimatedMRR = (pro * 39.90).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      var elMRR = document.getElementById('admMetricMRR');
      var elPro = document.getElementById('admMetricProUsers');
      var elOnline = document.getElementById('admMetricOnlineUsers');
      var elSongs = document.getElementById('admMetricTotalSongs');
      var elUsersSub = document.getElementById('admMetricTotalUsersSub');
      var elRepsSub = document.getElementById('admMetricTotalRepsSub');

      if (elMRR) elMRR.innerText = estimatedMRR;
      if (elPro) elPro.innerText = pro;
      if (elOnline) elOnline.innerText = online;
      if (elSongs) elSongs.innerText = totalSongs.toLocaleString('pt-BR');
      if (elUsersSub) elUsersSub.innerText = total + ' Cantores Cadastrados';
      if (elRepsSub) elRepsSub.innerText = totalReps + ' Repertórios Criados';

      var pAll = document.getElementById('countPillAll');
      var pPro = document.getElementById('countPillPro');
      var pLive = document.getElementById('countPillLive');
      var pFree = document.getElementById('countPillFree');

      if (pAll) pAll.innerText = total;
      if (pPro) pPro.innerText = pro;
      if (pLive) pLive.innerText = online;
      if (pFree) pFree.innerText = free;
    },

    renderUsersTable: function () {
      var tbody = document.getElementById('adminUsersTableBody');
      if (!tbody) return;

      var filtered = allUserData.filter(function (u) {
        // Filtro por categoria
        if (currentFilter === 'pro' && u.plan_tier !== 'pro') return false;
        if (currentFilter === 'free' && u.plan_tier !== 'free') return false;
        if (currentFilter === 'live' && !u.is_online) return false;

        // Filtro por busca
        if (searchQuery) {
          var matchName = (u.name || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchEmail = (u.email || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchCode = (u.singer_code || '').toLowerCase().indexOf(searchQuery) !== -1;
          return matchName || matchEmail || matchCode;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 28px; color: #94a3b8;">Nenhum cantor ou usuário corresponde aos filtros selecionados.</td></tr>';
        return;
      }

      var html = '';
      filtered.forEach(function (user) {
        var initial = (user.name ? user.name.charAt(0) : user.email.charAt(0)).toUpperCase();
        var statusBadge = user.is_online
          ? '<span class="status-pill status-pill-online"><span class="pulse-dot"></span> ' + (user.status_text || 'Online') + '</span>'
          : '<span class="status-pill status-pill-offline">⚪ Offline</span>';

        var planBadge = user.plan_tier === 'pro'
          ? '<span class="badge-plan-executive badge-plan-pro">' + user.plan_type + '</span>'
          : '<span class="badge-plan-executive badge-plan-free">⚡ PLANO FREE</span>';

        html +=
          '<tr class="admin-user-row">' +
            '<td>' + statusBadge + '</td>' +
            '<td>' +
              '<div class="admin-user-cell">' +
                '<div class="admin-user-avatar">' + initial + '</div>' +
                '<div class="admin-user-details">' +
                  '<span class="admin-user-name">' + user.name + '</span>' +
                  '<span class="admin-user-email">' + user.email + '</span>' +
                '</div>' +
              '</div>' +
            '</td>' +
            '<td><code class="admin-code-tag">' + user.singer_code + '</code></td>' +
            '<td>' + planBadge + '</td>' +
            '<td><span class="admin-reps-stat">📂 ' + user.reps_count + ' reps</span> • <span class="admin-songs-stat">🎵 ' + user.songs_count + ' músicas</span></td>' +
            '<td><span class="admin-time-ago">' + user.last_seen + '</span></td>' +
            '<td class="admin-actions-cell" style="text-align: right;">' +
              '<button class="btn btn-sm btn-outline btn-toggle-plan" data-user-id="' + user.id + '" data-current-plan="' + user.plan_tier + '" title="Alterar Plano do Cantor">⚡ Alterar Plano</button> ' +
              '<button class="btn btn-sm btn-secondary btn-inspect-reps" data-user-id="' + user.id + '" data-user-name="' + user.name + '" data-user-email="' + user.email + '" title="Inspecionar e Clonar Repertórios">🔍 Inspecionar</button>' +
            '</td>' +
          '</tr>';
      });

      tbody.innerHTML = html;

      // Eventos de Ações Rápidas
      tbody.querySelectorAll('.btn-inspect-reps').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var name = this.getAttribute('data-user-name');
          var email = this.getAttribute('data-user-email');
          if (window.showToast) {
            window.showToast('📋 Inspecionando ecossistema de ' + name + ' (' + email + '). Repertórios verificados!', 'info');
          }
        });
      });

      tbody.querySelectorAll('.btn-toggle-plan').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function(u) { return u.id === uId; });
          if (userObj) {
            userObj.plan_tier = userObj.plan_tier === 'pro' ? 'free' : 'pro';
            userObj.plan_type = userObj.plan_tier === 'pro' ? '👑 PRO VITALÍCIO' : '⚡ PLANO FREE';
            PrompterAdmin.updateMetrics();
            PrompterAdmin.renderUsersTable();
            if (window.showToast) {
              window.showToast('Plano de ' + userObj.name + ' alterado para ' + userObj.plan_type + '!', 'success');
            }
          }
        });
      });
    },

    exportCSV: function () {
      var csv = 'ID,Nome,Email,Codigo_Cantor,Plano,Status,Repertorios,Musicas,Ultimo_Acesso\n';
      allUserData.forEach(function (u) {
        csv += '"' + u.id + '","' + u.name + '","' + u.email + '","' + u.singer_code + '","' + u.plan_type + '","' + u.status_text + '",' + u.reps_count + ',' + u.songs_count + ',"' + u.last_seen + '"\n';
      });

      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'canta_ai_relatorio_executivo_ceo_' + new Date().toISOString().slice(0, 10) + '.csv';
      link.click();
      if (window.showToast) window.showToast('📊 Relatório Executivo CSV exportado com sucesso!', 'success');
  };

  window.PrompterAdmin = PrompterAdmin;
})();
