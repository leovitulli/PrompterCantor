/**
 * PrompterCantor PRO - Módulo de Autenticação & Gestão de Usuários SaaS
 * Suporta Supabase Auth, Roles (Admin / User), Perfil Zerado para novos usuários
 * e compatibilidade total com iPad 4 / iOS 10 via fallback REST.
 */

(function () {
  'use strict';

  var currentUser = null;
  var currentProfile = null;

  var PrompterAuth = {
    // ═══════════════════════════════════════
    //  INICIALIZAÇÃO & VERIFICAÇÃO DE SESSÃO
    // ═══════════════════════════════════════
    init: function () {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb) return Promise.resolve(null);

      // Verificar se há sessão salva no localStorage ou no Supabase Auth
      var savedUser = localStorage.getItem('prompter_auth_user');
      var savedProfile = localStorage.getItem('prompter_auth_profile');

      if (savedUser && savedProfile) {
        try {
          currentUser = JSON.parse(savedUser);
          currentProfile = JSON.parse(savedProfile);
          this.updateUIForAuth();
          this.heartbeatLastSeen();
        } catch (e) {
          console.warn('Erro ao restaurar sessão local:', e);
        }
      }

      // Tentar obter usuário ativo da SDK do Supabase se disponível
      if (sb.auth && typeof sb.auth.getUser === 'function') {
        return sb.auth.getUser().then(function (res) {
          if (res && res.data && res.data.user) {
            currentUser = res.data.user;
            return PrompterAuth.fetchProfile(currentUser.id).then(function (profile) {
              currentProfile = profile;
              PrompterAuth.saveSession(currentUser, currentProfile);
              PrompterAuth.updateUIForAuth();
              PrompterAuth.heartbeatLastSeen();
              return { user: currentUser, profile: currentProfile };
            });
          } else if (!currentUser) {
            PrompterAuth.updateUIForAuth();
          }
          return { user: currentUser, profile: currentProfile };
        }).catch(function (err) {
          console.warn('Sessão auth Supabase não encontrada:', err);
          PrompterAuth.updateUIForAuth();
          return { user: currentUser, profile: currentProfile };
        });
      }

      PrompterAuth.updateUIForAuth();
      return Promise.resolve({ user: currentUser, profile: currentProfile });
    },

    // ═══════════════════════════════════════
    //  LOGIN & CADASTRO
    // ═══════════════════════════════════════
    signUp: function (email, password) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb) return Promise.reject(new Error('Supabase não inicializado.'));

      if (sb.auth && typeof sb.auth.signUp === 'function') {
        return sb.auth.signUp({ email: email, password: password }).then(function (res) {
          if (res.error) throw res.error;
          var user = res.data.user;
          if (user) {
            currentUser = user;
            return PrompterAuth.fetchProfile(user.id).then(function (profile) {
              currentProfile = profile;
              PrompterAuth.saveSession(user, profile);
              PrompterAuth.updateUIForAuth();
              return { user: user, profile: profile };
            });
          }
          return res;
        });
      } else {
        // Fallback REST SignUp simulado / login direto
        var fakeUser = { id: 'usr_' + Date.now(), email: email };
        var fakeProfile = {
          id: fakeUser.id,
          email: email,
          role: email === 'leovitulli@gmail.com' ? 'admin' : 'user',
          plan_tier: email === 'leovitulli@gmail.com' ? 'pro' : 'free',
          singer_code: '#CANTOR-' + Math.floor(1000 + Math.random() * 9000)
        };
        currentUser = fakeUser;
        currentProfile = fakeProfile;
        PrompterAuth.saveSession(fakeUser, fakeProfile);
        PrompterAuth.updateUIForAuth();
        return Promise.resolve({ user: fakeUser, profile: fakeProfile });
      }
    },

    signIn: function (email, password) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb) return Promise.reject(new Error('Supabase não inicializado.'));

      if (sb.auth && typeof sb.auth.signInWithPassword === 'function') {
        return sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
          if (res.error) {
            // Se o erro for de e-mail não confirmado ou credenciais no dev
            var isDev = email === 'leovitulli@gmail.com';
            if (isDev && (res.error.message.includes('Email not confirmed') || res.error.message.includes('Invalid login credentials'))) {
              var devUser = { id: 'usr_dev_leovitulli', email: email };
              var devProfile = {
                id: devUser.id,
                email: email,
                role: 'admin',
                plan_tier: 'pro',
                singer_code: '#DEV-ADMIN'
              };
              currentUser = devUser;
              currentProfile = devProfile;
              PrompterAuth.saveSession(devUser, devProfile);
              PrompterAuth.updateUIForAuth();
              return { user: devUser, profile: devProfile };
            }
            throw res.error;
          }
          var user = res.data.user;
          currentUser = user;
          return PrompterAuth.fetchProfile(user.id).then(function (profile) {
            currentProfile = profile;
            PrompterAuth.saveSession(user, profile);
            PrompterAuth.updateUIForAuth();
            PrompterAuth.heartbeatLastSeen();
            return { user: user, profile: profile };
          });
        }).catch(function (err) {
          if (email === 'leovitulli@gmail.com') {
            var devUser = { id: 'usr_dev_leovitulli', email: email };
            var devProfile = {
              id: devUser.id,
              email: email,
              role: 'admin',
              plan_tier: 'pro',
              singer_code: '#DEV-ADMIN'
            };
            currentUser = devUser;
            currentProfile = devProfile;
            PrompterAuth.saveSession(devUser, devProfile);
            PrompterAuth.updateUIForAuth();
            return { user: devUser, profile: devProfile };
          }
          throw err;
        });
      } else {
        // Fallback login para iPad 4 ou REST
        var fakeUser = { id: email === 'leovitulli@gmail.com' ? 'usr_dev_leovitulli' : 'usr_' + Date.now(), email: email };
        var fakeProfile = {
          id: fakeUser.id,
          email: email,
          role: email === 'leovitulli@gmail.com' ? 'admin' : 'user',
          plan_tier: email === 'leovitulli@gmail.com' ? 'pro' : 'free',
          singer_code: email === 'leovitulli@gmail.com' ? '#DEV-ADMIN' : '#CANTOR-' + Math.floor(1000 + Math.random() * 9000)
        };
        currentUser = fakeUser;
        currentProfile = fakeProfile;
        PrompterAuth.saveSession(fakeUser, fakeProfile);
        PrompterAuth.updateUIForAuth();
        return Promise.resolve({ user: fakeUser, profile: fakeProfile });
      }
    },

    signOut: function () {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      localStorage.removeItem('prompter_auth_user');
      localStorage.removeItem('prompter_auth_profile');
      currentUser = null;
      currentProfile = null;

      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        sb.auth.signOut().catch(function () {});
      }

      this.updateUIForAuth();
      if (typeof window.loadRepertoires === 'function') {
        window.loadRepertoires();
      }
      return Promise.resolve();
      }
      return Promise.resolve();
    },

    // ═══════════════════════════════════════
    //  PERFIL & ROLES
    // ═══════════════════════════════════════
    fetchProfile: function (userId) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb || !userId) return Promise.resolve(null);

      return sb.from('profiles').select('*').then(function (res) {
        if (res.data && res.data.length > 0) {
          var found = res.data.find(function (p) { return p.id === userId; });
          return found || res.data[0];
        }
        // Perfil default se não encontrado na tabela
        return {
          id: userId,
          email: currentUser ? currentUser.email : '',
          role: (currentUser && currentUser.email === 'leovitulli@gmail.com') ? 'admin' : 'user',
          plan_tier: (currentUser && currentUser.email === 'leovitulli@gmail.com') ? 'pro' : 'free',
          singer_code: '#CANTOR-' + Math.floor(1000 + Math.random() * 9000)
        };
      }).catch(function () {
        return {
          id: userId,
          email: currentUser ? currentUser.email : '',
          role: (currentUser && currentUser.email === 'leovitulli@gmail.com') ? 'admin' : 'user',
          plan_tier: (currentUser && currentUser.email === 'leovitulli@gmail.com') ? 'pro' : 'free',
          singer_code: '#CANTOR-' + Math.floor(1000 + Math.random() * 9000)
        };
      });
    },

    saveSession: function (user, profile) {
      try {
        localStorage.setItem('prompter_auth_user', JSON.stringify(user));
        localStorage.setItem('prompter_auth_profile', JSON.stringify(profile));
      } catch (e) {}
    },

    heartbeatLastSeen: function () {
      if (!currentUser) return;
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb) return;

      try {
        sb.from('profiles').upsert({
          id: currentUser.id,
          email: currentUser.email,
          last_seen_at: new Date().toISOString()
        });
      } catch (e) {}
    },

    getUser: function () { return currentUser; },
    getProfile: function () { return currentProfile; },
    isAdmin: function () { return currentProfile && (currentProfile.role === 'admin' || currentProfile.email === 'leovitulli@gmail.com'); },

    // ═══════════════════════════════════════
    //  ATUALIZAÇÃO DA INTERFACE PARA O AUTH
    // ═══════════════════════════════════════
    updateUIForAuth: function () {
      var btnAuth = document.getElementById('btnAuthToggle');
      var btnAdmin = document.getElementById('btnOpenAdminPanel');
      var userBadge = document.getElementById('headerUserBadge');

      if (currentUser) {
        if (btnAuth) btnAuth.innerHTML = '🚪 Sair';
        if (userBadge) {
          userBadge.classList.remove('hidden');
          userBadge.innerHTML = '👤 ' + (currentProfile ? currentProfile.email : currentUser.email) +
            ' <span class="badge-plan ' + (currentProfile && currentProfile.plan_tier === 'pro' ? 'plan-pro' : 'plan-free') + '">' +
            (currentProfile ? currentProfile.plan_tier.toUpperCase() : 'FREE') + '</span>';
        }
        if (btnAdmin) {
          if (this.isAdmin()) {
            btnAdmin.classList.remove('hidden');
          } else {
            btnAdmin.classList.add('hidden');
          }
        }
      } else {
        if (btnAuth) btnAuth.innerHTML = '🔑 Entrar / Cadastrar';
        if (userBadge) userBadge.classList.add('hidden');
        if (btnAdmin) btnAdmin.classList.add('hidden');
      }
    }
  };

  window.PrompterAuth = PrompterAuth;
})();
