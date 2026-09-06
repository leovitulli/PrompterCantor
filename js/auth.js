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
          if (currentProfile) this.syncNewUserToAdmin(currentProfile);
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
              if (currentProfile) PrompterAuth.syncNewUserToAdmin(currentProfile);
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

    formatSingerCode: function (code) {
      if (!code) return '';
      var clean = String(code).trim().toLowerCase().replace(/\s+/g, '_');
      if (!clean.startsWith('@') && !clean.startsWith('#')) {
        clean = '@' + clean;
      }
      return clean;
    },

    checkSingerCodeAvailability: function (code, currentUserId, currentUserEmail) {
      var formatted = this.formatSingerCode(code);
      if (!formatted || formatted.length < 3) {
        return Promise.resolve({ available: false, message: 'O código deve ter pelo menos 2 letras.' });
      }

      var cleanEmail = (currentUserEmail || '').toLowerCase().trim();

      // 1. Verificar no cache local de usuários admin
      try {
        var raw = localStorage.getItem('canta_ai_admin_users');
        if (raw) {
          var list = JSON.parse(raw);
          var exists = list.some(function(u) {
            var uCode = (u.singer_code || '').toLowerCase();
            var isSameUser = (currentUserId && String(u.id) === String(currentUserId)) ||
                             (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail);
            return uCode === formatted.toLowerCase() && !isSameUser;
          });
          if (exists) {
            return Promise.resolve({ available: false, code: formatted, message: formatted + ' já está em uso por outro cantor.' });
          }
        }
      } catch(e) {}

      // 2. Verificar no Supabase profiles
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        return sb.from('profiles').select('id, email, singer_code').eq('singer_code', formatted).then(function(res) {
          if (res.data && res.data.length > 0) {
            var isOther = res.data.some(function(p) {
              var isSame = (currentUserId && String(p.id) === String(currentUserId)) ||
                           (cleanEmail && p.email && p.email.toLowerCase().trim() === cleanEmail);
              return !isSame;
            });
            if (isOther) {
              return { available: false, code: formatted, message: formatted + ' já está em uso por outro cantor.' };
            }
          }
          return { available: true, code: formatted, message: formatted + ' está disponível!' };
        }).catch(function() {
          return { available: true, code: formatted, message: formatted + ' está disponível!' };
        });
      }

      return Promise.resolve({ available: true, code: formatted, message: formatted + ' está disponível!' });
    },

    signUp: function (payload) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var email = typeof payload === 'string' ? payload : (payload ? payload.email : '');
      var password = typeof payload === 'string' ? arguments[1] : (payload ? payload.password : '');
      var cleanEmail = (email || '').trim().toLowerCase();

      var name = (payload && payload.name) ? payload.name.trim() : cleanEmail.split('@')[0];
      var phone = (payload && payload.phone) ? payload.phone.trim() : '';
      var cpf = (payload && payload.cpf) ? payload.cpf.trim() : '';
      var instagram = (payload && payload.instagram) ? payload.instagram.trim() : '';
      var coupon = (payload && payload.couponCode) ? payload.couponCode.trim().toUpperCase() : '';

      var isVipCoupon = coupon === 'VIP100' || coupon === 'CORTESIA' || coupon === 'DEV';
      var isPro = cleanEmail === 'leovitulli@gmail.com' || isVipCoupon;
      var planTier = isPro ? 'pro' : 'free';
      var planType = isPro ? '💎 PRO ANUAL' : '⚡ PLANO FREE';
      
      var customSingerCode = (payload && payload.singerCode) ? PrompterAuth.formatSingerCode(payload.singerCode) : '';
      var singerCode = customSingerCode || (cleanEmail === 'leovitulli@gmail.com' ? '@leovitulli' : ('@' + cleanEmail.split('@')[0]));

      if (!sb || !sb.auth || typeof sb.auth.signUp !== 'function') {
        return Promise.reject(new Error('Serviço de autenticação temporariamente indisponível.'));
      }

      return sb.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            display_name: name,
            phone: phone,
            cpf: cpf,
            instagram: instagram,
            singer_code: singerCode,
            plan_tier: planTier,
            terms_accepted_at: new Date().toISOString(),
            privacy_accepted_at: new Date().toISOString()
          }
        }
      }).then(function (res) {
        if (res.error) {
          if (res.error.message.includes('User already registered') || res.error.message.includes('already exists')) {
            throw new Error('Este e-mail já está cadastrado. Por favor, clique na aba "Entrar".');
          }
          throw new Error(res.error.message || 'Erro ao realizar cadastro.');
        }

        if (res.data && res.data.user && res.data.user.identities && res.data.user.identities.length === 0) {
          throw new Error('Este e-mail já está cadastrado. Por favor, acesse pela aba "Entrar".');
        }

        var user = res.data ? res.data.user : null;
        if (!user) {
          throw new Error('Não foi possível registrar o usuário. Tente novamente.');
        }

        currentUser = user;
        
        var profileData = {
          id: user.id,
          email: cleanEmail,
          display_name: name,
          phone: phone,
          cpf: cpf,
          instagram: instagram,
          singer_code: singerCode,
          role: cleanEmail === 'leovitulli@gmail.com' ? 'admin' : 'user',
          plan_tier: planTier,
          plan_type: planType,
          coupon_used: coupon,
          is_online: true,
          terms_accepted_at: new Date().toISOString(),
          privacy_accepted_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        // Salvar profile no Supabase e no sync do painel executivo
        PrompterAuth.syncNewUserToAdmin(profileData);

        if (sb) {
          sb.from('profiles').upsert(profileData).catch(function () {});
        }

        currentProfile = profileData;
        PrompterAuth.saveSession(user, profileData);
        PrompterAuth.updateUIForAuth();
        PrompterAuth.heartbeatLastSeen();

        if (typeof window.loadRepertoires === 'function') {
          window.loadRepertoires();
        }

        return { user: user, profile: profileData };
      });
    },

    syncNewUserToAdmin: function(profile) {
      if (!profile || !profile.email) return;
      try {
        var raw = localStorage.getItem('canta_ai_admin_users');
        var list = raw ? JSON.parse(raw) : [];
        var cleanEmail = profile.email.trim().toLowerCase();
        var existingIdx = list.findIndex(function(u) {
          return (u.email && u.email.trim().toLowerCase() === cleanEmail) || (profile.id && u.id === profile.id);
        });

        var sCode = profile.singer_code || ('@' + profile.email.split('@')[0]);
        if (window.PrompterAdmin && typeof window.PrompterAdmin.normalizeSingerCode === 'function') {
          sCode = window.PrompterAdmin.normalizeSingerCode(sCode, profile.email);
        } else if (sCode.startsWith('#') || sCode.toUpperCase().indexOf('CANTOR-') !== -1 || sCode.toUpperCase().indexOf('DEV-ADMIN') !== -1) {
          sCode = (cleanEmail === 'leovitulli@gmail.com')
            ? (localStorage.getItem('cantaai_user_custom_handle') || '@leovitulli')
            : ('@' + (cleanEmail ? cleanEmail.split('@')[0] : 'cantor'));
        }

        var existingUser = (existingIdx >= 0 ? list[existingIdx] : null);
        var sPhone = profile.phone || (existingUser ? existingUser.phone : '') || '';
        var sCpf = profile.cpf || (existingUser ? existingUser.cpf : '') || '';
        var sInsta = profile.instagram || (existingUser ? existingUser.instagram : '') || (cleanEmail === 'leovitulli@gmail.com' ? '@leovitulli' : '');

        profile.phone = sPhone;
        profile.cpf = sCpf;
        profile.instagram = sInsta;

        var singerItem = {
          id: profile.id || (existingUser ? existingUser.id : ('user-' + Date.now())),
          name: profile.display_name || profile.name || (existingUser ? existingUser.name : profile.email.split('@')[0]),
          email: profile.email,
          phone: sPhone,
          cpf: sCpf,
          instagram: sInsta,
          singer_code: sCode,
          plan_tier: profile.plan_tier || (existingUser ? existingUser.plan_tier : 'pro'),
          plan_type: profile.plan_type || (existingUser ? existingUser.plan_type : '💎 PRO ANUAL'),
          is_online: true,
          status_text: '🟢 Conectado e Ativo',
          reps_count: (existingUser && existingUser.reps_count) || 0,
          songs_count: (existingUser && existingUser.songs_count) || 0,
          last_seen: 'Agora mesmo',
          created_at: profile.created_at || (existingUser ? existingUser.created_at : new Date().toISOString().slice(0, 10))
        };

        if (existingIdx >= 0) {
          list[existingIdx] = Object.assign({}, list[existingIdx], singerItem);
        } else {
          list.unshift(singerItem);
        }
        localStorage.setItem('canta_ai_admin_users', JSON.stringify(list));

        if (window.PrompterAdmin && Array.isArray(window.PrompterAdmin.allUserData)) {
          var admIdx = window.PrompterAdmin.allUserData.findIndex(function(u) {
            return (u.email && u.email.trim().toLowerCase() === cleanEmail) || (profile.id && u.id === profile.id);
          });
          if (admIdx >= 0) {
            window.PrompterAdmin.allUserData[admIdx] = Object.assign({}, window.PrompterAdmin.allUserData[admIdx], singerItem);
          } else {
            window.PrompterAdmin.allUserData.unshift(singerItem);
          }
          if (typeof window.PrompterAdmin.renderUsersTable === 'function') {
            window.PrompterAdmin.renderUsersTable();
            window.PrompterAdmin.updateMetrics();
          }
        }

        // Sincronizar no System Registry na nuvem
        var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
        if (sb) {
          var regId = '3e42c00c-f10c-4b05-96b6-b782403d1d17';
          var songRow = {
            repertoire_id: regId,
            title: singerItem.name,
            artist: singerItem.email,
            content: JSON.stringify(singerItem)
          };
          sb.from('songs')
            .select('id')
            .eq('repertoire_id', regId)
            .eq('artist', singerItem.email)
            .then(function(res) {
              if (res.data && res.data.length > 0) {
                songRow.id = res.data[0].id;
              }
              sb.from('songs').upsert(songRow).catch(function() {});
            }).catch(function() {
              sb.from('songs').upsert(songRow).catch(function() {});
            });
        }
      } catch (e) {
        console.warn('Erro em syncNewUserToAdmin:', e);
      }
    },

    signIn: function (identifier, password) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var cleanId = (identifier || '').trim().toLowerCase();

      // Limpar estado residual de sessão anterior
      localStorage.removeItem('prompter_active_state');
      if (window.PrompterDB && typeof PrompterDB.invalidateCache === 'function') {
        PrompterDB.invalidateCache();
      }
      if (window.CantaApp && typeof window.CantaApp.resetActiveState === 'function') {
        window.CantaApp.resetActiveState();
      }

      if (!sb || !sb.auth || typeof sb.auth.signInWithPassword !== 'function') {
        return Promise.reject(new Error('Serviço de autenticação temporariamente indisponível.'));
      }

      // Se for formato de e-mail tradicional (sem começar com @ e contendo ponto e @)
      var isEmail = cleanId.indexOf('@') !== -1 && cleanId.indexOf('.') !== -1 && !cleanId.startsWith('@');

      var resolveEmailPromise = isEmail
        ? Promise.resolve(cleanId)
        : (function () {
            var formattedCode = PrompterAuth.formatSingerCode(cleanId);
            
            // Verificação imediata no login customizado do dispositivo
            var customH = localStorage.getItem('cantaai_user_custom_handle');
            if (customH && customH.toLowerCase() === formattedCode.toLowerCase()) {
              var rU = localStorage.getItem('prompter_auth_user');
              if (rU) {
                try {
                  var pU = JSON.parse(rU);
                  if (pU && pU.email) return Promise.resolve(pU.email);
                } catch(e) {}
              }
            }

            return sb.from('profiles').select('email').eq('singer_code', formattedCode).single().then(function (res) {
              if (res.data && res.data.email) return res.data.email;
              throw new Error('Nenhum cantor encontrado com o login "' + formattedCode + '".');
            }).catch(function () {
              return sb.from('profiles').select('email').ilike('singer_code', '%' + cleanId.replace('@', '')).limit(1).then(function (res2) {
                if (res2.data && res2.data[0] && res2.data[0].email) return res2.data[0].email;
                throw new Error('Não encontramos nenhum cantor com o login "' + cleanId + '".');
              });
            }).catch(function() {
              // Fallback resiliente: verificar no registro central (sem restrição RLS)
              return sb.from('songs').select('artist, content').eq('repertoire_id', '3e42c00c-f10c-4b05-96b6-b782403d1d17').then(function(sRes) {
                if (sRes.data && sRes.data.length > 0) {
                  for (var i = 0; i < sRes.data.length; i++) {
                    try {
                      var c = typeof sRes.data[i].content === 'string' ? JSON.parse(sRes.data[i].content) : sRes.data[i].content;
                      if (c && c.singer_code && c.singer_code.toLowerCase() === formattedCode.toLowerCase()) {
                        return c.email || sRes.data[i].artist;
                      }
                    } catch(e) {}
                  }
                }
                // Fallback local caso offline
                try {
                  var raw = localStorage.getItem('canta_ai_admin_users');
                  var uList = raw ? JSON.parse(raw) : [];
                  var match = uList.find(function(u) {
                    return u.singer_code && u.singer_code.toLowerCase() === formattedCode.toLowerCase();
                  });
                  if (match && match.email) return match.email;
                } catch(e) {}
                throw new Error('Não encontramos nenhum cantor com o login "' + cleanId + '".');
              });
            });
          })();

      return resolveEmailPromise.then(function (resolvedEmail) {
        return sb.auth.signInWithPassword({ email: resolvedEmail, password: password });
      }).then(function (res) {
        if (res.error) {
          if (res.error.message.includes('Invalid login credentials') || res.error.message.includes('invalid_grant')) {
            throw new Error('Login/E-mail ou senha incorretos.');
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
          if (profile) PrompterAuth.syncNewUserToAdmin(profile);

          if (typeof window.loadRepertoires === 'function') {
            window.loadRepertoires();
          }

          return { user: user, profile: profile };
        });
      });
    },

    signOut: function () {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      localStorage.removeItem('prompter_auth_user');
      localStorage.removeItem('prompter_auth_profile');
      localStorage.removeItem('prompter_active_state');
      currentUser = null;
      currentProfile = null;

      if (window.PrompterDB && typeof PrompterDB.invalidateCache === 'function') {
        PrompterDB.invalidateCache();
      }

      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        sb.auth.signOut().catch(function () {});
      }

      this.updateUIForAuth();
      if (window.CantaApp && typeof window.CantaApp.resetActiveState === 'function') {
        window.CantaApp.resetActiveState();
      }
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
    //  PERFIL & ROLES (ISOLAMENTO SEGURO)
    // ═══════════════════════════════════════
    fetchProfile: function (userId) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var userEmail = currentUser ? currentUser.email : '';
      if (!userId && !userEmail) return Promise.resolve(null);

      var userCustomHandle = localStorage.getItem('cantaai_user_custom_handle');
      var defaultCode = userCustomHandle || ((userEmail === 'leovitulli@gmail.com') ? '@leovitulli' : ('@' + (userEmail ? userEmail.split('@')[0] : ('cantor_' + Math.floor(1000 + Math.random() * 9000)))));

      var defaultProfile = {
        id: userId || 'local_user',
        email: userEmail,
        display_name: userEmail ? userEmail.split('@')[0] : 'Cantor',
        role: userEmail === 'leovitulli@gmail.com' ? 'admin' : 'user',
        plan_tier: userEmail === 'leovitulli@gmail.com' ? 'pro' : 'free',
        plan_type: userEmail === 'leovitulli@gmail.com' ? '💎 PRO ANUAL' : '⚡ PLANO FREE',
        singer_code: defaultCode
      };

      if (!sb) return Promise.resolve(defaultProfile);

      return sb.from('profiles').select('*').then(function (res) {
        if (res.data && res.data.length > 0) {
          var found = res.data.find(function (p) {
            return p.id === userId || (p.email && userEmail && p.email.toLowerCase() === userEmail.toLowerCase());
          });
          if (found) {
            var fEmail = (found.email || userEmail || '').toLowerCase();
            var hadLegacyHash = found.singer_code && (found.singer_code.startsWith('#') || found.singer_code.toUpperCase().indexOf('CANTOR-') !== -1 || found.singer_code.toUpperCase().indexOf('DEV-ADMIN') !== -1);
            if (userCustomHandle && fEmail === 'leovitulli@gmail.com') {
              found.singer_code = userCustomHandle;
            } else if (!found.singer_code || hadLegacyHash) {
              found.singer_code = (fEmail === 'leovitulli@gmail.com')
                ? (userCustomHandle || '@leovitulli')
                : ('@' + (fEmail ? fEmail.split('@')[0] : 'cantor'));
            } else if (!found.singer_code.startsWith('@')) {
              found.singer_code = '@' + found.singer_code;
            }
            // Sincronizar com o banco Supabase para reparar o hash legado na nuvem
            if (sb && found.id && hadLegacyHash) {
              sb.from('profiles').update({ singer_code: found.singer_code }).eq('id', found.id).catch(function() {});
            }
            return found;
          }
        }
        return defaultProfile;
      }).catch(function () {
        return defaultProfile;
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
      var profileContainer = document.getElementById('userProfileDropdownContainer');
      var userInitial = document.getElementById('userAvatarInitial');
      var upmAvatarBig = document.getElementById('upmAvatarBig');
      var headerEmail = document.getElementById('userProfileHeaderEmail');
      var headerPlan = document.getElementById('userProfileHeaderPlan');
      var upmUserEmail = document.getElementById('upmUserEmail');
      var upmSingerCode = document.getElementById('upmSingerCode');
      var upmPlanBadge = document.getElementById('upmPlanBadge');
      var upmPlanDesc = document.getElementById('upmPlanDesc');
      var btnProfileAdmin = document.getElementById('btnProfileAdminGovernance');

      if (currentUser) {
        var email = (currentProfile && currentProfile.email) ? currentProfile.email : (currentUser.email || '');
        var displayName = (currentProfile && currentProfile.display_name) ? currentProfile.display_name : (email.split('@')[0] || 'Cantor');
        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        var initial = (displayName.charAt(0) || 'U').toUpperCase();
        var isPro = (currentProfile && currentProfile.plan_tier === 'pro') || email === 'leovitulli@gmail.com';
        var isAdm = this.isAdmin();
        var code = (currentProfile && currentProfile.singer_code) ? currentProfile.singer_code : ('@' + (email ? email.split('@')[0] : 'cantor'));

        if (profileContainer) profileContainer.classList.remove('hidden');
        if (userInitial) userInitial.innerText = initial;
        if (upmAvatarBig) upmAvatarBig.innerText = initial;
        if (headerEmail) headerEmail.innerText = displayName; // Exibe somente o NOME compacto
        if (headerPlan) {
          headerPlan.innerText = isPro ? 'PRO' : 'FREE';
          headerPlan.className = 'user-profile-plan-tag ' + (isPro ? 'plan-pro' : 'plan-free');
        }
        if (upmUserEmail) upmUserEmail.innerText = email;
        if (upmSingerCode) upmSingerCode.innerText = code;

        if (upmPlanBadge) {
          upmPlanBadge.innerHTML = isPro ? '👑 PLANO CANTAAÍ PRO' : '⚡ PLANO FREE';
        }
        if (upmPlanDesc) {
          upmPlanDesc.innerText = isPro ? 'Acesso Total Ilimitado • Modo Offline & Ao Vivo' : 'Repertórios Básicos • Faça Upgrade para PRO';
        }

        if (btnProfileAdmin) {
          if (isAdm) {
            btnProfileAdmin.classList.remove('hidden');
          } else {
            btnProfileAdmin.classList.add('hidden');
          }
        }

        // Limpar qualquer autofill indevido do navegador na barra de busca
        var sIn = document.getElementById('searchInput');
        if (sIn && (sIn.value.indexOf('@') !== -1 || (currentUser && sIn.value === currentUser.email))) {
          sIn.value = '';
        }
      } else {
        if (profileContainer) profileContainer.classList.add('hidden');
      }
    },

    saveProfileDetails: function(name, singerCode) {
      if (!currentUser) return Promise.reject(new Error('Usuário não logado'));
      if (!currentProfile) currentProfile = {};
      
      var cleanCode = this.formatSingerCode(singerCode || '');
      if (cleanCode.startsWith('#') || cleanCode.toUpperCase().indexOf('CANTOR-') !== -1 || cleanCode.toUpperCase().indexOf('DEV-ADMIN') !== -1) {
        cleanCode = '@' + cleanCode.replace(/^[#@]+/, '');
      }
      if (!cleanCode && currentUser && currentUser.email) {
        cleanCode = '@' + currentUser.email.split('@')[0];
      }
      
      currentProfile.display_name = name;
      if (cleanCode) {
        currentProfile.singer_code = cleanCode;
        try {
          localStorage.setItem('cantaai_user_custom_handle', cleanCode);
        } catch(e) {}
      }

      this.saveSession(currentUser, currentProfile);
      this.updateUIForAuth();

      // Sincronizar também no cache do adminPanel (allUserData / canta_ai_admin_users)
      try {
        var rawUsers = localStorage.getItem('canta_ai_admin_users');
        var uList = rawUsers ? JSON.parse(rawUsers) : [];
        var myIdx = uList.findIndex(function(u) {
          return (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
                 (currentUser.id && u.id === currentUser.id);
        });
        if (myIdx >= 0) {
          uList[myIdx].name = name;
          if (cleanCode) uList[myIdx].singer_code = cleanCode;
        } else {
          uList.unshift({
            id: currentUser.id || 'user-' + Date.now(),
            name: name,
            email: currentUser.email || '',
            singer_code: cleanCode || '@cantor',
            plan_tier: currentProfile.plan_tier || 'pro',
            plan_type: currentProfile.plan_type || '💎 PRO ANUAL',
            is_online: true,
            status_text: '🟢 Conectado e Ativo',
            last_seen: 'Agora mesmo'
          });
        }
        localStorage.setItem('canta_ai_admin_users', JSON.stringify(uList));

        // Sincronizar na memória ativa do adminPanel se estiver aberto
        if (window.PrompterAdmin && Array.isArray(window.PrompterAdmin.allUserData)) {
          var admIdx = window.PrompterAdmin.allUserData.findIndex(function(u) {
            return (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
                   (currentUser.id && u.id === currentUser.id);
          });
          if (admIdx >= 0) {
            window.PrompterAdmin.allUserData[admIdx].name = name;
            if (cleanCode) window.PrompterAdmin.allUserData[admIdx].singer_code = cleanCode;
            if (typeof window.PrompterAdmin.renderUsersTable === 'function') {
              window.PrompterAdmin.renderUsersTable();
            }
          }
        }
      } catch(e) {}

      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        var payload = {
          display_name: name,
          updated_at: new Date().toISOString()
        };
        if (cleanCode) payload.singer_code = cleanCode;

        // Atualizar tanto por ID quanto por email no profiles
        sb.from('profiles').update(payload).eq('id', currentUser.id).then(function(res) {
          if (res && res.error) {
            sb.from('profiles').update(payload).eq('email', currentUser.email).catch(function() {});
          }
        }).catch(function() {
          sb.from('profiles').update(payload).eq('email', currentUser.email).catch(function() {});
        });

        // Atualizar no System Registry em songs
        var regId = '3e42c00c-f10c-4b05-96b6-b782403d1d17';
        sb.from('songs').select('id, content').eq('repertoire_id', regId).eq('artist', currentUser.email).then(function(res) {
          if (res.data && res.data.length > 0) {
            var row = res.data[0];
            var obj = null;
            try { obj = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; } catch(e) {}
            if (!obj) obj = {};
            obj.name = name;
            if (cleanCode) obj.singer_code = cleanCode;
            sb.from('songs').update({ title: name, content: JSON.stringify(obj) }).eq('id', row.id).catch(function() {});
          } else {
            var newRegObj = {
              id: currentUser.id,
              name: name,
              email: currentUser.email,
              singer_code: cleanCode || '@cantor',
              plan_tier: currentProfile.plan_tier || 'pro',
              plan_type: currentProfile.plan_type || '💎 PRO ANUAL',
              is_online: true,
              status_text: '🟢 Conectado e Ativo',
              last_seen: 'Hoje'
            };
            sb.from('songs').insert({
              repertoire_id: regId,
              title: name,
              artist: currentUser.email,
              content: JSON.stringify(newRegObj)
            }).catch(function() {});
          }
        }).catch(function() {});
      }
      return Promise.resolve(true);
    },

    saveDisplayName: function(name) {
      return this.saveProfileDetails(name);
    }
  };

  window.PrompterAuth = PrompterAuth;
})();
