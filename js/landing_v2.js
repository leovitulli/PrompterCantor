/* ═══════════════════════════════════════════════════════════════════════════
   CANTAAÍ PRO — LANDING PAGE V2 CLIENT SCRIPTS
   Interactive Teleprompter Simulator, Live Transposer, Tour & Billing Switch
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    // ── 1. SIMULADOR INTERATIVO DE TELEPROMPTER AO VIVO ────────────────────
    var btnSimPlay = document.getElementById('simBtnPlay');
    var simPlayIcon = document.getElementById('simPlayIcon');
    var simPlayText = document.getElementById('simPlayText');
    var simViewport = document.getElementById('simViewport');
    var simLyrics = document.getElementById('simLyrics');
    var simBadgeKey = document.getElementById('simBadgeKey');
    var btnKeyDown = document.getElementById('btnKeyDown');
    var btnKeyUp = document.getElementById('btnKeyUp');
    var btnSpeed1 = document.getElementById('btnSpeed1');
    var btnSpeed2 = document.getElementById('btnSpeed2');
    var btnSpeed3 = document.getElementById('btnSpeed3');
    var btnFontDown = document.getElementById('btnFontDown');
    var btnFontUp = document.getElementById('btnFontUp');

    var isScrolling = false;
    var scrollSpeed = 1.0;
    var scrollAnimId = null;
    var currentScrollPos = 0;
    var currentFontSize = 1.15; // rem

    // Escala cromática para transposição harmônica dinâmica no simulador
    var chromaticScale = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    var chromaticScaleFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Músicas do simulador: Resignação (Geraldo Filme)
    var currentKeyIndex = 5; // Gm = 5, Dm = 2
    var tonalities = [
      { key: 'Am', root: 'A', name: 'Lá Menor' },
      { key: 'Bbm', root: 'Bb', name: 'Si Bemol Menor' },
      { key: 'Bm', root: 'B', name: 'Si Menor' },
      { key: 'Cm', root: 'C', name: 'Dó Menor' },
      { key: 'C#m', root: 'C#', name: 'Dó Sustenido Menor' },
      { key: 'Dm', root: 'D', name: 'Ré Menor' },
      { key: 'Ebm', root: 'Eb', name: 'Mi Bemol Menor' },
      { key: 'Em', root: 'E', name: 'Mi Menor' },
      { key: 'Fm', root: 'F', name: 'Fá Menor' },
      { key: 'F#m', root: 'F#', name: 'Fá Sustenido Menor' },
      { key: 'Gm', root: 'G', name: 'Sol Menor' },
      { key: 'Abm', root: 'Ab', name: 'Lá Bemol Menor' }
    ];

    var chordBaseMap = {
      'Dm': 5,
      'Gm': 10,
      'A7': 9,
      'D7': 2,
      'Bb': 10,
      'C7': 0,
      'F': 5,
      'A#': 10
    };

    var currentSemitoneOffset = 0;

    function updateSimulatorChords() {
      var chordEls = simLyrics.querySelectorAll('.sim-chord');
      var baseKeys = ['Dm', 'Gm', 'A7', 'Dm', 'D7', 'Gm', 'A7', 'Dm'];
      
      // Tom principal da música
      var rootIdx = (5 + currentSemitoneOffset) % 12;
      if (rootIdx < 0) rootIdx += 12;
      var curTon = tonalities[rootIdx];
      if (simBadgeKey) {
        simBadgeKey.textContent = curTon.key + ' (' + curTon.name + ')';
      }

      var noteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

      for (var i = 0; i < chordEls.length; i++) {
        var baseType = chordEls[i].getAttribute('data-chord');
        if (!baseType) continue;

        // Análise da nota raiz do acorde
        var match = baseType.match(/^([A-G][b#]?)(.*)$/);
        if (match) {
          var rootNote = match[1];
          var suffix = match[2];
          var originalIdx = noteNames.indexOf(rootNote);
          if (originalIdx === -1) {
            // tentar com bemol
            originalIdx = chromaticScaleFlat.indexOf(rootNote);
          }
          if (originalIdx !== -1) {
            var newIdx = (originalIdx + currentSemitoneOffset) % 12;
            if (newIdx < 0) newIdx += 12;
            var transposedNote = noteNames[newIdx];
            chordEls[i].textContent = '[ ' + transposedNote + suffix + ' ]';
          }
        }
      }
    }

    function stepScroll() {
      if (!isScrolling) return;
      currentScrollPos += 0.8 * scrollSpeed;
      var maxScroll = simViewport.scrollHeight - simViewport.clientHeight;
      if (currentScrollPos >= maxScroll + 50) {
        currentScrollPos = 0; // loop suave
      }
      simViewport.scrollTop = currentScrollPos;
      scrollAnimId = requestAnimationFrame(stepScroll);
    }

    if (btnSimPlay) {
      btnSimPlay.addEventListener('click', function () {
        isScrolling = !isScrolling;
        if (isScrolling) {
          btnSimPlay.classList.add('sim-btn-active');
          simPlayIcon.textContent = '⏸';
          simPlayText.textContent = 'Pausar';
          scrollAnimId = requestAnimationFrame(stepScroll);
        } else {
          btnSimPlay.classList.remove('sim-btn-active');
          simPlayIcon.textContent = '▶';
          simPlayText.textContent = 'Iniciar Rolagem';
          if (scrollAnimId) cancelAnimationFrame(scrollAnimId);
        }
      });
    }

    if (btnKeyDown) {
      btnKeyDown.addEventListener('click', function () {
        currentSemitoneOffset -= 1;
        updateSimulatorChords();
      });
    }

    if (btnKeyUp) {
      btnKeyUp.addEventListener('click', function () {
        currentSemitoneOffset += 1;
        updateSimulatorChords();
      });
    }

    function setSpeed(speed, activeBtn) {
      scrollSpeed = speed;
      [btnSpeed1, btnSpeed2, btnSpeed3].forEach(function (btn) {
        if (btn) btn.classList.remove('sim-btn-play');
      });
      if (activeBtn) activeBtn.classList.add('sim-btn-play');
    }

    if (btnSpeed1) btnSpeed1.addEventListener('click', function () { setSpeed(0.6, btnSpeed1); });
    if (btnSpeed2) btnSpeed2.addEventListener('click', function () { setSpeed(1.2, btnSpeed2); });
    if (btnSpeed3) btnSpeed3.addEventListener('click', function () { setSpeed(2.2, btnSpeed3); });

    if (btnFontDown) {
      btnFontDown.addEventListener('click', function () {
        if (currentFontSize > 0.85) {
          currentFontSize -= 0.1;
          simLyrics.style.fontSize = currentFontSize + 'rem';
        }
      });
    }

    if (btnFontUp) {
      btnFontUp.addEventListener('click', function () {
        if (currentFontSize < 1.6) {
          currentFontSize += 0.1;
          simLyrics.style.fontSize = currentFontSize + 'rem';
        }
      });
    }

    // ── 2. ABAS DO TOUR DE PRODUTO (SCREENSHOTS REAIS) ─────────────────────
    var tourTabs = document.querySelectorAll('.tour-tab-btn');
    var tourPanels = document.querySelectorAll('.tour-content-panel');

    tourTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var targetId = tab.getAttribute('data-target');
        
        tourTabs.forEach(function (t) { t.classList.remove('active'); });
        tourPanels.forEach(function (p) { p.classList.remove('active'); });

        tab.classList.add('active');
        var targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });

    // ── 3. CHAVEADOR DE FATURAMENTO MENSAL / ANUAL ────────────────────────
    var billingToggle = document.getElementById('billingToggle');
    var priceProMain = document.getElementById('priceProMain');
    var priceProCents = document.getElementById('priceProCents');
    var priceProPeriod = document.getElementById('priceProPeriod');
    var annualBreakdown = document.getElementById('annualBreakdown');
    var labelMonthly = document.getElementById('labelMonthly');
    var labelAnnual = document.getElementById('labelAnnual');

    if (billingToggle) {
      billingToggle.addEventListener('change', function () {
        var isAnnual = billingToggle.checked;
        if (isAnnual) {
          if (labelAnnual) labelAnnual.classList.add('active');
          if (labelMonthly) labelMonthly.classList.remove('active');
          if (priceProMain) priceProMain.textContent = '24';
          if (priceProCents) priceProCents.textContent = ',92';
          if (priceProPeriod) priceProPeriod.textContent = '/mês no plano anual';
          if (annualBreakdown) annualBreakdown.style.display = 'block';
        } else {
          if (labelMonthly) labelMonthly.classList.add('active');
          if (labelAnnual) labelAnnual.classList.remove('active');
          if (priceProMain) priceProMain.textContent = '39';
          if (priceProCents) priceProCents.textContent = ',90';
          if (priceProPeriod) priceProPeriod.textContent = '/mês';
          if (annualBreakdown) annualBreakdown.style.display = 'none';
        }
      });
    }

    // ── 4. FAQ ACCORDION INTERATIVO ────────────────────────────────────────
    var faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(function (item) {
      var header = item.querySelector('.faq-header');
      if (header) {
        header.addEventListener('click', function () {
          var isActive = item.classList.contains('active');
          faqItems.forEach(function (i) { i.classList.remove('active'); });
          if (!isActive) {
            item.classList.add('active');
          }
        });
      }
    });

  });
})();
