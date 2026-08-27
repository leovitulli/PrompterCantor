/**
 * PrompterCantor PRO - CEO & Founder Executive Command Center
 * Plataforma de Governança SaaS Enterprise para monitoramento de MRR, assinantes PRO,
 * gestão de clientes, cupons VIP e integração Mercado Pago.
 */

(function () {
  'use strict';

  var adminModal = null;
  var currentTab = 'clients';
  var currentFilter = 'all';
  var searchQuery = '';

  // Storage Keys
  var STORAGE_USERS_KEY = 'canta_ai_admin_users';
  var STORAGE_COUPONS_KEY = 'canta_ai_admin_coupons';
  var STORAGE_PRICING_KEY = 'canta_ai_admin_pricing';

  var allUserData = [];
  var allCoupons = [];
  var pricingConfig = {
    monthlyPrice: 39.90,
    annualPrice: 299.00,
    lifetimePrice: 497.00,
    mpPublicKey: '',
    mpAccessToken: '',
    mpEnv: 'production'
  };

  var PrompterAdmin = {
    init: function () {
      this.loadStoredData();
      this.createAdminModalHTML();
      this.bindEvents();
    },

    loadStoredData: function () {
      try {
        var rawUsers = localStorage.getItem(STORAGE_USERS_KEY);
        if (rawUsers) allUserData = JSON.parse(rawUsers);
        
        var rawCoupons = localStorage.getItem(STORAGE_COUPONS_KEY);
        if (rawCoupons) allCoupons = JSON.parse(rawCoupons);
        else {
          allCoupons = [
            { id: 'c-1', code: 'VIP100', discount: '100% OFF', type: 'vip', uses: 14, maxUses: 50, status: 'active', desc: 'Acesso VIP Vitalício Gratuito' },
            { id: 'c-2', code: 'PRO50', discount: '50% OFF', type: 'percent', uses: 38, maxUses: 100, status: 'active', desc: '50% de Desconto na Assinatura' },
            { id: 'c-3', code: 'SAMBA30', discount: '30% OFF', type: 'percent', uses: 19, maxUses: 200, status: 'active', desc: '30% OFF de Boas-Vindas' }
          ];
          localStorage.setItem(STORAGE_COUPONS_KEY, JSON.stringify(allCoupons));
        }

        var rawPricing = localStorage.getItem(STORAGE_PRICING_KEY);
        if (rawPricing) pricingConfig = Object.assign(pricingConfig, JSON.parse(rawPricing));
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

            '<!-- ABAS DE NAVEGAÇÃO EXECUTIVA -->' +
            '<div class="admin-nav-tabs">' +
              '<button class="admin-tab-btn active" data-tab="clients">👥 Cantores & Clientes</button>' +
              '<button class="admin-tab-btn" data-tab="coupons">🎟️ Cupons VIP & Descontos</button>' +
              '<button class="admin-tab-btn" data-tab="pricing">💳 Planos & Mercado Pago</button>' +
            '</div>' +

            '<div class="modal-body admin-modal-body">' +
              '<!-- CARDS DE MÉTRICAS SAAS EXECUTIVAS -->' +
              '<div class="admin-metrics-grid">' +
                '<div class="metric-card metric-card-mrr">' +
                  '<div class="metric-icon">💰</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">MRR Estimado (Receita Mensal)</span>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-gold" id="admMetricMRR">R$ 0,00</span>' +
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
                      '<span class="metric-value metric-green" id="admMetricProUsers">0</span>' +
                      '<span class="metric-badge-pill">99.2% Retenção</span>' +
                    '</div>' +
                    '<span class="metric-subtext" id="admMetricTotalUsersSub">0 Cantores Cadastrados</span>' +
                  '</div>' +
                '</div>' +

                '<div class="metric-card">' +
                  '<div class="metric-icon">⚡</div>' +
                  '<div class="metric-info">' +
                    '<span class="metric-label">Em Show / Palco Agora</span>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-cyan" id="admMetricOnlineUsers">0</span>' +
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
                      '<span class="metric-value" id="admMetricTotalSongs">0</span>' +
                    '</div>' +
                    '<span class="metric-subtext" id="admMetricTotalRepsSub">0 Repertórios Criados</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 1: CANTORES & CLIENTES -->' +
              '<div id="adminTabClients" class="admin-tab-content">' +
                '<div class="admin-toolbar-row">' +
                  '<div class="admin-search-wrapper">' +
                    '<input type="text" id="adminSearchInput" class="admin-search-input" placeholder="🔍 Buscar por cantor, e-mail, banda ou código...">' +
                  '</div>' +
                  '<div class="admin-filter-pills">' +
                    '<button class="filter-pill active" data-filter="all">Todos (<span id="countPillAll">0</span>)</button>' +
                    '<button class="filter-pill" data-filter="pro">Assinantes PRO (<span id="countPillPro">0</span>)</button>' +
                    '<button class="filter-pill" data-filter="live">No Palco (<span id="countPillLive">0</span>)</button>' +
                    '<button class="filter-pill" data-filter="free">Plano Free (<span id="countPillFree">0</span>)</button>' +
                  '</div>' +
                  '<div class="admin-toolbar-buttons">' +
                    '<button id="btnOpenNewSingerModal" class="btn btn-primary btn-sm">➕ Novo Cantor VIP</button>' +
                    '<button id="btnExportCSV" class="btn btn-outline btn-sm">📊 Exportar CSV</button>' +
                    '<button id="btnRefreshAdminData" class="btn btn-secondary btn-sm">🔄 Atualizar</button>' +
                  '</div>' +
                '</div>' +

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

              '<!-- ABA 2: CUPONS VIP & DESCONTOS -->' +
              '<div id="adminTabCoupons" class="admin-tab-content hidden">' +
                '<div class="admin-coupon-layout">' +
                  '<!-- Card Criador de Cupom -->' +
                  '<div class="admin-coupon-creator-card">' +
                    '<h4>✨ Criar Novo Cupom VIP ou Desconto</h4>' +
                    '<p style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 1rem;">Crie cupons para cantores VIPs terem acesso grátis ou descontos em campanhas.</p>' +
                    '<form id="formCreateCoupon" onsubmit="return false;">' +
                      '<div class="form-group">' +
                        '<label>Código do Cupom:</label>' +
                        '<input type="text" id="inputCouponCode" class="form-control" placeholder="Ex: VIPAMIGO, CANTOR100" style="text-transform: uppercase; font-family: var(--font-mono); font-weight: 700;">' +
                      '</div>' +
                      '<div class="form-grid-2cols">' +
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
                      '</div>' +
                      '<div class="form-grid-2cols">' +
                        '<div class="form-group">' +
                          '<label>Limite de Usos:</label>' +
                          '<input type="number" id="inputCouponMaxUses" class="form-control" value="50" min="1">' +
                        '</div>' +
                        '<div class="form-group">' +
                          '<label>Descrição / Observação:</label>' +
                          '<input type="text" id="inputCouponDesc" class="form-control" placeholder="Ex: Cortesia para amigos músicos">' +
                        '</div>' +
                      '</div>' +
                      '<button type="button" id="btnSaveNewCoupon" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;">🎟️ Ativar Cupom no Sistema</button>' +
                    '</form>' +
                  '</div>' +

                  '<!-- Tabela de Cupons -->' +
                  '<div class="admin-coupons-table-wrapper">' +
                    '<h4>🎟️ Cupons Ativos no Sistema (<span id="countCouponsActive">0</span>)</h4>' +
                    '<div class="admin-table-container" style="margin-top: 10px;">' +
                      '<table class="admin-table">' +
                        '<thead>' +
                          '<tr>' +
                            '<th>Cupom</th>' +
                            '<th>Benefício</th>' +
                            '<th>Usos / Limite</th>' +
                            '<th>Descrição</th>' +
                            '<th style="text-align: right;">Ação</th>' +
                          '</tr>' +
                        '</thead>' +
                        '<tbody id="adminCouponsTableBody"></tbody>' +
                      '</table>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 3: MERCADO PAGO & PLANOS -->' +
              '<div id="adminTabPricing" class="admin-tab-content hidden">' +
                '<div class="admin-pricing-grid">' +
                  '<!-- Card Configuração de Preços -->' +
                  '<div class="admin-card-section">' +
                    '<h4>💳 Precificação dos Planos SaaS</h4>' +
                    '<p style="color: #94a3b8; font-size: 0.82rem; margin-bottom: 1rem;">Defina os valores de assinatura cobrados no checkout transparente do Mercado Pago.</p>' +
                    '<div class="form-group">' +
                      '<label>Plano Mensal (Recorrente):</label>' +
                      '<div class="input-with-prefix"><span class="input-prefix">R$</span><input type="number" step="0.10" id="inputPriceMonthly" class="form-control" value="39.90"></div>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Plano Anual (Melhor Custo-Benefício):</label>' +
                      '<div class="input-with-prefix"><span class="input-prefix">R$</span><input type="number" step="1.00" id="inputPriceAnnual" class="form-control" value="299.00"></div>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Plano Vitalício (Pagamento Único):</label>' +
                      '<div class="input-with-prefix"><span class="input-prefix">R$</span><input type="number" step="1.00" id="inputPriceLifetime" class="form-control" value="497.00"></div>' +
                    '</div>' +
                  '</div>' +

                  '<!-- Card Credenciais Mercado Pago -->' +
                  '<div class="admin-card-section">' +
                    '<h4>🤝 Integração Mercado Pago (Pix & Cartão)</h4>' +
                    '<p style="color: #94a3b8; font-size: 0.82rem; margin-bottom: 1rem;">Conecte sua conta do Mercado Pago para receber assinaturas de forma automática com liberação instantânea.</p>' +
                    '<div class="form-group">' +
                      '<label>Ambiente de Pagamento:</label>' +
                      '<select id="selectMpEnv" class="form-control">' +
                        '<option value="production">🟢 Produção (Cobrança Real)</option>' +
                        '<option value="sandbox">🟡 Sandbox (Ambiente de Testes)</option>' +
                      '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Mercado Pago Public Key (Chave Pública):</label>' +
                      '<input type="text" id="inputMpPublicKey" class="form-control" placeholder="APP_USR-xxxx-xxxx...">' +
                    '</div>' +
                    '<div class="form-group">' +
                      '<label>Mercado Pago Access Token (Privado):</label>' +
                      '<input type="password" id="inputMpAccessToken" class="form-control" placeholder="APP_USR-xxxx-xxxx...">' +
                    '</div>' +
                    '<button type="button" id="btnSavePricingConfig" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">💾 Salvar Configurações de Cobrança</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +

            '</div>' +
          '</div>' +

          '<!-- SUB-MODAL: EDITAR OU CRIAR CANTOR -->' +
          '<div id="adminEditSingerModal" class="modal hidden" style="z-index: 1000002;">' +
            '<div class="modal-overlay" id="adminEditSingerOverlay"></div>' +
            '<div class="modal-card" style="max-width: 520px;">' +
              '<div class="modal-header">' +
                '<h3 id="adminEditSingerTitle">✏️ Gerenciar Cantor</h3>' +
                '<button class="modal-close" id="btnCloseEditSingerModal">✕</button>' +
              '</div>' +
              '<div class="modal-body">' +
                '<form id="formEditSinger" onsubmit="return false;">' +
                  '<input type="hidden" id="editSingerId">' +
                  '<div class="form-group">' +
                    '<label>Nome do Cantor / Artístico:</label>' +
                    '<input type="text" id="editSingerName" class="form-control" required placeholder="Ex: Jorge Aragão">' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>E-mail da Conta:</label>' +
                    '<input type="email" id="editSingerEmail" class="form-control" required placeholder="cantor@exemplo.com">' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>Código do Cantor (Palco):</label>' +
                    '<input type="text" id="editSingerCode" class="form-control" placeholder="#CANTOR-0000" style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8;">' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>Plano de Assinatura:</label>' +
                    '<select id="editSingerPlan" class="form-control">' +
                      '<option value="pro_lifetime">👑 PRO VITALÍCIO</option>' +
                      '<option value="pro_annual">💎 PRO ANUAL</option>' +
                      '<option value="pro_monthly">⚡ PRO MENSAL</option>' +
                      '<option value="free">⚡ PLANO FREE</option>' +
                    '</select>' +
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>Status do Cantor:</label>' +
                    '<select id="editSingerStatus" class="form-control">' +
                      '<option value="online">🟢 Em Show Ao Vivo / Palco</option>' +
                      '<option value="offline">⚪ Offline</option>' +
                    '</select>' +
                  '</div>' +
                  '<div style="display: flex; gap: 10px; margin-top: 1.5rem;">' +
                    '<button type="button" id="btnDeleteSinger" class="btn btn-outline" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4);">🗑️ Excluir</button>' +
                    '<button type="button" id="btnSaveSingerData" class="btn btn-primary" style="flex: 1;">💾 Salvar Alterações</button>' +
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

      // Tabs
      var tabBtns = adminModal ? adminModal.querySelectorAll('.admin-tab-btn') : [];
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          tabBtns.forEach(function (b) { b.classList.remove('active'); });
          this.classList.add('active');
          currentTab = this.getAttribute('data-tab');

          var c1 = document.getElementById('adminTabClients');
          var c2 = document.getElementById('adminTabCoupons');
          var c3 = document.getElementById('adminTabPricing');

          if (c1) c1.classList.toggle('hidden', currentTab !== 'clients');
          if (c2) c2.classList.toggle('hidden', currentTab !== 'coupons');
          if (c3) c3.classList.toggle('hidden', currentTab !== 'pricing');
        });
      });

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

      // Criar Novo Cantor
      var btnNewSinger = document.getElementById('btnOpenNewSingerModal');
      if (btnNewSinger) {
        btnNewSinger.addEventListener('click', function () {
          PrompterAdmin.openSingerModal(null);
        });
      }

      // Salvar Cantor
      var btnSaveSinger = document.getElementById('btnSaveSingerData');
      if (btnSaveSinger) {
        btnSaveSinger.addEventListener('click', function () {
          PrompterAdmin.saveSingerModalData();
        });
      }

      // Excluir Cantor
      var btnDeleteSinger = document.getElementById('btnDeleteSinger');
      if (btnDeleteSinger) {
        btnDeleteSinger.addEventListener('click', function () {
          var id = document.getElementById('editSingerId').value;
          if (confirm('Deseja realmente remover este cantor do sistema?')) {
            allUserData = allUserData.filter(function(u) { return u.id !== id; });
            PrompterAdmin.saveStoredUsers();
            PrompterAdmin.updateMetrics();
            PrompterAdmin.renderUsersTable();
            PrompterAdmin.closeSingerModal();
            if (window.showToast) window.showToast('Cantor removido com sucesso.', 'info');
          }
        });
      }

      // Fechar Sub-modal Cantor
      var btnCloseSinger = document.getElementById('btnCloseEditSingerModal');
      var overlaySinger = document.getElementById('adminEditSingerOverlay');
      if (btnCloseSinger) btnCloseSinger.addEventListener('click', PrompterAdmin.closeSingerModal);
      if (overlaySinger) overlaySinger.addEventListener('click', PrompterAdmin.closeSingerModal);

      // Criar Cupom
      var btnSaveCoupon = document.getElementById('btnSaveNewCoupon');
      if (btnSaveCoupon) {
        btnSaveCoupon.addEventListener('click', function () {
          var code = (document.getElementById('inputCouponCode').value || '').trim().toUpperCase();
          var type = document.getElementById('selectCouponType').value;
          var val = (document.getElementById('inputCouponValue').value || '').trim();
          var maxUses = parseInt(document.getElementById('inputCouponMaxUses').value, 10) || 50;
          var desc = (document.getElementById('inputCouponDesc').value || '').trim();

          if (!code) {
            if (window.showToast) window.showToast('Informe o código do cupom.', 'warning');
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
            desc: desc || (type === 'vip' ? 'Acesso VIP Vitalício Grátis' : 'Desconto Especial')
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

      // Salvar Configurações de Faturamento
      var btnSavePricing = document.getElementById('btnSavePricingConfig');
      if (btnSavePricing) {
        btnSavePricing.addEventListener('click', function () {
          pricingConfig.monthlyPrice = parseFloat(document.getElementById('inputPriceMonthly').value) || 39.90;
          pricingConfig.annualPrice = parseFloat(document.getElementById('inputPriceAnnual').value) || 299.00;
          pricingConfig.lifetimePrice = parseFloat(document.getElementById('inputPriceLifetime').value) || 497.00;
          pricingConfig.mpEnv = document.getElementById('selectMpEnv').value || 'production';
          pricingConfig.mpPublicKey = (document.getElementById('inputMpPublicKey').value || '').trim();
          pricingConfig.mpAccessToken = (document.getElementById('inputMpAccessToken').value || '').trim();

          PrompterAdmin.saveStoredPricing();
          PrompterAdmin.updateMetrics();
          if (window.showToast) window.showToast('✅ Configurações de preços e Mercado Pago salvas!', 'success');
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
        this.renderCouponsTable();
        this.loadPricingForm();
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
        title.innerText = '✏️ Editar Cantor: ' + user.name;
        document.getElementById('editSingerId').value = user.id;
        document.getElementById('editSingerName').value = user.name;
        document.getElementById('editSingerEmail').value = user.email;
        document.getElementById('editSingerCode').value = user.singer_code;
        
        var pVal = 'pro_lifetime';
        if (user.plan_type.indexOf('ANUAL') !== -1) pVal = 'pro_annual';
        else if (user.plan_type.indexOf('MENSAL') !== -1) pVal = 'pro_monthly';
        else if (user.plan_tier === 'free') pVal = 'free';
        document.getElementById('editSingerPlan').value = pVal;

        document.getElementById('editSingerStatus').value = user.is_online ? 'online' : 'offline';
        if (btnDel) btnDel.classList.remove('hidden');
      } else {
        title.innerText = '➕ Convidar / Cadastrar Cantor VIP';
        document.getElementById('editSingerId').value = '';
        document.getElementById('editSingerName').value = '';
        document.getElementById('editSingerEmail').value = '';
        document.getElementById('editSingerCode').value = '#CANTOR-' + Math.floor(1000 + Math.random() * 9000);
        document.getElementById('editSingerPlan').value = 'pro_lifetime';
        document.getElementById('editSingerStatus').value = 'online';
        if (btnDel) btnDel.classList.add('hidden');
      }

      modal.classList.remove('hidden');
    },

    closeSingerModal: function () {
      var modal = document.getElementById('adminEditSingerModal');
      if (modal) modal.classList.add('hidden');
    },

    saveSingerModalData: function () {
      var id = document.getElementById('editSingerId').value;
      var name = (document.getElementById('editSingerName').value || '').trim();
      var email = (document.getElementById('editSingerEmail').value || '').trim();
      var code = (document.getElementById('editSingerCode').value || '').trim() || ('#CANTOR-' + Math.floor(1000 + Math.random() * 9000));
      var planVal = document.getElementById('editSingerPlan').value;
      var statusVal = document.getElementById('editSingerStatus').value;

      if (!name || !email) {
        if (window.showToast) window.showToast('Preencha o nome e e-mail do cantor.', 'warning');
        return;
      }

      var isPro = planVal !== 'free';
      var planType = '👑 PRO VITALÍCIO';
      if (planVal === 'pro_annual') planType = '💎 PRO ANUAL';
      else if (planVal === 'pro_monthly') planType = '⚡ PRO MENSAL';
      else if (planVal === 'free') planType = '⚡ PLANO FREE';

      if (id) {
        var existing = allUserData.find(function(u) { return u.id === id; });
        if (existing) {
          existing.name = name;
          existing.email = email;
          existing.singer_code = code;
          existing.plan_tier = isPro ? 'pro' : 'free';
          existing.plan_type = planType;
          existing.is_online = statusVal === 'online';
          existing.status_text = statusVal === 'online' ? '🟢 Conectado ao Palco' : '⚪ Offline';
        }
      } else {
        var newUser = {
          id: 'user-' + Date.now(),
          name: name,
          email: email,
          singer_code: code,
          plan_tier: isPro ? 'pro' : 'free',
          plan_type: planType,
          is_online: statusVal === 'online',
          status_text: statusVal === 'online' ? '🟢 Conectado ao Palco' : '⚪ Offline',
          reps_count: 1,
          songs_count: 12,
          last_seen: 'Hoje',
          created_at: new Date().toISOString().slice(0, 10)
        };
        allUserData.unshift(newUser);
      }

      PrompterAdmin.saveStoredUsers();
      PrompterAdmin.updateMetrics();
      PrompterAdmin.renderUsersTable();
      PrompterAdmin.closeSingerModal();

      if (window.showToast) window.showToast('✅ Dados do cantor salvos com sucesso!', 'success');
    },

    loadDashboardData: function () {
      var currentUser = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var currentProfile = window.PrompterAuth ? window.PrompterAuth.getProfile() : null;

      var devEmail = (currentProfile && currentProfile.email) ? currentProfile.email : (currentUser ? currentUser.email : 'leovitulli@gmail.com');
      var devName = (currentProfile && currentProfile.display_name) ? currentProfile.display_name : 'Leonardo Vitulli (CEO)';

      if (!allUserData || allUserData.length === 0) {
        allUserData = [
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
        PrompterAdmin.saveStoredUsers();
      }

      PrompterAdmin.updateMetrics();
      PrompterAdmin.renderUsersTable();
    },

    updateMetrics: function () {
      var total = allUserData.length;
      var pro = allUserData.filter(function (u) { return u.plan_tier === 'pro'; }).length;
      var free = total - pro;
      var online = allUserData.filter(function (u) { return u.is_online; }).length;
      var totalSongs = allUserData.reduce(function (acc, u) { return acc + (u.songs_count || 0); }, 0);
      var totalReps = allUserData.reduce(function (acc, u) { return acc + (u.reps_count || 0); }, 0);
      var estimatedMRR = (pro * (pricingConfig.monthlyPrice || 39.90)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
        if (currentFilter === 'pro' && u.plan_tier !== 'pro') return false;
        if (currentFilter === 'free' && u.plan_tier !== 'free') return false;
        if (currentFilter === 'live' && !u.is_online) return false;

        if (searchQuery) {
          var matchName = (u.name || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchEmail = (u.email || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchCode = (u.singer_code || '').toLowerCase().indexOf(searchQuery) !== -1;
          return matchName || matchEmail || matchCode;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 28px; color: #94a3b8;">Nenhum cantor encontrado com os filtros atuais.</td></tr>';
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
              '<button class="btn btn-sm btn-primary btn-edit-singer" data-user-id="' + user.id + '" title="Editar dados completos do cantor">✏️ Editar</button> ' +
              '<button class="btn btn-sm btn-outline btn-toggle-plan" data-user-id="' + user.id + '" title="Alternar entre PRO e FREE">⚡ Alternar</button>' +
            '</td>' +
          '</tr>';
      });

      tbody.innerHTML = html;

      tbody.querySelectorAll('.btn-edit-singer').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function(u) { return u.id === uId; });
          if (userObj) PrompterAdmin.openSingerModal(userObj);
        });
      });

      tbody.querySelectorAll('.btn-toggle-plan').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function(u) { return u.id === uId; });
          if (userObj) {
            userObj.plan_tier = userObj.plan_tier === 'pro' ? 'free' : 'pro';
            userObj.plan_type = userObj.plan_tier === 'pro' ? '👑 PRO VITALÍCIO' : '⚡ PLANO FREE';
            PrompterAdmin.saveStoredUsers();
            PrompterAdmin.updateMetrics();
            PrompterAdmin.renderUsersTable();
            if (window.showToast) {
              window.showToast('Plano de ' + userObj.name + ' alterado para ' + userObj.plan_type + '!', 'success');
            }
          }
        });
      });
    },

    renderCouponsTable: function () {
      var tbody = document.getElementById('adminCouponsTableBody');
      var countEl = document.getElementById('countCouponsActive');
      if (!tbody) return;

      if (countEl) countEl.innerText = allCoupons.length;

      if (allCoupons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px; color: #94a3b8;">Nenhum cupom cadastrado. Crie seu primeiro cupom ao lado!</td></tr>';
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
            '<td><code class="admin-code-tag" style="color: #fbbf24; font-size: 0.9rem;">' + c.code + '</code></td>' +
            '<td>' + badge + '</td>' +
            '<td><strong>' + c.uses + '</strong> / ' + c.maxUses + ' usos</td>' +
            '<td><span style="color: #cbd5e1; font-size: 0.84rem;">' + c.desc + '</span></td>' +
            '<td style="text-align: right;">' +
              '<button class="btn btn-sm btn-outline btn-copy-coupon" data-code="' + c.code + '" title="Copiar código">📋 Copiar</button> ' +
              '<button class="btn btn-sm btn-outline btn-del-coupon" data-id="' + c.id + '" style="color: #f87171; border-color: rgba(239,68,68,0.4);" title="Excluir cupom">✕</button>' +
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
          allCoupons = allCoupons.filter(function(c) { return c.id !== id; });
          PrompterAdmin.saveStoredCoupons();
          PrompterAdmin.renderCouponsTable();
          if (window.showToast) window.showToast('Cupom removido.', 'info');
        });
      });
    },

    loadPricingForm: function () {
      var pM = document.getElementById('inputPriceMonthly');
      var pA = document.getElementById('inputPriceAnnual');
      var pL = document.getElementById('inputPriceLifetime');
      var env = document.getElementById('selectMpEnv');
      var pubKey = document.getElementById('inputMpPublicKey');
      var accToken = document.getElementById('inputMpAccessToken');

      if (pM) pM.value = pricingConfig.monthlyPrice;
      if (pA) pA.value = pricingConfig.annualPrice;
      if (pL) pL.value = pricingConfig.lifetimePrice;
      if (env) env.value = pricingConfig.mpEnv || 'production';
      if (pubKey) pubKey.value = pricingConfig.mpPublicKey || '';
      if (accToken) accToken.value = pricingConfig.mpAccessToken || '';
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
    }
  };

  window.PrompterAdmin = PrompterAdmin;
})();
