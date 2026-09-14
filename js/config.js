window.SUPABASE_CONFIG = {
  url: 'https://hycicyjuprhrkwpmdxjy.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5Y2ljeWp1cHJocmt3cG1keGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzA0MzUsImV4cCI6MjEwMjMwNjQzNX0.OpIr06RoLcbHrJcdYkW85AIGeCr2isJEWVoD1m3pNe4'
};

window.MERCADO_PAGO_CONFIG = {
  publicKey: 'APP_USR-a2cab50d-8339-47c4-8e09-d5579f50f650',
  accessToken: 'APP_USR-1840710581391633-090520-875d1432839c41e0eb371eef24ca36a5-76594620',
  clientId: '1840710581391633',
  clientSecret: 'Dtc70YbHAjjydyFNTtYVZMUoYuHtHHy7',
  env: 'production'
};

// ── GERENCIADOR CENTRALIZADO E DINÂMICO DE CUPONS DO SISTEMA ──
window.PrompterCoupons = {
  STORAGE_KEY: 'canta_ai_admin_coupons',
  DEFAULT_COUPONS: [
    { id: 'c-1', code: 'VIP100', discount: '100% OFF', type: 'vip', uses: 14, maxUses: 50, status: 'active', desc: 'Acesso VIP Anual Gratuito' },
    { id: 'c-2', code: 'PRO50', discount: '50% OFF', type: 'percent', uses: 38, maxUses: 100, status: 'active', desc: '50% de Desconto na Assinatura' },
    { id: 'c-3', code: 'SAMBA30', discount: '30% OFF', type: 'percent', uses: 19, maxUses: 200, status: 'active', desc: '30% OFF de Boas-Vindas' }
  ],

  getAll: function () {
    try {
      var raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return this.DEFAULT_COUPONS;
  },

  getActiveVipCoupon: function () {
    var list = this.getAll();
    var vip = list.find(function (c) {
      return c && c.status !== 'inactive' && (c.type === 'vip' || c.discount === '100% OFF' || (c.code && c.code.toUpperCase().indexOf('VIP') !== -1));
    });
    return vip || list[0] || { code: 'VIP100', discount: '100% OFF', type: 'vip' };
  },

  getActiveVipCouponCode: function () {
    var v = this.getActiveVipCoupon();
    return (v && v.code) ? v.code.toUpperCase() : 'VIP100';
  },

  findCoupon: function (code) {
    if (!code) return null;
    var clean = String(code).trim().toUpperCase();
    var list = this.getAll();
    return list.find(function (c) {
      return c && c.code && c.code.trim().toUpperCase() === clean && c.status !== 'inactive';
    }) || null;
  },

  isVipCoupon: function (code) {
    if (!code) return false;
    var clean = String(code).trim().toUpperCase();
    var activeVip = this.getActiveVipCoupon();
    if (activeVip && activeVip.code && activeVip.code.toUpperCase() === clean) return true;
    
    var found = this.findCoupon(clean);
    if (found && (found.type === 'vip' || found.discount === '100% OFF')) return true;

    return clean === 'VIP100' || clean === 'CANTORVIP' || clean === 'CORTESIA' || clean === 'DEV';
  },

  saveAll: function (couponsList) {
    if (!Array.isArray(couponsList)) return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(couponsList));
    } catch (e) {}

    var sysRepId = '00000000-0000-0000-0000-000000000001';
    var anon = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.key) ? window.SUPABASE_CONFIG.key : '';
    var supUrl = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) ? window.SUPABASE_CONFIG.url : '';
    if (supUrl && anon) {
      var row = {
        repertoire_id: sysRepId,
        title: 'Configuração de Cupons e Descontos do Sistema',
        artist: 'SYSTEM_CONFIG_COUPONS',
        composer: 'COUPONS_V1',
        content: JSON.stringify(couponsList)
      };
      var checkUrl = supUrl.replace(/\/$/, '') + '/rest/v1/songs?repertoire_id=eq.' + encodeURIComponent(sysRepId) + '&artist=eq.SYSTEM_CONFIG_COUPONS&select=id';
      fetch(checkUrl, {
        headers: { 'apikey': anon, 'Authorization': 'Bearer ' + anon }
      }).then(function(r) { return r.ok ? r.json() : []; }).then(function(rows) {
        var songsUrl = supUrl.replace(/\/$/, '') + '/rest/v1/songs';
        if (Array.isArray(rows) && rows.length > 0) {
          fetch(songsUrl + '?id=eq.' + encodeURIComponent(rows[0].id), {
            method: 'PATCH',
            headers: { 'apikey': anon, 'Authorization': 'Bearer ' + anon, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(row)
          }).catch(function() {});
        } else {
          fetch(songsUrl, {
            method: 'POST',
            headers: { 'apikey': anon, 'Authorization': 'Bearer ' + anon, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify([row])
          }).catch(function() {});
        }
      }).catch(function() {});
    }

    if (window.PrompterCloud && typeof window.PrompterCloud.broadcastEvent === 'function') {
      window.PrompterCloud.broadcastEvent('coupons_updated', { coupons: couponsList });
    }
  },

  syncFromCloud: function () {
    var self = this;
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.key) {
      var baseUrl = window.SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1';
      var anon = window.SUPABASE_CONFIG.key;
      var sysRepId = '00000000-0000-0000-0000-000000000001';
      fetch(baseUrl + '/songs?repertoire_id=eq.' + encodeURIComponent(sysRepId) + '&artist=eq.SYSTEM_CONFIG_COUPONS&select=content', {
        headers: { 'apikey': anon, 'Authorization': 'Bearer ' + anon }
      }).then(function(r) { return r.ok ? r.json() : []; }).then(function(rows) {
        if (Array.isArray(rows) && rows.length > 0 && rows[0].content) {
          try {
            var cloudCoupons = JSON.parse(rows[0].content);
            if (Array.isArray(cloudCoupons) && cloudCoupons.length > 0) {
              localStorage.setItem(self.STORAGE_KEY, JSON.stringify(cloudCoupons));
            }
          } catch (e) {}
        }
      }).catch(function() {});
    }
  }
};

try {
  window.PrompterCoupons.syncFromCloud();
} catch(e) {}
