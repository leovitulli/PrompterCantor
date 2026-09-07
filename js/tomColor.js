/**
 * CantaAí — Cor do Tom (passo 3 da nova marca)
 * "O tom é a cor": lê o Tom de Cantar já escolhido no seletor existente
 * (#prompterKeySelect) e publica variáveis CSS com a cor daquele tom.
 *
 * NÃO altera nenhuma lógica do app: apenas observa o valor do <select>
 * (evento change + verificação periódica, porque o app também define o
 * valor por código ao abrir a música) e escreve
 * em <body>: --tom-atual-ink / -fill / -minor / -soft (var(--tom-X-*) de style.css);
 * o brand.css só usa essas variáveis dentro do #prompterView — o resto do app fica na cor fixa da marca
 * e em <html>: data-tom="G"  data-tom-modo="maior|menor"
 * Nada usa essas variáveis até o CSS da marca (brand.css) entrar.
 */
(function () {
  'use strict';

  // Nota -> sufixo das variáveis em style.css (C# = Cs, D# = Eb, G# = Ab, A# = Bb)
  var SLUG = {
    'C': 'C', 'B#': 'C',
    'C#': 'Cs', 'DB': 'Cs',
    'D': 'D',
    'D#': 'Eb', 'EB': 'Eb',
    'E': 'E', 'FB': 'E',
    'F': 'F', 'E#': 'F',
    'F#': 'Fs', 'GB': 'Fs',
    'G': 'G',
    'G#': 'Ab', 'AB': 'Ab',
    'A': 'A',
    'A#': 'Bb', 'BB': 'Bb',
    'B': 'B', 'CB': 'B'
  };
  var DEFAULT = 'G'; // cor fixa da marca = Sol (azul)
  var root = document.documentElement;
  // As variáveis vão no <body>, porque os valores de tema claro vivem em body.light-mode
  // (var() resolve onde a propriedade é definida).
  function host() { return document.body || root; }
  var lastApplied = null;

  function parse(rawKey) {
    if (!rawKey) return null;
    var m = String(rawKey).trim().match(/^([A-Ga-g])([#b]?)(m?)/);
    if (!m) return null;
    var note = (m[1].toUpperCase() + m[2]).toUpperCase();
    var slug = SLUG[note];
    if (!slug) return null;
    return { slug: slug, minor: m[3] === 'm' };
  }

  function apply(rawKey) {
    var p = parse(rawKey) || { slug: DEFAULT, minor: false };
    var id = p.slug + (p.minor ? 'm' : '');
    if (id === lastApplied) return;
    lastApplied = id;
    host().style.setProperty('--tom-atual-ink', 'var(--tom-' + p.slug + '-ink)');
    host().style.setProperty('--tom-atual-fill', 'var(--tom-' + p.slug + '-fill)');
    host().style.setProperty('--tom-atual-minor', 'var(--tom-' + p.slug + '-minor)');
    host().style.setProperty('--tom-atual-soft', 'var(--tom-' + p.slug + '-soft)');
    root.setAttribute('data-tom', p.slug);
    root.setAttribute('data-tom-modo', p.minor ? 'menor' : 'maior');
  }

  function currentKey() {
    var sel = document.getElementById('prompterKeySelect');
    return sel ? sel.value : '';
  }

  function tick() {
    apply(currentKey());
  }

  function init() {
    var sel = document.getElementById('prompterKeySelect');
    if (sel) sel.addEventListener('change', tick);
    tick();
    // O app define o valor do select por código ao abrir cada música
    // (Transposer.setSelectKey), o que não dispara "change": por isso a verificação leve.
    setInterval(tick, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Passo 5: selos de tom nas listas (cada música na cor do SEU tom) ──
  // Só estiliza elementos já renderizados pelo app; não altera dados nem eventos.
  var BADGE_SEL = '.badge-key, .ap-key-badge, .badge-original-key, #prompterSongOriginalKey, #pnsbKey';
  function paintBadge(el) {
    var txt = (el.textContent || '').replace(/^\s*(tom|orig)\s*:\s*/i, '').trim();
    var p = parse(txt);
    if (!p) return;
    var bg = p.minor ? 'var(--tom-' + p.slug + '-minor)' : 'var(--tom-' + p.slug + '-fill)';
    var fg = p.minor ? 'var(--ca-giz)' : 'var(--ca-tinta)';
    el.style.setProperty('background', bg, 'important');
    el.style.setProperty('background-color', bg, 'important');
    el.style.setProperty('color', fg, 'important');
    el.style.setProperty('border-color', 'transparent', 'important');
    el.setAttribute('data-tom', p.slug);
    el.setAttribute('data-tom-modo', p.minor ? 'menor' : 'maior');
  }
  function paintAll(rootEl) {
    var scope = rootEl && rootEl.querySelectorAll ? rootEl : document;
    var list = scope.querySelectorAll(BADGE_SEL);
    for (var i = 0; i < list.length; i++) paintBadge(list[i]);
    if (rootEl && rootEl.matches && rootEl.matches(BADGE_SEL)) paintBadge(rootEl);
  }
  function initBadges() {
    paintAll(document);
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].nodeType === 1) paintAll(m.addedNodes[j]);
        } else if (m.type === 'characterData' && m.target.parentElement) {
          var pe = m.target.parentElement.closest(BADGE_SEL);
          if (pe) paintBadge(pe);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBadges); else initBadges();

  // Uso futuro (capas de repertório): TomColor.slugOf('Gm') -> 'G'
  window.TomColor = { apply: apply, parse: parse, paintBadges: paintAll, slugOf: function (k) { var p = parse(k); return p ? p.slug : DEFAULT; } };
})();
