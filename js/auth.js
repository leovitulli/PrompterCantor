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

          // Sanitizar imediatamente qualquer código legado (#CANTOR-...) e sincronizar
          var uEmail = ((currentProfile && currentProfile.email) || (currentUser && currentUser.email) || '').trim().toLowerCase();
          var customHandle = localStorage.getItem('cantaai_user_custom_handle');

          if (customHandle) {
            currentProfile.singer_code = customHandle;
          } else if (!currentProfile.singer_code || currentProfile.singer_code.startsWith('#') || currentProfile.singer_code.toUpperCase().indexOf('CANTOR-') !== -1) {
            currentProfile.singer_code = (uEmail === 'leovitulli@gmail.com') ? '@leovitulli' : ('@' + (uEmail ? uEmail.split('@')[0] : 'cantor'));
          }

          if (uEmail === 'leovitulli@gmail.com' && (!currentProfile.instagram || currentProfile.instagram === '')) {
            currentProfile.instagram = '@leovitulli';
          }

          if (uEmail === 'alinecrissallai@gmail.com') {
            if (!currentProfile) currentProfile = {};
            currentProfile.is_vip = true;
            currentProfile.plan_tier = 'vip';
            currentProfile.plan_type = '👑 VIP 100% OFF';
            currentProfile.coupon_used = 'VIP100';
            currentProfile.billing_due_date = '2099-12-31T23:59:59.000Z';
          }

          // Sincronizar com canta_ai_admin_users caso haja alterações mais recentes salvas no painel
          try {
            var rawAdminList = localStorage.getItem('canta_ai_admin_users');
            if (rawAdminList) {
              var aList = JSON.parse(rawAdminList);
              var matchedUser = aList.find(function(u) {
                return (u.email && u.email.trim().toLowerCase() === uEmail) || (currentUser && currentUser.id && u.id === currentUser.id);
              });
              if (matchedUser) {
                if (matchedUser.singer_code) currentProfile.singer_code = matchedUser.singer_code;
                if (matchedUser.name) currentProfile.display_name = matchedUser.name;
                if (matchedUser.plan_tier) currentProfile.plan_tier = matchedUser.plan_tier;
                if (matchedUser.plan_type) currentProfile.plan_type = matchedUser.plan_type;
                if (matchedUser.is_vip !== undefined) currentProfile.is_vip = matchedUser.is_vip;
                if (matchedUser.coupon_used) currentProfile.coupon_used = matchedUser.coupon_used;
                if (matchedUser.instagram) currentProfile.instagram = matchedUser.instagram;
                if (matchedUser.phone) currentProfile.phone = matchedUser.phone;
                if (matchedUser.cpf) currentProfile.cpf = matchedUser.cpf;
              }
            }
          } catch(e) {}

          this.saveSession(currentUser, currentProfile);
          this.updateUIForAuth();
          this.heartbeatLastSeen();
          if (currentProfile) this.syncNewUserToAdmin(currentProfile);
        } catch (e) {
          console.warn('Erro ao restaurar sessão local:', e);
        }
      }

      // Listener para eventos de autenticação Supabase (incluindo PASSWORD_RECOVERY)
      if (sb && sb.auth && typeof sb.auth.onAuthStateChange === 'function') {
        try {
          sb.auth.onAuthStateChange(function (event, session) {
            console.log('🔔 [Supabase Auth Event]:', event);
            if (event === 'PASSWORD_RECOVERY') {
              console.log('🔑 [Supabase Auth]: Fluxo de recuperação de senha iniciado!');
              setTimeout(function () {
                if (typeof window.openResetPasswordModal === 'function') {
                  window.openResetPasswordModal();
                }
              }, 200);
            } else if (event === 'SIGNED_IN' && session && session.user) {
              currentUser = session.user;
              if (session.access_token) currentUser.access_token = session.access_token;
              PrompterAuth.fetchProfile(currentUser.id).then(function (profile) {
                currentProfile = profile;
                PrompterAuth.saveSession(currentUser, currentProfile);
                PrompterAuth.updateUIForAuth();
              });
            }
          });
        } catch(e) {
          console.warn('Erro ao registrar onAuthStateChange:', e);
        }
      }

      // Detecção de link de recuperação diretamente na URL (ex: #access_token=...&type=recovery)
      try {
        var urlHash = window.location.hash || '';
        if (urlHash.indexOf('type=recovery') !== -1 || (urlHash.indexOf('access_token=') !== -1 && urlHash.indexOf('recovery') !== -1)) {
          setTimeout(function () {
            if (typeof window.openResetPasswordModal === 'function') {
              window.openResetPasswordModal();
            }
          }, 350);
        }
      } catch(e) {}

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

    formatSingerCode: function (code, email) {
      if (!code) return '';
      var clean = String(code).trim().toLowerCase().replace(/\s+/g, '_');
      if (clean.startsWith('#') || clean.toUpperCase().indexOf('CANTOR-') !== -1 || clean.toUpperCase().indexOf('DEV-ADMIN') !== -1) {
        if (email) {
          var prefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
          return prefix || 'cantor';
        }
        return 'cantor';
      }
      clean = clean.replace(/^[#@]+/, '').replace(/[^a-z0-9._-]/g, '');
      return clean || '';
    },

    checkSingerCodeAvailability: function (code, currentUserId, currentUserEmail) {
      var formatted = this.formatSingerCode(code);
      if (!formatted || formatted.length < 2) {
        return Promise.resolve({ available: false, message: 'O código deve ter pelo menos 2 letras.' });
      }

      var cleanEmail = (currentUserEmail || '').toLowerCase().trim();
      var formattedClean = formatted.toLowerCase().replace(/^@+/, '');

      // 1. Verificar no cache local de usuários admin
      try {
        var raw = localStorage.getItem('canta_ai_admin_users');
        if (raw) {
          var list = JSON.parse(raw);
          var exists = list.some(function(u) {
            var uCode = (u.singer_code || '').toLowerCase().replace(/^@+/, '');
            var isSameUser = (currentUserId && String(u.id) === String(currentUserId)) ||
                             (cleanEmail && u.email && u.email.toLowerCase().trim() === cleanEmail);
            return uCode === formattedClean && !isSameUser;
          });
          if (exists) {
            return Promise.resolve({ available: false, code: formatted, message: formatted + ' já está em uso por outro cantor.' });
          }
        }
      } catch(e) {}

      // 2. Verificar no Supabase profiles
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (sb) {
        return sb.from('profiles').select('id, email, singer_code').or('singer_code.eq.' + formattedClean + ',singer_code.eq.@' + formattedClean).then(function(res) {
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

      var existingAdminUser = null;
      try {
        var rawAdmins = localStorage.getItem('canta_ai_admin_users');
        if (rawAdmins) {
          var aList = JSON.parse(rawAdmins);
          existingAdminUser = aList.find(function(u) {
            return u.email && u.email.trim().toLowerCase() === cleanEmail;
          });
        }
      } catch(e) {}

      var preExistingVip = !!(
        cleanEmail === 'alinecrissallai@gmail.com' ||
        (existingAdminUser && (existingAdminUser.is_vip || existingAdminUser.plan_tier === 'vip' || (existingAdminUser.plan_type && existingAdminUser.plan_type.indexOf('VIP') !== -1) || existingAdminUser.coupon_used === 'VIP100'))
      );
      var preExistingPro = preExistingVip || (existingAdminUser && existingAdminUser.plan_tier === 'pro');

      var isAline = cleanEmail === 'alinecrissallai@gmail.com';
      var isVipCoupon = coupon === 'VIP100' || coupon === 'CORTESIA' || coupon === 'DEV' || coupon === 'CANTORVIP' || isAline;
      var isVip = preExistingVip || isVipCoupon;
      var isPro = isVip || preExistingPro || cleanEmail === 'leovitulli@gmail.com';

      var planTier = isVip ? 'vip' : (isPro ? 'pro' : 'free');
      var planType = isVip
        ? ((existingAdminUser && existingAdminUser.plan_type) || '👑 VIP 100% OFF')
        : (isPro ? ((existingAdminUser && existingAdminUser.plan_type) || '💎 PRO ANUAL') : '⚡ PLANO FREE');
      var effectiveCoupon = coupon || (existingAdminUser ? existingAdminUser.coupon_used : '') || (isVip ? 'VIP100' : '');
      var effectiveDueDate = isVip ? '2099-12-31T23:59:59.000Z' : (existingAdminUser ? existingAdminUser.billing_due_date : null);
      
      var customSingerCode = (payload && payload.singerCode) ? PrompterAuth.formatSingerCode(payload.singerCode) : '';
      var singerCode = customSingerCode || (existingAdminUser && existingAdminUser.singer_code) || (cleanEmail === 'leovitulli@gmail.com' ? '@leovitulli' : ('@' + cleanEmail.split('@')[0]));

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
            plan_type: planType,
            is_vip: isVip,
            coupon_used: effectiveCoupon,
            terms_accepted_at: new Date().toISOString(),
            privacy_accepted_at: new Date().toISOString()
          }
        }
      }).then(function (res) {
        if (res.error) {
          var errStr = String(res.error.message || res.error.msg || res.error.error_description || res.error || '');
          if (errStr.indexOf('User already registered') !== -1 || errStr.indexOf('already exists') !== -1) {
            var existingProfileData = {
              email: cleanEmail,
              display_name: name || (existingAdminUser ? existingAdminUser.name : cleanEmail.split('@')[0]),
              phone: phone || (existingAdminUser ? existingAdminUser.phone : ''),
              cpf: cpf || (existingAdminUser ? existingAdminUser.cpf : ''),
              instagram: instagram || (existingAdminUser ? existingAdminUser.instagram : ''),
              singer_code: singerCode,
              role: cleanEmail === 'leovitulli@gmail.com' ? 'admin' : 'user',
              plan_tier: planTier,
              plan_type: planType,
              coupon_used: effectiveCoupon,
              is_vip: isVip,
              billing_due_date: effectiveDueDate,
              is_online: false,
              status_text: '⚪ Registrado',
              created_at: (existingAdminUser && existingAdminUser.created_at) || new Date().toISOString()
            };
            PrompterAuth.syncNewUserToAdmin(existingProfileData);
            if (sb) {
              sb.from('profiles').upsert(existingProfileData).catch(function () {});
            }
            throw new Error('Este e-mail já está cadastrado. Seus dados foram sincronizados no painel. Por favor, acesse pela aba "Entrar" com sua senha.');
          }
          if (errStr.indexOf('at least 6 characters') !== -1 || errStr.indexOf('least 6') !== -1) {
            throw new Error('A senha deve ter no mínimo 6 caracteres.');
          }
          throw new Error(errStr || 'Erro ao realizar cadastro.');
        }

        if (res.data && res.data.user && res.data.user.identities && res.data.user.identities.length === 0) {
          var existingProfileData2 = {
            id: res.data.user.id,
            email: cleanEmail,
            display_name: name || (existingAdminUser ? existingAdminUser.name : cleanEmail.split('@')[0]),
            phone: phone || (existingAdminUser ? existingAdminUser.phone : ''),
            cpf: cpf || (existingAdminUser ? existingAdminUser.cpf : ''),
            instagram: instagram || (existingAdminUser ? existingAdminUser.instagram : ''),
            singer_code: singerCode,
            role: cleanEmail === 'leovitulli@gmail.com' ? 'admin' : 'user',
            plan_tier: planTier,
            plan_type: planType,
            coupon_used: effectiveCoupon,
            is_vip: isVip,
            billing_due_date: effectiveDueDate,
            is_online: false,
            status_text: '⚪ Registrado',
            created_at: (existingAdminUser && existingAdminUser.created_at) || new Date().toISOString()
          };
          PrompterAuth.syncNewUserToAdmin(existingProfileData2);
          if (sb) {
            sb.from('profiles').upsert(existingProfileData2).catch(function () {});
          }
          throw new Error('Este e-mail já está cadastrado. Seus dados foram sincronizados no painel. Por favor, acesse pela aba "Entrar" com sua senha.');
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
          coupon_used: effectiveCoupon,
          is_vip: isVip,
          billing_due_date: effectiveDueDate,
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

        // Princípio da Imutabilidade de Privilégios: NUNCA rebaixar status VIP ou PRO
        var isVip = !!(
          cleanEmail === 'alinecrissallai@gmail.com' ||
          (profile && (profile.is_vip || profile.plan_tier === 'vip' || (profile.plan_type && profile.plan_type.indexOf('VIP') !== -1) || profile.coupon_used === 'VIP100')) ||
          (existingUser && (existingUser.is_vip || existingUser.plan_tier === 'vip' || (existingUser.plan_type && existingUser.plan_type.indexOf('VIP') !== -1) || existingUser.coupon_used === 'VIP100'))
        );

        var isPro = isVip ||
          cleanEmail === 'leovitulli@gmail.com' ||
          (profile && profile.plan_tier === 'pro') ||
          (existingUser && existingUser.plan_tier === 'pro');

        var resolvedTier = isVip ? 'vip' : (isPro ? 'pro' : ((profile && profile.plan_tier) || (existingUser && existingUser.plan_tier) || 'free'));
        var resolvedPlanType = isVip
          ? '👑 VIP 100% OFF'
          : (isPro
              ? ((profile && profile.plan_type && profile.plan_type.indexOf('MENSAL') !== -1) || (existingUser && existingUser.plan_type && existingUser.plan_type.indexOf('MENSAL') !== -1) ? '⚡ PRO MENSAL' : '💎 PRO ANUAL')
              : '⚡ PLANO FREE');
        var resolvedCoupon = (profile && profile.coupon_used) || (existingUser && existingUser.coupon_used) || (isVip ? 'VIP100' : '');
        var resolvedDueDate = isVip
          ? '2099-12-31T23:59:59.000Z'
          : ((existingUser && existingUser.billing_due_date) || (profile && profile.billing_due_date) || null);

        // Atualizar o próprio objeto profile em memória para consistência total da sessão
        profile.plan_tier = resolvedTier;
        profile.plan_type = resolvedPlanType;
        profile.is_vip = isVip;
        profile.coupon_used = resolvedCoupon;
        if (resolvedDueDate) profile.billing_due_date = resolvedDueDate;

        var singerItem = {
          id: profile.id || (existingUser ? existingUser.id : ('user-' + Date.now())),
          name: profile.display_name || profile.name || (existingUser ? existingUser.name : profile.email.split('@')[0]),
          email: profile.email,
          phone: sPhone,
          cpf: sCpf,
          instagram: sInsta,
          singer_code: sCode,
          plan_tier: resolvedTier,
          plan_type: resolvedPlanType,
          is_vip: isVip,
          coupon_used: resolvedCoupon,
          billing_due_date: resolvedDueDate,
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

        // Auto-cura de permissões no Supabase (garante que a nuvem nunca fique com status free defasado)
        var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
        if (sb && (profile.id || cleanEmail)) {
          var cloudUpdate = {
            plan_tier: resolvedTier,
            plan_type: resolvedPlanType,
            is_vip: isVip,
            coupon_used: resolvedCoupon,
            billing_due_date: resolvedDueDate
          };
          if (profile.id) {
            sb.from('profiles').update(cloudUpdate).eq('id', profile.id).catch(function() {});
          } else {
            sb.from('profiles').update(cloudUpdate).eq('email', cleanEmail).catch(function() {});
          }
        }

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
            if (typeof window.PrompterAdmin.updateSignupsBadge === 'function') {
              window.PrompterAdmin.updateSignupsBadge();
            }
          }
        }

        try {
          window.dispatchEvent(new CustomEvent('cantaai:new_user_signup', { detail: singerItem }));
        } catch (e) {}

        // Sincronizar no System Registry na nuvem
        var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
        if (sb) {
          var regId = '3e42c00c-f10c-4b05-96b6-b782403d1d17';
          var currentUid = (profile && profile.id) || (currentUser ? currentUser.id : null);
          var songRow = {
            repertoire_id: regId,
            user_id: (currentUid && String(currentUid).indexOf('-') !== -1 && String(currentUid).length >= 30) ? currentUid : null,
            title: singerItem.name,
            artist: singerItem.email,
            composer: singerItem.singer_code || '',
            content: JSON.stringify(singerItem)
          };
          sb.from('songs')
            .select('id')
            .eq('repertoire_id', regId)
            .eq('artist', singerItem.email)
            .then(function(res) {
              if (res.data && res.data.length > 0) {
                var existingRowId = res.data[0].id;
                sb.from('songs').update(songRow).eq('id', existingRowId).then(function() {}).catch(function() {});
              } else {
                sb.from('songs').insert(songRow).then(function() {}).catch(function() {});
              }
            }).catch(function() {
              sb.from('songs').insert(songRow).then(function() {}).catch(function() {});
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
            var rawNoAt = cleanId.replace(/^@+/, '').trim();
            var rawNoSpaces = rawNoAt.replace(/[\s_\.-]+/g, '');
            var rawUnderscore = rawNoAt.replace(/[\s\.-]+/g, '_');
            var formattedCode = PrompterAuth.formatSingerCode(cleanId);
            var formattedNoAt = (formattedCode || '').replace(/^@+/, '').trim();

            // 0. Reconhecimento instantâneo das contas oficiais / fundadoras
            if (rawNoSpaces === 'leoogum' || rawNoSpaces === 'leoogum23' || rawNoAt === 'leo ogum' || rawUnderscore === 'leo_ogum') {
              return Promise.resolve('leoogum23@gmail.com');
            }
            if (rawNoSpaces === 'aline' || rawNoSpaces === 'alinecriss' || rawNoSpaces === 'alinecrissallai' || rawNoAt.indexOf('aline criss') === 0) {
              return Promise.resolve('alinecrissallai@gmail.com');
            }
            if (rawNoSpaces === 'leovitulli' || rawNoSpaces === 'vitulli' || rawNoAt === 'leonardo vitulli' || rawNoSpaces === 'cantor') {
              return Promise.resolve('leovitulli@gmail.com');
            }

            // Função auxiliar de busca em lista de usuários por código, nome ou prefixo
            function findEmailInUserList(uList) {
              if (!Array.isArray(uList)) return null;
              for (var i = 0; i < uList.length; i++) {
                var u = uList[i];
                if (!u) continue;
                var uEmail = (u.email || '').toLowerCase().trim();
                var uCode = (u.singer_code || '').toLowerCase().trim().replace(/^@+/, '');
                var uCodeNoSpaces = uCode.replace(/[\s_\.-]+/g, '');
                var uName = (u.name || u.display_name || '').toLowerCase().trim();
                var uNameNoSpaces = uName.replace(/[\s_\.-]+/g, '');
                var emailPrefix = uEmail.split('@')[0].replace(/[\s_\.-]+/g, '');

                if (uCode && (uCode === rawNoAt || uCode === formattedNoAt || uCodeNoSpaces === rawNoSpaces)) {
                  return uEmail;
                }
                if (uName && (uName === rawNoAt || uNameNoSpaces === rawNoSpaces || (rawNoSpaces.length >= 4 && uNameNoSpaces.indexOf(rawNoSpaces) === 0))) {
                  return uEmail;
                }
                if (emailPrefix && emailPrefix === rawNoSpaces) {
                  return uEmail;
                }
              }
              return null;
            }

            // 1. Verificar cache local de usuários administrativos (canta_ai_admin_users)
            try {
              var rawAdm = localStorage.getItem('canta_ai_admin_users');
              if (rawAdm) {
                var matchAdm = findEmailInUserList(JSON.parse(rawAdm));
                if (matchAdm) return Promise.resolve(matchAdm);
              }
            } catch(e) {}

            // 2. Verificar lista ativa de usuários no PrompterAdmin se disponível
            if (window.PrompterAdmin && Array.isArray(window.PrompterAdmin.allUserData)) {
              var matchAdminActive = findEmailInUserList(window.PrompterAdmin.allUserData);
              if (matchAdminActive) return Promise.resolve(matchAdminActive);
            }

            // 3. Verificação de login customizado do dispositivo
            var customH = localStorage.getItem('cantaai_user_custom_handle');
            if (customH) {
              var chClean = customH.toLowerCase().replace(/^@+/, '');
              if (chClean === rawNoAt || chClean === rawNoSpaces || chClean === formattedNoAt) {
                var rU = localStorage.getItem('prompter_auth_user');
                if (rU) {
                  try {
                    var pU = JSON.parse(rU);
                    if (pU && pU.email) return Promise.resolve(pU.email);
                  } catch(e) {}
                }
              }
            }

            // 4. Consulta ao Supabase profiles (suportando com @ e sem @, e ilike em display_name)
            return sb.from('profiles').select('email, singer_code, display_name')
              .or('singer_code.eq.' + formattedNoAt + ',singer_code.eq.@' + formattedNoAt + ',singer_code.eq.' + rawNoAt + ',singer_code.eq.@' + rawNoAt + ',display_name.ilike.' + rawNoAt)
              .limit(5).then(function (res) {
                if (res.data && res.data.length > 0) {
                  var exact = res.data.find(function(p) {
                    var pCode = (p.singer_code || '').toLowerCase().replace(/^@+/, '');
                    var pName = (p.display_name || '').toLowerCase().replace(/[\s_\.-]+/g, '');
                    return pCode === rawNoAt || pCode === formattedNoAt || pName === rawNoSpaces;
                  });
                  return (exact || res.data[0]).email;
                }
                throw new Error('NotFound');
              }).catch(function () {
                // 5. Fallback resiliente: verificar no registro central de músicas (songs)
                return sb.from('songs').select('artist, content').eq('repertoire_id', '3e42c00c-f10c-4b05-96b6-b782403d1d17').then(function(sRes) {
                  if (sRes.data && sRes.data.length > 0) {
                    for (var i = 0; i < sRes.data.length; i++) {
                      try {
                        var c = typeof sRes.data[i].content === 'string' ? JSON.parse(sRes.data[i].content) : sRes.data[i].content;
                        if (!c) continue;
                        var cCode = (c.singer_code || '').toLowerCase().replace(/^@+/, '');
                        var cName = (c.name || c.display_name || '').toLowerCase().replace(/[\s_\.-]+/g, '');
                        if (cCode === rawNoAt || cCode === formattedNoAt || cName === rawNoSpaces) {
                          return c.email || sRes.data[i].artist;
                        }
                      } catch(e) {}
                    }
                  }
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
        if (res.data.session && res.data.session.access_token) {
          user.access_token = res.data.session.access_token;
        }

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
      var redirectUrl = window.location.origin + window.location.pathname;
      return sb.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl
      }).then(function (res) {
        if (res && res.error) throw res.error;
        return res;
      });
    },

    updatePassword: function (newPassword) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      if (!sb || !sb.auth || typeof sb.auth.updateUser !== 'function') {
        return Promise.reject(new Error('Serviço de atualização de senha indisponível.'));
      }
      return sb.auth.updateUser({ password: newPassword }).then(function (res) {
        if (res && res.error) throw res.error;
        return res.data;
      });
    },

    // ═══════════════════════════════════════
    //  PERFIL & ROLES (ISOLAMENTO SEGURO)
    // ═══════════════════════════════════════
    fetchProfile: function (userId) {
      var sb = window.PrompterCloud ? window.PrompterCloud.getClient() : null;
      var userEmail = currentUser ? currentUser.email : '';
      if (!userId && !userEmail) return Promise.resolve(null);

      var meta = (currentUser && (currentUser.user_metadata || currentUser.raw_user_meta_data || currentUser.app_metadata)) || {};
      var userCustomHandle = localStorage.getItem('cantaai_user_custom_handle');
      var defaultCode = userCustomHandle || ((userEmail === 'leovitulli@gmail.com') ? '@leovitulli' : ('@' + (userEmail ? userEmail.split('@')[0] : ('cantor_' + Math.floor(1000 + Math.random() * 9000)))));

      var adminUserPre = null;
      try {
        var rawAdm = localStorage.getItem('canta_ai_admin_users');
        if (rawAdm) {
          var admList = JSON.parse(rawAdm);
          adminUserPre = admList.find(function(u) {
            return (u.email && userEmail && u.email.trim().toLowerCase() === userEmail.trim().toLowerCase()) ||
                   (userId && u.id === userId);
          });
        }
      } catch(e) {}

      var isKnownVipPre = !!(
        userEmail === 'alinecrissallai@gmail.com' ||
        (adminUserPre && (adminUserPre.is_vip || adminUserPre.plan_tier === 'vip' || (adminUserPre.plan_type && adminUserPre.plan_type.indexOf('VIP') !== -1) || adminUserPre.coupon_used === 'VIP100'))
      );
      var isKnownProPre = isKnownVipPre || userEmail === 'leovitulli@gmail.com' || userEmail === 'leoogum23@gmail.com' || (adminUserPre && adminUserPre.plan_tier === 'pro') || (meta && meta.plan_tier === 'pro');

      var defaultProfile = {
        id: userId || (currentUser ? currentUser.id : 'local_user'),
        email: userEmail,
        display_name: meta.display_name || (adminUserPre && adminUserPre.name) || (userEmail ? userEmail.split('@')[0] : 'Cantor'),
        phone: meta.phone || (adminUserPre && adminUserPre.phone) || '',
        cpf: meta.cpf || (adminUserPre && adminUserPre.cpf) || '',
        instagram: meta.instagram || (adminUserPre && adminUserPre.instagram) || (userEmail === 'leovitulli@gmail.com' ? '@leovitulli' : ''),
        role: userEmail === 'leovitulli@gmail.com' ? 'admin' : 'user',
        plan_tier: isKnownVipPre ? 'vip' : (isKnownProPre ? 'pro' : (meta.plan_tier || 'free')),
        plan_type: isKnownVipPre ? '👑 VIP 100% OFF' : (isKnownProPre ? ((adminUserPre && adminUserPre.plan_type) || '💎 PRO ANUAL') : '⚡ PLANO FREE'),
        is_vip: isKnownVipPre,
        coupon_used: isKnownVipPre ? 'VIP100' : (adminUserPre ? adminUserPre.coupon_used : ''),
        billing_due_date: isKnownVipPre ? '2099-12-31T23:59:59.000Z' : (adminUserPre ? adminUserPre.billing_due_date : null),
        singer_code: meta.singer_code || (adminUserPre && adminUserPre.singer_code) || defaultCode
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
            if (userCustomHandle) {
              found.singer_code = userCustomHandle;
            } else if (!found.singer_code || hadLegacyHash) {
              found.singer_code = (fEmail === 'leovitulli@gmail.com')
                ? '@leovitulli'
                : ('@' + (fEmail ? fEmail.split('@')[0] : 'cantor'));
            } else if (!found.singer_code.startsWith('@')) {
              found.singer_code = '@' + found.singer_code;
            }
            if (fEmail === 'leovitulli@gmail.com' && (!found.instagram || found.instagram === '')) {
              found.instagram = '@leovitulli';
            }

            // Preservação de status VIP/PRO contra leitura padrão de 'free' da nuvem
            var knownAdminUser = adminUserPre;
            if (!knownAdminUser) {
              try {
                var rawAdmins = localStorage.getItem('canta_ai_admin_users');
                if (rawAdmins) {
                  var aList = JSON.parse(rawAdmins);
                  knownAdminUser = aList.find(function(u) {
                    return (u.email && u.email.trim().toLowerCase() === fEmail) || (found.id && u.id === found.id);
                  });
                }
              } catch(e) {}
            }

            var isVipFound = !!(
              fEmail === 'alinecrissallai@gmail.com' ||
              found.is_vip ||
              found.plan_tier === 'vip' ||
              (found.plan_type && found.plan_type.indexOf('VIP') !== -1) ||
              found.coupon_used === 'VIP100' ||
              (knownAdminUser && (knownAdminUser.is_vip || knownAdminUser.plan_tier === 'vip' || (knownAdminUser.plan_type && knownAdminUser.plan_type.indexOf('VIP') !== -1) || knownAdminUser.coupon_used === 'VIP100'))
            );

            var isProFound = isVipFound || fEmail === 'leovitulli@gmail.com' || found.plan_tier === 'pro' || (knownAdminUser && knownAdminUser.plan_tier === 'pro');

            if (isVipFound) {
              found.is_vip = true;
              found.plan_tier = 'vip';
              found.plan_type = '👑 VIP 100% OFF';
              found.coupon_used = found.coupon_used || (knownAdminUser && knownAdminUser.coupon_used) || 'VIP100';
              found.billing_due_date = '2099-12-31T23:59:59.000Z';
              // Curar nuvem caso esteja defasada
              if (sb && found.id && (!found.is_vip || found.plan_tier !== 'vip')) {
                sb.from('profiles').update({
                  is_vip: true,
                  plan_tier: 'vip',
                  plan_type: '👑 VIP 100% OFF',
                  coupon_used: found.coupon_used,
                  billing_due_date: found.billing_due_date
                }).eq('id', found.id).catch(function() {});
              }
            } else if (isProFound && found.plan_tier !== 'vip') {
              found.plan_tier = 'pro';
              if (!found.plan_type || found.plan_type.indexOf('FREE') !== -1) {
                found.plan_type = (knownAdminUser && knownAdminUser.plan_type) || '💎 PRO ANUAL';
              }
            }

            // Sincronizar com o banco Supabase para reparar o hash legado na nuvem
            if (sb && found.id && hadLegacyHash) {
              sb.from('profiles').update({ singer_code: found.singer_code }).eq('id', found.id).catch(function() {});
            }
            return found;
          }
        }
        // Se não estava na tabela profiles mas logou, registrar profile imediatamente
        if (userEmail && sb) {
          sb.from('profiles').upsert(defaultProfile).catch(function() {});
          PrompterAuth.syncNewUserToAdmin(defaultProfile);
        }
        return defaultProfile;
      }).catch(function () {
        if (userEmail && sb) {
          sb.from('profiles').upsert(defaultProfile).catch(function() {});
          PrompterAuth.syncNewUserToAdmin(defaultProfile);
        }
        return defaultProfile;
      });
    },

    saveSession: function (user, profile) {
      try {
        if (user) currentUser = user;
        if (profile) currentProfile = profile;
        if (currentUser) localStorage.setItem('prompter_auth_user', JSON.stringify(currentUser));
        if (currentProfile) localStorage.setItem('prompter_auth_profile', JSON.stringify(currentProfile));
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
        var cleanEmail = email.trim().toLowerCase();

        // 1. Sincronizar dados em tempo real com as alterações salvas em canta_ai_admin_users
        var userCustomHandleKey = 'cantaai_user_custom_handle_' + cleanEmail;
        var customHandle = localStorage.getItem(userCustomHandleKey);
        if (cleanEmail === 'leovitulli@gmail.com' && !customHandle) {
          customHandle = localStorage.getItem('cantaai_user_custom_handle');
        }

        try {
          var rawAdminList = localStorage.getItem('canta_ai_admin_users');
          if (rawAdminList) {
            var aList = JSON.parse(rawAdminList);
            var matchedUser = aList.find(function(u) {
              return (cleanEmail && u.email && u.email.trim().toLowerCase() === cleanEmail) ||
                     (currentUser.id && u.id === currentUser.id);
            });
            if (matchedUser) {
              if (!currentProfile) currentProfile = {};
              if (matchedUser.name) currentProfile.display_name = matchedUser.name;
              if (matchedUser.singer_code) currentProfile.singer_code = matchedUser.singer_code;
              if (matchedUser.plan_tier) currentProfile.plan_tier = matchedUser.plan_tier;
              if (matchedUser.plan_type) currentProfile.plan_type = matchedUser.plan_type;
              if (matchedUser.is_vip !== undefined) currentProfile.is_vip = matchedUser.is_vip;
              if (matchedUser.instagram) currentProfile.instagram = matchedUser.instagram;
              if (matchedUser.phone) currentProfile.phone = matchedUser.phone;
              if (matchedUser.cpf) currentProfile.cpf = matchedUser.cpf;
              if (matchedUser.billing_due_date) currentProfile.billing_due_date = matchedUser.billing_due_date;
              if (matchedUser.created_at) currentProfile.created_at = matchedUser.created_at;
              if (matchedUser.payment_method) currentProfile.payment_method = matchedUser.payment_method;
              if (matchedUser.card_last_four) currentProfile.card_last_four = matchedUser.card_last_four;
              if (matchedUser.card_brand) currentProfile.card_brand = matchedUser.card_brand;
              if (matchedUser.auto_renew !== undefined) currentProfile.auto_renew = matchedUser.auto_renew;
            }
          }
        } catch(e) {}

        if (customHandle) {
          if (!currentProfile) currentProfile = {};
          currentProfile.singer_code = customHandle;
        }

        // 2. Normalizar e sanitizar OBRIGATORIAMENTE o código do cantor (erradicar hashes como #CANTOR-3DEB6)
        var code = (currentProfile && currentProfile.singer_code) ? currentProfile.singer_code : '';
        if (!code || code.startsWith('#') || code.toUpperCase().indexOf('CANTOR-') !== -1 || code.toUpperCase().indexOf('DEV-ADMIN') !== -1) {
          code = (cleanEmail === 'leovitulli@gmail.com') ? (customHandle || '@leovitulli') : ('@' + (cleanEmail ? cleanEmail.split('@')[0] : 'cantor'));
        }
        if (!code.startsWith('@')) {
          code = '@' + code;
        }
        if (currentProfile) {
          currentProfile.singer_code = code;
          if (cleanEmail === 'leovitulli@gmail.com' && !currentProfile.instagram) {
            currentProfile.instagram = '@leovitulli';
          }
        }

        var displayName = (currentProfile && currentProfile.display_name) ? currentProfile.display_name : (email.split('@')[0] || 'Cantor');
        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        var initial = (displayName.charAt(0) || 'U').toUpperCase();

        var isVip = !!(currentProfile && (currentProfile.is_vip || (currentProfile.plan_type && currentProfile.plan_type.indexOf('VIP') !== -1) || currentProfile.plan_tier === 'vip' || currentProfile.coupon_used === 'VIP100' || cleanEmail === 'alinecrissallai@gmail.com'));
        var isPro = isVip || (currentProfile && currentProfile.plan_tier === 'pro') || cleanEmail === 'leovitulli@gmail.com';
        var planType = (currentProfile && currentProfile.plan_type) || (isVip ? '👑 VIP 100% OFF' : (isPro ? '💎 PRO ANUAL' : '⚡ PLANO FREE'));
        var isAdm = this.isAdmin();

        if (profileContainer) profileContainer.classList.remove('hidden');
        if (userInitial) userInitial.innerText = initial;
        if (upmAvatarBig) upmAvatarBig.innerText = initial;
        if (headerEmail) headerEmail.innerText = displayName; // Exibe somente o NOME compacto
        var saasStatus = (window.getSaaSUserStatus && typeof window.getSaaSUserStatus === 'function')
          ? window.getSaaSUserStatus()
          : null;
        var isTrialActive = saasStatus ? saasStatus.isTrial : !!(currentProfile && (currentProfile.is_trial || currentProfile.plan_tier === 'trial'));

        var isDev = (window.isPlatformDeveloper && window.isPlatformDeveloper(cleanEmail)) ||
                    cleanEmail === 'leovitulli@gmail.com' || cleanEmail === 'leonardovitulli@gmail.com' ||
                    (currentProfile && currentProfile.role === 'admin');

        if (headerPlan) {
          if (isDev) {
            headerPlan.innerText = 'DEV';
            headerPlan.className = 'user-profile-plan-tag plan-dev';
          } else if (isVip) {
            headerPlan.innerText = 'VIP';
            headerPlan.className = 'user-profile-plan-tag plan-vip';
          } else if (isTrialActive) {
            headerPlan.innerText = 'TESTE PRO';
            headerPlan.className = 'user-profile-plan-tag plan-trial';
          } else if (isPro) {
            headerPlan.innerText = 'PRO';
            headerPlan.className = 'user-profile-plan-tag plan-pro';
          } else {
            headerPlan.innerText = 'FREE';
            headerPlan.className = 'user-profile-plan-tag plan-free';
          }
        }
        if (upmUserEmail) upmUserEmail.innerText = email;
        if (upmSingerCode) upmSingerCode.innerText = code;

        if (upmPlanBadge) {
          if (isDev) {
            upmPlanBadge.innerHTML = '👑 CONTA DESENVOLVEDOR & SUPERADMIN';
          } else if (isVip) {
            upmPlanBadge.innerHTML = '👑 PLANO CANTAAÍ VIP';
          } else if (isTrialActive) {
            var days = saasStatus ? saasStatus.trialDaysLeft : 7;
            upmPlanBadge.innerHTML = '👑 DEGUSTAÇÃO PRO (' + days + 'D)';
          } else if (isPro) {
            upmPlanBadge.innerHTML = '👑 PLANO CANTAAÍ PRO';
          } else {
            upmPlanBadge.innerHTML = '⚡ PLANO FREE (5 Músicas)';
          }
        }
        if (upmPlanDesc) {
          if (isDev) {
            upmPlanDesc.innerText = 'Acesso Master Vitalício • Engenharia & Live Shows';
          } else if (isVip) {
            upmPlanDesc.innerText = 'Acesso VIP Vitalício • Modo Offline & Ao Vivo';
          } else if (isTrialActive) {
            upmPlanDesc.innerHTML = 'Degustação Liberada • <span style="color:#38bdf8;font-weight:700;">Garantir Plano Anual</span>';
          } else if (isPro) {
            upmPlanDesc.innerText = 'Acesso Total Ilimitado • Modo Offline & Ao Vivo';
          } else {
            upmPlanDesc.innerHTML = 'Limite de 5 músicas • <span style="color:#38bdf8;font-weight:700;">Desbloquear PRO</span>';
          }
        }

        if (btnProfileAdmin) {
          if (isAdm) {
            btnProfileAdmin.classList.remove('hidden');
            if (window.PrompterAdmin) {
              if (typeof window.PrompterAdmin.updateSignupsBadge === 'function') {
                window.PrompterAdmin.updateSignupsBadge();
              }
              if (typeof window.PrompterAdmin.setupRealtimeSignups === 'function') {
                window.PrompterAdmin.setupRealtimeSignups();
              }
            }
          } else {
            btnProfileAdmin.classList.add('hidden');
            var alertDot = document.getElementById('adminHeaderAlertDot');
            if (alertDot) alertDot.classList.add('hidden');
          }
        }

        // Ocultar "Notificações & Atendimento" para Administrador/Dev, pois já possui a Central de Governança
        var btnProfNotif = document.getElementById('btnProfileNotifications');
        if (btnProfNotif) {
          if (isDev || isAdm) {
            btnProfNotif.classList.add('hidden');
          } else {
            btnProfNotif.classList.remove('hidden');
          }
        }

        if (window.updateSaaSPlanBanner && typeof window.updateSaaSPlanBanner === 'function') {
          window.updateSaaSPlanBanner();
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

    saveProfileDetails: function(name, singerCode, phone, cpf, instagram) {
      if (!currentUser) return Promise.reject(new Error('Usuário não logado'));
      if (!currentProfile) currentProfile = {};
      
      var cleanCode = this.formatSingerCode(singerCode || '');
      if (cleanCode.startsWith('#') || cleanCode.toUpperCase().indexOf('CANTOR-') !== -1 || cleanCode.toUpperCase().indexOf('DEV-ADMIN') !== -1) {
        cleanCode = cleanCode.replace(/^[#@]+/, '');
      }
      if (!cleanCode && currentUser && currentUser.email) {
        cleanCode = currentUser.email.split('@')[0];
      }
      cleanCode = cleanCode.replace(/^@+/, '').trim().toLowerCase();
      
      var cleanEmail = (currentUser.email || '').trim().toLowerCase();
      var isDev = (window.isPlatformDeveloper && window.isPlatformDeveloper(cleanEmail)) ||
                  cleanEmail === 'leovitulli@gmail.com' || cleanEmail === 'leonardovitulli@gmail.com' ||
                  (currentProfile && currentProfile.role === 'admin');

      currentProfile.display_name = name;
      if (phone !== undefined) currentProfile.phone = phone;
      if (cpf !== undefined) currentProfile.cpf = cpf;
      if (instagram !== undefined) currentProfile.instagram = instagram;
      if (isDev) {
        currentProfile.role = 'admin';
      }

      if (cleanCode) {
        currentProfile.singer_code = cleanCode;
        try {
          localStorage.setItem('cantaai_user_custom_handle_' + cleanEmail, cleanCode);
          if (cleanEmail === 'leovitulli@gmail.com') {
            localStorage.setItem('cantaai_user_custom_handle', cleanCode);
          }
        } catch(e) {}
      }

      this.saveSession(currentUser, currentProfile);
      this.updateUIForAuth();

      // Sincronizar cache do adminPanel (allUserData / canta_ai_admin_users)
      try {
        var rawUsers = localStorage.getItem('canta_ai_admin_users');
        var uList = rawUsers ? JSON.parse(rawUsers) : [];
        if (isDev) {
          // O Desenvolvedor NUNCA deve residir na tabela de clientes CRM
          uList = uList.filter(function(u) {
            if (!u) return false;
            var ue = (u.email || '').toLowerCase().trim();
            return !((window.isPlatformDeveloper && window.isPlatformDeveloper(ue)) || ue === 'leovitulli@gmail.com' || ue === 'leonardovitulli@gmail.com' || u.id === 'admin-leovitulli-id');
          });
          localStorage.setItem('canta_ai_admin_users', JSON.stringify(uList));
          if (window.PrompterAdmin && Array.isArray(window.PrompterAdmin.allUserData)) {
            window.PrompterAdmin.allUserData = window.PrompterAdmin.allUserData.filter(function(u) {
              if (!u) return false;
              var ue = (u.email || '').toLowerCase().trim();
              return !((window.isPlatformDeveloper && window.isPlatformDeveloper(ue)) || ue === 'leovitulli@gmail.com' || ue === 'leonardovitulli@gmail.com' || u.id === 'admin-leovitulli-id');
            });
            if (typeof window.PrompterAdmin.renderUsersTable === 'function') {
              window.PrompterAdmin.renderUsersTable();
            }
          }
        } else {
          var myIdx = uList.findIndex(function(u) {
            return (u.email && cleanEmail && u.email.toLowerCase() === cleanEmail) ||
                   (currentUser.id && u.id === currentUser.id);
          });
          if (myIdx >= 0) {
            uList[myIdx].name = name;
            if (cleanCode) uList[myIdx].singer_code = cleanCode;
            if (phone !== undefined) uList[myIdx].phone = phone;
            if (cpf !== undefined) uList[myIdx].cpf = cpf;
            if (instagram !== undefined) uList[myIdx].instagram = instagram;
          } else {
            var isUserVipSaved = !!(currentProfile && (currentProfile.is_vip || currentProfile.plan_tier === 'vip' || (currentProfile.plan_type && currentProfile.plan_type.indexOf('VIP') !== -1) || currentProfile.coupon_used === 'VIP100'));
            uList.unshift({
              id: currentUser.id || 'user-' + Date.now(),
              name: name,
              email: currentUser.email || '',
              singer_code: cleanCode || '@cantor',
              phone: phone || '',
              cpf: cpf || '',
              instagram: instagram || '',
              plan_tier: isUserVipSaved ? 'vip' : (currentProfile.plan_tier || 'pro'),
              plan_type: isUserVipSaved ? '👑 VIP 100% OFF' : (currentProfile.plan_type || '💎 PRO ANUAL'),
              is_vip: isUserVipSaved,
              coupon_used: (currentProfile && currentProfile.coupon_used) || (isUserVipSaved ? 'VIP100' : ''),
              billing_due_date: isUserVipSaved ? '2099-12-31T23:59:59.000Z' : (currentProfile && currentProfile.billing_due_date ? currentProfile.billing_due_date : null),
              is_online: true,
              status_text: '🟢 Conectado e Ativo',
              last_seen: 'Agora mesmo'
            });
          }
          localStorage.setItem('canta_ai_admin_users', JSON.stringify(uList));

          if (window.PrompterAdmin && Array.isArray(window.PrompterAdmin.allUserData)) {
            var admIdx = window.PrompterAdmin.allUserData.findIndex(function(u) {
              return (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
                     (currentUser.id && u.id === currentUser.id);
            });
            if (admIdx >= 0) {
              window.PrompterAdmin.allUserData[admIdx].name = name;
              if (cleanCode) window.PrompterAdmin.allUserData[admIdx].singer_code = cleanCode;
              if (phone !== undefined) window.PrompterAdmin.allUserData[admIdx].phone = phone;
              if (cpf !== undefined) window.PrompterAdmin.allUserData[admIdx].cpf = cpf;
              if (instagram !== undefined) window.PrompterAdmin.allUserData[admIdx].instagram = instagram;
              if (typeof window.PrompterAdmin.renderUsersTable === 'function') {
                window.PrompterAdmin.renderUsersTable();
              }
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
        if (phone !== undefined) payload.phone = phone;
        if (cpf !== undefined) payload.cpf = cpf;
        if (instagram !== undefined) payload.instagram = instagram;
        if (isDev) payload.role = 'admin';

        if (currentProfile && (currentProfile.is_vip || currentProfile.plan_tier === 'vip')) {
          payload.is_vip = true;
          payload.plan_tier = 'vip';
          payload.plan_type = '👑 VIP 100% OFF';
          payload.coupon_used = currentProfile.coupon_used || 'VIP100';
          payload.billing_due_date = '2099-12-31T23:59:59.000Z';
        }

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
            var isRegVip = !!(currentProfile && (currentProfile.is_vip || currentProfile.plan_tier === 'vip' || (currentProfile.plan_type && currentProfile.plan_type.indexOf('VIP') !== -1) || currentProfile.coupon_used === 'VIP100'));
            var newRegObj = {
              id: currentUser.id,
              name: name,
              email: currentUser.email,
              singer_code: cleanCode || '@cantor',
              plan_tier: isRegVip ? 'vip' : (currentProfile.plan_tier || 'pro'),
              plan_type: isRegVip ? '👑 VIP 100% OFF' : (currentProfile.plan_type || '💎 PRO ANUAL'),
              is_vip: isRegVip,
              coupon_used: (currentProfile && currentProfile.coupon_used) || (isRegVip ? 'VIP100' : ''),
              billing_due_date: isRegVip ? '2099-12-31T23:59:59.000Z' : (currentProfile && currentProfile.billing_due_date ? currentProfile.billing_due_date : null),
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
