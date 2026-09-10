/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANTAAÍ PRO — CENTRAL DE COMUNICAÇÃO & ATENDIMENTO AO CLIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 * Arquitetura de Comunicação:
 * 1. MURAL DE COMUNICADOS (1-WAY / UNIDIRECIONAL):
 *    - Desenvolvedor: Publica avisos de versões, melhorias e comunicados (gerais ou individuais).
 *    - Clientes/Cantores: Leem comunicados, visualizam badges e marcam como lidos. Sem chat.
 * 
 * 2. ATENDIMENTO & CHAT INTERATIVO (2-WAY / BIDIRECIONAL):
 *    - Desenvolvedor: Helpdesk omnichannel com lista de todos os cantores (ex: Aline),
 *      filtros por status (Abertos/Resolvidos), respostas em tempo real e anexos de prints.
 *    - Clientes/Cantores: Abrem chamados/dúvidas/sugestões e conversam diretamente com o dev.
 * 
 * 3. CAMADA DE DADOS & SINCRONIZAÇÃO EM NUVEM:
 *    - Supabase REST direto nas tabelas 'tickets' e 'announcements' usando auth_token real.
 *    - Fallback inteligente para LocalStorage com merge ordenado por timestamps.
 *    - Auto-polling de 20s para recebimento imediato de mensagens sem recarregar.
 */

