/**
 * PrompterCantor PRO - CEO & Founder Executive Command Center
 * Plataforma de Governança SaaS Enterprise para monitoramento de MRR, assinantes PRO,
 * gestão individual de clientes, cupons VIP e checkout Mercado Pago.
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
    mpPublicKey: '',
    mpAccessToken: '',
    mpEnv: 'production'
  };

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
    },

    loadStoredData: function () {
      try {
        var rawUsers = localStorage.getItem(STORAGE_USERS_KEY);
        if (rawUsers) allUserData = JSON.parse(rawUsers);
        
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
              '<button class="admin-tab-btn" data-tab="announcements">📢 Comunicados & Mensagens</button>' +
              '<button class="admin-tab-btn" data-tab="tickets">🎫 Chamados & Suporte</button>' +
              '<button class="admin-tab-btn" data-tab="coupons">🎟️ Cupons VIP & Descontos</button>' +
              '<button class="admin-tab-btn" data-tab="pricing">💳 Planos & Mercado Pago</button>' +
            '</div>' +

            '<div class="modal-body admin-modal-body">' +
              '<!-- CARDS DE MÉTRICAS SAAS (COM ATALHOS INTERATIVOS) -->' +
              '<div class="admin-metrics-grid">' +
                '<div class="metric-card metric-card-mrr metric-clickable" id="shortcutCardMRR" title="Clique para gerenciar Preços e Mercado Pago">' +
                  '<div class="metric-icon">💰</div>' +
                  '<div class="metric-info">' +
                    '<div class="metric-header-sub"><span class="metric-label">MRR (Receita Recorrente)</span><span class="metric-action-hint">⚙️ Ver Planos</span></div>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-gold" id="admMetricMRR">R$ 0,00</span>' +
                      '<span class="metric-growth">+28.4% ↗</span>' +
                    '</div>' +
                    '<span class="metric-subtext">Ticket Médio: R$ 39,90 /mês</span>' +
                  '</div>' +
                '</div>' +

                '<div class="metric-card metric-clickable" id="shortcutCardPro" title="Clique para filtrar apenas Assinantes PRO">' +
                  '<div class="metric-icon">⭐</div>' +
                  '<div class="metric-info">' +
                    '<div class="metric-header-sub"><span class="metric-label">Assinantes PRO Ativos</span><span class="metric-action-hint">🔍 Filtrar PRO</span></div>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-green" id="admMetricProUsers">0</span>' +
                      '<span class="metric-badge-pill">99.2% Retenção</span>' +
                    '</div>' +
                    '<span class="metric-subtext" id="admMetricTotalUsersSub">0 Cantores Cadastrados</span>' +
                  '</div>' +
                '</div>' +

                '<div class="metric-card metric-clickable" id="shortcutCardLive" title="Clique para filtrar quem está Em Show Ao Vivo">' +
                  '<div class="metric-icon">⚡</div>' +
                  '<div class="metric-info">' +
                    '<div class="metric-header-sub"><span class="metric-label">Em Show / Palco Agora</span><span class="metric-action-hint">🟢 Ver Ao Vivo</span></div>' +
                    '<div class="metric-value-row">' +
                      '<span class="metric-value metric-cyan" id="admMetricOnlineUsers">0</span>' +
                      '<span class="metric-badge-live">● AO VIVO</span>' +
                    '</div>' +
                    '<span class="metric-subtext">Sincronização 0ms Latência</span>' +
                  '</div>' +
                '</div>' +

                '<div class="metric-card metric-clickable" id="shortcutCardSongs" title="Clique para ver todos os cantores">' +
                  '<div class="metric-icon">🎵</div>' +
                  '<div class="metric-info">' +
                    '<div class="metric-header-sub"><span class="metric-label">Músicas & Cifras Ativas</span><span class="metric-action-hint">👥 Ver Todos</span></div>' +
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
                  '<form class="admin-search-wrapper" autocomplete="off" onsubmit="return false;" style="margin:0;">' +
                    '<input type="text" name="fake_admin_user" style="display:none;" tabindex="-1">' +
                    '<input type="search" id="adminSearchInput" class="admin-search-input" placeholder="🔍 Buscar por cantor, e-mail, WhatsApp, CPF ou código..." autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\');">' +
                  '</form>' +
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

                '<div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">' +
                  '<span>💡 <strong>Dica</strong>: Clique em qualquer linha para editar o cantor, WhatsApp ou assinatura.</span>' +
                '</div>' +

                '<div class="admin-table-container">' +
                  '<table class="admin-table">' +
                    '<thead>' +
                      '<tr>' +
                        '<th style="width: 45px; text-align: center;" title="Status de Conexão no Palco">●</th>' +
                        '<th>Cantor / E-mail</th>' +
                        '<th>@Login / Palco</th>' +
                        '<th>Plano</th>' +
                        '<th>WhatsApp / CPF</th>' +
                        '<th>Instagram</th>' +
                        '<th style="text-align: right;">Último Acesso</th>' +
                      '</tr>' +
                    '</thead>' +
                    '<tbody id="adminUsersTableBody">' +
                      '<tr><td colspan="7" class="text-center" style="padding: 24px;">Carregando dados executivos...</td></tr>' +
                    '</tbody>' +
                  '</table>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 2: COMUNICADOS & MENSAGENS -->' +
              '<div id="adminTabAnnouncements" class="admin-tab-content hidden">' +
                '<div class="admin-card-section" style="margin-bottom: 1.5rem;">' +
                  '<h4>📢 Enviar Comunicado aos Cantores</h4>' +
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

              '<!-- ABA 3: CHAMADOS & SUPORTE (COM FOTOS) -->' +
              '<div id="adminTabTickets" class="admin-tab-content hidden">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">' +
                  '<div>' +
                    '<h4 style="margin:0;">🎫 Central de Chamados & Feedback de Cantores</h4>' +
                    '<p style="margin:0; font-size: 0.8rem; color: #94a3b8;">Sugestões de melhorias, dúvidas e problemas relatados pelos usuários com anexos</p>' +
                  '</div>' +
                  '<button id="btnRefreshTickets" class="btn btn-outline btn-sm">🔄 Atualizar Chamados</button>' +
                '</div>' +
                '<div id="ticketsListContainer" style="margin-top: 1rem;">' +
                  '<div style="color: #94a3b8; padding: 20px; text-align: center;">Carregando chamados...</div>' +
                '</div>' +
              '</div>' +

              '<!-- ABA 4: CUPONS VIP & DESCONTOS -->' +
              '<div id="adminTabCoupons" class="admin-tab-content hidden">' +
                '<div class="admin-coupon-layout">' +
                  '<!-- Card Criador de Cupom -->' +
                  '<div class="admin-coupon-creator-card">' +
                    '<h4>✨ Criar Novo Cupom VIP ou Desconto</h4>' +
                    '<p style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 1rem;">Crie cupons para cantores VIPs terem acesso cortesia ou descontos em campanhas.</p>' +
                    '<form id="formCreateCoupon" onsubmit="return false;">' +
                      '<div class="form-group">' +
                        '<label>Código do Cupom:</label>' +
                        '<input type="text" id="inputCouponCode" class="form-control" placeholder="Ex: VIP100, CANTOR50" style="text-transform: uppercase; font-family: var(--font-mono); font-weight: 700;">' +
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
                          '<label>Descrição / Observação:</label>' +
                          '<input type="text" id="inputCouponDesc" class="form-control" placeholder="Ex: Cortesia parceiros">' +
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
                  '<!-- Card Configuração de Preços Recorrentes -->' +
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

          '<!-- SUB-MODAL: GESTÃO & EDIÇÃO INDIVIDUAL DO CANTOR -->' +
          '<div id="adminEditSingerModal" class="modal hidden" style="z-index: 1000002;">' +
            '<div class="modal-overlay" id="adminEditSingerOverlay"></div>' +
            '<div class="modal-card" style="max-width: 560px;">' +
              '<div class="modal-header">' +
                '<h3 id="adminEditSingerTitle">✏️ Gerenciar Cantor Individual</h3>' +
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
                      '<label>Plano de Assinatura:</label>' +
                      '<select id="editSingerPlan" class="form-control">' +
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
                  '</div>' +
                  '<div class="form-group">' +
                    '<label>Código do Cantor (Palco):</label>' +
                    '<input type="text" id="editSingerCode" class="form-control" placeholder="#CANTOR-0000" style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8;">' +
                  '</div>' +
                  '<div style="display: flex; gap: 10px; margin-top: 1.5rem; flex-wrap: wrap;">' +
                    '<button type="button" id="btnDirectWhatsApp" class="btn btn-outline" style="color: #34d399; border-color: rgba(16,185,129,0.4);">💬 WhatsApp</button>' +
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

      // Atalhos dos Cards de Métricas
      var scMRR = document.getElementById('shortcutCardMRR');
      if (scMRR) {
        scMRR.addEventListener('click', function () {
          PrompterAdmin.switchTab('pricing');
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

      var btnRefresh = document.getElementById('btnRefreshAdminData');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', function () {
          searchQuery = '';
          var sInput = document.getElementById('adminSearchInput');
          if (sInput) sInput.value = '';
          PrompterAdmin.loadDashboardData();
          if (window.showToast) window.showToast('🔄 Lista de cantores atualizada com o banco de dados!', 'success');
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

      // Salvar Cantor
      var btnSaveSinger = document.getElementById('btnSaveSingerData');
      if (btnSaveSinger) {
        btnSaveSinger.addEventListener('click', function () {
          PrompterAdmin.saveSingerModalData();
        });
      }

      // Botão WhatsApp Direto
      var btnWhatsApp = document.getElementById('btnDirectWhatsApp');
      if (btnWhatsApp) {
        btnWhatsApp.addEventListener('click', function () {
          var phone = (document.getElementById('editSingerPhone').value || '').replace(/\D/g, '');
          var name = document.getElementById('editSingerName').value || 'Cantor';
          if (!phone) {
            if (window.showToast) window.showToast('Este cantor não possui número de WhatsApp cadastrado.', 'warning');
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

      // Fechar Sub-Modal Cantor
      var btnCloseEdit = document.getElementById('btnCloseEditSingerModal');
      var overlayEdit = document.getElementById('adminEditSingerOverlay');
      if (btnCloseEdit) btnCloseEdit.addEventListener('click', PrompterAdmin.closeSingerModal);
      if (overlayEdit) overlayEdit.addEventListener('click', PrompterAdmin.closeSingerModal);

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

      // Salvar Configurações de Faturamento
      var btnSavePricing = document.getElementById('btnSavePricingConfig');
      if (btnSavePricing) {
        btnSavePricing.addEventListener('click', function () {
          pricingConfig.monthlyPrice = parseFloat(document.getElementById('inputPriceMonthly').value) || 39.90;
          pricingConfig.annualPrice = parseFloat(document.getElementById('inputPriceAnnual').value) || 299.00;
          pricingConfig.mpEnv = document.getElementById('selectMpEnv').value || 'production';
          pricingConfig.mpPublicKey = (document.getElementById('inputMpPublicKey').value || '').trim();
          pricingConfig.mpAccessToken = (document.getElementById('inputMpAccessToken').value || '').trim();

          PrompterAdmin.saveStoredPricing();
          PrompterAdmin.updateMetrics();
          if (window.showToast) window.showToast('✅ Configurações de preços e Mercado Pago salvas!', 'success');
        });
      }
    },

    switchTab: function (tabName) {
      currentTab = tabName;
      var tabBtns = adminModal ? adminModal.querySelectorAll('.admin-tab-btn') : [];
      tabBtns.forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
      });

      var c1 = document.getElementById('adminTabClients');
      var c2 = document.getElementById('adminTabAnnouncements');
      var c3 = document.getElementById('adminTabTickets');
      var c4 = document.getElementById('adminTabCoupons');
      var c5 = document.getElementById('adminTabPricing');

      if (c1) c1.classList.toggle('hidden', currentTab !== 'clients');
      if (c2) c2.classList.toggle('hidden', currentTab !== 'announcements');
      if (c3) c3.classList.toggle('hidden', currentTab !== 'tickets');
      if (c4) c4.classList.toggle('hidden', currentTab !== 'coupons');
      if (c5) c5.classList.toggle('hidden', currentTab !== 'pricing');

      if (currentTab === 'announcements') PrompterAdmin.loadAnnouncements();
      if (currentTab === 'tickets') PrompterAdmin.loadTickets();
    },

    setFilter: function (filterName) {
      currentFilter = filterName;
      var filterPills = document.querySelectorAll('.filter-pill');
      filterPills.forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-filter') === filterName);
      });
      PrompterAdmin.renderUsersTable();
    },

    openModal: function () {
      if (!window.PrompterAuth || !window.PrompterAuth.isAdmin()) {
        if (window.showToast) window.showToast('Acesso restrito ao perfil de Desenvolvedor / CEO.', 'warning');
        return;
      }

      if (adminModal) {
        adminModal.classList.remove('hidden');
        searchQuery = '';
        var sInput = document.getElementById('adminSearchInput');
        if (sInput) sInput.value = '';
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
        title.innerText = '✏️ Gerenciar Cantor: ' + user.name;
        document.getElementById('editSingerId').value = user.id;
        document.getElementById('editSingerName').value = user.name;
        document.getElementById('editSingerEmail').value = user.email;
        document.getElementById('editSingerPhone').value = user.phone || '';
        document.getElementById('editSingerCpf').value = user.cpf || '';
        document.getElementById('editSingerInstagram').value = user.instagram || '';
        document.getElementById('editSingerCode').value = user.singer_code;
        
        var pVal = 'pro_annual';
        if (user.plan_type && user.plan_type.indexOf('MENSAL') !== -1) pVal = 'pro_monthly';
        else if (user.plan_tier === 'free') pVal = 'free';
        document.getElementById('editSingerPlan').value = pVal;

        document.getElementById('editSingerStatus').value = user.is_online ? 'online' : 'offline';
        if (btnDel) btnDel.classList.remove('hidden');
      } else {
        title.innerText = '➕ Convidar / Cadastrar Cantor VIP';
        document.getElementById('editSingerId').value = '';
        document.getElementById('editSingerName').value = '';
        document.getElementById('editSingerEmail').value = '';
        document.getElementById('editSingerPhone').value = '';
        document.getElementById('editSingerCpf').value = '';
        document.getElementById('editSingerInstagram').value = '';
        document.getElementById('editSingerCode').value = '@cantor_' + Math.floor(1000 + Math.random() * 9000);
        document.getElementById('editSingerPlan').value = 'pro_annual';
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
      var phone = (document.getElementById('editSingerPhone').value || '').trim();
      var cpf = (document.getElementById('editSingerCpf').value || '').trim();
      var instagram = (document.getElementById('editSingerInstagram').value || '').trim();
      var code = (document.getElementById('editSingerCode').value || '').trim() || ('@' + email.split('@')[0]);
      var planVal = document.getElementById('editSingerPlan').value;
      var statusVal = document.getElementById('editSingerStatus').value;

      if (!name || !email) {
        if (window.showToast) window.showToast('Preencha o nome e e-mail do cantor.', 'warning');
        return;
      }

      var isPro = planVal !== 'free';
      var planType = '💎 PRO ANUAL';
      if (planVal === 'pro_monthly') planType = '⚡ PRO MENSAL';
      else if (planVal === 'free') planType = '⚡ PLANO FREE';

      var existing = allUserData.find(function(u) { return u.id === id || u.email === email; });
      if (existing) {
        existing.name = name;
        existing.email = email;
        existing.phone = phone;
        existing.cpf = cpf;
        existing.instagram = instagram;
        existing.singer_code = code;
        existing.plan_tier = isPro ? 'pro' : 'free';
        existing.plan_type = planType;
        existing.is_online = statusVal === 'online';
        existing.status_text = statusVal === 'online' ? '🟢 Conectado ao Palco' : '⚪ Offline';
      } else {
        allUserData.unshift({
          id: id || ('user-' + Date.now()),
          name: name,
          email: email,
          phone: phone,
          cpf: cpf,
          instagram: instagram,
          singer_code: code,
          plan_tier: isPro ? 'pro' : 'free',
          plan_type: planType,
          is_online: statusVal === 'online',
          status_text: statusVal === 'online' ? '🟢 Conectado ao Palco' : '⚪ Offline',
          reps_count: 0,
          songs_count: 0,
          last_seen: 'Hoje',
          created_at: new Date().toISOString().slice(0, 10)
        });
      }

      // Persistir diretamente no Supabase profiles
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb && id) {
        sb.from('profiles').upsert({
          id: id,
          email: email,
          display_name: name,
          phone: phone,
          cpf: cpf,
          instagram: instagram,
          singer_code: code,
          plan_tier: isPro ? 'pro' : 'free',
          plan_type: planType,
          updated_at: new Date().toISOString()
        }).catch(function() {});
      }

      PrompterAdmin.saveStoredUsers();
      PrompterAdmin.updateMetrics();
      PrompterAdmin.renderUsersTable();
      PrompterAdmin.closeSingerModal();

      if (window.showToast) window.showToast('✅ Dados do cantor salvos no banco com sucesso!', 'success');
    },

    loadDashboardData: function () {
      var currentUser = window.PrompterAuth ? window.PrompterAuth.getUser() : null;
      var currentProfile = window.PrompterAuth ? window.PrompterAuth.getProfile() : null;

      var devEmail = (currentProfile && currentProfile.email) ? currentProfile.email : (currentUser ? currentUser.email : 'leovitulli@gmail.com');
      var devName = (currentProfile && currentProfile.display_name) ? currentProfile.display_name : 'Leonardo Vitulli';
      var devCode = (currentProfile && currentProfile.singer_code) ? currentProfile.singer_code : '@leovitulli';

      // Sincronizar EXCLUSIVAMENTE com dados reais do Supabase (zero fictícios)
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        sb.from('profiles').select('*').then(function(res) {
          if (res.data && res.data.length > 0) {
            allUserData = res.data.map(function(p) {
              var existing = allUserData.find(function(u) { return u.email === p.email; });
              return {
                id: p.id,
                name: p.display_name || (existing ? existing.name : p.email.split('@')[0]),
                email: p.email,
                phone: p.phone || (existing ? existing.phone : ''),
                cpf: p.cpf || (existing ? existing.cpf : ''),
                instagram: p.instagram || (existing ? existing.instagram : ''),
                singer_code: p.singer_code || (existing ? existing.singer_code : ('@' + p.email.split('@')[0])),
                plan_tier: p.plan_tier || 'free',
                plan_type: p.plan_type || (p.plan_tier === 'pro' ? '💎 PRO ANUAL' : '⚡ PLANO FREE'),
                is_online: true,
                status_text: '🟢 Conectado ao Palco',
                reps_count: 0,
                songs_count: 0,
                last_seen: 'Hoje',
                created_at: p.created_at || 'Hoje'
              };
            });
            PrompterAdmin.saveStoredUsers();
            PrompterAdmin.updateMetrics();
            PrompterAdmin.renderUsersTable();
            PrompterAdmin.populateAnnouncementTargets();
          } else if (currentUser) {
            allUserData = [{
              id: currentUser.id,
              name: devName,
              email: devEmail,
              singer_code: devCode,
              plan_tier: (currentProfile && currentProfile.plan_tier) || 'pro',
              plan_type: (currentProfile && currentProfile.plan_type) || '💎 PRO ANUAL',
              is_online: true,
              status_text: '🟢 Conectado ao Palco',
              phone: (currentProfile && currentProfile.phone) || '',
              cpf: (currentProfile && currentProfile.cpf) || '',
              instagram: (currentProfile && currentProfile.instagram) || '',
              reps_count: 1,
              songs_count: 33,
              last_seen: 'Agora mesmo',
              created_at: 'Hoje'
            }];
            PrompterAdmin.saveStoredUsers();
            PrompterAdmin.updateMetrics();
            PrompterAdmin.renderUsersTable();
            PrompterAdmin.populateAnnouncementTargets();
          }
        }).catch(function() {});
      } else if (currentUser) {
        allUserData = [{
          id: currentUser.id,
          name: devName,
          email: devEmail,
          singer_code: devCode,
          plan_tier: (currentProfile && currentProfile.plan_tier) || 'pro',
          plan_type: (currentProfile && currentProfile.plan_type) || '💎 PRO ANUAL',
          is_online: true,
          status_text: '🟢 Conectado ao Palco',
          phone: (currentProfile && currentProfile.phone) || '',
          cpf: (currentProfile && currentProfile.cpf) || '',
          instagram: (currentProfile && currentProfile.instagram) || '',
          reps_count: 1,
          songs_count: 33,
          last_seen: 'Agora mesmo',
          created_at: 'Hoje'
        }];
        PrompterAdmin.updateMetrics();
        PrompterAdmin.renderUsersTable();
        PrompterAdmin.populateAnnouncementTargets();
      }
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
          var matchPhone = (u.phone || '').toLowerCase().indexOf(searchQuery) !== -1;
          var matchCpf = (u.cpf || '').toLowerCase().indexOf(searchQuery) !== -1;
          return matchName || matchEmail || matchCode || matchPhone || matchCpf;
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
        var statusDot = user.is_online
          ? '<span class="status-dot-pulse-online" title="🟢 Online no Palco"></span>'
          : '<span class="status-dot-offline" title="⚪ Offline"></span>';

        var planBadge = user.plan_tier === 'pro'
          ? '<span class="badge-plan-executive badge-plan-pro">' + (user.plan_type || '💎 PRO ANUAL') + '</span>'
          : '<span class="badge-plan-executive badge-plan-free">⚡ PLANO FREE</span>';

        var cleanPhone = (user.phone || '').replace(/\D/g, '');
        if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;
        var waUrl = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent('Olá ' + user.name + '! Tudo bem? Aqui é o Leonardo da equipe CantaAí PRO.');
        var waButton = cleanPhone
          ? '<a href="' + waUrl + '" target="_blank" class="admin-table-btn-link admin-btn-wa" title="Chamar no WhatsApp direto" onclick="event.stopPropagation();">💬 ' + escapeHtml(user.phone) + '</a>'
          : '<span style="color:#64748b; font-size:0.8rem;">Sem WhatsApp</span>';

        var cleanInsta = (user.instagram || '').replace('@', '').trim();
        var instaUrl = 'https://instagram.com/' + cleanInsta;
        var instaButton = cleanInsta
          ? '<a href="' + instaUrl + '" target="_blank" class="admin-table-btn-link admin-btn-insta" title="Abrir Instagram direto" onclick="event.stopPropagation();">📸 @' + escapeHtml(cleanInsta) + '</a>'
          : '<span style="color:#64748b; font-size:0.8rem;">—</span>';

        var cpfStr = user.cpf ? ('CPF: ' + user.cpf) : 'Sem CPF';
        var loginCodeStr = user.singer_code ? escapeHtml(user.singer_code) : ('@' + user.email.split('@')[0]);

        html +=
          '<tr class="admin-user-row" data-user-id="' + user.id + '" title="Clique para gerenciar ' + escapeHtml(user.name) + '">' +
            '<td style="text-align: center; width: 45px;">' + statusDot + '</td>' +
            '<td>' +
              '<div class="admin-user-cell">' +
                '<div class="admin-user-avatar">' + initial + '</div>' +
                '<div class="admin-user-details">' +
                  '<span class="admin-user-name">' + escapeHtml(user.name) + '</span>' +
                  '<span class="admin-user-email">' + escapeHtml(user.email) + '</span>' +
                '</div>' +
              '</div>' +
            '</td>' +
            '<td><code class="admin-code-tag" style="color: #38bdf8; font-weight: 700;">' + loginCodeStr + '</code></td>' +
            '<td>' + planBadge + '</td>' +
            '<td><div>' + waButton + '</div><small style="color:#64748b; font-size:0.75rem; margin-top:2px; display:inline-block;">' + escapeHtml(cpfStr) + '</small></td>' +
            '<td>' + instaButton + '</td>' +
            '<td style="text-align: right;"><span class="admin-time-ago">' + escapeHtml(user.last_seen || 'Hoje') + '</span></td>' +
          '</tr>';
      });

      tbody.innerHTML = html;

      // Clique em qualquer parte da linha abre o modal de edição
      tbody.querySelectorAll('.admin-user-row').forEach(function (row) {
        row.addEventListener('click', function () {
          var uId = this.getAttribute('data-user-id');
          var userObj = allUserData.find(function(u) { return u.id === uId; });
          if (userObj) PrompterAdmin.openSingerModal(userObj);
        });
      });
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

    loadPricingForm: function () {
      var pM = document.getElementById('inputPriceMonthly');
      var pA = document.getElementById('inputPriceAnnual');
      var env = document.getElementById('selectMpEnv');
      var pubKey = document.getElementById('inputMpPublicKey');
      var accToken = document.getElementById('inputMpAccessToken');

      if (pM) pM.value = pricingConfig.monthlyPrice;
      if (pA) pA.value = pricingConfig.annualPrice;
      if (env) env.value = pricingConfig.mpEnv || 'production';
      if (pubKey) pubKey.value = pricingConfig.mpPublicKey || '';
      if (accToken) accToken.value = pricingConfig.mpAccessToken || '';
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
    }
  };

  window.PrompterAdmin = PrompterAdmin;
})();
