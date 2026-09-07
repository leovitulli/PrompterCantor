/**
 * CantaAí — Ícones da marca (camada de apresentação)
 * Troca os emojis da interface por ícones SVG de traço, todos no mesmo grid 24
 * e na cor do texto — o padrão visual da nova marca.
 *
 * NÃO altera nenhuma lógica: só percorre nós de TEXTO já renderizados e
 * substitui o glifo pelo <svg>. Ignora campos de digitação, conteúdo editável
 * e a área da letra/cifra do prompter (nunca mexe no conteúdo das músicas).
 * Para desligar: remova a tag <script> deste arquivo.
 */
(function () {
  'use strict';

  var S = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  var P = {
    crown:   '<path d="M4 18h16M4 18l-1-9 5 3 4-6 4 6 5-3-1 9" ' + S + '/>',
    money:   '<rect x="2.5" y="6" width="19" height="12" rx="2" ' + S + '/><circle cx="12" cy="12" r="2.5" ' + S + '/>',
    star:    '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" ' + S + '/>',
    bolt:    '<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" ' + S + '/>',
    note:    '<path d="M9 18V5l11-2v13" ' + S + '/><circle cx="6.5" cy="18" r="2.5" ' + S + '/><circle cx="17.5" cy="16" r="2.5" ' + S + '/>',
    users:   '<circle cx="9" cy="8" r="3.2" ' + S + '/><path d="M2.5 20a6.5 6.5 0 0 1 13 0" ' + S + '/><path d="M16 5.5a3.2 3.2 0 0 1 0 5M17.5 20a6 6 0 0 0-2-4.5" ' + S + '/>',
    user:    '<circle cx="12" cy="8" r="3.5" ' + S + '/><path d="M5 20a7 7 0 0 1 14 0" ' + S + '/>',
    speaker: '<path d="M4 9v6h3l7 4V5L7 9z" ' + S + '/><path d="M17.5 9.5a4 4 0 0 1 0 5" ' + S + '/>',
    ticket:  '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" ' + S + '/><path d="M14 6v12" stroke-dasharray="2 3" ' + S + '/>',
    card:    '<rect x="2.5" y="5" width="19" height="14" rx="2" ' + S + '/><path d="M2.5 10h19" ' + S + '/>',
    plus:    '<path d="M12 5v14M5 12h14" ' + S + '/>',
    chart:   '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" ' + S + '/>',
    refresh: '<path d="M20 11a8 8 0 1 0-1.6 5.6" ' + S + '/><path d="M20 5v6h-6" ' + S + '/>',
    info:    '<circle cx="12" cy="12" r="9" ' + S + '/><path d="M12 11v5M12 8h.01" ' + S + '/>',
    gear:    '<circle cx="12" cy="12" r="3" ' + S + '/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" ' + S + '/>',
    search:  '<circle cx="11" cy="11" r="6.5" ' + S + '/><path d="M16 16l4.5 4.5" ' + S + '/>',
    pencil:  '<path d="M16.5 3.5l4 4L8 20H4v-4z" ' + S + '/>',
    trash:   '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" ' + S + '/>',
    printer: '<path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" ' + S + '/><path d="M7 14h10v7H7z" ' + S + '/>',
    folder:  '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" ' + S + '/>',
    cloud:   '<path d="M7 18a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.6 1.6A3.5 3.5 0 0 1 17.5 18z" ' + S + '/>',
    mic:     '<rect x="9" y="2.5" width="6" height="11" rx="3" ' + S + '/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" ' + S + '/>',
    camera:  '<rect x="3" y="6" width="18" height="14" rx="3" ' + S + '/><circle cx="12" cy="13" r="3.5" ' + S + '/><path d="M17.5 9.5h.01" ' + S + '/>',
    check:   '<path d="M4.5 12.5l5 5 10-11" ' + S + '/>',
    diamond: '<path d="M12 3l8 6-8 12-8-12z" ' + S + '/><path d="M4 9h16" ' + S + '/>',
    tag:     '<path d="M3 11V4h7l11 11-7 7z" ' + S + '/><circle cx="7.5" cy="7.5" r="1.4" ' + S + '/>',
    moon:    '<path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.8 6.8 0 0 0 9.5 9.5z" ' + S + '/>',
    sun:     '<circle cx="12" cy="12" r="4" ' + S + '/><path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19 5l-1.8 1.8M6.8 17.2L5 19M19 19l-1.8-1.8M6.8 6.8L5 5" ' + S + '/>',
    play:    '<path d="M7 4.5l12 7.5-12 7.5z" ' + S + '/>',
    exit:    '<path d="M14 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h8" ' + S + '/><path d="M17 8.5l3.5 3.5L17 15.5M20.5 12H10" ' + S + '/>',
    doc:     '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" ' + S + '/><path d="M13 3v6h6" ' + S + '/>',
    chat:    '<path d="M20.5 12a7.5 7.5 0 1 1-3.6-6.4" ' + S + '/><path d="M20.5 5.5v4h-4" ' + S + '/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" ' + S + '/>',
    sort:    '<path d="M4 6h12M4 12h9M4 18h6M17 10l3-3 3 3M20 7v12" ' + S + '/>',
    broom:   '<path d="M14 3l7 7M12.5 5.5l6 6M10 8l-6 6a4 4 0 0 0 6 6l6-6z" ' + S + '/>',
    expand:  '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" ' + S + '/>',
    x:       '<path d="M6 6l12 12M18 6L6 18" ' + S + '/>',
    clip:    '<rect x="6" y="4" width="12" height="17" rx="2" ' + S + '/><path d="M9.5 4V2.8h5V4" ' + S + '/>',
    lock:    '<rect x="4.5" y="10" width="15" height="10" rx="2" ' + S + '/><path d="M8 10V7a4 4 0 0 1 8 0v3" ' + S + '/>'
  };

  // emoji -> ícone (os que forem só enfeite viram string vazia e somem)
  var MAP = {
    '👑': 'crown', '💰': 'money', '⭐': 'star', '🌟': 'star', '⚡': 'bolt', '🎵': 'note', '🎶': 'note', '🎼': 'note',
    '👥': 'users', '👤': 'user', '🧑': 'user', '📢': 'speaker', '📣': 'speaker', '🎫': 'ticket', '🎟️': 'ticket', '🎟': 'ticket',
    '💳': 'card', '➕': 'plus', '📊': 'chart', '📈': 'chart', '🔄': 'refresh', '💡': 'info', 'ℹ️': 'info', '⚙️': 'gear', '⚙': 'gear',
    '🔍': 'search', '🔎': 'search', '✏️': 'pencil', '✏': 'pencil', '📝': 'pencil', '🗑️': 'trash', '🗑': 'trash', '🖨️': 'printer', '🖨': 'printer',
    '📁': 'folder', '📂': 'folder', '☁️': 'cloud', '☁': 'cloud', '🎤': 'mic', '📸': 'camera', '📷': 'camera',
    '✅': 'check', '✔️': 'check', '💎': 'diamond', '🏷️': 'tag', '🏷': 'tag', '🌙': 'moon', '☀️': 'sun', '🌞': 'sun',
    '🚪': 'exit', '📄': 'doc', '📃': 'doc', '💬': 'chat', '✨': 'sparkle', '🔤': 'sort', '🧹': 'broom', '⛶': 'expand',
    '✕': 'x', '✖️': 'x', '❌': 'x', '📋': 'clip', '🔒': 'lock', '🔐': 'lock',
    '🚀': '', '🟢': '', '🔴': '', '🟡': '', '🔵': '', '⚫': '', '⚪': '', '🎸': '', '🥁': '', '🎹': '', '🔥': '', '💜': '', '💙': '', '❤️': '', '🎯': '', '🏆': 'star', '📌': '', '🔔': ''
  };

  var RE = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2600}-\u{26FF}]/u;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, CODE: 1, PRE: 1 };
  var SKIP_SEL = '#prompterTextContent, .lyric-line, .chord-line, .prompter-text-content, [contenteditable="true"], .text-content-editor';

  function svg(name) {
    if (!name || !P[name]) return '';
    return '<svg class="ca-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + P[name] + '</svg>';
  }

  function convert(node) {
    var txt = node.nodeValue;
    if (!txt || !RE.test(txt)) return false;
    var out = '', changed = false;
    var chars = Array.from(txt);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      // emoji pode vir com seletor de variação (U+FE0F): tenta a chave composta
      var key = Object.prototype.hasOwnProperty.call(MAP, ch) ? ch
        : (Object.prototype.hasOwnProperty.call(MAP, ch + '️') ? ch + '️' : null);
      if (key) { out += svg(MAP[key]); changed = true; if (chars[i + 1] === '️') i++; }
      else if (ch === '️') { changed = true; }
      else out += ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    if (!changed) return false;
    var span = document.createElement('span');
    span.className = 'ca-ico-wrap';
    span.innerHTML = out;
    node.parentNode.replaceChild(span, node);
    return true;
  }

  function walk(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.closest && root.closest(SKIP_SEL)) return;
    var it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p || SKIP[p.tagName] || p.classList.contains('ca-ico-wrap')) return NodeFilter.FILTER_REJECT;
        if (p.closest(SKIP_SEL)) return NodeFilter.FILTER_REJECT;
        return RE.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var list = [], n;
    while ((n = it.nextNode())) list.push(n);
    list.forEach(convert);
    // placeholders de busca também carregam emoji
    if (root.querySelectorAll) {
      root.querySelectorAll('input[placeholder]').forEach(function (i) {
        if (RE.test(i.placeholder)) i.placeholder = i.placeholder.replace(RE, '').replace(/\s{2,}/g, ' ').trim();
      });
    }
  }

  function init() {
    walk(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 1) walk(n);
          else if (n.nodeType === 3) { var p = n.parentElement; if (p && !SKIP[p.tagName] && !(p.closest && p.closest(SKIP_SEL))) convert(n); }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.BrandIcons = { refresh: walk };
})();
