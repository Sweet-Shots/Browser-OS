/* =====================================================================
   APP: PHOTOS (library + viewer)
   Images are shown through blob: URLs (cheaper than data: URLs for big
   pictures); they are revoked when the window closes.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

  OS.registerApp({
    id: 'photos',
    name: 'Photos',
    icon: OS.appIcons.photos,
    optional: true,
    category: 'Creativity',
    description: 'All the pictures in your files in one place. Zoom in, play a slideshow, set a wallpaper or jump into Paint to edit.',
    keywords: 'images pictures viewer gallery',
    fileTypes: EXT,
    mimeTypes: ['image/'],
    priority: 2,
    defaultSize: { w: 940, h: 640 },
    launch: function (win, args) {
      var vfs = win.vfs, urls = {}, mode = 'library', list = [], index = 0, zoom = false, slideshow = null;

      function url(id) {
        if (!urls[id]) {
          var m = vfs.stat(id);
          urls[id] = URL.createObjectURL(new Blob([vfs.readBytes(id)], { type: m.mime || 'image/png' }));
        }
        return urls[id];
      }
      var fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
      fileIn.addEventListener('change', async function () { var f = Array.from(fileIn.files); fileIn.value = ''; if (f.length) await OS.importHostFiles(f, vfs.special('pictures')); });
      win.body.classList.add('app-photos');

      function library() {
        mode = 'library'; stopShow();
        win.body.textContent = '';
        win.setTitle('Photos');
        var all = vfs.findByExt(EXT);
        var head = h('div', { class: 'ph-head' }, h('h2', null, 'Photos'), h('span', { class: 'muted' }, all.length + ' picture' + (all.length === 1 ? '' : 's')),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn tonal small', type: 'button', onclick: function () { fileIn.click(); } }, h('span', { html: OS.icons.upload }), 'Import'));
        var grid = h('div', { class: 'ph-grid' });
        if (!all.length) {
          grid.appendChild(h('div', { class: 'ph-empty' }, h('span', { html: OS.icons.image }), h('b', null, 'No pictures yet'),
            h('span', null, 'Import some, or drag pictures onto the desktop. Paint drawings show up here too.')));
        }
        // group by month
        var lastGroup = '';
        all.forEach(function (m, i) {
          var g = new Date(m.modified).toLocaleDateString([], { month: 'long', year: 'numeric' });
          if (g !== lastGroup) { grid.appendChild(h('div', { class: 'ph-group' }, g)); lastGroup = g; }
          var img = h('img', { alt: m.name, loading: 'lazy', draggable: 'false' });
          try { img.src = url(m.id); } catch (e) { return; }
          var cell = h('button', { class: 'ph-cell', type: 'button', title: m.name }, img);
          cell.addEventListener('click', function () { open(all, i); });
          cell.addEventListener('contextmenu', function (e) { menu(e, m); });
          grid.appendChild(cell);
        });
        win.body.append(head, grid, fileIn);
      }
      function menu(e, m) {
        OS.contextMenu(e, [
          { label: 'Set as wallpaper', icon: 'image', action: function () { setWallpaper(m.id); } },
          OS.isInstalled('paint') ? { label: 'Edit in Paint', icon: 'brush', action: function () { OS.openWith('paint', m.id); } } : null,
          { label: 'Show in Files', icon: 'folder', action: function () { OS.launch('explorer', { folderId: m.parent, select: m.id }); } },
          { label: 'Export', icon: 'download', action: function () { OS.exportFile(m.id); } },
          '-',
          { label: 'Move to Trash', icon: 'trash', danger: true, action: function () { vfs.trash(m.id); OS.sound.play('trash'); } }
        ]);
      }
      function setWallpaper(id) { OS.state.settings.wallpaper = { type: 'image', value: id }; OS.markDirty(); OS.shell.applyTheme(); OS.toast('Wallpaper changed'); }

      function open(items, i) { list = items; index = i; zoom = false; viewer(); }
      function viewer() {
        mode = 'viewer';
        var m = list[index];
        if (!m || !vfs.exists(m.id)) { library(); return; }
        win.setTitle(m.name);
        win.body.textContent = '';
        var img = h('img', { class: 'ph-img' + (zoom ? ' zoom' : ''), alt: m.name, draggable: 'false' });
        img.src = url(m.id);
        var stage = h('div', { class: 'ph-stage' + (zoom ? ' zoomed' : '') }, img);
        img.addEventListener('dblclick', function () { zoom = !zoom; viewer(); });
        var prev = h('button', { class: 'ph-nav prev', type: 'button', 'aria-label': 'Previous', html: OS.icons.chevLeft, disabled: index === 0, onclick: function () { step(-1); } });
        var next = h('button', { class: 'ph-nav next', type: 'button', 'aria-label': 'Next', html: OS.icons.chevRight, disabled: index >= list.length - 1, onclick: function () { step(1); } });
        function tb(icon, title, fn, active) { return h('button', { class: 'icon-btn sm' + (active ? ' active' : ''), type: 'button', title: title, 'aria-label': title, html: OS.icons[icon], onclick: fn }); }
        var bar = h('div', { class: 'ph-bar' },
          tb('back', 'All photos', library), h('span', { class: 'ph-name' }, m.name), h('span', { class: 'muted small' }, (index + 1) + ' / ' + list.length),
          h('span', { class: 'grow' }),
          tb(zoom ? 'fullscreenExit' : 'fullscreen', zoom ? 'Fit to window' : 'Actual size', function () { zoom = !zoom; viewer(); }, zoom),
          tb(slideshow ? 'pause' : 'play', slideshow ? 'Stop slideshow' : 'Slideshow', function () { slideshow ? stopShow() : startShow(); viewer(); }, !!slideshow),
          tb('image', 'Set as wallpaper', function () { setWallpaper(m.id); }),
          OS.isInstalled('paint') ? tb('brush', 'Edit in Paint', function () { OS.openWith('paint', m.id); }) : null,
          tb('download', 'Export', function () { OS.exportFile(m.id); }),
          tb('trash', 'Move to Trash', function () { vfs.trash(m.id); OS.sound.play('trash'); list.splice(index, 1); if (!list.length) library(); else { index = Math.min(index, list.length - 1); viewer(); } }));
        win.body.append(bar, h('div', { class: 'ph-view' }, stage, prev, next));
        stage.addEventListener('contextmenu', function (e) { menu(e, m); });
        img.addEventListener('load', function () { img.title = m.name + ' · ' + img.naturalWidth + ' × ' + img.naturalHeight + ' · ' + U.formatBytes(m.size); });
      }
      function step(d) { var i = index + d; if (i < 0 || i >= list.length) return false; index = i; zoom = false; viewer(); return true; }
      function startShow() { stopShow(); slideshow = setInterval(function () { if (!step(1)) { index = -1; step(1); } }, 3500); }
      function stopShow() { if (slideshow) { clearInterval(slideshow); slideshow = null; } }

      win.body.tabIndex = -1;
      win.body.addEventListener('keydown', function (e) {
        if (mode !== 'viewer') return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step(1); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); library(); }
        else if (e.key === 'Delete') { e.preventDefault(); win.body.querySelector('[aria-label="Move to Trash"]').click(); }
      });
      var off = vfs.on('change', U.debounce(function () { if (mode === 'library' && !win.closed) library(); }, 100));
      win.onDestroy(function () { off(); stopShow(); Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); }); });
      win._onRelaunch = function (a) { if (a.fileId) start(a.fileId); };

      function start(fileId) {
        var m = vfs.stat(fileId);
        var siblings = vfs.list(m.parent).filter(function (x) { return x.type === 'file' && EXT.indexOf(U.extOf(x.name)) >= 0; });
        open(siblings, Math.max(0, siblings.findIndex(function (x) { return x.id === fileId; })));
      }
      if (args.fileId && vfs.exists(args.fileId)) start(args.fileId); else library();
      setTimeout(function () { win.body.focus(); }, 0);
    }
  });
})();
