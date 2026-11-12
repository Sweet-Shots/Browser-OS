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
    fileTypes: ['txt', 'md', 'markdown', 'json', 'csv', 'log', 'js', 'css', 'html', 'htm', 'xml', 'ini', 'yml', 'yaml', 'py', 'sh'],
    mimeTypes: ['text/'],
    defaultSize: { w: 640, h: 440 },
    launch: function (win, args) {
      var vfs = win.vfs, dlg = win.dialogs;
      var fileId = null, name = 'Untitled.txt', dirty = false, preview = false;

      var ta = h('textarea', { class: 'np-text', spellcheck: 'false', 'aria-label': 'Text' });
      var pv = h('div', { class: 'np-preview md', hidden: true });
      var status = h('div', { class: 'np-status' });
      var bPrev = h('button', { class: 'btn', type: 'button', title: 'Toggle Markdown preview' }, h('span', { html: OS.icons.eye }), 'Preview');
      var wrapCb = h('input', { type: 'checkbox', checked: true });
      win.body.classList.add('app-notepad');
      win.body.append(
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn', type: 'button', onclick: function () { newDoc(); } }, 'New'),
          h('button', { class: 'btn', type: 'button', onclick: function () { openDoc(); } }, 'Open…'),
          h('button', { class: 'btn', type: 'button', onclick: function () { save(); } }, 'Save'),
          h('button', { class: 'btn', type: 'button', onclick: function () { saveAs(); } }, 'Save as…'),
          h('span', { class: 'sep' }), bPrev, h('span', { class: 'grow' }),
          h('label', { class: 'small muted np-wrap' }, wrapCb, 'Wrap')),
        h('div', { class: 'np-main' }, ta, pv), status);

      function isMd() { return /\.(md|markdown)$/i.test(name); }
      function updateTitle() {
        win.setTitle((dirty ? '● ' : '') + name + ' - Notepad');
        bPrev.hidden = !isMd();
        if (!isMd() && preview) togglePreview(false);
        var text = ta.value;
        status.textContent = (fileId ? vfs.pathOf(fileId) : 'Not saved yet') + '  ·  ' + text.split('\n').length + ' lines, ' + text.length + ' characters' + (dirty ? '  ·  edited' : '');
      }
      function setDirty(d) { dirty = d; win.setDirty(d); updateTitle(); }
      function togglePreview(on) {
        preview = on == null ? !preview : on;
        bPrev.classList.toggle('primary', preview);
        pv.hidden = !preview; ta.hidden = preview;
        if (preview) pv.innerHTML = renderMarkdown(ta.value); else ta.focus();
      }
      function load(id) {
        var s = vfs.stat(id);
        fileId = id; name = s.name; ta.value = vfs.readText(id);
        setDirty(false); togglePreview(false);
        ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
      }
      async function confirmDiscard() {
        if (!dirty) return true;
        var v = await dlg.choose('Save changes to "' + name + '"?', [
          { label: 'Cancel', value: null }, { label: "Don't save", value: 'discard', danger: true }, { label: 'Save', value: 'save', primary: true }], { title: 'Notepad' });
        if (v === 'save') return await save();
        return v === 'discard';
      }
      async function newDoc() { if (!(await confirmDiscard())) return; fileId = null; name = 'Untitled.txt'; ta.value = ''; setDirty(false); togglePreview(false); }
      async function openDoc() {
        if (!(await confirmDiscard())) return;
        var id = await dlg.openFile({ title: 'Open text file', start: fileId ? vfs.stat(fileId).parent : (vfs.resolvePath('/Documents') || vfs.root()) });
        if (id) { try { load(id); } catch (e) { dlg.alert(e.message); } }
      }
      async function save() {
        if (!fileId || !vfs.exists(fileId)) return saveAs();
        try { vfs.write(fileId, ta.value); setDirty(false); return true; } catch (e) { dlg.alert(e.message); return false; }
      }
      async function saveAs() {
        var r = await dlg.saveAs({ title: 'Save as', defaultName: name, start: fileId && vfs.exists(fileId) ? vfs.stat(fileId).parent : (vfs.resolvePath('/Documents') || vfs.root()) });
        if (!r) return false;
        try {
          fileId = r.existingId ? (vfs.write(r.existingId, ta.value), r.existingId) : vfs.createFile(r.parentId, r.name, ta.value);
          name = r.name; setDirty(false); return true;
        } catch (e) { dlg.alert(e.message); return false; }
      }

      ta.addEventListener('input', function () { if (!dirty) setDirty(true); else updateTitle(); });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          var s = ta.selectionStart, en = ta.selectionEnd;
          ta.setRangeText('\t', s, en, 'end'); ta.dispatchEvent(new Event('input'));
        }
      });
      bPrev.addEventListener('click', function () { togglePreview(); });
      wrapCb.addEventListener('change', function () { ta.classList.toggle('nowrap', !wrapCb.checked); });

      // Ctrl+S: commit this note into the file system first, then the OS saves the file.
      win.onSaveShortcut = async function () { if (dirty) await save(); };
      win.onClose(confirmDiscard);
      var off = vfs.on('change', function (ev) {
        if (fileId && !vfs.exists(fileId)) { fileId = null; setDirty(true); }
        else if (fileId && ev.id === fileId) { name = vfs.stat(fileId).name; updateTitle(); }
      });
      win.onDestroy(off);

      if (args.fileId && vfs.exists(args.fileId)) load(args.fileId); else { updateTitle(); ta.focus(); }
    }
  });
})();
