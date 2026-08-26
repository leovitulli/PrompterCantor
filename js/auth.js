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

    signUp: function (email, password) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var cleanEmail = (email || '').trim().toLowerCase();

      if (!sb || !sb.auth || typeof sb.auth.signUp !== 'function') {
        return Promise.reject(new Error('Serviço de autenticação temporariamente indisponível.'));
      }

      return sb.auth.signUp({ email: cleanEmail, password: password }).then(function (res) {
        if (res.error) {
          if (res.error.message.includes('User already registered') || res.error.message.includes('already exists')) {
            throw new Error('Este e-mail já está cadastrado. Por favor, clique na aba "Entrar".');
          }
          throw new Error(res.error.message || 'Erro ao realizar cadastro.');
        }

        // No Supabase, quando o usuário já existe e a confirmação está desligada ou ligada,
        // identities pode vir vazio ou sem user id novo:
        if (res.data && res.data.user && res.data.user.identities && res.data.user.identities.length === 0) {
          throw new Error('Este e-mail já está cadastrado. Por favor, acesse pela aba "Entrar".');
        }

        var user = res.data ? res.data.user : null;
        if (!user) {
          throw new Error('Não foi possível registrar o usuário. Tente novamente.');
        }

        currentUser = user;
        return PrompterAuth.fetchProfile(user.id).then(function (profile) {
          currentProfile = profile;
          PrompterAuth.saveSession(user, profile);
          PrompterAuth.updateUIForAuth();
          PrompterAuth.heartbeatLastSeen();
          return { user: user, profile: profile };
        });
      });
    },

    signIn: function (email, password) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var cleanEmail = (email || '').trim().toLowerCase();

      if (!sb || !sb.auth || typeof sb.auth.signInWithPassword !== 'function') {
        return Promise.reject(new Error('Serviço de autenticação temporariamente indisponível.'));
      }

      return sb.auth.signInWithPassword({ email: cleanEmail, password: password }).then(function (res) {
        if (res.error) {
          if (res.error.message.includes('Invalid login credentials') || res.error.message.includes('invalid_grant')) {
            throw new Error('E-mail ou senha incorretos.');
          }
          if (res.error.message.includes('Email not confirmed')) {
            throw new Error('E-mail ainda não confirmado. Desative a confirmação no painel do Supabase ou confirme seu e-mail.');
          }
          throw new Error(res.error.message || 'Erro ao fazer login.');
        }

        var user = res.data ? res.data.user : null;
        if (!user) throw new Error('Usuário não retornado pelo servidor.');

        currentUser = user;
        return PrompterAuth.fetchProfile(user.id).then(function (profile) {
          currentProfile = profile;
          PrompterAuth.saveSession(user, profile);
          PrompterAuth.updateUIForAuth();
          PrompterAuth.heartbeatLastSeen();
          return { user: user, profile: profile };
        });
      });
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
    },

    resetPassword: function (email) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var cleanEmail = (email || '').trim().toLowerCase();
      if (!sb || !sb.auth || typeof sb.auth.resetPasswordForEmail !== 'function') {
        return Promise.reject(new Error('Serviço de redefinição de senha indisponível.'));
      }
      return sb.auth.resetPasswordForEmail(cleanEmail).then(function (res) {
        if (res.error) throw res.error;
        return res;
      });
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
