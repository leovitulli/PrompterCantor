/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANTAAÍ PRO — TOUR INTERATIVO GUIADO (CLEAN, AIRY & FUN)
 * ═══════════════════════════════════════════════════════════════════════════
 * Características:
 * - Foco 100% cristalino: o elemento da tela fica totalmente visível e brilhante
 * - Textos curtos, diretos e divertidos (sem textão nem cansaço)
 * - Cobertura de tudo: Repertórios, Copiar/Colar Cifras, Ordem das Músicas (▲ ▼),
 *   Mudança de Tons em 1 clique, e Palco sem travar
 * - Desbloqueio imediato da tela ao fechar (zero bugs de clique)
 */

(function (window, document) {
  'use strict';

  var STORAGE_KEY = 'cantaai_tour_seen_v4';

  var CantaAiTour = {
    currentStep: 0,
    isOpen: false,
    elements: {},

    // ── 9 PASSOS ÁGEIS, OBJETIVOS E DIVERTIDOS ──
    steps: [
      // PASSO 1: BEM-VINDO
      {
        target: '#btnGoHome',
        fallbackTarget: '#appHeader',
        title: 'Bora começar? 🎤✨',
        description: 'Bem-vindo ao <strong>CantaAí PRO</strong>! Seu teleprompter inteligente de palco. Celular, tablet ou PC: tudo funciona <strong>100% offline no show</strong> sem depender de internet!',
        demo: {
          title: '⚡ O que você vai ver rapidinho:',
          items: [
            'Como organizar seus <strong>repertórios e pastas</strong>',
            'Como <strong>copiar cifras</strong> de sites e <strong>mudar o tom</strong>',
            'Como <strong>mudar a ordem</strong> das músicas na hora do show'
          ],
          type: 'blue'
        }
      },

      // PASSO 2: REPERTÓRIOS COMO UM TODO
      {
        target: '#repertoireGrid',
        fallbackTarget: '#tabRepertoire',
        title: 'Suas Pastas & Shows 📂',
        description: 'Organize suas músicas por estilo ou evento (ex: <em>Sertanejo, Pop Rock, Casamento</em>). Cada pasta guarda seu setlist pronto!',
        demo: {
          title: '🎛️ Dicas de Ouro:',
          items: [
            'Toque em <strong>🎵 Ver Músicas</strong> para abrir a lista.',
            'Use as setinhas <strong>◀ e ▶</strong> (ou arraste em <strong>⋮⋮</strong>) para colocar os shows da semana na frente!',
            'Clique em <strong>✏️ Renomear</strong> para alterar o nome quando quiser.'
          ],
          type: 'blue'
        }
      },

      // PASSO 3: O BOTÃO + ADICIONAR
      {
        target: '#btnDropdownAdd',
        title: 'O Botão Mágico ➕',
        description: 'É aqui no botão azul <strong>+ Adicionar</strong> que você alimenta todo o seu app. Veja as 4 formas simples:',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        demo: {
          title: '📋 Escolha o seu jeito preferido:',
          items: [
            '<strong>Criar Repertório:</strong> Cria uma nova pasta vazia',
            '<strong>Criar Música Manual:</strong> Onde você cola cifras da internet',
            '<strong>Importar Arquivos:</strong> Puxa Word, PDF e áudios do aparelho',
            '<strong>Google Drive:</strong> Conecta com suas pastas da nuvem'
          ],
          type: 'blue'
        }
      },

      // PASSO 4: COPIAR E COLAR CIFRAS (FOCO MÁXIMO)
      {
        target: '#btnMenuNewSong',
        fallbackTarget: '#btnDropdownAdd',
        title: 'Copie de Qualquer Site! 🔥',
        description: 'Achou a música no <em>Cifra Club</em>, <em>Letras</em> ou qualquer site? Colocar aqui é muito fácil:',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        demo: {
          title: '💡 3 Passos Simples:',
          items: [
            '<strong>1. No site:</strong> Selecione a letra com os acordes e copie (<code>Ctrl+C</code> ou segure o dedo e toque em <strong>Copiar</strong>).',
            '<strong>2. No CantaAí:</strong> Vá em <strong>+ Adicionar ➔ Criar Música Manual</strong>.',
            '<strong>3. Cole em "Letra e Cifra":</strong> O app identifica os acordes sozinho, cria as caixas azuis e deixa pronto pro palco!'
          ],
          type: 'gold'
        }
      },

      // PASSO 5: IMPORTAR ARQUIVOS & GOOGLE DRIVE
      {
        target: '#btnMenuImportLocal',
        fallbackTarget: '#btnDropdownAdd',
        title: 'Arquivos & Google Drive ☁️',
        description: 'Já tem arquivos no computador, celular ou nuvem? Importe dezenas de músicas juntas em segundos!',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        onLeave: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.add('hidden');
        },
        demo: {
          title: '⚡ Super Rápido:',
          items: [
            '<strong>Arquivos Locais:</strong> Puxe arquivos em <strong>Word (.docx), PDF (.pdf) ou Texto (.txt)</strong>.',
            '<strong>Música Guia:</strong> Se tiver áudios (.mp3/.m4a) com o mesmo nome, ele conecta o áudio sozinho!',
            '<strong>Google Drive:</strong> Conecte sua conta em 1 clique e baixe pastas completas.'
          ],
          type: 'blue'
        }
      },

      // PASSO 6: ORDEM DAS MÚSICAS NO REPERTÓRIO
      {
        target: '#searchInput',
        fallbackTarget: '#appHeader',
        title: 'Sequência do Show 🎵',
        description: 'Abra qualquer repertório e monte o roteiro exato do que vai tocar na noite!',
        demo: {
          title: '📋 Controle Total da Ordem:',
          items: [
            '<strong>Mudar de Posição:</strong> Use as setas <strong>▲ (Subir)</strong> e <strong>▼ (Descer)</strong> em cada música para acertar a sequência na hora!',
            '<strong>🔤 Ordem A-Z:</strong> Deixa tudo em ordem alfabética num instante.',
            '<strong>🖨️ Imprimir Setlist:</strong> Gera a lista com número e tom de cada música para mandar no zap da banda!'
          ],
          type: 'gold'
        }
      },

      // PASSO 7: MUDANÇA DE TONS EM 1 CLIQUE
      {
        target: '#btnToggleTheme',
        fallbackTarget: '#appHeader',
        title: 'Mude o Tom em 1 Clique! 🎸',
        description: 'O cantor ou cantora precisa mudar o tom da música? Não perca tempo fazendo conta de cabeça no palco:',
        demo: {
          title: '🎵 Harmonia Automática:',
          items: [
            'Dentro da música, clique no seletor <strong>Tom: E ▾</strong>.',
            'Escolha qualquer tom (maior ou menor). O CantaAí <strong>transpõe todos os acordes da letra na hora</strong>!',
            'O tom original fica guardado para você voltar sempre que quiser.'
          ],
          type: 'blue'
        }
      },

      // PASSO 8: NO PALCO — TELEPROMPTER E ROLAGEM
      {
        target: '#appHeader',
        title: 'No Palco: Tela e Rolagem 🚀',
        description: 'Ao tocar em qualquer música, a tela entra em modo de apresentação limpo com fundo preto anti-reflexo:',
        demo: {
          title: '📱 Feito pro seu Celular e Tablet:',
          items: [
            '<strong>▶ Rolagem Suave:</strong> 1 toque na tela inicia ou pausa a descida do texto.',
            '<strong>Ajustes no Polegar:</strong> Regule a velocidade no <strong>[-] 3x [+]</strong> e aumente a letra no <strong>[A+]</strong>.',
            '<strong>🛡️ Tela Sempre Ativa:</strong> O app impede que a tela do celular apague durante a música!'
          ],
          type: 'blue'
        }
      },

      // PASSO 9: CONCLUÍDO & SUPORTE
      {
        target: '#btnHeaderNotifications',
        fallbackTarget: '#appHeader',
        title: 'Tudo Pronto pro Show! 🌟',
        description: 'Viu como é fácil? Agora é só colocar suas músicas e arrasar no ensaio ou no palco!',
        demo: {
          title: '💬 Se precisar de ajuda:',
          items: [
            'Toque no <strong>Sininho 🔔</strong> para novidades e chat direto com nossa equipe.',
            'Para rever este tour quando quiser, toque no seu perfil <strong>🎤</strong> no topo e clique em <em>Tour Interativo</em>.',
            'Bom show e boa música! 🎸🎤'
          ],
          type: 'green'
        }
      }
    ],

    // ── INICIALIZAÇÃO DO MOTOR ──
    init: function () {
      this.createTourDOM();
      this.bindEvents();

      var self = this;
      window.addEventListener('load', function () {
        setTimeout(function () {
          var seen = localStorage.getItem(STORAGE_KEY);
          var isLogged = window.PrompterAuth && window.PrompterAuth.getUser && window.PrompterAuth.getUser();
          if (!seen && isLogged) {
            self.start(0);
          }
        }, 1200);
      });
    },

    createTourDOM: function () {
      if (document.getElementById('cantaaiTourOverlay')) return;

      var overlay = document.createElement('div');
      overlay.id = 'cantaaiTourOverlay';
      overlay.className = 'cantaai-tour-overlay';
      overlay.innerHTML = 
        '<div class="cantaai-tour-backdrop" id="tourBackdrop"></div>' +
        '<div class="cantaai-tour-spotlight" id="tourSpotlight"></div>' +
        '<div class="cantaai-tour-card" id="tourCard">' +
          '<div class="tour-card-header">' +
            '<span class="tour-step-badge" id="tourStepBadge">Passo 1 de 9</span>' +
            '<div class="tour-progress-dots" id="tourProgressDots"></div>' +
            '<button type="button" class="tour-btn-close" id="btnTourClose" title="Fechar guia">✕</button>' +
          '</div>' +
          '<div class="tour-card-body">' +
            '<h3 class="tour-title" id="tourTitle">Título</h3>' +
            '<p class="tour-desc" id="tourDesc">Descrição</p>' +
            '<div class="tour-demo-box" id="tourDemoBox">' +
              '<div class="tour-demo-title" id="tourDemoTitle">💡 Como funciona:</div>' +
              '<ul class="tour-steps-mini" id="tourDemoList"></ul>' +
            '</div>' +
          '</div>' +
          '<div class="tour-card-footer">' +
            '<div class="tour-footer-actions">' +
              '<button type="button" class="tour-btn tour-btn-skip" id="btnTourSkip">Pular</button>' +
              '<div style="display: flex; gap: 8px;">' +
                '<button type="button" class="tour-btn tour-btn-prev" id="btnTourPrev">‹ Voltar</button>' +
                '<button type="button" class="tour-btn tour-btn-next" id="btnTourNext">Continuar ›</button>' +
              '</div>' +
            '</div>' +
            '<label class="tour-dont-show-wrap">' +
              '<input type="checkbox" id="chkTourDontShowAgain">' +
              '<span>Não abrir automaticamente ao iniciar</span>' +
            '</label>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      this.elements = {
        overlay: overlay,
        backdrop: document.getElementById('tourBackdrop'),
        spotlight: document.getElementById('tourSpotlight'),
        card: document.getElementById('tourCard'),
        badge: document.getElementById('tourStepBadge'),
        dots: document.getElementById('tourProgressDots'),
        title: document.getElementById('tourTitle'),
        desc: document.getElementById('tourDesc'),
        demoBox: document.getElementById('tourDemoBox'),
        demoTitle: document.getElementById('tourDemoTitle'),
        demoList: document.getElementById('tourDemoList'),
        btnPrev: document.getElementById('btnTourPrev'),
        btnNext: document.getElementById('btnTourNext'),
        btnSkip: document.getElementById('btnTourSkip'),
        btnClose: document.getElementById('btnTourClose'),
        chkDontShow: document.getElementById('chkTourDontShowAgain')
      };
    },

    bindEvents: function () {
      var self = this;

      if (this.elements.btnNext) {
        this.elements.btnNext.addEventListener('click', function (e) {
          e.stopPropagation();
          self.next();
        });
      }

      if (this.elements.btnPrev) {
        this.elements.btnPrev.addEventListener('click', function (e) {
          e.stopPropagation();
          self.prev();
        });
      }

      if (this.elements.btnSkip) {
        this.elements.btnSkip.addEventListener('click', function (e) {
          e.stopPropagation();
          self.close(true);
        });
      }

      if (this.elements.btnClose) {
        this.elements.btnClose.addEventListener('click', function (e) {
          e.stopPropagation();
          self.close(false);
        });
      }

      if (this.elements.backdrop) {
        this.elements.backdrop.addEventListener('click', function (e) {
          if (e.target === self.elements.backdrop) {
            self.next();
          }
        });
      }

      window.addEventListener('keydown', function (e) {
        if (!self.isOpen) return;
        if (e.key === 'Escape') self.close(false);
        else if (e.key === 'ArrowRight') self.next();
        else if (e.key === 'ArrowLeft') self.prev();
      });

      window.addEventListener('resize', function () {
        if (self.isOpen) self.updatePosition();
      });
      window.addEventListener('orientationchange', function () {
        if (self.isOpen) {
          setTimeout(function () { self.updatePosition(); }, 200);
        }
      });
    },

    // ── CONTROLE DO TOUR ──
    start: function (stepIndex) {
      this.isOpen = true;
      this.currentStep = (typeof stepIndex === 'number') ? stepIndex : 0;
      
      this.elements.overlay.style.display = 'block';
      this.elements.overlay.classList.add('active');
      this.renderStep(this.currentStep);
    },

    next: function () {
      if (this.currentStep < this.steps.length - 1) {
        this.goToStep(this.currentStep + 1);
      } else {
        this.close(true);
      }
    },

    prev: function () {
      if (this.currentStep > 0) {
        this.goToStep(this.currentStep - 1);
      }
    },

    goToStep: function (newIndex) {
      var currentStepObj = this.steps[this.currentStep];
      if (currentStepObj && typeof currentStepObj.onLeave === 'function') {
        currentStepObj.onLeave();
      }

      this.currentStep = newIndex;
      this.renderStep(this.currentStep);
    },

    close: function (markSeen) {
      var currentStepObj = this.steps[this.currentStep];
      if (currentStepObj && typeof currentStepObj.onLeave === 'function') {
        currentStepObj.onLeave();
      }

      // Fecha menus auxiliares
      var menu = document.getElementById('dropdownAddMenu');
      if (menu) menu.classList.add('hidden');

      this.isOpen = false;
      
      // DESBLOQUEIO IMEDIATO E TOTAL DA TELA
      this.elements.overlay.classList.remove('active');
      this.elements.overlay.style.display = 'none';

      if (markSeen || (this.elements.chkDontShow && this.elements.chkDontShow.checked)) {
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    },

    // ── RENDERIZAÇÃO DO PASSO ──
    renderStep: function (index) {
      var step = this.steps[index];
      if (!step) return;

      if (typeof step.onEnter === 'function') {
        step.onEnter();
      }

      this.elements.badge.textContent = 'Passo ' + (index + 1) + ' de ' + this.steps.length;
      this.elements.title.innerHTML = step.title;
      this.elements.desc.innerHTML = step.description;

      if (step.demo) {
        this.elements.demoBox.style.display = 'block';
        this.elements.demoBox.className = 'tour-demo-box highlight-' + (step.demo.type || 'blue');
        this.elements.demoTitle.innerHTML = step.demo.title || '💡 Como funciona:';
        
        var listHtml = '';
        (step.demo.items || []).forEach(function (item) {
          listHtml += '<li>' + item + '</li>';
        });
        this.elements.demoList.innerHTML = listHtml;
      } else {
        this.elements.demoBox.style.display = 'none';
      }

      this.elements.btnPrev.style.visibility = (index === 0) ? 'hidden' : 'visible';
      if (index === this.steps.length - 1) {
        this.elements.btnNext.textContent = 'Começar! ✓';
      } else {
        this.elements.btnNext.textContent = 'Continuar ›';
      }

      var dotsHtml = '';
      for (var i = 0; i < this.steps.length; i++) {
        dotsHtml += '<div class="tour-dot ' + (i === index ? 'active' : '') + '"></div>';
      }
      this.elements.dots.innerHTML = dotsHtml;

      var self = this;
      setTimeout(function () {
        self.updatePosition();
      }, 50);
    },

    updatePosition: function () {
      var step = this.steps[this.currentStep];
      if (!step) return;

      var targetEl = document.querySelector(step.target);
      if (!targetEl || targetEl.offsetParent === null) {
        if (step.fallbackTarget) {
          targetEl = document.querySelector(step.fallbackTarget);
        }
      }

      var spotlight = this.elements.spotlight;
      var card = this.elements.card;

      var vw = window.innerWidth;
      var vh = window.innerHeight;

      if (!targetEl || targetEl.offsetParent === null) {
        spotlight.style.display = 'none';
        card.style.top = Math.max(20, (vh - card.offsetHeight) / 2) + 'px';
        card.style.left = Math.max(10, (vw - card.offsetWidth) / 2) + 'px';
        return;
      }

      spotlight.style.display = 'block';

      // Rola elemento para visão
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      var rect = targetEl.getBoundingClientRect();
      var pad = 6;

      // Coordenadas do Spotlight
      var spotTop = Math.max(0, rect.top - pad);
      var spotLeft = Math.max(0, rect.left - pad);
      var spotWidth = Math.min(vw, rect.width + (pad * 2));
      var spotHeight = Math.min(vh, rect.height + (pad * 2));

      spotlight.style.top = spotTop + 'px';
      spotlight.style.left = spotLeft + 'px';
      spotlight.style.width = spotWidth + 'px';
      spotlight.style.height = spotHeight + 'px';

      // Posicionamento inteligente do Card
      var cardWidth = card.offsetWidth || 400;
      var cardHeight = card.offsetHeight || 300;

      var spaceBelow = vh - (spotTop + spotHeight + 15);
      var spaceAbove = spotTop - 15;

      var cardTop, cardLeft;

      if (spaceBelow >= cardHeight || spaceBelow >= spaceAbove) {
        cardTop = spotTop + spotHeight + 12;
      } else {
        cardTop = Math.max(15, spotTop - cardHeight - 12);
      }

      cardLeft = spotLeft + (spotWidth / 2) - (cardWidth / 2);
      if (cardLeft + cardWidth > vw - 15) {
        cardLeft = vw - cardWidth - 15;
      }
      if (cardLeft < 15) {
        cardLeft = 15;
      }

      if (vw <= 640) {
        cardLeft = (vw * 0.03);
      }

      if (cardTop + cardHeight > vh - 15) {
        cardTop = Math.max(15, vh - cardHeight - 15);
      }

      card.style.top = cardTop + 'px';
      card.style.left = cardLeft + 'px';
    }
  };

  window.CantaAiTour = CantaAiTour;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      CantaAiTour.init();
    });
  } else {
    CantaAiTour.init();
  }

})(window, document);
