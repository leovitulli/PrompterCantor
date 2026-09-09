/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANTAAÍ PRO — NOTIFICATIONS & INTERACTIVE CHAT CENTER (FRONTEND ARCHITECTURE)
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsibilities:
 * 1. UI Layer: Popover rápido no header & Central Modal de Chat/Comunicados
 * 2. Logic Layer: Controle de estado, visualização Admin vs Cantor, threads de diálogo
 * 3. Data Layer: Varredura e sincronização bidirecional na nuvem (Supabase REST + LocalStorage)
 */

(function (window, document) {
  'use strict';

  var SYSTEM_REGISTRY_REPERTOIRE_ID = '3e42c00c-f10c-4b05-96b6-b782403d1d17';

  var NotificationsCenter = {
    state: {
      activeTab: 'announcements', // 'announcements' | 'chat'
      activeTicketId: null,
      popoverFilter: 'all',       // 'all' | 'unread' | 'chat'
      adminViewMode: 'all',       // 'all' | 'my_only' (para administradores)
      isPopoverOpen: false,
      isModalOpen: false,
      isSyncingCloud: false,
      draftImageBase64: '',
      newTicketImageBase64: ''
    },

    // ── HELPERS & UTILITIES ──
    escapeHtml: function (str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    formatRelativeTime: function (isoDate) {
      if (!isoDate) return 'Recente';
      var d = new Date(isoDate);
      if (isNaN(d.getTime())) return 'Recente';
      var diffMs = Date.now() - d.getTime();
      var diffSec = Math.floor(diffMs / 1000);
      var diffMin = Math.floor(diffSec / 60);
      var diffHours = Math.floor(diffMin / 60);
      var diffDays = Math.floor(diffHours / 24);

      if (diffSec < 60) return 'Agora';
      if (diffMin < 60) return diffMin + ' min atrás';
      if (diffHours < 24) return diffHours + 'h atrás';
      if (diffDays === 1) return 'Ontem';
      if (diffDays < 7) return diffDays + 'd atrás';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    },

    getCurrentUserContext: function () {
      var user = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var profile = window.PrompterAuth ? window.PrompterAuth.getProfile() : null;
      var email = ((profile && profile.email) || (user && user.email) || '').trim().toLowerCase();
      var name = ((profile && profile.display_name) || (user && user.user_metadata && user.user_metadata.full_name) || (email ? email.split('@')[0] : 'Cantor'));
      var singerCode = ((profile && profile.singer_code) || '').trim().toLowerCase();

      var isAdmin = (window.PrompterAuth && window.PrompterAuth.isAdmin && window.PrompterAuth.isAdmin()) ||
                    (email === 'leovitulli@gmail.com') ||
                    (profile && (profile.role === 'admin' || profile.email === 'leovitulli@gmail.com')) ||
                    (user && user.email === 'leovitulli@gmail.com');

      return {
        user: user,
        profile: profile,
        email: email,
        name: name,
        singerCode: singerCode,
        isAdmin: !!isAdmin
      };
    },

    // ── DATA ACCESS & NORMALIZATION ──
    getAnnouncements: function () {
      var raw = localStorage.getItem('canta_ai_admin_announcements');
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      var ctx = this.getCurrentUserContext();

      return list.filter(function (a) {
        if (!a || !a.target) return false;
        var t = String(a.target).trim().toLowerCase();
        if (t === 'all') return true;
        if (ctx.email && t === ctx.email) return true;
        if (ctx.singerCode && (t === ctx.singerCode || t === ctx.singerCode.replace('@', ''))) return true;
        return false;
      });
    },

    getReadAnnouncementIds: function () {
      try {
        var raw = localStorage.getItem('cantaai_read_announcements');
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },

    getReadSupportMessageIds: function () {
      try {
        var raw = localStorage.getItem('cantaai_read_support_messages');
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },

    getTickets: function () {
      var raw = localStorage.getItem('canta_ai_support_tickets');
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      var ctx = this.getCurrentUserContext();

      // Normaliza cada ticket para formato thread de chat
      var self = this;
      var normalized = list.map(function (t) {
        return self.normalizeTicket(t);
      }).filter(Boolean);

      // Se for administrador, por padrão vê todas as conversas dos cantores
      if (ctx.isAdmin) {
        if (self.state.adminViewMode === 'my_only') {
          return normalized.filter(function (t) {
            return t.user_email && t.user_email.toLowerCase() === ctx.email;
          });
        }
        return normalized;
      }

      // Se for cantor comum, exibe apenas os seus próprios chamados
      return normalized.filter(function (t) {
        return !ctx.email || (t.user_email && t.user_email.toLowerCase() === ctx.email);
      });
    },

    saveAllTickets: function (updatedUserTickets) {
      var raw = localStorage.getItem('canta_ai_support_tickets');
      var allTickets = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(allTickets)) allTickets = [];

      // Atualiza ou insere na lista global do localStorage
      updatedUserTickets.forEach(function (ut) {
        var idx = allTickets.findIndex(function (x) { return x.id === ut.id; });
        if (idx >= 0) {
          allTickets[idx] = ut;
        } else {
          allTickets.unshift(ut);
        }
      });

      localStorage.setItem('canta_ai_support_tickets', JSON.stringify(allTickets));
    },

    normalizeTicket: function (t) {
      if (!t) return null;
      var copy = Object.assign({}, t);

      if (!copy.messages || !Array.isArray(copy.messages) || copy.messages.length === 0) {
        copy.messages = [];

        // Mensagem inicial criada pelo cantor
        if (copy.description || copy.title) {
          copy.messages.push({
            id: (copy.id || 'msg') + '-m0',
            sender: 'user',
            sender_name: copy.user_name || 'Cantor',
            text: copy.description || copy.title,
            image_url: copy.image_url || '',
            created_at: copy.created_at || new Date().toISOString()
          });
        }

        // Resposta legada do suporte caso já existisse
        if (copy.reply) {
          copy.messages.push({
            id: (copy.id || 'msg') + '-m1',
            sender: 'support',
            sender_name: 'Equipe CantaAí',
            text: copy.reply,
            image_url: '',
            created_at: copy.replied_at || copy.created_at || new Date().toISOString()
          });
        }
      }

      // Garante status válido
      if (!copy.status) {
        copy.status = copy.reply ? 'resolved' : 'open';
      }

      return copy;
    },

    // ── SINCRONIZAÇÃO BIDIRECIONAL NA NUVEM (SUPABASE REST) ──
    fetchFromCloud: function (callback) {
      if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.key) {
        if (callback) callback();
        return;
      }

      var self = this;
      self.state.isSyncingCloud = true;

      var syncStatus = document.getElementById('ncAutoSyncStatus');
      if (syncStatus) {
        syncStatus.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#fbbf24;display:inline-block;"></span> Sincronizando...';
      }

      var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1';
      var headers = {
        'apikey': window.SUPABASE_CONFIG.key,
        'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.key,
        'Content-Type': 'application/json'
      };

      // 1. Busca chamados gravados na tabela songs (artist = USER_SUPPORT_TICKET ou SUPPORT_REPLY)
      var pSongs = fetch(baseUrl + '/songs?artist=in.(USER_SUPPORT_TICKET,SUPPORT_REPLY)&order=created_at.desc', { headers: headers })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });

      // 2. Busca comunicados oficiais em songs (artist = SYSTEM_ANNOUNCEMENT)
      var pAnn = fetch(baseUrl + '/songs?repertoire_id=eq.' + encodeURIComponent(SYSTEM_REGISTRY_REPERTOIRE_ID) + '&artist=eq.SYSTEM_ANNOUNCEMENT&order=id.desc', { headers: headers })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });

      // 3. Fallback tabela tickets nativa
      var pTicketsTable = fetch(baseUrl + '/tickets?select=*&order=created_at.desc', { headers: headers })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });

      Promise.all([pSongs, pAnn, pTicketsTable]).then(function (results) {
        var songTickets = results[0] || [];
        var songAnn = results[1] || [];
        var rawTickets = results[2] || [];

        // ── Processa Comunicados ──
        var rawAnnLocal = localStorage.getItem('canta_ai_admin_announcements');
        var annList = rawAnnLocal ? JSON.parse(rawAnnLocal) : [];
        if (!Array.isArray(annList)) annList = [];

        songAnn.forEach(function (row) {
          try {
            if (row.content) {
              var a = JSON.parse(row.content);
              if (a && a.id && !annList.some(function (m) { return m.id === a.id; })) {
                annList.push(a);
              }
            }
          } catch (e) {}
        });
        annList.sort(function (a, b) {
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(annList));

        // ── Processa Chamados / Tickets ──
        var rawTkLocal = localStorage.getItem('canta_ai_support_tickets');
        var localTickets = rawTkLocal ? JSON.parse(rawTkLocal) : [];
        if (!Array.isArray(localTickets)) localTickets = [];

        var cloudTickets = [];

        // Extrai de songs
        songTickets.forEach(function (row) {
          try {
            if (row.content) {
              var parsed = JSON.parse(row.content);
              if (parsed && (parsed.id || parsed.title)) {
                // Se o JSON não tiver id explícito, usa id da linha
                if (!parsed.id) parsed.id = row.id;
                cloudTickets.push(parsed);
              }
            }
          } catch (e) {}
        });

        // Extrai da tabela tickets
        rawTickets.forEach(function (t) {
          if (t && (t.id || t.title)) cloudTickets.push(t);
        });

        // Merge com deduplicação profunda
        cloudTickets.forEach(function (cTicket) {
          var normCloud = self.normalizeTicket(cTicket);
          var existingIdx = localTickets.findIndex(function (x) { return x.id === normCloud.id; });
          if (existingIdx >= 0) {
            var existing = self.normalizeTicket(localTickets[existingIdx]);
            // Junta as mensagens sem duplicar por ID ou texto idêntico
            var mergedMsgs = [].concat(existing.messages || []);
            (normCloud.messages || []).forEach(function (nm) {
              if (!mergedMsgs.some(function (em) { return em.id === nm.id || (em.text === nm.text && em.created_at === nm.created_at); })) {
                mergedMsgs.push(nm);
              }
            });
            mergedMsgs.sort(function (m1, m2) {
              return new Date(m1.created_at || 0) - new Date(m2.created_at || 0);
            });

            normCloud.messages = mergedMsgs;
            if (normCloud.reply || existing.reply) {
              normCloud.reply = normCloud.reply || existing.reply;
              normCloud.replied_at = normCloud.replied_at || existing.replied_at;
            }
            localTickets[existingIdx] = normCloud;
          } else {
            localTickets.unshift(normCloud);
          }
        });

        // Ordena com o chamado atualizado mais recente no topo
        localTickets.sort(function (t1, t2) {
          var d1 = new Date(t1.updated_at || t1.created_at || 0).getTime();
          var d2 = new Date(t2.updated_at || t2.created_at || 0).getTime();
          return d2 - d1;
        });

        localStorage.setItem('canta_ai_support_tickets', JSON.stringify(localTickets));

        self.state.isSyncingCloud = false;
        var nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        var syncStatus2 = document.getElementById('ncAutoSyncStatus');
        if (syncStatus2) {
          syncStatus2.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#34d399;display:inline-block;animation:nc-pulse 2s infinite;"></span> Auto-sync &bull; ' + nowStr;
        }

        self.updateBadges();

        if (self.state.isPopoverOpen) {
          self.renderPopover();
        }
        if (self.state.isModalOpen) {
          if (self.state.activeTab === 'chat') self.renderChatLayout();
          else self.renderAnnouncements();
        }

        if (callback) callback(null, localTickets);
      }).catch(function (err) {
        self.state.isSyncingCloud = false;
        var syncStatusErr = document.getElementById('ncAutoSyncStatus');
        if (syncStatusErr) {
          syncStatusErr.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;"></span> Offline';
        }
        if (callback) callback(err);
      });
    },

    syncTicketToCloud: function (ticket) {
      if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.key) return;

      var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1';
      var headers = {
        'apikey': window.SUPABASE_CONFIG.key,
        'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.key,
        'Content-Type': 'application/json'
      };

      // Estratégia UPSERT:
      // 1. Usa composer = 'TICKET:' + ticket.id como chave única
      // 2. Busca se a row já existe
      // 3. Se sim: PATCH (atualiza content com ticket completo)
      // 4. Se não: POST (cria a row)
      // → Garante 1 row por ticket no Supabase, sempre com mensagens mais recentes

      var uniqueComposer = 'TICKET:' + (ticket.id || '');
      var rowContent = JSON.stringify(ticket);

      // Busca row existente por composer único
      fetch(baseUrl + '/songs?artist=eq.USER_SUPPORT_TICKET&composer=eq.' + encodeURIComponent(uniqueComposer) + '&limit=1', {
        headers: headers
      }).then(function(r) {
        return r.ok ? r.json() : [];
      }).then(function(existing) {
        if (existing && existing.length > 0) {
          // PATCH na row existente
          var rowId = existing[0].id;
          fetch(baseUrl + '/songs?id=eq.' + encodeURIComponent(rowId), {
            method: 'PATCH',
            headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify({ content: rowContent, updated_at: new Date().toISOString() })
          }).catch(function() {});
        } else {
          // INSERT nova row
          fetch(baseUrl + '/songs', {
            method: 'POST',
            headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify([{
              repertoire_id: SYSTEM_REGISTRY_REPERTOIRE_ID,
              title: '\uD83D\uDCAC SUPORTE CHAT: ' + (ticket.title || 'Chamado'),
              artist: 'USER_SUPPORT_TICKET',
              composer: uniqueComposer,
              content: rowContent
            }])
          }).catch(function() {});
        }
      }).catch(function() {});
    },

    // ── BADGE COUNTER CALCULATOR ──
    calculateUnread: function () {
      var readAnnIds = this.getReadAnnouncementIds();
      var readMsgIds = this.getReadSupportMessageIds();
      var ctx = this.getCurrentUserContext();

      // 1. Comunicados não lidos
      var annList = this.getAnnouncements();
      var unreadAnn = annList.filter(function (a) {
        return a && a.id && readAnnIds.indexOf(a.id) === -1;
      });

      // 2. Mensagens do suporte não lidas (ou novas mensagens de cantores se for admin)
      var tickets = this.getTickets();
      var unreadRepliesCount = 0;
      var unreadReplyTickets = [];

      tickets.forEach(function (t) {
        if (t.messages && t.messages.length > 0) {
          var hasUnread = false;
          t.messages.forEach(function (m) {
            // Para o cantor comum, notificações são mensagens do suporte
            // Para o admin, notificações são mensagens enviadas pelos cantores
            var isTargetUnread = ctx.isAdmin
              ? (m.sender === 'user' && readMsgIds.indexOf(m.id) === -1 && t.user_email !== ctx.email)
              : (m.sender === 'support' && readMsgIds.indexOf(m.id) === -1);

            if (isTargetUnread) {
              hasUnread = true;
              unreadRepliesCount++;
            }
          });
          if (hasUnread) {
            unreadReplyTickets.push(t);
          }
        }
      });

      var total = unreadAnn.length + unreadRepliesCount;

      return {
        total: total,
        unreadAnnouncements: unreadAnn,
        unreadRepliesCount: unreadRepliesCount,
        unreadReplyTickets: unreadReplyTickets
      };
    },

    updateBadges: function () {
      var counts = this.calculateUnread();

      // Badge no botão do cabeçalho
      var badgeHeader = document.getElementById('headerNotificationBadge');
      if (badgeHeader) {
        if (counts.total > 0) {
          badgeHeader.innerText = counts.total;
          badgeHeader.classList.remove('hidden');
        } else {
          badgeHeader.classList.add('hidden');
        }
      }

      // Badge no menu de perfil do cantor
      var badgeProfile = document.getElementById('profileNotificationBadge');
      if (badgeProfile) {
        if (counts.total > 0) {
          badgeProfile.innerText = counts.total + ' novo' + (counts.total !== 1 ? 's' : '');
          badgeProfile.classList.remove('hidden');
        } else {
          badgeProfile.classList.add('hidden');
        }
      }

      // Badge do Popover
      var popBadge = document.getElementById('notifPopBadge');
      if (popBadge) {
        popBadge.innerText = counts.total > 0 ? counts.total + ' não lida' + (counts.total !== 1 ? 's' : '') : 'Tudo lido';
        popBadge.style.display = counts.total > 0 ? 'inline-block' : 'none';
      }

      // Badges das abas do modal
      var tabAnnBadge = document.getElementById('scTabAnnBadge');
      if (tabAnnBadge) {
        if (counts.unreadAnnouncements.length > 0) {
          tabAnnBadge.innerText = counts.unreadAnnouncements.length;
          tabAnnBadge.style.display = 'inline-block';
        } else {
          tabAnnBadge.style.display = 'none';
        }
      }

      var tabChatBadge = document.getElementById('scTabChatBadge');
      if (tabChatBadge) {
        if (counts.unreadRepliesCount > 0) {
          tabChatBadge.innerText = counts.unreadRepliesCount;
          tabChatBadge.style.display = 'inline-block';
        } else {
          tabChatBadge.style.display = 'none';
        }
      }
    },

    // ── POPOVER RÁPIDO DO CABEÇALHO ──
    togglePopover: function () {
      if (this.state.isPopoverOpen) {
        this.closePopover();
      } else {
        this.openPopover();
      }
    },

    openPopover: function () {
      var pop = document.getElementById('notificationsQuickPopover');
      if (!pop) return;

      // Fecha dropdown de perfil se estiver aberto
      var userProfileMenu = document.getElementById('userProfileMenu');
      if (userProfileMenu) userProfileMenu.classList.add('hidden');

      this.state.isPopoverOpen = true;
      pop.classList.remove('hidden');
      this.renderPopover();

      // Atualiza da nuvem em segundo plano
      this.fetchFromCloud();
    },

    closePopover: function () {
      var pop = document.getElementById('notificationsQuickPopover');
      if (pop) pop.classList.add('hidden');
      this.state.isPopoverOpen = false;
    },

    renderPopover: function () {
      var container = document.getElementById('notifPopList');
      if (!container) return;

      var readAnnIds = this.getReadAnnouncementIds();
      var readMsgIds = this.getReadSupportMessageIds();
      var filter = this.state.popoverFilter;
      var ctx = this.getCurrentUserContext();

      // Coleta todos os itens para o feed
      var feedItems = [];

      // 1. Comunicados
      if (filter !== 'chat') {
        var annList = this.getAnnouncements();
        annList.forEach(function (a) {
          var isRead = readAnnIds.indexOf(a.id) !== -1;
          if (filter === 'unread' && isRead) return;

          var iconType = '📢';
          var iconClass = '';
          if (a.type === 'alert') { iconType = '⚠️'; iconClass = 'icon-alert'; }
          else if (a.type === 'update') { iconType = '🚀'; iconClass = 'icon-update'; }
          else if (a.type === 'feature' || a.type === 'promo') { iconType = '🎉'; iconClass = 'icon-update'; }

          feedItems.push({
            type: 'announcement',
            id: a.id,
            title: a.title || 'Comunicado Oficial',
            snippet: a.message || '',
            date: a.created_at || new Date().toISOString(),
            isRead: isRead,
            icon: iconType,
            iconClass: iconClass
          });
        });
      }

      // 2. Chamados & Mensagens
      if (filter !== 'announcements') {
        var tickets = this.getTickets();
        tickets.forEach(function (t) {
          var lastMsg = (t.messages && t.messages.length > 0) ? t.messages[t.messages.length - 1] : null;
          var hasUnread = false;

          if (t.messages) {
            t.messages.forEach(function (m) {
              var isTargetUnread = ctx.isAdmin
                ? (m.sender === 'user' && readMsgIds.indexOf(m.id) === -1 && t.user_email !== ctx.email)
                : (m.sender === 'support' && readMsgIds.indexOf(m.id) === -1);
              if (isTargetUnread) hasUnread = true;
            });
          }

          var isRead = !hasUnread;
          if (filter === 'unread' && isRead) return;

          var iconType = hasUnread ? '💬' : '📩';
          var titlePrefix = hasUnread ? 'Nova Mensagem: ' : 'Atendimento: ';
          if (ctx.isAdmin && t.user_name) {
            titlePrefix += '[' + t.user_name + '] ';
          }

          feedItems.push({
            type: 'ticket',
            id: t.id,
            title: titlePrefix + (t.title || 'Chamado de Suporte'),
            snippet: lastMsg ? lastMsg.text : (t.description || ''),
            date: (lastMsg && lastMsg.created_at) ? lastMsg.created_at : (t.created_at || new Date().toISOString()),
            isRead: isRead,
            icon: iconType,
            iconClass: hasUnread ? 'icon-reply' : ''
          });
        });
      }

      // Ordenação cronológica (mais recente primeiro)
      feedItems.sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      if (feedItems.length === 0) {
        container.innerHTML =
          '<div class="notif-pop-empty">' +
            '<span class="notif-pop-empty-icon">🔔</span>' +
            '<span class="notif-pop-empty-text">Nenhuma notificação encontrada</span>' +
            '<span class="notif-pop-empty-sub">Você está em dia com todas as novidades!</span>' +
          '</div>';
        return;
      }

      var self = this;
      var html = '';
      feedItems.forEach(function (item) {
        html +=
          '<div class="notif-pop-item ' + (!item.isRead ? 'is-unread' : '') + '" data-type="' + item.type + '" data-id="' + self.escapeHtml(item.id) + '">' +
            '<div class="notif-pop-icon-box ' + item.iconClass + '">' + item.icon + '</div>' +
            '<div class="notif-pop-content">' +
              '<div class="notif-pop-top">' +
                '<span class="notif-pop-item-title">' + self.escapeHtml(item.title) + '</span>' +
                '<span class="notif-pop-item-time">' + self.formatRelativeTime(item.date) + '</span>' +
              '</div>' +
              '<div class="notif-pop-item-snippet">' + self.escapeHtml(item.snippet) + '</div>' +
            '</div>' +
          '</div>';
      });

      container.innerHTML = html;

      // Evento de clique no item do Popover
      container.querySelectorAll('.notif-pop-item').forEach(function (el) {
        el.addEventListener('click', function () {
          var type = this.getAttribute('data-type');
          var id = this.getAttribute('data-id');

          self.closePopover();

          if (type === 'ticket') {
            self.openModal('chat', id);
          } else {
            self.markAnnouncementRead(id);
            self.openModal('announcements');
          }
        });
      });
    },

    markAllAsRead: function () {
      // 1. Marca todos comunicados como lidos
      var annList = this.getAnnouncements();
      var readAnnIds = this.getReadAnnouncementIds();
      annList.forEach(function (a) {
        if (a && a.id && readAnnIds.indexOf(a.id) === -1) {
          readAnnIds.push(a.id);
        }
      });
      localStorage.setItem('cantaai_read_announcements', JSON.stringify(readAnnIds));

      // 2. Marca todas as mensagens como lidas
      var tickets = this.getTickets();
      var readMsgIds = this.getReadSupportMessageIds();
      tickets.forEach(function (t) {
        if (t.messages) {
          t.messages.forEach(function (m) {
            if (readMsgIds.indexOf(m.id) === -1) {
              readMsgIds.push(m.id);
            }
          });
        }
      });
      localStorage.setItem('cantaai_read_support_messages', JSON.stringify(readMsgIds));

      this.updateBadges();
      this.renderPopover();

      if (this.state.isModalOpen) {
        this.renderAnnouncements();
        this.renderChatLayout();
      }

      if (window.showToast) window.showToast('Todas as notificações foram marcadas como lidas.', 'info');
    },

    markAnnouncementRead: function (id) {
      if (!id) return;
      var readIds = this.getReadAnnouncementIds();
      if (readIds.indexOf(id) === -1) {
        readIds.push(id);
        localStorage.setItem('cantaai_read_announcements', JSON.stringify(readIds));
        this.updateBadges();
      }
    },

    markTicketMessagesAsRead: function (ticket) {
      if (!ticket || !ticket.messages) return;
      var readMsgIds = this.getReadSupportMessageIds();
      var changed = false;

      ticket.messages.forEach(function (m) {
        if (readMsgIds.indexOf(m.id) === -1) {
          readMsgIds.push(m.id);
          changed = true;
        }
      });

      if (changed) {
        localStorage.setItem('cantaai_read_support_messages', JSON.stringify(readMsgIds));
        this.updateBadges();
      }
    },

    // ── CENTRAL DE ATENDIMENTO (MODAL PRINCIPAL) ──
    openModal: function (tabName, ticketId) {
      var modal = document.getElementById('userSupportModal');
      if (!modal) return;

      this.closePopover();
      var userProfileMenu = document.getElementById('userProfileMenu');
      if (userProfileMenu) userProfileMenu.classList.add('hidden');

      this.state.isModalOpen = true;
      modal.classList.remove('hidden');

      if (ticketId) {
        this.state.activeTicketId = ticketId;
      }

      this.switchTab(tabName || 'announcements');

      // Sempre busca novidades da nuvem ao abrir a Central
      this.fetchFromCloud();
    },

    closeModal: function () {
      var modal = document.getElementById('userSupportModal');
      if (modal) modal.classList.add('hidden');
      this.state.isModalOpen = false;
      this.updateBadges();
    },

    switchTab: function (tabName) {
      this.state.activeTab = tabName;

      var tabAnn = document.getElementById('scTabBtnAnnouncements');
      var tabChat = document.getElementById('scTabBtnChat');
      var paneAnn = document.getElementById('scPaneAnnouncements');
      var paneChat = document.getElementById('scPaneChat');

      if (tabName === 'chat') {
        if (tabAnn) tabAnn.classList.remove('active');
        if (tabChat) tabChat.classList.add('active');
        if (paneAnn) paneAnn.classList.add('hidden');
        if (paneChat) paneChat.classList.remove('hidden');
        this.renderChatLayout();
      } else {
        if (tabAnn) tabAnn.classList.add('active');
        if (tabChat) tabChat.classList.remove('active');
        if (paneAnn) paneAnn.classList.remove('hidden');
        if (paneChat) paneChat.classList.add('hidden');
        this.renderAnnouncements();
      }

      this.updateBadges();
    },

    // ── RENDERIZAÇÃO DE COMUNICADOS (ABA 1) ──
    renderAnnouncements: function () {
      var container = document.getElementById('scAnnouncementsList');
      if (!container) return;

      var annList = this.getAnnouncements();
      var readIds = this.getReadAnnouncementIds();

      if (!annList || annList.length === 0) {
        container.innerHTML =
          '<div style="text-align: center; padding: 40px 20px; color: #94a3b8; background: rgba(15, 23, 42, 0.4); border-radius: 14px; border: 1px dashed rgba(255, 255, 255, 0.08);">' +
            '<span style="font-size: 2rem; display: block; margin-bottom: 8px;">📢</span>' +
            '<strong style="color: #f8fafc; font-size: 1rem;">Nenhum comunicado oficial no momento</strong><br>' +
            '<span style="font-size: 0.85rem;">Quando nossa equipe publicar avisos importantes ou novidades, você poderá consultar aqui a qualquer momento.</span>' +
          '</div>';
        return;
      }

      var self = this;
      var html = '';
      annList.forEach(function (a) {
        var isRead = readIds.indexOf(a.id) !== -1;
        var dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente';
        var isDirect = a.target && a.target !== 'all';

        var tagTarget = isDirect
          ? '<span class="sc-ann-tag sc-ann-tag-direct">🎯 Direcionado para Você</span>'
          : '<span class="sc-ann-tag sc-ann-tag-broadcast">📢 Para Todos os Cantores</span>';

        var typeTag = '<span class="sc-ann-tag sc-ann-tag-default">ℹ️ Informação Geral</span>';
        if (a.type === 'update') typeTag = '<span class="sc-ann-tag" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">🚀 Nova Atualização</span>';
        if (a.type === 'feature' || a.type === 'promo') typeTag = '<span class="sc-ann-tag" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">🎉 Benefício / Novidade</span>';
        if (a.type === 'alert') typeTag = '<span class="sc-ann-tag" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">⚠️ Alerta Importante</span>';

        var markBtn = isRead
          ? '<span style="color: #64748b; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">✓ Visualizado</span>'
          : '<button type="button" class="btn btn-outline btn-xs btn-read-ann" data-id="' + self.escapeHtml(a.id) + '" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer;">✓ Marcar como Lido</button>';

        html +=
          '<div class="sc-ann-card ' + (!isRead ? 'is-unread' : '') + '">' +
            '<div class="sc-ann-header">' +
              '<div class="sc-ann-tags">' +
                typeTag +
                tagTarget +
              '</div>' +
              '<div style="display: flex; align-items: center; gap: 10px;">' +
                '<span style="color: #64748b; font-size: 0.78rem;">' + dateStr + '</span>' +
                markBtn +
              '</div>' +
            '</div>' +
            '<h4 class="sc-ann-title">' + self.escapeHtml(a.title || 'Sem título') + '</h4>' +
            '<div class="sc-ann-body">' + self.escapeHtml(a.message || '') + '</div>' +
          '</div>';
      });

      container.innerHTML = html;

      // Eventos de clique para marcar como lido
      container.querySelectorAll('.btn-read-ann').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = this.getAttribute('data-id');
          self.markAnnouncementRead(id);
          self.renderAnnouncements();
        });
      });
    },

    // ── RENDERIZAÇÃO DO CHAT INTERATIVO (ABA 2) ──
    renderChatLayout: function () {
      var sidebarList = document.getElementById('scChatTicketsList');
      var mainArea = document.getElementById('scChatMainArea');
      var chatLayout = document.getElementById('scChatLayout');
      if (!sidebarList || !mainArea) return;

      var ctx = this.getCurrentUserContext();
      var tickets = this.getTickets();
      var readMsgIds = this.getReadSupportMessageIds();
      var self = this;

      // ── BARRA DE FILTRO ADMIN (TODOS OS CANTORES VS MEUS) ──
      var adminFilterContainer = document.getElementById('scAdminFilterBar');
      if (ctx.isAdmin) {
        var sidebarHeader = document.querySelector('.sc-chat-sidebar-header');
        if (sidebarHeader && !adminFilterContainer) {
          adminFilterContainer = document.createElement('div');
          adminFilterContainer.id = 'scAdminFilterBar';
          adminFilterContainer.style.display = 'flex';
          adminFilterContainer.style.gap = '6px';
          adminFilterContainer.style.marginTop = '4px';
          sidebarHeader.appendChild(adminFilterContainer);
        }

        if (adminFilterContainer) {
          adminFilterContainer.innerHTML =
            '<button type="button" class="btn btn-xs ' + (self.state.adminViewMode !== 'my_only' ? 'btn-primary' : 'btn-outline') + '" id="btnAdminViewAll" style="flex: 1; font-size: 0.72rem; padding: 4px 6px;">🌐 Todos os Cantores</button>' +
            '<button type="button" class="btn btn-xs ' + (self.state.adminViewMode === 'my_only' ? 'btn-primary' : 'btn-outline') + '" id="btnAdminViewMine" style="flex: 1; font-size: 0.72rem; padding: 4px 6px;">👤 Meus Chamados</button>';

          var bAll = document.getElementById('btnAdminViewAll');
          var bMine = document.getElementById('btnAdminViewMine');
          if (bAll) {
            bAll.addEventListener('click', function () {
              self.state.adminViewMode = 'all';
              self.renderChatLayout();
            });
          }
          if (bMine) {
            bMine.addEventListener('click', function () {
              self.state.adminViewMode = 'my_only';
              self.renderChatLayout();
            });
          }
        }
      } else if (adminFilterContainer) {
        adminFilterContainer.remove();
      }

      // Se nenhum ticket estiver selecionado e houver tickets, seleciona o primeiro
      if (!this.state.activeTicketId && tickets.length > 0) {
        this.state.activeTicketId = tickets[0].id;
      }

      // Renderiza itens da sidebar de chamados
      if (tickets.length === 0) {
        sidebarList.innerHTML =
          '<div style="padding: 24px 16px; text-align: center; color: #94a3b8; font-size: 0.82rem;">' +
            'Nenhuma conversa encontrada.<br>' +
            (ctx.isAdmin ? 'Clique em <strong>"🔄 Sincronizar"</strong> no topo para buscar da nuvem.' : 'Clique em <strong>"+ Iniciar Nova Conversa"</strong> acima para falar com a equipe.') +
          '</div>';
      } else {
        var sidebarHtml = '';
        tickets.forEach(function (t) {
          var isActive = t.id === self.state.activeTicketId;
          var lastMsg = (t.messages && t.messages.length > 0) ? t.messages[t.messages.length - 1] : null;

          // Verifica mensagens não lidas
          var hasUnread = false;
          if (t.messages) {
            t.messages.forEach(function (m) {
              var isTargetUnread = ctx.isAdmin
                ? (m.sender === 'user' && readMsgIds.indexOf(m.id) === -1 && t.user_email !== ctx.email)
                : (m.sender === 'support' && readMsgIds.indexOf(m.id) === -1);
              if (isTargetUnread) hasUnread = true;
            });
          }

          var statusClass = 'status-open';
          var statusText = '🟡 Aberto';
          if (t.status === 'resolved') {
            statusClass = 'status-resolved';
            statusText = '🟢 Resolvido';
          } else if (hasUnread) {
            statusClass = 'status-answered';
            statusText = ctx.isAdmin ? '🔵 Nova Msg Cantor' : '🔵 Nova Resposta';
          }

          var timeStr = self.formatRelativeTime((lastMsg && lastMsg.created_at) ? lastMsg.created_at : t.created_at);

          var singerBadge = (ctx.isAdmin && t.user_email)
            ? '<div style="font-size: 0.72rem; color: #38bdf8; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">👤 ' + self.escapeHtml(t.user_name || 'Cantor') + ' &lt;' + self.escapeHtml(t.user_email) + '&gt;</div>'
            : '';

          sidebarHtml +=
            '<div class="sc-chat-ticket-item ' + (isActive ? 'active' : '') + '" data-id="' + self.escapeHtml(t.id) + '">' +
              '<div class="sc-ticket-item-top">' +
                '<span class="sc-ticket-status-pill ' + statusClass + '">' + statusText + '</span>' +
                '<span class="sc-ticket-item-time">' + timeStr + '</span>' +
              '</div>' +
              singerBadge +
              '<div class="sc-ticket-item-title">' + self.escapeHtml(t.title || 'Conversa') + '</div>' +
              '<div class="sc-ticket-item-preview">' + (lastMsg ? self.escapeHtml(lastMsg.text) : 'Sem mensagens') + '</div>' +
            '</div>';
        });
        sidebarList.innerHTML = sidebarHtml;

        // Seleção de ticket ao clicar
        sidebarList.querySelectorAll('.sc-chat-ticket-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var tid = this.getAttribute('data-id');
            self.selectTicket(tid);
          });
        });
      }

      // Renderiza a thread ativa na área principal
      if (!this.state.activeTicketId || tickets.length === 0) {
        if (chatLayout) chatLayout.classList.remove('thread-open');
        this.renderNewTicketForm(mainArea);
      } else {
        var activeTicket = tickets.find(function (x) { return x.id === self.state.activeTicketId; });
        if (activeTicket) {
          if (chatLayout) chatLayout.classList.add('thread-open');
          this.markTicketMessagesAsRead(activeTicket);
          this.renderThreadView(mainArea, activeTicket);
        } else {
          this.renderNewTicketForm(mainArea);
        }
      }
    },

    selectTicket: function (ticketId) {
      this.state.activeTicketId = ticketId;
      this.renderChatLayout();
    },

    renderThreadView: function (container, ticket) {
      var self = this;
      var ctx = this.getCurrentUserContext();
      var catLabels = {
        'duvida': '❓ Dúvida',
        'problema': '🐛 Bug / Problema',
        'sugestao': '💡 Sugestão',
        'cifra': '🎵 Cifra / Tom',
        'faturamento': '💳 Assinatura',
        'outro': '📩 Outro'
      };

      var isResolved = ticket.status === 'resolved';

      var singerDetail = (ctx.isAdmin && ticket.user_email)
        ? ' • Cantor: <strong>' + self.escapeHtml(ticket.user_name || 'Cantor') + '</strong> &lt;' + self.escapeHtml(ticket.user_email) + '&gt;'
        : '';

      var headerHtml =
        '<div class="sc-thread-header">' +
          '<div class="sc-thread-title-area">' +
            '<button type="button" class="sc-btn-back-sidebar" id="btnBackToTicketsList" title="Voltar à lista">←</button>' +
            '<div>' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<h4 class="sc-thread-title">' + self.escapeHtml(ticket.title || 'Chamado de Atendimento') + '</h4>' +
                '<span class="sc-ticket-status-pill ' + (isResolved ? 'status-resolved' : 'status-open') + '">' +
                  (isResolved ? '🟢 Resolvido' : '🟡 Em Aberto') +
                '</span>' +
              '</div>' +
              '<div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">' +
                (catLabels[ticket.category] || '📩 Atendimento') + ' • Chamado #' + self.escapeHtml(ticket.id.slice(-6)) +
                singerDetail +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="sc-thread-actions">' +
            (!isResolved
              ? '<button type="button" id="btnMarkTicketResolved" class="btn btn-outline btn-xs" style="color: #34d399; border-color: rgba(52, 211, 153, 0.4); font-size: 0.76rem; border-radius: 6px; padding: 4px 10px;">✅ Marcar Resolvido</button>'
              : '<button type="button" id="btnReopenTicket" class="btn btn-outline btn-xs" style="color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); font-size: 0.76rem; border-radius: 6px; padding: 4px 10px;">🔄 Reabrir Conversa</button>') +
          '</div>' +
        '</div>';

      // Feed de Mensagens
      var messagesFeedHtml = '<div class="sc-thread-messages-feed" id="scChatMessagesFeed">';
      ticket.messages.forEach(function (msg) {
        var isUserMsg = msg.sender === 'user';
        var isOwnMessage = isUserMsg ? (!ctx.isAdmin || ticket.user_email === ctx.email) : (ctx.isAdmin && ticket.user_email !== ctx.email);

        var senderName = msg.sender_name || (isUserMsg ? (ticket.user_name || 'Cantor') : 'Equipe CantaAí');
        var avatarInitial = isUserMsg ? (senderName ? senderName.charAt(0).toUpperCase() : '🎤') : '⭐';
        var timeStr = self.formatRelativeTime(msg.created_at);

        var photoHtml = '';
        if (msg.image_url) {
          photoHtml =
            '<div class="chat-bubble-attachment">' +
              '<img src="' + msg.image_url + '" class="chat-attachment-img ticket-thumb-clickable" data-src="' + msg.image_url + '" alt="Anexo do chamado" title="Clique para ampliar">' +
            '</div>';
        }

        messagesFeedHtml +=
          '<div class="chat-bubble-row ' + (isOwnMessage ? 'is-user' : 'is-support') + '">' +
            '<div class="chat-bubble-avatar ' + (isUserMsg ? 'avatar-user' : 'avatar-support') + '">' + avatarInitial + '</div>' +
            '<div class="chat-bubble-body">' +
              '<div class="chat-bubble-meta">' +
                '<span class="chat-bubble-sender">' + self.escapeHtml(senderName) + '</span>' +
                (!isUserMsg ? '<span class="chat-bubble-badge-staff">Suporte Oficial</span>' : '') +
                '<span>• ' + timeStr + '</span>' +
              '</div>' +
              '<div class="chat-bubble-box">' +
                self.escapeHtml(msg.text || '') +
                photoHtml +
              '</div>' +
            '</div>' +
          '</div>';
      });
      messagesFeedHtml += '</div>';

      // Barra de Composição / Envio
      var placeholderText = (ctx.isAdmin && ticket.user_email !== ctx.email)
        ? 'Responder como Equipe CantaAí para ' + self.escapeHtml(ticket.user_name || 'o cantor') + '...'
        : 'Digite sua mensagem para a equipe... (Enter para enviar)';

      var composerHtml =
        '<div class="sc-chat-composer">' +
          '<div id="scComposerPreviewRow" class="sc-composer-attachment-preview hidden">' +
            '<img id="scComposerPreviewImg" class="sc-composer-attachment-img" src="" alt="Preview">' +
            '<span style="font-size: 0.75rem; color: #38bdf8;">Foto anexada</span>' +
            '<button type="button" id="btnRemoveComposerImg" style="background: transparent; border: none; color: #ef4444; font-weight: bold; cursor: pointer; padding: 2px 6px;">✕</button>' +
          '</div>' +
          '<div class="sc-composer-input-row">' +
            '<input type="file" id="scChatFileInput" accept="image/*" style="display: none;">' +
            '<button type="button" id="btnAttachChatPhoto" class="sc-composer-btn-attach" title="Anexar foto ou print de tela">📎</button>' +
            '<textarea id="scChatInputText" class="sc-composer-textarea" rows="1" placeholder="' + placeholderText + '"></textarea>' +
            '<button type="button" id="btnSendChatMessage" class="sc-composer-btn-send" title="Enviar Mensagem">➤</button>' +
          '</div>' +
        '</div>';

      container.innerHTML = headerHtml + messagesFeedHtml + composerHtml;

      // Scroll para o fim das mensagens
      var feed = document.getElementById('scChatMessagesFeed');
      if (feed) feed.scrollTop = feed.scrollHeight;

      // Eventos da Thread
      var btnBack = document.getElementById('btnBackToTicketsList');
      if (btnBack) {
        btnBack.addEventListener('click', function () {
          var chatLayout = document.getElementById('scChatLayout');
          if (chatLayout) chatLayout.classList.remove('thread-open');
        });
      }

      var btnResolve = document.getElementById('btnMarkTicketResolved');
      if (btnResolve) {
        btnResolve.addEventListener('click', function () {
          ticket.status = 'resolved';
          self.saveAllTickets([ticket]);
          self.syncTicketToCloud(ticket);
          self.renderChatLayout();
          if (window.showToast) window.showToast('Conversa marcada como resolvida!', 'success');
        });
      }

      var btnReopen = document.getElementById('btnReopenTicket');
      if (btnReopen) {
        btnReopen.addEventListener('click', function () {
          ticket.status = 'open';
          self.saveAllTickets([ticket]);
          self.syncTicketToCloud(ticket);
          self.renderChatLayout();
          if (window.showToast) window.showToast('Conversa reaberta com sucesso.', 'info');
        });
      }

      // Anexo de Foto
      var fileInput = document.getElementById('scChatFileInput');
      var btnAttach = document.getElementById('btnAttachChatPhoto');
      var previewRow = document.getElementById('scComposerPreviewRow');
      var previewImg = document.getElementById('scComposerPreviewImg');
      var btnRemoveImg = document.getElementById('btnRemoveComposerImg');

      self.state.draftImageBase64 = '';

      if (btnAttach && fileInput) {
        btnAttach.addEventListener('click', function () {
          fileInput.click();
        });

        fileInput.addEventListener('change', function (e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function (evt) {
            self.state.draftImageBase64 = evt.target.result;
            if (previewImg) previewImg.src = self.state.draftImageBase64;
            if (previewRow) previewRow.classList.remove('hidden');
          };
          reader.readAsDataURL(file);
        });
      }

      if (btnRemoveImg) {
        btnRemoveImg.addEventListener('click', function () {
          self.state.draftImageBase64 = '';
          if (previewRow) previewRow.classList.add('hidden');
          if (fileInput) fileInput.value = '';
        });
      }

      // Envio de Mensagem
      var inputText = document.getElementById('scChatInputText');
      var btnSend = document.getElementById('btnSendChatMessage');

      var doSendMessage = function () {
        var text = inputText ? inputText.value.trim() : '';
        var img = self.state.draftImageBase64 || '';

        if (!text && !img) {
          if (window.showToast) window.showToast('Digite uma mensagem ou anexe uma foto antes de enviar.', 'warning');
          return;
        }

        var isTicketFromOtherUser = ticket.user_email && ctx.email && ticket.user_email.toLowerCase() !== ctx.email.toLowerCase();
        var isSenderStaff = ctx.isAdmin && isTicketFromOtherUser;

        var newMsg = {
          id: 'msg-' + Date.now(),
          sender: isSenderStaff ? 'support' : 'user',
          sender_name: isSenderStaff ? 'Equipe CantaAí' : (ctx.name || 'Cantor'),
          text: text,
          image_url: img,
          created_at: new Date().toISOString()
        };

        ticket.messages.push(newMsg);
        if (isSenderStaff) {
          ticket.reply = text;
          ticket.replied_at = newMsg.created_at;
          ticket.status = 'resolved';
        } else {
          ticket.status = 'open';
        }
        ticket.updated_at = new Date().toISOString();

        self.saveAllTickets([ticket]);
        self.syncTicketToCloud(ticket);

        self.state.draftImageBase64 = '';
        if (inputText) inputText.value = '';
        if (previewRow) previewRow.classList.add('hidden');
        if (fileInput) fileInput.value = '';

        self.renderChatLayout();

        if (window.showToast) window.showToast(isSenderStaff ? 'Resposta enviada para o cantor!' : 'Mensagem enviada para o suporte!', 'success');
      };

      if (btnSend) btnSend.addEventListener('click', doSendMessage);

      if (inputText) {
        inputText.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSendMessage();
          }
        });
      }

      // Zoom na imagem ao clicar
      container.querySelectorAll('.ticket-thumb-clickable').forEach(function (imgEl) {
        imgEl.addEventListener('click', function () {
          var src = this.getAttribute('data-src');
          var modalZoom = document.getElementById('imagePreviewModal');
          var fullImg = document.getElementById('imagePreviewFull');
          if (modalZoom && fullImg && src) {
            fullImg.src = src;
            modalZoom.classList.remove('hidden');
          }
        });
      });
    },

    // ── VISTA DE NOVO CHAMADO / NOVA CONVERSA ──
    renderNewTicketForm: function (container) {
      var self = this;
      self.state.newTicketImageBase64 = '';

      var formHtml =
        '<div class="sc-new-ticket-view">' +
          '<div class="sc-new-ticket-header">' +
            '<h3 class="sc-new-ticket-title">💬 Iniciar Nova Conversa com o Suporte</h3>' +
            '<p class="sc-new-ticket-sub">Nossa equipe responderá diretamente aqui. Você poderá trocar mensagens, tirar dúvidas e anexar fotos.</p>' +
          '</div>' +
          '<form id="scFormNewTicket" onsubmit="return false;">' +
            '<div class="form-group" style="margin-bottom: 14px;">' +
              '<label for="scNewTicketCategory" style="display: block; font-size: 0.82rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Categoria da Solicitação:</label>' +
              '<select id="scNewTicketCategory" class="form-control" style="width: 100%; border-radius: 8px;">' +
                '<option value="duvida">❓ Dúvida sobre o Aplicativo</option>' +
                '<option value="sugestao">💡 Sugestão de Melhoria ou Ideia</option>' +
                '<option value="problema">🐛 Relatar Problema / Bug</option>' +
                '<option value="faturamento">💳 Assinatura, Pagamentos & Pix</option>' +
                '<option value="cifra">🎵 Dúvida sobre Cifra ou Transposição</option>' +
                '<option value="outro">📩 Outro Assunto</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 14px;">' +
              '<label for="scNewTicketTitle" style="display: block; font-size: 0.82rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Assunto:</label>' +
              '<input type="text" id="scNewTicketTitle" class="form-control" placeholder="Ex: Dúvida sobre o plano PRO ou problema ao importar repertório" style="width: 100%; border-radius: 8px;" required>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 14px;">' +
              '<label for="scNewTicketDesc" style="display: block; font-size: 0.82rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Mensagem Inicial:</label>' +
              '<textarea id="scNewTicketDesc" class="form-control" rows="4" placeholder="Explique com detalhes o que você precisa..." style="width: 100%; border-radius: 8px;" required></textarea>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 18px;">' +
              '<label style="display: block; font-size: 0.82rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Anexar Print ou Foto da Tela (Opcional):</label>' +
              '<div id="scNewDropZone" style="border: 2px dashed rgba(56, 189, 248, 0.3); border-radius: 12px; padding: 14px; text-align: center; background: rgba(56, 189, 248, 0.04); cursor: pointer;">' +
                '<input type="file" id="scNewFileInput" accept="image/*" style="display: none;">' +
                '<div id="scNewUploadPrompt">' +
                  '<span style="font-size: 1.5rem;">📸</span>' +
                  '<div style="font-size: 0.84rem; font-weight: 700; color: #38bdf8; margin-top: 4px;">Toque para selecionar imagem ou print</div>' +
                  '<small style="color: #64748b; font-size: 0.74rem;">Formatos: JPG, PNG, WEBP</small>' +
                '</div>' +
                '<div id="scNewPreviewContainer" class="hidden" style="margin-top: 8px; position: relative;">' +
                  '<img id="scNewImagePreview" src="" alt="Preview" style="max-height: 120px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);">' +
                  '<button type="button" id="btnRemoveNewTicketImage" style="position: absolute; top: -6px; right: 25%; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-weight: bold;">✕</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<button type="button" id="btnSubmitNewTicket" class="btn btn-primary" style="width: 100%; padding: 12px; font-weight: 800; border-radius: 10px; font-size: 0.95rem;">' +
              '🚀 Iniciar Conversa com a Equipe' +
            '</button>' +
          '</form>' +
        '</div>';

      container.innerHTML = formHtml;

      // Manipulação de Arquivo / Foto
      var dropZone = document.getElementById('scNewDropZone');
      var fileInput = document.getElementById('scNewFileInput');
      var promptBox = document.getElementById('scNewUploadPrompt');
      var previewBox = document.getElementById('scNewPreviewContainer');
      var previewImg = document.getElementById('scNewImagePreview');
      var btnRemoveImg = document.getElementById('btnRemoveNewTicketImage');

      if (dropZone && fileInput) {
        dropZone.addEventListener('click', function (e) {
          if (e.target !== btnRemoveImg) {
            fileInput.click();
          }
        });

        fileInput.addEventListener('change', function (e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function (evt) {
            self.state.newTicketImageBase64 = evt.target.result;
            if (previewImg) previewImg.src = self.state.newTicketImageBase64;
            if (previewBox) previewBox.classList.remove('hidden');
            if (promptBox) promptBox.classList.add('hidden');
          };
          reader.readAsDataURL(file);
        });
      }

      if (btnRemoveImg) {
        btnRemoveImg.addEventListener('click', function (e) {
          e.stopPropagation();
          self.state.newTicketImageBase64 = '';
          if (previewBox) previewBox.classList.add('hidden');
          if (promptBox) promptBox.classList.remove('hidden');
          if (fileInput) fileInput.value = '';
        });
      }

      // Envio do formulário
      var btnSubmit = document.getElementById('btnSubmitNewTicket');
      if (btnSubmit) {
        btnSubmit.addEventListener('click', function () {
          var category = document.getElementById('scNewTicketCategory').value;
          var title = (document.getElementById('scNewTicketTitle').value || '').trim();
          var desc = (document.getElementById('scNewTicketDesc').value || '').trim();

          if (!title || !desc) {
            if (window.showToast) window.showToast('Preencha o assunto e a mensagem inicial.', 'warning');
            return;
          }

          var ctx = self.getCurrentUserContext();
          var ticketId = 'tkt-' + Date.now();
          var nowIso = new Date().toISOString();

          var newTicket = {
            id: ticketId,
            user_id: ctx.user ? ctx.user.id : null,
            user_email: ctx.email || 'cantor@cantaaipro.com',
            user_name: ctx.name || 'Cantor CantaAí',
            category: category,
            title: title,
            description: desc,
            image_url: self.state.newTicketImageBase64 || '',
            status: 'open',
            created_at: nowIso,
            updated_at: nowIso,
            messages: [
              {
                id: ticketId + '-m0',
                sender: 'user',
                sender_name: ctx.name || 'Cantor',
                text: desc,
                image_url: self.state.newTicketImageBase64 || '',
                created_at: nowIso
              }
            ]
          };

          self.saveAllTickets([newTicket]);
          self.syncTicketToCloud(newTicket);

          self.state.activeTicketId = newTicket.id;
          self.renderChatLayout();

          if (window.showToast) window.showToast('🚀 Conversa iniciada com sucesso! Responderemos em breve.', 'success');
        });
      }
    },

    // ── INICIALIZAÇÃO E BINDINGS ──
    init: function () {
      var self = this;

      // Botão do Sino no Header (Abre Popover)
      var btnBell = document.getElementById('btnHeaderNotifications');
      if (btnBell) {
        btnBell.addEventListener('click', function (e) {
          e.stopPropagation();
          self.togglePopover();
        });
      }

      // Botão Notificações no menu de perfil (Abre Modal Completo)
      var btnProfileNotif = document.getElementById('btnProfileNotifications');
      if (btnProfileNotif) {
        btnProfileNotif.addEventListener('click', function () {
          self.openModal('announcements');
        });
      }

      // Botão de suporte no modal de perfil
      var btnProfileModalSupport = document.getElementById('btnProfileModalSupport');
      if (btnProfileModalSupport) {
        btnProfileModalSupport.addEventListener('click', function () {
          self.openModal('chat');
        });
      }

      // Botão de Sincronização Manual (legado — mantido para compatibilidade, mas o botão foi removido da UI)
      var btnSync = document.getElementById('btnSyncNotificationsCenter');
      if (btnSync) {
        btnSync.addEventListener('click', function (e) {
          e.stopPropagation();
          self.fetchFromCloud(function (err) {
            if (!err && window.showToast) {
              window.showToast('Sincronizado com a nuvem!', 'success');
            }
          });
        });
      }

      // Ações do Popover
      var btnMarkAllRead = document.getElementById('btnNotifPopMarkAllRead');
      if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener('click', function (e) {
          e.stopPropagation();
          self.markAllAsRead();
        });
      }

      var btnOpenFullCenter = document.getElementById('btnNotifPopOpenFull');
      if (btnOpenFullCenter) {
        btnOpenFullCenter.addEventListener('click', function (e) {
          e.preventDefault();
          self.closePopover();
          self.openModal('announcements');
        });
      }

      // Filtros do Popover
      var filterButtons = document.querySelectorAll('.notif-pop-filter-btn');
      filterButtons.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          filterButtons.forEach(function (b) { b.classList.remove('active'); });
          this.classList.add('active');
          self.state.popoverFilter = this.getAttribute('data-filter') || 'all';
          self.renderPopover();
        });
      });

      // Fechar Popover ao clicar fora
      document.addEventListener('click', function (e) {
        var pop = document.getElementById('notificationsQuickPopover');
        var btnBellEl = document.getElementById('btnHeaderNotifications');
        if (pop && !pop.classList.contains('hidden')) {
          if (!pop.contains(e.target) && (!btnBellEl || !btnBellEl.contains(e.target))) {
            self.closePopover();
          }
        }
      });

      // Fechar modal no botão fechar ou overlay
      var btnCloseModal = document.getElementById('btnCloseUserSupportModal');
      if (btnCloseModal) {
        btnCloseModal.addEventListener('click', function () {
          self.closeModal();
        });
      }

      var overlay = document.getElementById('userSupportOverlay');
      if (overlay) {
        overlay.addEventListener('click', function () {
          self.closeModal();
        });
      }

      // Navegação por abas na Central
      var tabBtnAnn = document.getElementById('scTabBtnAnnouncements');
      if (tabBtnAnn) {
        tabBtnAnn.addEventListener('click', function () {
          self.switchTab('announcements');
        });
      }

      var tabBtnChat = document.getElementById('scTabBtnChat');
      if (tabBtnChat) {
        tabBtnChat.addEventListener('click', function () {
          self.switchTab('chat');
        });
      }

      // Botão "+ Nova Conversa" na sidebar do chat
      var btnNewChat = document.getElementById('btnNewChatTicket');
      if (btnNewChat) {
        btnNewChat.addEventListener('click', function () {
          self.state.activeTicketId = null;
          self.renderChatLayout();
        });
      }

      // Fechar com Escape
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          if (self.state.isPopoverOpen) self.closePopover();
          else if (self.state.isModalOpen) self.closeModal();
        }
      });

      // Sincronização entre abas (storage event)
      window.addEventListener('storage', function (e) {
        if (
          e.key === 'canta_ai_admin_announcements' ||
          e.key === 'cantaai_read_announcements' ||
          e.key === 'canta_ai_support_tickets' ||
          e.key === 'cantaai_read_support_messages'
        ) {
          self.updateBadges();
          if (self.state.isPopoverOpen) self.renderPopover();
          if (self.state.isModalOpen) {
            if (self.state.activeTab === 'chat') self.renderChatLayout();
            else self.renderAnnouncements();
          }
        }
      });

      // Atualização inicial de badges com dados já no localStorage (sem busca na nuvem).
      // A sincronização com a nuvem acontece de forma lazy: ao abrir o popover ou o modal.
      self.updateBadges();

      // Auto-polling em background: busca mensagens novas a cada 30s
      // Garante que o admin veja msgs da Aline sem precisar clicar em nada
      self._pollInterval = setInterval(function () {
        // Só busca se há um usuário logado e o Supabase está configurado
        if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url &&
            window.PrompterAuth && window.PrompterAuth.getUser()) {
          self.fetchFromCloud();
        }
      }, 30000);
    }
  };

  // Expõe globalmente
  window.NotificationsCenter = NotificationsCenter;

  // Auto inicializa após carregamento do DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      NotificationsCenter.init();
    });
  } else {
    NotificationsCenter.init();
  }

})(window, document);