(function (window, document) {
  'use strict';

  var NotificationsCenter = {
    // ── ESTADO DA APLICAÇÃO ──
    state: {
      activeTab: 'announcements',     // 'announcements' | 'chat'
      activeTicketId: null,           // ID do chamado selecionado no chat
      isNewConversationMode: false,   // true quando usuário clica em "+ Iniciar Nova Conversa"
      popoverFilter: 'all',           // 'all' | 'unread' | 'chat'
      adminTicketFilter: 'all',       // 'all' | 'open' | 'resolved'
      adminSearchQuery: '',           // Busca textual por cantor ou assunto
      isPopoverOpen: false,
      isModalOpen: false,
      isSyncingCloud: false,
      draftImageBase64: '',           // Foto anexada na resposta do chat
      newTicketImageBase64: '',       // Foto anexada no novo chamado
      profilesCache: []               // Lista de perfis de cantores para o select do admin
    },

    // ── HEADERS DE AUTENTICAÇÃO SUPABASE COM JWT REAL ──
    getAuthHeaders: function () {
      var anon = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.key) ? window.SUPABASE_CONFIG.key : '';
      var token = anon;
      try {
        var raw = localStorage.getItem('prompter_auth_user');
        if (raw) {
          var u = JSON.parse(raw);
          if (u && u.access_token) token = u.access_token;
        }
        if (token === anon) {
          for (var k in localStorage) {
            if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') !== -1) {
              var sbAuth = JSON.parse(localStorage.getItem(k));
              if (sbAuth && sbAuth.access_token) {
                token = sbAuth.access_token;
                break;
              }
            }
          }
        }
      } catch (e) {}
      return {
        'apikey': anon,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      };
    },

    // ── DETECÇÃO DO CONTEXTO DO USUÁRIO (DESENVOLVEDOR VS. CLIENTE) ──
    getCurrentUserContext: function () {
      var user = (window.PrompterAuth && typeof window.PrompterAuth.getUser === 'function') ? window.PrompterAuth.getUser() : null;
      var profile = (window.PrompterAuth && typeof window.PrompterAuth.getProfile === 'function') ? window.PrompterAuth.getProfile() : null;
      
      var email = ((profile && profile.email) || (user && user.email) || '').trim().toLowerCase();
      var name = ((profile && profile.display_name) || (user && user.user_metadata && user.user_metadata.full_name) || (email ? email.split('@')[0] : 'Cantor'));
      var singerCode = ((profile && profile.singer_code) || '').trim().toLowerCase();

      var isAdmin = (window.PrompterAuth && typeof window.PrompterAuth.isAdmin === 'function' && window.PrompterAuth.isAdmin()) ||
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

    // ── UTILITÁRIOS ──
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
      if (diffDays === 1) return 'Ontem ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (diffDays < 7) return diffDays + 'd atrás';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    },

    // ── ACESSO A DADOS LOCAIS ──
    getAnnouncements: function () {
      var raw = localStorage.getItem('canta_ai_admin_announcements');
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      var ctx = this.getCurrentUserContext();

      // Desenvolvedor vê todos os comunicados
      if (ctx.isAdmin) return list;

      // Cantor vê apenas comunicados gerais ou direcionados a ele
      return list.filter(function (a) {
        if (!a) return false;
        var t = String(a.target || a.target_user_email || 'all').trim().toLowerCase();
        if (t === 'all' || t === '' || t === 'todos') return true;
        if (ctx.email && (t === ctx.email || t === ctx.email.toLowerCase())) return true;
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
      var self = this;

      var normalized = list.map(function (t) {
        return self.normalizeTicket(t);
      }).filter(Boolean);

      // Desenvolvedor: visualiza todos os atendimentos
      if (ctx.isAdmin) {
        return normalized;
      }

      // Cantor comum: visualiza estritamente os seus chamados
      return normalized.filter(function (t) {
        if (!ctx.email) return true;
        return t.user_email && t.user_email.toLowerCase() === ctx.email;
      });
    },

    saveAllTickets: function (updatedTickets) {
      var raw = localStorage.getItem('canta_ai_support_tickets');
      var allTickets = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(allTickets)) allTickets = [];

      updatedTickets.forEach(function (ut) {
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

      // Se mensagens veio como string JSON do Supabase
      if (typeof copy.messages === 'string') {
        try {
          copy.messages = JSON.parse(copy.messages);
        } catch (e) {
          copy.messages = [];
        }
      }

      if (!Array.isArray(copy.messages)) {
        copy.messages = [];
      }

      // Se não possui mensagens, extrai da descrição inicial e da resposta legada
      if (copy.messages.length === 0) {
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
        if (copy.admin_response || copy.reply) {
          copy.messages.push({
            id: (copy.id || 'msg') + '-m1',
            sender: 'support',
            sender_name: 'Leonardo Vitulli (Desenvolvedor)',
            text: copy.admin_response || copy.reply,
            image_url: '',
            created_at: copy.replied_at || copy.updated_at || copy.created_at || new Date().toISOString()
          });
        }
      }

      if (!copy.status) {
        copy.status = (copy.admin_response || copy.reply) ? 'resolved' : 'open';
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
      var headers = self.getAuthHeaders();

      // 1. Busca Comunicados Oficiais na tabela dedicada 'announcements'
      var pAnnouncements = fetch(baseUrl + '/announcements?select=*&is_active=neq.false&order=created_at.desc', { headers: headers })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });

      // 2. Busca Chamados / Tickets de Atendimento na tabela dedicada 'tickets'
      var pTickets = fetch(baseUrl + '/tickets?select=*&order=updated_at.desc,created_at.desc', { headers: headers })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });

      // 3. Se for Admin, busca lista de perfis para alimentar o select de cantores
      var ctx = self.getCurrentUserContext();
      var pProfiles = ctx.isAdmin
        ? fetch(baseUrl + '/profiles?select=id,email,display_name,singer_code&order=display_name.asc', { headers: headers })
            .then(function (r) { return r.ok ? r.json() : []; })
            .catch(function () { return []; })
        : Promise.resolve([]);

      Promise.all([pAnnouncements, pTickets, pProfiles]).then(function (results) {
        var cloudAnnouncements = results[0] || [];
        var cloudTickets = results[1] || [];
        var cloudProfiles = results[2] || [];

        if (Array.isArray(cloudProfiles) && cloudProfiles.length > 0) {
          self.state.profilesCache = cloudProfiles;
        }

        // ── PROCESSA COMUNICADOS ──
        var rawAnnLocal = localStorage.getItem('canta_ai_admin_announcements');
        var localAnn = rawAnnLocal ? JSON.parse(rawAnnLocal) : [];
        if (!Array.isArray(localAnn)) localAnn = [];

        var mergedAnn = [].concat(localAnn);
        cloudAnnouncements.forEach(function (ca) {
          if (!ca || !ca.id) return;
          var idx = mergedAnn.findIndex(function (x) { return x.id === ca.id; });
          if (idx >= 0) {
            mergedAnn[idx] = Object.assign({}, mergedAnn[idx], ca);
          } else {
            mergedAnn.push(ca);
          }
        });

        mergedAnn.sort(function (a, b) {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
        localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(mergedAnn));

        // ── PROCESSA ATENDIMENTOS / TICKETS ──
        var rawTkLocal = localStorage.getItem('canta_ai_support_tickets');
        var localTickets = rawTkLocal ? JSON.parse(rawTkLocal) : [];
        if (!Array.isArray(localTickets)) localTickets = [];

        cloudTickets.forEach(function (cTicket) {
          var normCloud = self.normalizeTicket(cTicket);
          if (!normCloud || !normCloud.id) return;

          var existingIdx = localTickets.findIndex(function (x) { return x.id === normCloud.id; });
          if (existingIdx >= 0) {
            var existing = self.normalizeTicket(localTickets[existingIdx]);

            // Une as mensagens sem duplicidade
            var mergedMsgs = [].concat(existing.messages || []);
            (normCloud.messages || []).forEach(function (nm) {
              var alreadyExists = mergedMsgs.some(function (em) {
                return (em.id && nm.id && em.id === nm.id) ||
                       (em.text === nm.text && em.created_at === nm.created_at);
              });
              if (!alreadyExists) {
                mergedMsgs.push(nm);
              }
            });

            mergedMsgs.sort(function (m1, m2) {
              return new Date(m1.created_at || 0).getTime() - new Date(m2.created_at || 0).getTime();
            });

            // Decide versão com metadados mais recentes (status, etc.)
            var localTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
            var cloudTime = new Date(normCloud.updated_at || normCloud.created_at || 0).getTime();
            var winner = (localTime > cloudTime) ? existing : normCloud;

            winner.messages = mergedMsgs;
            localTickets[existingIdx] = winner;
          } else {
            localTickets.unshift(normCloud);
          }
        });

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

    // Sincroniza um ticket criado ou atualizado diretamente na tabela 'tickets'
    generateUUID: function () {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        try { return window.crypto.randomUUID(); } catch (e) {}
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },

    syncTicketToCloud: function (ticket) {
      if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.key) return;

      var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1';
      var headers = this.getAuthHeaders();
      var ctx = this.getCurrentUserContext();

      var payload = {
        user_id: ticket.user_id || (ctx.user ? ctx.user.id : null),
        user_email: ticket.user_email || ctx.email || 'cantor@cantaaipro.com',
        user_name: ticket.user_name || ctx.name || 'Cantor',
        category: ticket.category || 'sugestao',
        title: ticket.title || 'Atendimento',
        description: ticket.description || '',
        image_url: ticket.image_url || '',
        status: ticket.status || 'open',
        messages: JSON.stringify(ticket.messages || []),
        updated_at: new Date().toISOString()
      };

      var isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(ticket.id || ''));

      if (isUUID) {
        fetch(baseUrl + '/tickets?id=eq.' + encodeURIComponent(ticket.id), {
          method: 'PATCH',
          headers: Object.assign({}, headers, { 'Prefer': 'return=representation' }),
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.ok ? r.json() : [];
        }).then(function (updatedRows) {
          if (!updatedRows || updatedRows.length === 0) {
            payload.id = ticket.id;
            fetch(baseUrl + '/tickets', {
              method: 'POST',
              headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
              body: JSON.stringify([payload])
            }).catch(function () {});
          }
        }).catch(function () {});
      } else {
        var newId = this.generateUUID();
        var oldId = ticket.id;
        ticket.id = newId;
        payload.id = newId;

        var raw = localStorage.getItem('canta_ai_support_tickets');
        var list = raw ? JSON.parse(raw) : [];
        var idx = list.findIndex(function (x) { return x.id === oldId; });
        if (idx >= 0) {
          list[idx].id = newId;
          localStorage.setItem('canta_ai_support_tickets', JSON.stringify(list));
        }

        fetch(baseUrl + '/tickets', {
          method: 'POST',
          headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
          body: JSON.stringify([payload])
        }).catch(function () {});
      }
    },

    // Publica um novo comunicado oficial na nuvem
    publishAnnouncementToCloud: function (announcement, callback) {
      var raw = localStorage.getItem('canta_ai_admin_announcements');
      var list = raw ? JSON.parse(raw) : [];
      list.unshift(announcement);
      localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(list));

      if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key) {
        var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1';
        var headers = this.getAuthHeaders();
        
        var payload = {
          type: announcement.type || 'update',
          title: announcement.title || 'Comunicado',
          message: announcement.message || '',
          target: announcement.target || 'all',
          target_user_email: (announcement.target !== 'all') ? announcement.target : '',
          created_by: 'Leonardo Vitulli (Desenvolvedor & CEO)',
          is_active: true,
          created_at: announcement.created_at || new Date().toISOString()
        };

        fetch(baseUrl + '/announcements', {
          method: 'POST',
          headers: Object.assign({}, headers, { 'Prefer': 'return=representation' }),
          body: JSON.stringify([payload])
        }).then(function(r) { return r.ok ? r.json() : []; })
          .then(function(created) {
            if (created && created[0] && created[0].id) {
              announcement.id = created[0].id;
              localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(list));
            }
            if (callback) callback(null, announcement);
          }).catch(function(err) {
            if (callback) callback(err);
          });
      } else {
        if (callback) callback(null, announcement);
      }
    },

    // Exclui comunicado na nuvem e localmente
    deleteAnnouncement: function (annId, callback) {
      var raw = localStorage.getItem('canta_ai_admin_announcements');
      var list = raw ? JSON.parse(raw) : [];
      list = list.filter(function (a) { return a.id !== annId; });
      localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(list));

      if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key && annId) {
        var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1';
        var headers = this.getAuthHeaders();

        fetch(baseUrl + '/announcements?id=eq.' + encodeURIComponent(annId), {
          method: 'PATCH',
          headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
          body: JSON.stringify({ is_active: false })
        }).then(function() {
          if (callback) callback();
        }).catch(function() {
          if (callback) callback();
        });
      } else {
        if (callback) callback();
      }
    },

    // ── CÁLCULO DE BADGES & CONTADORES NÃO LIDOS ──
    calculateUnread: function () {
      var readAnnIds = this.getReadAnnouncementIds();
      var readMsgIds = this.getReadSupportMessageIds();
      var ctx = this.getCurrentUserContext();

      // 1. Comunicados não lidos (apenas clientes contam comunicados)
      var annList = this.getAnnouncements();
      var unreadAnn = annList.filter(function (a) {
        return a && a.id && readAnnIds.indexOf(a.id) === -1;
      });

      // 2. Mensagens não lidas
      var tickets = this.getTickets();
      var unreadRepliesCount = 0;
      var unreadReplyTickets = [];

      tickets.forEach(function (t) {
        if (t.messages && t.messages.length > 0) {
          var hasUnreadInTicket = false;
          t.messages.forEach(function (m) {
            var isTargetUnread = ctx.isAdmin
              ? (m.sender === 'user' && readMsgIds.indexOf(m.id) === -1 && t.user_email !== ctx.email)
              : (m.sender === 'support' && readMsgIds.indexOf(m.id) === -1);

            if (isTargetUnread) {
              hasUnreadInTicket = true;
              unreadRepliesCount++;
            }
          });
          if (hasUnreadInTicket) {
            unreadReplyTickets.push(t);
          }
        }
      });

      var total = ctx.isAdmin ? unreadRepliesCount : (unreadAnn.length + unreadRepliesCount);

      return {
        total: total,
        unreadAnnouncements: unreadAnn,
        unreadRepliesCount: unreadRepliesCount,
        unreadReplyTickets: unreadReplyTickets
      };
    },

    updateBadges: function () {
      var counts = this.calculateUnread();

      var badgeHeader = document.getElementById('headerNotificationBadge');
      if (badgeHeader) {
        if (counts.total > 0) {
          badgeHeader.innerText = counts.total;
          badgeHeader.classList.remove('hidden');
        } else {
          badgeHeader.classList.add('hidden');
        }
      }

      var badgeProfile = document.getElementById('profileNotificationBadge');
      if (badgeProfile) {
        if (counts.total > 0) {
          badgeProfile.innerText = counts.total + ' novo' + (counts.total !== 1 ? 's' : '');
          badgeProfile.classList.remove('hidden');
        } else {
          badgeProfile.classList.add('hidden');
        }
      }

      var popBadge = document.getElementById('notifPopBadge');
      if (popBadge) {
        popBadge.innerText = counts.total > 0 ? counts.total + ' pendente' + (counts.total !== 1 ? 's' : '') : 'Tudo lido';
        popBadge.style.display = counts.total > 0 ? 'inline-block' : 'none';
      }

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

    // ── POPOVER RÁPIDO DO CABEÇALHO (SINO) ──
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

      var userProfileMenu = document.getElementById('userProfileMenu');
      if (userProfileMenu) userProfileMenu.classList.add('hidden');

      this.state.isPopoverOpen = true;
      pop.classList.remove('hidden');
      this.renderPopover();
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
      var self = this;

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
            title: (ctx.isAdmin ? '📢 [Comunicado Enviado] ' : '📢 ') + (a.title || 'Comunicado Oficial'),
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

          var titlePrefix = hasUnread ? '💬 Nova Mensagem: ' : '📩 Atendimento: ';
          if (ctx.isAdmin && t.user_name) {
            titlePrefix = (hasUnread ? '🔵 ' : '👤 ') + '[' + t.user_name + '] ';
          }

          feedItems.push({
            type: 'ticket',
            id: t.id,
            title: titlePrefix + (t.title || 'Chamado de Suporte'),
            snippet: lastMsg ? lastMsg.text : (t.description || ''),
            date: (lastMsg && lastMsg.created_at) ? lastMsg.created_at : (t.created_at || new Date().toISOString()),
            isRead: isRead,
            icon: hasUnread ? '💬' : '📩',
            iconClass: hasUnread ? 'icon-reply' : ''
          });
        });
      }

      feedItems.sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      if (feedItems.length === 0) {
        container.innerHTML =
          '<div class="notif-pop-empty">' +
            '<span class="notif-pop-empty-icon">🔔</span>' +
            '<span class="notif-pop-empty-text">Nenhuma notificação no momento</span>' +
            '<span class="notif-pop-empty-sub">Você está em dia com todas as novidades!</span>' +
          '</div>';
        return;
      }

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
      var annList = this.getAnnouncements();
      var readAnnIds = this.getReadAnnouncementIds();
      annList.forEach(function (a) {
        if (a && a.id && readAnnIds.indexOf(a.id) === -1) {
          readAnnIds.push(a.id);
        }
      });
      localStorage.setItem('cantaai_read_announcements', JSON.stringify(readAnnIds));

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

    // ── CENTRAL DE COMUNICAÇÃO & ATENDIMENTO (MODAL PRINCIPAL) ──
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
        this.state.isNewConversationMode = false;
      }

      this.switchTab(tabName || 'announcements');
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 📢 ABA 1: MURAL DE COMUNICADOS & ATUALIZAÇÕES (UNIDIRECIONAL)
    // ═══════════════════════════════════════════════════════════════════════════
    renderAnnouncements: function () {
      var container = document.getElementById('scAnnouncementsList');
      if (!container) return;

      var ctx = this.getCurrentUserContext();
      var annList = this.getAnnouncements();
      var readIds = this.getReadAnnouncementIds();
      var self = this;

      var html = '';

      // ── SE FOR DESENVOLVEDOR (ADMIN): FORMULÁRIO DE PUBLICAÇÃO NO TOPO ──
      if (ctx.isAdmin) {
        var singerOptions = '<option value="all">🌐 Todos os Cantores (Broadcast Geral)</option>';
        if (self.state.profilesCache && self.state.profilesCache.length > 0) {
          singerOptions += '<optgroup label="Cantor Específico">';
          self.state.profilesCache.forEach(function (p) {
            if (p.email && p.email !== 'leovitulli@gmail.com') {
              var label = (p.display_name || p.email.split('@')[0]) + ' (' + (p.singer_code || p.email) + ')';
              singerOptions += '<option value="' + self.escapeHtml(p.email) + '">👤 ' + self.escapeHtml(label) + '</option>';
            }
          });
          singerOptions += '</optgroup>';
        }

        html +=
          '<div class="admin-announcement-composer" style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 14px; padding: 18px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">' +
            '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<span style="font-size: 1.3rem;">📢</span>' +
                '<strong style="color: #f8fafc; font-size: 0.98rem; font-family: \'Bricolage Grotesque\', sans-serif;">Publicar Comunicado ou Novidade de Versão</strong>' +
              '</div>' +
              '<span class="badge-plan-executive" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px;">👨‍💻 Modo Desenvolvedor</span>' +
            '</div>' +
            '<form id="formAdminNewAnnouncement" onsubmit="return false;">' +
              '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div>' +
                  '<label style="display: block; font-size: 0.76rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">Tipo de Aviso:</label>' +
                  '<select id="admAnnType" class="form-control" style="width: 100%; border-radius: 8px; font-size: 0.82rem;">' +
                    '<option value="update">🚀 Nova Versão / Atualização</option>' +
                    '<option value="feature">🎉 Nova Ferramenta / Benefício</option>' +
                    '<option value="info">ℹ️ Informação Geral</option>' +
                    '<option value="alert">⚠️ Alerta de Sistema / Manutenção</option>' +
                  '</select>' +
                '</div>' +
                '<div>' +
                  '<label style="display: block; font-size: 0.76rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">Destinatário:</label>' +
                  '<select id="admAnnTarget" class="form-control" style="width: 100%; border-radius: 8px; font-size: 0.82rem;">' +
                    singerOptions +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.76rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">Título do Comunicado:</label>' +
                '<input type="text" id="admAnnTitle" class="form-control" placeholder="Ex: Versão 2.5 Disponível — Novo Transpositor e Cifras Mais Rápidas" style="width: 100%; border-radius: 8px; font-size: 0.85rem;" required>' +
              '</div>' +
              '<div style="margin-bottom: 14px;">' +
                '<label style="display: block; font-size: 0.76rem; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">Mensagem Detalhada:</label>' +
                '<textarea id="admAnnMessage" class="form-control" rows="3" placeholder="Descreva as melhorias, novidades ou informações para os cantores..." style="width: 100%; border-radius: 8px; font-size: 0.82rem;" required></textarea>' +
              '</div>' +
              '<div style="display: flex; justify-content: flex-end;">' +
                '<button type="button" id="btnAdminPublishAnn" class="btn btn-primary" style="padding: 8px 18px; font-weight: 700; font-size: 0.85rem; border-radius: 8px;">' +
                  '🚀 Publicar Comunicado Oficial' +
                '</button>' +
              '</div>' +
            '</form>' +
          '</div>' +
          '<h4 style="color: #cbd5e1; font-size: 0.88rem; margin: 0 0 12px 4px; font-weight: 700;">📋 Comunicados Publicados Anteriormente:</h4>';
      }

      // ── LISTAGEM DE COMUNICADOS ──
      if (!annList || annList.length === 0) {
        html +=
          '<div style="text-align: center; padding: 40px 20px; color: #94a3b8; background: rgba(15, 23, 42, 0.4); border-radius: 14px; border: 1px dashed rgba(255, 255, 255, 0.08);">' +
            '<span style="font-size: 2rem; display: block; margin-bottom: 8px;">📢</span>' +
            '<strong style="color: #f8fafc; font-size: 1rem;">Nenhum comunicado no momento</strong><br>' +
            '<span style="font-size: 0.85rem;">' + (ctx.isAdmin ? 'Use o formulário acima para publicar notícias e melhorias para os cantores.' : 'Quando o desenvolvedor publicar avisos importantes ou novidades, você poderá consultar aqui.') + '</span>' +
          '</div>';
      } else {
        html += '<div style="display: flex; flex-direction: column; gap: 12px;">';
        annList.forEach(function (a) {
          var isRead = readIds.indexOf(a.id) !== -1;
          var dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente';
          var isDirect = a.target && a.target !== 'all' && a.target !== 'todos';

          var tagTarget = isDirect
            ? '<span class="sc-ann-tag sc-ann-tag-direct">🎯 ' + (ctx.isAdmin ? 'Para: ' + self.escapeHtml(a.target) : 'Direcionado para Você') + '</span>'
            : '<span class="sc-ann-tag sc-ann-tag-broadcast">📢 Todos os Cantores</span>';

          var typeTag = '<span class="sc-ann-tag sc-ann-tag-default">ℹ️ Informação Geral</span>';
          if (a.type === 'update') typeTag = '<span class="sc-ann-tag" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">🚀 Atualização de Versão</span>';
          if (a.type === 'feature' || a.type === 'promo') typeTag = '<span class="sc-ann-tag" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">🎉 Novidade / Benefício</span>';
          if (a.type === 'alert') typeTag = '<span class="sc-ann-tag" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">⚠️ Alerta do Sistema</span>';

          var actionBtn = '';
          if (ctx.isAdmin) {
            actionBtn = '<button type="button" class="btn btn-outline btn-xs btn-del-ann" data-id="' + self.escapeHtml(a.id) + '" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4); padding: 3px 8px; font-size: 0.72rem; border-radius: 6px;" title="Excluir este comunicado">🗑️ Excluir</button>';
          } else {
            actionBtn = isRead
              ? '<span style="color: #64748b; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">✓ Visualizado</span>'
              : '<button type="button" class="btn btn-outline btn-xs btn-read-ann" data-id="' + self.escapeHtml(a.id) + '" style="color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer;">✓ Marcar como Lido</button>';
          }

          html +=
            '<div class="sc-ann-card ' + (!isRead && !ctx.isAdmin ? 'is-unread' : '') + '">' +
              '<div class="sc-ann-header">' +
                '<div class="sc-ann-tags">' +
                  typeTag +
                  tagTarget +
                '</div>' +
                '<div style="display: flex; align-items: center; gap: 10px;">' +
                  '<span style="color: #64748b; font-size: 0.78rem;">' + dateStr + '</span>' +
                  actionBtn +
                '</div>' +
              '</div>' +
              '<h4 class="sc-ann-title">' + self.escapeHtml(a.title || 'Sem título') + '</h4>' +
              '<div class="sc-ann-body" style="white-space: pre-wrap; line-height: 1.5;">' + self.escapeHtml(a.message || '') + '</div>' +
            '</div>';
        });
        html += '</div>';
      }

      container.innerHTML = html;

      // Evento de Publicação do Admin
      var btnPub = document.getElementById('btnAdminPublishAnn');
      if (btnPub) {
        btnPub.addEventListener('click', function () {
          var type = document.getElementById('admAnnType').value;
          var target = document.getElementById('admAnnTarget').value;
          var title = (document.getElementById('admAnnTitle').value || '').trim();
          var msg = (document.getElementById('admAnnMessage').value || '').trim();

          if (!title || !msg) {
            if (window.showToast) window.showToast('Preencha o título e a mensagem do comunicado.', 'warning');
            return;
          }

          btnPub.disabled = true;
          btnPub.innerHTML = 'Publicando...';

          var newAnn = {
            id: 'ann-' + Date.now(),
            type: type,
            target: target,
            title: title,
            message: msg,
            created_at: new Date().toISOString()
          };

          self.publishAnnouncementToCloud(newAnn, function () {
            btnPub.disabled = false;
            btnPub.innerHTML = '🚀 Publicar Comunicado Oficial';
            self.renderAnnouncements();
            if (window.showToast) window.showToast('📢 Comunicado publicado com sucesso para ' + (target === 'all' ? 'todos os cantores' : target) + '!', 'success');
          });
        });
      }

      // Eventos de Exclusão do Admin
      container.querySelectorAll('.btn-del-ann').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = this.getAttribute('data-id');
          if (confirm('Deseja realmente excluir este comunicado?')) {
            self.deleteAnnouncement(id, function () {
              self.renderAnnouncements();
              if (window.showToast) window.showToast('Comunicado excluído.', 'info');
            });
          }
        });
      });

      // Eventos de Marcar como Lido pelo Cantor
      container.querySelectorAll('.btn-read-ann').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = this.getAttribute('data-id');
          self.markAnnouncementRead(id);
          self.renderAnnouncements();
        });
      });
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 💬 ABA 2: ATENDIMENTO & CHAT INTERATIVO (BIDIRECIONAL)
    // ═══════════════════════════════════════════════════════════════════════════
    renderChatLayout: function () {
      var sidebarList = document.getElementById('scChatTicketsList');
      var mainArea = document.getElementById('scChatMainArea');
      var chatLayout = document.getElementById('scPaneChat');
      if (!sidebarList || !mainArea) return;

      var ctx = this.getCurrentUserContext();
      var tickets = this.getTickets();
      var readMsgIds = this.getReadSupportMessageIds();
      var self = this;

      // ── ATUALIZA CABEÇALHO DA SIDEBAR DE ACORDO COM O PAPEL (DEV VS. CANTOR) ──
      var sidebarHeader = document.querySelector('.sc-chat-sidebar-header');
      if (sidebarHeader) {
        if (ctx.isAdmin) {
          // Desenvolvedor: Barra de Busca e Filtros de Status
          var pendingCount = tickets.filter(function(t) { return t.status !== 'resolved'; }).length;
          sidebarHeader.innerHTML =
            '<div style="margin-bottom: 8px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">' +
                '<strong style="color: #f8fafc; font-size: 0.85rem;">👥 Atendimentos aos Cantores</strong>' +
                '<span style="background: ' + (pendingCount > 0 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(52, 211, 153, 0.2)') + '; color: ' + (pendingCount > 0 ? '#fbbf24' : '#34d399') + '; font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; font-weight: 700;">' + pendingCount + ' pendente' + (pendingCount !== 1 ? 's' : '') + '</span>' +
              '</div>' +
              '<input type="text" id="scAdminTicketSearch" class="form-control" placeholder="🔍 Buscar por cantor, email..." value="' + self.escapeHtml(self.state.adminSearchQuery) + '" style="width: 100%; border-radius: 6px; font-size: 0.76rem; padding: 4px 8px; margin-bottom: 6px;">' +
              '<div style="display: flex; gap: 4px;">' +
                '<button type="button" class="btn btn-xs ' + (self.state.adminTicketFilter === 'all' ? 'btn-primary' : 'btn-outline') + '" id="btnFilterTkAll" style="flex: 1; font-size: 0.7rem; padding: 3px 4px;">Todos (' + tickets.length + ')</button>' +
                '<button type="button" class="btn btn-xs ' + (self.state.adminTicketFilter === 'open' ? 'btn-primary' : 'btn-outline') + '" id="btnFilterTkOpen" style="flex: 1; font-size: 0.7rem; padding: 3px 4px; color: #fbbf24;">🟡 Abertos (' + pendingCount + ')</button>' +
                '<button type="button" class="btn btn-xs ' + (self.state.adminTicketFilter === 'resolved' ? 'btn-primary' : 'btn-outline') + '" id="btnFilterTkResolved" style="flex: 1; font-size: 0.7rem; padding: 3px 4px; color: #34d399;">🟢 Resolvidos</button>' +
              '</div>' +
            '</div>';

          var searchInput = document.getElementById('scAdminTicketSearch');
          if (searchInput) {
            searchInput.addEventListener('input', function () {
              self.state.adminSearchQuery = this.value;
              self.renderChatLayout();
            });
          }

          var bAll = document.getElementById('btnFilterTkAll');
          var bOpen = document.getElementById('btnFilterTkOpen');
          var bRes = document.getElementById('btnFilterTkResolved');
          if (bAll) bAll.addEventListener('click', function() { self.state.adminTicketFilter = 'all'; self.renderChatLayout(); });
          if (bOpen) bOpen.addEventListener('click', function() { self.state.adminTicketFilter = 'open'; self.renderChatLayout(); });
          if (bRes) bRes.addEventListener('click', function() { self.state.adminTicketFilter = 'resolved'; self.renderChatLayout(); });
        } else {
          // Cantor: Botão em destaque para abrir nova conversa
          sidebarHeader.innerHTML =
            '<button type="button" id="btnNewChatTicket" class="btn-new-chat-ticket" style="width: 100%; justify-content: center; font-weight: 700; padding: 10px; border-radius: 8px;">' +
              '<span>➕</span> Falar com o Desenvolvedor' +
            '</button>';

          var btnNew = document.getElementById('btnNewChatTicket');
          if (btnNew) {
            btnNew.addEventListener('click', function () {
              self.state.activeTicketId = null;
              self.state.isNewConversationMode = true;
              self.renderChatLayout();
            });
          }
        }
      }

      // Aplica filtros de busca e status para o Desenvolvedor
      var filteredTickets = tickets.filter(function (t) {
        if (!ctx.isAdmin) return true;
        if (self.state.adminTicketFilter === 'open' && t.status === 'resolved') return false;
        if (self.state.adminTicketFilter === 'resolved' && t.status !== 'resolved') return false;
        if (self.state.adminSearchQuery) {
          var q = self.state.adminSearchQuery.toLowerCase();
          var matchName = t.user_name && t.user_name.toLowerCase().indexOf(q) !== -1;
          var matchEmail = t.user_email && t.user_email.toLowerCase().indexOf(q) !== -1;
          var matchTitle = t.title && t.title.toLowerCase().indexOf(q) !== -1;
          if (!matchName && !matchEmail && !matchTitle) return false;
        }
        return true;
      });

      // Auto-seleciona o primeiro ticket se nenhum estiver selecionado e o usuário NÃO clicou em novo chamado
      if (!this.state.activeTicketId && filteredTickets.length > 0 && !this.state.isNewConversationMode) {
        this.state.activeTicketId = filteredTickets[0].id;
      }

      // ── RENDERIZAÇÃO DA SIDEBAR DE TICKETS ──
      if (filteredTickets.length === 0) {
        sidebarList.innerHTML =
          '<div style="padding: 24px 16px; text-align: center; color: #94a3b8; font-size: 0.82rem;">' +
            (ctx.isAdmin
              ? 'Nenhum atendimento encontrado com este filtro.<br><small style="color: #64748b;">Sincronizado com a nuvem.</small>'
              : 'Nenhum chamado aberto ainda.<br>Clique em <strong>"+ Falar com o Desenvolvedor"</strong> acima para tirar dúvidas ou solicitar melhorias.') +
          '</div>';
      } else {
        var sidebarHtml = '';
        filteredTickets.forEach(function (t) {
          var isActive = t.id === self.state.activeTicketId && !self.state.isNewConversationMode;
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

          var statusClass = 'status-open';
          var statusText = '🟡 Aberto';
          if (t.status === 'resolved') {
            statusClass = 'status-resolved';
            statusText = '🟢 Resolvido';
          } else if (hasUnread) {
            statusClass = 'status-answered';
            statusText = ctx.isAdmin ? '🔵 Nova Msg Cantor' : '🔵 Resposta do Dev';
          }

          var timeStr = self.formatRelativeTime((lastMsg && lastMsg.created_at) ? lastMsg.created_at : t.created_at);

          var headerCardHtml = (ctx.isAdmin && t.user_email)
            ? '<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">' +
                '<span style="font-size: 0.9rem;">🎤</span>' +
                '<strong style="color: #38bdf8; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + self.escapeHtml(t.user_name || 'Cantor') + '</strong>' +
                '<span style="color: #64748b; font-size: 0.68rem; margin-left: auto;">' + timeStr + '</span>' +
              '</div>'
            : '<div class="sc-ticket-item-top">' +
                '<span class="sc-ticket-status-pill ' + statusClass + '">' + statusText + '</span>' +
                '<span class="sc-ticket-item-time">' + timeStr + '</span>' +
              '</div>';

          var subSingerBadge = (ctx.isAdmin && t.user_email)
            ? '<div style="font-size: 0.7rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;">&lt;' + self.escapeHtml(t.user_email) + '&gt;</div>'
            : '';

          sidebarHtml +=
            '<div class="sc-chat-ticket-item ' + (isActive ? 'active' : '') + '" data-id="' + self.escapeHtml(t.id) + '">' +
              headerCardHtml +
              subSingerBadge +
              '<div class="sc-ticket-item-title" style="font-weight: 700; color: #f8fafc; font-size: 0.82rem;">' + self.escapeHtml(t.title || 'Conversa') + '</div>' +
              '<div class="sc-ticket-item-preview" style="color: #94a3b8; font-size: 0.74rem;">' + (lastMsg ? self.escapeHtml(lastMsg.text) : 'Sem mensagens') + '</div>' +
              (ctx.isAdmin
                ? '<div style="margin-top: 4px;"><span class="sc-ticket-status-pill ' + statusClass + '" style="font-size: 0.65rem; padding: 1px 6px;">' + statusText + '</span></div>'
                : '') +
            '</div>';
        });
        sidebarList.innerHTML = sidebarHtml;

        sidebarList.querySelectorAll('.sc-chat-ticket-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var tid = this.getAttribute('data-id');
            self.selectTicket(tid);
          });
        });
      }

      // ── RENDERIZAÇÃO DA ÁREA PRINCIPAL (THREAD OU FORMULÁRIO DE NOVO CHAMADO) ──
      if (this.state.isNewConversationMode || (!this.state.activeTicketId && !ctx.isAdmin)) {
        if (chatLayout) chatLayout.classList.remove('thread-open');
        this.renderNewTicketForm(mainArea);
      } else if (this.state.activeTicketId) {
        var activeTicket = tickets.find(function (x) { return x.id === self.state.activeTicketId; });
        if (activeTicket) {
          if (chatLayout) chatLayout.classList.add('thread-open');
          this.markTicketMessagesAsRead(activeTicket);
          this.renderThreadView(mainArea, activeTicket);
        } else {
          if (ctx.isAdmin) {
            mainArea.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: #94a3b8;"><span style="font-size: 2.5rem; display: block; margin-bottom: 12px;">💬</span>Selecione uma conversa ao lado para responder ao cantor.</div>';
          } else {
            this.renderNewTicketForm(mainArea);
          }
        }
      } else {
        if (ctx.isAdmin) {
          mainArea.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: #94a3b8;"><span style="font-size: 2.5rem; display: block; margin-bottom: 12px;">💬</span>Selecione um cantor ao lado para visualizar o atendimento.</div>';
        } else {
          this.renderNewTicketForm(mainArea);
        }
      }
    },

    selectTicket: function (ticketId) {
      this.state.activeTicketId = ticketId;
      this.state.isNewConversationMode = false;
      this.renderChatLayout();
    },

    // ── THREAD DE MENSAGENS INTERATIVA ──
    renderThreadView: function (container, ticket) {
      var self = this;
      var ctx = this.getCurrentUserContext();
      var catLabels = {
        'duvida': '❓ Dúvida',
        'problema': '🐛 Bug / Problema',
        'sugestao': '💡 Sugestão',
        'cifra': '🎵 Cifra / Tom',
        'faturamento': '💳 Assinatura / Pagamento',
        'outro': '📩 Atendimento'
      };

      var isResolved = ticket.status === 'resolved';

      var singerDetail = (ctx.isAdmin && ticket.user_email)
        ? ' • Cantor: <strong>' + self.escapeHtml(ticket.user_name || 'Cantor') + '</strong> &lt;' + self.escapeHtml(ticket.user_email) + '&gt;'
        : '';

      var headerHtml =
        '<div class="sc-thread-header" style="background: rgba(15, 23, 42, 0.7); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 14px 18px;">' +
          '<div class="sc-thread-title-area">' +
            '<button type="button" class="sc-btn-back-sidebar" id="btnBackToTicketsList" title="Voltar à lista">←</button>' +
            '<div>' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<h4 class="sc-thread-title" style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #f8fafc;">' + self.escapeHtml(ticket.title || 'Atendimento') + '</h4>' +
                '<span class="sc-ticket-status-pill ' + (isResolved ? 'status-resolved' : 'status-open') + '">' +
                  (isResolved ? '🟢 Resolvido' : '🟡 Em Aberto') +
                '</span>' +
              '</div>' +
              '<div style="font-size: 0.75rem; color: #94a3b8; margin-top: 3px;">' +
                (catLabels[ticket.category] || '📩 Atendimento') + ' • Chamado #' + self.escapeHtml(String(ticket.id).slice(-6)) +
                singerDetail +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="sc-thread-actions">' +
            (!isResolved
              ? '<button type="button" id="btnMarkTicketResolved" class="btn btn-outline btn-xs" style="color: #34d399; border-color: rgba(52, 211, 153, 0.4); font-size: 0.76rem; border-radius: 6px; padding: 5px 12px; cursor: pointer;">✅ Marcar Resolvido</button>'
              : '<button type="button" id="btnReopenTicket" class="btn btn-outline btn-xs" style="color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); font-size: 0.76rem; border-radius: 6px; padding: 5px 12px; cursor: pointer;">🔄 Reabrir Atendimento</button>') +
          '</div>' +
        '</div>';

      // Feed de Mensagens
      var messagesFeedHtml = '<div class="sc-thread-messages-feed" id="scChatMessagesFeed">';
      ticket.messages.forEach(function (msg) {
        var isSenderUser = msg.sender === 'user';
        var isOwnMessage = ctx.isAdmin ? !isSenderUser : isSenderUser;

        var senderName = msg.sender_name || (isSenderUser ? (ticket.user_name || 'Cantor') : 'Leonardo Vitulli (Desenvolvedor)');
        var avatarInitial = isSenderUser ? (senderName ? senderName.charAt(0).toUpperCase() : '🎤') : '👨‍💻';
        var timeStr = self.formatRelativeTime(msg.created_at);

        var photoHtml = '';
        if (msg.image_url) {
          photoHtml =
            '<div class="chat-bubble-attachment" style="margin-top: 8px;">' +
              '<img src="' + msg.image_url + '" class="chat-attachment-img ticket-thumb-clickable" data-src="' + msg.image_url + '" alt="Anexo do chamado" title="Clique para ampliar em tela cheia" style="max-height: 180px; border-radius: 8px; cursor: pointer; border: 1px solid rgba(255,255,255,0.15);">' +
            '</div>';
        }

        messagesFeedHtml +=
          '<div class="chat-bubble-row ' + (isOwnMessage ? 'is-user' : 'is-support') + '">' +
            '<div class="chat-bubble-avatar ' + (isSenderUser ? 'avatar-user' : 'avatar-support') + '">' + avatarInitial + '</div>' +
            '<div class="chat-bubble-body">' +
              '<div class="chat-bubble-meta">' +
                '<span class="chat-bubble-sender">' + self.escapeHtml(senderName) + '</span>' +
                (!isSenderUser ? '<span class="chat-bubble-badge-staff" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Desenvolvedor</span>' : '') +
                '<span>• ' + timeStr + '</span>' +
              '</div>' +
              '<div class="chat-bubble-box" style="white-space: pre-wrap; line-height: 1.45;">' +
                self.escapeHtml(msg.text || '') +
                photoHtml +
              '</div>' +
            '</div>' +
          '</div>';
      });
      messagesFeedHtml += '</div>';

      // Barra de Composição / Envio
      var placeholderText = ctx.isAdmin
        ? 'Responder como Leonardo Vitulli para ' + self.escapeHtml(ticket.user_name || 'o cantor') + '... (Enter para enviar)'
        : 'Digite sua mensagem para o desenvolvedor... (Enter para enviar)';

      var composerHtml =
        '<div class="sc-chat-composer">' +
          '<div id="scComposerPreviewRow" class="sc-composer-attachment-preview hidden" style="padding: 6px 12px; background: rgba(56, 189, 248, 0.08); border-top: 1px solid rgba(56, 189, 248, 0.2); display: flex; align-items: center; gap: 8px;">' +
            '<img id="scComposerPreviewImg" class="sc-composer-attachment-img" src="" alt="Preview" style="height: 36px; border-radius: 4px;">' +
            '<span style="font-size: 0.75rem; color: #38bdf8; font-weight: 600;">Print anexado pronto para envio</span>' +
            '<button type="button" id="btnRemoveComposerImg" style="background: transparent; border: none; color: #ef4444; font-weight: bold; cursor: pointer; padding: 2px 6px; margin-left: auto;">✕ Remover</button>' +
          '</div>' +
          '<div class="sc-composer-input-row">' +
            '<input type="file" id="scChatFileInput" accept="image/*" style="display: none;">' +
            '<button type="button" id="btnAttachChatPhoto" class="sc-composer-btn-attach" title="Anexar foto ou print de tela">📎</button>' +
            '<textarea id="scChatInputText" class="sc-composer-textarea" rows="1" placeholder="' + placeholderText + '"></textarea>' +
            '<button type="button" id="btnSendChatMessage" class="sc-composer-btn-send" title="Enviar Mensagem">➤</button>' +
          '</div>' +
        '</div>';

      container.innerHTML = headerHtml + messagesFeedHtml + composerHtml;

      var feed = document.getElementById('scChatMessagesFeed');
      if (feed) feed.scrollTop = feed.scrollHeight;

      // Eventos da Thread
      var btnBack = document.getElementById('btnBackToTicketsList');
      if (btnBack) {
        btnBack.addEventListener('click', function () {
          var chatLayout = document.getElementById('scPaneChat');
          if (chatLayout) chatLayout.classList.remove('thread-open');
        });
      }

      var btnResolve = document.getElementById('btnMarkTicketResolved');
      if (btnResolve) {
        btnResolve.addEventListener('click', function () {
          ticket.status = 'resolved';
          ticket.updated_at = new Date().toISOString();
          self.saveAllTickets([ticket]);
          self.syncTicketToCloud(ticket);
          self.renderChatLayout();
          if (window.showToast) window.showToast('Atendimento marcado como resolvido!', 'success');
        });
      }

      var btnReopen = document.getElementById('btnReopenTicket');
      if (btnReopen) {
        btnReopen.addEventListener('click', function () {
          ticket.status = 'open';
          ticket.updated_at = new Date().toISOString();
          self.saveAllTickets([ticket]);
          self.syncTicketToCloud(ticket);
          self.renderChatLayout();
          if (window.showToast) window.showToast('Atendimento reaberto com sucesso.', 'info');
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
          if (window.showToast) window.showToast('Digite uma mensagem ou anexe um print antes de enviar.', 'warning');
          return;
        }

        var isSenderStaff = ctx.isAdmin;
        var nowIso = new Date().toISOString();

        var newMsg = {
          id: 'msg-' + Date.now(),
          sender: isSenderStaff ? 'support' : 'user',
          sender_name: isSenderStaff ? 'Leonardo Vitulli (Desenvolvedor)' : (ctx.name || 'Cantor'),
          text: text,
          image_url: img,
          created_at: nowIso
        };

        ticket.messages.push(newMsg);
        if (isSenderStaff) {
          ticket.admin_response = text;
          ticket.status = 'resolved';
        } else {
          ticket.status = 'open';
        }
        ticket.updated_at = nowIso;

        self.saveAllTickets([ticket]);
        self.syncTicketToCloud(ticket);

        self.state.draftImageBase64 = '';
        if (inputText) inputText.value = '';
        if (previewRow) previewRow.classList.add('hidden');
        if (fileInput) fileInput.value = '';

        self.renderChatLayout();

        if (window.showToast) {
          window.showToast(isSenderStaff ? 'Resposta enviada com sucesso para o cantor!' : 'Mensagem enviada com sucesso para o desenvolvedor!', 'success');
        }
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

    // ── VISTA DE NOVO ATENDIMENTO / NOVA CONVERSA DO CLIENTE ──
    renderNewTicketForm: function (container) {
      var self = this;
      self.state.newTicketImageBase64 = '';

      var formHtml =
        '<div class="sc-new-ticket-view" style="padding: 24px; max-width: 600px; margin: 0 auto;">' +
          '<div class="sc-new-ticket-header" style="margin-bottom: 20px; text-align: center;">' +
            '<h3 class="sc-new-ticket-title" style="font-size: 1.25rem; font-weight: 800; color: #f8fafc; font-family: \'Bricolage Grotesque\', sans-serif;">💬 Falar Diretamente com o Desenvolvedor</h3>' +
            '<p class="sc-new-ticket-sub" style="font-size: 0.84rem; color: #94a3b8; margin-top: 6px;">Tire dúvidas, envie sugestões de melhorias ou relate problemas. Responderemos diretamente nesta tela.</p>' +
          '</div>' +
          '<form id="scFormNewTicket" onsubmit="return false;">' +
            '<div class="form-group" style="margin-bottom: 14px;">' +
              '<label for="scNewTicketCategory" style="display: block; font-size: 0.8rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Categoria:</label>' +
              '<select id="scNewTicketCategory" class="form-control" style="width: 100%; border-radius: 8px;">' +
                '<option value="duvida">❓ Dúvida sobre o Aplicativo</option>' +
                '<option value="sugestao">💡 Sugestão de Melhoria ou Ideia</option>' +
                '<option value="problema">🐛 Relatar Problema / Bug</option>' +
                '<option value="cifra">🎵 Dúvida sobre Cifra ou Transposição</option>' +
                '<option value="faturamento">💳 Assinatura, Pagamentos & Pix</option>' +
                '<option value="outro">📩 Outro Assunto</option>' +
              '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 14px;">' +
              '<label for="scNewTicketTitle" style="display: block; font-size: 0.8rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Assunto:</label>' +
              '<input type="text" id="scNewTicketTitle" class="form-control" placeholder="Ex: Sugestão para o modo escuro ou ajuda para transpor tom" style="width: 100%; border-radius: 8px;" required>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 14px;">' +
              '<label for="scNewTicketDesc" style="display: block; font-size: 0.8rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Sua Mensagem:</label>' +
              '<textarea id="scNewTicketDesc" class="form-control" rows="4" placeholder="Explique com detalhes a sua dúvida ou ideia..." style="width: 100%; border-radius: 8px;" required></textarea>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 18px;">' +
              '<label style="display: block; font-size: 0.8rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Anexar Print ou Foto da Tela (Opcional):</label>' +
              '<div id="scNewDropZone" style="border: 2px dashed rgba(56, 189, 248, 0.3); border-radius: 12px; padding: 14px; text-align: center; background: rgba(56, 189, 248, 0.04); cursor: pointer;">' +
                '<input type="file" id="scNewFileInput" accept="image/*" style="display: none;">' +
                '<div id="scNewUploadPrompt">' +
                  '<span style="font-size: 1.5rem;">📸</span>' +
                  '<div style="font-size: 0.84rem; font-weight: 700; color: #38bdf8; margin-top: 4px;">Toque para anexar imagem ou print</div>' +
                  '<small style="color: #64748b; font-size: 0.74rem;">Formatos: JPG, PNG, WEBP</small>' +
                '</div>' +
                '<div id="scNewPreviewContainer" class="hidden" style="margin-top: 8px; position: relative;">' +
                  '<img id="scNewImagePreview" src="" alt="Preview" style="max-height: 120px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);">' +
                  '<button type="button" id="btnRemoveNewTicketImage" style="position: absolute; top: -6px; right: 25%; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-weight: bold;">✕</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<button type="button" id="btnSubmitNewTicket" class="btn btn-primary" style="width: 100%; padding: 12px; font-weight: 800; border-radius: 10px; font-size: 0.95rem;">' +
              '🚀 Enviar Mensagem para o Desenvolvedor' +
            '</button>' +
          '</form>' +
        '</div>';

      container.innerHTML = formHtml;

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

      var btnSubmit = document.getElementById('btnSubmitNewTicket');
      if (btnSubmit) {
        btnSubmit.addEventListener('click', function () {
          var category = document.getElementById('scNewTicketCategory').value;
          var title = (document.getElementById('scNewTicketTitle').value || '').trim();
          var desc = (document.getElementById('scNewTicketDesc').value || '').trim();

          if (!title || !desc) {
            if (window.showToast) window.showToast('Por favor, informe o assunto e a mensagem inicial.', 'warning');
            return;
          }

          var ctx = self.getCurrentUserContext();
          var ticketId = self.generateUUID();
          var nowIso = new Date().toISOString();

          var newTicket = {
            id: ticketId,
            user_id: ctx.user ? ctx.user.id : null,
            user_email: ctx.email || 'cantor@cantaaipro.com',
            user_name: ctx.name || 'Cantor',
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
          self.state.isNewConversationMode = false;
          self.renderChatLayout();

          if (window.showToast) window.showToast('🚀 Mensagem enviada com sucesso! Responderemos em breve.', 'success');
        });
      }
    },

    // ── INICIALIZAÇÃO & BINDINGS DE EVENTOS ──
    init: function () {
      var self = this;

      // Botão Sino no Header (abre Popover)
      var btnBell = document.getElementById('btnHeaderNotifications');
      if (btnBell) {
        btnBell.addEventListener('click', function (e) {
          e.stopPropagation();
          self.togglePopover();
        });
      }

      // Botão Notificações no menu de perfil
      var btnProfileNotif = document.getElementById('btnProfileNotifications');
      if (btnProfileNotif) {
        btnProfileNotif.addEventListener('click', function () {
          self.openModal('announcements');
        });
      }

      // Botão de suporte no menu de perfil
      var btnProfileModalSupport = document.getElementById('btnProfileModalSupport');
      if (btnProfileModalSupport) {
        btnProfileModalSupport.addEventListener('click', function () {
          self.openModal('chat');
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

      // Fechar Modal
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

      // Navegação por Abas
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

      // Fechar com Escape
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          if (self.state.isPopoverOpen) self.closePopover();
          else if (self.state.isModalOpen) self.closeModal();
        }
      });

      // Sincronização entre Abas (Storage Event)
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

      // Atualização inicial de badges
      self.updateBadges();

      // Auto-polling em segundo plano a cada 20 segundos
      self._pollInterval = setInterval(function () {
        if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url &&
            window.PrompterAuth && window.PrompterAuth.getUser()) {
          self.fetchFromCloud();
        }
      }, 20000);
    }
  };

  window.NotificationsCenter = NotificationsCenter;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      NotificationsCenter.init();
    });
  } else {
    NotificationsCenter.init();
  }

})(window, document);
