/* =====================================================================
   CORE 6: UI HELPERS (non-blocking dialogs, VFS pickers, toasts, notices)
   Apps must use these instead of window.alert/confirm/prompt.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  function layer(id) {
    var el = document.getElementById(id);
    if (!el) { el = h('div', { id: id }); document.getElementById('os-root').appendChild(el); }
    return el;
  }

  /**
   * Generic modal. opts: { title, body: Node|string, buttons:[{label,value,primary,danger}], wide,
   *   onSubmit(value) -> false to keep open, initialFocus: Node, cancelValue }
   * Resolves with the chosen button's value.
   */
  function modal(opts) {
    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var errEl = h('div', { class: 'modal-error' });
      var body = typeof opts.body === 'string' ? textBlock(opts.body) : opts.body;
      var buttons = (opts.buttons || [{ label: 'OK', value: true, primary: true }]).map(function (b) {
        return h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), type: 'button',
          onclick: function () { submit(b.value); } }, b.label);
      });
      var box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
        opts.title ? h('div', { class: 'modal-title' }, opts.title) : null,
        h('div', { class: 'modal-body' }, body, errEl),
        h('div', { class: 'modal-buttons' }, buttons));
      var overlay = h('div', { class: 'modal-overlay' }, box);
      var cancelValue = 'cancelValue' in opts ? opts.cancelValue : null;
      var done = false;

      async function submit(v) {
        if (done) return;
        if (opts.onSubmit && v !== cancelValue) {
          var r;
          try { r = await opts.onSubmit(v); } catch (e) { errEl.textContent = e.message; return; }
          if (r === false) return;
          if (typeof r === 'string') { errEl.textContent = r; return; }
        }
        done = true;
        overlay.remove();
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) try { prevFocus.focus(); } catch (e) { /* ignore */ }
        resolve(v);
      }
      overlay.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); submit(cancelValue); }
        else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
          var p = (opts.buttons || []).find(function (b) { return b.primary; });
          if (p) { e.preventDefault(); submit(p.value); }
        } else if (e.key === 'Tab') {   // simple focus trap
          var f = Array.from(box.querySelectorAll('button, input, select, textarea, [tabindex]')).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
          if (!f.length) return;
          var i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      });
      overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) e.preventDefault(); });
      layer('os-modals').appendChild(overlay);
      var focusEl = opts.initialFocus || buttons.find(function (b) { return b.classList.contains('primary'); }) || buttons[0];
      setTimeout(function () { if (focusEl) { focusEl.focus(); if (focusEl.select) focusEl.select(); } }, 0);
      opts._setError = function (m) { errEl.textContent = m; };
    });
  }
  function textBlock(s) {
    var d = h('div');
    String(s).split('\n').forEach(function (line) { d.appendChild(h('p', null, line)); });
    return d;
  }

  function alert(msg, o) { o = o || {}; return modal({ title: o.title || 'Notice', body: msg, buttons: [{ label: 'OK', value: true, primary: true }], cancelValue: true }); }
  function confirm(msg, o) {
    o = o || {};
    return modal({ title: o.title || 'Confirm', body: msg, cancelValue: false, buttons: [
      { label: o.cancelLabel || 'Cancel', value: false },
      { label: o.okLabel || 'OK', value: true, primary: true, danger: !!o.danger }] });
  }
  function choose(msg, buttons, o) { o = o || {}; return modal({ title: o.title || '', body: msg, buttons: buttons, cancelValue: null }); }

  /** Prompt for a string. o: { title, value, placeholder, validate(v)->error string|'' , type, okLabel } */
  function prompt(msg, o) {
    o = o || {};
    var input = h('input', { class: 'input', type: o.type || 'text', value: o.value || '', placeholder: o.placeholder || '', autocomplete: 'off', spellcheck: 'false' });
    if (o.value) input.value = o.value;
    return modal({
      title: o.title || 'Input', body: h('div', null, msg ? h('p', null, msg) : null, input), initialFocus: input,
      buttons: [{ label: 'Cancel', value: null }, { label: o.okLabel || 'OK', value: 'ok', primary: true }],
      onSubmit: function () { return o.validate ? (o.validate(input.value) || true) : true; }
    }).then(function (v) { return v === 'ok' ? input.value : null; });
  }

  /* ---------- VFS browser used by open / save-as / folder pickers ---------- */
  function browser(opts) {
    var vfs = OS.vfs;
    var cwd = opts.start && vfs.isFolder(opts.start) ? opts.start : vfs.root();
    var selected = null;
    var crumbs = h('div', { class: 'picker-crumbs' });
    var list = h('div', { class: 'picker-list', tabindex: '0' });
    var el = h('div', { class: 'picker' }, crumbs, list);
    var api = { el: el, get cwd() { return cwd; }, get selected() { return selected; }, onSelect: null, onActivate: null, render: render, go: go };

    function go(id) { cwd = id; selected = null; render(); if (api.onSelect) api.onSelect(null); }
    function render() {
      crumbs.textContent = '';
      var chain = [], n = cwd;
      while (n) { chain.unshift(n); var s = vfs.stat(n); n = s && s.parent; }
      chain.forEach(function (id, i) {
        if (i) crumbs.appendChild(h('span', { class: 'crumb-sep' }, '›'));
        var s = vfs.stat(id);
        crumbs.appendChild(h('button', { class: 'crumb' + (id === cwd ? ' current' : ''), type: 'button', onclick: function () { go(id); } }, i === 0 ? 'Home' : s.name));
      });
      list.textContent = '';
      var items = vfs.list(cwd).filter(function (m) {
        if (m.type === 'folder') return true;
        if (opts.foldersOnly) return false;
        if (!opts.extensions || !opts.extensions.length) return true;
        return opts.extensions.indexOf(U.extOf(m.name)) >= 0;
      });
      if (!items.length) list.appendChild(h('div', { class: 'picker-empty' }, 'This folder is empty'));
      items.forEach(function (m) {
        var disabled = opts.exclude && opts.exclude(m);
        var row = h('div', { class: 'picker-row' + (disabled ? ' disabled' : '') + (selected === m.id ? ' selected' : '') },
          h('span', { html: OS.icons[vfs.iconFor(m)] }), h('span', { class: 'nm' }, m.name),
          m.type === 'file' ? h('span', { class: 'muted small' }, U.formatBytes(m.size)) : null);
        if (!disabled) {
          row.addEventListener('click', function () {
            if (m.type === 'folder' && (opts.foldersOnly || row.dataset.touch)) { go(m.id); return; }
            selected = m.id; render(); if (api.onSelect) api.onSelect(m);
          });
          row.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch' && m.type === 'folder') row.dataset.touch = '1'; });
          row.addEventListener('dblclick', function () {
            if (m.type === 'folder') go(m.id); else if (api.onActivate) api.onActivate(m);
          });
        }
        list.appendChild(row);
      });
    }
    render();
    return api;
  }

  /** Pick a file inside the VFS. o: { title, extensions:[...], start } -> id | null */
  function openFile(o) {
    o = o || {};
    var b = browser({ start: o.start, extensions: o.extensions });
    var okBtn = { label: 'Open', value: 'ok', primary: true };
    var p = modal({
      title: o.title || 'Open file', wide: true,
      body: h('div', null, o.extensions && o.extensions.length ? h('div', { class: 'muted small' }, 'Showing: ' + o.extensions.map(function (e) { return '.' + e; }).join(', ')) : null, b.el),
      buttons: [{ label: 'Cancel', value: null }, okBtn],
      onSubmit: function () {
        var s = b.selected && OS.vfs.stat(b.selected);
        if (!s) return 'Select a file first.';
        if (s.type === 'folder') { b.go(s.id); return false; }
        return true;
      }
    });
    b.onActivate = function () { var btn = document.querySelector('.modal-overlay:last-child .btn.primary'); if (btn) btn.click(); };
    return p.then(function (v) { return v === 'ok' ? b.selected : null; });
  }

  /**
   * Save-as inside the VFS. o: { title, defaultName, start, extensions }
   * -> { parentId, name, existingId } | null   (existingId set if user agreed to overwrite)
   */
  function saveAs(o) {
    o = o || {};
    var b = browser({ start: o.start, extensions: o.extensions });
    var input = h('input', { class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false' });
    input.value = o.defaultName || 'untitled.txt';
    b.onSelect = function (m) { if (m && m.type === 'file') input.value = m.name; };
    var result = null;
    b.onActivate = function () { var btn = document.querySelector('.modal-overlay:last-child .btn.primary'); if (btn) btn.click(); };
    return modal({
      title: o.title || 'Save as', wide: true, initialFocus: input,
      body: h('div', null, b.el, h('div', { style: { marginTop: '10px' } }, h('label', { class: 'small muted' }, 'File name'), input)),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
      onSubmit: async function () {
        var name = input.value.trim();
        if (o.forceExt && U.extOf(name) !== o.forceExt) name += '.' + o.forceExt;
        var err = OS.vfs.nameError(name); if (err) return err;
        var existing = OS.vfs.findChild(b.cwd, name);
        if (existing) {
          if (OS.vfs.isFolder(existing)) return 'A folder with that name exists.';
          var ok = await confirm('"' + name + '" already exists. Replace it?', { title: 'Replace file', okLabel: 'Replace', danger: true });
          if (!ok) return false;
        }
        result = { parentId: b.cwd, name: name, existingId: existing || null };
        return true;
      }
    }).then(function (v) { return v === 'ok' ? result : null; });
  }

  /** Pick a folder. o: { title, start, exclude(meta)->bool, okLabel } -> folderId | null */
  function pickFolder(o) {
    o = o || {};
    var b = browser({ start: o.start, foldersOnly: true, exclude: o.exclude });
    var label = h('div', { class: 'small muted', style: { marginTop: '8px' } });
    function upd() { label.textContent = 'Destination: ' + OS.vfs.pathOf(b.cwd); }
    upd(); // kept in sync on navigation by the observer below
    var obs = new MutationObserver(upd); obs.observe(b.el, { childList: true, subtree: true });
    return modal({
      title: o.title || 'Choose folder', wide: true, body: h('div', null, b.el, label),
      buttons: [{ label: 'Cancel', value: null }, { label: o.okLabel || 'Choose', value: 'ok', primary: true }],
      onSubmit: function () { return o.validate ? (o.validate(b.cwd) || true) : true; }
    }).then(function (v) { obs.disconnect(); return v === 'ok' ? b.cwd : null; });
  }

  /* ---------- toasts & notices ---------- */
  function toast(msg, type, ms) {
    var t = h('div', { class: 'toast ' + (type || ''), role: 'status' }, msg);
    layer('toasts').appendChild(t);
    setTimeout(function () { t.classList.add('hide'); setTimeout(function () { t.remove(); }, 300); }, ms || 3200);
  }
  var noticeKeys = {};
  /** Dismissible banner. o: { key (show once per session), dontShowAgain: fn } */
  function notice(html, o) {
    o = o || {};
    if (o.key) { if (noticeKeys[o.key]) return; noticeKeys[o.key] = true; }
    var cb = o.dontShowAgain ? h('input', { type: 'checkbox' }) : null;
    var n = h('div', { class: 'notice', role: 'alert' }, h('div', { html: html }),
      h('div', { class: 'row' }, cb ? h('label', null, cb, "Don't show this again") : null,
        h('button', { class: 'btn primary', type: 'button', onclick: function () { if (cb && cb.checked) o.dontShowAgain(); n.remove(); } }, 'Got it')));
    layer('notices').appendChild(n);
  }

  OS.dialogs = { modal: modal, alert: alert, confirm: confirm, choose: choose, prompt: prompt, openFile: openFile, saveAs: saveAs, pickFolder: pickFolder, browser: browser };
  OS.toast = toast;
  OS.notice = notice;
})();
