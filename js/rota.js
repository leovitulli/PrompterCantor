/**
 * CantaAí — Rota da página de vendas (apresentação/roteamento)
 * A página de vendas oficial é landing_v3.html. O index.html é o APLICATIVO.
 *
 * 1) Visitante deslogado que cai no index.html sem intenção explícita
 *    (?auth=... ou ?action=app) é mandado para a página de vendas.
 * 2) A landing antiga que morava dentro do index.html fica desativada:
 *    ao entrar por "Entrar"/"Criar conta", aparece só o formulário sobre o
 *    fundo do app — sem a página de vendas velha atrás.
 *
 * Não altera nenhuma lógica de autenticação: só decide qual página mostrar.
 */
(function () {
  'use strict';

  var q = new URLSearchParams(window.location.search);
  var querAuth = q.has('auth');
  var querApp = q.get('action') === 'app';
  var logado = false;
  try { logado = !!localStorage.getItem('prompter_auth_user'); } catch (e) {}

  if (!logado && !querAuth && !querApp) {
    window.location.replace('landing_v3.html');
    return;
  }

  // Landing antiga desativada dentro do app
  var css = document.createElement('style');
  css.textContent = '#landingPageSection, #landingHeaderNav { display: none !important; }';
  (document.head || document.documentElement).appendChild(css);

  function esconder() {
    ['landingPageSection', 'landingHeaderNav'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
    });
    document.documentElement.classList.add('canta-auth-active');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', esconder); else esconder();
})();
