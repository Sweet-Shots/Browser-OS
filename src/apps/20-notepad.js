/* =====================================================================
   APP: NOTEPAD (text + Markdown with a safe preview)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  /** Small, safe Markdown renderer: escapes ALL HTML first, then adds formatting. */
  function renderMarkdown(src) {
    var esc = U.escapeHtml;
    function inline(s) {
      s = esc(s);
      var codes = [];
      s = s.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>').replace(/(^|[^\w_])_([^_]+)_(?=[^\w]|$)/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, text, url) {
          var u = url.replace(/&amp;/g, '&');
          if (!/^(https?:|mailto:)/i.test(u)) return text;   // no javascript:, data:, etc.
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
        });
      return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
    }
    var lines = src.replace(/\r\n?/g, '\n').split('\n'), out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) {
        var buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); continue;
      }
      var m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
        out.push('<blockquote>' + q.map(inline).join('<br>') + '</blockquote>'); continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        var ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          var t = lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ''), cb = /^\[( |x)\]\s+/i.exec(t);
          items.push('<li>' + (cb ? '<input type="checkbox" disabled' + (cb[1] !== ' ' ? ' checked' : '') + '> ' + inline(t.slice(cb[0].length)) : inline(t)) + '</li>');
        }
        out.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>')); continue;
      }
      if (!l.trim()) { i++; continue; }
      var p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s+)/.test(lines[i])) p.push(lines[i++]);
      out.push('<p>' + p.map(inline).join('<br>') + '</p>');
    }
    return out.join('\n');
  }
  OS.renderMarkdown = renderMarkdown;

  OS.registerApp({
    id: 'notepad',
    name: 'Notepad',
    icon: OS.appIcons.notepad,
    category: 'Productivity',
    keywords: 'text editor markdown notes',
    fileTypes: ['txt', 'md', 'markdown', 'json', 'csv', 'log', 'js', 'css', 'html', 'htm', 'xml', 'ini', 'yml', 'yaml', 'py', 'sh'],
    mimeTypes: ['text/'],
    defaultSize: { w: 720, h: 500 },
    launch: function (win, args) {
      var vfs = win.vfs, dlg = win.dialogs;
      var prefs = win.getState({ fontSize: 15, wrap: true });
      var fileId = null, name = 'Untitled.txt', dirty = false, preview = false;

      function tb(icon, title, fn) { return h('button', { class: 'icon-btn sm', type: 'button', title: title, 'aria-label': title, html: OS.icons[icon], onclick: fn }); }
      var ta = h('textarea', { class: 'np-text', spellcheck: 'true', 'aria-label': 'Text' });
      var pv = h('div', { class: 'np-preview md', hidden: true });
      var status = h('div', { class: 'np-status' });
      var bPrev = h('button', { class: 'chip', type: 'button', title: 'Markdown preview' }, h('span', { html: OS.icons.eye }), 'Preview');
      var findIn = h('input', { class: 'input np-find-in', type: 'search', placeholder: 'Find', 'aria-label': 'Find' });
      var replIn = h('input', { class: 'input np-find-in', type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with' });
      var findInfo = h('span', { class: 'small muted np-find-info' });
      var findBar = h('div', { class: 'np-findbar', hidden: true }, findIn, replIn,
        h('button', { class: 'btn text small', type: 'button', onclick: function () { findNext(); } }, 'Next'),
        h('button', { class: 'btn text small', type: 'button', onclick: function () { replaceOne(); } }, 'Replace'),
        h('button', { class: 'btn text small', type: 'button', onclick: function () { replaceAll(); } }, 'All'),
        findInfo, h('span', { class: 'grow' }), tb('close', 'Close', function () { findBar.hidden = true; ta.focus(); }));
      win.body.classList.add('app-notepad');
      win.body.append(
        h('div', { class: 'toolbar' },
          tb('newFile', 'New', function () { newDoc(); }), tb('folder', 'Open…', function () { openDoc(); }), tb('save', 'Save (Ctrl+S)', function () { save(); }),
          h('button', { class: 'btn text small', type: 'button', onclick: function () { saveAs(); } }, 'Save as…'),
          h('span', { class: 'sep' }),
          tb('search', 'Find and replace (Ctrl+F)', function () { openFind(); }),
          tb('minus', 'Smaller text', function () { setFont(prefs.fontSize - 1); }), tb('plus', 'Larger text', function () { setFont(prefs.fontSize + 1); }),
          tb('list', 'Toggle word wrap', function () { prefs.wrap = !prefs.wrap; applyPrefs(); }),
          h('span', { class: 'grow' }), bPrev),
        findBar,
        h('div', { class: 'np-main' }, ta, pv), status);

      function applyPrefs() { ta.style.fontSize = prefs.fontSize + 'px'; ta.classList.toggle('nowrap', !prefs.wrap); }
      function setFont(n) { prefs.fontSize = U.clamp(n, 10, 32); applyPrefs(); }
      function isMd() { return /\.(md|markdown)$/i.test(name); }
      function updateTitle() {
        win.setTitle((dirty ? '• ' : '') + name);
        bPrev.hidden = !isMd();
        if (!isMd() && preview) togglePreview(false);
        var text = ta.value, words = (text.match(/\S+/g) || []).length;
        status.textContent = (fileId ? vfs.pathOf(fileId) : 'Not saved yet') + '  ·  ' + words + ' word' + (words === 1 ? '' : 's') + ', ' + text.length + ' characters' + (dirty ? '  ·  edited' : '');
      }
      function setDirty(d) { dirty = d; win.setDirty(d); updateTitle(); }
      function togglePreview(on) {
        preview = on == null ? !preview : on;
        bPrev.classList.toggle('on', preview);
        pv.hidden = !preview; ta.hidden = preview;
        if (preview) pv.innerHTML = renderMarkdown(ta.value); else ta.focus();
      }
      function load(id) {
        var s = vfs.stat(id);
        fileId = id; name = s.name; ta.value = vfs.readText(id);
        setDirty(false); togglePreview(isMd() && ta.value.length > 0 && args.preview === true);
        ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
      }
      async function confirmDiscard() {
        if (!dirty) return true;
        var v = await dlg.choose('Save changes to "' + name + '" before closing?', [
          { label: 'Cancel', value: null }, { label: "Don't save", value: 'discard', danger: true }, { label: 'Save', value: 'save', primary: true }], { title: 'Unsaved changes' });
        if (v === 'save') return await save();
        return v === 'discard';
      }
      async function newDoc() { if (!(await confirmDiscard())) return; fileId = null; name = 'Untitled.txt'; ta.value = ''; setDirty(false); togglePreview(false); }
      async function openDoc() {
        if (!(await confirmDiscard())) return;
        var id = await dlg.openFile({ title: 'Open text file', start: fileId ? vfs.stat(fileId).parent : vfs.special('documents') });
        if (id) { try { load(id); } catch (e) { dlg.alert(e.message); } }
      }
      async function save() {
        if (!fileId || !vfs.exists(fileId) || vfs.inTrash(fileId)) return saveAs();
        try { vfs.write(fileId, ta.value); setDirty(false); return true; } catch (e) { dlg.alert(e.message); return false; }
      }
      async function saveAs() {
        var r = await dlg.saveAs({ title: 'Save as', defaultName: name, start: fileId && vfs.exists(fileId) && !vfs.inTrash(fileId) ? vfs.stat(fileId).parent : vfs.special('documents') });
        if (!r) return false;
        try {
          fileId = r.existingId ? (vfs.write(r.existingId, ta.value), r.existingId) : vfs.createFile(r.parentId, r.name, ta.value);
          name = r.name; setDirty(false); return true;
        } catch (e) { dlg.alert(e.message); return false; }
      }

      /* ---- find & replace ---- */
      function openFind() {
        if (preview) togglePreview(false);
        findBar.hidden = false;
        var selText = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (selText && selText.length < 80 && selText.indexOf('\n') < 0) findIn.value = selText;
        findIn.focus(); findIn.select(); countMatches();
      }
      function countMatches() {
        var q = findIn.value; if (!q) { findInfo.textContent = ''; return 0; }
        var n = ta.value.toLowerCase().split(q.toLowerCase()).length - 1;
        findInfo.textContent = n ? n + ' match' + (n > 1 ? 'es' : '') : 'No matches';
        return n;
      }
      function findNext() {
        var q = findIn.value; if (!q) return false;
        var hay = ta.value.toLowerCase(), needle = q.toLowerCase();
        var i = hay.indexOf(needle, ta.selectionEnd);
        if (i < 0) i = hay.indexOf(needle);
        if (i < 0) { countMatches(); return false; }
        ta.focus(); ta.setSelectionRange(i, i + q.length);
        // scroll the match into view (approximate by line)
        var line = ta.value.slice(0, i).split('\n').length - 1, lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 3);
        findIn.focus();
        return true;
      }
      function replaceOne() {
        var q = findIn.value; if (!q) return;
        var cur = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (cur.toLowerCase() !== q.toLowerCase()) { findNext(); return; }
        ta.setRangeText(replIn.value, ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input')); findNext(); countMatches();
      }
      function replaceAll() {
        var q = findIn.value; if (!q) return;
        var n = countMatches(); if (!n) return;
        var esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        ta.value = ta.value.replace(new RegExp(esc, 'gi'), function () { return replIn.value; });
        ta.dispatchEvent(new Event('input')); countMatches();
        OS.toast('Replaced ' + n + ' match' + (n > 1 ? 'es' : ''));
      }
      findIn.addEventListener('input', countMatches);
      findIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); findNext(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); findBar.hidden = true; ta.focus(); } });
      replIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } });

      ta.addEventListener('input', function () { if (!dirty) setDirty(true); else updateTitle(); });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          ta.setRangeText('\t', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input'));
        }
      });
      win.body.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); }
      });
      bPrev.addEventListener('click', function () { togglePreview(); });

      // Ctrl+S: commit this note into the file system first, then the OS saves the file.
      win.onSaveShortcut = async function () { if (dirty) await save(); };
      win.onClose(confirmDiscard);
      var off = vfs.on('change', function (ev) {
        if (fileId && !vfs.exists(fileId)) { fileId = null; setDirty(true); }
        else if (fileId && ev.id === fileId) { name = vfs.stat(fileId).name; updateTitle(); }
      });
      win.onDestroy(off);
      applyPrefs();

      if (args.fileId && vfs.exists(args.fileId)) load(args.fileId); else { updateTitle(); ta.focus(); }
    }
  });
})();
