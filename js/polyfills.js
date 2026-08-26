/**
 * PrompterCantor - Polyfills para iOS 10.3.4 (iPad 4 / WebKit Legado)
 * Garante que todos os métodos e utilitários funcionem sem erros no Safari antigo.
 */

(function() {
  'use strict';

  // Polyfill globalThis
  if (typeof globalThis === 'undefined') {
    (function() {
      if (typeof self !== 'undefined') { self.globalThis = self; }
      else if (typeof window !== 'undefined') { window.globalThis = window; }
      else if (typeof global !== 'undefined') { global.globalThis = global; }
    })();
  }

  // Polyfill AbortController (necessário para @supabase/supabase-js em navegadores antigos)
  if (typeof AbortController === 'undefined') {
    window.AbortController = function AbortController() {
      this.signal = { aborted: false, addEventListener: function() {}, removeEventListener: function() {} };
      this.abort = function() { this.signal.aborted = true; };
    };
  }

  // Polyfill crypto.randomUUID
  if (!window.crypto) window.crypto = {};
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  }

  // Polyfill Promise.prototype.finally
  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function(callback) {
      var P = this.constructor;
      return this.then(
        function(value) { return P.resolve(callback()).then(function() { return value; }); },
        function(reason) { return P.resolve(callback()).then(function() { throw reason; }); }
      );
    };
  }

  // Polyfill Object.values
  if (!Object.values) {
    Object.values = function(obj) {
      if (obj == null) throw new TypeError('Cannot convert undefined or null to object');
      var res = [];
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          res.push(obj[key]);
        }
      }
      return res;
    };
  }

  // Polyfill Object.entries
  if (!Object.entries) {
    Object.entries = function(obj) {
      if (obj == null) throw new TypeError('Cannot convert undefined or null to object');
      var res = [];
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          res.push([key, obj[key]]);
        }
      }
      return res;
    };
  }

  // Polyfill Element.prototype.closest
  if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
      var el = this;
      do {
        if (el.matches && el.matches(s)) return el;
        if (el.webkitMatchesSelector && el.webkitMatchesSelector(s)) return el;
        if (el.msMatchesSelector && el.msMatchesSelector(s)) return el;
        el = el.parentElement || el.parentNode;
      } while (el !== null && el.nodeType === 1);
      return null;
    };
  }

  // Polyfill Array.prototype.includes
  if (!Array.prototype.includes) {
    Array.prototype.includes = function(searchElement, fromIndex) {
      if (this == null) throw new TypeError('"this" is null or not defined');
      var o = Object(this);
      var len = o.length >>> 0;
      if (len === 0) return false;
      var n = fromIndex | 0;
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
      while (k < len) {
        if (o[k] === searchElement) return true;
        k++;
      }
      return false;
    };
  }

  // Polyfill String.prototype.includes
  if (!String.prototype.includes) {
    String.prototype.includes = function(search, start) {
      if (typeof start !== 'number') start = 0;
      if (start + search.length > this.length) return false;
      return this.indexOf(search, start) !== -1;
    };
  }

  // Polyfill Array.prototype.find
  if (!Array.prototype.find) {
    Array.prototype.find = function(predicate) {
      if (this == null) throw new TypeError('Array.prototype.find called on null or undefined');
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      var list = Object(this);
      var length = list.length >>> 0;
      var thisArg = arguments[1];
      for (var i = 0; i < length; i++) {
        var value = list[i];
        if (predicate.call(thisArg, value, i, list)) return value;
      }
      return undefined;
    };
  }

  // Polyfill Object.assign
  if (typeof Object.assign !== 'function') {
    Object.assign = function(target) {
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      var to = Object(target);
      for (var index = 1; index < arguments.length; index++) {
        var nextSource = arguments[index];
        if (nextSource != null) {
          for (var nextKey in nextSource) {
            if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
              to[nextKey] = nextSource[nextKey];
            }
          }
        }
      }
      return to;
    };
  }
})();

