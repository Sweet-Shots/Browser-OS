/* =====================================================================
   CORE 1: UTILITIES (DOM helper, events, encoding, formatting, icons)
   ===================================================================== */
(function () {
  'use strict';

  /** Tiny DOM builder: h('div', {class:'x', onclick: fn}, child, 'text') */
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k === 'html') e.innerHTML = v;            // only ever used with trusted static strings (icons)
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (typeof v !== 'string' && k in e) e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(e, x); }); return; }
    e.append(c.nodeType ? c : String(c));
  }

  /** Minimal event emitter */
  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (ev, fn) {
    (this._h[ev] = this._h[ev] || []).push(fn);
    var self = this;
    return function off() { self._h[ev] = (self._h[ev] || []).filter(function (f) { return f !== fn; }); };
  };
  Emitter.prototype.emit = function (ev, a, b) {
    (this._h[ev] || []).slice().forEach(function (fn) {
      try { fn(a, b); } catch (err) { console.error('[event ' + ev + ']', err); }
    });
  };

  function uid(n) {
    var bytes = new Uint8Array(n || 12);
    (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(bytes)
      : bytes.forEach(function (_, i) { bytes[i] = Math.random() * 256 | 0; });
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // ---- base64 <-> bytes (chunked so big files don't blow the stack) ----
  function bytesToB64(bytes) {
    var CH = 0x8000, parts = [];
    for (var i = 0; i < bytes.length; i += CH) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CH)));
    return btoa(parts.join(''));
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** UTF-8 byte length of a string without allocating */
  function utf8Len(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    var u = ['KB', 'MB', 'GB'], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }
  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function basename(name) { var i = name.lastIndexOf('.'); return i > 0 ? name.slice(0, i) : name; }
  function timeAgo(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return formatDate(ts);
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function extOf(name) { var i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; }

  window.OS = window.OS || {};
  OS.util = {
    h: h, Emitter: Emitter, uid: uid, bytesToB64: bytesToB64, b64ToBytes: b64ToBytes, utf8Len: utf8Len,
    formatBytes: formatBytes, formatDate: formatDate, debounce: debounce, clamp: clamp, escapeHtml: escapeHtml,
    downloadBlob: downloadBlob, extOf: extOf, basename: basename, timeAgo: timeAgo, shuffle: shuffle
  };
})();
