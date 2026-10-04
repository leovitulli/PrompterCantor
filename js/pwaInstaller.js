/**
 * CantaAí PRO - PWA Installer Component
 * Padrão profissional baseado nas implementações de ConsTruta ERP e Flowee Studio (saas-fotografia).
 * Suporte completo a Chrome Desktop, Edge, Android, iOS Safari e macOS Safari.
 */
(function () {
  'use strict';

  var deferredPrompt = null;
  var isStandalone = false;
  var isIOS = false;
  var DISMISS_KEY = 'cantaai-pwa-dismissed';
  var DISMISS_DAYS = 7;

  function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
  }

  function isDismissedRecently() {
    try {
      var dismissedTime = localStorage.getItem(DISMISS_KEY);
      if (!dismissedTime) return false;
      var daysSince = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60 * 24);
      return daysSince < DISMISS_DAYS;
    } catch (e) {
      return false;
    }
  }

  function setDismissedNow() {
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch (e) {}
  }

  function createPwaInstallerUI() {
    if (document.getElementById('pwaFloatingPrompt')) return;

    var container = document.createElement('div');
    container.id = 'pwaInstallerWrapper';
    container.innerHTML =
      '<!-- Card Flutuante Inteligente PWA (Estilo ConsTruta / Flowee) -->' +
      '<aside id="pwaFloatingPrompt" class="pwa-floating-prompt hidden" aria-label="Instalar CantaAí PRO">' +
        '<div class="pwa-card-body">' +
          '<button id="btnPwaCloseFloating" class="pwa-card-close" aria-label="Fechar" title="Fechar (não mostrar por 7 dias)">✕</button>' +
          '<div class="pwa-card-content">' +
            '<div class="pwa-card-icon-box">' +
              '<svg class="pwa-app-icon" viewBox="0 0 84 84" fill="none" stroke="currentColor" stroke-linecap="round">' +
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
            '</div>' +
            '<div class="pwa-card-info">' +
              '<h4 class="pwa-card-title">Instalar CantaAí PRO</h4>' +
              '<p class="pwa-card-desc">' +
                (isIOS
                  ? 'Acesse direto pela tela inicial do seu celular, em tela cheia e sem barras.'
                  : 'Janela dedicada sem navegador • Acesso rápido • 100% offline no palco.') +
              '</p>' +
              '<div id="pwaIosQuickTip" class="pwa-ios-quick-tip ' + (isIOS ? '' : 'hidden') + '">' +
                '<p class="pwa-ios-step">1. Toque em <strong>Compartilhar <span class="pwa-share-ico">⎋</span></strong></p>' +
                '<p class="pwa-ios-step">2. Selecione <strong>"Adicionar à Tela de Início"</strong></p>' +
              '</div>' +
              '<div class="pwa-card-actions">' +
                '<button id="btnPwaActionInstall" class="btn btn-primary pwa-btn-install">' +
                  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
                    '<polyline points="7 10 12 15 17 10"></polyline>' +
                    '<line x1="12" y1="15" x2="12" y2="3"></line>' +
                  '</svg>' +
                  '<span id="pwaActionInstallText">' + (deferredPrompt ? 'Instalar Agora' : 'Como Instalar') + '</span>' +
                '</button>' +
                '<button id="btnPwaActionDismiss" class="btn btn-secondary pwa-btn-dismiss">Agora não</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</aside>' +

      '<!-- Modal de Guia Detalhado de Instalação (PwaInstallPrompt) -->' +
      '<div id="pwaGuideModal" class="modal-overlay hidden" style="z-index: 100000;">' +
        '<div class="modal-content pwa-guide-modal-content">' +
          '<button id="btnPwaCloseGuide" class="modal-close" title="Fechar">✕</button>' +
          '<div class="pwa-guide-header">' +
            '<div class="pwa-guide-logo-box">' +
              '<svg class="pwa-app-icon" viewBox="0 0 84 84" fill="none" stroke="currentColor" stroke-linecap="round">' +
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
            '</div>' +
            '<div>' +
              '<h3 class="pwa-guide-title">Instalar CantaAí PRO</h3>' +
              '<p class="pwa-guide-subtitle">Janela dedicada • Ícone no seu dispositivo • Uso offline no palco</p>' +
            '</div>' +
          '</div>' +

          '<div class="pwa-guide-options">' +
            '<!-- Opção 1: Chrome / Edge / Windows / Android -->' +
            '<div class="pwa-guide-card ' + (!isIOS ? 'active-platform' : '') + '">' +
              '<div class="pwa-guide-card-head">' +
                '<span class="pwa-platform-tag">💻 Chrome, Edge ou Android</span>' +
              '</div>' +
              '<p class="pwa-guide-text">' +
                'Clique no ícone de <strong>computador com seta</strong> na barra de endereços do navegador (ao lado dos favoritos) ou acesse o menu de 3 pontinhos (⋮) &gt; <strong>Salvar e Compartilhar &gt; Instalar CantaAí PRO</strong>.' +
              '</p>' +
              '<div id="pwaModalInstallDirectContainer" class="pwa-direct-install-box ' + (deferredPrompt ? '' : 'hidden') + '">' +
                '<button id="btnPwaModalDirectInstall" class="btn btn-primary btn-sm">' +
                  '⬇ Instalar Agora Diretamente' +
                '</button>' +
              '</div>' +
            '</div>' +

            '<!-- Opção 2: iPhone ou iPad (Safari) -->' +
            '<div class="pwa-guide-card ' + (isIOS ? 'active-platform' : '') + '">' +
              '<div class="pwa-guide-card-head">' +
                '<span class="pwa-platform-tag">📱 No iPhone ou iPad (Safari)</span>' +
              '</div>' +
              '<div class="pwa-guide-steps">' +
                '<p>1. Toque no botão de <strong>Compartilhar</strong> (ícone de quadrado com seta para cima ⎋ na barra inferior do Safari).</p>' +
                '<p>2. Role a lista e toque em <strong>"Adicionar à Tela de Início"</strong> ⊞.</p>' +
                '<p class="pwa-guide-badge-note">✨ O CantaAí PRO abrirá em tela cheia com o ícone oficial!</p>' +
              '</div>' +
            '</div>' +

            '<!-- Opção 3: macOS Safari -->' +
            '<div class="pwa-guide-card">' +
              '<div class="pwa-guide-card-head">' +
                '<span class="pwa-platform-tag">🖥️ No Safari do Mac (macOS)</span>' +
              '</div>' +
              '<p class="pwa-guide-text">' +
                'No menu superior do Mac, clique em <strong>Arquivo</strong> &gt; <strong>Adicionar ao Dock...</strong>. Ele vira um aplicativo nativo independente.' +
              '</p>' +
            '</div>' +
          '</div>' +

          '<div class="pwa-guide-footer">' +
            '<button id="btnPwaGuideGotIt" class="btn btn-primary pwa-btn-got-it">Entendi</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(container);
    bindModalAndFloatingEvents();
  }

  function showFloatingPrompt() {
    if (isStandalone) return;
    var el = document.getElementById('pwaFloatingPrompt');
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('visible');
  }

  function hideFloatingPrompt() {
    var el = document.getElementById('pwaFloatingPrompt');
    if (!el) return;
    el.classList.remove('visible');
    el.classList.add('hidden');
  }

  function openGuideModal() {
    var modal = document.getElementById('pwaGuideModal');
    if (!modal) return;
    var directBox = document.getElementById('pwaModalInstallDirectContainer');
    if (directBox) {
      if (deferredPrompt) directBox.classList.remove('hidden');
      else directBox.classList.add('hidden');
    }
    modal.classList.remove('hidden');
  }

  function closeGuideModal() {
    var modal = document.getElementById('pwaGuideModal');
    if (!modal) return;
    modal.classList.add('hidden');
  }

  function handleInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          isStandalone = true;
          hideFloatingPrompt();
          closeGuideModal();
        }
        deferredPrompt = null;
      });
    } else {
      openGuideModal();
    }
  }

  function bindModalAndFloatingEvents() {
    var btnCloseFloat = document.getElementById('btnPwaCloseFloating');
    if (btnCloseFloat) {
      btnCloseFloat.onclick = function () {
        hideFloatingPrompt();
        setDismissedNow();
      };
    }

    var btnDismiss = document.getElementById('btnPwaActionDismiss');
    if (btnDismiss) {
      btnDismiss.onclick = function () {
        hideFloatingPrompt();
        setDismissedNow();
      };
    }

    var btnInstallAction = document.getElementById('btnPwaActionInstall');
    if (btnInstallAction) {
      btnInstallAction.onclick = function () {
        handleInstallClick();
      };
    }

    var btnCloseGuide = document.getElementById('btnPwaCloseGuide');
    if (btnCloseGuide) {
      btnCloseGuide.onclick = closeGuideModal;
    }

    var btnGotIt = document.getElementById('btnPwaGuideGotIt');
    if (btnGotIt) {
      btnGotIt.onclick = closeGuideModal;
    }

    var btnDirect = document.getElementById('btnPwaModalDirectInstall');
    if (btnDirect) {
      btnDirect.onclick = function () {
        handleInstallClick();
      };
    }

    var modalOverlay = document.getElementById('pwaGuideModal');
    if (modalOverlay) {
      modalOverlay.onclick = function (e) {
        if (e.target === modalOverlay) closeGuideModal();
      };
    }
  }

  function updateButtonsState(hasPrompt) {
    var actionText = document.getElementById('pwaActionInstallText');
    if (actionText) {
      actionText.textContent = hasPrompt ? 'Instalar Agora' : 'Como Instalar';
    }

    var btnHeader = document.getElementById('btnHeaderInstallPwa');
    if (btnHeader && !isStandalone) {
      btnHeader.classList.remove('hidden');
      btnHeader.style.display = 'inline-flex';
    }

    var menuItem = document.getElementById('menuItemInstallPwa');
    if (menuItem && !isStandalone) {
      menuItem.classList.remove('hidden');
      menuItem.style.display = 'flex';
    }

    var btnLanding = document.getElementById('btnLandingInstallPwa');
    if (btnLanding && !isStandalone) {
      btnLanding.classList.remove('hidden');
      btnLanding.style.display = 'inline-flex';
    }
  }

  function bindTriggerButtons() {
    var triggers = [
      document.getElementById('btnHeaderInstallPwa'),
      document.getElementById('menuItemInstallPwa'),
      document.getElementById('btnLandingInstallPwa')
    ];

    triggers.forEach(function (btn) {
      if (btn) {
        btn.onclick = function (e) {
          if (e) e.preventDefault();
          handleInstallClick();
        };
      }
    });
  }

  // Inicialização no DOM
  function init() {
    isStandalone = isRunningStandalone();
    if (isStandalone) {
      return;
    }

    var ua = window.navigator.userAgent.toLowerCase();
    isIOS = /iphone|ipad|ipod/.test(ua);

    createPwaInstallerUI();

    var dismissed = isDismissedRecently();

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      updateButtonsState(true);

      if (!dismissed) {
        setTimeout(function () {
          showFloatingPrompt();
        }, 3000);
      }
    });

    if (isIOS && !dismissed) {
      setTimeout(function () {
        showFloatingPrompt();
      }, 3500);
    }

    window.addEventListener('appinstalled', function () {
      hideFloatingPrompt();
      closeGuideModal();
      deferredPrompt = null;
      isStandalone = true;
      updateButtonsState(false);
      if (window.showToast) {
        window.showToast('🎉 CantaAí PRO instalado com sucesso!', 'success');
      }
    });

    bindTriggerButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expõe API global para abertura manual de qualquer lugar do app
  window.openPwaInstallGuide = openGuideModal;
  window.triggerPwaInstall = handleInstallClick;
})();
