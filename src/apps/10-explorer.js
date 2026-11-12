/* =====================================================================
   APP: FILES (file explorer)
   Sidebar places, breadcrumbs, list/grid views, multi-select,
   copy/cut/paste, drag-and-drop, Trash, search, properties.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var DND_TYPE = OS.shell.DND_TYPE;
  var IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

  OS.registerApp({
    id: 'explorer',
    name: 'Files',
    icon: OS.appIcons.explorer,
    category: 'System',
    keywords: 'explorer folders documents',
    defaultSize: { w: 860, h: 540 },
    launch: function (win, args) {
      var vfs = win.vfs, dlg = win.dialogs;
      var prefs = win.getState({ view: 'list', sidebar: true });
      var cwd = args.folderId && vfs.isFolder(args.folderId) ? args.folderId : vfs.root();
      var sel = new Set(args.select ? [args.select] : []), anchor = null;
      var history = [cwd], hIdx = 0, query = '';
      var view = prefs.view || 'list';

      function tb(icon, title, fn, cls) {
        return h('button', { class: 'icon-btn sm' + (cls ? ' ' + cls : ''), type: 'button', title: title, 'aria-label': title, html: OS.icons[icon], onclick: fn });
      }
      var fileInput = h('input', { type: 'file', multiple: true, hidden: true });
      var bBack = tb('back', 'Back', function () { if (hIdx > 0) { hIdx--; go(history[hIdx], true); } });
      var bFwd = tb('forward', 'Forward', function () { if (hIdx < history.length - 1) { hIdx++; go(history[hIdx], true); } });
      var bUp = tb('up', 'Up one folder', function () { var s = vfs.stat(cwd); if (s && s.parent) go(s.parent); });
      var crumbs = h('div', { class: 'fx-crumbs' });
      var search = h('input', { class: 'fx-search', type: 'search', placeholder: 'Search', 'aria-label': 'Search this folder' });
      var bView = tb(view === 'grid' ? 'list' : 'gridView', 'Switch view', function () {
        view = view === 'grid' ? 'list' : 'grid'; prefs.view = view; bView.innerHTML = OS.icons[view === 'grid' ? 'list' : 'gridView']; render();
      });
      var bNew = h('button', { class: 'btn tonal small fx-new', type: 'button' }, h('span', { html: OS.icons.plus }), 'New');
      bNew.addEventListener('click', function (e) {
        var r = bNew.getBoundingClientRect();
        OS.contextMenu({ x: r.left, y: r.bottom + 4 }, [
          { label: 'Folder', icon: 'newFolder', action: newFolder },
          { label: 'Text file', icon: 'newFile', action: newFile },
          '-',
          { label: 'Import from computer…', icon: 'upload', action: function () { fileInput.click(); } }
        ]);
      });
      var header = h('div', { class: 'fx-bar' }, bBack, bFwd, bUp, crumbs, h('div', { class: 'fx-search-wrap' }, h('span', { html: OS.icons.search }), search), bView, bNew);

      var actions = h('div', { class: 'fx-actions' });
      var sidebar = h('nav', { class: 'fx-side', 'aria-label': 'Places' });
      var list = h('div', { class: 'fx-list', tabindex: '0', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Files' });
      var status = h('div', { class: 'fx-status' });
      var main = h('div', { class: 'fx-main' }, actions, list, status);
      win.body.classList.add('app-files');
      win.body.append(header, h('div', { class: 'fx-wrap' }, sidebar, main), fileInput);

      fileInput.addEventListener('change', async function () {
        var files = Array.from(fileInput.files || []); fileInput.value = '';
        if (files.length) { var ids = await OS.importHostFiles(files, cwd); if (ids.length) { sel = new Set(ids); render(); } }
      });
      search.addEventListener('input', function () { query = search.value.trim(); render(); });

      function trashId() { return vfs.special('trash'); }
      function inTrashView() { return cwd === trashId(); }
      function go(id, fromHistory) {
        if (!vfs.isFolder(id)) return;
        cwd = id; sel.clear(); anchor = null;
        if (!fromHistory) { history = history.slice(0, hIdx + 1); history.push(id); hIdx = history.length - 1; }
        query = ''; search.value = '';
        render(); list.focus();
      }
      function selected() { return Array.from(sel).filter(function (id) { return vfs.exists(id); }); }
      function err(e) { dlg.alert(e.message, { title: 'Files', icon: 'warning' }); }
      function activate(id) {
        var s = vfs.stat(id); if (!s) return;
        if (s.type === 'folder') go(id);
        else if (vfs.inTrash(id)) OS.toast('Restore the file to open it.');
        else OS.openFile(id);
      }
      function nameCheck(parent, except) {
        return function (v) { v = v.trim(); return vfs.nameError(v) || (vfs.findChild(parent, v) && (!except || v.toLowerCase() !== except.toLowerCase()) ? 'That name is already used here.' : ''); };
      }

      /* ---------------- actions ---------------- */
      async function newFolder() {
        var name = await dlg.prompt('Folder name', { title: 'New folder', value: vfs.uniqueName(cwd, 'New folder'), validate: nameCheck(cwd) });
        if (name == null) return;
        try { sel = new Set([vfs.mkdir(cwd, name.trim())]); render(); } catch (e) { err(e); }
      }
      async function newFile() {
        var name = await dlg.prompt('File name', { title: 'New text file', value: vfs.uniqueName(cwd, 'New file.txt'), validate: nameCheck(cwd) });
        if (name == null) return;
        try { sel = new Set([vfs.createFile(cwd, name.trim(), '')]); render(); } catch (e) { err(e); }
      }
      async function renameSel() {
        var ids = selected(); if (ids.length !== 1) return;
        var s = vfs.stat(ids[0]); if (s.system) return;
        var name = await dlg.prompt('New name', { title: 'Rename', value: s.name, validate: nameCheck(s.parent, s.name) });
        if (name == null) return;
        try { vfs.rename(s.id, name.trim()); } catch (e) { err(e); }
      }
      async function moveSel() {
        var ids = selected().filter(function (id) { return !vfs.isSystem(id); }); if (!ids.length) return;
        var first = vfs.stat(ids[0]);
        var dest = await dlg.pickFolder({ title: 'Move ' + (ids.length > 1 ? ids.length + ' items' : '"' + first.name + '"') + ' to…', start: first.parent, okLabel: 'Move here',
          exclude: function (m) { return ids.indexOf(m.id) >= 0 || m.id === trashId(); },
          validate: function (fid) {
            for (var i = 0; i < ids.length; i++) {
              var s = vfs.stat(ids[i]);
              if (fid === s.parent) return 'Already in this folder.';
              if (s.type === 'folder' && vfs.isAncestor(s.id, fid)) return 'A folder cannot be moved into itself.';
              if (vfs.findChild(fid, s.name)) return '"' + s.name + '" already exists there.';
            }
            return '';
          } });
        if (!dest) return;
        moveIds(ids, dest);
      }
      function moveIds(ids, dest) {
        var errors = [], n = 0;
        ids.forEach(function (id) {
          try {
            if (dest === trashId()) vfs.trash(id);
            else if (vfs.stat(id).parent !== dest) { vfs.move(id, dest); n++; }
          } catch (e) { errors.push(e.message); }
        });
        if (n) OS.toast('Moved ' + n + ' item' + (n > 1 ? 's' : '') + ' to ' + (vfs.stat(dest).name || 'Home'));
        if (errors.length) dlg.alert(errors.join('\n'), { title: 'Move' });
      }
      function trashSel() {
        var ids = selected().filter(function (id) { return !vfs.isSystem(id); }); if (!ids.length) return;
        if (inTrashView()) { deleteForever(ids); return; }
        ids.forEach(function (id) { try { vfs.trash(id); } catch (e) { err(e); } });
        sel.clear();
        OS.sound.play('trash');
        OS.toast({ title: (ids.length > 1 ? ids.length + ' items' : 'Item') + ' moved to Trash', icon: 'trash',
          action: { label: 'Undo', run: function () { ids.forEach(function (id) { try { if (vfs.inTrash(id)) vfs.restore(id); } catch (e) { /* gone */ } }); } } });
      }
      async function deleteForever(ids) {
        var label = ids.length > 1 ? ids.length + ' items' : '"' + vfs.stat(ids[0]).name + '"';
        if (!(await dlg.confirm('Permanently delete ' + label + '? This cannot be undone.', { title: 'Delete forever', okLabel: 'Delete', danger: true }))) return;
        ids.forEach(function (id) { try { vfs.delete(id); } catch (e) { err(e); } });
        sel.clear(); OS.sound.play('trash');
      }
      function restoreSel() {
        var ids = selected(); if (!ids.length) return;
        var dest = null;
        ids.forEach(function (id) { try { dest = vfs.restore(id); } catch (e) { err(e); } });
        sel.clear();
        if (dest) OS.toast({ title: 'Restored ' + (ids.length > 1 ? ids.length + ' items' : 'item'), icon: 'restoreFile', action: { label: 'Show', run: function () { go(dest); } } });
      }
      async function emptyTrash() {
        var n = vfs.list(trashId()).length; if (!n) return;
        if (!(await dlg.confirm('Permanently delete all ' + n + ' item' + (n > 1 ? 's' : '') + ' in the Trash?', { title: 'Empty Trash', okLabel: 'Empty Trash', danger: true }))) return;
        vfs.emptyTrash(); OS.sound.play('trash');
      }
      function copySel(cut) {
        var ids = selected().filter(function (id) { return !vfs.isSystem(id) && !vfs.inTrash(id); }); if (!ids.length) return;
        OS.clipboard = { op: cut ? 'cut' : 'copy', ids: ids };
        OS.toast((cut ? 'Cut ' : 'Copied ') + ids.length + ' item' + (ids.length > 1 ? 's' : ''));
        render();
      }
      function paste() {
        if (inTrashView()) return;
        var done = OS.shell.paste(cwd);
        if (done.length) { sel = new Set(done); render(); }
      }
      function exportSel() { selected().forEach(function (id) { if (vfs.stat(id).type === 'file') OS.exportFile(id); }); }
      function properties(id) {
        var s = vfs.stat(id); if (!s) return;
        var rows = [['Type', s.type === 'folder' ? 'Folder (' + s.childCount + ' items)' : (s.mime || 'File')], ['Location', vfs.pathOf(s.parent || vfs.root())],
          ['Size', U.formatBytes(s.size) + (s.encoding === 'base64' ? ' (stored as base64)' : '')], ['Created', new Date(s.created).toLocaleString()], ['Modified', new Date(s.modified).toLocaleString()]];
        if (s.trashed) rows.push(['Deleted', new Date(s.trashed.at).toLocaleString()]);
        dlg.modal({ title: s.name, body: h('table', { class: 'props' }, h('tbody', null, rows.map(function (r) { return h('tr', null, h('th', null, r[0]), h('td', null, r[1])); }))),
          buttons: [{ label: 'Close', value: true, primary: true }], cancelValue: true });
      }

      /* ---------------- drag & drop ---------------- */
      function dragIds(e) { try { return JSON.parse(e.dataTransfer.getData(DND_TYPE) || '[]'); } catch (x) { return []; } }
      function dropTarget(el, destId) {
        el.addEventListener('dragover', function (e) {
          var t = Array.from(e.dataTransfer.types || []);
          if (t.indexOf(DND_TYPE) >= 0 || t.indexOf('Files') >= 0) { e.preventDefault(); e.stopPropagation(); el.classList.add('drop-over'); e.dataTransfer.dropEffect = t.indexOf('Files') >= 0 ? 'copy' : 'move'; }
        });
        el.addEventListener('dragleave', function () { el.classList.remove('drop-over'); });
        el.addEventListener('drop', function (e) {
          el.classList.remove('drop-over');
          var ids = dragIds(e);
          if (ids.length) { e.preventDefault(); e.stopPropagation(); moveIds(ids.filter(function (id) { return id !== destId; }), destId); return; }
          if (e.dataTransfer.files && e.dataTransfer.files.length && destId !== trashId()) {
            e.preventDefault(); e.stopPropagation(); win.el.classList.remove('drop-target');
            OS.importHostFiles(Array.from(e.dataTransfer.files), destId);
          }
        });
      }

      /* ---------------- rendering ---------------- */
      function renderSidebar() {
        sidebar.textContent = '';
        var places = [['Home', vfs.root(), 'home'], ['Desktop', vfs.special('desktop'), 'desktop'], ['Documents', vfs.special('documents'), 'document'],
          ['Pictures', vfs.special('pictures'), 'image'], ['Music', vfs.special('music'), 'music'], ['Trash', trashId(), 'trash']];
        places.forEach(function (p) {
          var b = h('button', { class: 'fx-place' + (cwd === p[1] ? ' on' : ''), type: 'button', onclick: function () { go(p[1]); } },
            h('span', { html: OS.icons[p[2]] }), h('span', null, p[0]),
            p[1] === trashId() && vfs.list(trashId()).length ? h('span', { class: 'fx-count' }, String(vfs.list(trashId()).length)) : null);
          dropTarget(b, p[1]);
          sidebar.appendChild(b);
        });
        var used = OS.storage.dataSize();
        sidebar.appendChild(h('div', { class: 'fx-usage' }, h('span', { html: OS.icons.database }), h('div', null, h('b', null, U.formatBytes(used)), h('small', null, 'stored in this file'))));
      }
      function renderActions() {
        actions.textContent = '';
        var ids = selected(), n = ids.length, one = n === 1 ? vfs.stat(ids[0]) : null;
        var anySystem = ids.some(function (id) { return vfs.isSystem(id); });
        function act(icon, label, fn, disabled, danger) {
          return h('button', { class: 'btn text small' + (danger ? ' danger' : ''), type: 'button', disabled: !!disabled, onclick: fn }, h('span', { html: OS.icons[icon] }), label);
        }
        if (inTrashView()) {
          actions.append(act('restoreFile', 'Restore', restoreSel, !n), act('trash', 'Delete forever', function () { deleteForever(selected()); }, !n, true),
            h('span', { class: 'grow' }), act('trash', 'Empty Trash', emptyTrash, !vfs.list(trashId()).length, true));
          return;
        }
        actions.append(
          act('open', 'Open', function () { if (one) activate(one.id); }, !one),
          act('copy', 'Copy', function () { copySel(false); }, !n || anySystem),
          act('cut', 'Cut', function () { copySel(true); }, !n || anySystem),
          act('paste', 'Paste', paste, !(OS.clipboard && OS.clipboard.ids.length)),
          act('rename', 'Rename', renameSel, !one || anySystem),
          act('move', 'Move to', moveSel, !n || anySystem),
          act('download', 'Export', exportSel, !ids.some(function (id) { return vfs.stat(id).type === 'file'; })),
          act('trash', 'Delete', trashSel, !n || anySystem, true));
      }
      function thumb(m) {
        if (view === 'grid' && m.type === 'file' && IMG_EXT.indexOf(U.extOf(m.name)) >= 0 && m.size < 3 * 1024 * 1024) {
          var img = h('img', { class: 'fx-thumb', alt: '', loading: 'lazy', draggable: 'false' });
          try { img.src = vfs.readDataURL(m.id); } catch (e) { return null; }
          return img;
        }
        return null;
      }
      /** Selection change only: update classes, actions and status (rebuilding rows would break double-click). */
      function updateSel() {
        list.querySelectorAll('.fx-row[data-id]').forEach(function (r) {
          var on = sel.has(r.dataset.id);
          r.classList.toggle('selected', on); r.setAttribute('aria-selected', String(on));
        });
        renderActions(); renderStatus();
      }
      var lastCount = 0;
      function renderStatus() {
        var selIds = selected();
        status.textContent = lastCount + ' item' + (lastCount === 1 ? '' : 's') + (selIds.length ? '  ·  ' + selIds.length + ' selected (' + U.formatBytes(selIds.reduce(function (a, id) { return a + vfs.size(id); }, 0)) + ')' : '  ·  ' + U.formatBytes(vfs.size(cwd)));
      }
      function render() {
        if (win.closed) return;
        if (!vfs.exists(cwd)) cwd = vfs.root();
        var s = vfs.stat(cwd);
        win.setTitle(cwd === vfs.root() ? 'Files' : s.name);
        bBack.disabled = hIdx === 0; bFwd.disabled = hIdx >= history.length - 1; bUp.disabled = !s.parent;
        // breadcrumbs
        crumbs.textContent = '';
        var chain = [], n = cwd;
        while (n) { chain.unshift(n); n = vfs.stat(n).parent; }
        chain.forEach(function (id, i) {
          if (i) crumbs.appendChild(h('span', { class: 'crumb-sep', html: OS.icons.chevRight }));
          var c = h('button', { class: 'crumb' + (id === cwd ? ' current' : ''), type: 'button', onclick: function () { go(id); } }, i === 0 ? 'Home' : vfs.stat(id).name);
          dropTarget(c, id);
          crumbs.appendChild(c);
        });
        renderSidebar();

        var items = query ? vfs.search(query, 200).filter(function (m) { return vfs.isAncestor(cwd, m.id) && m.id !== cwd; }) : vfs.list(cwd);
        sel.forEach(function (id) { if (!vfs.exists(id)) sel.delete(id); });
        list.textContent = '';
        list.className = 'fx-list ' + view;
        if (view === 'list') list.appendChild(h('div', { class: 'fx-row fx-head', 'aria-hidden': 'true' }, h('span', { class: 'c-name' }, 'Name'), h('span', { class: 'c-date' }, inTrashView() ? 'Deleted' : 'Modified'), h('span', { class: 'c-size' }, 'Size')));
        if (!items.length) {
          list.appendChild(h('div', { class: 'fx-empty' }, h('span', { html: OS.icons[inTrashView() ? 'trash' : query ? 'search' : 'folder'] }),
            h('b', null, query ? 'Nothing matches "' + query + '"' : inTrashView() ? 'Trash is empty' : 'This folder is empty'),
            !query && !inTrashView() ? h('span', null, 'Drop files here, or use New → Import.') : null));
        }
        var cut = OS.clipboard && OS.clipboard.op === 'cut' ? OS.clipboard.ids : [];
        items.forEach(function (m, idx) {
          var lastPointer = 'mouse';
          var isSel = sel.has(m.id);
          var t = thumb(m);
          var icon = t ? h('span', { class: 'ico thumb' }, t) : h('span', { class: 'ico', html: OS.icons[vfs.iconFor(m)] });
          var row = h('div', { class: 'fx-row' + (isSel ? ' selected' : '') + (cut.indexOf(m.id) >= 0 ? ' cut' : ''), role: 'option', 'aria-selected': String(isSel), draggable: m.system ? 'false' : 'true', dataset: { id: m.id }, title: query ? m.path : m.name },
            h('span', { class: 'c-name' }, icon, h('span', { class: 'nm' }, m.name)),
            h('span', { class: 'c-date' }, U.formatDate(m.trashed ? m.trashed.at : m.modified)),
            h('span', { class: 'c-size' }, m.type === 'folder' ? m.childCount + ' item' + (m.childCount === 1 ? '' : 's') : U.formatBytes(m.size)));
          row.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
          row.addEventListener('click', function (e) {
            if (e.shiftKey && anchor != null) {
              var a = items.findIndex(function (x) { return x.id === anchor; }), lo = Math.min(a, idx), hi = Math.max(a, idx);
              if (!(e.ctrlKey || e.metaKey)) sel.clear();
              for (var i = lo; i <= hi; i++) sel.add(items[i].id);
            } else if (e.ctrlKey || e.metaKey) {
              if (sel.has(m.id)) sel.delete(m.id); else sel.add(m.id);
              anchor = m.id;
            } else {
              if (lastPointer === 'touch' && sel.size === 1 && sel.has(m.id)) { activate(m.id); return; }   // tap again to open
              sel = new Set([m.id]); anchor = m.id;
            }
            updateSel();
          });
          row.addEventListener('dblclick', function () { if (lastPointer !== 'touch') activate(m.id); });
          row.addEventListener('contextmenu', function (e) {
            if (!sel.has(m.id)) { sel = new Set([m.id]); anchor = m.id; updateSel(); }
            itemMenu(e, m);
          });
          row.addEventListener('dragstart', function (e) {
            if (!sel.has(m.id)) { sel = new Set([m.id]); }
            var ids = selected().filter(function (id) { return !vfs.isSystem(id); });
            e.dataTransfer.setData(DND_TYPE, JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'move';
          });
          if (m.type === 'folder') dropTarget(row, m.id);
          list.appendChild(row);
        });
        renderActions();
        lastCount = items.length;
        renderStatus();
      }
      function itemMenu(e, m) {
        var ids = selected(), multi = ids.length > 1;
        if (vfs.inTrash(m.id)) {
          OS.contextMenu(e, [{ label: 'Restore', icon: 'restoreFile', action: restoreSel }, { label: 'Delete forever', icon: 'trash', danger: true, action: function () { deleteForever(selected()); } },
            '-', { label: 'Properties', icon: 'info', action: function () { properties(m.id); } }]);
          return;
        }
        var openWith = !multi && m.type === 'file' ? OS.appsForFile(m.name, m.mime) : [];
        OS.contextMenu(e, [
          !multi ? { label: 'Open', icon: 'open', action: function () { activate(m.id); } } : null,
          openWith.length > 1 ? { label: 'Open with ' + openWith[1].name, icon: 'open', action: function () { OS.openWith(openWith[1].id, m.id); } } : null,
          openWith.length > 2 ? { label: 'Open with ' + openWith[2].name, icon: 'open', action: function () { OS.openWith(openWith[2].id, m.id); } } : null,
          '-',
          { label: 'Copy', icon: 'copy', hint: 'Ctrl+C', disabled: m.system, action: function () { copySel(false); } },
          { label: 'Cut', icon: 'cut', hint: 'Ctrl+X', disabled: m.system, action: function () { copySel(true); } },
          m.type === 'folder' && OS.clipboard ? { label: 'Paste into folder', icon: 'paste', action: function () { var d = OS.shell.paste(m.id); if (d.length) OS.toast('Pasted into ' + m.name); } } : null,
          !multi ? { label: 'Rename', icon: 'rename', hint: 'F2', disabled: m.system, action: renameSel } : null,
          { label: 'Move to…', icon: 'move', disabled: m.system, action: moveSel },
          m.type === 'file' ? { label: 'Export to computer', icon: 'download', action: exportSel } : null,
          !multi && m.type === 'file' && IMG_EXT.indexOf(U.extOf(m.name)) >= 0 ? { label: 'Set as wallpaper', icon: 'image', action: function () {
            OS.state.settings.wallpaper = { type: 'image', value: m.id }; OS.markDirty(); OS.shell.applyTheme();
          } } : null,
          '-',
          !multi ? { label: 'Properties', icon: 'info', action: function () { properties(m.id); } } : null,
          { label: 'Move to Trash', icon: 'trash', hint: 'Del', danger: true, disabled: m.system, action: trashSel }
        ]);
      }
      list.addEventListener('contextmenu', function (e) {
        if (e.target !== list && !e.target.classList.contains('fx-empty')) return;
        sel.clear(); render();
        if (inTrashView()) { OS.contextMenu(e, [{ label: 'Empty Trash', icon: 'trash', danger: true, action: emptyTrash }]); return; }
        OS.contextMenu(e, [
          { label: 'New folder', icon: 'newFolder', action: newFolder }, { label: 'New text file', icon: 'newFile', action: newFile },
          { label: 'Paste', icon: 'paste', hint: 'Ctrl+V', disabled: !(OS.clipboard && OS.clipboard.ids.length), action: paste },
          '-', { label: 'Import from computer…', icon: 'upload', action: function () { fileInput.click(); } },
          { label: view === 'grid' ? 'List view' : 'Grid view', icon: view === 'grid' ? 'list' : 'gridView', action: function () { bView.click(); } }
        ]);
      });
      list.addEventListener('click', function (e) { if (e.target === list) { sel.clear(); updateSel(); } });
      list.addEventListener('keydown', function (e) {
        if (e.target !== list) return;
        var items = Array.from(list.querySelectorAll('.fx-row[data-id]')).map(function (r) { return r.dataset.id; });
        var cur = items.indexOf(anchor != null ? anchor : selected()[0]);
        var cols = view === 'grid' ? Math.max(1, Math.round(list.clientWidth / 120)) : 1;
        var k = e.key, mod = e.ctrlKey || e.metaKey;
        function moveTo(i) { if (!items.length) return; i = U.clamp(i, 0, items.length - 1); sel = new Set([items[i]]); anchor = items[i]; updateSel(); var r = list.querySelector('[data-id="' + items[i] + '"]'); if (r) r.scrollIntoView({ block: 'nearest' }); }
        if (k === 'ArrowDown') { e.preventDefault(); moveTo(cur + cols); }
        else if (k === 'ArrowUp') { e.preventDefault(); moveTo(cur < 0 ? 0 : cur - cols); }
        else if (k === 'ArrowRight' && view === 'grid') { e.preventDefault(); moveTo(cur + 1); }
        else if (k === 'ArrowLeft' && view === 'grid') { e.preventDefault(); moveTo(cur - 1); }
        else if (k === 'Enter' && sel.size === 1) { e.preventDefault(); activate(selected()[0]); }
        else if (k === 'Delete') { e.preventDefault(); trashSel(); }
        else if (k === 'F2') { e.preventDefault(); renameSel(); }
        else if (k === 'Backspace') { e.preventDefault(); var s = vfs.stat(cwd); if (s.parent) go(s.parent); }
        else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); sel = new Set(items); updateSel(); }
        else if (mod && k.toLowerCase() === 'c') { e.preventDefault(); copySel(false); }
        else if (mod && k.toLowerCase() === 'x') { e.preventDefault(); copySel(true); }
        else if (mod && k.toLowerCase() === 'v') { e.preventDefault(); paste(); }
      });

      // host files dropped anywhere on the window import into the current folder
      var depth = 0;
      win.el.addEventListener('dragenter', function (e) { if (Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0 && !inTrashView()) { depth++; win.el.classList.add('drop-target'); } });
      win.el.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; win.el.classList.remove('drop-target'); } });
      win.el.addEventListener('dragover', function (e) { var t = Array.from(e.dataTransfer.types || []); if (t.indexOf('Files') >= 0 || t.indexOf(DND_TYPE) >= 0) { e.preventDefault(); } });
      win.el.addEventListener('drop', function (e) {
        depth = 0; win.el.classList.remove('drop-target');
        var ids = dragIds(e);
        if (ids.length) { e.preventDefault(); moveIds(ids, cwd); return; }
        if (e.dataTransfer.files && e.dataTransfer.files.length && !inTrashView()) { e.preventDefault(); OS.importHostFiles(Array.from(e.dataTransfer.files), cwd); }
      });

      var off = vfs.on('change', function () { render(); });
      win.onDestroy(off);   // prefs is the live app-state object: view changes are kept without marking the file unsaved
      win._onRelaunch = function (a) { if (a.folderId) go(a.folderId); if (a.select) { sel = new Set([a.select]); render(); } };
      render();
      setTimeout(function () { list.focus(); }, 0);
    }
  });
})();
