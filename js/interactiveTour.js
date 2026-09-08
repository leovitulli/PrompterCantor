/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANTAAÍ PRO — TOUR INTERATIVO COM CONSCIÊNCIA DE TELA (SCREEN-AWARE ENGINE)
 * ═══════════════════════════════════════════════════════════════════════════
 * Características:
 * - Leitura real da tela: só aponta e explica o que REALMENTE está visível
 * - Transições reais guiadas:
 *   * Home (Repertórios & Busca)
 *   * Abre o Repertório de verdade para mostrar as ferramentas e setinhas ▲ ▼
 *   * Abre o Prompter de verdade para mostrar a transposição de Tom e Rolagem
 *   * Retorna para a Home ao concluir ou fechar
 * - Foco 100% cristalino (Spotlight sem blur, elemento limpo e brilhante)
 * - Textos leves, curtos, espaçados e divertidos de ler
 * - Desbloqueio imediato da tela em qualquer cancelamento
 */

(function (window, document) {
  'use strict';

  var STORAGE_KEY = 'cantaai_tour_seen_v5';

  var CantaAiTour = {
    currentStep: 0,
    isOpen: false,
    elements: {},
    tourOpenedRepertoire: false,
    tourOpenedPrompter: false,

    // ── 9 PASSOS COM CONSCIÊNCIA E TRANSIÇÕES REAIS DE TELA ──
    steps: [
      // ── PASSO 1: BOAS-VINDAS (TELA: HOME) ──
      {
        requiredView: 'home',
        target: '#btnGoHome',
        fallbackTarget: '#appHeader',
        title: 'Bora começar? 🎤✨',
        description: 'Bem-vindo ao <strong>CantaAí PRO</strong>! Seu teleprompter inteligente para ensaios e shows. Celular, tablet ou PC: tudo funciona <strong>100% offline no palco</strong> sem depender de internet!',
        demo: {
          title: '⚡ O que vamos ver juntos na tela:',
          items: [
            'Como navegar nos seus <strong>repertórios e pastas</strong>',
            'Como <strong>organizar a ordem</strong> das músicas do show',
            'Como <strong>mudar o tom em 1 clique</strong> e ler no palco'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 2: BUSCA INSTANTÂNEA (TELA: HOME) ──
      {
        requiredView: 'home',
        target: '#searchInput',
        fallbackTarget: '#appHeader',
        title: 'Busca Rápida de Músicas 🔍',
        description: 'Digite qualquer palavra do título, artista ou trecho da letra para localizar a música na hora em todos os seus repertórios.',
        demo: {
          title: '🚀 Na hora do improviso:',
          items: [
            'Encontra qualquer música em milissegundos',
            '1 toque no resultado abre a cifra pronta pra cantar'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 3: PASTAS DE REPERTÓRIOS (TELA: HOME) ──
      {
        requiredView: 'home',
        target: '.repertoire-card',
        fallbackTarget: '#repertoiresList',
        title: 'Suas Pastas & Shows 📂',
        description: 'Cada card na sua tela é uma pasta temática (ex: <em>Sertanejo, Pop Rock, Casamento</em>). Todas as suas apresentações organizadas!',
        demo: {
          title: '🎛️ Tudo direto no card:',
          items: [
            'Use as setinhas <strong>◀ e ▶</strong> no topo para colocar o show da semana na frente',
            'Toque em <strong>✏️ Renomear</strong> para alterar o nome da pasta quando quiser',
            'Toque em <strong>🎵 Ver Músicas</strong> para abrir o repertório'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 4: O BOTÃO + ADICIONAR (TELA: HOME) ──
      {
        requiredView: 'home',
        target: '#btnDropdownAdd',
        title: 'Alimentar seu Repertório ➕',
        description: 'É aqui no botão azul <strong>+ Adicionar</strong> que você coloca novas músicas no CantaAí PRO. Veja as opções:',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        onLeave: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.add('hidden');
        },
        demo: {
          title: '📋 Como você pode adicionar:',
          items: [
            '<strong>✏️ Criar Música Manual:</strong> Cole letras do Cifra Club ou Letras no campo <em>"Letra e Cifra"</em> (o app reconhece os acordes sozinho!)',
            '<strong>📄 Importar Arquivos:</strong> Puxe arquivos Word (.docx), PDF e áudios do aparelho',
            '<strong>☁️ Google Drive:</strong> Conecte sua nuvem e baixe pastas completas'
          ],
          type: 'gold'
        }
      },

      // ── PASSO 5: FERRAMENTAS DO REPERTÓRIO (TELA: REPERTÓRIO) ──
      {
        requiredView: 'repertoire',
        target: '.rsv-actions',
        fallbackTarget: '#btnRsvSortAZ',
        title: 'Ferramentas do Repertório 🛠️',
        description: 'Abrimos o repertório para você ver! No topo da lista você tem ferramentas práticas para o show:',
        demo: {
          title: '⚡ Recursos com 1 Clique:',
          items: [
            '<strong>🔤 Ordem A-Z:</strong> Organiza todas as músicas em ordem alfabética na hora',
            '<strong>🧹 Limpar Duplicadas:</strong> Remove músicas repetidas importadas por engano',
            '<strong>🖨️ Imprimir Setlist:</strong> Gera a tabela do show com os tons para a banda e o técnico!'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 6: ORDEM DAS MÚSICAS NO SHOW (TELA: REPERTÓRIO) ──
      {
        requiredView: 'repertoire',
        target: '.song-list-row .song-row-actions',
        fallbackTarget: '.song-list-row',
        title: 'Sequência do Palco (▲ e ▼) 🎵',
        description: 'Na lista de músicas, você comanda a ordem exata em que vai cantar no show:',
        demo: {
          title: '📋 Como organizar o setlist:',
          items: [
            'Clique na setinha <strong>▲ (Subir)</strong> para antecipar a música na apresentação',
            'Clique na setinha <strong>▼ (Descer)</strong> para cantar mais tarde',
            'Ou segure no ícone <strong>⋮⋮</strong> e arraste com o dedo no celular ou tablet!'
          ],
          type: 'gold'
        }
      },

      // ── PASSO 7: MUDANÇA DE TONS EM 1 CLIQUE (TELA: PROMPTER) ──
      {
        requiredView: 'prompter',
        target: '#prompterKeySelect',
        fallbackTarget: '#prompterHeader',
        title: 'Mude o Tom em 1 Clique! 🎸',
        description: 'Abrimos a música no Teleprompter! O cantor ou convidado da noite precisa mudar o tom da música?',
        demo: {
          title: '🎵 Harmonia Automática:',
          items: [
            'Toque no seletor <strong>Tom: E ▾</strong> e escolha qualquer tom',
            'O CantaAí <strong>transpõe todos os acordes da letra inteira na hora</strong> sem desafinar!',
            'O tom original de gravação fica gravado para você voltar sempre que quiser'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 8: CONTROLES DE PALCO & ROLAGEM (TELA: PROMPTER) ──
      {
        requiredView: 'prompter',
        target: '.prompter-controls',
        fallbackTarget: '#btnToggleScroll',
        title: 'Rolagem Suave & Palco 🚀',
        description: 'Aqui na barra de controles você opera o teleprompter com conforto durante a apresentação:',
        demo: {
          title: '📱 Com o Polegar no Pedestal:',
          items: [
            '<strong>▶ 1 Toque na tela:</strong> Inicia ou pausa a descida suave do texto',
            '<strong>[-] 3x [+]:</strong> Ajuste a velocidade no polegar sem parar de tocar',
            '<strong>[A+] Fonte:</strong> Aumente o tamanho da letra para enxergar de longe',
            '<strong>🛡️ Tela Ativa:</strong> O CantaAí nunca deixa a tela do aparelho apagar durante o show'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 9: FINALIZAÇÃO & SUPORTE (TELA: HOME) ──
      {
        requiredView: 'home',
        target: '#btnHeaderNotifications',
        fallbackTarget: '#userProfileDropdownContainer',
        title: 'Tudo Pronto pro Show! 🌟',
        description: 'Voltamos para a tela inicial! Viu como o CantaAí PRO é prático e completo?',
        demo: {
          title: '💬 Dúvidas ou Ajuda:',
          items: [
            'Toque no <strong>Sininho 🔔</strong> para comunicados e chat direto com nossa equipe',
            'Para rever este tour a qualquer hora, toque no seu <strong>Perfil 🎤</strong> no topo',
            'Arrebenta no show e boa música! 🎸🎤'
          ],
          type: 'green'
        }
      }
    ],

    // ── GESTÃO INTELIGENTE DE TRANSIÇÃO DE TELAS ──
    navigateScreenForStep: function (stepIndex, callback) {
      var step = this.steps[stepIndex];
      if (!step) {
        if (callback) callback();
        return;
      }

      var self = this;
      var required = step.requiredView || 'home';

      // 1. Quer tela HOME
      if (required === 'home') {
        var isPrompterOpen = document.getElementById('prompterView') && !document.getElementById('prompterView').classList.contains('hidden') && document.getElementById('prompterView').style.display !== 'none';
        var isRepertoireOpen = document.getElementById('repertoireSongsView') && !document.getElementById('repertoireSongsView').classList.contains('hidden');

        if (isPrompterOpen || isRepertoireOpen) {
          if (window.CantaApp && typeof window.CantaApp.closePrompterView === 'function') {
            window.CantaApp.closePrompterView();
          }
          if (window.CantaApp && typeof window.CantaApp.closeRepertoireSongsView === 'function') {
            window.CantaApp.closeRepertoireSongsView();
          } else {
            var btnBack = document.getElementById('btnRsvBack');
            if (btnBack) btnBack.click();
          }
          setTimeout(function () { if (callback) callback(); }, 160);
          return;
        }
        if (callback) callback();
        return;
      }

      // 2. Quer tela de REPERTÓRIO
      if (required === 'repertoire') {
        var isPrompterOpen = document.getElementById('prompterView') && !document.getElementById('prompterView').classList.contains('hidden') && document.getElementById('prompterView').style.display !== 'none';
        if (isPrompterOpen) {
          if (window.CantaApp && typeof window.CantaApp.closePrompterView === 'function') {
            window.CantaApp.closePrompterView();
          } else {
            var btnCloseP = document.getElementById('btnClosePrompter');
            if (btnCloseP) btnCloseP.click();
          }
          setTimeout(function () { if (callback) callback(); }, 160);
          return;
        }

        var isRepertoireOpen = document.getElementById('repertoireSongsView') && !document.getElementById('repertoireSongsView').classList.contains('hidden');
        if (!isRepertoireOpen) {
          self.tourOpenedRepertoire = true;
          // Abre o primeiro repertório disponível
          var firstRepBtn = document.querySelector('.btn-open-rep');
          if (firstRepBtn) {
            firstRepBtn.click();
          } else if (window.CantaApp && typeof window.CantaApp.getState === 'function') {
            var st = window.CantaApp.getState();
            if (st && st.repertoires && st.repertoires.length > 0) {
              window.CantaApp.openRepertoireSongs(st.repertoires[0].id);
            }
          }
          setTimeout(function () { if (callback) callback(); }, 200);
          return;
        }
        if (callback) callback();
        return;
      }

      // 3. Quer tela do PROMPTER
      if (required === 'prompter') {
        var isPrompterOpen = document.getElementById('prompterView') && !document.getElementById('prompterView').classList.contains('hidden') && document.getElementById('prompterView').style.display !== 'none';
        if (!isPrompterOpen) {
          self.tourOpenedPrompter = true;
          // Abre a primeira música disponível
          var firstSongRow = document.querySelector('.song-list-row');
          if (firstSongRow) {
            firstSongRow.click();
          } else if (window.CantaApp && typeof window.CantaApp.getState === 'function') {
            var st = window.CantaApp.getState();
            if (st && st.currentRepertoireSongs && st.currentRepertoireSongs.length > 0) {
              window.CantaApp.openPrompterView(st.currentRepertoireSongs[0]);
            }
          }
          setTimeout(function () { if (callback) callback(); }, 220);
          return;
        }
        if (callback) callback();
        return;
      }

      if (callback) callback();
    },

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
      this.goToStep(this.currentStep);
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
      var self = this;

      // Navega a tela para a visão correta ANTES de renderizar o spotlight
      this.navigateScreenForStep(this.currentStep, function () {
        self.renderStep(self.currentStep);
      });
    },

    close: function (markSeen) {
      var currentStepObj = this.steps[this.currentStep];
      if (currentStepObj && typeof currentStepObj.onLeave === 'function') {
        currentStepObj.onLeave();
      }

      // Fecha menus suspensos
      var menu = document.getElementById('dropdownAddMenu');
      if (menu) menu.classList.add('hidden');

      // Se o tour abriu o prompter, fecha e restaura
      var prompterView = document.getElementById('prompterView');
      if (prompterView && !prompterView.classList.contains('hidden') && prompterView.style.display !== 'none') {
        if (window.CantaApp && typeof window.CantaApp.closePrompterView === 'function') {
          window.CantaApp.closePrompterView();
        }
      }

      // Se o tour abriu a tela de músicas e o usuário está saindo, retorna à Home
      if (this.tourOpenedRepertoire || this.tourOpenedPrompter) {
        if (window.CantaApp && typeof window.CantaApp.closeRepertoireSongsView === 'function') {
          window.CantaApp.closeRepertoireSongsView();
        }
      }

      this.isOpen = false;
      this.tourOpenedRepertoire = false;
      this.tourOpenedPrompter = false;
      
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

      // Rola elemento para a visão de forma suave
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      var rect = targetEl.getBoundingClientRect();
      var pad = 6;

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
