/* =====================================================================
   APP: FILE EXPLORER ("Files")
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var DND_TYPE = 'application/x-myos-node';

  OS.registerApp({
    id: 'explorer',
    name: 'Files',
    icon: OS.appIcons.explorer,
    defaultSize: { w: 760, h: 480 },
    launch: function (win, args) {
      var vfs = win.vfs, dlg = win.dialogs;
      var cwd = args.folderId && vfs.isFolder(args.folderId) ? args.folderId : vfs.root();
      var selected = null;

      function tb(icon, title, fn) {
        return h('button', { class: 'icon-btn', type: 'button', title: title, 'aria-label': title, html: OS.icons[icon], onclick: fn });
      }
      var fileInput = h('input', { type: 'file', multiple: true, hidden: true });
      var bUp = tb('up', 'Up one folder', function () { var s = vfs.stat(cwd); if (s && s.parent) go(s.parent); });
      var bOpen = tb('open', 'Open', function () { if (selected) activate(selected); });
      var bRename = tb('rename', 'Rename (F2)', function () { renameSel(); });
      var bMove = tb('move', 'Move to…', function () { moveSel(); });
      var bExport = tb('download', 'Export to your computer', function () { if (selected) OS.exportFile(selected); });
      var bDelete = tb('trash', 'Delete (Del)', function () { deleteSel(); });
      var toolbar = h('div', { class: 'toolbar' }, bUp,
        h('span', { class: 'sep' }),
        tb('newFolder', 'New folder', newFolder), tb('newFile', 'New text file', newFile),
        tb('upload', 'Import files from your computer', function () { fileInput.click(); }),
        h('span', { class: 'sep' }), bOpen, bRename, bMove, bExport, bDelete);
      var crumbs = h('div', { class: 'ex-crumbs' });
      var head = h('div', { class: 'ex-row ex-head' }, h('span', { class: 'c-name' }, 'Name'), h('span', { class: 'c-size' }, 'Size'), h('span', { class: 'c-date' }, 'Modified'));
      var list = h('div', { class: 'ex-list', tabindex: '0', role: 'listbox', 'aria-label': 'Files' });
      var status = h('div', { class: 'ex-status' });
      win.body.append(toolbar, crumbs, h('div', { class: 'ex-table' }, head, list), status, fileInput);
      win.body.classList.add('app-explorer');

      fileInput.addEventListener('change', async function () {
        var files = Array.from(fileInput.files || []); fileInput.value = '';
        if (files.length) { var ids = await OS.importHostFiles(files, cwd); if (ids.length) select(ids[ids.length - 1]); }
      });

      function go(id) { cwd = id; selected = null; render(); list.focus(); }
      function select(id) { selected = id; render(); }
      function activate(id) {
        var s = vfs.stat(id); if (!s) return;
        if (s.type === 'folder') go(id); else OS.openFile(id);
      }
      function err(e) { dlg.alert(e.message, { title: 'Files' }); }

      async function newFolder() {
        var name = await dlg.prompt('Folder name', { title: 'New folder', value: vfs.uniqueName(cwd, 'New folder'),
          validate: function (v) { return vfs.nameError(v.trim()) || (vfs.findChild(cwd, v.trim()) ? 'That name is already used here.' : ''); } });
        if (name == null) return;
        try { select(vfs.mkdir(cwd, name.trim())); } catch (e) { err(e); }
      }
      async function newFile() {
        var name = await dlg.prompt('File name', { title: 'New text file', value: vfs.uniqueName(cwd, 'New file.txt'),
          validate: function (v) { return vfs.nameError(v.trim()) || (vfs.findChild(cwd, v.trim()) ? 'That name is already used here.' : ''); } });
        if (name == null) return;
        try { select(vfs.createFile(cwd, name.trim(), '')); } catch (e) { err(e); }
      }
      async function renameSel() {
        var s = selected && vfs.stat(selected); if (!s) return;
        var name = await dlg.prompt('New name', { title: 'Rename', value: s.name,
          validate: function (v) { v = v.trim(); return vfs.nameError(v) || (v.toLowerCase() !== s.name.toLowerCase() && vfs.findChild(s.parent, v) ? 'That name is already used here.' : ''); } });
        if (name == null) return;
        try { vfs.rename(s.id, name.trim()); } catch (e) { err(e); }
      }
      async function moveSel() {
        var s = selected && vfs.stat(selected); if (!s) return;
        var dest = await dlg.pickFolder({ title: 'Move "' + s.name + '" to…', start: s.parent, okLabel: 'Move here',
          exclude: function (m) { return m.id === s.id; },
          validate: function (fid) {
            if (fid === s.parent) return 'It is already in this folder.';
            if (s.type === 'folder' && vfs.isAncestor(s.id, fid)) return 'A folder cannot be moved into itself.';
            if (vfs.findChild(fid, s.name)) return '"' + s.name + '" already exists there.';
            return '';
          } });
        if (!dest) return;
        try { vfs.move(s.id, dest); OS.toast('Moved to ' + vfs.pathOf(dest)); } catch (e) { err(e); }
      }
      async function deleteSel() {
        var s = selected && vfs.stat(selected); if (!s) return;
        var what = s.type === 'folder' ? 'the folder "' + s.name + '" and everything in it (' + s.childCount + ' item' + (s.childCount === 1 ? '' : 's') + ' directly inside)' : '"' + s.name + '"';
        if (!(await dlg.confirm('Permanently delete ' + what + '? This cannot be undone.', { title: 'Delete', okLabel: 'Delete', danger: true }))) return;
        try { vfs.delete(s.id); selected = null; } catch (e) { err(e); }
      }

      function moveByDrop(id, destId) {
        if (!id || id === destId) return;
        try { vfs.move(id, destId); OS.toast('Moved to ' + vfs.pathOf(destId)); } catch (e) { err(e); }
      }
      function dropTarget(el, destId) {
        el.addEventListener('dragover', function (e) {
          var t = Array.from(e.dataTransfer.types || []);
          if (t.indexOf(DND_TYPE) >= 0 || t.indexOf('Files') >= 0) { e.preventDefault(); e.stopPropagation(); el.classList.add('drop-over'); e.dataTransfer.dropEffect = t.indexOf('Files') >= 0 ? 'copy' : 'move'; }
        });
        el.addEventListener('dragleave', function () { el.classList.remove('drop-over'); });
        el.addEventListener('drop', function (e) {
          el.classList.remove('drop-over');
          var id = e.dataTransfer.getData(DND_TYPE);
          if (id) { e.preventDefault(); e.stopPropagation(); moveByDrop(id, destId); return; }
          if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); win.el.classList.remove('drop-target'); OS.importHostFiles(Array.from(e.dataTransfer.files), destId); }
        });
      }

      function render() {
        if (win.closed) return;
        if (!vfs.exists(cwd)) cwd = vfs.root();
        if (selected && !vfs.exists(selected)) selected = null;
        win.setTitle('Files: ' + (cwd === vfs.root() ? 'Home' : vfs.stat(cwd).name));

        crumbs.textContent = '';
        var chain = [], n = cwd;
        while (n) { chain.unshift(n); n = vfs.stat(n).parent; }
        chain.forEach(function (id, i) {
          if (i) crumbs.appendChild(h('span', { class: 'crumb-sep' }, '›'));
          var c = h('button', { class: 'crumb' + (id === cwd ? ' current' : ''), type: 'button', onclick: function () { go(id); } }, i === 0 ? 'Home' : vfs.stat(id).name);
          dropTarget(c, id);
          crumbs.appendChild(c);
        });

        list.textContent = '';
        var items = vfs.list(cwd);
        if (!items.length) list.appendChild(h('div', { class: 'ex-empty' }, 'This folder is empty. Drop files here or use the import button.'));
        items.forEach(function (m) {
          var lastPointer = 'mouse';
          var row = h('div', { class: 'ex-row' + (m.id === selected ? ' selected' : ''), role: 'option', 'aria-selected': m.id === selected ? 'true' : 'false', draggable: 'true', dataset: { id: m.id } },
            h('span', { class: 'c-name' }, h('span', { class: 'ico', html: OS.icons[vfs.iconFor(m)] }), h('span', { class: 'nm' }, m.name)),
            h('span', { class: 'c-size' }, m.type === 'folder' ? (m.childCount + ' item' + (m.childCount === 1 ? '' : 's') + ' · ' + U.formatBytes(m.size)) : U.formatBytes(m.size)),
            h('span', { class: 'c-date' }, U.formatDate(m.modified)));
          row.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
          row.addEventListener('click', function () {
            if (lastPointer === 'touch' && selected === m.id) { activate(m.id); return; } // tap again to open on touch
            select(m.id);
          });
          row.addEventListener('dblclick', function () { if (lastPointer !== 'touch') activate(m.id); });
          row.addEventListener('dragstart', function (e) { e.dataTransfer.setData(DND_TYPE, m.id); e.dataTransfer.effectAllowed = 'move'; });
          if (m.type === 'folder') dropTarget(row, m.id);
          list.appendChild(row);
        });

        var has = !!selected, sel = has && vfs.stat(selected);
        bUp.disabled = cwd === vfs.root();
        bOpen.disabled = bRename.disabled = bMove.disabled = bDelete.disabled = !has;
        bExport.disabled = !(sel && sel.type === 'file');
        var total = vfs.size(cwd);
        status.textContent = items.length + ' item' + (items.length === 1 ? '' : 's') + ' · ' + U.formatBytes(total) +
          (sel ? '  |  Selected: ' + sel.name + ' (' + U.formatBytes(sel.size) + ')' : '');
      }

      list.addEventListener('keydown', function (e) {
        if (e.target !== list) return;
        var items = vfs.list(cwd), i = items.findIndex(function (m) { return m.id === selected; });
        if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) select(items[Math.min(items.length - 1, i + 1)].id); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) select(items[Math.max(0, i - 1)].id); }
        else if (e.key === 'Enter' && selected) { e.preventDefault(); activate(selected); }
        else if (e.key === 'Delete') { e.preventDefault(); deleteSel(); }
        else if (e.key === 'F2') { e.preventDefault(); renameSel(); }
        else if (e.key === 'Backspace') { e.preventDefault(); var s = vfs.stat(cwd); if (s.parent) go(s.parent); }
      });
      list.addEventListener('click', function (e) { if (e.target === list) { selected = null; render(); } });

      // host files dropped anywhere on the window import into the current folder
      var depth = 0;
      win.el.addEventListener('dragenter', function (e) { if (Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { depth++; win.el.classList.add('drop-target'); } });
      win.el.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; win.el.classList.remove('drop-target'); } });
      win.el.addEventListener('dragover', function (e) { if (Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); e.stopPropagation(); } });
      win.el.addEventListener('drop', function (e) {
        depth = 0; win.el.classList.remove('drop-target');
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          e.preventDefault(); e.stopPropagation();
          OS.importHostFiles(Array.from(e.dataTransfer.files), cwd);
        }
      });

      var off = vfs.on('change', function () { render(); });
      win.onDestroy(off);
      win._onRelaunch = function (a) { if (a.folderId) go(a.folderId); };
      render();
      setTimeout(function () { list.focus(); }, 0);
    }
  });
})();
