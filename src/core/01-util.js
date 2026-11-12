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
  function extOf(name) { var i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; }

  /* ---------------------------------------------------------------
     ICONS: all drawn for this project. App icons are 48x48 tiles,
     UI glyphs are 24x24 strokes using currentColor.
     --------------------------------------------------------------- */
  // No SVG gradients/ids: duplicated ids inside hidden subtrees render blank in some browsers.
  function tile(c1, c2, inner) {
    return '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="3" y="3" width="42" height="42" rx="11" fill="' + c2 + '"/>' +
      '<path d="M3 30V14A11 11 0 0 1 14 3h20a11 11 0 0 1 11 11v2C30 16 14 22 3 30z" fill="' + c1 + '" opacity=".75"/>' +
      inner + '</svg>';
  }
  var W = 'fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
  var appIcons = {
    explorer: tile('#ffbe55', '#f08a24', '<path d="M12 17a3 3 0 0 1 3-3h6l3 3h9a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#fff" opacity=".95"/><path d="M12 22h24" stroke="#f3a43a" stroke-width="2"/>'),
    notepad: tile('#5fa8ff', '#3a6ef0', '<rect x="14" y="11" width="20" height="26" rx="3" fill="#fff"/><path d="M18 18h12M18 23h12M18 28h8" stroke="#4a82f5" stroke-width="2.2" stroke-linecap="round"/>'),
    todo: tile('#4fd69c', '#16a06a', '<path d="M14 17l3 3 5-6M14 29l3 3 5-6" ' + W + '/><path d="M26 17h9M26 29h9" ' + W + '/>'),
    calculator: tile('#8e9bb3', '#4f5c78', '<rect x="14" y="10" width="20" height="28" rx="3.5" fill="#fff"/><rect x="17" y="13" width="14" height="6" rx="1.5" fill="#5e6b88"/><g fill="#5e6b88"><circle cx="19" cy="25" r="1.8"/><circle cx="24" cy="25" r="1.8"/><circle cx="29" cy="25" r="1.8"/><circle cx="19" cy="31" r="1.8"/><circle cx="24" cy="31" r="1.8"/></g><rect x="27.2" y="29.2" width="3.6" height="5.6" rx="1.2" fill="#f08a24"/>'),
    paint: tile('#ff7aa8', '#c93ad8', '<path d="M32 12c2 0 4 2 4 4L24 30l-5-5z" fill="#fff"/><path d="M18 27l4 4c0 4-3 6-8 5 2-1 1-3 1-5 0-2 1-4 3-4z" fill="#ffe36b"/>'),
    settings: tile('#a3adc2', '#69758f', '<circle cx="24" cy="24" r="5" ' + W + '/><path d="M24 11v4M24 33v4M11 24h4M33 24h4M14.8 14.8l2.8 2.8M30.4 30.4l2.8 2.8M14.8 33.2l2.8-2.8M30.4 17.6l2.8-2.8" ' + W + '/>'),
    terminal: tile('#3b4252', '#191d26', '<path d="M14 18l6 5-6 5" fill="none" stroke="#7dffb2" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M23 30h11" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>'),
    generic: tile('#9aa6ff', '#6670e0', '<rect x="13" y="13" width="22" height="22" rx="4" ' + W + '/>')
  };

  function glyph(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' + d + '</svg>';
  }
  var icons = {
    start: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="8" height="8" rx="2.4" fill="#5b6cf0"/><rect x="13" y="3" width="8" height="8" rx="2.4" fill="#f08a24"/><rect x="3" y="13" width="8" height="8" rx="2.4" fill="#16a06a"/><rect x="13" y="13" width="8" height="8" rx="4" fill="#c93ad8"/></svg>',
    save: glyph('<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
    download: glyph('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    upload: glyph('<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>'),
    lock: glyph('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: glyph('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
    close: glyph('<path d="M6 6l12 12M18 6L6 18"/>'),
    minimize: glyph('<path d="M6 12h12"/>'),
    maximize: glyph('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
    restore: glyph('<rect x="5" y="9" width="10" height="10" rx="1.5"/><path d="M9 9V6.5A1.5 1.5 0 0 1 10.5 5h7A1.5 1.5 0 0 1 19 6.5v7a1.5 1.5 0 0 1-1.5 1.5H15"/>'),
    folder: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="#f5a83a"/><path d="M3 10h18" stroke="#fff" stroke-opacity=".5"/></svg>',
    file: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#c9d1e3"/><path d="M14 3v5h5" fill="#a9b4cc"/></svg>',
    fileText: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#6ea2ff"/><path d="M14 3v5h5" fill="#4a7ee8"/><path d="M8.5 12.5h7M8.5 15.5h7M8.5 18h4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>',
    fileImage: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#e06ad3"/><path d="M14 3v5h5" fill="#b948ad"/><path d="M7.5 18.5l3-4 2 2.5 1.5-1.5 2.5 3z" fill="#fff"/><circle cx="10" cy="11.5" r="1.4" fill="#fff"/></svg>',
    newFolder: glyph('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M12 11v5M9.5 13.5h5"/>'),
    newFile: glyph('<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M12 11v6M9 14h6"/>'),
    rename: glyph('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    trash: glyph('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    move: glyph('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M9 13.5h6M12.5 11l2.5 2.5-2.5 2.5"/>'),
    up: glyph('<path d="M12 19V6M6 11l6-6 6 6"/>'),
    open: glyph('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    undo: glyph('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    brush: glyph('<path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L12 16l-4-4z"/><path d="M8 12c-2.5 0-4 2-4 4 0 1.5-1 2.5-2 3 4 1 8 0 8-4z"/>'),
    eraser: glyph('<path d="M7 20h13M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H7.5z"/><path d="M9 11l5 5"/>'),
    clear: glyph('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    plus: glyph('<path d="M12 5v14M5 12h14"/>'),
    grip: glyph('<circle cx="9" cy="6" r=".8"/><circle cx="15" cy="6" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="18" r=".8"/><circle cx="15" cy="18" r=".8"/>'),
    edit: glyph('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    eye: glyph('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    chevUp: glyph('<path d="M6 15l6-6 6 6"/>'),
    chevDown: glyph('<path d="M6 9l6 6 6-6"/>'),
    info: glyph('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    shield: glyph('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    sun: glyph('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: glyph('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    database: glyph('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
    file2: glyph('<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
    folderOpen: glyph('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>'),
    image: glyph('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
    palette: glyph('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.5A4.5 4.5 0 0 0 21 9.9C21 6 16.9 3 12 3z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
    warning: glyph('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>')
  };

  window.OS = window.OS || {};
  OS.util = {
    h: h, Emitter: Emitter, uid: uid, bytesToB64: bytesToB64, b64ToBytes: b64ToBytes, utf8Len: utf8Len,
    formatBytes: formatBytes, formatDate: formatDate, debounce: debounce, clamp: clamp, escapeHtml: escapeHtml,
    downloadBlob: downloadBlob, extOf: extOf
  };
  OS.icons = icons;
  OS.appIcons = appIcons;
  OS.icon = function (name) { return h('span', { class: 'ico', html: icons[name] || icons.file }); };
})();
