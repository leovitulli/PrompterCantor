/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANTAAÍ PRO — TOUR INTERATIVO GUIADO (SPOTLIGHT WALKTHROUGH ENGINE)
 * ═══════════════════════════════════════════════════════════════════════════
 * Características:
 * - Foco inteligente (Spotlight) com recorte nos elementos reais da interface
 * - Explicações aprofundadas com foco em:
 *   1. O Repertório como um todo (criação, ordem das pastas, renomear, excluir)
 *   2. Como copiar cifras de sites (Cifra Club, Letras) e colar no devido lugar
 *   3. Como importar arquivos locais (.docx Word, .pdf, .txt e áudios)
 *   4. Como importar pastas completas do Google Drive
 *   5. Como mudar a ordem das músicas no repertório (▲ e ▼, arrastar, A-Z, duplicadas, setlist)
 *   6. Mudança de tons em 1 clique (transposição harmônica completa de todos os acordes)
 *   7. Teleprompter de palco (rolagem contínua, velocidade, tamanho da fonte, tela ativa)
 *   8. Busca global, notificações e suporte com chat interativo
 * - 100% responsivo para smartphone, tablet e PC
 * - Opção "Não mostrar novamente" e botão para reabrir a qualquer momento
 */

(function (window, document) {
  'use strict';

  var STORAGE_KEY = 'cantaai_tour_seen_v3';

  var CantaAiTour = {
    currentStep: 0,
    isOpen: false,
    elements: {},

    steps: [
      // ── PASSO 1: BOAS-VINDAS & VISÃO GERAL ──
      {
        target: '#btnGoHome',
        fallbackTarget: '#appHeader',
        title: 'Bem-vindo ao CantaAí PRO! 🎤',
        description: 'Seu sistema definitivo de teleprompter inteligente e gestão de repertórios para ensaios e shows ao vivo. Criado sob medida para funcionar com fluidez no seu <strong>celular, tablet ou computador</strong>, operando <strong>100% offline no palco</strong> sem depender de internet!',
        demo: {
          title: '⚡ O que você vai dominar neste guia interativo:',
          items: [
            'Como organizar seus <strong>Repertórios como um todo</strong> e ordenar suas pastas de shows',
            'Como copiar cifras de <strong>qualquer site da internet</strong> e colar no lugar correto',
            'Como <strong>mudar a ordem das músicas</strong> dentro do repertório na hora do show',
            'Como fazer a <strong>mudança de tom em 1 clique</strong> com transposição automática de acordes',
            'Como controlar o <strong>teleprompter de palco</strong> (rolagem contínua, velocidade e tamanho de fonte)'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 2: O REPERTÓRIO COMO UM TODO ──
      {
        target: '#repertoireGrid',
        fallbackTarget: '#tabRepertoire',
        title: '📂 O Repertório Como um Todo',
        description: 'Os repertórios são pastas temáticas onde você organiza suas apresentações por <strong>estilos musicais</strong> (ex: <em>Sertanejo, Pop Rock, Samba</em>) ou por <strong>eventos específicos</strong> (ex: <em>Show de Sexta, Casamento, Ensaio</em>).',
        demo: {
          title: '🎛️ Tudo o que você pode fazer com seus Repertórios:',
          items: [
            '<strong>🎵 Ver Músicas:</strong> Toque no botão azul para abrir a lista completa de músicas daquele repertório.',
            '<strong>Mudar a Ordem dos Repertórios:</strong> Segure o ícone <strong>⋮⋮</strong> e arraste, ou clique nas setinhas <strong>◀ e ▶</strong> no topo do card para colocar os repertórios do próximo show na frente.',
            '<strong>✏️ Renomear:</strong> Clique em <em>Renomear</em> para alterar o nome da pasta a qualquer momento sem perder nenhuma música.',
            '<strong>🖨️ Imprimir Repertório:</strong> Gera um resumo com as músicas daquela pasta.',
            '<strong>🗑️ Excluir:</strong> Permite apagar repertórios antigos com confirmação de segurança.'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 3: O BOTÃO ADICIONAR (CORAÇÃO DO SISTEMA) ──
      {
        target: '#btnDropdownAdd',
        title: '⚡ O Botão + Adicionar: Entrada de Músicas',
        description: 'Este botão azul no topo é o canal principal para alimentar o aplicativo. Ele reúne as 4 formas de colocar repertórios e cifras no CantaAí PRO:',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        demo: {
          title: '📋 4 Formas de Adicionar Conteúdo:',
          items: [
            '<strong>➕ Criar Repertório:</strong> Cria uma pasta vazia para você colocar novas músicas.',
            '<strong>✏️ Criar Música Manual:</strong> Onde você cola letras copiadas de qualquer site de cifras.',
            '<strong>📄 Importar Arquivos (Local):</strong> Carrega arquivos Word (.docx), PDF (.pdf) e Texto (.txt) do seu aparelho.',
            '<strong>☁️ Importar do Google Drive:</strong> Conecta com sua nuvem e baixa pastas inteiras de cifras.'
          ],
          type: 'cyan'
        }
      },

      // ── PASSO 4: COPIAR DE QUALQUER SITE E COLAR (FOCO MÁXIMO) ──
      {
        target: '#btnMenuNewSong',
        fallbackTarget: '#btnDropdownAdd',
        title: '🔥 Como Copiar de Sites e Colar Certo',
        description: 'Esta é a forma mais rápida de adicionar qualquer música da internet (de sites como <em>Cifra Club, Letras.mus.br, Cifras.com.br</em>):',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        demo: {
          title: '💡 Passo a Passo Prático (Copiar & Colar):',
          items: [
            '<strong>1. No site de cifras:</strong> Selecione o texto completo com a letra e os acordes e copie (no PC aperte <code>Ctrl+C</code>; no celular ou tablet, segure o dedo sobre o texto e toque em <strong>Copiar</strong>).',
            '<strong>2. No CantaAí PRO:</strong> Clique no botão azul <strong>+ Adicionar ➔ Criar Música Manual</strong>.',
            '<strong>3. Onde Colar:</strong> Role até o campo grande chamado <strong>"Letra e Cifra"</strong> e cole o conteúdo (<code>Ctrl+V</code> ou toque em <strong>Colar</strong>).',
            '<strong>4. Reconhecimento Automático:</strong> O CantaAí PRO identifica os acordes sozinho, cria as cápsulas azuis destacadas e separa os versos perfeitamente!',
            '<strong>5. Tom & Vídeo Guia:</strong> Escolha o <em>Tom Original</em> da gravação e, se quiser, cole o link do YouTube para ensaiar junto com o áudio oficial.',
            '<strong>6. Salvar:</strong> Clique em <strong>Salvar Música</strong> e ela entra pronta para o palco no repertório selecionado.'
          ],
          type: 'gold'
        }
      },

      // ── PASSO 5: IMPORTAR ARQUIVOS (.DOCX, .PDF, .TXT) ──
      {
        target: '#btnMenuImportLocal',
        fallbackTarget: '#btnDropdownAdd',
        title: '📂 Como Importar Arquivos do Aparelho',
        description: 'Se você já tem letras e cifras salvas em arquivos no seu celular, tablet ou computador, pode importar dezenas de músicas de uma vez só:',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        demo: {
          title: '⚡ Importação em Lote Descomplicada:',
          items: [
            'Clique em <strong>+ Adicionar ➔ Importar Arquivos (Local)</strong>.',
            'Digite o nome do repertório (ex: <em>Show no Barzinho</em> ou <em>Repertório 2026</em>).',
            'Selecione seus arquivos em <strong>Word (.docx), PDF (.pdf) ou Bloco de Notas (.txt)</strong>.',
            '<strong>🎵 Pareamento de Áudio:</strong> Se tiver áudios (.mp3 ou .m4a) com o mesmo nome das cifras, o sistema conecta o áudio guia automaticamente!',
            'Clique em <strong>Salvar Repertório</strong> e todas as músicas ficam salvas no cache do aparelho para acesso 100% offline.'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 6: IMPORTAR DO GOOGLE DRIVE ──
      {
        target: '#btnMenuImportDrive',
        fallbackTarget: '#btnDropdownAdd',
        title: '☁️ Como Importar do Google Drive',
        description: 'Se você ou sua banda guardam os arquivos de cifras em pastas na nuvem do Google Drive, o CantaAí PRO sincroniza direto:',
        onEnter: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.remove('hidden');
        },
        onLeave: function () {
          var menu = document.getElementById('dropdownAddMenu');
          if (menu) menu.classList.add('hidden');
        },
        demo: {
          title: '🚀 Sincronização Direta com o Drive:',
          items: [
            'Clique em <strong>+ Adicionar ➔ Importar do Google Drive</strong>.',
            'Toque em <strong>🔑 Conectar Minha Conta Google</strong> (autorização segura em 1 toque).',
            'Cole o link da sua pasta do Drive onde estão os arquivos de cifra.',
            'O sistema lista todos os arquivos encontrados: selecione as músicas desejadas e clique em <strong>⬇️ Importar Selecionados</strong>!'
          ],
          type: 'cyan'
        }
      },

      // ── PASSO 7: MUDAR DE LUGAR NO REPERTÓRIO & SEQUÊNCIA DO SHOW ──
      {
        target: '#searchInput',
        fallbackTarget: '#appHeader',
        title: '🎵 Mudar de Lugar no Repertório (Ordem do Show)',
        description: 'Ao abrir qualquer repertório, você tem controle total para planejar a sequência exata em que vai cantar as músicas no palco:',
        demo: {
          title: '📋 Como Mudar a Posição das Músicas & Ferramentas:',
          items: [
            '<strong>Mudar de Lugar (▲ Subir e ▼ Descer):</strong> No lado direito de cada música, clique na setinha <strong>▲</strong> para subir uma posição ou <strong>▼</strong> para descer. A numeração (01, 02, 03...) atualiza na hora!',
            '<strong>Arrastar e Soltar:</strong> Segure o ícone <strong>⋮⋮</strong> de qualquer música e arraste para cima ou para baixo para reposicioná-la com o dedo no celular ou com o mouse.',
            '<strong>🔤 Ordem A-Z:</strong> Botão no topo que organiza todas as músicas em ordem alfabética instantaneamente.',
            '<strong>🧹 Limpar Duplicadas:</strong> Apaga músicas repetidas que foram importadas por engano com 1 clique.',
            '<strong>🖨️ Imprimir Setlist:</strong> Gera uma tabela limpa e profissional com número, título e tom de cada música, pronta para imprimir ou mandar em PDF no WhatsApp da banda e dos técnicos.'
          ],
          type: 'gold'
        }
      },

      // ── PASSO 8: MUDANÇAS DE TONS EM 1 CLIQUE ──
      {
        target: '#btnToggleTheme',
        fallbackTarget: '#appHeader',
        title: '🎸 Mudança de Tons em 1 Clique (Harmonia Inteligente)',
        description: 'Precisa mudar o tom porque o cantor da noite tem uma extensão vocal diferente ou porque um convidado vai subir no palco? O CantaAí PRO faz a transposição harmônica na hora:',
        demo: {
          title: '🎵 Como Funciona a Mudança de Tons:',
          items: [
            '<strong>Seletor de Tom no Topo:</strong> Ao abrir a música no teleprompter, toque no seletor de tom (ex: <code>Tom: G ▾</code>).',
            '<strong>Transposição Automática:</strong> Escolha qualquer tom maior ou menor (C, C#, D, Eb, E, F...). O algoritmo transpõe <strong>todos os acordes</strong> da música inteira em 0 milissegundos!',
            '<strong>Acordes Complexos Preservados:</strong> O sistema recalcula com precisão tétrades, nonas, acordes diminutos e baixos invertidos (como <code>G/B ➔ A/C#</code>).',
            '<strong>Tom Original Salvo:</strong> O tom original de gravação nunca é perdido, permitindo que você volte ao tom padrão com apenas 1 clique.'
          ],
          type: 'cyan'
        }
      },

      // ── PASSO 9: NO PALCO — TELEPROMPTER, ROLAGEM & FONTE ──
      {
        target: '#appHeader',
        title: '🎤 No Palco: Teleprompter com Rolagem Contínua',
        description: 'Ao clicar em cima de qualquer música, a tela entra no modo de leitura de alta performance, sem distrações e com fundo preto anti-reflexo:',
        demo: {
          title: '📱 Recursos Essenciais para a Hora do Show:',
          items: [
            '<strong>▶ Rolagem Contínua:</strong> 1 toque na tela do celular/tablet (ou na barra de <strong>Espaço</strong>) inicia ou pausa a descida suave do texto.',
            '<strong>Velocidade no Polegar:</strong> Ajuste a velocidade de rolagem pelos botões <strong>[-] 3x [+]</strong> sem parar de tocar.',
            '<strong>Tamanho da Fonte:</strong> Aumente ou diminua a letra com os botões <strong>[A-] 32px [A+]</strong> para enxergar com nitidez mesmo a 2 metros de distância.',
            '<strong>Pedal de Virada & Setas:</strong> Use as setas <strong>‹ Anterior</strong> e <strong>Próxima ›</strong> (ou pedal bluetooth) para trocar de música sem encostar na tela.',
            '<strong>🛡️ Tela Sempre Ativa:</strong> O modo Wake Lock impede que a tela do celular ou tablet apague durante a música.'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 10: BUSCA GLOBAL INSTANTÂNEA ──
      {
        target: '#searchInput',
        fallbackTarget: '#appHeader',
        title: '🔍 Busca Global Instantânea',
        description: 'Quando alguém no show pede uma música de surpresa, você não perde tempo procurando:',
        demo: {
          title: '⚡ Encontre Qualquer Música em Segundos:',
          items: [
            'Digite qualquer palavra do <strong>título</strong>, do <strong>artista</strong> ou até um <strong>trecho da letra</strong> no campo de busca.',
            'O sistema varre todos os seus repertórios e mostra os resultados em tempo real.',
            '1 clique em cima do resultado e o teleprompter abre imediatamente com a cifra pronta para tocar!'
          ],
          type: 'blue'
        }
      },

      // ── PASSO 11: NOTIFICAÇÕES & SUPORTE COM CHAT ──
      {
        target: '#btnHeaderNotifications',
        fallbackTarget: '#appHeader',
        title: '🔔 Notificações, Suporte & Rever o Guia',
        description: 'Surgiu alguma dúvida antes de entrar no palco ou quer sugestões de configuração? Nossa equipe está disponível no chat:',
        demo: {
          title: '💬 Canais de Ajuda & Atendimento:',
          items: [
            '<strong>Sininho no Topo:</strong> Veja novidades do sistema, comunicados e respostas do suporte.',
            '<strong>Chat em Tempo Real:</strong> Abra o sininho e clique em <em>Central Completa & Suporte</em> para falar direto com os atendentes e enviar prints pelo clipe 📎.',
            '<strong>Como rever este Guia:</strong> A qualquer momento, clique no seu avatar (🎤 no canto superior direito) e selecione <strong>📖 Tour Interativo do App</strong>!'
          ],
          type: 'gold'
        }
      }
    ],

    // ── INICIALIZAÇÃO DO MÓDULO ──
    init: function () {
      this.createTourDOM();
      this.bindEvents();

      // Inicia automaticamente no primeiro acesso após login se ainda não foi visto
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
            '<span class="tour-step-badge" id="tourStepBadge">Passo 1 de 11</span>' +
            '<div class="tour-progress-dots" id="tourProgressDots"></div>' +
            '<button type="button" class="tour-btn-close" id="btnTourClose" title="Fechar guia">✕</button>' +
          '</div>' +
          '<div class="tour-card-body">' +
            '<h3 class="tour-title" id="tourTitle">Título</h3>' +
            '<p class="tour-desc" id="tourDesc">Descrição</p>' +
            '<div class="tour-demo-box highlight-blue" id="tourDemoBox">' +
              '<div class="tour-demo-title" id="tourDemoTitle">💡 Como fazer:</div>' +
              '<ul class="tour-steps-mini" id="tourDemoList"></ul>' +
            '</div>' +
          '</div>' +
          '<div class="tour-card-footer">' +
            '<div class="tour-footer-actions">' +
              '<button type="button" class="tour-btn tour-btn-skip" id="btnTourSkip">Pular Guia</button>' +
              '<div style="display: flex; gap: 8px;">' +
                '<button type="button" class="tour-btn tour-btn-prev" id="btnTourPrev">‹ Anterior</button>' +
                '<button type="button" class="tour-btn tour-btn-next" id="btnTourNext">Próximo ›</button>' +
              '</div>' +
            '</div>' +
            '<label class="tour-dont-show-wrap">' +
              '<input type="checkbox" id="chkTourDontShowAgain">' +
              '<span>Não mostrar este guia automaticamente no início</span>' +
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
        this.elements.btnNext.addEventListener('click', function () {
          self.next();
        });
      }

      if (this.elements.btnPrev) {
        this.elements.btnPrev.addEventListener('click', function () {
          self.prev();
        });
      }

      if (this.elements.btnSkip) {
        this.elements.btnSkip.addEventListener('click', function () {
          self.close(true);
        });
      }

      if (this.elements.btnClose) {
        this.elements.btnClose.addEventListener('click', function () {
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

      // Teclas de navegação (Esc, setas)
      window.addEventListener('keydown', function (e) {
        if (!self.isOpen) return;
        if (e.key === 'Escape') self.close(false);
        else if (e.key === 'ArrowRight') self.next();
        else if (e.key === 'ArrowLeft') self.prev();
      });

      // Recalcula spotlight ao redimensionar tela ou rotacionar smartphone
      window.addEventListener('resize', function () {
        if (self.isOpen) self.updatePosition();
      });
      window.addEventListener('orientationchange', function () {
        if (self.isOpen) {
          setTimeout(function () { self.updatePosition(); }, 200);
        }
      });
    },

    // ── MÉTODOS DE CONTROLE DO TOUR ──
    start: function (stepIndex) {
      this.isOpen = true;
      this.currentStep = (typeof stepIndex === 'number') ? stepIndex : 0;
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

      // Fecha menus suspensos auxiliares
      var menu = document.getElementById('dropdownAddMenu');
      if (menu) menu.classList.add('hidden');

      this.isOpen = false;
      this.elements.overlay.classList.remove('active');

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

      // Atualiza textos
      this.elements.badge.textContent = 'Passo ' + (index + 1) + ' de ' + this.steps.length;
      this.elements.title.innerHTML = step.title;
      this.elements.desc.innerHTML = step.description;

      // Atualiza caixa de demonstração visual
      if (step.demo) {
        this.elements.demoBox.style.display = 'block';
        this.elements.demoBox.className = 'tour-demo-box highlight-' + (step.demo.type || 'blue');
        this.elements.demoTitle.innerHTML = step.demo.title || '💡 Como fazer:';
        
        var listHtml = '';
        (step.demo.items || []).forEach(function (item) {
          listHtml += '<li>' + item + '</li>';
        });
        this.elements.demoList.innerHTML = listHtml;
      } else {
        this.elements.demoBox.style.display = 'none';
      }

      // Atualiza botões
      this.elements.btnPrev.style.visibility = (index === 0) ? 'hidden' : 'visible';
      if (index === this.steps.length - 1) {
        this.elements.btnNext.textContent = 'Concluir Guia ✓';
      } else {
        this.elements.btnNext.textContent = 'Próximo ›';
      }

      // Renderiza os pontinhos de progresso
      var dotsHtml = '';
      for (var i = 0; i < this.steps.length; i++) {
        dotsHtml += '<div class="tour-dot ' + (i === index ? 'active' : '') + '"></div>';
      }
      this.elements.dots.innerHTML = dotsHtml;

      // Posiciona spotlight e cartão
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

      // Rola suavemente o elemento para a visão se estiver fora da tela
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

      // Posicionamento inteligente do Cartão (Card)
      var cardWidth = card.offsetWidth || 430;
      var cardHeight = card.offsetHeight || 340;

      var spaceBelow = vh - (spotTop + spotHeight + 15);
      var spaceAbove = spotTop - 15;

      var cardTop, cardLeft;

      if (spaceBelow >= cardHeight || spaceBelow >= spaceAbove) {
        cardTop = spotTop + spotHeight + 14;
      } else {
        cardTop = Math.max(15, spotTop - cardHeight - 14);
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

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      CantaAiTour.init();
    });
  } else {
    CantaAiTour.init();
  }

})(window, document);
