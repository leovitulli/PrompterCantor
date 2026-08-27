/**
 * PrompterCantor - Motor do Prompter e Rolagem Automática
 * Compatível com navegadores antigos (Safari do iOS 9/10/11/12 em iPads antigos).
 */

var Prompter = {
  isScrolling: false,
  scrollSpeed: 3,
  fontSize: 32,
  animationFrameId: null,

  scrollArea: null,
  textContentEl: null,
  btnToggleScroll: null,
  scrollPlayIcon: null,
  scrollPlayText: null,
  scrollSpeedRange: null,
  scrollSpeedDisplay: null,
  fontSizeDisplay: null,

  init: function() {
    this.scrollArea = document.getElementById('prompterScrollArea');
    this.textContentEl = document.getElementById('prompterTextContent');
    this.btnToggleScroll = document.getElementById('btnToggleScroll');
    this.scrollPlayIcon = document.getElementById('scrollPlayIcon');
    this.scrollPlayText = document.getElementById('scrollPlayText');
    this.scrollSpeedRange = document.getElementById('scrollSpeedRange');
    this.scrollSpeedDisplay = document.getElementById('scrollSpeedDisplay');
    this.fontSizeDisplay = document.getElementById('fontSizeDisplay');

    // Responsividade Inteligente de Fonte Padrão:
    // Celulares: 22px-24px | Tablets/iPads: 28px-32px | Desktop: 32px
    var screenW = window.innerWidth || document.documentElement.clientWidth || 360;
    if (screenW <= 480) {
      this.fontSize = 22;
    } else if (screenW <= 768) {
      this.fontSize = 26;
    } else {
      this.fontSize = 32;
    }

    this.bindEvents();
    this.applyFontSize();
  },

  bindEvents: function() {
    var self = this;

    if (this.btnToggleScroll) {
      this.btnToggleScroll.addEventListener('click', function() { self.toggleScroll(); });
    }

    var btnSpeedFaster = document.getElementById('btnSpeedFaster');
    var btnSpeedSlower = document.getElementById('btnSpeedSlower');

    if (btnSpeedFaster) {
      btnSpeedFaster.onclick = function() { self.adjustSpeed(1); };
    }
    if (btnSpeedSlower) {
      btnSpeedSlower.onclick = function() { self.adjustSpeed(-1); };
    }

    if (this.scrollSpeedRange) {
      this.scrollSpeedRange.addEventListener('input', function(e) {
        self.scrollSpeed = parseInt(e.target.value, 10);
        if (self.scrollSpeedDisplay) {
          self.scrollSpeedDisplay.textContent = self.scrollSpeed + 'x';
        }
      });
    }

    var btnFontBigger = document.getElementById('btnFontBigger');
    var btnFontSmaller = document.getElementById('btnFontSmaller');

    if (btnFontBigger) {
      btnFontBigger.onclick = function() { self.changeFontSize(2); };
    }
    if (btnFontSmaller) {
      btnFontSmaller.onclick = function() { self.changeFontSize(-2); };
    }

    var btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
    if (btnToggleFullscreen) {
      btnToggleFullscreen.onclick = function() {
        if (!document.fullscreenElement) {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        }
      };
    }

    var btnScrollToTop = document.getElementById('btnScrollToTop');
    if (btnScrollToTop) {
      var handleTop = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        self.scrollToTop();
      };
      btnScrollToTop.addEventListener('pointerdown', handleTop, { passive: false });
      btnScrollToTop.addEventListener('touchstart', handleTop, { passive: false });
      btnScrollToTop.addEventListener('click', handleTop, { passive: false });
    }

 

    document.addEventListener('keydown', function(e) {
      // Se o evento se originou dentro de um input, textarea, select ou elemento editável, não interceptar
      var target = e.target;
      var tagName = target ? (target.tagName || '').toUpperCase() : '';
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || (target && target.isContentEditable)) {
        return;
      }

      // Se houver qualquer modal aberto na tela, não interceptar
      var openModal = document.querySelector('.modal:not(.hidden)');
      if (openModal) {
        return;
      }

      var prompterView = document.getElementById('prompterView');
      if (prompterView && prompterView.className.indexOf('hidden') === -1 && prompterView.style.display !== 'none') {
        var key = e.code || e.key || e.keyCode;
        if (key === 'Space' || key === ' ' || key === 32) {
          if (e.preventDefault) e.preventDefault();
          self.toggleScroll();
        } else if (key === 'ArrowUp' || key === 38) {
          if (e.preventDefault) e.preventDefault();
          self.adjustSpeed(1);
        } else if (key === 'ArrowDown' || key === 40) {
          if (e.preventDefault) e.preventDefault();
          self.adjustSpeed(-1);
        }
      }
    });
  },

  currentRawText: '',
  currentOriginalKey: '',
  currentDisplayKey: '',

  loadContent: function(text, currentKey, originalKey) {
    if (!this.scrollArea || !this.btnToggleScroll) {
      this.init();
    }
    this.stopScroll();
    if (this.scrollArea) this.scrollArea.scrollTop = 0;

    var cleaned = text || '';
    if (window.TextParser && typeof window.TextParser.normalizeRawInputText === 'function') {
      cleaned = window.TextParser.normalizeRawInputText(cleaned);
    }

    this.currentRawText = cleaned;
    this.currentOriginalKey = originalKey || '';
    this.currentDisplayKey = currentKey || originalKey || '';

    var displayText = this.currentRawText;
    if (window.Transposer && currentKey && originalKey && currentKey !== originalKey) {
      var dist = window.Transposer.getKeyDistance(originalKey, currentKey);
      displayText = window.Transposer.transposeText(this.currentRawText, dist);
    }

    var formattedHtml = this.formatChordsAndLyrics(displayText);
    if (this.textContentEl) this.textContentEl.innerHTML = formattedHtml;
    this.applyFontSize();
  },

  transposeTo: function(targetKey) {
    if (!this.currentRawText) return;
    var origKey = this.currentOriginalKey || this.currentDisplayKey;
    if (!origKey && window.TextParser) {
      origKey = window.TextParser.detectOriginalKey(this.currentRawText);
    }
    if (!origKey) origKey = targetKey;

    this.currentDisplayKey = targetKey;
    var displayText = this.currentRawText;

    if (window.Transposer && targetKey && origKey && targetKey !== origKey) {
      var dist = window.Transposer.getKeyDistance(origKey, targetKey);
      displayText = window.Transposer.transposeText(this.currentRawText, dist);
    }

    var formattedHtml = this.formatChordsAndLyrics(displayText);
    if (this.textContentEl) this.textContentEl.innerHTML = formattedHtml;
    this.applyFontSize();
  },

  formatChordsAndLyrics: function(text) {
    if (!text) return '<div class="lyric-line">(Sem letra informada)</div>';

    var lines = text.split('\n');
    var html = [];
    var lastWasEmpty = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) {
        if (!lastWasEmpty && html.length > 0) {
          html.push('<div class="prompter-stanza-gap"></div>');
          lastWasEmpty = true;
        }
        continue;
      }
      lastWasEmpty = false;

      // Se for linha de acordes
      if (window.TextParser && window.TextParser.isChordLine(trimmed)) {
        html.push('<div class="chord-line">' + this.escapeHtml(line) + '</div>');
      } else if (/^\[\s*(?:intro|refr[ãa]o|coro|ponte|solo|final|parte\s+[a-z0-9]|verso)\s*\]$/i.test(trimmed)) {
        html.push('<div class="prompter-section-tag">' + this.escapeHtml(trimmed) + '</div>');
      } else {
        // Se a linha tiver acordes em colchetes [Gm], [C7]
        var formattedLyric = this.escapeHtml(line).replace(/\[([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|[0-9])*(?:\/[A-G][#b]?)?)\]/g, '<span class="inline-chord">$1</span>');
        html.push('<div class="lyric-line">' + formattedLyric + '</div>');
      }
    }

    return html.join('');
  },

  escapeHtml: function(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  toggleScroll: function() {
    if (this.isScrolling) {
      this.stopScroll();
    } else {
      this.startScroll();
    }
  },

  startScroll: function() {
    if (this.isScrolling) return;
    this.isScrolling = true;
    this.updateScrollUI();
    this.step();
  },

  stopScroll: function() {
    this.isScrolling = false;
    if (this.animationFrameId) {
      if (window.cancelAnimationFrame) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = null;
    }
    this.updateScrollUI();
  },

  step: function() {
    var self = this;
    if (!this.isScrolling) return;

    var pixelsPerFrame = this.scrollSpeed * 0.4;
    if (this.scrollArea) {
      this.scrollArea.scrollTop += pixelsPerFrame;
      var maxScroll = this.scrollArea.scrollHeight - this.scrollArea.clientHeight;
      if (this.scrollArea.scrollTop >= maxScroll - 5) {
        this.stopScroll();
        return;
      }
    }

    var reqAnim = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function(cb) { return setTimeout(cb, 16); };
    this.animationFrameId = reqAnim(function() { self.step(); });
  },

  updateScrollUI: function() {
    if (this.scrollPlayIcon && this.scrollPlayText) {
      if (this.isScrolling) {
        this.scrollPlayIcon.textContent = '⏸';
        this.scrollPlayText.textContent = 'Pausar Rolagem';
        if (this.btnToggleScroll) this.btnToggleScroll.style.backgroundColor = '#ffab00';
      } else {
        this.scrollPlayIcon.textContent = '▶';
        this.scrollPlayText.textContent = 'Iniciar Rolagem';
        if (this.btnToggleScroll) this.btnToggleScroll.style.backgroundColor = 'var(--accent-color)';
      }
    }
  },

  changeFontSize: function(delta) {
    this.fontSize = Math.max(18, Math.min(72, this.fontSize + delta));
    this.applyFontSize();
  },

  applyFontSize: function() {
    if (this.textContentEl) {
      this.textContentEl.style.fontSize = this.fontSize + 'px';
    }
    if (this.fontSizeDisplay) {
      this.fontSizeDisplay.textContent = this.fontSize + 'px';
    }
  },

  adjustSpeed: function(delta) {
    this.scrollSpeed = Math.max(1, Math.min(10, this.scrollSpeed + delta));
    if (this.scrollSpeedRange) {
      this.scrollSpeedRange.value = this.scrollSpeed;
    }
    if (this.scrollSpeedDisplay) {
      this.scrollSpeedDisplay.textContent = this.scrollSpeed + 'x';
    }
  },

  scrollToTop: function() {
    var area = this.scrollArea || document.getElementById('prompterScrollArea');
    var wasScrolling = this.isScrolling;

    if (this.animationFrameId) {
      if (window.cancelAnimationFrame) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = null;
    }

    if (area) {
      var origBehavior = area.style.scrollBehavior;
      area.style.setProperty('scroll-behavior', 'auto', 'important');
      area.scrollTop = 0;
      if (area.scrollTo) {
        try { area.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (err) { area.scrollTop = 0; }
      }
      setTimeout(function() {
        if (area) {
          if (origBehavior) {
            area.style.scrollBehavior = origBehavior;
          } else {
            area.style.removeProperty('scroll-behavior');
          }
        }
      }, 50);
    }

    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    if (wasScrolling) {
      var self = this;
      setTimeout(function() {
        if (self.isScrolling) {
          self.step();
        }
      }, 60);
    }
  }
};

window.Prompter = Prompter;
