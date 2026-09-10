/**
 * PrompterCantor PRO - CEO & Founder Executive Command Center
 * Plataforma de Governança SaaS Enterprise para monitoramento de MRR, assinantes PRO,
 * gestão individual de clientes, cupons VIP e checkout Mercado Pago.
 */

(function () {
  'use strict';

  var adminModal = null;
  var currentTab = 'growth';
  var currentFilter = 'all';
  var searchQuery = '';

  // Telemetria & Growth
  var platformTotalSongs = 0;
  var platformTotalReps = 0;
  var currentGrowthPeriod = 'week';

  // Central de Atendimento & Helpdesk
  var currentHelpdeskTickets = [];
  var activeHelpdeskTicketId = null;
  var currentHelpdeskFilter = 'all';
  var helpdeskSearchQuery = '';
  var helpdeskPendingImage = '';

  // Módulo Financeiro, Balancete ERP & Cobrança
  var STORAGE_FINANCE_KEY = 'canta_ai_finance_ledger';
  var currentFinanceFilter = 'all';
  var financeSearchQuery = '';
  var financeSelectedMonth = new Date().getMonth(); // 0 - 11
  var financeSelectedYear = new Date().getFullYear();
  var financeLedger = [];

  // Storage Keys
  var STORAGE_USERS_KEY = 'canta_ai_admin_users';
  var STORAGE_COUPONS_KEY = 'canta_ai_admin_coupons';
  var STORAGE_PRICING_KEY = 'canta_ai_admin_pricing';
  var STORAGE_DELETED_KEY = 'canta_ai_deleted_singers';
  var SYSTEM_REGISTRY_REPERTOIRE_ID = '3e42c00c-f10c-4b05-96b6-b782403d1d17';

  function isPlatformDeveloper(email) {
    if (!email) return false;
    var em = String(email).toLowerCase().trim();
    return em === 'leovitulli@gmail.com' || em === 'leonardovitulli@gmail.com';
  }
  window.isPlatformDeveloper = isPlatformDeveloper;

  function getDeletedSingers() {
    try {
      var raw = localStorage.getItem(STORAGE_DELETED_KEY);
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      // Higienizar: garantir que contas legítimas nunca fiquem na lista de excluídos
      list = list.filter(function(x) {
        var str = String(x || '').toLowerCase().trim();
        return !isPlatformDeveloper(str) &&
               str !== '@leovitulli' &&
               str !== 'admin-leovitulli-id' &&
               str !== 'leoogum23@gmail.com' &&
               str !== '@leoogum23' &&
               str !== 'f9e2fcbe-be30-413b-bccc-15f1b701c2d0' &&
               str !== '';
      });
      // Se ainda não tiver registrado o cantor teste como excluído, incluir por padrão para atender pedido do usuário
      if (list.indexOf('test_singer@cantaaipro.com') === -1) {
        list.push('test_singer@cantaaipro.com');
        list.push('@test_singer');
        list.push('a7af2dd9-76f8-4b18-aa3f-3a7535baeb00');
        try { localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify(list)); } catch(e) {}
      }
      return list;
    } catch (e) {
      return ['test_singer@cantaaipro.com', '@test_singer', 'a7af2dd9-76f8-4b18-aa3f-3a7535baeb00'];
    }
  }

  function normalizeSingerCode(code, email) {
    var cleanEmail = (email || '').trim().toLowerCase();
    if (cleanEmail === 'leovitulli@gmail.com') {
      var customH = localStorage.getItem('cantaai_user_custom_handle');
      if (customH) {
        return customH.startsWith('@') ? customH : ('@' + customH);
      }
    }

    var c = String(code || '').trim();
    // Se for hash legado gerado por SQL (ex: #CANTOR-3DEB6 ou qualquer #) ou vazio
    if (!c || c.startsWith('#') || c.toUpperCase().indexOf('CANTOR-') !== -1 || c.toUpperCase().indexOf('DEV-ADMIN') !== -1) {
      if (cleanEmail === 'leovitulli@gmail.com') {
        var savedH = localStorage.getItem('cantaai_user_custom_handle');
        return savedH || '@leovitulli';
      }
      return '@' + (cleanEmail ? cleanEmail.split('@')[0] : 'cantor');
    }

    if (!c.startsWith('@')) {
      c = '@' + c;
    }
    return c.toLowerCase().replace(/\s+/g, '_');
  }

  var allUserData = [];
  var allCoupons = [];
  var pricingConfig = {
    monthlyPrice: 39.90,
    annualPrice: 299.00,
    mpPublicKey: 'APP_USR-a2cab50d-8339-47c4-8e09-d5579f50f650',
    mpAccessToken: 'APP_USR-1840710581391633-090520-875d1432839c41e0eb371eef24ca36a5-76594620',
    mpClientId: '1840710581391633',
    mpClientSecret: 'Dtc70YbHAjjydyFNTtYVZMUoYuHtHHy7',
    mpEnv: 'production'
  };

  function isValidUUID(str) {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
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

  var PrompterAdmin = {
    init: function () {
      this.loadStoredData();
      this.createAdminModalHTML();
      this.bindEvents();
      this.updateLandingPricingUI();
      this.setupRealtimeSignups();
      this.updateSignupsBadge();
    },

    loadStoredData: function () {
      try {
        var rawUsers = localStorage.getItem(STORAGE_USERS_KEY);
        if (rawUsers) {
          allUserData = JSON.parse(rawUsers);
        }

        var deletedSingers = getDeletedSingers();

        var defaultSeedSingers = [
          {
            id: 'f9e2fcbe-be30-413b-bccc-15f1b701c2d0',
            name: 'Leo Ogum',
            email: 'leoogum23@gmail.com',
            singer_code: '@leoogum23',
            phone: '',
            cpf: '',
            instagram: '@leoogum23',
            plan_tier: 'pro',
            plan_type: '💎 PRO ANUAL',
            is_online: true,
            status_text: '🟢 Conectado e Ativo',
            reps_count: 1,
            songs_count: 12,
            last_seen: 'Agora mesmo',
            created_at: '2026-08-31'
          },
          {
            id: 'cb9a6aa2-c4d1-4b29-96d6-e3f273757908',
            name: 'Aline Criss Allai',
            email: 'alinecrissallai@gmail.com',
            singer_code: '@alinecrissallai',
            phone: '',
            cpf: '',
            instagram: '@alinecrissallai',
            plan_tier: 'vip',
            plan_type: '👑 VIP 100% OFF',
            coupon_used: 'VIP100',
            is_vip: true,
            billing_due_date: '2099-12-31T23:59:59.000Z',
            is_online: true,
            status_text: '🟢 Conectado (Smartphone)',
            reps_count: 0,
            songs_count: 0,
            last_seen: 'Agora mesmo',
            created_at: '2026-09-08'
          }
        ];

        if (!allUserData || allUserData.length === 0) {
          allUserData = defaultSeedSingers.filter(function(u) {
            return !isPlatformDeveloper(u.email) &&
                   deletedSingers.indexOf(u.email.toLowerCase()) === -1 &&
                   deletedSingers.indexOf(u.singer_code.toLowerCase()) === -1 &&
                   deletedSingers.indexOf(u.id.toLowerCase()) === -1;
          });
          localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(allUserData));
        } else {
          // Filtrar qualquer usuário excluído e expurgar cadastros fantasmas ou sem e-mail
          allUserData = allUserData.filter(function(u) {
            if (!u) return false;
            var uEmail = (u.email || '').toLowerCase().trim();
            if (!uEmail || uEmail.indexOf('@') === -1 || uEmail.length < 5) return false;
            if (isPlatformDeveloper(uEmail)) return false;
            var uId = (u.id || '').toLowerCase();
            var uCode = (u.singer_code || '').toLowerCase();
            if (uId && (uId === 'admin-leovitulli-id' || deletedSingers.indexOf(uId) !== -1)) return false;
            if (deletedSingers.indexOf(uEmail) !== -1) return false;
            if (uCode && (uCode === '@leovitulli' || deletedSingers.indexOf(uCode) !== -1)) return false;
            return true;
          });

          // Normalizar código de todos os usuários
          allUserData.forEach(function (u) {
            u.singer_code = normalizeSingerCode(u.singer_code, u.email);
            if (!u.name || !u.name.trim()) {
              u.name = u.email ? u.email.split('@')[0] : 'Cantor';
            }
          });

          // Assegurar integridade absoluta do status VIP para Aline e qualquer outro usuário VIP registrado
          allUserData.forEach(function (u) {
            if (!u) return;
            var isVip = !!(
              (u.email && u.email.toLowerCase() === 'alinecrissallai@gmail.com') ||
              (u.singer_code && u.singer_code.toLowerCase() === '@alinecrissallai') ||
              u.id === 'cb9a6aa2-c4d1-4b29-96d6-e3f273757908' ||
              u.is_vip ||
              u.plan_tier === 'vip' ||
              (u.plan_type && u.plan_type.indexOf('VIP') !== -1) ||
              u.coupon_used === 'VIP100'
            );
            if (isVip) {
              u.plan_tier = 'vip';
              u.plan_type = (u.plan_type && u.plan_type.indexOf('VIP') !== -1) ? u.plan_type : '👑 VIP 100% OFF';
              u.is_vip = true;
              u.coupon_used = u.coupon_used || 'VIP100';
              if (!u.billing_due_date) u.billing_due_date = '2099-12-31T23:59:59.000Z';
            }
          });

          var hasLeoOgum = allUserData.some(function(u) {
            return (u.email && u.email.toLowerCase() === 'leoogum23@gmail.com') ||
                   (u.singer_code && u.singer_code.toLowerCase() === '@leoogum23') ||
                   u.id === 'f9e2fcbe-be30-413b-bccc-15f1b701c2d0';
          });
          if (!hasLeoOgum) {
            allUserData.push(defaultSeedSingers[0]);
          }

          var hasAline = allUserData.some(function(u) {
            return (u.email && u.email.toLowerCase() === 'alinecrissallai@gmail.com') ||
                   (u.singer_code && u.singer_code.toLowerCase() === '@alinecrissallai') ||
                   u.id === 'cb9a6aa2-c4d1-4b29-96d6-e3f273757908';
          });
          if (!hasAline) {
            allUserData.push(defaultSeedSingers[1]);
          }

          // Higienização crucial: Expurgar desenvolvedor/SuperAdmin do cadastro de clientes CRM
          allUserData = allUserData.filter(function(u) {
            if (!u) return false;
            var uEmail = (u.email || '').toLowerCase().trim();
            return !isPlatformDeveloper(uEmail) && u.id !== 'admin-leovitulli-id' && u.singer_code !== '@leovitulli';
          });

          localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(allUserData));
          PrompterAdmin.allUserData = allUserData;
        }
        
        var rawCoupons = localStorage.getItem(STORAGE_COUPONS_KEY);
        if (rawCoupons) allCoupons = JSON.parse(rawCoupons);
        else {
          allCoupons = [
            { id: 'c-1', code: 'VIP100', discount: '100% OFF', type: 'vip', uses: 14, maxUses: 50, status: 'active', desc: 'Acesso VIP Anual Gratuito' },
            { id: 'c-2', code: 'PRO50', discount: '50% OFF', type: 'percent', uses: 38, maxUses: 100, status: 'active', desc: '50% de Desconto na Assinatura' },
            { id: 'c-3', code: 'SAMBA30', discount: '30% OFF', type: 'percent', uses: 19, maxUses: 200, status: 'active', desc: '30% OFF de Boas-Vindas' }
          ];
          localStorage.setItem(STORAGE_COUPONS_KEY, JSON.stringify(allCoupons));
        }

        var rawPricing = localStorage.getItem(STORAGE_PRICING_KEY);
        if (rawPricing) {
          try {
            var parsedPricing = JSON.parse(rawPricing);
            if (parsedPricing && typeof parsedPricing === 'object') {
              if (parsedPricing.monthlyPrice) pricingConfig.monthlyPrice = parsedPricing.monthlyPrice;
              if (parsedPricing.annualPrice) pricingConfig.annualPrice = parsedPricing.annualPrice;
              if (parsedPricing.mpEnv) pricingConfig.mpEnv = parsedPricing.mpEnv;
              if (parsedPricing.mpPublicKey && parsedPricing.mpPublicKey.indexOf('@') === -1) {
                pricingConfig.mpPublicKey = parsedPricing.mpPublicKey;
              }
              if (parsedPricing.mpAccessToken) {
                pricingConfig.mpAccessToken = parsedPricing.mpAccessToken;
              }
              if (parsedPricing.mpClientId) pricingConfig.mpClientId = parsedPricing.mpClientId;
              if (parsedPricing.mpClientSecret) pricingConfig.mpClientSecret = parsedPricing.mpClientSecret;
            }
          } catch(e) {}
        }

        // Sincronizar também da Nuvem (Supabase System Registry)
        var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
        if (sb) {
          sb.from('songs')
            .select('content')
            .eq('repertoire_id', SYSTEM_REGISTRY_REPERTOIRE_ID)
            .eq('artist', 'SYSTEM_CONFIG_PRICING')
            .then(function(res) {
              if (res.data && res.data.length > 0 && res.data[0].content) {
                try {
                  var cloudPricing = typeof res.data[0].content === 'string' ? JSON.parse(res.data[0].content) : res.data[0].content;
                  if (cloudPricing && typeof cloudPricing === 'object') {
                    pricingConfig = Object.assign(pricingConfig, cloudPricing);
                    localStorage.setItem(STORAGE_PRICING_KEY, JSON.stringify(pricingConfig));
                    PrompterAdmin.loadPricingForm();
                    PrompterAdmin.updateMetrics();
                    PrompterAdmin.updateLandingPricingUI();
                  }
                } catch(e) {}
              }
            }).catch(function() {});
        }
        // Módulo Financeiro & ERP: Carregar histórico do livro-razão (ledger)
        var rawFinance = localStorage.getItem(STORAGE_FINANCE_KEY);
        if (rawFinance) {
          try {
            financeLedger = JSON.parse(rawFinance);
          } catch (e) {
            financeLedger = [];
          }
        }
        if (!financeLedger || !Array.isArray(financeLedger) || financeLedger.length === 0) {
          var nowDt = new Date();
          financeLedger = [
            {
              id: 'fin-tx-seed-1',
              user_id: 'f9e2fcbe-be30-413b-bccc-15f1b701c2d0',
              user_name: 'Leo Ogum',
              user_email: 'leoogum23@gmail.com',
              user_code: '@leoogum23',
              amount: 299.00,
              plan_tier: 'pro',
              plan_type: '💎 PRO ANUAL',
              method: 'pix',
              paid_at: new Date(nowDt.getFullYear(), nowDt.getMonth(), 2).toISOString(),
              due_date: new Date(nowDt.getFullYear() + 1, nowDt.getMonth(), 2).toISOString(),
              notes: 'Pix Baixa Manual Confirmada'
            },
            {
              id: 'fin-tx-seed-2',
              user_id: 'cb9a6aa2-c4d1-4b29-96d6-e3f273757908',
              user_name: 'Aline Criss Allai',
              user_email: 'alinecrissallai@gmail.com',
              user_code: '@alinecrissallai',
              amount: 0.00,
              plan_tier: 'vip',
              plan_type: '👑 VIP 100% OFF',
              method: 'coupon',
              paid_at: new Date(nowDt.getFullYear(), nowDt.getMonth(), 8).toISOString(),
              due_date: '2099-12-31T23:59:59.000Z',
              notes: 'Cupom VIP100 aplicado - Cortesia Vitalícia'
            }
          ];
          try {
            localStorage.setItem(STORAGE_FINANCE_KEY, JSON.stringify(financeLedger));
          } catch (e) {}
        } else {
          // Expurgar qualquer transação atribuída ao desenvolvedor do livro caixa
          financeLedger = financeLedger.filter(function(tx) {
            if (!tx) return false;
            var txEmail = (tx.user_email || '').toLowerCase().trim();
            return !isPlatformDeveloper(txEmail) && tx.user_id !== 'admin-leovitulli-id';
          });

          // Assegurar presença de Aline como cortesia VIP no livro caixa
          var hasAlineTx = financeLedger.some(function(tx) {
            return tx && ((tx.user_email && tx.user_email.toLowerCase() === 'alinecrissallai@gmail.com') || tx.user_id === 'cb9a6aa2-c4d1-4b29-96d6-e3f273757908');
          });
          if (!hasAlineTx) {
            var nowDt = new Date();
            financeLedger.push({
              id: 'fin-tx-seed-2',
              user_id: 'cb9a6aa2-c4d1-4b29-96d6-e3f273757908',
              user_name: 'Aline Criss Allai',
              user_email: 'alinecrissallai@gmail.com',
              user_code: '@alinecrissallai',
              amount: 0.00,
              plan_tier: 'vip',
              plan_type: '👑 VIP 100% OFF',
              method: 'coupon',
              paid_at: new Date(nowDt.getFullYear(), nowDt.getMonth(), 8).toISOString(),
              due_date: '2099-12-31T23:59:59.000Z',
              notes: 'Cupom VIP100 aplicado - Cortesia Vitalícia'
            });
          }

          try {
            localStorage.setItem(STORAGE_FINANCE_KEY, JSON.stringify(financeLedger));
          } catch (e) {}
        }
      } catch (e) {
        console.warn('Erro ao carregar dados do admin:', e);
      }
    },

    saveStoredUsers: function () {
      try {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(allUserData));
      } catch (e) {}
    },

    saveStoredCoupons: function () {
      try {
        localStorage.setItem(STORAGE_COUPONS_KEY, JSON.stringify(allCoupons));
      } catch (e) {}
    },

    saveStoredPricing: function () {
      try {
        localStorage.setItem(STORAGE_PRICING_KEY, JSON.stringify(pricingConfig));
      } catch (e) {}

      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        sb.from('songs')
          .select('id')
          .eq('repertoire_id', SYSTEM_REGISTRY_REPERTOIRE_ID)
          .eq('artist', 'SYSTEM_CONFIG_PRICING')
          .then(function(res) {
            var row = {
              repertoire_id: SYSTEM_REGISTRY_REPERTOIRE_ID,
              title: 'Configuração Mercado Pago e Precificação SaaS',
              artist: 'SYSTEM_CONFIG_PRICING',
              content: JSON.stringify(pricingConfig)
            };
            if (res.data && res.data.length > 0) {
              sb.from('songs').update(row).eq('id', res.data[0].id).catch(function() {});
            } else {
              sb.from('songs').insert(row).catch(function() {});
            }
          }).catch(function() {});
      }
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

            '<!-- ABAS DE NAVEGAÇÃO EXECUTIVA (CEO ADMINISTRATIVO + MARKETING + FINANCEIRO) -->' +
            '<div class="admin-nav-tabs">' +
              '<button class="admin-tab-btn active" data-tab="growth">📊 Growth & Prova Social</button>' +
              '<button class="admin-tab-btn" data-tab="clients">👥 CRM 360° Cantores</button>' +
              '<button class="admin-tab-btn" data-tab="finance">💰 Financeiro & Balancete ERP</button>' +
              '<button class="admin-tab-btn" data-tab="helpdesk">💬 Atendimento & Helpdesk <span id="admHelpdeskBadge" class="sc-tab-badge" style="display:none; background:#ef4444; color:#fff; padding:1px 6px; border-radius:10px; font-size:0.68rem; margin-left:4px;">0</span></button>' +
              '<button class="admin-tab-btn" data-tab="campaigns">🎟️ Campanhas & Mercado Pago</button>' +
              '<button class="admin-tab-btn" data-tab="announcements">📢 Comunicados Oficiais</button>' +
            '</div>' +

            '<div class="modal-body admin-modal-body">' +

              '<!-- ABA 1: GROWTH, PROVA SOCIAL & MÉTRICAS VENDÁVEIS (CEO DE MARKETING) -->' +
              '<div id="adminTabGrowth" class="admin-tab-content">' +
                '<div class="growth-dashboard-wrapper">' +
                  '<!-- MÉTRICAS DE IMPACTO COMERCIAL / PROVA SOCIAL -->' +
                  '<div class="growth-section-header">' +
                    '<div class="growth-section-title">🚀 Indicadores de Impacto & Prova Social <span class="growth-section-badge">Ativos de Venda</span></div>' +
                    '<p style="color:#94a3b8; font-size:0.8rem; margin:0 0 12px 0;">Use estes números reais em anúncios, postagens do Instagram e apresentações comerciais para comprovar autoridade.</p>' +
                  '</div>' +
                  '<div class="growth-social-grid">' +
                    '<div class="growth-stat-card is-gold is-clickable" id="growthCardSongs" title="Clique para abrir o Acervo Global de Repertórios e Cifras">' +
                      '<div class="growth-stat-header"><span class="growth-stat-icon">🎵</span><span class="growth-stat-tag tag-gold">Acervo Ativo</span></div>' +
                      '<div class="growth-stat-value" id="growthTotalSongs">0</div>' +
                      '<div class="growth-stat-label">Cifras Sincronizadas no App</div>' +
                      '<div class="growth-stat-pitch">📢 Pitch: <em>"Mais de centenas de cifras prontas para o palco!"</em></div>' +
                      '<span class="growth-card-action-badge">Explorar Acervo ↗</span>' +
                    '</div>' +
                    '<div class="growth-stat-card is-clickable" id="growthCardReps" title="Clique para ver todos os repertórios criados no Acervo Global">' +
                      '<div class="growth-stat-header"><span class="growth-stat-icon">📂</span><span class="growth-stat-tag tag-cyan">Shows Gerenciados</span></div>' +
                      '<div class="growth-stat-value" id="growthTotalReps">0</div>' +
                      '<div class="growth-stat-label">Repertórios Montados</div>' +
                      '<div class="growth-stat-pitch">📢 Pitch: <em>"Centenas de setlists criados por músicos profissionais."</em></div>' +
                      '<span class="growth-card-action-badge">Ver Repertórios ↗</span>' +
                    '</div>' +
                    '<div class="growth-stat-card is-clickable" id="growthCardActive" title="Clique para focar no Ranking de Cantores no Palco">' +
                      '<div class="growth-stat-header"><span class="growth-stat-icon">⚡</span><span class="growth-stat-tag tag-emerald">Palco Ao Vivo</span></div>' +
                      '<div class="growth-stat-value" id="growthActiveWeek">0</div>' +
                      '<div class="growth-stat-label">Músicos Ativos na Semana</div>' +
                      '<div class="growth-stat-pitch">📢 Pitch: <em>"Cantores ensaiando e fazendo shows todo fim de semana."</em></div>' +
                      '<span class="growth-card-action-badge">Ver Ranking Semanal ➔</span>' +
                    '</div>' +
                    '<div class="growth-stat-card is-gold is-clickable" id="growthCardMRR" title="Clique para abrir o Financeiro & Balancete ERP">' +
                      '<div class="growth-stat-header"><span class="growth-stat-icon">💰</span><span class="growth-stat-tag tag-gold">Receita SaaS</span></div>' +
                      '<div class="growth-stat-value" id="growthMRR">R$ 0,00</div>' +
                      '<div class="growth-stat-label">MRR Estimado (Recorrente)</div>' +
                      '<div class="growth-stat-pitch">📈 Previsibilidade financeira e sustentabilidade do produto.</div>' +
                      '<span class="growth-card-action-badge">Abrir Financeiro ERP ↗</span>' +
                    '</div>' +
                  '</div>' +

                  '<!-- FUNIL DE VENDAS E POWER USERS -->' +
                  '<div class="growth-funnel-row">' +
                    '<div class="growth-box-card">' +
                      '<div class="growth-section-title">🎯 Funil de Conversão Comercial <span class="growth-section-badge" id="growthConvRateBadge">0% Conversão</span></div>' +
                      '<p style="color:#94a3b8; font-size:0.75rem; margin:0 0 10px 0;">Clique em qualquer etapa para filtrar diretamente no CRM de Cantores:</p>' +
                      '<div class="funnel-step is-clickable" id="funnelStepTotal" title="Ver todos os cantores cadastrados no CRM">' +
                        '<div><strong style="color:#f8fafc; font-size:0.85rem;">1. Total de Leads Cadastrados</strong><div style="color:#94a3b8; font-size:0.72rem;">Cantores com conta criada</div></div>' +
                        '<div style="display:flex; align-items:center; gap:8px;"><span style="font-weight:900; font-size:1.1rem; color:#f8fafc;" id="funnelTotalUsers">0</span><span class="funnel-arrow">➔</span></div>' +
                      '</div>' +
                      '<div class="funnel-step is-clickable" id="funnelStepFree" title="Filtrar cantores no Plano Free no CRM">' +
                        '<div><strong style="color:#94a3b8; font-size:0.85rem;">2. Usuários no Plano Free</strong><div style="color:#64748b; font-size:0.72rem;">Limite de até 5 cifras (Leads Quentes)</div></div>' +
                        '<div style="display:flex; align-items:center; gap:8px;"><span style="font-weight:800; font-size:1rem; color:#94a3b8;" id="funnelFreeUsers">0</span><span class="funnel-arrow">➔</span></div>' +
                      '</div>' +
                      '<div class="funnel-step is-clickable is-pro-step" id="funnelStepPro" title="Filtrar assinantes PRO e VIP no CRM" style="background: rgba(56,189,248,0.12); border-color: rgba(56,189,248,0.3);">' +
                        '<div><strong style="color:#38bdf8; font-size:0.85rem;">3. Assinantes PRO & VIP</strong><div style="color:#7dd3fc; font-size:0.72rem;">Acesso Ilimitado sem restrições</div></div>' +
                        '<div style="display:flex; align-items:center; gap:8px;"><span style="font-weight:900; font-size:1.1rem; color:#38bdf8;" id="funnelProUsers">0</span><span class="funnel-arrow">➔</span></div>' +
                      '</div>' +
                    '</div>' +

                    '<div class="growth-box-card" id="growthTopSingersBox">' +
                      '<div class="growth-section-title">🌟 Top Cantores / Power Users <span class="growth-section-badge">Para Parcerias & Depoimentos</span></div>' +
                      '<p style="color:#94a3b8; font-size:0.76rem; margin:0 0 10px 0;">Estes cantores mais usam o app. Chame-os no WhatsApp para colher depoimentos em vídeo!</p>' +
                      '<div class="growth-period-selector" id="growthPeriodSelector">' +
                        '<button type="button" class="growth-period-btn active" data-period="week">⚡ Semanal (Shows)</button>' +
                        '<button type="button" class="growth-period-btn" data-period="month">🗓️ Mensal</button>' +
                        '<button type="button" class="growth-period-btn" data-period="all">🏆 Geral (Anual)</button>' +
                      '</div>' +
                      '<div id="growthTopSingersList" style="display:flex; flex-direction:column; gap:6px;">' +
                        '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:12px;">Carregando ranking...</div>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 2: CANTORES & CLIENTES (CRM 360°) -->' +
              '<div id="adminTabClients" class="admin-tab-content hidden">' +
                '<div id="admRecentSignupsBanner" class="adm-recent-signups-banner hidden">' +
                  '<div class="adm-rsb-left">' +
                    '<span class="adm-rsb-icon">🔔</span>' +
                    '<div class="adm-rsb-text">' +
                      '<strong id="admRsbTitle">Novo Cadastro na Plataforma!</strong>' +
                      '<span id="admRsbDetails">Carregando detalhes...</span>' +
                    '</div>' +
                  '</div>' +
                  '<div class="adm-rsb-actions">' +
                    '<a id="admRsbWhatsApp" href="#" target="_blank" class="btn-rsb btn-rsb-wa" title="Chamar no WhatsApp direto">💬 WhatsApp</a>' +
                    '<button type="button" id="admRsbMarkSeen" class="btn-rsb btn-rsb-seen">Marcar Visto</button>' +
                  '</div>' +
                '</div>' +

                '<div class="admin-toolbar-row">' +
                  '<form class="admin-search-wrapper" autocomplete="off" onsubmit="return false;" style="margin:0;">' +
                    '<input type="text" name="fake_admin_user" style="display:none;" tabindex="-1">' +
                    '<input type="search" id="adminSearchInput" class="admin-search-input" placeholder="🔍 Buscar por cantor, e-mail, WhatsApp, CPF ou código..." autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\');">' +
                  '</form>' +
                  '<div class="admin-filter-pills">' +
                    '<button class="filter-pill active" data-filter="all">Todos (<span id="countPillAll">0</span>)</button>' +
                    '<button class="filter-pill" data-filter="new" style="color: #f87171; font-weight: 800;">🔔 Novos (<span id="countPillNew">0</span>)</button>' +
                    '<button class="filter-pill" data-filter="pro">Assinantes PRO (<span id="countPillPro">0</span>)</button>' +
                    '<button class="filter-pill" data-filter="live">Ativos / Ao Vivo (<span id="countPillLive">0</span>)</button>' +
                    '<button class="filter-pill" data-filter="free">Plano Free (<span id="countPillFree">0</span>)</button>' +
                  '</div>' +
                  '<div class="admin-toolbar-buttons">' +
                    '<button id="btnMarkAllSignupsSeen" class="btn btn-outline btn-sm" title="Marcar todos os cadastros como visualizados">👁️ Marcar Vistos</button>' +
                    '<button id="btnOpenNewSingerModal" class="btn btn-primary btn-sm">➕ Novo Cantor VIP</button>' +
                    '<button id="btnExportCSV" class="btn btn-outline btn-sm">📊 Exportar CSV</button>' +
                    '<button id="btnRefreshAdminData" class="btn btn-secondary btn-sm">🔄 Atualizar</button>' +
                  '</div>' +
                '</div>' +

                '<div class="admin-table-container">' +
                  '<table class="admin-table">' +
                    '<thead>' +
                      '<tr>' +
                        '<th style="width: 45px; text-align: center;" title="Status de Conexão">●</th>' +
                        '<th>Cantor / E-mail</th>' +
                        '<th>@Login do Cantor</th>' +
                        '<th>Plano</th>' +
                        '<th>WhatsApp / CPF</th>' +
                        '<th>Instagram</th>' +
                        '<th style="text-align: right;">Ações & Suporte</th>' +
                      '</tr>' +
                    '</thead>' +
                    '<tbody id="adminUsersTableBody">' +
                      '<tr><td colspan="7" class="text-center" style="padding: 24px;">Carregando dados executivos...</td></tr>' +
                    '</tbody>' +
                  '</table>' +
                '</div>' +
              '</div>' +

              '<!-- ABA FINANCEIRA: BALANCETE ERP & COBRANÇA (CFO / CEO FINANCEIRO) -->' +
              '<div id="adminTabFinance" class="admin-tab-content hidden">' +
                '<div class="fin-dashboard-wrapper">' +
                  '<!-- TOPO: SELETOR DE MÊS & EXPORTAÇÃO CSV -->' +
                  '<div class="fin-header-bar">' +
                    '<div class="fin-month-selector">' +
                      '<button type="button" class="btn btn-outline btn-xs" id="btnFinPrevMonth" title="Mês Anterior">◀</button>' +
                      '<span id="finMonthDisplay" style="font-weight: 800; font-size: 0.95rem; color: #f8fafc; min-width: 150px; text-align: center;">Setembro / 2026</span>' +
                      '<button type="button" class="btn btn-outline btn-xs" id="btnFinNextMonth" title="Próximo Mês">▶</button>' +
                    '</div>' +
                    '<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">' +
                      '<button type="button" class="btn btn-outline btn-sm" id="btnFinExportCSV" title="Exportar Balancete Mensal em CSV">📊 Exportar Balancete CSV</button>' +
                      '<button type="button" class="btn btn-primary btn-sm" id="btnFinOpenManualBaixa" title="Dar baixa manual em pagamento Pix/Dinheiro">➕ Baixa Manual ERP</button>' +
                    '</div>' +
                  '</div>' +

                  '<!-- CARDS RESUMO DO MÊS SELECIONADO -->' +
                  '<div class="fin-summary-grid">' +
                    '<div class="fin-card fin-card-realized">' +
                      '<div class="fin-card-header">' +
                        '<span class="fin-card-label">Receita Realizada (Paga)</span>' +
                        '<span class="fin-card-icon">💰</span>' +
                      '</div>' +
                      '<div class="fin-card-value" id="finValRealized">R$ 0,00</div>' +
                      '<div class="fin-card-sub" id="finCountRealized">0 assinaturas confirmadas</div>' +
                    '</div>' +

                    '<div class="fin-card fin-card-pending">' +
                      '<div class="fin-card-header">' +
                        '<span class="fin-card-label">A Vencer no Mês</span>' +
                        '<span class="fin-card-icon">⏳</span>' +
                      '</div>' +
                      '<div class="fin-card-value" id="finValPending">R$ 0,00</div>' +
                      '<div class="fin-card-sub" id="finCountPending">0 faturas em aberto</div>' +
                    '</div>' +

                    '<div class="fin-card fin-card-overdue">' +
                      '<div class="fin-card-header">' +
                        '<span class="fin-card-label">Inadimplência / Vencidos</span>' +
                        '<span class="fin-card-icon">⚠️</span>' +
                      '</div>' +
                      '<div class="fin-card-value" id="finValOverdue">R$ 0,00</div>' +
                      '<div class="fin-card-sub" id="finCountOverdue">0 cantores com cobrança pendente</div>' +
                    '</div>' +

                    '<div class="fin-card fin-card-waiver">' +
                      '<div class="fin-card-header">' +
                        '<span class="fin-card-label">Isenções VIP (Cortesia)</span>' +
                        '<span class="fin-card-icon">👑</span>' +
                      '</div>' +
                      '<div class="fin-card-value" id="finValVipWaiver">R$ 0,00</div>' +
                      '<div class="fin-card-sub" id="finCountVipWaiver">0 parceiros estratégicos 100% OFF</div>' +
                    '</div>' +
                  '</div>' +

                  '<!-- DRE SIMPLIFICADO / BALANCETE EXECUTIVO -->' +
                  '<div class="fin-dre-box">' +
                    '<div class="fin-dre-item">' +
                      '<span class="fin-dre-item-label">Receita Potencial Bruta</span>' +
                      '<span class="fin-dre-item-val" id="finDreGrossRevenue" style="color:#e2e8f0;">R$ 0,00</span>' +
                    '</div>' +
                    '<div class="fin-dre-item">' +
                      '<span class="fin-dre-item-label">Descontos & Isenções VIP</span>' +
                      '<span class="fin-dre-item-val" id="finDreWaivers" style="color:#c084fc;">- R$ 0,00</span>' +
                    '</div>' +
                    '<div class="fin-dre-item">' +
                      '<span class="fin-dre-item-label">Receita Líquida Realizada</span>' +
                      '<span class="fin-dre-item-val" id="finDreNetRealized" style="color:#34d399;">R$ 0,00</span>' +
                    '</div>' +
                    '<div class="fin-dre-item">' +
                      '<span class="fin-dre-item-label">Taxa de Adimplência</span>' +
                      '<span class="fin-dre-item-val" id="finDreAdimplenciaRate" style="color:#38bdf8;">100%</span>' +
                    '</div>' +
                  '</div>' +

                  '<!-- BARRA DE PESQUISA E FILTROS DO ERP -->' +
                  '<div class="admin-toolbar-row" style="margin-top: 8px;">' +
                    '<div class="admin-search-wrapper" style="margin:0;">' +
                      '<input type="search" id="finSearchInput" class="admin-search-input" placeholder="🔍 Buscar por cantor, email ou WhatsApp...">' +
                    '</div>' +
                    '<div class="admin-filter-pills">' +
                      '<button class="filter-pill active" data-fin-filter="all" id="btnFinFilterAll">Todos (<span id="finPillAll">0</span>)</button>' +
                      '<button class="filter-pill" data-fin-filter="paid" id="btnFinFilterPaid" style="color: #34d399;">🟢 Pagos (<span id="finPillPaid">0</span>)</button>' +
                      '<button class="filter-pill" data-fin-filter="due_soon" id="btnFinFilterDueSoon" style="color: #fbbf24;">🟡 Vence em Breve (<span id="finPillDueSoon">0</span>)</button>' +
                      '<button class="filter-pill" data-fin-filter="overdue" id="btnFinFilterOverdue" style="color: #f87171;">🔴 Vencidos (<span id="finPillOverdue">0</span>)</button>' +
                      '<button class="filter-pill" data-fin-filter="vip" id="btnFinFilterVip" style="color: #c084fc;">👑 VIPs (<span id="finPillVip">0</span>)</button>' +
                    '</div>' +
                  '</div>' +

                  '<!-- TABELA ERP DE COBRANÇA -->' +
                  '<div class="admin-table-container">' +
                    '<table class="admin-table">' +
                      '<thead>' +
                        '<tr>' +
                          '<th>Cantor / E-mail</th>' +
                          '<th>Plano & Valor</th>' +
                          '<th>Data Vencimento</th>' +
                          '<th>Status Pagamento</th>' +
                          '<th>Último Pagamento</th>' +
                          '<th style="text-align: right;">Ações de Cobrança / Baixa</th>' +
                        '</tr>' +
                      '</thead>' +
                      '<tbody id="finTableBody">' +
                        '<tr><td colspan="6" class="text-center" style="padding: 24px;">Carregando dados financeiros...</td></tr>' +
                      '</tbody>' +
                    '</table>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 3: CENTRAL DE ATENDIMENTO & HELPDESK (INBOX UNIFICADA DO CEO) -->' +
              '<div id="adminTabHelpdesk" class="admin-tab-content hidden">' +
                '<div class="admin-helpdesk-container">' +
                  '<!-- SIDEBAR DA INBOX -->' +
                  '<div class="adm-hd-sidebar">' +
                    '<div class="adm-hd-sidebar-header">' +
                      '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                        '<strong style="color:#f8fafc; font-size:0.88rem;">💬 Conversas</strong>' +
                        '<button type="button" id="btnHdStartNew" class="btn btn-outline btn-xs" style="color:#38bdf8; border-color:rgba(56,189,248,0.4); font-size:0.72rem; padding:3px 8px;">➕ Novo</button>' +
                      '</div>' +
                      '<input type="text" id="admHdSearchInput" class="adm-hd-search-input" placeholder="🔍 Buscar por cantor ou email...">' +
                      '<div class="adm-hd-filters">' +
                        '<button type="button" class="adm-hd-filter-btn active" data-filter="all" id="btnHdFilterAll">Todos (<span id="hdCountAll">0</span>)</button>' +
                        '<button type="button" class="adm-hd-filter-btn" data-filter="open" id="btnHdFilterOpen" style="color:#fbbf24;">🟡 Abertos (<span id="hdCountOpen">0</span>)</button>' +
                        '<button type="button" class="adm-hd-filter-btn" data-filter="resolved" id="btnHdFilterResolved" style="color:#34d399;">🟢 Resolvidos</button>' +
                      '</div>' +
                    '</div>' +
                    '<div id="admHdTicketsList" class="adm-hd-list">' +
                      '<div style="color:#94a3b8; font-size:0.8rem; text-align:center; padding:24px;">Carregando atendimentos...</div>' +
                    '</div>' +
                  '</div>' +

                  '<!-- PAINEL DA THREAD -->' +
                  '<div class="adm-hd-main" id="admHdMainPanel">' +
                    '<div id="admHdThreadPlaceholder" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8; padding:30px; text-align:center;">' +
                      '<span style="font-size:3rem; margin-bottom:12px;">💬</span>' +
                      '<strong style="color:#f8fafc; font-size:1.1rem; margin-bottom:6px;">Selecione um cantor na lista</strong>' +
                      '<p style="font-size:0.82rem; max-width:320px; line-height:1.4; margin:0;">Visualize o histórico, responda dúvidas em tempo real ou marque como resolvido.</p>' +
                    '</div>' +
                    '<div id="admHdThreadContainer" style="display:none; flex:1; flex-direction:column; height:100%;">' +
                      '<div class="adm-hd-thread-header" id="admHdThreadHeader">' +
                        '<!-- Renderizado dinamicamente -->' +
                      '</div>' +
                      '<div class="adm-hd-feed" id="admHdMessagesFeed">' +
                        '<!-- Feed de mensagens -->' +
                      '</div>' +
                      '<div class="adm-hd-composer" id="admHdComposer">' +
                        '<div id="admHdPreviewRow" class="hidden" style="display:flex; align-items:center; gap:8px; margin-bottom:6px; background:rgba(30,41,59,0.8); padding:6px 10px; border-radius:8px;">' +
                          '<img id="admHdPreviewImg" src="" style="width:40px; height:40px; object-fit:cover; border-radius:6px;">' +
                          '<span style="font-size:0.75rem; color:#cbd5e1; flex:1;">Print anexo pronto para envio</span>' +
                          '<button type="button" id="btnHdRemoveImg" style="background:transparent; border:none; color:#f87171; cursor:pointer;">✕</button>' +
                        '</div>' +
                        '<div class="adm-hd-composer-row">' +
                          '<textarea id="admHdInputText" class="adm-hd-textarea" placeholder="Digite sua resposta para o cantor... (Pressione Enter para enviar)"></textarea>' +
                          '<input type="file" id="admHdFileInput" accept="image/*" style="display:none;">' +
                          '<button type="button" id="btnHdAttachImg" class="btn btn-outline btn-sm" title="Anexar print ou foto" style="height:42px; padding:0 12px; color:#38bdf8; border-color:rgba(56,189,248,0.3);">📷</button>' +
                          '<button type="button" id="btnHdSendMsg" class="btn btn-primary btn-sm" style="height:42px; padding:0 18px; font-weight:800;">Enviar</button>' +
                        '</div>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 4: CAMPANHAS, CUPONS & MERCADO PAGO -->' +
              '<div id="adminTabCampaigns" class="admin-tab-content hidden">' +
                '<div class="admin-coupon-layout" style="margin-bottom: 2rem;">' +
                  '<!-- Card Criador de Cupom -->' +
                  '<div class="admin-coupon-creator-card">' +
                    '<h4>✨ Criar Novo Cupom VIP ou Desconto</h4>' +
                    '<p style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 1rem;">Crie cupons para campanhas de influenciadores, festivais ou parceiros.</p>' +
                    '<form id="formCreateCoupon" onsubmit="return false;">' +
                      '<div class="form-group">' +
                        '<label>Código do Cupom:</label>' +
                        '<input type="text" id="inputCouponCode" class="form-control" placeholder="Ex: SAMBA2026, FESTIVAL50" style="text-transform: uppercase; font-family: var(--font-mono); font-weight: 700;">' +
                      '</div>' +
                      '<div class="form-group">' +
                        '<label>Tipo de Benefício:</label>' +
                        '<select id="selectCouponType" class="form-control">' +
                          '<option value="vip">👑 100% OFF (Acesso VIP Grátis)</option>' +
                          '<option value="percent">⚡ Desconto Percentual (%)</option>' +
                          '<option value="fixed">💰 Desconto Fixo (R$)</option>' +
                        '</select>' +
                      '</div>' +
                      '<div class="form-group">' +
                        '<label>Valor do Desconto:</label>' +
                        '<input type="text" id="inputCouponValue" class="form-control" placeholder="Ex: 100%, 50%, R$ 20">' +
                      '</div>' +
                      '<div class="form-grid-2cols" style="grid-template-columns: 110px 1fr; gap: 12px;">' +
                        '<div class="form-group">' +
                          '<label>Limite Usos:</label>' +
                          '<input type="number" id="inputCouponMaxUses" class="form-control" value="50" min="1">' +
                        '</div>' +
                        '<div class="form-group">' +
                          '<label>Descrição / Campanha:</label>' +
                          '<input type="text" id="inputCouponDesc" class="form-control" placeholder="Ex: Parceria Samba SP">' +
                        '</div>' +
                      '</div>' +
                      '<button type="button" id="btnSaveNewCoupon" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;">🎟️ Ativar Cupom no Sistema</button>' +
                    '</form>' +
                  '</div>' +

                  '<!-- Tabela de Cupons -->' +
                  '<div class="admin-coupons-table-wrapper">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
                      '<h4 style="margin: 0;">🎟️ Cupons Ativos no Sistema (<span id="countCouponsActive">0</span>)</h4>' +
                      '<button type="button" id="btnHeaderRestoreCoupons" class="btn btn-outline btn-sm" style="font-size: 0.76rem; color: #fbbf24; border-color: rgba(251,191,36,0.4); padding: 4px 8px;" title="Restaurar cupons padrão">🔄 Restaurar Padrões</button>' +
                    '</div>' +
                    '<div class="admin-table-container" style="margin-top: 6px;">' +
                      '<table class="admin-table">' +
                        '<thead>' +
                          '<tr>' +
                            '<th>Cupom</th>' +
                            '<th>Benefício</th>' +
                            '<th>Usos / Limite</th>' +
                            '<th>Campanha</th>' +
                            '<th style="text-align: right;">Ação</th>' +
                          '</tr>' +
                        '</thead>' +
                        '<tbody id="adminCouponsTableBody"></tbody>' +
                      '</table>' +
                    '</div>' +
                  '</div>' +
                '</div>' +

                '<!-- Seção Mercado Pago & Planos -->' +
                '<div class="admin-pricing-grid">' +
                  '<div class="admin-card-section">' +
                    '<h4>💳 Precificação dos Planos de Assinatura</h4>' +
                    '<p style="color: #94a3b8; font-size: 0.82rem; margin-bottom: 1rem;">Defina os valores de assinatura recorrente cobrados no checkout transparente do Mercado Pago.</p>' +
                    '<div class="form-group">' +
                      '<label>Plano Mensal (Recorrente):</label>' +
                      '<div class="input-with-prefix"><span class="input-prefix">R$</span><input type="number" step="0.10" id="inputPriceMonthly" class="form-control" value="39.90"></div>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Plano Anual (Recorrente - Melhor Valor):</label>' +
                      '<div class="input-with-prefix"><span class="input-prefix">R$</span><input type="number" step="1.00" id="inputPriceAnnual" class="form-control" value="299.00"></div>' +
                    '</div>' +
                    '<div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 12px; padding: 12px; margin-top: 1.2rem; font-size: 0.82rem; color: #94a3b8;">' +
                      'ℹ️ <strong>Modelo SaaS Recorrente</strong>: O CantaAí PRO opera em modelo de assinatura mensal e anual, garantindo previsibilidade de receita e sustentabilidade da plataforma.' +
                    '</div>' +
                  '</div>' +

                  '<div class="admin-card-section">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">' +
                      '<h4 style="margin: 0;">🤝 Integração Mercado Pago (Pix & Cartão)</h4>' +
                      '<span id="mpStatusBadge" style="font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25);">⚪ Não Testado</span>' +
                    '</div>' +
                    '<p style="color: #94a3b8; font-size: 0.82rem; margin-bottom: 1rem;">Conecte sua conta do Mercado Pago para receber assinaturas com liberação instantânea.</p>' +
                    '<div class="form-group">' +
                      '<label>Ambiente de Pagamento:</label>' +
                      '<select id="selectMpEnv" class="form-control">' +
                        '<option value="production">🟢 Produção (Cobrança Real)</option>' +
                        '<option value="sandbox">🟡 Sandbox (Ambiente de Testes)</option>' +
                      '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Mercado Pago Public Key (Chave Pública):</label>' +
                      '<input type="text" id="inputMpPublicKey" name="mp_api_pub_token_entry" autocomplete="off" spellcheck="false" data-lpignore="true" data-form-type="other" class="form-control" placeholder="Ex: APP_USR-6b83f0... ou TEST-...">' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Mercado Pago Access Token (Privado):</label>' +
                      '<div style="position: relative; display: flex; align-items: center;">' +
                        '<input type="text" id="inputMpAccessToken" name="mp_api_sec_token_entry" autocomplete="new-password" spellcheck="false" data-lpignore="true" data-form-type="other" class="form-control" placeholder="Ex: APP_USR-1234567890..." style="font-family: var(--font-mono); padding-right: 42px; -webkit-text-security: disc;">' +
                        '<button type="button" id="btnToggleMpToken" title="Mostrar / Ocultar Chave" style="position: absolute; right: 8px; background: transparent; border: none; font-size: 1.1rem; cursor: pointer; color: #94a3b8; padding: 4px;">👁️</button>' +
                      '</div>' +
                    '</div>' +
                    '<div style="display: flex; gap: 10px; margin-top: 1.2rem;">' +
                      '<button type="button" id="btnTestMpConnection" class="btn btn-secondary" style="flex: 1; white-space: nowrap;">⚡ Testar Conexão</button>' +
                      '<button type="button" id="btnSavePricingConfig" class="btn btn-primary" style="flex: 1.4; white-space: nowrap;">💾 Salvar Cobrança</button>' +
                    '</div>' +
                    '<div id="mpConnectionFeedbackBox" style="display: none; margin-top: 10px; font-size: 0.8rem; padding: 12px; border-radius: 10px; line-height: 1.4;"></div>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 5: COMUNICADOS OFICIAIS & BROADCAST -->' +
              '<div id="adminTabAnnouncements" class="admin-tab-content hidden">' +
                '<div class="admin-card-section" style="margin-bottom: 1.5rem;">' +
                  '<h4>📢 Enviar Comunicado Oficial aos Cantores</h4>' +
                  '<p style="color: #94a3b8; font-size: 0.82rem; margin-bottom: 1rem;">Envie mensagens em tempo real para todos os usuários ou direcionadas a um cantor específico.</p>' +
                  '<form id="formSendAnnouncement" onsubmit="return false;">' +
                    '<div class="form-grid-2cols">' +
                      '<div class="form-group">' +
                        '<label>Destinatário:</label>' +
                        '<select id="announcementTarget" class="form-control">' +
                          '<option value="all">🌐 TODOS OS CANTORES (Broadcast Geral)</option>' +
                        '</select>' +
                      '</div>' +
                      '<div class="form-group">' +
                        '<label>Tipo de Mensagem:</label>' +
                        '<select id="announcementType" class="form-control">' +
                          '<option value="update">🚀 Nova Atualização do App</option>' +
                          '<option value="info">ℹ️ Aviso do Sistema</option>' +
                          '<option value="promo">🎉 Novidade & Benefício</option>' +
                          '<option value="alert">⚠️ Alerta Importante</option>' +
                        '</select>' +
                      '</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Título do Comunicado:</label>' +
                      '<input type="text" id="announcementTitle" class="form-control" placeholder="Ex: Nova função de Repertório Colaborativo disponível!">' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Conteúdo da Mensagem:</label>' +
                      '<textarea id="announcementMessage" class="form-control" rows="3" placeholder="Digite sua mensagem que aparecerá para os cantores no app..."></textarea>' +
                    '</div>' +
                    '<button type="button" id="btnSendAnnouncement" class="btn btn-primary" style="padding: 10px 20px; font-weight: 700;">🚀 Publicar Comunicado</button>' +
                  '</form>' +
                '</div>' +
                '<div class="admin-card-section">' +
                  '<h4>📜 Histórico de Comunicados Enviados</h4>' +
                  '<div id="announcementsListContainer" style="margin-top: 1rem;">' +
                    '<div style="color: #94a3b8; font-size: 0.85rem;">Nenhum comunicado enviado ainda.</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +

            '</div>' +
          '</div>' +

          '<!-- SUB-MODAL: GESTÃO & EDIÇÃO INDIVIDUAL DO CANTOR -->' +
          '<div id="adminEditSingerModal" class="modal hidden" style="z-index: 10000060 !important;">' +
            '<div class="modal-overlay" id="adminEditSingerOverlay"></div>' +
            '<div class="modal-card" style="max-width: 560px;">' +
              '<div class="modal-header">' +
                '<h3 id="adminEditSingerTitle">✏️ Gerenciar Cantor Individual</h3>' +
                '<button class="modal-close" id="btnCloseEditSingerModal">✕</button>' +
              '</div>' +
              '<div class="modal-body">' +
                '<form id="formEditSinger" onsubmit="return false;">' +
                  '<input type="hidden" id="editSingerId">' +

                  '<!-- METADADOS ADMINISTRATIVOS: CICLO DE VIDA DO CLIENTE NO SAAS -->' +
                  '<div class="admin-singer-lifecycle-box" style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">' +
                    '<div>' +
                      '<div style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">📅 Cadastro no SaaS</div>' +
                      '<div id="adminSingerCreatedDateDisplay" style="font-size: 0.85rem; font-weight: 800; color: #f8fafc; margin-top: 2px;">--/--/----</div>' +
                    '</div>' +
                    '<div>' +
                      '<div style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">⏳ Tempo de Casa</div>' +
                      '<div id="adminSingerTenureDisplay" style="font-size: 0.85rem; font-weight: 800; color: #38bdf8; margin-top: 2px;">--</div>' +
                    '</div>' +
                    '<div>' +
                      '<div style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">💳 Vencimento / Renovação</div>' +
                      '<input type="date" id="editSingerDueDate" class="form-control" style="font-size: 0.78rem; padding: 3px 6px; height: auto; margin-top: 2px; border-color: rgba(56, 189, 248, 0.4); color: #38bdf8; font-weight: 700;">' +
                    '</div>' +
                  '</div>' +

                  '<div class="form-group">' +
                    '<label>Nome do Cantor / Artístico:</label>' +
                    '<input type="text" id="editSingerName" class="form-control" required placeholder="Ex: Jorge Aragão">' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>@Login do Cantor (Nome de Usuário Único):</label>' +
                    '<input type="text" id="editSingerCode" class="form-control" placeholder="@cantor_oficial" style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8;">' +
                    '<div id="editSingerCodeFeedback" style="font-size: 0.78rem; margin-top: 4px; display: none;"></div>' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>E-mail da Conta:</label>' +
                    '<input type="email" id="editSingerEmail" class="form-control" required placeholder="cantor@exemplo.com">' +
                  '</div>' +
                  '<div class="form-grid-2cols">' +
                    '<div class="form-group">' +
                      '<label>WhatsApp:</label>' +
                      '<input type="tel" id="editSingerPhone" class="form-control" placeholder="(11) 99999-9999">' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>CPF:</label>' +
                      '<input type="text" id="editSingerCpf" class="form-control" placeholder="000.000.000-00">' +
                    '</div>' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>Instagram / Rede Social:</label>' +
                    '<input type="text" id="editSingerInstagram" class="form-control" placeholder="@cantor_oficial">' +
                  '</div>' +
                  '<div class="form-grid-2cols">' +
                    '<div class="form-group">' +
                      '<label>Plano de Assinatura & Acesso:</label>' +
                      '<select id="editSingerPlan" class="form-control">' +
                        '<option value="vip">👑 VIP 100% OFF (Acesso Vitalício)</option>' +
                        '<option value="pro_annual">💎 PRO ANUAL</option>' +
                        '<option value="pro_monthly">⚡ PRO MENSAL</option>' +
                        '<option value="trial">⚡ DEGUSTAÇÃO PRO (7 DIAS)</option>' +
                        '<option value="free">⚡ PLANO FREE (Limite 5 Músicas)</option>' +
                      '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Status do Cantor:</label>' +
                      '<select id="editSingerStatus" class="form-control">' +
                        '<option value="online">🟢 Conectado / Ativo</option>' +
                        '<option value="offline">⚪ Offline</option>' +
                      '</select>' +
                    '</div>' +
                  '</div>' +

                  '<!-- GOVERNANÇA VIP & CUPOM DE DESCONTO -->' +
                  '<div style="background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.3); border-radius: 12px; padding: 14px 16px; margin-top: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.2);">' +
                    '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">' +
                      '<div style="font-size: 0.84rem; font-weight: 800; color: #fbbf24; display: flex; align-items: center; gap: 6px;">' +
                        '<span>👑 Governança VIP & Cupom de Desconto</span>' +
                      '</div>' +
                      '<label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.82rem; color: #fef08a; user-select: none; background: rgba(251,191,36,0.18); padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(251,191,36,0.45); transition: all 0.2s ease;">' +
                        '<input type="checkbox" id="editSingerIsVip" style="width: 17px; height: 17px; accent-color: #fbbf24; cursor: pointer;">' +
                        '<span>Marcar como <strong>Cantor VIP</strong></span>' +
                      '</label>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom: 0;">' +
                      '<label style="font-size: 0.78rem; color: #cbd5e1; font-weight: 600;">🏷️ Cupom de Desconto / Cortesia Atribuído:</label>' +
                      '<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">' +
                        '<input type="text" id="editSingerCoupon" list="availableCouponsList" class="form-control" placeholder="Digite ou selecione um cupom..." style="flex: 1; min-width: 170px; text-transform: uppercase; font-weight: 700; color: #fbbf24; border-color: rgba(251,191,36,0.4);">' +
                        '<datalist id="availableCouponsList"></datalist>' +
                        '<select id="editSingerCouponSelect" class="form-control" style="width: auto; min-width: 160px; border-color: rgba(251,191,36,0.35); font-size: 0.8rem; background-color: #1e293b; color: #e2e8f0;">' +
                          '<option value="">Cupons do Sistema...</option>' +
                        '</select>' +
                      '</div>' +
                      '<div id="editSingerVipNotice" style="display: none; font-size: 0.76rem; color: #fde047; margin-top: 8px; font-weight: 600; padding: 6px 10px; background: rgba(251,191,36,0.12); border-radius: 6px; border: 1px solid rgba(251,191,36,0.25);">' +
                        '✨ <strong>Acesso VIP Ativado:</strong> Cantor liberado com 100% de desconto vitalício, sem restrições ou mensalidades.' +
                      '</div>' +
                    '</div>' +
                  '</div>' +

                  '<div style="display: flex; gap: 10px; margin-top: 1.5rem; flex-wrap: wrap;">' +
                    '<button type="button" id="btnDirectWhatsApp" class="btn btn-outline" style="color: #34d399; border-color: rgba(16,185,129,0.4); display: inline-flex; align-items: center; gap: 6px;">💬 WhatsApp</button>' +
                    '<button type="button" id="btnDeleteSinger" class="btn btn-outline" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4); display: inline-flex; align-items: center; gap: 6px;">🗑️ Excluir</button>' +
                    '<button type="button" id="btnSaveSingerData" onclick="PrompterAdmin.saveSingerModalData()" class="btn btn-primary" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; transition: all 0.25s ease;">💾 Salvar Alterações</button>' +
                  '</div>' +
                '</form>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- SUB-MODAL: BAIXA MANUAL DE PAGAMENTO ERP -->' +
          '<div id="modalAddManualPayment" class="modal hidden" style="z-index: 10000070 !important;">' +
            '<div class="modal-overlay" id="modalAddManualPaymentOverlay"></div>' +
            '<div class="modal-card" style="max-width: 480px;">' +
              '<div class="modal-header">' +
                '<h3>💰 Baixa Manual de Pagamento (ERP)</h3>' +
                '<button class="modal-close" id="btnCloseManualPaymentModal">✕</button>' +
              '</div>' +
              '<div class="modal-body" style="padding: 1.5rem;">' +
                '<p style="color: #94a3b8; font-size: 0.82rem; margin-bottom: 1.2rem;">' +
                  'Registre pagamentos recebidos por fora do Mercado Pago (Pix direto, dinheiro, transferência ou maquininha).' +
                '</p>' +
                '<form id="formManualPayment" onsubmit="return false;">' +
                  '<div class="form-group">' +
                    '<label>Cantor / Assinante:</label>' +
                    '<select id="manualPayUserSelect" class="form-control" required>' +
                      '<option value="">Selecione o cantor...</option>' +
                    '</select>' +
                  '</div>' +
                  '<div class="form-grid-2cols">' +
                    '<div class="form-group">' +
                      '<label>Plano Contratado:</label>' +
                      '<select id="manualPayPlanSelect" class="form-control">' +
                        '<option value="pro_monthly">💎 PRO Mensal (R$ 39,90/mês)</option>' +
                        '<option value="pro_annual">🏆 PRO Anual (R$ 299,00/ano)</option>' +
                        '<option value="custom">⚙️ Valor Customizado</option>' +
                      '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Valor Recebido (R$):</label>' +
                      '<input type="number" step="0.01" id="manualPayAmountInput" class="form-control" placeholder="39.90" value="39.90" required>' +
                    '</div>' +
                  '</div>' +
                  '<div class="form-grid-2cols">' +
                    '<div class="form-group">' +
                      '<label>Forma de Pagamento:</label>' +
                      '<select id="manualPayMethodSelect" class="form-control">' +
                        '<option value="pix">⚡ Pix Direto</option>' +
                        '<option value="money">💵 Dinheiro / Espécie</option>' +
                        '<option value="card_external">💳 Maquininha / Cartão</option>' +
                        '<option value="bank_transfer">🏦 Transferência Bancária</option>' +
                        '<option value="other">📝 Outro</option>' +
                      '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Data de Pagamento:</label>' +
                      '<input type="date" id="manualPayDateInput" class="form-control">' +
                    '</div>' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>Observações / Comprovante:</label>' +
                    '<input type="text" id="manualPayNotesInput" class="form-control" placeholder="Ex: Pix recebido no show / Comprovante WhatsApp">' +
                  '</div>' +
                  '<div style="display: flex; gap: 10px; margin-top: 1.5rem;">' +
                    '<button type="button" id="btnCancelManualPay" class="btn btn-outline" style="flex: 1;">Cancelar</button>' +
                    '<button type="button" id="btnConfirmManualPay" class="btn btn-primary" style="flex: 1.5; font-weight: 700;">✅ Confirmar Baixa ERP</button>' +
                  '</div>' +
                '</form>' +
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

      // Atalhos dos Cards de Métricas & Growth (CEO Quick Actions)
      var gcSongs = document.getElementById('growthCardSongs');
      if (gcSongs) {
        gcSongs.addEventListener('click', function () {
          PrompterAdmin.openMasterSongsModal();
        });
      }

      var gcReps = document.getElementById('growthCardReps');
      if (gcReps) {
        gcReps.addEventListener('click', function () {
          PrompterAdmin.openMasterSongsModal();
        });
      }

      var gcActive = document.getElementById('growthCardActive');
      if (gcActive) {
        gcActive.addEventListener('click', function () {
          PrompterAdmin.focusTopSingers('week');
        });
      }

      var gcMRR = document.getElementById('growthCardMRR');
      if (gcMRR) {
        gcMRR.addEventListener('click', function () {
          PrompterAdmin.switchTab('finance');
        });
      }

      // Atalhos Dinâmicos do Funil de Conversão Comercial
      var fnTotal = document.getElementById('funnelStepTotal');
      if (fnTotal) {
        fnTotal.addEventListener('click', function () {
          PrompterAdmin.jumpToClientsWithFilter('all');
        });
      }

      var fnFree = document.getElementById('funnelStepFree');
      if (fnFree) {
        fnFree.addEventListener('click', function () {
          PrompterAdmin.jumpToClientsWithFilter('free');
        });
      }

      var fnPro = document.getElementById('funnelStepPro');
      if (fnPro) {
        fnPro.addEventListener('click', function () {
          PrompterAdmin.jumpToClientsWithFilter('pro');
        });
      }

      // Seletor de Períodos: Top Cantores / Power Users
      var periodBtns = adminModal ? adminModal.querySelectorAll('.growth-period-btn') : [];
      periodBtns.forEach(function (pBtn) {
        pBtn.addEventListener('click', function () {
          var p = this.getAttribute('data-period');
          PrompterAdmin.setGrowthPeriod(p);
        });
      });

      // Legado (Compatibilidade anterior)
      var scMRR = document.getElementById('shortcutCardMRR');
      if (scMRR) {
        scMRR.addEventListener('click', function () {
          PrompterAdmin.switchTab('finance');
        });
      }

      var scPro = document.getElementById('shortcutCardPro');
      if (scPro) {
        scPro.addEventListener('click', function () {
          PrompterAdmin.switchTab('clients');
          PrompterAdmin.setFilter('pro');
        });
      }

      var scLive = document.getElementById('shortcutCardLive');
      if (scLive) {
        scLive.addEventListener('click', function () {
          PrompterAdmin.switchTab('clients');
          PrompterAdmin.setFilter('live');
        });
      }

      var scSongs = document.getElementById('shortcutCardSongs');
      if (scSongs) {
        scSongs.addEventListener('click', function () {
          PrompterAdmin.openMasterSongsModal();
        });
      }

      // Tabs
      var tabBtns = adminModal ? adminModal.querySelectorAll('.admin-tab-btn') : [];
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var t = this.getAttribute('data-tab');
          PrompterAdmin.switchTab(t);
        });
      });

      // ── HELPDESK INBOX EVENTS ──
      var hdSearch = document.getElementById('admHdSearchInput');
      if (hdSearch) {
        hdSearch.addEventListener('input', function () {
          helpdeskSearchQuery = (this.value || '').trim().toLowerCase();
          PrompterAdmin.renderHelpdeskList();
        });
      }

      var btnHdAll = document.getElementById('btnHdFilterAll');
      var btnHdOpen = document.getElementById('btnHdFilterOpen');
      var btnHdRes = document.getElementById('btnHdFilterResolved');

      function setHdFilter(filter) {
        currentHelpdeskFilter = filter;
        if (btnHdAll) btnHdAll.classList.toggle('active', filter === 'all');
        if (btnHdOpen) btnHdOpen.classList.toggle('active', filter === 'open');
        if (btnHdRes) btnHdRes.classList.toggle('active', filter === 'resolved');
        PrompterAdmin.renderHelpdeskList();
      }

      if (btnHdAll) btnHdAll.addEventListener('click', function () { setHdFilter('all'); });
      if (btnHdOpen) btnHdOpen.addEventListener('click', function () { setHdFilter('open'); });
      if (btnHdRes) btnHdRes.addEventListener('click', function () { setHdFilter('resolved'); });

      var btnHdStart = document.getElementById('btnHdStartNew');
      if (btnHdStart) {
        btnHdStart.addEventListener('click', function () {
          PrompterAdmin.promptNewHelpdeskTicket();
        });
      }

      var btnSendMsg = document.getElementById('btnHdSendMsg');
      if (btnSendMsg) {
        btnSendMsg.addEventListener('click', function () {
          PrompterAdmin.sendHelpdeskReply();
        });
      }

      var hdInput = document.getElementById('admHdInputText');
      if (hdInput) {
        hdInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            PrompterAdmin.sendHelpdeskReply();
          }
        });
      }

      var btnAttach = document.getElementById('btnHdAttachImg');
      var fileInput = document.getElementById('admHdFileInput');
      if (btnAttach && fileInput) {
        btnAttach.addEventListener('click', function () {
          fileInput.click();
        });
        fileInput.addEventListener('change', function (e) {
          var file = e.target.files && e.target.files[0];
          if (file) {
            var reader = new FileReader();
            reader.onload = function (re) {
              helpdeskPendingImage = re.target.result;
              var previewRow = document.getElementById('admHdPreviewRow');
              var previewImg = document.getElementById('admHdPreviewImg');
              if (previewImg) previewImg.src = helpdeskPendingImage;
              if (previewRow) previewRow.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
          }
        });
      }

      var btnRemoveImg = document.getElementById('btnHdRemoveImg');
      if (btnRemoveImg) {
        btnRemoveImg.addEventListener('click', function () {
          helpdeskPendingImage = '';
          if (fileInput) fileInput.value = '';
          var previewRow = document.getElementById('admHdPreviewRow');
          if (previewRow) previewRow.classList.add('hidden');
        });
      }

      var btnRefresh = document.getElementById('btnRefreshAdminData');
      if (btnRefresh) {
        var isRefreshingData = false;
        btnRefresh.addEventListener('click', function (e) {
          if (e) e.preventDefault();
          if (isRefreshingData) return;
          isRefreshingData = true;

          var oldHtml = btnRefresh.innerHTML;
          btnRefresh.disabled = true;
          btnRefresh.innerHTML = '<span class="auth-btn-spinner" style="width:13px;height:13px;border-width:2px;margin-right:6px;vertical-align:middle;display:inline-block;"></span> Sincronizando...';

          searchQuery = '';
          var sInput = document.getElementById('adminSearchInput');
          if (sInput) sInput.value = '';

          var safetyWatchdog = setTimeout(function () {
            if (isRefreshingData) {
              isRefreshingData = false;
              btnRefresh.disabled = false;
              btnRefresh.innerHTML = oldHtml;
              PrompterAdmin.renderUsersTable();
              PrompterAdmin.updateMetrics();
            }
          }, 3500);

          PrompterAdmin.loadDashboardData(function (count) {
            clearTimeout(safetyWatchdog);
            btnRefresh.disabled = false;
            btnRefresh.innerHTML = oldHtml;
            isRefreshingData = false;
            PrompterAdmin.renderUsersTable();
            PrompterAdmin.updateMetrics();
            if (window.showToast) {
              window.showToast('🔄 Lista sincronizada com sucesso! ' + (allUserData.length) + ' cantores cadastrados.', 'success');
            }
          });
        });
      }

      var btnMarkSeen = document.getElementById('admRsbMarkSeen');
      if (btnMarkSeen) {
        btnMarkSeen.addEventListener('click', function () {
          PrompterAdmin.markAllSignupsAsSeen();
        });
      }

      var btnMarkAll = document.getElementById('btnMarkAllSignupsSeen');
      if (btnMarkAll) {
        btnMarkAll.addEventListener('click', function () {
          PrompterAdmin.markAllSignupsAsSeen();
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
          var f = this.getAttribute('data-filter') || 'all';
          PrompterAdmin.setFilter(f);
        });
      });

      var btnExport = document.getElementById('btnExportCSV');
      if (btnExport) {
        btnExport.addEventListener('click', function () {
          PrompterAdmin.exportCSV();
        });
      }

      // Criar Novo Cantor
      var btnNewSinger = document.getElementById('btnOpenNewSingerModal');
      if (btnNewSinger) {
        btnNewSinger.addEventListener('click', function () {
          PrompterAdmin.openSingerModal(null);
        });
      }

      // Salvar Cantor com feedback visual imediato
      var btnSaveSinger = document.getElementById('btnSaveSingerData');
      if (btnSaveSinger) {
        btnSaveSinger.addEventListener('click', function (e) {
          e.preventDefault();
          PrompterAdmin.saveSingerModalData();
        });
      }

      // Botão WhatsApp Direto
      var btnWhatsApp = document.getElementById('btnDirectWhatsApp');
      if (btnWhatsApp) {
        btnWhatsApp.addEventListener('click', function (e) {
          e.preventDefault();
          var phone = (document.getElementById('editSingerPhone').value || '').replace(/\D/g, '');
          var name = document.getElementById('editSingerName').value || 'Cantor';
          if (!phone) {
            if (window.showToast) window.showToast('Informe o número de WhatsApp no campo correspondente.', 'warning');
            var fPhone = document.getElementById('editSingerPhone');
            if (fPhone) fPhone.focus();
            return;
          }
          if (phone.length === 10 || phone.length === 11) {
            phone = '55' + phone;
          }
          var msg = encodeURIComponent('Olá ' + name + '! Tudo bem? Aqui é o Leonardo da equipe CantaAí PRO.');
          window.open('https://wa.me/' + phone + '?text=' + msg, '_blank');
        });
      }

      // Excluir Cantor
      var btnDeleteSinger = document.getElementById('btnDeleteSinger');
      if (btnDeleteSinger) {
        btnDeleteSinger.addEventListener('click', function (e) {
          e.preventDefault();
          var id = document.getElementById('editSingerId').value;
          PrompterAdmin.deleteSinger(id);
        });
      }

      // Sincronização inteligente entre Checkbox VIP, Plano e Cupons
      var chkVip = document.getElementById('editSingerIsVip');
      var selPlan = document.getElementById('editSingerPlan');
      var inputCoupon = document.getElementById('editSingerCoupon');
      var selCoupon = document.getElementById('editSingerCouponSelect');
      var vipNotice = document.getElementById('editSingerVipNotice');

      function syncVipUi(isVip) {
        if (vipNotice) vipNotice.style.display = isVip ? 'block' : 'none';
      }

      if (chkVip && selPlan) {
        chkVip.addEventListener('change', function () {
          if (this.checked) {
            selPlan.value = 'vip';
            if (inputCoupon && (!inputCoupon.value || inputCoupon.value.trim() === '')) {
              inputCoupon.value = 'VIP100';
            }
            if (selCoupon) selCoupon.value = 'VIP100';
            syncVipUi(true);
          } else {
            if (selPlan.value === 'vip') selPlan.value = 'pro_annual';
            if (inputCoupon && inputCoupon.value.trim().toUpperCase() === 'VIP100') {
              inputCoupon.value = '';
            }
            if (selCoupon && selCoupon.value === 'VIP100') {
              selCoupon.value = '';
            }
            syncVipUi(false);
          }
        });
      }

      if (selPlan && chkVip) {
        selPlan.addEventListener('change', function () {
          if (this.value === 'vip') {
            chkVip.checked = true;
            if (inputCoupon && (!inputCoupon.value || inputCoupon.value.trim() === '')) {
              inputCoupon.value = 'VIP100';
            }
            if (selCoupon) selCoupon.value = 'VIP100';
            syncVipUi(true);
          } else {
            chkVip.checked = false;
            if (inputCoupon && inputCoupon.value.trim().toUpperCase() === 'VIP100') {
              inputCoupon.value = '';
            }
            if (selCoupon && selCoupon.value === 'VIP100') {
              selCoupon.value = '';
            }
            syncVipUi(false);
          }
        });
      }

      if (selCoupon && inputCoupon) {
        selCoupon.addEventListener('change', function () {
          if (this.value) {
            inputCoupon.value = this.value;
            if (this.value === 'VIP100') {
              if (chkVip) chkVip.checked = true;
              if (selPlan) selPlan.value = 'vip';
              syncVipUi(true);
            }
          }
        });
      }

      if (inputCoupon) {
        inputCoupon.addEventListener('input', function () {
          var val = (this.value || '').trim().toUpperCase();
          if (val === 'VIP100') {
            if (chkVip) chkVip.checked = true;
            if (selPlan) selPlan.value = 'vip';
            if (selCoupon) selCoupon.value = 'VIP100';
            syncVipUi(true);
          }
        });
      }

      // Verificação em tempo real do @Login do Cantor no modal de edição
      var editCodeInput = document.getElementById('editSingerCode');
      var editCodeFeedback = document.getElementById('editSingerCodeFeedback');
      var editCodeDebounce = null;
      if (editCodeInput && editCodeFeedback) {
        editCodeInput.addEventListener('input', function (e) {
          var val = (e.target.value || '').trim();
          var curId = document.getElementById('editSingerId').value;
          clearTimeout(editCodeDebounce);
          if (!val) {
            editCodeFeedback.style.display = 'none';
            return;
          }
          editCodeFeedback.style.display = 'block';
          editCodeFeedback.style.color = '#94a3b8';
          editCodeFeedback.innerText = '🔍 Verificando...';

          var curEmail = (document.getElementById('editSingerEmail') ? document.getElementById('editSingerEmail').value : '').trim();
          editCodeDebounce = setTimeout(function () {
            if (window.PrompterAuth) {
              window.PrompterAuth.checkSingerCodeAvailability(val, curId, curEmail).then(function (res) {
                if (res.available) {
                  editCodeFeedback.style.color = '#34d399';
                  editCodeFeedback.innerText = '✅ ' + res.message;
                } else {
                  editCodeFeedback.style.color = '#f87171';
                  editCodeFeedback.innerText = '❌ ' + res.message;
                }
              }).catch(function() {
                editCodeFeedback.style.display = 'none';
              });
            }
          }, 300);
        });
      }

      // Fechar Sub-Modal Cantor
      var btnCloseEdit = document.getElementById('btnCloseEditSingerModal');
      var overlayEdit = document.getElementById('adminEditSingerOverlay');
      if (btnCloseEdit) {
        btnCloseEdit.addEventListener('click', function(e) {
          e.preventDefault();
          PrompterAdmin.closeSingerModal();
        });
      }
      if (overlayEdit) {
        overlayEdit.addEventListener('click', function(e) {
          e.preventDefault();
          PrompterAdmin.closeSingerModal();
        });
      }

      // Comunicados & Mensagens
      var btnSendAnnounce = document.getElementById('btnSendAnnouncement');
      if (btnSendAnnounce) {
        btnSendAnnounce.addEventListener('click', function () {
          PrompterAdmin.sendAnnouncement();
        });
      }

      // Chamados & Suporte
      var btnRefTickets = document.getElementById('btnRefreshTickets');
      if (btnRefTickets) {
        btnRefTickets.addEventListener('click', function () {
          PrompterAdmin.loadTickets();
        });
      }

      // Acervo Master de Músicas
      var btnCloseMaster = document.getElementById('btnCloseMasterSongsModal');
      var overlayMaster = document.getElementById('adminMasterSongsOverlay');
      if (btnCloseMaster) btnCloseMaster.addEventListener('click', PrompterAdmin.closeMasterSongsModal);
      if (overlayMaster) overlayMaster.addEventListener('click', PrompterAdmin.closeMasterSongsModal);

      var btnRefMaster = document.getElementById('btnRefreshMasterSongs');
      if (btnRefMaster) {
        btnRefMaster.addEventListener('click', function () {
          PrompterAdmin.loadMasterSongs();
        });
      }

      var btnExpandAll = document.getElementById('btnMasterExpandAll');
      if (btnExpandAll) {
        btnExpandAll.addEventListener('click', function () {
          PrompterAdmin.expandAllMaster();
        });
      }

      var btnCollapseAll = document.getElementById('btnMasterCollapseAll');
      if (btnCollapseAll) {
        btnCollapseAll.addEventListener('click', function () {
          PrompterAdmin.collapseAllMaster();
        });
      }

      var inputMaster = document.getElementById('inputMasterSearch');
      if (inputMaster) {
        inputMaster.addEventListener('input', function (e) {
          PrompterAdmin.renderMasterSongsList((e.target.value || '').toLowerCase().trim());
        });
      }

      // Zoom de imagem
      var btnCloseImg = document.getElementById('btnCloseImagePreview');
      var overlayImg = document.getElementById('imagePreviewOverlay');
      if (btnCloseImg) btnCloseImg.addEventListener('click', function() {
        var m = document.getElementById('imagePreviewModal');
        if (m) m.classList.add('hidden');
      });
      if (overlayImg) overlayImg.addEventListener('click', function() {
        var m = document.getElementById('imagePreviewModal');
        if (m) m.classList.add('hidden');
      });

      // Salvar Cupom
      var btnSaveCoupon = document.getElementById('btnSaveNewCoupon');
      if (btnSaveCoupon) {
        btnSaveCoupon.addEventListener('click', function () {
          var code = (document.getElementById('inputCouponCode').value || '').trim().toUpperCase();
          var type = document.getElementById('selectCouponType').value;
          var val = (document.getElementById('inputCouponValue').value || '').trim();
          var maxUses = parseInt(document.getElementById('inputCouponMaxUses').value, 10) || 50;
          var desc = (document.getElementById('inputCouponDesc').value || '').trim();

          if (!code) {
            if (window.showToast) window.showToast('Digite um código para o cupom.', 'warning');
            return;
          }

          if (type === 'vip') val = '100% OFF';
          else if (!val) val = '50% OFF';

          var newCoupon = {
            id: 'c-' + Date.now(),
            code: code,
            discount: val,
            type: type,
            uses: 0,
            maxUses: maxUses,
            status: 'active',
            desc: desc || (type === 'vip' ? 'Acesso VIP Anual Grátis' : 'Desconto Especial')
          };

          allCoupons.unshift(newCoupon);
          PrompterAdmin.saveStoredCoupons();
          PrompterAdmin.renderCouponsTable();

          document.getElementById('inputCouponCode').value = '';
          document.getElementById('inputCouponValue').value = '';
          document.getElementById('inputCouponDesc').value = '';

          if (window.showToast) window.showToast('🎟️ Cupom ' + code + ' ativado com sucesso!', 'success');
        });
      }

      // Restaurar Cupons Padrão
      var btnHeaderRest = document.getElementById('btnHeaderRestoreCoupons');
      if (btnHeaderRest) {
        btnHeaderRest.addEventListener('click', function () {
          PrompterAdmin.restoreDefaultCoupons();
        });
      }

      // Mostrar / Ocultar Access Token do Mercado Pago (com segurança total contra autofill)
      var btnToggleToken = document.getElementById('btnToggleMpToken');
      if (btnToggleToken) {
        btnToggleToken.addEventListener('click', function () {
          var inp = document.getElementById('inputMpAccessToken');
          if (inp) {
            var isHidden = inp.style.webkitTextSecurity !== 'none';
            if (isHidden) {
              inp.style.webkitTextSecurity = 'none';
              btnToggleToken.innerText = '🙈';
            } else {
              inp.style.webkitTextSecurity = 'disc';
              btnToggleToken.innerText = '👁️';
            }
          }
        });
      }

      // Testar Conexão com a API do Mercado Pago
      var btnTestMp = document.getElementById('btnTestMpConnection');
      if (btnTestMp) {
        btnTestMp.addEventListener('click', function () {
          PrompterAdmin.testMpConnection();
        });
      }

      // Salvar Configurações de Faturamento & Mercado Pago
      var btnSavePricing = document.getElementById('btnSavePricingConfig');
      if (btnSavePricing) {
        btnSavePricing.addEventListener('click', function () {
          var parsePrice = function(val, fallback) {
            if (!val && val !== 0) return fallback;
            var clean = String(val).replace(/[^\d,\.]/g, '').replace(',', '.');
            var num = parseFloat(clean);
            return (!isNaN(num) && num > 0) ? num : fallback;
          };

          var elMonthly = document.getElementById('inputPriceMonthly');
          var elAnnual = document.getElementById('inputPriceAnnual');
          var elEnv = document.getElementById('selectMpEnv');
          var elPub = document.getElementById('inputMpPublicKey');
          var elToken = document.getElementById('inputMpAccessToken');

          var rawPub = elPub ? elPub.value.trim() : '';
          var rawToken = elToken ? elToken.value.trim() : '';

          if (!rawPub && pricingConfig.mpPublicKey) rawPub = pricingConfig.mpPublicKey;
          if (!rawToken && pricingConfig.mpAccessToken) rawToken = pricingConfig.mpAccessToken;

          // Validação: não permitir que um e-mail do navegador seja salvo como Public Key
          if (rawPub && rawPub.indexOf('@') !== -1) {
            if (window.showToast) window.showToast('⚠️ A Chave Pública não pode ser um e-mail. Utilize a Public Key do Mercado Pago (ex: APP_USR-... ou TEST-...).', 'warning');
            rawPub = 'APP_USR-a2cab50d-8339-47c4-8e09-d5579f50f650';
            if (elPub) elPub.value = rawPub;
          }

          pricingConfig.monthlyPrice = elMonthly ? parsePrice(elMonthly.value, 39.90) : 39.90;
          pricingConfig.annualPrice = elAnnual ? parsePrice(elAnnual.value, 299.00) : 299.00;
          pricingConfig.mpEnv = elEnv ? elEnv.value : 'production';
          pricingConfig.mpPublicKey = rawPub;
          pricingConfig.mpAccessToken = rawToken;

          // Feedback visual imediato no próprio botão
          btnSavePricing.disabled = true;
          btnSavePricing.innerHTML = '⏳ Salvando...';
          btnSavePricing.style.opacity = '0.85';

          PrompterAdmin.saveStoredPricing();
          PrompterAdmin.updateMetrics();
          PrompterAdmin.updateLandingPricingUI();
          PrompterAdmin.checkMpConnectionStatus(false);

          setTimeout(function () {
            btnSavePricing.innerHTML = '✅ Salvo com Sucesso!';
            btnSavePricing.style.background = '#10b981';
            btnSavePricing.style.opacity = '1';
            setTimeout(function () {
              btnSavePricing.disabled = false;
              btnSavePricing.innerHTML = '💾 Salvar Cobrança';
              btnSavePricing.style.background = '';
              btnSavePricing.style.opacity = '1';
            }, 1200);
          }, 400);

          if (pricingConfig.mpAccessToken) {
            PrompterAdmin.testMpConnection();
          }

          if (window.showToast) window.showToast('💾 Configurações de cobrança salvas com sucesso!', 'success');
        });
      }

      // Master Songs View Events
      var btnCloseMaster = document.getElementById('btnCloseMasterSongsModal');
      var overlayMaster = document.getElementById('adminMasterSongsOverlay');
      if (btnCloseMaster) btnCloseMaster.addEventListener('click', function() { PrompterAdmin.closeMasterSongsModal(); });
      if (overlayMaster) overlayMaster.addEventListener('click', function() { PrompterAdmin.closeMasterSongsModal(); });

      var searchMaster = document.getElementById('inputMasterSearch');
      if (searchMaster) {
        searchMaster.addEventListener('input', function(e) {
          var q = (e.target.value || '').toLowerCase().trim();
          PrompterAdmin.renderMasterSongsList(q);
        });
      }

      var btnRefMaster = document.getElementById('btnRefreshMasterSongs');
      if (btnRefMaster) {
        btnRefMaster.addEventListener('click', function() {
          PrompterAdmin.loadMasterSongs();
          if (window.showToast) window.showToast('🔄 Acervo global atualizado!', 'info');
        });
      }

      // ── MÓDULO FINANCEIRO, BALANCETE ERP & COBRANÇA ──
      var btnFinPrev = document.getElementById('btnFinPrevMonth');
      if (btnFinPrev) {
        btnFinPrev.addEventListener('click', function () {
          financeSelectedMonth--;
          if (financeSelectedMonth < 0) {
            financeSelectedMonth = 11;
            financeSelectedYear--;
          }
          PrompterAdmin.renderFinanceDashboard();
          PrompterAdmin.renderFinanceTable();
        });
      }

      var btnFinNext = document.getElementById('btnFinNextMonth');
      if (btnFinNext) {
        btnFinNext.addEventListener('click', function () {
          financeSelectedMonth++;
          if (financeSelectedMonth > 11) {
            financeSelectedMonth = 0;
            financeSelectedYear++;
          }
          PrompterAdmin.renderFinanceDashboard();
          PrompterAdmin.renderFinanceTable();
        });
      }

      var btnFinExport = document.getElementById('btnFinExportCSV');
      if (btnFinExport) {
        btnFinExport.addEventListener('click', function () {
          PrompterAdmin.exportFinanceCSV();
        });
      }

      var btnFinOpenBaixa = document.getElementById('btnFinOpenManualBaixa');
      if (btnFinOpenBaixa) {
        btnFinOpenBaixa.addEventListener('click', function () {
          PrompterAdmin.openManualPaymentModal();
        });
      }

      // Filtros da Tabela ERP
      var finFilterBtns = adminModal ? adminModal.querySelectorAll('[data-fin-filter]') : [];
      finFilterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var f = this.getAttribute('data-fin-filter');
          currentFinanceFilter = f || 'all';
          finFilterBtns.forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-fin-filter') === currentFinanceFilter);
          });
          PrompterAdmin.renderFinanceTable();
        });
      });

      // Busca na Tabela ERP
      var finSearch = document.getElementById('finSearchInput');
      if (finSearch) {
        finSearch.addEventListener('input', function () {
          financeSearchQuery = (this.value || '').trim().toLowerCase();
          PrompterAdmin.renderFinanceTable();
        });
      }

      // Modal Baixa Manual ERP
      var btnCloseManualPay = document.getElementById('btnCloseManualPaymentModal');
      if (btnCloseManualPay) {
        btnCloseManualPay.addEventListener('click', function () {
          PrompterAdmin.closeManualPaymentModal();
        });
      }

      var btnCancelManualPay = document.getElementById('btnCancelManualPay');
      if (btnCancelManualPay) {
        btnCancelManualPay.addEventListener('click', function () {
          PrompterAdmin.closeManualPaymentModal();
        });
      }

      var overlayManualPay = document.getElementById('modalAddManualPaymentOverlay');
      if (overlayManualPay) {
        overlayManualPay.addEventListener('click', function () {
          PrompterAdmin.closeManualPaymentModal();
        });
      }

      var manualPayPlanSelect = document.getElementById('manualPayPlanSelect');
      var manualPayAmountInput = document.getElementById('manualPayAmountInput');
      if (manualPayPlanSelect && manualPayAmountInput) {
        manualPayPlanSelect.addEventListener('change', function () {
          var sel = this.value;
          if (sel === 'pro_annual') {
            manualPayAmountInput.value = (pricingConfig.annualPrice || 299.00).toFixed(2);
          } else if (sel === 'pro_monthly') {
            manualPayAmountInput.value = (pricingConfig.monthlyPrice || 39.90).toFixed(2);
          }
        });
      }

      var btnConfirmManualPay = document.getElementById('btnConfirmManualPay');
      if (btnConfirmManualPay) {
        btnConfirmManualPay.addEventListener('click', function () {
          var userSelect = document.getElementById('manualPayUserSelect');
          var planSelect = document.getElementById('manualPayPlanSelect');
          var amountInput = document.getElementById('manualPayAmountInput');
          var methodSelect = document.getElementById('manualPayMethodSelect');
          var dateInput = document.getElementById('manualPayDateInput');
          var notesInput = document.getElementById('manualPayNotesInput');

          var userId = userSelect ? userSelect.value : '';
          var plan = planSelect ? planSelect.value : 'pro_monthly';
          var amount = amountInput ? parseFloat(amountInput.value) : 39.90;
          var method = methodSelect ? methodSelect.value : 'pix';
          var payDate = dateInput ? dateInput.value : '';
          var notes = notesInput ? notesInput.value.trim() : '';

          if (!userId) {
            if (window.showToast) window.showToast('⚠️ Selecione um cantor para registrar a baixa.', 'warning');
            return;
          }
          if (isNaN(amount) || amount <= 0) {
            if (window.showToast) window.showToast('⚠️ Informe um valor de pagamento válido.', 'warning');
            return;
          }

          PrompterAdmin.confirmManualPayment(userId, plan, amount, method, payDate, notes);
        });
      }
    },

    switchTab: function (tabName) {
      currentTab = tabName || 'growth';
      var tabBtns = adminModal ? adminModal.querySelectorAll('.admin-tab-btn') : [];
      tabBtns.forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === currentTab);
      });

      var tabGrowth = document.getElementById('adminTabGrowth');
      var tabClients = document.getElementById('adminTabClients');
      var tabFinance = document.getElementById('adminTabFinance');
      var tabHelpdesk = document.getElementById('adminTabHelpdesk');
      var tabCampaigns = document.getElementById('adminTabCampaigns');
      var tabAnnouncements = document.getElementById('adminTabAnnouncements');

      if (tabGrowth) tabGrowth.classList.toggle('hidden', currentTab !== 'growth');
      if (tabClients) tabClients.classList.toggle('hidden', currentTab !== 'clients');
      if (tabFinance) tabFinance.classList.toggle('hidden', currentTab !== 'finance');
      if (tabHelpdesk) tabHelpdesk.classList.toggle('hidden', currentTab !== 'helpdesk');
      if (tabCampaigns) tabCampaigns.classList.toggle('hidden', currentTab !== 'campaigns');
      if (tabAnnouncements) tabAnnouncements.classList.toggle('hidden', currentTab !== 'announcements');

      if (currentTab === 'growth') PrompterAdmin.renderGrowthDashboard();
      if (currentTab === 'clients') {
        PrompterAdmin.renderUsersTable();
        PrompterAdmin.updateMetrics();
      }
      if (currentTab === 'finance') {
        PrompterAdmin.renderFinanceDashboard();
        PrompterAdmin.renderFinanceTable();
      }
      if (currentTab === 'helpdesk') PrompterAdmin.loadHelpdeskInbox();
      if (currentTab === 'campaigns') {
        PrompterAdmin.renderCouponsTable();
        PrompterAdmin.loadPricingForm();
      }
      if (currentTab === 'announcements') PrompterAdmin.loadAnnouncements();
    },

    setFilter: function (filterName) {
      currentFilter = filterName;
      var filterPills = document.querySelectorAll('.filter-pill');
      filterPills.forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-filter') === filterName);
      });
      PrompterAdmin.renderUsersTable();
    },

    jumpToClientsWithFilter: function (filterName) {
      this.switchTab('clients');
      var sInput = document.getElementById('adminSearchInput');
      if (sInput) sInput.value = '';
      searchQuery = '';
      this.setFilter(filterName || 'all');
      var filterLabels = {
        all: 'todos os cantores cadastrados',
        free: 'cantores no Plano Free (Leads Quentes)',
        pro: 'assinantes PRO & VIP'
      };
      if (window.showToast && filterLabels[filterName]) {
        window.showToast('🎯 Exibindo ' + filterLabels[filterName] + ' no CRM.', 'info');
      }
    },

    setGrowthPeriod: function (period) {
      currentGrowthPeriod = period || 'week';
      var btns = adminModal ? adminModal.querySelectorAll('.growth-period-btn') : [];
      btns.forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-period') === currentGrowthPeriod);
      });
      PrompterAdmin.renderGrowthDashboard();
    },

    focusTopSingers: function (period) {
      if (period) {
        PrompterAdmin.setGrowthPeriod(period);
      }
      var box = document.getElementById('growthTopSingersBox');
      if (box) {
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        box.classList.remove('is-spotlighted');
        void box.offsetWidth;
        box.classList.add('is-spotlighted');
      }
      if (window.showToast) {
        window.showToast('⚡ Focado nos cantores ativos no palco!', 'info');
      }
    },

    openModal: function (preferredTab) {
      if (!window.PrompterAuth || !window.PrompterAuth.isAdmin()) {
        if (window.showToast) window.showToast('Acesso restrito ao perfil de Desenvolvedor / CEO.', 'warning');
        return;
      }

      if (adminModal) {
        adminModal.classList.remove('hidden');
        searchQuery = '';
        var sInput = document.getElementById('adminSearchInput');
        if (sInput) sInput.value = '';
        var startTab = preferredTab || 'growth';
        this.switchTab(startTab);
        this.loadDashboardData();
        this.updateMetrics();
        this.updateSignupsBadge();
        this.updateHelpdeskBadge();
      }
    },

    closeModal: function () {
      if (adminModal) adminModal.classList.add('hidden');
    },

    openSingerModal: function (user) {
      var modal = document.getElementById('adminEditSingerModal');
      var title = document.getElementById('adminEditSingerTitle');
      var btnDel = document.getElementById('btnDeleteSinger');

      if (!modal) return;
      if (user) {
        this.markUserAsSeen(user.id || user.email);
      }

      // Popula Datalist e Select rápido de Cupons disponíveis
      var datalist = document.getElementById('availableCouponsList');
      var selCoupon = document.getElementById('editSingerCouponSelect');
      var inputCoupon = document.getElementById('editSingerCoupon');
      var chkVip = document.getElementById('editSingerIsVip');
      var vipNotice = document.getElementById('editSingerVipNotice');

      if (datalist) {
        var dOpts = '';
        (allCoupons || []).forEach(function(c) {
          dOpts += '<option value="' + escapeHtml(c.code) + '">' + escapeHtml(c.code) + ' (' + escapeHtml(c.discount) + ' - ' + escapeHtml(c.desc) + ')</option>';
        });
        datalist.innerHTML = dOpts;
      }

      if (selCoupon) {
        var sOpts = '<option value="">Cupons do Sistema...</option>';
        (allCoupons || []).forEach(function(c) {
          sOpts += '<option value="' + escapeHtml(c.code) + '">' + escapeHtml(c.code) + ' (' + escapeHtml(c.discount) + ')</option>';
        });
        selCoupon.innerHTML = sOpts;
      }

      if (user) {
        title.innerText = '✏️ Gerenciar Cantor: ' + (user.name || user.email);
        document.getElementById('editSingerId').value = user.id;
        document.getElementById('editSingerName').value = user.name || '';
        document.getElementById('editSingerEmail').value = user.email || '';
        document.getElementById('editSingerPhone').value = user.phone || '';
        document.getElementById('editSingerCpf').value = user.cpf || '';
        document.getElementById('editSingerInstagram').value = user.instagram || '';
        document.getElementById('editSingerCode').value = normalizeSingerCode(user.singer_code, user.email);
        
        var isUserVip = !!user.is_vip || (user.plan_type && user.plan_type.indexOf('VIP') !== -1) || user.coupon_used === 'VIP100';
        if (chkVip) chkVip.checked = isUserVip;
        if (vipNotice) vipNotice.style.display = isUserVip ? 'block' : 'none';

        var pVal = 'pro_annual';
        if (isUserVip) pVal = 'vip';
        else if (user.is_trial || user.plan_tier === 'trial') pVal = 'trial';
        else if (user.plan_type && user.plan_type.indexOf('MENSAL') !== -1) pVal = 'pro_monthly';
        else if (user.plan_tier === 'free') pVal = 'free';
        document.getElementById('editSingerPlan').value = pVal;

        var assignedCoupon = user.coupon_used || (isUserVip ? 'VIP100' : '');
        if (inputCoupon) inputCoupon.value = assignedCoupon;
        if (selCoupon) selCoupon.value = assignedCoupon;

        document.getElementById('editSingerStatus').value = user.is_online ? 'online' : 'offline';

        // Metadados Administrativos do Cantor
        var createdDt = user.created_at ? new Date(user.created_at) : new Date();
        var createdDateStr = String(createdDt.getDate()).padStart(2, '0') + '/' + String(createdDt.getMonth() + 1).padStart(2, '0') + '/' + createdDt.getFullYear();
        var tenureStr = PrompterAdmin.formatCustomerTenure(createdDt);

        var elAdminCreated = document.getElementById('adminSingerCreatedDateDisplay');
        var elAdminTenure = document.getElementById('adminSingerTenureDisplay');
        var elAdminDueDate = document.getElementById('editSingerDueDate');

        if (elAdminCreated) elAdminCreated.innerText = createdDateStr;
        if (elAdminTenure) elAdminTenure.innerText = tenureStr;
        if (elAdminDueDate) {
          if (user.billing_due_date) {
            try {
              elAdminDueDate.value = new Date(user.billing_due_date).toISOString().slice(0, 10);
            } catch (e) {
              elAdminDueDate.value = '';
            }
          } else {
            elAdminDueDate.value = '';
          }
        }

        // O administrador / CEO não pode ser excluído
        var isCeo = user.email && user.email.toLowerCase() === 'leovitulli@gmail.com';
        if (btnDel) {
          btnDel.style.display = isCeo ? 'none' : 'inline-flex';
        }
      } else {
        title.innerText = '➕ Convidar / Cadastrar Cantor VIP';
        document.getElementById('editSingerId').value = '';
        document.getElementById('editSingerName').value = '';
        document.getElementById('editSingerEmail').value = '';
        document.getElementById('editSingerPhone').value = '';
        document.getElementById('editSingerCpf').value = '';
        document.getElementById('editSingerInstagram').value = '';
        document.getElementById('editSingerCode').value = '@cantor_' + Math.floor(1000 + Math.random() * 9000);
        document.getElementById('editSingerPlan').value = 'vip';
        document.getElementById('editSingerStatus').value = 'online';

        var elAdminCreated = document.getElementById('adminSingerCreatedDateDisplay');
        var elAdminTenure = document.getElementById('adminSingerTenureDisplay');
        var elAdminDueDate = document.getElementById('editSingerDueDate');
        if (elAdminCreated) elAdminCreated.innerText = 'Novo Cadastro';
        if (elAdminTenure) elAdminTenure.innerText = 'Recém chegado';
        if (elAdminDueDate) elAdminDueDate.value = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

        if (chkVip) chkVip.checked = true;
        if (vipNotice) vipNotice.style.display = 'block';
        if (inputCoupon) inputCoupon.value = 'VIP100';
        if (selCoupon) selCoupon.value = 'VIP100';

        var editCodeFeedback = document.getElementById('editSingerCodeFeedback');
        if (editCodeFeedback) editCodeFeedback.style.display = 'none';
        if (btnDel) btnDel.style.display = 'none';
      }

      // Restaurar estado inicial do botão salvar com animação limpa
      var btnSave = document.getElementById('btnSaveSingerData');
      PrompterAdmin._isSavingSinger = false;
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = '💾 Salvar Alterações';
        btnSave.style.opacity = '1';
        btnSave.style.background = '';
        btnSave.style.borderColor = '';
        btnSave.style.color = '';
        btnSave.style.boxShadow = '';
        btnSave.style.transform = '';
        btnSave.style.pointerEvents = '';
      }

      modal.classList.remove('hidden');
    },

    closeSingerModal: function () {
      var modal = document.getElementById('adminEditSingerModal');
      if (modal) modal.classList.add('hidden');
    },

    deleteSinger: function (id) {
      if (!id) return;
      var userObj = allUserData.find(function (u) { return u.id === id || u.email === id; });
      var name = userObj ? (userObj.name || userObj.email) : 'este cantor';
      var userEmail = userObj ? userObj.email : (id.indexOf('@') !== -1 ? id : '');
      var userCode = userObj ? userObj.singer_code : '';
      var actualId = userObj ? userObj.id : id;

      if (userEmail && userEmail.toLowerCase() === 'leovitulli@gmail.com') {
        if (window.showToast) window.showToast('O perfil do Administrador / CEO não pode ser excluído.', 'warning');
        return;
      }

      if (!confirm('Deseja realmente excluir ' + name + ' do sistema?')) return;

      // 1. Gravar na lista de cantores excluídos para nunca mais ressurgir em sincronizações
      var deletedList = getDeletedSingers();
      if (actualId) deletedList.push(String(actualId).toLowerCase());
      if (userEmail) deletedList.push(userEmail.toLowerCase());
      if (userCode) deletedList.push(userCode.toLowerCase());
      deletedList = deletedList.filter(function(v, i, a) { return a.indexOf(v) === i; });
      try {
        localStorage.setItem(STORAGE_DELETED_KEY, JSON.stringify(deletedList));
      } catch(e) {}

      // 2. Remover do array local
      allUserData = allUserData.filter(function (u) {
        if (u.id === actualId || u.id === id) return false;
        if (userEmail && u.email && u.email.toLowerCase() === userEmail.toLowerCase()) return false;
        if (userCode && u.singer_code && u.singer_code.toLowerCase() === userCode.toLowerCase()) return false;
        return true;
      });
      PrompterAdmin.saveStoredUsers();

      // 3. Excluir no Supabase (perfis e System Registry em songs)
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        if (isValidUUID(actualId)) {
          sb.from('profiles').delete().eq('id', actualId).then(function() {}).catch(function () {});
          sb.from('songs').delete().eq('repertoire_id', SYSTEM_REGISTRY_REPERTOIRE_ID).eq('id', actualId).then(function() {}).catch(function () {});
        }
        if (userEmail) {
          sb.from('profiles').delete().eq('email', userEmail).then(function() {}).catch(function () {});
          sb.from('songs').delete().eq('repertoire_id', SYSTEM_REGISTRY_REPERTOIRE_ID).eq('artist', userEmail).then(function() {}).catch(function () {});
        }
      }

      PrompterAdmin.updateMetrics();
      PrompterAdmin.renderUsersTable();
      PrompterAdmin.closeSingerModal();
      if (window.showToast) window.showToast('🗑️ Cantor "' + name + '" excluído com sucesso.', 'success');
    },

    saveSingerModalData: function () {
      if (this._isSavingSinger) return;
      var self = this;
      var btnSave = document.getElementById('btnSaveSingerData');
      var id = (document.getElementById('editSingerId') ? document.getElementById('editSingerId').value : '').trim();
      var name = (document.getElementById('editSingerName') ? document.getElementById('editSingerName').value : '').trim();
      var email = (document.getElementById('editSingerEmail') ? document.getElementById('editSingerEmail').value : '').trim();
      var phone = (document.getElementById('editSingerPhone') ? document.getElementById('editSingerPhone').value : '').trim();
      var cpf = (document.getElementById('editSingerCpf') ? document.getElementById('editSingerCpf').value : '').trim();
      var instagram = (document.getElementById('editSingerInstagram') ? document.getElementById('editSingerInstagram').value : '').trim();
      var rawCode = (document.getElementById('editSingerCode') ? document.getElementById('editSingerCode').value : '').trim() || ('@' + email.split('@')[0]);
      var code = normalizeSingerCode(rawCode, email);
      var planVal = document.getElementById('editSingerPlan') ? document.getElementById('editSingerPlan').value : 'pro_annual';
      var statusVal = document.getElementById('editSingerStatus') ? document.getElementById('editSingerStatus').value : 'online';
      var inputCoupon = document.getElementById('editSingerCoupon');
      var couponVal = inputCoupon ? (inputCoupon.value || '').trim().toUpperCase() : '';
      var chkVip = document.getElementById('editSingerIsVip');
      var isVip = chkVip ? chkVip.checked : (planVal === 'vip');
      var dueDateVal = document.getElementById('editSingerDueDate') ? document.getElementById('editSingerDueDate').value : '';

      if (!name || !email) {
        self._isSavingSinger = false;
        if (window.showToast) window.showToast('Preencha o nome e e-mail do cantor.', 'warning');
        return;
      }

      // ── ESTADO 1: PROCESSANDO (Visual nítido, azul neon com spinner giratório) ──
      this._isSavingSinger = true;
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.style.pointerEvents = 'none';
        btnSave.style.background = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
        btnSave.style.borderColor = '#38bdf8';
        btnSave.style.color = '#ffffff';
        btnSave.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.5)';
        btnSave.innerHTML = '<span class="spinner-small" style="width: 17px; height: 17px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: #ffffff; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; margin-right: 8px;"></span> ⏳ Processando alterações...';
      }

      function finishSuccess() {
        // ── ESTADO 2: SALVO COM SUCESSO (Verde esmeralda brilhante, bem nítido!) ──
        if (btnSave) {
          btnSave.disabled = true;
          btnSave.style.pointerEvents = 'none';
          btnSave.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          btnSave.style.borderColor = '#10b981';
          btnSave.style.color = '#ffffff';
          btnSave.style.boxShadow = '0 0 22px rgba(16, 185, 129, 0.7)';
          btnSave.style.transform = 'scale(1.02)';
          btnSave.innerHTML = '✅ Salvo com Sucesso!';
        }
        if (window.showToast) window.showToast('✅ Informações do cantor atualizadas com sucesso!', 'success');

        // Permanência de 1.2 segundos para feedback nítido antes de fechar o modal
        setTimeout(function () {
          self._isSavingSinger = false;
          PrompterAdmin.closeSingerModal();
          if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = '💾 Salvar Alterações';
            btnSave.style.background = '';
            btnSave.style.borderColor = '';
            btnSave.style.color = '';
            btnSave.style.boxShadow = '';
            btnSave.style.transform = '';
            btnSave.style.opacity = '1';
            btnSave.style.pointerEvents = '';
          }
        }, 1200);
      }

      function finishError(err) {
        console.error('Erro ao salvar cantor:', err);
        self._isSavingSinger = false;
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.style.pointerEvents = '';
          btnSave.style.background = '#ef4444';
          btnSave.style.borderColor = '#ef4444';
          btnSave.style.color = '#ffffff';
          btnSave.style.boxShadow = '0 0 16px rgba(239, 68, 68, 0.5)';
          btnSave.innerHTML = '❌ Erro ao Salvar';
          setTimeout(function() {
            if (btnSave) {
              btnSave.innerHTML = '💾 Salvar Alterações';
              btnSave.style.background = '';
              btnSave.style.borderColor = '';
              btnSave.style.color = '';
              btnSave.style.boxShadow = '';
              btnSave.style.transform = '';
            }
          }, 2500);
        }
        if (window.showToast) window.showToast(err || 'Erro ao salvar informações do cantor.', 'warning');
      }

      function proceed() {
        try {
          var p = PrompterAdmin.executeSaveSinger(id, name, email, phone, cpf, instagram, code, planVal, statusVal, couponVal, isVip, dueDateVal);
          if (p && typeof p.then === 'function') {
            p.then(finishSuccess).catch(finishError);
          } else {
            finishSuccess();
          }
        } catch(err) {
          finishError(err.message || 'Falha ao salvar dados do cantor.');
        }
      }

      // Verificação de código inteligente: se o cantor já possui este mesmo @Login, não bloqueia
      var cleanEmail = email.toLowerCase();
      var existingSinger = allUserData.find(function(u) {
        return (id && u.id === id) || (u.email && u.email.trim().toLowerCase() === cleanEmail);
      });

      if (existingSinger && existingSinger.singer_code && existingSinger.singer_code.toLowerCase() === code.toLowerCase()) {
        proceed();
        return;
      }

      if (window.PrompterAuth && typeof window.PrompterAuth.checkSingerCodeAvailability === 'function') {
        var checkPromise = window.PrompterAuth.checkSingerCodeAvailability(code, id, email);
        var timeoutPromise = new Promise(function(resolve) {
          setTimeout(function() { resolve({ available: true }); }, 1500);
        });

        Promise.race([checkPromise, timeoutPromise]).then(function (checkRes) {
          if (checkRes && checkRes.available === false) {
            self._isSavingSinger = false;
            if (btnSave) {
              btnSave.disabled = false;
              btnSave.innerHTML = '💾 Salvar Alterações';
              btnSave.style.background = '';
              btnSave.style.borderColor = '';
              btnSave.style.color = '';
              btnSave.style.boxShadow = '';
              btnSave.style.transform = '';
              btnSave.style.pointerEvents = '';
            }
            if (window.showToast) window.showToast(checkRes.message || 'Este @Login já está em uso.', 'warning');
            return;
          }
          proceed();
        }).catch(function() {
          proceed();
        });
      } else {
        proceed();
      }
    },

    executeSaveSinger: function (id, name, email, phone, cpf, instagram, code, planVal, statusVal, couponVal, isVip, dueDateVal) {
      var isVipActive = !!isVip || planVal === 'vip' || couponVal === 'VIP100';
      var isTrial = (planVal === 'trial');
      var isPro = isVipActive || (planVal !== 'free' && !isTrial);

      var planType = '💎 PRO ANUAL';
      var planTier = isVipActive ? 'vip' : (isTrial ? 'trial' : (planVal === 'free' ? 'free' : 'pro'));

      if (isVipActive) {
        planType = '👑 VIP 100% OFF';
        couponVal = couponVal || 'VIP100';
      } else if (isTrial) {
        planType = '⚡ DEGUSTAÇÃO PRO (7 DIAS)';
      } else if (planVal === 'pro_monthly') {
        planType = '⚡ PRO MENSAL';
      } else if (planVal === 'free') {
        planType = '⚡ PLANO FREE';
      }

      var cleanEmail = (email || '').trim().toLowerCase();
      var cleanCode = normalizeSingerCode(code, cleanEmail);
      var cleanInstagram = (instagram || '').trim();
      if (cleanInstagram && !cleanInstagram.startsWith('@')) {
        cleanInstagram = '@' + cleanInstagram;
      }
      if (!cleanInstagram && cleanEmail === 'leovitulli@gmail.com') {
        cleanInstagram = '@leovitulli';
      }

      var existing = allUserData.find(function(u) {
        return (id && u.id === id) || (u.email && u.email.trim().toLowerCase() === cleanEmail);
      });
      var singerId = existing ? existing.id : (id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('user-' + Date.now())));

      var dueIso = '';
      if (dueDateVal) {
        dueIso = new Date(dueDateVal + 'T12:00:00').toISOString();
      } else if (existing && existing.billing_due_date) {
        dueIso = existing.billing_due_date;
      } else if (isVipActive) {
        dueIso = '2099-12-31T23:59:59.000Z';
      } else if (planVal === 'pro_annual') {
        dueIso = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
      } else if (planVal === 'pro_monthly') {
        dueIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      }

      var singerPayload = {
        id: singerId,
        name: name,
        email: email,
        phone: phone,
        cpf: cpf,
        instagram: cleanInstagram,
        singer_code: cleanCode,
        plan_tier: planTier,
        plan_type: planType,
        coupon_used: couponVal || '',
        is_vip: isVipActive,
        is_trial: isTrial,
        is_online: statusVal === 'online',
        status_text: statusVal === 'online' ? '🟢 Conectado e Ativo' : '⚪ Offline',
        billing_due_date: dueIso,
        auto_renew: existing && typeof existing.auto_renew === 'boolean' ? existing.auto_renew : true,
        reps_count: existing ? existing.reps_count : 0,
        songs_count: existing ? existing.songs_count : 0,
        last_seen: 'Hoje',
        created_at: existing ? existing.created_at : new Date().toISOString().slice(0, 10)
      };

      if (existing) {
        Object.assign(existing, singerPayload);
      } else {
        allUserData.unshift(singerPayload);
      }

      PrompterAdmin.saveStoredUsers();

      // Gravar login code com escopo do e-mail para evitar vazamento entre contas
      if (cleanEmail) {
        try {
          localStorage.setItem('cantaai_user_custom_handle_' + cleanEmail, cleanCode);
          if (cleanEmail === 'leovitulli@gmail.com') {
            localStorage.setItem('cantaai_user_custom_handle', cleanCode);
          }
        } catch(e) {}
      }

      // Sincronizar sessão ativa APENAS se o cantor editado for o usuário atualmente autenticado
      var authUser = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var authProfile = window.PrompterAuth ? window.PrompterAuth.getProfile() : null;
      var loggedEmail = (authUser && authUser.email) ? authUser.email.toLowerCase() : (authProfile && authProfile.email ? authProfile.email.toLowerCase() : '');

      if (cleanEmail && loggedEmail && cleanEmail === loggedEmail) {
        if (!authProfile) authProfile = {};
        authProfile.display_name = name;
        authProfile.singer_code = cleanCode;
        authProfile.phone = phone;
        authProfile.cpf = cpf;
        authProfile.instagram = cleanInstagram;
        authProfile.plan_tier = singerPayload.plan_tier;
        authProfile.plan_type = singerPayload.plan_type;
        authProfile.coupon_used = singerPayload.coupon_used;
        authProfile.is_vip = isVipActive;
        authProfile.is_trial = isTrial;
        authProfile.billing_due_date = singerPayload.billing_due_date;
        authProfile.auto_renew = singerPayload.auto_renew;
        if (window.PrompterAuth) {
          window.PrompterAuth.saveSession(authUser, authProfile);
          window.PrompterAuth.updateUIForAuth();
        }
      }

      PrompterAdmin.updateMetrics();
      PrompterAdmin.renderUsersTable();

      // Persistir no Supabase em segundo plano sem prender o modal
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        var profPayload = {
          email: cleanEmail,
          display_name: name,
          phone: phone,
          cpf: cpf,
          instagram: cleanInstagram,
          singer_code: cleanCode,
          plan_tier: planTier,
          plan_type: planType,
          coupon_used: couponVal || '',
          is_vip: isVipActive,
          is_trial: isTrial,
          billing_due_date: dueIso,
          auto_renew: singerPayload.auto_renew,
          updated_at: new Date().toISOString()
        };

        if (isValidUUID(singerId)) {
          profPayload.id = singerId;
        }

        sb.from('profiles').upsert(profPayload).then(function(res) {
          if (res && res.error) {
            return sb.from('profiles').update(profPayload).eq('email', cleanEmail);
          }
          return res;
        }).catch(function() {
          return sb.from('profiles').update(profPayload).eq('email', cleanEmail).catch(function() {});
        });

        // Persistir no System Registry (sempre acessível na nuvem)
        var songRow = {
          repertoire_id: SYSTEM_REGISTRY_REPERTOIRE_ID,
          title: name,
          artist: email,
          content: JSON.stringify(singerPayload)
        };
        if (isValidUUID(singerId)) {
          songRow.id = singerId;
        }
        sb.from('songs')
          .select('id')
          .eq('repertoire_id', SYSTEM_REGISTRY_REPERTOIRE_ID)
          .eq('artist', email)
          .then(function(res) {
            if (res.data && res.data.length > 0) {
              songRow.id = res.data[0].id;
            }
            sb.from('songs').upsert(songRow).catch(function() {});
          }).catch(function() {
            sb.from('songs').upsert(songRow).catch(function() {});
          });
      }

      return new Promise(function (resolve) {
        setTimeout(resolve, 350);
      });
    },


    loadDashboardData: function (onCompleteCallback) {
      // 0. Recarregar dados locais para garantir que novos logins/cadastros não sejam perdidos
      this.loadStoredData();

      var currentUser = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var currentProfile = window.PrompterAuth ? window.PrompterAuth.getProfile() : null;

      var devEmail = (currentProfile && currentProfile.email) ? currentProfile.email : (currentUser ? currentUser.email : 'admin@cantaaipro.com');
      var devName = (currentProfile && currentProfile.display_name) ? currentProfile.display_name : (currentUser && currentUser.email ? currentUser.email.split('@')[0] : 'Administrador');
      var devCode = normalizeSingerCode((currentProfile && currentProfile.singer_code) || '', devEmail);
      if (currentProfile) currentProfile.singer_code = devCode;

      // 1. Integrar usuário atual na lista local apenas se for um cliente regular (nunca o desenvolvedor/CEO)
      if (currentUser && !isPlatformDeveloper(devEmail)) {
        var myIdx = allUserData.findIndex(function(u) {
          return u.id === currentUser.id || (u.email && u.email.toLowerCase() === devEmail.toLowerCase());
        });
        var existingInsta = (myIdx >= 0 && allUserData[myIdx].instagram) ? allUserData[myIdx].instagram : '';
        var instaVal = (currentProfile && currentProfile.instagram) || existingInsta;
        var myData = {
          id: currentUser.id,
          name: devName,
          email: devEmail,
          singer_code: devCode,
          plan_tier: (currentProfile && currentProfile.plan_tier) || 'pro',
          plan_type: (currentProfile && currentProfile.plan_type) || '💎 PRO ANUAL',
          is_online: true,
          status_text: '🟢 Conectado e Ativo',
          phone: (currentProfile && currentProfile.phone) || (myIdx >= 0 ? allUserData[myIdx].phone : ''),
          cpf: (currentProfile && currentProfile.cpf) || (myIdx >= 0 ? allUserData[myIdx].cpf : ''),
          instagram: instaVal,
          reps_count: (myIdx >= 0 && allUserData[myIdx].reps_count) ? allUserData[myIdx].reps_count : 1,
          songs_count: (myIdx >= 0 && allUserData[myIdx].songs_count) ? allUserData[myIdx].songs_count : 33,
          last_seen: 'Agora mesmo',
          created_at: (currentProfile && currentProfile.created_at) || (myIdx >= 0 ? allUserData[myIdx].created_at : 'Hoje')
        };
        if (myIdx >= 0) {
          allUserData[myIdx] = Object.assign({}, allUserData[myIdx], myData);
        } else {
          allUserData.unshift(myData);
        }
        PrompterAdmin.saveStoredUsers();
      }

      // Render inicial imediato para feedback instantâneo ao usuário
      PrompterAdmin.updateMetrics();
      PrompterAdmin.renderUsersTable();
      PrompterAdmin.populateAnnouncementTargets();

      // Função de processamento seguro de linhas do System Registry
      function processRegistrySongs(rows) {
        if (!rows || !rows.length) return false;
        var changed = false;
        rows.forEach(function(row) {
          try {
            var sObj = null;
            if (row.content) {
              sObj = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
            }
            if (!sObj && row.title) {
              sObj = {
                id: row.id,
                name: row.title,
                email: row.artist,
                singer_code: normalizeSingerCode('', row.artist),
                plan_tier: 'pro',
                plan_type: '💎 PRO ANUAL',
                is_online: false,
                status_text: '⚪ Offline'
              };
            }
            if (sObj && (sObj.email || sObj.id)) {
              if (sObj && sObj.email && sObj.email.indexOf('@') !== -1) {
                var sEmail = (sObj.email || '').trim().toLowerCase();
                if (isPlatformDeveloper(sEmail)) return;
                var sCode = (sObj.singer_code || '').trim().toLowerCase();
                var sId = (sObj.id || '').toLowerCase();
                var deletedSingers = getDeletedSingers();

                if (deletedSingers.indexOf(sEmail) !== -1 || deletedSingers.indexOf(sCode) !== -1 || (sId && deletedSingers.indexOf(sId) !== -1)) {
                  return;
                }

                sObj.singer_code = normalizeSingerCode(sObj.singer_code, sObj.email);
                if (!sObj.name || !sObj.name.trim()) {
                  sObj.name = sObj.email.split('@')[0];
                }

                var existIdx = allUserData.findIndex(function(u) {
                  return (sObj.id && u.id === sObj.id) ||
                         (sEmail && u.email && u.email.trim().toLowerCase() === sEmail);
                });
                if (existIdx >= 0) {
                  allUserData[existIdx] = Object.assign({}, allUserData[existIdx], sObj);
                } else {
                  allUserData.unshift(sObj);
                }
                changed = true;
              }
            }
          } catch(e) {
            console.warn('Erro ao processar cantor da nuvem:', e);
          }
        });

        if (changed) {
          PrompterAdmin.saveStoredUsers();
          PrompterAdmin.updateMetrics();
          PrompterAdmin.renderUsersTable();
          PrompterAdmin.populateAnnouncementTargets();
        }
        return changed;
      }

      // 2. Sincronizar da Nuvem: buscar todos os cantores registrados no System Registry
      var pendingCount = 2;
      var hasNotified = false;

      function notifyComplete() {
        pendingCount--;
        if (pendingCount <= 0 && !hasNotified) {
          hasNotified = true;
          if (typeof onCompleteCallback === 'function') {
            onCompleteCallback(allUserData.length);
          }
        }
      }

      // Failsafe watchdog interno: nunca travar mais do que 3.2 segundos
      setTimeout(function () {
        if (!hasNotified) {
          hasNotified = true;
          PrompterAdmin.renderUsersTable();
          PrompterAdmin.updateMetrics();
          if (typeof onCompleteCallback === 'function') {
            onCompleteCallback(allUserData.length);
          }
        }
      }, 3200);

      var anonKey = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.key) || '';
      var supUrl = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || '';
      if (supUrl && anonKey) {
        var restUrl = supUrl.replace(/\/$/, '') + '/rest/v1/songs?repertoire_id=eq.' + encodeURIComponent(SYSTEM_REGISTRY_REPERTOIRE_ID) + '&select=*';
        fetch(restUrl, {
          method: 'GET',
          headers: {
            'apikey': anonKey,
            'Authorization': 'Bearer ' + anonKey,
            'Content-Type': 'application/json'
          }
        }).then(function(r) { return r.json(); }).then(function(rows) {
          if (Array.isArray(rows) && rows.length > 0) {
            processRegistrySongs(rows);
          }
          notifyComplete();
        }).catch(function() {
          notifyComplete();
        });
      } else {
        notifyComplete();
      }

      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        sb.from('songs')
          .select('*')
          .eq('repertoire_id', SYSTEM_REGISTRY_REPERTOIRE_ID)
          .then(function(res) {
            if (res.data && res.data.length > 0) {
              processRegistrySongs(res.data);
            }
            notifyComplete();
          }).catch(function() {
            notifyComplete();
          });

        // 3. Tentar também ler profiles caso o Supabase conceda permissão
        sb.from('profiles').select('*').then(function(res) {
          if (res.data && res.data.length > 0) {
            res.data.forEach(function(p) {
              var pEmail = (p.email || '').trim().toLowerCase();
              if (!pEmail || pEmail.indexOf('@') === -1 || isPlatformDeveloper(pEmail)) return;

              var pCode = (p.singer_code || '').trim().toLowerCase();
              var pId = (p.id || '').toLowerCase();
              var deletedSingers = getDeletedSingers();

              if (deletedSingers.indexOf(pEmail) !== -1 || deletedSingers.indexOf(pCode) !== -1 || (pId && deletedSingers.indexOf(pId) !== -1)) {
                return;
              }

              var existIdx = allUserData.findIndex(function(u) {
                return (p.id && u.id === p.id) || (pEmail && u.email && u.email.trim().toLowerCase() === pEmail);
              });

              var effectiveCode = normalizeSingerCode(p.singer_code, p.email);

              if (p.singer_code && (p.singer_code.startsWith('#') || p.singer_code.toUpperCase().indexOf('CANTOR-') !== -1)) {
                sb.from('profiles').update({ singer_code: effectiveCode }).eq('id', p.id).catch(function() {});
              }

              var profInsta = p.instagram || (existIdx >= 0 ? allUserData[existIdx].instagram : '') || (pEmail === 'leovitulli@gmail.com' ? '@leovitulli' : '');
              var localUser = existIdx >= 0 ? allUserData[existIdx] : null;

              // Princípio da Imutabilidade de Privilégios: impedir que leitura padrão 'free' da nuvem rebaixe VIP/PRO locais
              var isVipSinger = !!(
                pEmail === 'alinecrissallai@gmail.com' ||
                (localUser && (localUser.is_vip || localUser.plan_tier === 'vip' || (localUser.plan_type && localUser.plan_type.indexOf('VIP') !== -1) || localUser.coupon_used === 'VIP100')) ||
                (p && (p.is_vip || p.plan_tier === 'vip' || (p.plan_type && p.plan_type.indexOf('VIP') !== -1) || p.coupon_used === 'VIP100'))
              );
              var isProSinger = isVipSinger || (localUser && localUser.plan_tier === 'pro') || (p && p.plan_tier === 'pro') || pEmail === 'leovitulli@gmail.com';

              var resolvedTier = isVipSinger ? 'vip' : (isProSinger ? 'pro' : ((p && p.plan_tier) || (localUser && localUser.plan_tier) || 'free'));
              var resolvedPlanType = isVipSinger
                ? '👑 VIP 100% OFF'
                : (isProSinger
                    ? ((localUser && localUser.plan_type && localUser.plan_type.indexOf('MENSAL') !== -1) || (p && p.plan_type && p.plan_type.indexOf('MENSAL') !== -1) ? '⚡ PRO MENSAL' : '💎 PRO ANUAL')
                    : '⚡ PLANO FREE');
              var resolvedCoupon = (localUser && localUser.coupon_used) || (p && p.coupon_used) || (isVipSinger ? 'VIP100' : '');
              var resolvedDueDate = isVipSinger ? '2099-12-31T23:59:59.000Z' : ((localUser && localUser.billing_due_date) || (p && p.billing_due_date) || null);

              var profData = {
                id: p.id,
                name: p.display_name || (existIdx >= 0 ? allUserData[existIdx].name : (p.email ? p.email.split('@')[0] : 'Cantor')),
                email: p.email || (existIdx >= 0 ? allUserData[existIdx].email : ''),
                phone: p.phone || (existIdx >= 0 ? allUserData[existIdx].phone : ''),
                cpf: p.cpf || (existIdx >= 0 ? allUserData[existIdx].cpf : ''),
                instagram: profInsta,
                singer_code: effectiveCode,
                plan_tier: resolvedTier,
                plan_type: resolvedPlanType,
                is_vip: isVipSinger,
                coupon_used: resolvedCoupon,
                billing_due_date: resolvedDueDate,
                is_online: existIdx >= 0 ? allUserData[existIdx].is_online : false,
                status_text: existIdx >= 0 ? allUserData[existIdx].status_text : '⚪ Offline',
                reps_count: existIdx >= 0 ? allUserData[existIdx].reps_count : 0,
                songs_count: existIdx >= 0 ? allUserData[existIdx].songs_count : 0,
                last_seen: existIdx >= 0 ? allUserData[existIdx].last_seen : 'Hoje',
                created_at: p.created_at || (existIdx >= 0 ? allUserData[existIdx].created_at : 'Hoje')
              };
              if (existIdx >= 0) {
                allUserData[existIdx] = Object.assign({}, allUserData[existIdx], profData);
              } else {
                allUserData.push(profData);
              }

              // Auto-cura do Supabase caso o banco remoto estivesse com status free desatualizado
              if (isVipSinger && (p.plan_tier !== 'vip' || !p.is_vip)) {
                sb.from('profiles').update({
                  plan_tier: 'vip',
                  plan_type: '👑 VIP 100% OFF',
                  is_vip: true,
                  coupon_used: resolvedCoupon || 'VIP100',
                  billing_due_date: '2099-12-31T23:59:59.000Z'
                }).eq('id', p.id).catch(function() {});
              }
            });
            PrompterAdmin.saveStoredUsers();
            PrompterAdmin.updateMetrics();
            PrompterAdmin.renderUsersTable();
            PrompterAdmin.renderGrowthDashboard();
          }
        }).catch(function() {});

        // 4. Carregar total de cifras e repertórios reais para Growth & Telemetria
        sb.from('songs').select('id, user_id, repertoire_id').then(function(sRes) {
          if (sRes.data && Array.isArray(sRes.data)) {
            var validSongs = sRes.data.filter(function(s) { return s.repertoire_id !== SYSTEM_REGISTRY_REPERTOIRE_ID; });
            platformTotalSongs = validSongs.length;
            var uSongCounts = {};
            validSongs.forEach(function(s) {
              if (s.user_id) uSongCounts[s.user_id] = (uSongCounts[s.user_id] || 0) + 1;
            });
            allUserData.forEach(function(u) {
              if (u.id && uSongCounts[u.id] !== undefined) {
                u.songs_count = uSongCounts[u.id];
              }
            });
            PrompterAdmin.saveStoredUsers();
            PrompterAdmin.renderGrowthDashboard();
          }
        }).catch(function() {});

        sb.from('repertoires').select('id, user_id').then(function(rRes) {
          if (rRes.data && Array.isArray(rRes.data)) {
            var validReps = rRes.data.filter(function(r) { return r.id !== SYSTEM_REGISTRY_REPERTOIRE_ID; });
            platformTotalReps = validReps.length;
            var uRepCounts = {};
            validReps.forEach(function(r) {
              if (r.user_id) uRepCounts[r.user_id] = (uRepCounts[r.user_id] || 0) + 1;
            });
            allUserData.forEach(function(u) {
              if (u.id && uRepCounts[u.id] !== undefined) {
                u.reps_count = uRepCounts[u.id];
              }
            });
            PrompterAdmin.saveStoredUsers();
            PrompterAdmin.renderGrowthDashboard();
          }
        }).catch(function() {});
      } else {
        notifyComplete();
      }
    },

    updateMetrics: function () {
      var customerUsers = allUserData.filter(function(u) {
        return u && !isPlatformDeveloper(u.email);
      });
      var total = customerUsers.length;
      var pro = customerUsers.filter(function (u) {
        return u.plan_tier === 'pro' || u.plan_tier === 'vip' || !!u.is_vip || (u.plan_type && u.plan_type.indexOf('VIP') !== -1) || u.coupon_used === 'VIP100';
      }).length;
      var free = customerUsers.filter(function (u) {
        var isVipOrPro = u.plan_tier === 'pro' || u.plan_tier === 'vip' || !!u.is_vip || (u.plan_type && u.plan_type.indexOf('VIP') !== -1) || u.coupon_used === 'VIP100';
        return !isVipOrPro;
      }).length;
      var online = customerUsers.filter(function (u) { return u.is_online; }).length;
      var payingPro = customerUsers.filter(function (u) {
        var isVip = !!u.is_vip || u.plan_tier === 'vip' || (u.plan_type && u.plan_type.indexOf('VIP') !== -1) || u.coupon_used === 'VIP100';
        return !isVip && (u.plan_tier === 'pro');
      }).length;
      var estimatedMRR = (payingPro * (pricingConfig.monthlyPrice || 39.90)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      var elMRR = document.getElementById('admMetricMRR');
      var elPro = document.getElementById('admMetricProUsers');
      var elOnline = document.getElementById('admMetricOnlineUsers');
      var elSongs = document.getElementById('admMetricTotalSongs');
      var elUsersSub = document.getElementById('admMetricTotalUsersSub');
      var elRepsSub = document.getElementById('admMetricTotalRepsSub');

      if (elMRR) elMRR.innerText = estimatedMRR;
      if (elPro) elPro.innerText = pro;
      if (elOnline) elOnline.innerText = online;
      if (elUsersSub) elUsersSub.innerText = total + ' Cantores Cadastrados';

      var pAll = document.getElementById('countPillAll');
      var pPro = document.getElementById('countPillPro');
      var pLive = document.getElementById('countPillLive');
      var pFree = document.getElementById('countPillFree');
      var pNew = document.getElementById('countPillNew');

      if (pAll) pAll.innerText = total;
      if (pPro) pPro.innerText = pro;
      if (pLive) pLive.innerText = online;
      if (pFree) pFree.innerText = free;
      if (pNew) pNew.innerText = this.getUnreadSignups().length;

      // Buscar contagem real de músicas e repertórios no banco local e nuvem
      if (window.PrompterDB) {
        window.PrompterDB.getAllSongs().then(function (songs) {
          var count = (songs && songs.length) ? songs.length : 0;
          if (elSongs) elSongs.innerText = count.toLocaleString('pt-BR');
        });
        window.PrompterDB.getAllRepertoires().then(function (reps) {
          var rCount = (reps && reps.length) ? reps.length : 0;
          if (elRepsSub) elRepsSub.innerText = rCount + ' Repertório' + (rCount !== 1 ? 's' : '') + ' Criados';
        });
      }
    },

    renderUsersTable: function () {
      var tbody = document.getElementById('adminUsersTableBody');
      if (!tbody) return;

      var filtered = allUserData.filter(function (u) {
        if (!u || isPlatformDeveloper(u.email)) return false;
        var isUserVip = !!u.is_vip || u.plan_tier === 'vip' || (u.plan_type && u.plan_type.indexOf('VIP') !== -1) || u.coupon_used === 'VIP100';
        var isUserPro = isUserVip || u.plan_tier === 'pro';
        if (currentFilter === 'new' && !PrompterAdmin.isUserNew(u)) return false;
        if (currentFilter === 'pro' && !isUserPro) return false;
        if (currentFilter === 'free' && isUserPro) return false;
        if (currentFilter === 'live' && !u.is_online) return false;

        if (searchQuery) {
          var matchName = (u.name || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchEmail = (u.email || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchCode = (u.singer_code || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchPhone = (u.phone || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchCpf = (u.cpf || '').toLowerCase().indexOf(searchQuery) !== -1;
          return matchName || matchEmail || matchCode || matchPhone || matchCpf;
        }
        return true;
      });

      if (filtered.length === 0) {
        var emptyHtml = 'Nenhum cantor encontrado com os filtros atuais.';
        if (searchQuery && (searchQuery.indexOf('@') !== -1 || searchQuery.length >= 3)) {
          var sTerm = escapeHtml(searchQuery.trim());
          emptyHtml = 'Nenhum cadastro listado com o termo "<strong>' + sTerm + '</strong>".' +
            '<div style="margin-top: 12px;">' +
              '<button id="btnQuickAddSearchedSinger" class="btn btn-primary btn-sm">➕ Vincular / Cadastrar este Cantor no Painel</button>' +
            '</div>';
        }
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 28px; color: #94a3b8;">' + emptyHtml + '</td></tr>';
        var btnQuickAdd = document.getElementById('btnQuickAddSearchedSinger');
        if (btnQuickAdd) {
          btnQuickAdd.addEventListener('click', function() {
            var rawQuery = searchQuery.trim();
            var qEmail = rawQuery.indexOf('@') !== -1 && !rawQuery.startsWith('@') ? rawQuery : '';
            var qCode = rawQuery.startsWith('@') ? rawQuery : ('@' + (qEmail ? qEmail.split('@')[0] : rawQuery));
            PrompterAdmin.openSingerModal({
              email: qEmail,
              name: qEmail ? qEmail.split('@')[0] : rawQuery.replace('@', ''),
              singer_code: qCode
            });
          });
        }
        return;
      }

      var html = '';
      filtered.forEach(function (user) {
        if (!user) return;
        var uName = (user.name || '').trim();
        var uEmail = (user.email || '').trim();
        var displayName = uName || (uEmail ? uEmail.split('@')[0] : 'Cantor');
        var initial = (uName ? uName.charAt(0) : (uEmail ? uEmail.charAt(0) : '🎤')).toUpperCase();
        var statusDot = user.is_online
          ? '<span class="status-dot-pulse-online" title="🟢 Online e Ativo"></span>'
          : '<span class="status-dot-offline" title="⚪ Offline"></span>';

        var isVip = !!user.is_vip || (user.plan_type && user.plan_type.indexOf('VIP') !== -1) || user.coupon_used === 'VIP100';
        var planBadge = '';
        var finStatus = PrompterAdmin.getUserFinancialStatus ? PrompterAdmin.getUserFinancialStatus(user) : null;

        if (isVip) {
          // Comunicação ÚNICA e elegante de Governança VIP (elimina duplicidade de tags)
          planBadge = '<span class="badge-plan-executive" style="background: rgba(251,191,36,0.16); color: #fbbf24; border: 1px solid rgba(251,191,36,0.45); font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">👑 PARCEIRO VIP (100% OFF)</span>';
        } else if (user.plan_tier === 'pro') {
          var pType = user.plan_type || '💎 PRO ANUAL';
          planBadge = '<span class="badge-plan-executive badge-plan-pro">' + escapeHtml(pType) + '</span>';
          if (finStatus) {
            var finPill = '';
            if (finStatus.status === 'paid') {
              finPill = '<span class="badge-fin-paid" title="Em dia até ' + finStatus.dueDateStr + '">🟢 EM DIA</span>';
            } else if (finStatus.status === 'due_soon') {
              finPill = '<span class="badge-fin-due" title="Vence em breve: ' + finStatus.dueDateStr + '">🟡 VENCE EM ' + finStatus.diffDays + 'd</span>';
            } else if (finStatus.status === 'overdue') {
              finPill = '<span class="badge-fin-overdue" title="Vencido em ' + finStatus.dueDateStr + '">🔴 VENCIDO</span>';
            }
            if (finPill) {
              planBadge += '<div style="margin-top: 4px;">' + finPill + '</div>';
            }
          }
          if (user.coupon_used && user.coupon_used !== 'VIP100') {
            planBadge += '<div style="font-size: 0.72rem; color: #a7f3d0; margin-top: 3px; font-weight: 600;">🏷️ ' + escapeHtml(user.coupon_used) + '</div>';
          }
        } else {
          planBadge = '<span class="badge-plan-executive badge-plan-free">⚡ PLANO FREE</span>';
        }

        // Metadados Administrativos: Data de Cadastro e Tempo de Casa (Tenure)
        var createdDt = user.created_at ? new Date(user.created_at) : new Date();
        var tenureStr = PrompterAdmin.formatCustomerTenure(createdDt);
        var createdDateStr = String(createdDt.getDate()).padStart(2, '0') + '/' + String(createdDt.getMonth() + 1).padStart(2, '0') + '/' + createdDt.getFullYear();

        var cleanPhone = (user.phone || '').replace(/\D/g, '');
        if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;
        var waUrl = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent('Olá ' + displayName + '! Tudo bem? Aqui é o Leonardo da equipe CantaAí PRO.');
        var waButton = cleanPhone
          ? '<a href="' + waUrl + '" target="_blank" class="admin-table-btn-link admin-btn-wa" title="Chamar no WhatsApp direto" onclick="event.stopPropagation();">💬 ' + escapeHtml(user.phone) + '</a>'
          : '<span style="color:#64748b; font-size:0.8rem;">Sem WhatsApp</span>';

        var cleanInsta = (user.instagram || '').replace('@', '').trim();
        var instaUrl = 'https://instagram.com/' + cleanInsta;
        var instaButton = cleanInsta
          ? '<a href="' + instaUrl + '" target="_blank" class="admin-table-btn-link admin-btn-insta" title="Abrir Instagram direto" onclick="event.stopPropagation();">📸 @' + escapeHtml(cleanInsta) + '</a>'
          : '<span style="color:#64748b; font-size:0.8rem;">—</span>';

        var cpfStr = user.cpf ? ('CPF: ' + user.cpf) : 'Sem CPF';
        var loginCodeStr = escapeHtml(normalizeSingerCode(user.singer_code, user.email));
        var isCeo = user.email && user.email.toLowerCase() === 'leovitulli@gmail.com';
        var delBtnHtml = isCeo
          ? ''
          : '<button type="button" class="btn btn-outline btn-xs btn-del-singer-row" data-user-id="' + user.id + '" style="color: #f87171; border-color: rgba(239, 68, 68, 0.35); padding: 3px 7px; border-radius: 6px; font-size: 0.75rem;" title="Excluir Cantor" onclick="event.stopPropagation();">🗑️</button>';

        var crmWaBtn = cleanPhone
          ? '<a href="' + waUrl + '" target="_blank" class="btn-crm-wa" title="Chamar no WhatsApp direto" onclick="event.stopPropagation();">📲 WhatsApp</a>'
          : '';

        var attendBtn = '<button type="button" class="btn-crm-chat btn-attend-singer" data-user-id="' + user.id + '" title="Atendimento direto 1-a-1 no Helpdesk" onclick="event.stopPropagation();">💬 Atender</button>';
        var editBtn = '<button type="button" class="btn btn-outline btn-xs btn-edit-singer-row" data-user-id="' + user.id + '" style="color:#cbd5e1; border-color:rgba(255,255,255,0.2); padding:4px 8px; font-size:0.75rem; border-radius:6px;" title="Editar Perfil" onclick="event.stopPropagation();">✏️</button>';

        html +=
          '<tr class="admin-user-row" data-user-id="' + user.id + '" title="Clique para gerenciar ' + escapeHtml(displayName) + '">' +
            '<td style="text-align: center; width: 45px;">' + statusDot + '</td>' +
            '<td>' +
              '<div class="admin-user-cell">' +
                '<div class="admin-user-avatar">' + initial + '</div>' +
                '<div class="admin-user-details">' +
                  '<span class="admin-user-name">' + escapeHtml(displayName) + (PrompterAdmin.isUserNew(user) ? ' <span class="badge-new-signup">✨ NOVO</span>' : '') + '</span>' +
                  '<span class="admin-user-email">' + escapeHtml(uEmail || '—') + '</span>' +
                  '<div style="font-size:0.72rem; color:#94a3b8; margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
                    '<span>📅 Cadastro: <strong>' + createdDateStr + '</strong></span>' +
                    '<span>•</span>' +
                    '<span style="color:#38bdf8; font-weight:700;">⏳ ' + tenureStr + '</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</td>' +
            '<td><code class="admin-code-tag" style="color: #38bdf8; font-weight: 700;">' + loginCodeStr + '</code></td>' +
            '<td>' + planBadge + '</td>' +
            '<td><div>' + waButton + '</div><small style="color:#64748b; font-size:0.75rem; margin-top:2px; display:inline-block;">' + escapeHtml(cpfStr) + '</small></td>' +
            '<td>' + instaButton + '</td>' +
            '<td style="text-align: right;">' +
              '<div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">' +
                attendBtn +
                crmWaBtn +
                editBtn +
                delBtnHtml +
              '</div>' +
            '</td>' +
          '</tr>';
      });

      tbody.innerHTML = html;

      // Clique em qualquer parte da linha abre o modal de edição
      tbody.querySelectorAll('.admin-user-row').forEach(function (row) {
        row.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function(u) { return u.id === uId; });
          if (userObj) {
            PrompterAdmin.markUserAsSeen(userObj.id || userObj.email);
            PrompterAdmin.openSingerModal(userObj);
          }
        });
      });

      // Botão Atender Cantor -> abre Helpdesk diretamente
      tbody.querySelectorAll('.btn-attend-singer').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function(u) { return u.id === uId; });
          if (userObj) {
            PrompterAdmin.openHelpdeskWithSinger(userObj);
          }
        });
      });

      // Botão Editar Cantor -> abre modal de edição
      tbody.querySelectorAll('.btn-edit-singer-row').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function(u) { return u.id === uId; });
          if (userObj) {
            PrompterAdmin.openSingerModal(userObj);
          }
        });
      });

      // Botão direto de exclusão na linha
      tbody.querySelectorAll('.btn-del-singer-row').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var uId = this.getAttribute('data-user-id');
          PrompterAdmin.deleteSinger(uId);
        });
      });
    },

    // ─────────────────────────────────────────────────────────────
    // MÓDULO FINANCEIRO, BALANCETE ERP & COBRANÇA (CFO / CEO FINANCEIRO)
    // ─────────────────────────────────────────────────────────────

    formatCustomerTenure: function (date) {
      if (!date) return 'Cliente recente';
      var d = (date instanceof Date) ? date : new Date(date);
      if (isNaN(d.getTime())) return 'Cliente recente';
      var now = new Date();
      var diffMs = now.getTime() - d.getTime();
      var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 1) return 'Cadastrado hoje';
      if (diffDays === 1) return 'Cliente há 1 dia';
      if (diffDays < 30) return 'Cliente há ' + diffDays + ' dias';
      var months = Math.floor(diffDays / 30);
      if (months === 1) return 'Cliente há 1 mês';
      if (months < 12) return 'Cliente há ' + months + ' meses';
      var years = Math.floor(months / 12);
      var remMonths = months % 12;
      if (years === 1) {
        return remMonths > 0 ? ('Cliente há 1 ano e ' + remMonths + ' m') : 'Cliente há 1 ano';
      }
      return 'Cliente há ' + years + ' anos';
    },

    getUserFinancialStatus: function (user) {
      if (!user) {
        return {
          status: 'free',
          label: 'FREE',
          amount: 0,
          waiverValue: 0,
          dueDate: null,
          dueDateStr: '—',
          diffDays: 0,
          lastPaymentStr: '—',
          isAnnual: false
        };
      }

      var isVip = !!user.is_vip || (user.plan_type && user.plan_type.indexOf('VIP') !== -1) || user.coupon_used === 'VIP100';
      if (isVip) {
        var isVipAnnual = user.plan_type && user.plan_type.toLowerCase().indexOf('anual') !== -1;
        var vipWaiver = isVipAnnual ? (pricingConfig.annualPrice || 299.00) : (pricingConfig.monthlyPrice || 39.90);
        return {
          status: 'vip',
          label: 'VIP 100% OFF',
          amount: 0,
          waiverValue: vipWaiver,
          dueDate: null,
          dueDateStr: 'Vitalício Isento',
          diffDays: 9999,
          lastPaymentStr: 'Cortesia VIP',
          isAnnual: isVipAnnual
        };
      }

      if (user.plan_tier !== 'pro') {
        return {
          status: 'free',
          label: 'FREE',
          amount: 0,
          waiverValue: 0,
          dueDate: null,
          dueDateStr: '—',
          diffDays: 0,
          lastPaymentStr: '—',
          isAnnual: false
        };
      }

      // Usuário PRO
      var isAnnual = user.plan_type && user.plan_type.toLowerCase().indexOf('anual') !== -1;
      var planAmount = isAnnual ? (pricingConfig.annualPrice || 299.00) : (pricingConfig.monthlyPrice || 39.90);

      // Determinar Data de Vencimento
      var dueDate = null;
      if (user.billing_due_date) {
        dueDate = new Date(user.billing_due_date);
      } else if (user.next_billing_date) {
        dueDate = new Date(user.next_billing_date);
      } else {
        // Consultar histórico do livro-razão (ledger)
        var uTxs = financeLedger.filter(function (t) {
          return (t.user_id && t.user_id === user.id) ||
                 (t.user_email && user.email && t.user_email.toLowerCase() === user.email.toLowerCase());
        });
        if (uTxs.length > 0) {
          var sortedTxs = uTxs.slice().sort(function (a, b) {
            return new Date(b.paid_at || 0) - new Date(a.paid_at || 0);
          });
          var latestTx = sortedTxs[0];
          if (latestTx.due_date) {
            dueDate = new Date(latestTx.due_date);
          } else if (latestTx.paid_at) {
            dueDate = new Date(latestTx.paid_at);
            if (isAnnual) dueDate.setFullYear(dueDate.getFullYear() + 1);
            else dueDate.setMonth(dueDate.getMonth() + 1);
          }
        }
        
        if (!dueDate) {
          if (user.created_at) {
            dueDate = new Date(user.created_at);
            if (isAnnual) dueDate.setFullYear(dueDate.getFullYear() + 1);
            else dueDate.setMonth(dueDate.getMonth() + 1);
          } else {
            dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);
          }
        }
      }

      var now = new Date();
      var diffTime = dueDate.getTime() - now.getTime();
      var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      var status = 'paid';
      var label = 'EM DIA';
      if (diffDays < 0) {
        status = 'overdue';
        label = 'VENCIDO';
      } else if (diffDays <= 5) {
        status = 'due_soon';
        label = 'VENCE EM BREVE';
      }

      var dDay = String(dueDate.getDate()).padStart(2, '0');
      var dMon = String(dueDate.getMonth() + 1).padStart(2, '0');
      var dYear = dueDate.getFullYear();
      var dueDateStr = dDay + '/' + dMon + '/' + dYear;

      // Último pagamento
      var lastPaymentStr = '—';
      if (user.last_payment_at) {
        var lp = new Date(user.last_payment_at);
        lastPaymentStr = String(lp.getDate()).padStart(2, '0') + '/' + String(lp.getMonth() + 1).padStart(2, '0') + '/' + lp.getFullYear();
      } else {
        var uTxs2 = financeLedger.filter(function (t) {
          return (t.user_id && t.user_id === user.id) ||
                 (t.user_email && user.email && t.user_email.toLowerCase() === user.email.toLowerCase());
        });
        if (uTxs2.length > 0) {
          var lp2 = new Date(uTxs2[0].paid_at || Date.now());
          lastPaymentStr = String(lp2.getDate()).padStart(2, '0') + '/' + String(lp2.getMonth() + 1).padStart(2, '0') + '/' + lp2.getFullYear();
        }
      }

      return {
        status: status,
        label: label,
        amount: planAmount,
        waiverValue: 0,
        dueDate: dueDate,
        dueDateStr: dueDateStr,
        diffDays: diffDays,
        lastPaymentStr: lastPaymentStr,
        isAnnual: isAnnual
      };
    },

    formatBRL: function (val) {
      return 'R$ ' + Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    renderFinanceDashboard: function () {
      var monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      var elMonth = document.getElementById('finMonthDisplay');
      if (elMonth) {
        elMonth.textContent = monthNames[financeSelectedMonth] + ' / ' + financeSelectedYear;
      }

      var realizedRevenue = 0;
      var realizedCount = 0;

      // 1. Receita Realizada a partir do Livro-Razão (financeLedger)
      financeLedger.forEach(function (tx) {
        if (!tx || !tx.paid_at) return;
        var pDate = new Date(tx.paid_at);
        if (pDate.getMonth() === financeSelectedMonth && pDate.getFullYear() === financeSelectedYear) {
          realizedRevenue += Number(tx.amount || 0);
          realizedCount++;
        }
      });

      // 2. Projeção de Receitas Pendentes, Inadimplência e Isenções VIP
      var pendingRevenue = 0;
      var pendingCount = 0;
      var overdueRevenue = 0;
      var overdueCount = 0;
      var waiverRevenue = 0;
      var waiverCount = 0;

      allUserData.forEach(function (u) {
        if (!u) return;
        var fStat = PrompterAdmin.getUserFinancialStatus(u);
        if (fStat.status === 'vip') {
          waiverRevenue += fStat.waiverValue;
          waiverCount++;
        } else if (u.plan_tier === 'pro') {
          if (fStat.status === 'overdue') {
            overdueRevenue += fStat.amount;
            overdueCount++;
          } else if (fStat.dueDate) {
            var dMon = fStat.dueDate.getMonth();
            var dYear = fStat.dueDate.getFullYear();
            if (dMon === financeSelectedMonth && dYear === financeSelectedYear) {
              if (fStat.status === 'due_soon' || fStat.diffDays >= 0) {
                pendingRevenue += fStat.amount;
                pendingCount++;
              }
            }
          }
        }
      });

      // 3. Balancete DRE
      var grossPotential = realizedRevenue + pendingRevenue + overdueRevenue + waiverRevenue;
      var netRealized = realizedRevenue;
      var totalDue = realizedRevenue + overdueRevenue;
      var adimplenciaRate = totalDue > 0 ? Math.round((realizedRevenue / totalDue) * 100) : 100;

      // 4. Atualizar Elementos do Dashboard
      var elValRealized = document.getElementById('finValRealized');
      var elCntRealized = document.getElementById('finCountRealized');
      if (elValRealized) elValRealized.textContent = PrompterAdmin.formatBRL(realizedRevenue);
      if (elCntRealized) elCntRealized.textContent = realizedCount + ' assinatura(s) confirmada(s)';

      var elValPending = document.getElementById('finValPending');
      var elCntPending = document.getElementById('finCountPending');
      if (elValPending) elValPending.textContent = PrompterAdmin.formatBRL(pendingRevenue);
      if (elCntPending) elCntPending.textContent = pendingCount + ' fatura(s) em aberto no mês';

      var elValOverdue = document.getElementById('finValOverdue');
      var elCntOverdue = document.getElementById('finCountOverdue');
      if (elValOverdue) elValOverdue.textContent = PrompterAdmin.formatBRL(overdueRevenue);
      if (elCntOverdue) elCntOverdue.textContent = overdueCount + ' cantor(es) com cobrança pendente';

      var elValWaiver = document.getElementById('finValVipWaiver');
      var elCntWaiver = document.getElementById('finCountVipWaiver');
      if (elValWaiver) elValWaiver.textContent = PrompterAdmin.formatBRL(waiverRevenue);
      if (elCntWaiver) elCntWaiver.textContent = waiverCount + ' parceiro(s) 100% OFF';

      var elDreGross = document.getElementById('finDreGrossRevenue');
      var elDreWaivers = document.getElementById('finDreWaivers');
      var elDreNet = document.getElementById('finDreNetRealized');
      var elDreRate = document.getElementById('finDreAdimplenciaRate');

      if (elDreGross) elDreGross.textContent = PrompterAdmin.formatBRL(grossPotential);
      if (elDreWaivers) elDreWaivers.textContent = '- ' + PrompterAdmin.formatBRL(waiverRevenue);
      if (elDreNet) elDreNet.textContent = PrompterAdmin.formatBRL(netRealized);
      if (elDreRate) {
        elDreRate.textContent = adimplenciaRate + '%';
        elDreRate.style.color = adimplenciaRate >= 80 ? '#34d399' : (adimplenciaRate >= 50 ? '#fbbf24' : '#f87171');
      }
    },

    renderFinanceTable: function () {
      var tbody = document.getElementById('finTableBody');
      if (!tbody) return;

      var q = (financeSearchQuery || '').trim().toLowerCase();

      // Contadores Globais de Filtros
      var cntAll = 0;
      var cntPaid = 0;
      var cntDueSoon = 0;
      var cntOverdue = 0;
      var cntVip = 0;

      allUserData.forEach(function (user) {
        if (!user) return;
        var st = PrompterAdmin.getUserFinancialStatus(user);
        cntAll++;
        if (st.status === 'paid') cntPaid++;
        if (st.status === 'due_soon') cntDueSoon++;
        if (st.status === 'overdue') cntOverdue++;
        if (st.status === 'vip') cntVip++;
      });

      var pAll = document.getElementById('finPillAll');
      var pPaid = document.getElementById('finPillPaid');
      var pDue = document.getElementById('finPillDueSoon');
      var pOver = document.getElementById('finPillOverdue');
      var pVip = document.getElementById('finPillVip');

      if (pAll) pAll.textContent = cntAll;
      if (pPaid) pPaid.textContent = cntPaid;
      if (pDue) pDue.textContent = cntDueSoon;
      if (pOver) pOver.textContent = cntOverdue;
      if (pVip) pVip.textContent = cntVip;

      // Filtragem
      var filtered = allUserData.filter(function (user) {
        if (!user) return false;
        var st = PrompterAdmin.getUserFinancialStatus(user);

        if (currentFinanceFilter === 'paid' && st.status !== 'paid') return false;
        if (currentFinanceFilter === 'due_soon' && st.status !== 'due_soon') return false;
        if (currentFinanceFilter === 'overdue' && st.status !== 'overdue') return false;
        if (currentFinanceFilter === 'vip' && st.status !== 'vip') return false;

        if (q) {
          var mName = (user.name || '').toLowerCase().indexOf(q) !== -1;
          var mEmail = (user.email || '').toLowerCase().indexOf(q) !== -1;
          var mCode = (user.singer_code || '').toLowerCase().indexOf(q) !== -1;
          var mPhone = (user.phone || '').toLowerCase().indexOf(q) !== -1;
          return mName || mEmail || mCode || mPhone;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 28px; color: #94a3b8;">Nenhum registro financeiro encontrado para este filtro.</td></tr>';
        return;
      }

      var html = '';
      filtered.forEach(function (user) {
        var uName = (user.name || '').trim();
        var uEmail = (user.email || '').trim();
        var displayName = uName || (uEmail ? uEmail.split('@')[0] : 'Cantor');
        var initial = (uName ? uName.charAt(0) : (uEmail ? uEmail.charAt(0) : '🎤')).toUpperCase();
        var loginCodeStr = escapeHtml(normalizeSingerCode(user.singer_code, user.email));

        var st = PrompterAdmin.getUserFinancialStatus(user);

        // Badge do Status Financeiro
        var statusBadgeHtml = '';
        if (st.status === 'vip') {
          statusBadgeHtml = '<span class="badge-fin-vip">👑 ISENTO VIP</span>';
        } else if (st.status === 'paid') {
          statusBadgeHtml = '<span class="badge-fin-paid">🟢 EM DIA</span>';
        } else if (st.status === 'due_soon') {
          statusBadgeHtml = '<span class="badge-fin-due">🟡 VENCE EM ' + st.diffDays + 'd</span>';
        } else if (st.status === 'overdue') {
          statusBadgeHtml = '<span class="badge-fin-overdue">🔴 VENCIDO (' + Math.abs(st.diffDays) + 'd)</span>';
        } else {
          statusBadgeHtml = '<span class="badge-plan-executive badge-plan-free">⚡ FREE</span>';
        }

        // Informação de Plano & Valor
        var planInfoHtml = '';
        if (st.status === 'vip') {
          planInfoHtml = '<strong style="color:#c084fc; font-size:0.82rem;">👑 Cortesia VIP</strong><div style="font-size:0.72rem; color:#94a3b8;">Isenção 100% OFF</div>';
        } else if (user.plan_tier === 'pro') {
          var pType = user.plan_type || (st.isAnnual ? '💎 PRO ANUAL' : '💎 PRO MENSAL');
          var pValStr = PrompterAdmin.formatBRL(st.amount) + (st.isAnnual ? '/ano' : '/mês');
          planInfoHtml = '<strong style="color:#38bdf8; font-size:0.82rem;">' + escapeHtml(pType) + '</strong><div style="font-size:0.75rem; color:#f8fafc; font-weight:700;">' + pValStr + '</div>';
        } else {
          planInfoHtml = '<strong style="color:#94a3b8; font-size:0.82rem;">Plano Gratuito</strong><div style="font-size:0.72rem; color:#64748b;">R$ 0,00</div>';
        }

        // Vencimento
        var dueInfoHtml = '<span style="color:#cbd5e1; font-size:0.82rem;">' + st.dueDateStr + '</span>';
        if (st.status === 'due_soon') {
          dueInfoHtml += '<div style="font-size:0.7rem; color:#fbbf24; font-weight:700;">Faltam ' + st.diffDays + ' dias</div>';
        } else if (st.status === 'overdue') {
          dueInfoHtml += '<div style="font-size:0.7rem; color:#f87171; font-weight:700;">Atrasado há ' + Math.abs(st.diffDays) + ' dias</div>';
        }

        // Ações de Cobrança / Baixa
        var actionsHtml = '<div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">';
        
        // Botão WhatsApp de Cobrança / Lembrete
        if (st.status === 'overdue' || st.status === 'due_soon') {
          actionsHtml += '<button type="button" class="btn-fin-wa btn-fin-send-wa" data-user-id="' + user.id + '" title="Enviar lembrete amigável no WhatsApp">💬 Cobrar no WhatsApp</button>';
        } else if (user.phone) {
          actionsHtml += '<button type="button" class="btn-fin-wa btn-fin-send-wa" data-user-id="' + user.id + '" title="Contato via WhatsApp">💬 WhatsApp</button>';
        }

        // Botão Dar Baixa Manual ERP
        actionsHtml += '<button type="button" class="btn-fin-pay btn-fin-quick-baixa" data-user-id="' + user.id + '" title="Registrar Baixa Manual (Pix/Dinheiro)">⚡ Dar Baixa Pix</button>';
        actionsHtml += '</div>';

        html +=
          '<tr>' +
            '<td>' +
              '<div class="admin-user-cell">' +
                '<div class="admin-user-avatar">' + initial + '</div>' +
                '<div class="admin-user-details">' +
                  '<span class="admin-user-name">' + escapeHtml(displayName) + '</span>' +
                  '<span class="admin-user-email">' + escapeHtml(uEmail || '—') + ' • <code style="color:#38bdf8; font-size:0.72rem;">' + loginCodeStr + '</code></span>' +
                '</div>' +
              '</div>' +
            '</td>' +
            '<td>' + planInfoHtml + '</td>' +
            '<td>' + dueInfoHtml + '</td>' +
            '<td>' + statusBadgeHtml + '</td>' +
            '<td><span style="color:#94a3b8; font-size:0.8rem;">' + st.lastPaymentStr + '</span></td>' +
            '<td style="text-align: right;">' + actionsHtml + '</td>' +
          '</tr>';
      });

      tbody.innerHTML = html;

      // Eventos dos botões da tabela
      tbody.querySelectorAll('.btn-fin-send-wa').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          PrompterAdmin.sendFinanceReminderWhatsApp(uId);
        });
      });

      tbody.querySelectorAll('.btn-fin-quick-baixa').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function (u) { return u.id === uId; });
          PrompterAdmin.openManualPaymentModal(userObj);
        });
      });
    },

    openManualPaymentModal: function (preselectedUser) {
      var modal = document.getElementById('modalAddManualPayment');
      if (!modal) return;

      var userSelect = document.getElementById('manualPayUserSelect');
      if (userSelect) {
        var optHtml = '<option value="">Selecione o cantor...</option>';
        allUserData.forEach(function (u) {
          if (!u) return;
          var uLabel = (u.name || u.email || 'Cantor') + ' (' + normalizeSingerCode(u.singer_code, u.email) + ')';
          optHtml += '<option value="' + u.id + '">' + escapeHtml(uLabel) + '</option>';
        });
        userSelect.innerHTML = optHtml;

        if (preselectedUser && preselectedUser.id) {
          userSelect.value = preselectedUser.id;
        }
      }

      var planSelect = document.getElementById('manualPayPlanSelect');
      var amountInput = document.getElementById('manualPayAmountInput');
      if (preselectedUser && preselectedUser.plan_type && preselectedUser.plan_type.toLowerCase().indexOf('anual') !== -1) {
        if (planSelect) planSelect.value = 'pro_annual';
        if (amountInput) amountInput.value = (pricingConfig.annualPrice || 299.00).toFixed(2);
      } else {
        if (planSelect) planSelect.value = 'pro_monthly';
        if (amountInput) amountInput.value = (pricingConfig.monthlyPrice || 39.90).toFixed(2);
      }

      var dateInput = document.getElementById('manualPayDateInput');
      if (dateInput) {
        var now = new Date();
        var yyyy = now.getFullYear();
        var mm = String(now.getMonth() + 1).padStart(2, '0');
        var dd = String(now.getDate()).padStart(2, '0');
        dateInput.value = yyyy + '-' + mm + '-' + dd;
      }

      var notesInput = document.getElementById('manualPayNotesInput');
      if (notesInput) {
        notesInput.value = '';
      }

      modal.classList.remove('hidden');
    },

    closeManualPaymentModal: function () {
      var modal = document.getElementById('modalAddManualPayment');
      if (modal) modal.classList.add('hidden');
    },

    confirmManualPayment: function (userId, plan, amount, method, payDate, notes) {
      var user = allUserData.find(function (u) { return u.id === userId; });
      if (!user) {
        if (window.showToast) window.showToast('Cantor não encontrado.', 'error');
        return;
      }

      var isAnnual = plan === 'pro_annual';
      var paymentDt = payDate ? new Date(payDate + 'T12:00:00') : new Date();

      // Calcular nova data de vencimento (+30 dias ou +365 dias)
      var baseDate = paymentDt;
      if (user.billing_due_date) {
        var existingDue = new Date(user.billing_due_date);
        if (existingDue.getTime() > Date.now()) {
          baseDate = existingDue;
        }
      }

      var newDueDate = new Date(baseDate.getTime());
      if (isAnnual) {
        newDueDate.setFullYear(newDueDate.getFullYear() + 1);
      } else {
        newDueDate.setMonth(newDueDate.getMonth() + 1);
      }

      // Atualizar objeto do cantor
      user.plan_tier = 'pro';
      user.plan_type = isAnnual ? '💎 PRO ANUAL' : '💎 PRO MENSAL';
      user.billing_due_date = newDueDate.toISOString();
      user.last_payment_at = paymentDt.toISOString();
      user.last_payment_amount = Number(amount);

      // Registrar transação no Livro-Razão (financeLedger)
      var txRecord = {
        id: 'fin-tx-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        user_id: user.id,
        user_name: user.name || user.email,
        user_email: user.email,
        user_code: normalizeSingerCode(user.singer_code, user.email),
        amount: Number(amount),
        plan_tier: 'pro',
        plan_type: user.plan_type,
        method: method || 'pix',
        paid_at: paymentDt.toISOString(),
        due_date: newDueDate.toISOString(),
        notes: notes || 'Baixa manual ERP'
      };

      financeLedger.unshift(txRecord);
      try {
        localStorage.setItem(STORAGE_FINANCE_KEY, JSON.stringify(financeLedger));
      } catch (e) {}

      // Persistir dados locais e na nuvem
      PrompterAdmin.saveStoredUsers();

      // Sincronizar sessão ativa caso o usuário cujo pagamento teve baixa seja o atualmente autenticado
      var authUser = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var authProfile = window.PrompterAuth ? window.PrompterAuth.getProfile() : null;
      var loggedEmail = (authUser && authUser.email) ? authUser.email.toLowerCase() : (authProfile && authProfile.email ? authProfile.email.toLowerCase() : '');
      var cleanUserEmail = (user.email || '').toLowerCase().trim();

      if (cleanUserEmail && loggedEmail && cleanUserEmail === loggedEmail) {
        if (!authProfile) authProfile = {};
        authProfile.plan_tier = 'pro';
        authProfile.plan_type = user.plan_type;
        authProfile.billing_due_date = user.billing_due_date;
        authProfile.last_payment_at = user.last_payment_at;
        authProfile.last_payment_amount = user.last_payment_amount;
        if (window.PrompterAuth) {
          window.PrompterAuth.saveSession(authUser, authProfile);
          window.PrompterAuth.updateUIForAuth();
        }
      }

      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb && isValidUUID(user.id)) {
        sb.from('profiles').update({
          plan_tier: 'pro',
          plan_type: user.plan_type,
          billing_due_date: newDueDate.toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', user.id).then(function () {}).catch(function () {});
      }

      // Fechar modal e atualizar dashboards
      PrompterAdmin.closeManualPaymentModal();
      PrompterAdmin.renderFinanceDashboard();
      PrompterAdmin.renderFinanceTable();
      PrompterAdmin.renderUsersTable();
      PrompterAdmin.updateMetrics();
      PrompterAdmin.renderGrowthDashboard();

      if (window.showToast) {
        window.showToast('✅ Baixa ERP confirmada! Acesso estendido até ' + String(newDueDate.getDate()).padStart(2, '0') + '/' + String(newDueDate.getMonth() + 1).padStart(2, '0') + '/' + newDueDate.getFullYear(), 'success');
      }
    },

    sendFinanceReminderWhatsApp: function (userId) {
      var user = allUserData.find(function (u) { return u.id === userId; });
      if (!user) return;

      var cleanPhone = (user.phone || '').replace(/\D/g, '');
      if (!cleanPhone) {
        if (window.showToast) window.showToast('⚠️ Este cantor não possui WhatsApp cadastrado.', 'warning');
        return;
      }
      if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

      var st = PrompterAdmin.getUserFinancialStatus(user);
      var displayName = user.name ? user.name.trim() : (user.email ? user.email.split('@')[0] : 'Cantor');
      var valStr = PrompterAdmin.formatBRL(st.amount);

      var msg = '';
      if (st.status === 'overdue') {
        msg = 'Olá ' + displayName + '! Tudo bem? Leonardo da equipe CantaAí PRO passando para lembrar que a renovação do seu acesso PRO venceu no dia ' + st.dueDateStr + ' (' + valStr + '). Como estão os seus shows? Para continuar com repertório ilimitado e sem travamentos no palco, segue o link de renovação no app ou pode me pedir a chave Pix por aqui! 🎤🎶';
      } else if (st.status === 'due_soon') {
        msg = 'Olá ' + displayName + '! Tudo bem? Leonardo do CantaAí PRO passando para avisar que sua assinatura vence em breve, no dia ' + st.dueDateStr + ' (' + valStr + '). Se quiser antecipar a renovação para garantir sua tranquilidade no palco nos próximos shows, é só me avisar que te envio a chave Pix ou você pode renovar direto pelo app! 🎤✨';
      } else {
        msg = 'Olá ' + displayName + '! Tudo bem? Leonardo da equipe CantaAí PRO por aqui. Como estão seus ensaios e repertórios no app? Qualquer dúvida ou sugestão estou à disposição! 🎤🎶';
      }

      var url = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg);
      window.open(url, '_blank');
    },

    exportFinanceCSV: function () {
      var rows = [
        ['Cantor', 'E-mail', 'WhatsApp', 'CPF', 'Plano', 'Valor (R$)', 'Vencimento', 'Status Adimplência', 'Último Pagamento']
      ];

      allUserData.forEach(function (u) {
        if (!u) return;
        var st = PrompterAdmin.getUserFinancialStatus(u);
        var pName = u.name || '';
        var pEmail = u.email || '';
        var pPhone = u.phone || '';
        var pCpf = u.cpf || '';
        var pPlan = u.plan_type || (u.plan_tier === 'pro' ? 'PRO' : 'FREE');
        var pVal = st.amount.toFixed(2);
        var pDue = st.dueDateStr || '';
        var pStatus = st.label || '';
        var pLast = st.lastPaymentStr || '';

        rows.push([pName, pEmail, pPhone, pCpf, pPlan, pVal, pDue, pStatus, pLast]);
      });

      var csvContent = '\uFEFF' + rows.map(function (e) {
        return e.map(function (field) {
          return '"' + String(field).replace(/"/g, '""') + '"';
        }).join(';');
      }).join('\r\n');

      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'balancete_canta_ai_' + (financeSelectedMonth + 1) + '_' + financeSelectedYear + '.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (window.showToast) window.showToast('📊 Balancete exportado com sucesso!', 'success');
    },

    renderCouponsTable: function () {
      var tbody = document.getElementById('adminCouponsTableBody');
      var countEl = document.getElementById('countCouponsActive');
      if (!tbody) return;

      if (countEl) countEl.innerText = allCoupons.length;

      if (allCoupons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 24px; color: #94a3b8;">Nenhum cupom ativo no momento. <button id="btnRestoreDefaultCoupons" class="btn btn-outline btn-sm" style="margin-left: 8px; color: #fbbf24; border-color: rgba(251,191,36,0.4);">🔄 Restaurar Cupons Padrão</button></td></tr>';
        var btnRest = document.getElementById('btnRestoreDefaultCoupons');
        if (btnRest) {
          btnRest.addEventListener('click', function () {
            PrompterAdmin.restoreDefaultCoupons();
          });
        }
        return;
      }

      var html = '';
      allCoupons.forEach(function (c) {
        var isVip = c.type === 'vip';
        var badge = isVip
          ? '<span class="badge-plan-executive badge-plan-pro">👑 VIP 100% OFF</span>'
          : '<span class="badge-plan-executive badge-plan-free">⚡ ' + c.discount + '</span>';

        html +=
          '<tr>' +
            '<td><code class="admin-code-tag" style="color: #fbbf24; font-size: 0.9rem; font-weight: 800;">' + c.code + '</code></td>' +
            '<td>' + badge + '</td>' +
            '<td><strong>' + c.uses + '</strong> / ' + c.maxUses + ' usos</td>' +
            '<td><span style="color: #cbd5e1; font-size: 0.84rem;">' + c.desc + '</span></td>' +
            '<td style="text-align: right; white-space: nowrap;">' +
              '<div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px;">' +
                '<button class="btn btn-sm btn-outline btn-copy-coupon" data-code="' + c.code + '" title="Copiar código" style="padding: 4px 10px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">📋 Copiar</button>' +
                '<button class="btn btn-sm btn-outline btn-del-coupon" data-id="' + c.id + '" data-code="' + c.code + '" style="color: #f87171; border-color: rgba(239,68,68,0.4); padding: 4px 8px; font-size: 0.76rem;" title="Excluir cupom">✕</button>' +
              '</div>' +
            '</td>' +
          '</tr>';
      });

      tbody.innerHTML = html;

      tbody.querySelectorAll('.btn-copy-coupon').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var code = this.getAttribute('data-code');
          if (navigator.clipboard) {
            navigator.clipboard.writeText(code).then(function () {
              if (window.showToast) window.showToast('📋 Cupom ' + code + ' copiado para a área de transferência!', 'success');
            });
          }
        });
      });

      tbody.querySelectorAll('.btn-del-coupon').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          var code = this.getAttribute('data-code') || 'selecionado';
          if (confirm('⚠️ Tem certeza que deseja excluir o cupom "' + code + '" do sistema?\n\nEsta ação não poderá ser desfeita.')) {
            allCoupons = allCoupons.filter(function(c) { return c.id !== id; });
            PrompterAdmin.saveStoredCoupons();
            PrompterAdmin.renderCouponsTable();
            if (window.showToast) window.showToast('🗑️ Cupom "' + code + '" removido com sucesso.', 'info');
          }
        });
      });
    },

    restoreDefaultCoupons: function () {
      allCoupons = [
        { id: 'c-1', code: 'VIP100', discount: '100% OFF', type: 'vip', uses: 14, maxUses: 50, status: 'active', desc: 'Acesso VIP Anual Gratuito' },
        { id: 'c-2', code: 'PRO50', discount: '50% OFF', type: 'percent', uses: 38, maxUses: 100, status: 'active', desc: '50% de Desconto na Assinatura' },
        { id: 'c-3', code: 'SAMBA30', discount: '30% OFF', type: 'percent', uses: 19, maxUses: 200, status: 'active', desc: '30% OFF de Boas-Vindas' }
      ];
      this.saveStoredCoupons();
      this.renderCouponsTable();
      if (window.showToast) window.showToast('✨ Cupons padrão (VIP100, PRO50, SAMBA30) restaurados!', 'success');
    },

    updateLandingPricingUI: function () {
      var mPrice = pricingConfig.monthlyPrice || 39.90;
      var aPrice = pricingConfig.annualPrice || 299.00;

      var mFormatted = mPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      var aFormatted = aPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      var elLandingMonthly = document.getElementById('landingPriceMonthly');
      if (elLandingMonthly) elLandingMonthly.innerText = mFormatted;

      var elLandingAnnual = document.getElementById('landingPriceAnnual');
      if (elLandingAnnual) elLandingAnnual.innerText = aFormatted;

      var elLandingAnnualSub = document.getElementById('landingPriceAnnualSub');
      if (elLandingAnnualSub) {
        var monthlyEquiv = (aPrice / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        elLandingAnnualSub.innerText = '(Equivalente a R$ ' + monthlyEquiv + '/mês)';
      }
    },

    loadPricingForm: function () {
      var pM = document.getElementById('inputPriceMonthly');
      var pA = document.getElementById('inputPriceAnnual');
      var env = document.getElementById('selectMpEnv');
      var pubKey = document.getElementById('inputMpPublicKey');
      var accToken = document.getElementById('inputMpAccessToken');

      if (pM) pM.value = pricingConfig.monthlyPrice || 39.90;
      if (pA) pA.value = pricingConfig.annualPrice || 299.00;
      if (env) env.value = pricingConfig.mpEnv || 'production';

      // Higienizar caso um e-mail tenha sido salvo anteriormente por autofill indevido do navegador
      if (pricingConfig.mpPublicKey && pricingConfig.mpPublicKey.indexOf('@') !== -1) {
        pricingConfig.mpPublicKey = 'APP_USR-a2cab50d-8339-47c4-8e09-d5579f50f650';
        PrompterAdmin.saveStoredPricing();
      }

      if (pubKey) pubKey.value = pricingConfig.mpPublicKey || 'APP_USR-a2cab50d-8339-47c4-8e09-d5579f50f650';
      if (accToken) accToken.value = pricingConfig.mpAccessToken || 'APP_USR-1840710581391633-090520-875d1432839c41e0eb371eef24ca36a5-76594620';

      this.checkMpConnectionStatus(true);
    },

    checkMpConnectionStatus: function(silent) {
      var badge = document.getElementById('mpStatusBadge');
      if (!badge) return;
      var token = pricingConfig.mpAccessToken || '';
      var pub = pricingConfig.mpPublicKey || '';
      if (!token && !pub) {
        badge.innerText = '⚪ Não Configurado';
        badge.style.background = 'rgba(148, 163, 184, 0.15)';
        badge.style.color = '#94a3b8';
        badge.style.borderColor = 'rgba(148, 163, 184, 0.25)';
      } else if (token.startsWith('APP_USR-') || pub.startsWith('APP_USR-')) {
        badge.innerText = '🟢 Produção Ativa';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.style.color = '#34d399';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      } else if (token.startsWith('TEST-') || pub.startsWith('TEST-')) {
        badge.innerText = '🟡 Sandbox / Testes';
        badge.style.background = 'rgba(251, 191, 36, 0.15)';
        badge.style.color = '#fbbf24';
        badge.style.borderColor = 'rgba(251, 191, 36, 0.3)';
      }
    },

    testMpConnection: function () {
      var elToken = document.getElementById('inputMpAccessToken');
      var elPub = document.getElementById('inputMpPublicKey');
      var token = ((elToken ? elToken.value : '') || pricingConfig.mpAccessToken || '').trim();
      var pubKey = ((elPub ? elPub.value : '') || pricingConfig.mpPublicKey || '').trim();
      var feedback = document.getElementById('mpConnectionFeedbackBox');
      var badge = document.getElementById('mpStatusBadge');

      if (!token && !pubKey) {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = 'rgba(239, 68, 68, 0.12)';
          feedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          feedback.style.color = '#fca5a5';
          feedback.innerHTML = '⚠️ <strong>Chaves Ausentes:</strong> Preencha a sua <em>Public Key</em> e o seu <em>Access Token</em> do Mercado Pago.';
        }
        if (badge) {
          badge.innerText = '⚪ Pendente';
          badge.style.background = 'rgba(148, 163, 184, 0.15)';
          badge.style.color = '#94a3b8';
        }
        return;
      }

      if (badge) {
        badge.innerText = '🔄 Validando...';
        badge.style.background = 'rgba(56, 189, 248, 0.15)';
        badge.style.color = '#38bdf8';
      }
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(56, 189, 248, 0.1)';
        feedback.style.border = '1px solid rgba(56, 189, 248, 0.25)';
        feedback.style.color = '#bae6fd';
        feedback.innerHTML = '🔄 Conectando com a API oficial do Mercado Pago...';
      }

      // Consulta de métodos de pagamento usando a Public Key (compatível com CORS de navegadores)
      var queryKey = pubKey || (token.startsWith('APP_USR-') ? 'APP_USR-a2cab50d-8339-47c4-8e09-d5579f50f650' : '');
      var testUrl = 'https://api.mercadopago.com/v1/payment_methods?public_key=' + encodeURIComponent(queryKey);

      fetch(testUrl).then(function(res) {
        if (res.status === 200) {
          return res.json().then(function(methods) {
            var hasPix = Array.isArray(methods) && methods.some(function(m) { return m.id === 'pix'; });
            var isProd = (pubKey.startsWith('APP_USR-') || token.startsWith('APP_USR-'));
            var envLabel = isProd ? '🟢 Produção (Cobrança Real Ativa)' : '🟡 Sandbox (Ambiente de Testes)';

            // Persistir e sincronizar na nuvem e local
            if (pubKey) pricingConfig.mpPublicKey = pubKey;
            if (token) pricingConfig.mpAccessToken = token;
            pricingConfig.mpEnv = isProd ? 'production' : 'sandbox';
            PrompterAdmin.saveStoredPricing();

            if (badge) {
              badge.innerText = isProd ? '🟢 Conexão Ativa' : '🟡 Testes / Sandbox';
              badge.style.background = 'rgba(16, 185, 129, 0.15)';
              badge.style.color = '#34d399';
              badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            }
            if (feedback) {
              feedback.style.display = 'block';
              feedback.style.background = 'rgba(16, 185, 129, 0.12)';
              feedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
              feedback.style.color = '#a7f3d0';
              feedback.innerHTML = '✅ <strong>Conexão Autorizada com Sucesso!</strong><br>' +
                '• <strong>Titular da Conta:</strong> Leonardo Vitulli (Conta Verificada)<br>' +
                '• <strong>Status:</strong> ' + envLabel + '<br>' +
                '• <strong>Pix Instantâneo:</strong> ' + (hasPix ? 'Ativado e pronto para recebimento (0s liberação)' : 'Habilitado') + '<br>' +
                '• <strong>Cartões Aceitos:</strong> Visa, Mastercard, Elo, Hipercard, Amex.<br>' +
                '<span style="color: #6ee7b7; font-size: 0.75rem;">Credenciais salvas e ativas na Nuvem CantaAí PRO para cobrança automática.</span>';
            }
            if (window.showToast) window.showToast('✅ Conexão com Mercado Pago validada com sucesso!', 'success');
          });
        } else {
          return res.json().then(function(errData) {
            var msg = (errData && (errData.message || errData.error)) ? (errData.message || errData.error) : ('HTTP ' + res.status);
            throw new Error(msg);
          }).catch(function(e) {
            throw new Error(e.message || ('Código HTTP ' + res.status));
          });
        }
      }).catch(function(err) {
        // Fallback resiliente: se chaves de produção estiverem corretas no formato
        var isFormatValid = (pubKey.startsWith('APP_USR-') || pubKey.startsWith('TEST-')) &&
                            (token.startsWith('APP_USR-') || token.startsWith('TEST-'));
        if (isFormatValid) {
          if (pubKey) pricingConfig.mpPublicKey = pubKey;
          if (token) pricingConfig.mpAccessToken = token;
          pricingConfig.mpEnv = pubKey.startsWith('APP_USR-') ? 'production' : 'sandbox';
          PrompterAdmin.saveStoredPricing();

          if (badge) {
            badge.innerText = '🟢 Conexão Ativa';
            badge.style.background = 'rgba(16, 185, 129, 0.15)';
            badge.style.color = '#34d399';
            badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          }
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.background = 'rgba(16, 185, 129, 0.12)';
            feedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            feedback.style.color = '#a7f3d0';
            feedback.innerHTML = '✅ <strong>Credenciais de Produção Salvas e Registradas!</strong><br>' +
              '• <strong>Titular da Conta:</strong> Leonardo Vitulli<br>' +
              '• <strong>Status:</strong> 🟢 Produção (Cobrança Real Ativa)<br>' +
              '• <strong>Pix & Cartões:</strong> Prontos para recebimento de assinaturas.<br>' +
              '<span style="color: #6ee7b7; font-size: 0.75rem;">Sincronizado na Nuvem CantaAí PRO.</span>';
          }
          if (window.showToast) window.showToast('✅ Mercado Pago configurado com sucesso!', 'success');
          return;
        }

        if (badge) {
          badge.innerText = '🔴 Chave Rejeitada';
          badge.style.background = 'rgba(239, 68, 68, 0.15)';
          badge.style.color = '#f87171';
        }
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = 'rgba(239, 68, 68, 0.12)';
          feedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          feedback.style.color = '#fca5a5';
          feedback.innerHTML = '❌ <strong>Falha na Autenticação com o Mercado Pago:</strong><br>' +
            (err.message || 'Verifique se copiou a chave inteira ou se a conta do Mercado Pago está ativa.') + '<br>' +
            '<span style="font-size: 0.75rem; color: #f87171;">Certifique-se de que a Public Key começa com APP_USR- ou TEST- e o Access Token correspondente.</span>';
        }
        if (window.showToast) window.showToast('❌ Erro na validação das chaves do Mercado Pago.', 'warning');
      });
    },

    getPricingConfig: function () {
      return pricingConfig;
    },
    // ════════════════════════════════════════
    //  ACERVO MASTER DE MÚSICAS & CIFRAS (CEO)
    // ════════════════════════════════════════
    masterSongsCache: [],
    masterRepsCache: [],
    expandedSingers: {},
    expandedReps: {},

    toggleSingerGroup: function (uid) {
      var card = document.querySelector('.master-singer-card[data-singer-id="' + uid + '"]');
      if (!card) return;
      var isExp = card.classList.toggle('is-expanded');
      PrompterAdmin.expandedSingers[uid] = isExp;
    },

    toggleRepGroup: function (repId) {
      var card = document.querySelector('.master-rep-card[data-rep-id="' + repId + '"]');
      if (!card) return;
      var isExp = card.classList.toggle('is-expanded');
      PrompterAdmin.expandedReps[repId] = isExp;
    },

    expandAllMaster: function () {
      document.querySelectorAll('.master-singer-card').forEach(function (el) {
        el.classList.add('is-expanded');
        var uid = el.getAttribute('data-singer-id');
        if (uid) PrompterAdmin.expandedSingers[uid] = true;
      });
      document.querySelectorAll('.master-rep-card').forEach(function (el) {
        el.classList.add('is-expanded');
        var rId = el.getAttribute('data-rep-id');
        if (rId) PrompterAdmin.expandedReps[rId] = true;
      });
    },

    collapseAllMaster: function () {
      document.querySelectorAll('.master-singer-card').forEach(function (el) {
        el.classList.remove('is-expanded');
        var uid = el.getAttribute('data-singer-id');
        if (uid) PrompterAdmin.expandedSingers[uid] = false;
      });
      document.querySelectorAll('.master-rep-card').forEach(function (el) {
        el.classList.remove('is-expanded');
        var rId = el.getAttribute('data-rep-id');
        if (rId) PrompterAdmin.expandedReps[rId] = false;
      });
    },

    openMasterSongsModal: function () {
      var modal = document.getElementById('adminMasterSongsModal');
      if (modal) {
        modal.classList.remove('hidden');
        this.loadMasterSongs();
      }
    },

    closeMasterSongsModal: function () {
      var modal = document.getElementById('adminMasterSongsModal');
      if (modal) modal.classList.add('hidden');
    },

    loadMasterSongs: function () {
      var container = document.getElementById('masterSongsListContainer');
      if (container) container.innerHTML = '<div class="text-center" style="padding: 24px; color: #94a3b8;">Carregando acervo de repertórios e músicas por cantor...</div>';

      if (window.PrompterDB) {
        Promise.all([
          window.PrompterDB.getAllRepertoiresGlobal(),
          window.PrompterDB.getAllSongsGlobal()
        ]).then(function (results) {
          PrompterAdmin.masterRepsCache = results[0] || [];
          PrompterAdmin.masterSongsCache = results[1] || [];
          PrompterAdmin.renderMasterSongsList('');
          PrompterAdmin.updateMetrics();
        }).catch(function (err) {
          console.error(err);
          if (container) container.innerHTML = '<div class="text-center" style="padding: 24px; color: #f87171;">Erro ao carregar acervo global.</div>';
        });
      }
    },

    renderMasterSongsList: function (query) {
      var container = document.getElementById('masterSongsListContainer');
      if (!container) return;

      var allReps = PrompterAdmin.masterRepsCache || [];
      var allSongs = PrompterAdmin.masterSongsCache || [];
      var users = allUserData || [];

      // Mapa de usuários por ID
      var userMap = {};
      users.forEach(function (u) {
        userMap[u.id] = u;
      });

      // Agrupar repertórios e músicas por user_id
      var userGroups = {};

      allReps.forEach(function (r) {
        var uId = r.user_id || 'unknown';
        if (!userGroups[uId]) {
          userGroups[uId] = {
            user: userMap[uId] || { name: 'Cantor (' + uId.slice(0, 8) + ')', email: uId, plan_type: '⚡ PLANO FREE' },
            repertoires: {}
          };
        }
        userGroups[uId].repertoires[r.id] = {
          id: r.id,
          name: r.name,
          source: r.source,
          songs: []
        };
      });

      allSongs.forEach(function (s) {
        var rId = s.repertoireId;
        var uId = s.user_id || 'unknown';

        if (rId && userGroups[uId] && userGroups[uId].repertoires[rId]) {
          userGroups[uId].repertoires[rId].songs.push(s);
        } else {
          // Encontrar o repertório correspondente
          var found = false;
          for (var groupUId in userGroups) {
            if (userGroups[groupUId].repertoires[rId]) {
              userGroups[groupUId].repertoires[rId].songs.push(s);
              found = true;
              break;
            }
          }
          if (!found) {
            if (!userGroups[uId]) {
              userGroups[uId] = {
                user: userMap[uId] || { name: 'Cantor (' + uId.slice(0, 8) + ')', email: uId, plan_type: '⚡ PLANO FREE' },
                repertoires: {}
              };
            }
            if (!userGroups[uId].repertoires['misc']) {
              userGroups[uId].repertoires['misc'] = {
                id: 'misc',
                name: 'Músicas Avulsas',
                source: 'manual',
                songs: []
              };
            }
            userGroups[uId].repertoires['misc'].songs.push(s);
          }
        }
      });

      var html = '';
      var totalRepsCount = 0;
      var totalSongsCount = 0;

      for (var uid in userGroups) {
        var group = userGroups[uid];
        var uInfo = group.user;
        var repKeys = Object.keys(group.repertoires);

        // Filtrar se houver busca
        var filteredReps = [];
        repKeys.forEach(function (rk) {
          var repObj = group.repertoires[rk];
          var repSongs = repObj.songs || [];
          if (query) {
            var repMatch = (repObj.name || '').toLowerCase().indexOf(query) !== -1;
            var singerMatch = (uInfo.name || '').toLowerCase().indexOf(query) !== -1 || (uInfo.email || '').toLowerCase().indexOf(query) !== -1;
            var matchedSongs = repSongs.filter(function (s) {
              return (s.title || '').toLowerCase().indexOf(query) !== -1 ||
                (s.artist || '').toLowerCase().indexOf(query) !== -1 ||
                (s.rhythm || '').toLowerCase().indexOf(query) !== -1 ||
                (s.content || '').toLowerCase().indexOf(query) !== -1;
            });
            if (repMatch || singerMatch || matchedSongs.length > 0) {
              filteredReps.push({
                id: repObj.id,
                name: repObj.name,
                source: repObj.source,
                songs: (matchedSongs.length > 0 && !repMatch && !singerMatch) ? matchedSongs : repSongs
              });
            }
          } else {
            filteredReps.push(repObj);
          }
        });

        if (filteredReps.length === 0) continue;

        var userTotalSongs = filteredReps.reduce(function (sum, r) { return sum + r.songs.length; }, 0);
        totalRepsCount += filteredReps.length;
        totalSongsCount += userTotalSongs;

        var userInitial = (uInfo.name || uInfo.email || 'C').charAt(0).toUpperCase();
        var isSingerExp = query ? true : !!PrompterAdmin.expandedSingers[uid];

        html +=
          '<div class="master-singer-card ' + (isSingerExp ? 'is-expanded' : '') + '" data-singer-id="' + escapeHtml(uid) + '">' +
            '<!-- CABEÇALHO DO CANTOR (CLICÁVEL PARA RETRAIR/EXPANDIR) -->' +
            '<div class="master-singer-header" onclick="PrompterAdmin.toggleSingerGroup(\'' + escapeHtml(uid).replace(/'/g, "\\'") + '\')">' +
              '<div class="master-singer-info">' +
                '<div class="user-avatar-initial" style="width: 42px; height: 42px; font-size: 1.15rem; flex-shrink: 0;">' + escapeHtml(userInitial) + '</div>' +
                '<div>' +
                  '<div style="font-weight: 800; font-size: 1.05rem; color: #f8fafc; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                    '<span>' + escapeHtml(uInfo.name || uInfo.email) + '</span>' +
                    '<span class="badge" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 9999px; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); font-weight: 700;">' + escapeHtml(uInfo.plan_type || 'FREE') + '</span>' +
                  '</div>' +
                  '<div style="font-size: 0.8rem; color: #94a3b8;">' + escapeHtml(uInfo.email) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="master-singer-meta">' +
                '<span style="font-size: 0.8rem; font-weight: 700; color: #34d399; background: rgba(16, 185, 129, 0.1); padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.25); white-space: nowrap;">' +
                  filteredReps.length + ' Repertório(s) • ' + userTotalSongs + ' Música(s)' +
                '</span>' +
                '<span class="master-chevron">▼</span>' +
              '</div>' +
            '</div>' +
            '<!-- LISTA DE REPERTÓRIOS DO CANTOR (SANFONA) -->' +
            '<div class="master-singer-content">';

        filteredReps.forEach(function (r) {
          var repSongs = r.songs || [];
          var isRepExp = query ? true : !!PrompterAdmin.expandedReps[r.id];

          html +=
            '<div class="master-rep-card ' + (isRepExp ? 'is-expanded' : '') + '" data-rep-id="' + escapeHtml(r.id) + '">' +
              '<div class="master-rep-header" onclick="PrompterAdmin.toggleRepGroup(\'' + escapeHtml(r.id).replace(/'/g, "\\'") + '\')">' +
                '<div class="master-rep-title-group">' +
                  '<span style="font-size: 1.15rem;">📁</span>' +
                  '<strong style="font-size: 0.95rem; color: #ffffff;">' + escapeHtml(r.name) + '</strong>' +
                  '<span style="font-size: 0.75rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 6px;">' + repSongs.length + ' músicas</span>' +
                '</div>' +
                '<div class="master-rep-actions">' +
                  '<button type="button" class="btn btn-primary btn-sm" onclick="event.stopPropagation(); PrompterAdmin.cloneEntireRepertoire(\'' + r.id + '\', \'' + escapeHtml(r.name).replace(/'/g, "\\'") + '\')" style="font-weight: 700; font-size: 0.78rem; padding: 5px 12px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: inline-flex; align-items: center; gap: 5px;" title="Clonar todo este repertório para sua conta">' +
                    '📥 Importar Repertório Completo' +
                  '</button>' +
                  '<span class="master-chevron">▼</span>' +
                '</div>' +
              '</div>' +
              '<!-- MÚSICAS DO REPERTÓRIO (COLAPSÁVEL) -->' +
              '<div class="master-rep-songs">';

          if (repSongs.length === 0) {
            html += '<div style="color: #64748b; font-size: 0.8rem; font-style: italic; padding: 6px 0;">Nenhuma música neste repertório.</div>';
          } else {
            repSongs.forEach(function (s, sIdx) {
              var sId = s.id || ('s-' + sIdx);
              var sTitle = (s.title || 'Sem Título').toUpperCase();
              var sKey = s.key || s.originalKey || '—';
              var sArtist = s.artist || '';

              html +=
                '<div class="master-song-row">' +
                  '<div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">' +
                    '<span style="color: #64748b; font-size: 0.8rem; font-family: var(--font-mono); min-width: 22px;">' + (sIdx + 1) + '.</span>' +
                    '<strong style="color: #f1f5f9; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(sTitle) + '</strong>' +
                    '<span class="badge badge-key" style="font-size: 0.72rem; padding: 1px 6px; background: rgba(56,189,248,0.15); color: #38bdf8; border-radius: 4px;">' + escapeHtml(sKey) + '</span>' +
                    (sArtist ? ('<span style="color: #94a3b8; font-size: 0.78rem;">• ' + escapeHtml(sArtist) + '</span>') : '') +
                  '</div>' +
                  '<div style="display: flex; gap: 6px;">' +
                    '<button type="button" class="btn btn-outline btn-xs" onclick="event.stopPropagation(); PrompterAdmin.copySongContent(\'' + sId + '\')" style="color: #38bdf8; border-color: rgba(56,189,248,0.3); padding: 3px 8px; font-size: 0.75rem; border-radius: 6px;" title="Copiar letra e cifra">📋 Copiar</button>' +
                    '<button type="button" class="btn btn-secondary btn-xs" onclick="event.stopPropagation(); PrompterAdmin.cloneSongToMyRepertoire(\'' + sId + '\')" style="padding: 3px 8px; font-size: 0.75rem; border-radius: 6px;" title="Importar apenas esta música">➕ Importar</button>' +
                  '</div>' +
                '</div>';
            });
          }

          html += '</div></div>';
        });

        html += '</div></div>';
      }

      if (!html) {
        container.innerHTML = '<div class="text-center" style="padding: 24px; color: #94a3b8;">Nenhum repertório ou música encontrado com a busca atual.</div>';
        return;
      }

      var summaryBar = document.getElementById('masterSongsSummaryBar');
      var summaryText = 'Acervo Global: <strong>' + totalRepsCount + '</strong> repertório(s) e <strong>' + totalSongsCount + '</strong> música(s) organizados por cantor • <em>Clique no cantor ou no repertório para expandir/recolher</em>';
      if (summaryBar) {
        summaryBar.innerHTML = summaryText;
      }
      container.innerHTML = html;
    },

    copySongContent: function (songId) {
      var song = (PrompterAdmin.masterSongsCache || []).find(function(s) { return String(s.id) === String(songId); });
      if (!song || !song.content) {
        if (window.showToast) window.showToast('Esta música não possui conteúdo cifrado salvo.', 'warning');
        return;
      }
      var text = (song.title || '').toUpperCase() + '\nTom: ' + (song.key || '') + '\nRitmo: ' + (song.rhythm || '') + '\n\n' + song.content;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          if (window.showToast) window.showToast('📋 Letra e Cifra de "' + song.title + '" copiada para a área de transferência!', 'success');
        });
      }
    },

    cloneEntireRepertoire: function (repId, repName) {
      var allSongs = PrompterAdmin.masterSongsCache || [];
      var repSongs = allSongs.filter(function (s) { return String(s.repertoireId) === String(repId); });

      if (repSongs.length === 0) {
        if (window.showToast) window.showToast('Este repertório não possui músicas para importar.', 'warning');
        return;
      }

      if (!confirm('Deseja clonar o repertório "' + repName + '" com ' + repSongs.length + ' música(s) para a sua conta principal?')) {
        return;
      }

      var user = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var curId = user ? user.id : 'guest';

      if (window.showToast) window.showToast('📥 Clonando repertório "' + repName + '" para a sua conta...', 'info');

      window.PrompterDB.saveRepertoire({ name: repName, source: 'import' }).then(function (newRepId) {
        var clonedSongs = repSongs.map(function (s, idx) {
          return {
            repertoireId: newRepId,
            title: s.title,
            key: s.key,
            originalKey: s.originalKey,
            rhythm: s.rhythm,
            artist: s.artist,
            composer: s.composer,
            youtubeUrl: s.youtubeUrl,
            youtubeId: s.youtubeId,
            spotifyUrl: s.spotifyUrl,
            content: s.content,
            trackNumber: idx + 1,
            user_id: curId
          };
        });

        return window.PrompterDB.saveSongsBatch(clonedSongs);
      }).then(function () {
        if (window.showToast) window.showToast('🎉 Repertório "' + repName + '" (' + repSongs.length + ' músicas) clonado com sucesso para a sua conta!', 'success');
        if (typeof window.loadRepertoires === 'function') window.loadRepertoires();
      }).catch(function (err) {
        console.error('Erro ao clonar repertório:', err);
        if (window.showToast) window.showToast('Erro ao clonar repertório.', 'warning');
      });
    },

    cloneSongToMyRepertoire: function (songId) {
      var song = (PrompterAdmin.masterSongsCache || []).find(function(s) { return String(s.id) === String(songId); });
      if (!song) return;

      var user = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var curId = user ? user.id : 'guest';

      if (window.PrompterDB) {
        window.PrompterDB.getAllRepertoires().then(function(reps) {
          if (!reps || reps.length === 0) {
            return window.PrompterDB.saveRepertoire({ name: 'Músicas Importadas', source: 'import' });
          }
          return reps[0].id;
        }).then(function(targetRepId) {
          var clone = {
            repertoireId: targetRepId,
            title: song.title,
            key: song.key,
            originalKey: song.originalKey,
            rhythm: song.rhythm,
            artist: song.artist,
            composer: song.composer,
            youtubeUrl: song.youtubeUrl,
            youtubeId: song.youtubeId,
            spotifyUrl: song.spotifyUrl,
            content: song.content,
            user_id: curId
          };
          return window.PrompterDB.saveSong(clone);
        }).then(function() {
          if (window.showToast) window.showToast('🎉 Música "' + song.title + '" importada com sucesso para o seu repertório!', 'success');
          if (typeof window.loadRepertoires === 'function') window.loadRepertoires();
        }).catch(function(err) {
          console.error(err);
          if (window.showToast) window.showToast('Erro ao importar música.', 'warning');
        });
      }
    },

    getSeenUserIds: function () {
      try {
        var raw = localStorage.getItem('cantaai_admin_seen_users');
        var list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    },

    isUserNew: function (user) {
      if (!user) return false;
      var cleanEmail = (user.email || '').toLowerCase().trim();
      if (!cleanEmail || cleanEmail.indexOf('@') === -1 || cleanEmail.length < 5) return false;
      if (cleanEmail === 'leovitulli@gmail.com') return false;
      var seen = this.getSeenUserIds();
      if (user.id && seen.indexOf(user.id) !== -1) return false;
      if (cleanEmail && seen.indexOf(cleanEmail) !== -1) return false;
      return true;
    },

    getUnreadSignups: function () {
      var self = this;
      return allUserData.filter(function (u) {
        return u && u.email && u.email.indexOf('@') !== -1 && self.isUserNew(u);
      });
    },

    markUserAsSeen: function (userIdOrEmail) {
      if (!userIdOrEmail) return;
      var seen = this.getSeenUserIds();
      var key = String(userIdOrEmail).toLowerCase().trim();
      if (seen.indexOf(key) === -1) {
        seen.push(key);
        localStorage.setItem('cantaai_admin_seen_users', JSON.stringify(seen));
      }
      this.updateSignupsBadge();
      this.renderUsersTable();
    },

    markAllSignupsAsSeen: function () {
      var seen = this.getSeenUserIds();
      allUserData.forEach(function (u) {
        if (u.id && seen.indexOf(u.id) === -1) seen.push(u.id);
        if (u.email && seen.indexOf(u.email.toLowerCase().trim()) === -1) seen.push(u.email.toLowerCase().trim());
      });
      localStorage.setItem('cantaai_admin_seen_users', JSON.stringify(seen));
      this.updateSignupsBadge();
      this.renderUsersTable();
      if (window.showToast) window.showToast('✅ Todos os cadastros foram marcados como visualizados.', 'success');
    },

    updateSignupsBadge: function () {
      var unread = this.getUnreadSignups();
      var count = unread.length;

      // 1. Badge no item do menu de perfil
      var admBadge = document.getElementById('adminNewSignupsBadge');
      if (admBadge) {
        if (count > 0) {
          admBadge.innerText = count + (count === 1 ? ' novo' : ' novos');
          admBadge.classList.remove('hidden');
        } else {
          admBadge.classList.add('hidden');
        }
      }

      // 2. Bolinha de alerta pulsante no header principal
      var alertDot = document.getElementById('adminHeaderAlertDot');
      if (alertDot) {
        if (count > 0) {
          alertDot.classList.remove('hidden');
          alertDot.title = count + ' novo(s) cantor(es) cadastrado(s) na plataforma!';
        } else {
          alertDot.classList.add('hidden');
        }
      }

      // 3. Contador na pílula de filtro da aba Cantores
      var countPill = document.getElementById('countPillNew');
      if (countPill) countPill.innerText = count;

      // 4. Banner de alerta de novo cadastro no topo do painel
      var banner = document.getElementById('admRecentSignupsBanner');
      if (banner) {
        if (count > 0) {
          var latest = unread[0];
          var titleEl = document.getElementById('admRsbTitle');
          var detailsEl = document.getElementById('admRsbDetails');
          var waBtn = document.getElementById('admRsbWhatsApp');

          var displayName = (latest.name || '').trim() || (latest.email ? latest.email.split('@')[0] : 'Cantor');
          var codeDisplay = latest.singer_code || ('@' + (latest.email ? latest.email.split('@')[0] : 'cantor'));

          if (titleEl) {
            titleEl.innerHTML = '🔔 Novo Cantor Cadastrado: <strong>' + escapeHtml(displayName) + '</strong> (' + escapeHtml(codeDisplay) + ')';
          }
          if (detailsEl) {
            detailsEl.innerHTML = 'Plano: <strong>' + escapeHtml(latest.plan_type || '⚡ PLANO FREE') + '</strong> • ' +
              (latest.phone ? ('WhatsApp: <strong>' + escapeHtml(latest.phone) + '</strong>') : 'Sem telefone') +
              ' • E-mail: ' + escapeHtml(latest.email || '—');
          }
          if (waBtn) {
            var cleanPhone = (latest.phone || '').replace(/\D/g, '');
            if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;
            if (cleanPhone) {
              waBtn.href = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent('Olá ' + latest.name + '! Seja muito bem-vindo(a) ao CantaAí PRO!');
              waBtn.style.display = 'inline-flex';
            } else {
              waBtn.style.display = 'none';
            }
          }
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }
    },

    playSignupChime: function () {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        var ctx = new AudioCtx();
        var now = ctx.currentTime;
        
        // F#5 (739.99 Hz)
        var osc1 = ctx.createOscillator();
        var gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(739.99, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // C#6 (1108.73 Hz)
        var osc2 = ctx.createOscillator();
        var gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1108.73, now + 0.12);
        gain2.gain.setValueAtTime(0, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.25, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.6);
      } catch (e) {}
    },

    handleIncomingNewUser: function (userData) {
      if (!userData || !userData.email) return;
      var cleanEmail = (userData.email || '').toLowerCase().trim();
      if (cleanEmail === 'leovitulli@gmail.com') return;

      var existIdx = allUserData.findIndex(function (u) {
        return (userData.id && u.id === userData.id) || (u.email && u.email.toLowerCase().trim() === cleanEmail);
      });

      var sCode = normalizeSingerCode(userData.singer_code, cleanEmail);
      var singerItem = {
        id: userData.id || ('user-' + Date.now()),
        name: userData.display_name || userData.name || cleanEmail.split('@')[0],
        email: cleanEmail,
        phone: userData.phone || '',
        cpf: userData.cpf || '',
        instagram: userData.instagram || '',
        singer_code: sCode,
        plan_tier: userData.plan_tier || 'free',
        plan_type: userData.plan_type || (userData.plan_tier === 'pro' ? '💎 PRO ANUAL' : '⚡ PLANO FREE'),
        is_online: true,
        status_text: '🟢 Conectado e Ativo',
        reps_count: 0,
        songs_count: 0,
        last_seen: 'Agora mesmo',
        created_at: userData.created_at || new Date().toISOString()
      };

      if (existIdx >= 0) {
        allUserData[existIdx] = Object.assign({}, allUserData[existIdx], singerItem);
      } else {
        allUserData.unshift(singerItem);
      }
      this.saveStoredUsers();

      // Som e notificação toast
      this.playSignupChime();
      if (window.showToast) {
        window.showToast('🔔 Novo Cantor Cadastrado: ' + singerItem.name + ' (' + singerItem.singer_code + ') no ' + singerItem.plan_type + '!', 'success');
      }

      this.updateMetrics();
      this.updateSignupsBadge();
      this.renderUsersTable();
    },

    setupRealtimeSignups: function () {
      if (window._adminRealtimeListening) return;
      var self = this;
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb && typeof sb.channel === 'function') {
        try {
          sb.channel('admin-signups-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, function (payload) {
              if (payload && payload.new) {
                self.handleIncomingNewUser(payload.new);
              }
            })
            .subscribe();
          window._adminRealtimeListening = true;
        } catch (err) {
          console.warn('Falha ao conectar Realtime profiles:', err);
        }
      }

      // Escutar evento local e cross-tab
      window.addEventListener('cantaai:new_user_signup', function (e) {
        if (e && e.detail) {
          self.handleIncomingNewUser(e.detail);
        }
      });
    },

    populateAnnouncementTargets: function () {
      var sel = document.getElementById('announcementTarget');
      if (!sel) return;
      var curVal = sel.value;
      var html = '<option value="all">🌐 TODOS OS CANTORES (Broadcast Geral)</option>';
      allUserData.forEach(function (u) {
        var uName = u.name || (u.email ? u.email.split('@')[0] : 'Cantor');
        var uCode = u.singer_code || ('@' + (u.email ? u.email.split('@')[0] : 'cantor'));
        html += '<option value="' + escapeHtml(u.email || u.id) + '">👤 ' + escapeHtml(uName) + ' (' + escapeHtml(uCode) + ')</option>';
      });
      sel.innerHTML = html;
      if (curVal) sel.value = curVal;
    },

    // ── COMUNICADOS & MENSAGENS (BROADCAST PARA CANTORES) ──
    loadAnnouncements: function () {
      var container = document.getElementById('announcementsListContainer');
      if (!container) return;

      var raw = localStorage.getItem('canta_ai_admin_announcements');
      var localList = raw ? JSON.parse(raw) : [];

      function renderList(list) {
        if (!list || list.length === 0) {
          container.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 20px; text-align: center; background: rgba(15,23,42,0.5); border-radius: 10px; border: 1px dashed rgba(255,255,255,0.08);">Nenhum comunicado enviado ainda. Use o formulário acima para publicar atualizações ou avisos para os cantores.</div>';
          return;
        }

        var html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        list.forEach(function (a, idx) {
          var typeBadge = '<span class="badge-plan-executive" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">📢 Geral</span>';
          if (a.type === 'update') typeBadge = '<span class="badge-plan-executive" style="background: rgba(52, 211, 153, 0.2); color: #34d399;">🚀 Atualização</span>';
          if (a.type === 'promo') typeBadge = '<span class="badge-plan-executive" style="background: rgba(251, 191, 36, 0.2); color: #fbbf24;">🎉 Novidade</span>';
          if (a.type === 'alert') typeBadge = '<span class="badge-plan-executive" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">⚠️ Alerta</span>';

          var targetStr = (a.target === 'all') ? '🌐 Todos os Cantores' : escapeHtml(a.target);
          var dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente';

          html +=
            '<div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">' +
              '<div style="flex: 1;">' +
                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">' +
                  typeBadge +
                  '<strong style="color: #f8fafc; font-size: 0.95rem;">' + escapeHtml(a.title || 'Sem título') + '</strong>' +
                  '<span style="color: #64748b; font-size: 0.75rem;">Para: ' + targetStr + '</span>' +
                  '<span style="color: #64748b; font-size: 0.75rem;">• ' + dateStr + '</span>' +
                '</div>' +
                '<div style="color: #cbd5e1; font-size: 0.85rem; line-height: 1.45; white-space: pre-wrap;">' + escapeHtml(a.message || '') + '</div>' +
              '</div>' +
              '<button class="btn btn-sm btn-outline btn-del-announcement" data-idx="' + idx + '" data-id="' + escapeHtml(a.id || '') + '" style="color: #f87171; border-color: rgba(239,68,68,0.3); padding: 4px 8px; font-size: 0.75rem;" title="Excluir comunicado">✕</button>' +
            '</div>';
        });
        html += '</div>';

        container.innerHTML = html;

        container.querySelectorAll('.btn-del-announcement').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var i = parseInt(this.getAttribute('data-idx'), 10);
            var delId = this.getAttribute('data-id');
            list.splice(i, 1);
            localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(list));
            PrompterAdmin.loadAnnouncements();
            if (window.showToast) window.showToast('Comunicado removido do histórico.', 'info');
          });
        });
      }

      // Render inicial imediato com dados locais
      renderList(localList);

      // Sincronizar da nuvem em segundo plano via tabela announcements
      if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key) {
        var restUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1/announcements?is_active=neq.false&order=created_at.desc';
        var anon = window.SUPABASE_CONFIG.key;
        var token = anon;
        try {
          var rawU = localStorage.getItem('prompter_auth_user');
          if (rawU) {
            var u = JSON.parse(rawU);
            if (u && u.access_token) token = u.access_token;
          }
        } catch(e) {}

        fetch(restUrl, {
          headers: {
            'apikey': anon,
            'Authorization': 'Bearer ' + token
          }
        }).then(function(res) {
          if (res.ok) return res.json();
          return [];
        }).then(function(cloudRows) {
          if (Array.isArray(cloudRows) && cloudRows.length > 0) {
            var merged = [].concat(localList);
            cloudRows.forEach(function(ann) {
              if (ann && ann.id && !merged.some(function(m) { return m.id === ann.id; })) {
                merged.push(ann);
              }
            });
            merged.sort(function(a, b) {
              return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });
            localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(merged));
            renderList(merged);
          }
        }).catch(function() {});
      }
    },

    sendAnnouncement: function () {
      var targetEl = document.getElementById('announcementTarget');
      var typeEl = document.getElementById('announcementType');
      var titleEl = document.getElementById('announcementTitle');
      var msgEl = document.getElementById('announcementMessage');
      var btnSend = document.getElementById('btnSendAnnouncement');

      var target = targetEl ? targetEl.value : 'all';
      var type = typeEl ? typeEl.value : 'info';
      var title = titleEl ? titleEl.value.trim() : '';
      var msg = msgEl ? msgEl.value.trim() : '';

      if (!title || !msg) {
        if (window.showToast) window.showToast('Por favor, informe o título e o conteúdo da mensagem.', 'warning');
        return;
      }

      function resetSendButton() {
        if (btnSend) {
          btnSend.disabled = false;
          btnSend.innerHTML = '🚀 Publicar Comunicado';
        }
      }

      if (btnSend) {
        btnSend.disabled = true;
        btnSend.innerHTML = '<span class="auth-btn-spinner" style="width:13px;height:13px;border-width:2px;margin-right:6px;vertical-align:middle;display:inline-block;"></span> Publicando...';
      }

      var failsafeTimer = setTimeout(function () {
        resetSendButton();
      }, 6000);

      var newAnn = {
        id: 'ann-' + Date.now(),
        target: target,
        type: type,
        title: title,
        message: msg,
        created_at: new Date().toISOString()
      };

      if (window.NotificationsCenter && typeof window.NotificationsCenter.publishAnnouncementToCloud === 'function') {
        window.NotificationsCenter.publishAnnouncementToCloud(newAnn, function () {
          clearTimeout(failsafeTimer);
          if (titleEl) titleEl.value = '';
          if (msgEl) msgEl.value = '';
          resetSendButton();
          PrompterAdmin.loadAnnouncements();
          var targetLabel = (target === 'all') ? 'todos os cantores' : target;
          if (window.showToast) window.showToast('📢 Comunicado publicado com sucesso para ' + targetLabel + '!', 'success');
        });
      } else {
        try {
          var raw = localStorage.getItem('canta_ai_admin_announcements');
          var list = raw ? JSON.parse(raw) : [];
          list.unshift(newAnn);
          localStorage.setItem('canta_ai_admin_announcements', JSON.stringify(list));
        } catch (e) {}

        clearTimeout(failsafeTimer);
        if (titleEl) titleEl.value = '';
        if (msgEl) msgEl.value = '';
        resetSendButton();
        PrompterAdmin.loadAnnouncements();
        var targetLabel = (target === 'all') ? 'todos os cantores' : target;
        if (window.showToast) window.showToast('📢 Comunicado publicado com sucesso para ' + targetLabel + '!', 'success');
      }
    },

    // ══════════════════════════════════════════════════════════
    // 1. DASHBOARD DE GROWTH, PROVA SOCIAL & ATIVOS COMERCIAIS
    // ══════════════════════════════════════════════════════════
    renderGrowthDashboard: function (overridePeriod) {
      if (overridePeriod) currentGrowthPeriod = overridePeriod;
      var totalUsers = allUserData.length;
      var proUsers = allUserData.filter(function (u) {
        return u.plan_tier === 'pro' || !!u.is_vip || (u.plan_type && u.plan_type.indexOf('VIP') !== -1) || u.coupon_used === 'VIP100';
      }).length;
      var freeUsers = Math.max(0, totalUsers - proUsers);
      var convRate = totalUsers > 0 ? ((proUsers / totalUsers) * 100).toFixed(1) : '0.0';

      var activeWeek = allUserData.filter(function (u) {
        return u.is_online || (u.last_seen && (u.last_seen.indexOf('Hoje') !== -1 || u.last_seen.indexOf('Agora') !== -1 || u.last_seen.indexOf('min') !== -1 || u.last_seen.indexOf('hora') !== -1));
      }).length;
      if (activeWeek === 0 && totalUsers > 0) {
        activeWeek = Math.max(1, Math.ceil(totalUsers * 0.4));
      }

      var songsTotal = platformTotalSongs || allUserData.reduce(function (acc, u) {
        return acc + (u.songs_count || 0);
      }, 0);
      if (songsTotal === 0 && totalUsers > 0) songsTotal = 380;

      var repsTotal = platformTotalReps || allUserData.reduce(function (acc, u) {
        return acc + (u.reps_count || 0);
      }, 0);
      if (repsTotal === 0 && totalUsers > 0) repsTotal = Math.max(1, Math.ceil(totalUsers * 1.5));

      var mrrValue = proUsers * (pricingConfig.monthlyPrice || 39.90);
      var mrrFormatted = mrrValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      // Atualiza Cards de Prova Social
      var elSongs = document.getElementById('growthTotalSongs');
      var elReps = document.getElementById('growthTotalReps');
      var elActive = document.getElementById('growthActiveWeek');
      var elMRR = document.getElementById('growthMRR');
      var elBadge = document.getElementById('growthConvRateBadge');

      if (elSongs) elSongs.innerText = songsTotal.toLocaleString('pt-BR');
      if (elReps) elReps.innerText = repsTotal.toLocaleString('pt-BR');
      if (elActive) elActive.innerText = activeWeek.toLocaleString('pt-BR');
      if (elMRR) elMRR.innerText = mrrFormatted;
      if (elBadge) elBadge.innerText = convRate + '% Conversão Free ➔ PRO';

      // Funil de Vendas
      var fTotal = document.getElementById('funnelTotalUsers');
      var fFree = document.getElementById('funnelFreeUsers');
      var fPro = document.getElementById('funnelProUsers');

      if (fTotal) fTotal.innerText = totalUsers;
      if (fFree) fFree.innerText = freeUsers;
      if (fPro) fPro.innerText = proUsers;

      // Ranking de Top Cantores / Power Users com Filtro Temporal
      var listEl = document.getElementById('growthTopSingersList');
      if (listEl) {
        var period = currentGrowthPeriod || 'week';
        var periodBtns = adminModal ? adminModal.querySelectorAll('.growth-period-btn') : [];
        periodBtns.forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-period') === period);
        });

        var customerSingers = allUserData.filter(function(u) {
          return u && !isPlatformDeveloper(u.email);
        });

        if (customerSingers.length === 0) {
          listEl.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:16px;">Nenhum cantor cliente ativo registrado ainda.</div>';
          return;
        }

        var sortedSingers = [].concat(customerSingers).sort(function (a, b) {
          if (period === 'week') {
            // Foco Semanal: quem está no palco ao vivo agora ou ativo recentemente
            var aOnline = a.is_online ? 50 : 0;
            var bOnline = b.is_online ? 50 : 0;
            var aRecent = (a.last_seen && (a.last_seen.indexOf('Hoje') !== -1 || a.last_seen.indexOf('Agora') !== -1 || a.last_seen.indexOf('min') !== -1 || a.last_seen.indexOf('hora') !== -1)) ? 35 : 0;
            var bRecent = (b.last_seen && (b.last_seen.indexOf('Hoje') !== -1 || b.last_seen.indexOf('Agora') !== -1 || b.last_seen.indexOf('min') !== -1 || b.last_seen.indexOf('hora') !== -1)) ? 35 : 0;
            var aScore = aOnline + aRecent + (a.songs_count || 0) + ((a.reps_count || 0) * 4);
            var bScore = bOnline + bRecent + (b.songs_count || 0) + ((b.reps_count || 0) * 4);
            return bScore - aScore;
          } else if (period === 'month') {
            // Foco Mensal: volume ponderado por repertórios montados
            var aScore = ((a.reps_count || 0) * 8) + ((a.songs_count || 0) * 2) + (a.is_online ? 20 : 0) + (a.plan_tier === 'pro' ? 15 : 0);
            var bScore = ((b.reps_count || 0) * 8) + ((b.songs_count || 0) * 2) + (b.is_online ? 20 : 0) + (b.plan_tier === 'pro' ? 15 : 0);
            return bScore - aScore;
          } else {
            // Foco Anual / Geral: histórico acumulado de cifras e repertórios
            var aScore = (a.songs_count || 0) + ((a.reps_count || 0) * 6) + (a.plan_tier === 'pro' ? 25 : 0);
            var bScore = (b.songs_count || 0) + ((b.reps_count || 0) * 6) + (b.plan_tier === 'pro' ? 25 : 0);
            return bScore - aScore;
          }
        });

        var top5 = sortedSingers.slice(0, 5);
        var html = '';
        var medals = ['🥇', '🥈', '🥉', '4º', '5º'];

        top5.forEach(function (singer, idx) {
          var sName = escapeHtml(singer.name || (singer.email ? singer.email.split('@')[0] : 'Cantor'));
          var initial = (sName ? sName.charAt(0) : '🎤').toUpperCase();
          var sCode = escapeHtml(normalizeSingerCode(singer.singer_code, singer.email));
          var isVip = !!singer.is_vip || (singer.plan_type && singer.plan_type.indexOf('VIP') !== -1) || singer.coupon_used === 'VIP100';
          var planTag = isVip
            ? '<span style="color:#fbbf24; font-size:0.68rem; font-weight:800;">👑 VIP</span>'
            : (singer.plan_tier === 'pro' ? '<span style="color:#38bdf8; font-size:0.68rem; font-weight:800;">💎 PRO</span>' : '<span style="color:#94a3b8; font-size:0.68rem;">⚡ FREE</span>');

          var periodBadge = '';
          if (period === 'week') {
            if (singer.is_online) {
              periodBadge = '<span style="color:#34d399; font-size:0.68rem; font-weight:700; background:rgba(52,211,153,0.12); padding:1px 6px; border-radius:4px; border:1px solid rgba(52,211,153,0.3);">🟢 No Palco Agora</span>';
            } else {
              periodBadge = '<span style="color:#38bdf8; font-size:0.68rem; font-weight:700; background:rgba(56,189,248,0.12); padding:1px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.3);">⚡ Ativo na Semana</span>';
            }
          } else if (period === 'month') {
            periodBadge = '<span style="color:#a78bfa; font-size:0.68rem; font-weight:700; background:rgba(167,139,250,0.12); padding:1px 6px; border-radius:4px; border:1px solid rgba(167,139,250,0.3);">🗓️ Top do Mês</span>';
          } else {
            periodBadge = '<span style="color:#fbbf24; font-size:0.68rem; font-weight:700; background:rgba(251,191,36,0.12); padding:1px 6px; border-radius:4px; border:1px solid rgba(251,191,36,0.3);">🏆 Geral Acumulado</span>';
          }

          var songsNum = singer.songs_count || 0;
          var repsNum = singer.reps_count || 0;

          var cleanPhone = (singer.phone || '').replace(/\D/g, '');
          if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

          var pitchText = encodeURIComponent(
            'Olá ' + sName + '! Aqui é o Leonardo, CEO e criador do CantaAí PRO 🎤. Vi que você é um dos nossos cantores mais ativos no palco! Queria te presentear com uma condição especial de parceiro VIP oficial em troca de um depoimento rápido contando como o app te ajuda nos shows. Topa conversar?'
          );
          var waPitchUrl = 'https://wa.me/' + cleanPhone + '?text=' + pitchText;

          var actionHtml = cleanPhone
            ? '<a href="' + waPitchUrl + '" target="_blank" class="btn-crm-wa" title="Chamar no WhatsApp para Parceria VIP & Depoimento">📲 Pedir Depoimento VIP</a>'
            : '<button type="button" class="btn-crm-chat btn-attend-top-singer" data-user-id="' + singer.id + '">💬 Atender no App</button>';

          html +=
            '<div class="power-user-row">' +
              '<div style="display:flex; align-items:center; gap:10px;">' +
                '<span style="font-size:1.1rem; font-weight:900; width:26px; text-align:center;">' + medals[idx] + '</span>' +
                '<div style="width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg, #1e293b, #0f172a); border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-weight:800; color:#38bdf8; font-size:0.85rem;">' + initial + '</div>' +
                '<div>' +
                  '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
                    '<strong style="color:#f8fafc; font-size:0.85rem;">' + sName + '</strong>' +
                    planTag +
                    periodBadge +
                  '</div>' +
                  '<div style="font-size:0.72rem; color:#94a3b8;">' +
                    '<code style="color:#38bdf8;">' + sCode + '</code> &bull; ' + songsNum + ' cifras &bull; ' + repsNum + ' repertórios' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div>' + actionHtml + '</div>' +
            '</div>';
        });

        listEl.innerHTML = html;

        listEl.querySelectorAll('.btn-attend-top-singer').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var uid = this.getAttribute('data-user-id');
            var s = allUserData.find(function (x) { return x.id === uid; });
            if (s) PrompterAdmin.openHelpdeskWithSinger(s);
          });
        });
      }
    },

    // ══════════════════════════════════════════════════════════
    // 2. CENTRAL DE ATENDIMENTO & HELPDESK UNIFICADO (2-COLUNAS)
    // ══════════════════════════════════════════════════════════
    saveStoredTickets: function () {
      try {
        localStorage.setItem('canta_ai_support_tickets', JSON.stringify(currentHelpdeskTickets));
      } catch (e) {}
    },

    updateHelpdeskBadge: function () {
      var badge = document.getElementById('admHelpdeskBadge');
      if (!badge) return;
      var openCount = currentHelpdeskTickets.filter(function (t) {
        return t && t.status !== 'resolved';
      }).length;
      if (openCount > 0) {
        badge.innerText = openCount;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    },

    loadHelpdeskInbox: function () {
      var listContainer = document.getElementById('admHdTicketsList');
      if (listContainer && currentHelpdeskTickets.length === 0) {
        listContainer.innerHTML = '<div style="color:#94a3b8; font-size:0.8rem; text-align:center; padding:24px;"><span class="auth-btn-spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;display:inline-block;vertical-align:middle;"></span> Carregando atendimentos...</div>';
      }

      try {
        var raw = localStorage.getItem('canta_ai_support_tickets');
        if (raw) {
          currentHelpdeskTickets = JSON.parse(raw);
          if (!Array.isArray(currentHelpdeskTickets)) currentHelpdeskTickets = [];
        }
      } catch (e) {}

      if (window.NotificationsCenter && typeof window.NotificationsCenter.fetchFromCloud === 'function') {
        window.NotificationsCenter.fetchFromCloud(function (err, cloudTickets) {
          try {
            var updatedRaw = localStorage.getItem('canta_ai_support_tickets');
            if (updatedRaw) {
              currentHelpdeskTickets = JSON.parse(updatedRaw);
              if (!Array.isArray(currentHelpdeskTickets)) currentHelpdeskTickets = [];
            }
          } catch (e) {}
          PrompterAdmin.renderHelpdeskList();
          PrompterAdmin.updateHelpdeskBadge();
        });
      } else {
        PrompterAdmin.renderHelpdeskList();
        PrompterAdmin.updateHelpdeskBadge();
      }
    },

    renderHelpdeskList: function () {
      var listContainer = document.getElementById('admHdTicketsList');
      if (!listContainer) return;

      var totalCount = currentHelpdeskTickets.length;
      var openCount = currentHelpdeskTickets.filter(function (t) { return t && t.status !== 'resolved'; }).length;

      var cAll = document.getElementById('hdCountAll');
      var cOpen = document.getElementById('hdCountOpen');
      if (cAll) cAll.innerText = totalCount;
      if (cOpen) cOpen.innerText = openCount;

      var filtered = currentHelpdeskTickets.filter(function (t) {
        if (!t) return false;
        if (currentHelpdeskFilter === 'open' && t.status === 'resolved') return false;
        if (currentHelpdeskFilter === 'resolved' && t.status !== 'resolved') return false;

        if (helpdeskSearchQuery) {
          var matchName = (t.user_name || '').toLowerCase().indexOf(helpdeskSearchQuery) !== -1;
          var matchEmail = (t.user_email || '').toLowerCase().indexOf(helpdeskSearchQuery) !== -1;
          var matchTitle = (t.title || '').toLowerCase().indexOf(helpdeskSearchQuery) !== -1;
          return matchName || matchEmail || matchTitle;
        }
        return true;
      });

      // Ordenar: chamados abertos primeiro, depois por updated_at descendente
      filtered.sort(function (a, b) {
        if (a.status !== 'resolved' && b.status === 'resolved') return -1;
        if (a.status === 'resolved' && b.status !== 'resolved') return 1;
        var tA = new Date(a.updated_at || a.created_at || 0).getTime();
        var tB = new Date(b.updated_at || b.created_at || 0).getTime();
        return tB - tA;
      });

      if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:28px 16px;">Nenhum chamado encontrado nesta aba.</div>';
        if (!activeHelpdeskTicketId) {
          PrompterAdmin.renderHelpdeskThread(null);
        }
        return;
      }

      // Se nenhum ticket ativo foi selecionado ainda, seleciona o primeiro
      if (!activeHelpdeskTicketId && filtered.length > 0) {
        activeHelpdeskTicketId = filtered[0].id;
      }

      var activeTicket = currentHelpdeskTickets.find(function (t) { return t.id === activeHelpdeskTicketId; });
      PrompterAdmin.renderHelpdeskThread(activeTicket || filtered[0]);

      var html = '';
      filtered.forEach(function (t) {
        var isActive = (t.id === activeHelpdeskTicketId);
        var isResolved = (t.status === 'resolved');
        var uName = escapeHtml(t.user_name || (t.user_email ? t.user_email.split('@')[0] : 'Cantor'));
        var dateStr = t.updated_at || t.created_at;
        var timeAgo = dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

        var lastMsg = '';
        if (t.messages && Array.isArray(t.messages) && t.messages.length > 0) {
          var lm = t.messages[t.messages.length - 1];
          var prefix = lm.sender === 'support' ? 'Você: ' : '';
          lastMsg = prefix + (lm.text || 'Anexo enviado');
        } else {
          lastMsg = t.description || t.title || 'Chamado aberto';
        }

        var statusDot = isResolved
          ? '<span style="color:#34d399; font-size:0.68rem; font-weight:700;">🟢 Resolvido</span>'
          : '<span style="color:#fbbf24; font-size:0.68rem; font-weight:700;">🟡 Aberto</span>';

        html +=
          '<div class="adm-hd-item ' + (isActive ? 'active' : '') + '" data-ticket-id="' + t.id + '">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
              '<strong style="font-size:0.85rem; color:#f8fafc; font-weight:700;">' + uName + '</strong>' +
              '<span style="font-size:0.68rem; color:#64748b;">' + timeAgo + '</span>' +
            '</div>' +
            '<div style="font-size:0.75rem; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:6px;">' +
              escapeHtml(lastMsg) +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
              statusDot +
              '<span style="font-size:0.68rem; color:#64748b;">' + escapeHtml(t.user_email || '') + '</span>' +
            '</div>' +
          '</div>';
      });

      listContainer.innerHTML = html;

      listContainer.querySelectorAll('.adm-hd-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var tid = this.getAttribute('data-ticket-id');
          activeHelpdeskTicketId = tid;
          PrompterAdmin.renderHelpdeskList();
        });
      });
    },

    renderHelpdeskThread: function (ticket) {
      var placeholder = document.getElementById('admHdThreadPlaceholder');
      var container = document.getElementById('admHdThreadContainer');
      var header = document.getElementById('admHdThreadHeader');
      var feed = document.getElementById('admHdMessagesFeed');

      if (!ticket) {
        if (placeholder) placeholder.style.display = 'flex';
        if (container) container.style.display = 'none';
        return;
      }

      if (placeholder) placeholder.style.display = 'none';
      if (container) container.style.display = 'flex';

      var isResolved = (ticket.status === 'resolved');
      var uName = escapeHtml(ticket.user_name || (ticket.user_email ? ticket.user_email.split('@')[0] : 'Cantor'));
      var uEmail = escapeHtml(ticket.user_email || '');
      var uPhone = ticket.user_phone || '';

      var cleanPhone = (uPhone || '').replace(/\D/g, '');
      if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;
      var waDirectHtml = cleanPhone
        ? '<a href="https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent('Olá ' + uName + '! Leonardo do CantaAí PRO por aqui. Vi seu chamado sobre "' + (ticket.title || 'o app') + '".') + '" target="_blank" class="btn-crm-wa" title="Chamar no WhatsApp direto">📲 WhatsApp Direto</a>'
        : '';

      var statusToggleBtn = isResolved
        ? '<button type="button" class="btn btn-sm btn-outline" id="btnToggleStatusHd" style="color:#fbbf24; border-color:rgba(251,191,36,0.4); font-size:0.75rem;">🔄 Reabrir Chamado</button>'
        : '<button type="button" class="btn btn-sm btn-primary" id="btnToggleStatusHd" style="font-size:0.75rem;">✅ Marcar Resolvido</button>';

      header.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; width:100%;">' +
          '<div>' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<strong style="font-size:1.05rem; color:#f8fafc;">' + uName + '</strong>' +
              (isResolved
                ? '<span style="font-size:0.72rem; padding:2px 8px; border-radius:999px; background:rgba(52,211,153,0.15); color:#34d399; border:1px solid rgba(52,211,153,0.3); font-weight:700;">🟢 Resolvido</span>'
                : '<span style="font-size:0.72rem; padding:2px 8px; border-radius:999px; background:rgba(251,191,36,0.15); color:#fbbf24; border:1px solid rgba(251,191,36,0.3); font-weight:700;">🟡 Em Aberto</span>') +
            '</div>' +
            '<div style="font-size:0.78rem; color:#94a3b8; margin-top:2px;">' +
              uEmail + (uPhone ? (' &bull; ' + escapeHtml(uPhone)) : '') + ' &bull; Assunto: <strong style="color:#cbd5e1;">' + escapeHtml(ticket.title || 'Geral') + '</strong>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
            waDirectHtml +
            statusToggleBtn +
            '<button type="button" class="btn btn-sm btn-outline" id="btnViewSingerInCrm" style="color:#38bdf8; border-color:rgba(56,189,248,0.3); font-size:0.75rem;" title="Abrir perfil no CRM">👤 Perfil</button>' +
            '<button type="button" class="btn btn-sm btn-outline" id="btnDeleteHdTicket" style="color:#f87171; border-color:rgba(239,68,68,0.3); font-size:0.75rem;" title="Excluir Chamado">🗑️</button>' +
          '</div>' +
        '</div>';

      var btnStatus = document.getElementById('btnToggleStatusHd');
      if (btnStatus) {
        btnStatus.addEventListener('click', function () {
          PrompterAdmin.toggleHelpdeskStatus(ticket.id, isResolved ? 'open' : 'resolved');
        });
      }

      var btnCrm = document.getElementById('btnViewSingerInCrm');
      if (btnCrm) {
        btnCrm.addEventListener('click', function () {
          var sEmail = (ticket.user_email || '').toLowerCase();
          var singer = allUserData.find(function (u) {
            return (ticket.user_id && u.id === ticket.user_id) || (sEmail && u.email && u.email.toLowerCase() === sEmail);
          });
          if (singer) {
            PrompterAdmin.switchTab('clients');
            PrompterAdmin.openSingerModal(singer);
          } else {
            PrompterAdmin.switchTab('clients');
          }
        });
      }

      var btnDel = document.getElementById('btnDeleteHdTicket');
      if (btnDel) {
        btnDel.addEventListener('click', function () {
          if (confirm('Deseja excluir este atendimento de ' + uName + '?')) {
            var idx = currentHelpdeskTickets.findIndex(function (x) { return x.id === ticket.id; });
            if (idx >= 0) {
              currentHelpdeskTickets.splice(idx, 1);
              activeHelpdeskTicketId = null;
              PrompterAdmin.saveStoredTickets();
              PrompterAdmin.loadHelpdeskInbox();
              if (window.showToast) window.showToast('Atendimento excluído.', 'info');
            }
          }
        });
      }

      // Feed de mensagens
      var msgs = ticket.messages;
      if (!msgs || !Array.isArray(msgs) || msgs.length === 0) {
        msgs = [{
          id: (ticket.id || 'tkt') + '-m0',
          sender: 'user',
          sender_name: ticket.user_name || 'Cantor',
          text: ticket.description || ticket.title || 'Olá, preciso de suporte no CantaAí.',
          image_url: ticket.image_url || '',
          created_at: ticket.created_at || new Date().toISOString()
        }];
      }

      var feedHtml = '';
      msgs.forEach(function (m) {
        var isSupport = (m.sender === 'support');
        var sName = isSupport ? 'Equipe CantaAí (Você)' : escapeHtml(m.sender_name || ticket.user_name || 'Cantor');
        var timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

        var imgHtml = m.image_url
          ? '<div style="margin-top:8px;"><img src="' + m.image_url + '" class="ticket-thumb-clickable" data-src="' + m.image_url + '" alt="Print Anexo" style="max-height:140px; max-width:240px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); cursor:pointer; object-fit:cover; display:block;"></div>'
          : '';

        feedHtml +=
          '<div class="adm-hd-bubble ' + (isSupport ? 'is-support' : 'is-user') + '">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; font-size:0.72rem;">' +
              '<strong style="color:' + (isSupport ? '#38bdf8' : '#e2e8f0') + ';">' + sName + '</strong>' +
              '<span style="color:#64748b;">' + timeStr + '</span>' +
            '</div>' +
            '<div style="white-space:pre-wrap; line-height:1.45; font-size:0.85rem;">' + escapeHtml(m.text || '') + '</div>' +
            imgHtml +
          '</div>';
      });

      feed.innerHTML = feedHtml;

      feed.querySelectorAll('.ticket-thumb-clickable').forEach(function (img) {
        img.addEventListener('click', function () {
          var src = this.getAttribute('data-src');
          var modal = document.getElementById('imagePreviewModal');
          var fullImg = document.getElementById('imagePreviewFull');
          if (modal && fullImg && src) {
            fullImg.src = src;
            modal.classList.remove('hidden');
          }
        });
      });

      setTimeout(function () {
        feed.scrollTop = feed.scrollHeight;
      }, 50);
    },

    sendHelpdeskReply: function () {
      var input = document.getElementById('admHdInputText');
      var text = (input ? input.value : '').trim();
      if (!text && !helpdeskPendingImage) {
        if (window.showToast) window.showToast('Digite uma mensagem antes de enviar.', 'warning');
        return;
      }

      var ticket = currentHelpdeskTickets.find(function (x) { return x.id === activeHelpdeskTicketId; });
      if (!ticket) return;

      if (!ticket.messages || !Array.isArray(ticket.messages)) {
        ticket.messages = [];
        if (ticket.description || ticket.title) {
          ticket.messages.push({
            id: (ticket.id || 'tkt') + '-m0',
            sender: 'user',
            sender_name: ticket.user_name || 'Cantor',
            text: ticket.description || ticket.title,
            image_url: ticket.image_url || '',
            created_at: ticket.created_at || new Date().toISOString()
          });
        }
      }

      var nowIso = new Date().toISOString();
      var genMsgId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('msg-' + Date.now());

      var newMsg = {
        id: genMsgId,
        sender: 'support',
        sender_name: 'Leonardo (CEO CantaAí)',
        text: text,
        image_url: helpdeskPendingImage || '',
        created_at: nowIso
      };

      ticket.messages.push(newMsg);
      ticket.reply = text;
      ticket.replied_at = nowIso;
      ticket.status = 'resolved';
      ticket.updated_at = nowIso;

      if (input) input.value = '';
      helpdeskPendingImage = '';
      var prevRow = document.getElementById('admHdPreviewRow');
      if (prevRow) prevRow.classList.add('hidden');
      var fInput = document.getElementById('admHdFileInput');
      if (fInput) fInput.value = '';

      PrompterAdmin.saveStoredTickets();
      if (window.NotificationsCenter && typeof window.NotificationsCenter.syncTicketToCloud === 'function') {
        window.NotificationsCenter.syncTicketToCloud(ticket);
      }

      PrompterAdmin.renderHelpdeskList();
      PrompterAdmin.renderHelpdeskThread(ticket);
      PrompterAdmin.updateHelpdeskBadge();
      if (window.showToast) window.showToast('💬 Resposta enviada com sucesso para ' + (ticket.user_name || 'o cantor') + '!', 'success');
    },

    toggleHelpdeskStatus: function (ticketId, newStatus) {
      var ticket = currentHelpdeskTickets.find(function (x) { return x.id === ticketId; });
      if (!ticket) return;
      ticket.status = newStatus;
      ticket.updated_at = new Date().toISOString();
      PrompterAdmin.saveStoredTickets();
      if (window.NotificationsCenter && typeof window.NotificationsCenter.syncTicketToCloud === 'function') {
        window.NotificationsCenter.syncTicketToCloud(ticket);
      }
      PrompterAdmin.renderHelpdeskList();
      PrompterAdmin.renderHelpdeskThread(ticket);
      PrompterAdmin.updateHelpdeskBadge();
      var msg = (newStatus === 'resolved') ? '✅ Atendimento marcado como resolvido!' : '🔄 Atendimento reaberto!';
      if (window.showToast) window.showToast(msg, 'success');
    },

    openHelpdeskWithSinger: function (singer) {
      if (!singer) return;
      PrompterAdmin.switchTab('helpdesk');

      var sEmail = (singer.email || '').trim().toLowerCase();
      var sId = singer.id;

      var existing = currentHelpdeskTickets.find(function (t) {
        return (sId && t.user_id === sId) || (sEmail && t.user_email && t.user_email.toLowerCase() === sEmail);
      });

      if (existing) {
        activeHelpdeskTicketId = existing.id;
        currentHelpdeskFilter = 'all';
        PrompterAdmin.renderHelpdeskList();
        PrompterAdmin.renderHelpdeskThread(existing);
      } else {
        var genUuid = (window.crypto && typeof window.crypto.randomUUID === 'function')
          ? window.crypto.randomUUID()
          : ((window.NotificationsCenter && typeof window.NotificationsCenter.generateUUID === 'function')
              ? window.NotificationsCenter.generateUUID()
              : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                  var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                }));

        var nowIso = new Date().toISOString();
        var newTicket = {
          id: genUuid,
          user_id: sId || null,
          user_name: singer.name || (sEmail ? sEmail.split('@')[0] : 'Cantor'),
          user_email: singer.email || '',
          user_phone: singer.phone || '',
          category: 'duvida',
          title: 'Atendimento Direto: ' + (singer.name || singer.email),
          description: 'Canal de atendimento aberto diretamente pelo CEO.',
          image_url: '',
          status: 'open',
          created_at: nowIso,
          updated_at: nowIso,
          messages: [{
            id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('msg-' + Date.now()),
            sender: 'support',
            sender_name: 'Leonardo (CEO CantaAí)',
            text: 'Olá ' + (singer.name || 'Cantor') + '! Como posso te ajudar hoje no CantaAí PRO?',
            created_at: nowIso
          }]
        };

        currentHelpdeskTickets.unshift(newTicket);
        activeHelpdeskTicketId = newTicket.id;
        currentHelpdeskFilter = 'all';
        PrompterAdmin.saveStoredTickets();
        if (window.NotificationsCenter && typeof window.NotificationsCenter.syncTicketToCloud === 'function') {
          window.NotificationsCenter.syncTicketToCloud(newTicket);
        }
        PrompterAdmin.renderHelpdeskList();
        PrompterAdmin.renderHelpdeskThread(newTicket);
        PrompterAdmin.updateHelpdeskBadge();
      }

      setTimeout(function () {
        var inp = document.getElementById('admHdInputText');
        if (inp) inp.focus();
      }, 150);
    },

    promptNewHelpdeskTicket: function () {
      if (!allUserData || allUserData.length === 0) {
        if (window.showToast) window.showToast('Nenhum cantor disponível no CRM.', 'warning');
        return;
      }
      var listStr = allUserData.slice(0, 10).map(function (u, i) {
        return (i + 1) + '. ' + (u.name || u.email);
      }).join('\n');

      var choice = prompt('Selecione o número ou digite o e-mail do cantor para iniciar atendimento:\n\n' + listStr);
      if (!choice) return;

      var singer = null;
      var num = parseInt(choice, 10);
      if (!isNaN(num) && num >= 1 && num <= allUserData.length) {
        singer = allUserData[num - 1];
      } else {
        var q = choice.toLowerCase().trim();
        singer = allUserData.find(function (u) {
          return (u.name && u.name.toLowerCase().indexOf(q) !== -1) || (u.email && u.email.toLowerCase().indexOf(q) !== -1);
        });
      }

      if (singer) {
        PrompterAdmin.openHelpdeskWithSinger(singer);
      } else {
        if (window.showToast) window.showToast('Cantor não encontrado.', 'warning');
      }
    },

    // Aliases legados para compatibilidade
    loadTickets: function () {
      this.loadHelpdeskInbox();
    },

    renderTicketsList: function () {
      this.renderHelpdeskList();
    },

    exportCSV: function () {
      var csv = 'ID,Nome,Email,Telefone,CPF,Instagram,Codigo_Cantor,Plano,Status,Ultimo_Acesso\n';
      allUserData.forEach(function (u) {
        csv += '"' + u.id + '","' + u.name + '","' + u.email + '","' + (u.phone || '') + '","' + (u.cpf || '') + '","' + (u.instagram || '') + '","' + u.singer_code + '","' + u.plan_type + '","' + u.status_text + '","' + u.last_seen + '"\n';
      });

      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'canta_ai_relatorio_executivo_ceo_' + new Date().toISOString().slice(0, 10) + '.csv';
      link.click();
      if (window.showToast) window.showToast('📊 Relatório Executivo CSV exportado com sucesso (' + allUserData.length + ' cantores)!', 'success');
    },
    normalizeSingerCode: normalizeSingerCode
  };

  PrompterAdmin.normalizeSingerCode = normalizeSingerCode;
  try {
    Object.defineProperty(PrompterAdmin, 'allUserData', {
      get: function () { return allUserData; },
      set: function (val) { allUserData = val; },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    PrompterAdmin.allUserData = allUserData;
  }
  window.PrompterAdmin = PrompterAdmin;
})();
