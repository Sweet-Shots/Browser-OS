/* =====================================================================
   CORE 11: SHELL
   desktop (wallpaper, "at a glance", icons for apps + /Desktop files),
   shelf (launcher, pinned/running apps, save, status), launcher with
   search, quick settings + notifications, lock screen, boot splash,
   global keyboard shortcuts.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var SIZE_WARN = 50 * 1024 * 1024;
  var DND_TYPE = 'application/x-nimbus-node';
  var LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--logo-bg,#4f66e8)"/>' +
    '<path d="M20.5 41.5h23a8 8 0 0 0 1.2-15.9 11 11 0 0 0-21.2 2.6 6.7 6.7 0 0 0-3 13.3z" fill="#fff"/>' +
    '<circle cx="45" cy="19" r="4" fill="#fff" opacity=".55"/></svg>';

  var shell = {
    LOGO: LOGO,
    DND_TYPE: DND_TYPE,
    el: {},
    panel: null,     // open panel: 'launcher' | 'qs' | null

    /* =============================================================
       frame
       ============================================================= */
    mount: function () {
      var root = document.getElementById('os-root');
      root.textContent = '';
      var el = this.el;
      el.glance = h('div', { id: 'glance' });
      el.icons = h('div', { id: 'desktop-icons', role: 'list', 'aria-label': 'Desktop' });
      el.desktop = h('div', { id: 'desktop' }, el.glance, el.icons);
      el.windows = h('div', { id: 'windows' });
      el.launcherBtn = h('button', { id: 'launcher-btn', class: 'shelf-round', type: 'button', title: 'Launcher (Ctrl+K)', 'aria-label': 'Launcher', html: OS.icons.launcher });
      el.apps = h('div', { id: 'shelf-apps', class: 'shelf-pill', role: 'toolbar', 'aria-label': 'Apps' });
      el.save = h('button', { id: 'save-btn', class: 'shelf-round', type: 'button', title: 'Save (Ctrl+S)', 'aria-label': 'Save' }, h('span', { html: OS.icons.save }), h('span', { class: 'dot' }));
      el.clock = h('span', { id: 'clock' });
      el.statusIcons = h('span', { class: 'status-icons' });
      el.status = h('button', { id: 'status', class: 'shelf-pill', type: 'button', title: 'Quick settings', 'aria-label': 'Quick settings and notifications' }, el.statusIcons, el.clock);
      el.shelf = h('div', { id: 'shelf' }, el.launcherBtn, h('div', { class: 'shelf-center' }, el.apps), h('div', { class: 'shelf-right' }, el.save, el.status));
      root.append(el.desktop, el.windows, el.shelf, h('div', { id: 'os-modals' }), h('div', { id: 'toasts' }), h('div', { id: 'notices' }));

      OS.wm.mount(el.windows);
      OS.wm.events.on('change', function () { shell.renderShelf(); });
      OS.events.on('apps-changed', function () { if (OS.state) { shell.renderShelf(); shell.renderIcons(); } });
      OS.events.on('dirty', function () { shell.updateSaveBtn(); shell.scheduleSize(); });
      OS.events.on('saved', function () { shell.updateSaveBtn(); shell.scheduleSize(); });
      OS.events.on('notifications', function () { shell.updateStatus(); if (shell.panel === 'qs') shell.renderQS(); });
      OS.vfs.on('change', function () { if (OS.state) shell.scheduleIcons(); });

      el.launcherBtn.addEventListener('click', function (e) { e.stopPropagation(); shell.toggle('launcher'); });
      el.status.addEventListener('click', function (e) { e.stopPropagation(); shell.toggle('qs'); });
      el.save.addEventListener('click', function () { OS.storage.save(); });
      document.addEventListener('pointerdown', function (e) {
        if (shell.panelEl && !shell.panelEl.contains(e.target) && !el.launcherBtn.contains(e.target) && !el.status.contains(e.target)) shell.closePanel();
      });

      this.setupDesktop();
      this.setupGlobalKeys();
      this.tickClock(); setInterval(function () { shell.tickClock(); }, 5000);

      window.addEventListener('beforeunload', function (e) {
        if (OS.dirty || OS.wm.hasUnsavedWindows()) { e.preventDefault(); e.returnValue = ''; return ''; }
      });
      // Never let a file dropped outside a drop zone navigate the tab away (that would lose unsaved work).
      window.addEventListener('dragover', function (e) { e.preventDefault(); });
      window.addEventListener('drop', function (e) { e.preventDefault(); });
      document.addEventListener('fullscreenchange', function () { if (shell.panel === 'qs') shell.renderQS(); });
    },

    /** Boot splash shown while the file loads. */
    splash: function () {
      var s = h('div', { id: 'splash' }, h('div', { class: 'splash-logo', html: LOGO }), h('div', { class: 'splash-name' }, OS.storage.APP_NAME));
      document.getElementById('os-root').appendChild(s);
      return { done: function () { s.classList.add('hide'); setTimeout(function () { s.remove(); }, 400); } };
    },

    /** Called after data is loaded/unlocked. */
    showDesktop: function () {
      OS.theme.apply().then(function () { shell.applyWallpaper(); });
      this.applyWallpaper();
      this.renderIcons(); this.renderShelf(); this.updateSaveBtn(); this.updateSize(); this.tickClock(); this.updateStatus();
      this.el.desktop.hidden = false; this.el.shelf.hidden = false; this.el.windows.hidden = false;
    },
    hideDesktop: function () {
      this.closePanel();
      OS.closeMenu();
      this.el.icons.textContent = '';
      this.el.glance.textContent = '';
      this.el.apps.textContent = '';
      this.el.desktop.style.background = '';
      this.el.desktop.hidden = true; this.el.shelf.hidden = true; this.el.windows.hidden = true;
      // remove windows still playing their close animation right away (they may show private content)
      this.el.windows.querySelectorAll('.win').forEach(function (w) { w.remove(); });
      var m = document.getElementById('os-modals'); if (m) m.textContent = '';
      var t = document.getElementById('toasts'); if (t) t.textContent = '';
      OS.notifications.length = 0;
    },
    applyTheme: function () { return OS.theme.apply().then(function () { shell.applyWallpaper(); }); },
    applyWallpaper: function () {
      if (!OS.state) return;
      this.el.desktop.style.background = OS.theme.wallpaperCSS(OS.state.settings.wallpaper, OS.theme.isDark());
      this.el.desktop.classList.toggle('on-light', OS.theme.wallpaperIsLight());
    },

    /* =============================================================
       desktop: glance widget + icons
       ============================================================= */
    greeting: function () {
      var hr = new Date().getHours(), n = OS.state && OS.state.settings.userName;
      var g = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      return g + (n ? ', ' + n : '');
    },
    renderGlance: function () {
      if (!OS.state) return;
      var d = new Date(), g = this.el.glance;
      g.textContent = '';
      g.append(h('div', { class: 'glance-date' }, d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
        h('div', { class: 'glance-sub' }, this.greeting()));
      var next = OS.clockNextAlarm ? OS.clockNextAlarm() : null;
      if (next) g.appendChild(h('div', { class: 'glance-chip' }, h('span', { html: OS.icons.alarm }), next));
    },
    scheduleIcons: U.debounce(function () { shell.renderIcons(); }, 60),
    renderIcons: function () {
      if (!OS.state) return;
      this.renderGlance();
      var box = this.el.icons, vfs = OS.vfs, self = this;
      var selected = box.querySelector('.selected'); var selKey = selected && selected.dataset.key;
      box.textContent = '';
      var items = [];
      OS.state.settings.desktopApps.forEach(function (id) { var a = OS.apps.get(id); if (a && OS.isInstalled(id)) items.push({ key: 'app:' + id, app: a }); });
      var deskId = vfs.special('desktop');
      vfs.list(deskId).forEach(function (m) { items.push({ key: 'file:' + m.id, file: m }); });
      items.forEach(function (it) {
        var lastPointer = 'mouse';
        var icon = it.app ? h('span', { class: 'ico app-ico', html: it.app.icon }) : h('span', { class: 'ico file-ico', html: OS.icons[vfs.iconFor(it.file)] });
        var label = it.app ? it.app.name : it.file.name;
        var b = h('button', { class: 'desk-icon' + (selKey === it.key ? ' selected' : ''), type: 'button', role: 'listitem', title: label, dataset: { key: it.key } },
          icon, h('span', { class: 'lbl' }, label));
        function open() { if (it.app) OS.launch(it.app.id); else OS.openFile(it.file.id); }
        b.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
        b.addEventListener('click', function () {
          box.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); });
          b.classList.add('selected');
          if (lastPointer === 'touch' || lastPointer === 'pen') open();   // single tap on touch
        });
        b.addEventListener('dblclick', function () { if (lastPointer === 'mouse') open(); });
        b.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); open(); }
          else if (it.file && e.key === 'Delete') { e.preventDefault(); self.trashFile(it.file.id); }
          else if (it.file && e.key === 'F2') { e.preventDefault(); self.renameFile(it.file.id); }
        });
        b.addEventListener('contextmenu', function (e) {
          box.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); });
          b.classList.add('selected');
          if (it.app) {
            OS.contextMenu(e, [
              { label: 'Open', icon: 'open', action: open },
              { label: shell.isPinned(it.app.id) ? 'Unpin from shelf' : 'Pin to shelf', icon: 'pin', action: function () { shell.togglePin(it.app.id); } },
              { label: 'Remove from desktop', icon: 'close', action: function () { shell.toggleDesktop(it.app.id); } }
            ]);
          } else {
            var apps = OS.appsForFile(it.file.name, it.file.mime);
            OS.contextMenu(e, [
              { label: 'Open', icon: 'open', action: open },
              apps.length > 1 ? { label: 'Open with ' + apps[1].name, icon: 'open', action: function () { OS.openWith(apps[1].id, it.file.id); } } : null,
              '-',
              { label: 'Rename', icon: 'rename', hint: 'F2', action: function () { self.renameFile(it.file.id); } },
              { label: 'Copy', icon: 'copy', action: function () { OS.clipboard = { op: 'copy', ids: [it.file.id] }; } },
              { label: 'Cut', icon: 'cut', action: function () { OS.clipboard = { op: 'cut', ids: [it.file.id] }; } },
              it.file.type === 'file' ? { label: 'Export to computer', icon: 'download', action: function () { OS.exportFile(it.file.id); } } : null,
              '-',
              { label: 'Move to Trash', icon: 'trash', danger: true, hint: 'Del', action: function () { self.trashFile(it.file.id); } }
            ]);
          }
        });
        if (it.file) {
          b.draggable = true;
          b.addEventListener('dragstart', function (e) { e.dataTransfer.setData(DND_TYPE, JSON.stringify([it.file.id])); e.dataTransfer.effectAllowed = 'move'; });
        }
        box.appendChild(b);
      });
    },
    trashFile: function (id) {
      try { OS.vfs.trash(id); OS.sound.play('trash'); OS.toast({ title: 'Moved to Trash', icon: 'trash', action: { label: 'Undo', run: function () { try { OS.vfs.restore(id); } catch (e) { /* gone */ } } } }); }
      catch (e) { OS.dialogs.alert(e.message); }
    },
    renameFile: async function (id) {
      var s = OS.vfs.stat(id); if (!s) return;
      var v = await OS.dialogs.prompt('New name', { title: 'Rename', value: s.name, validate: function (x) {
        x = x.trim(); return OS.vfs.nameError(x) || (x.toLowerCase() !== s.name.toLowerCase() && OS.vfs.findChild(s.parent, x) ? 'That name is already used here.' : '');
      } });
      if (v == null) return;
      try { OS.vfs.rename(id, v.trim()); } catch (e) { OS.dialogs.alert(e.message); }
    },
    /** Paste the OS clipboard (copy/cut of VFS items) into a folder. */
    paste: function (folderId) {
      var cb = OS.clipboard; if (!cb || !cb.ids.length) return [];
      var done = [], errors = [];
      cb.ids.forEach(function (id) {
        if (!OS.vfs.exists(id)) return;
        try {
          if (cb.op === 'cut') { OS.vfs.move(id, folderId); done.push(id); }
          else done.push(OS.vfs.copy(id, folderId));
        } catch (e) { errors.push(e.message); }
      });
      if (cb.op === 'cut') OS.clipboard = null;
      if (errors.length) OS.dialogs.alert(errors.join('\n'), { title: 'Paste' });
      return done;
    },
    setupDesktop: function () {
      var d = this.el.desktop, depth = 0, self = this;
      function kind(e) { var t = Array.from((e.dataTransfer && e.dataTransfer.types) || []); return t.indexOf(DND_TYPE) >= 0 ? 'node' : t.indexOf('Files') >= 0 ? 'files' : null; }
      d.addEventListener('dragenter', function (e) { if (kind(e) === 'files' && OS.state) { depth++; d.classList.add('drop-target'); } });
      d.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; d.classList.remove('drop-target'); } });
      d.addEventListener('dragover', function (e) { if (kind(e)) { e.preventDefault(); e.dataTransfer.dropEffect = kind(e) === 'node' ? 'move' : 'copy'; } });
      d.addEventListener('drop', function (e) {
        depth = 0; d.classList.remove('drop-target');
        if (!OS.state) return;
        var k = kind(e);
        if (k === 'node') {
          e.preventDefault();
          var desk = OS.vfs.special('desktop');
          JSON.parse(e.dataTransfer.getData(DND_TYPE) || '[]').forEach(function (id) {
            try { if (OS.vfs.stat(id).parent !== desk) OS.vfs.move(id, desk); } catch (err) { OS.toast(err.message, 'error'); }
          });
        } else if (k === 'files') {
          e.preventDefault();
          OS.importHostFiles(Array.from(e.dataTransfer.files), OS.vfs.special('desktop'));
        }
      });
      d.addEventListener('click', function (e) { if (e.target === d || e.target === self.el.icons) self.el.icons.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); }); });
      d.addEventListener('contextmenu', function (e) {
        if (!OS.state || (e.target !== d && e.target !== self.el.icons && !self.el.glance.contains(e.target))) return;
        var desk = OS.vfs.special('desktop');
        OS.contextMenu(e, [
          { label: 'New folder', icon: 'newFolder', action: async function () {
            var n = await OS.dialogs.prompt('Folder name', { title: 'New folder', value: OS.vfs.uniqueName(desk, 'New folder'), validate: function (v) { return OS.vfs.nameError(v.trim()) || (OS.vfs.findChild(desk, v.trim()) ? 'That name is already used here.' : ''); } });
            if (n != null) OS.vfs.mkdir(desk, n.trim());
          } },
          { label: 'New text file', icon: 'newFile', action: function () { var id = OS.vfs.createFile(desk, OS.vfs.uniqueName(desk, 'Note.txt'), ''); OS.openFile(id); } },
          { label: 'Paste', icon: 'paste', disabled: !(OS.clipboard && OS.clipboard.ids.length), action: function () { self.paste(desk); } },
          '-',
          { label: 'Change wallpaper', icon: 'image', action: function () { OS.launch('settings', { section: 'personalize' }); } },
          { label: 'Open Desktop folder', icon: 'folder', action: function () { OS.launch('explorer', { folderId: desk }); } },
          { label: 'Settings', icon: 'sliders', action: function () { OS.launch('settings'); } }
        ]);
      });
    },

    /* =============================================================
       shelf
       ============================================================= */
    isPinned: function (id) { return OS.state.settings.shelf.indexOf(id) >= 0; },
    togglePin: function (id) {
      var s = OS.state.settings;
      s.shelf = this.isPinned(id) ? s.shelf.filter(function (x) { return x !== id; }) : s.shelf.concat([id]);
      OS.markDirty(); this.renderShelf();
    },
    toggleDesktop: function (id) {
      var s = OS.state.settings, on = s.desktopApps.indexOf(id) >= 0;
      s.desktopApps = on ? s.desktopApps.filter(function (x) { return x !== id; }) : s.desktopApps.concat([id]);
      OS.markDirty(); this.renderIcons();
    },
    renderShelf: function () {
      if (!OS.state) return;
      var box = this.el.apps; box.textContent = '';
      var ids = OS.state.settings.shelf.filter(function (id) { return OS.isInstalled(id); });
      OS.wm.windows.forEach(function (w) { if (ids.indexOf(w.app.id) < 0) ids.push(w.app.id); });
      ids.forEach(function (id) {
        var app = OS.apps.get(id); if (!app) return;
        var wins = OS.wm.findByApp(id);
        var focused = wins.some(function (w) { return OS.wm.focused === w && !w.minimized; });
        var b = h('button', { class: 'shelf-app' + (wins.length ? ' running' : '') + (focused ? ' focused' : ''), type: 'button', title: app.name, 'aria-label': app.name, dataset: { app: id } },
          h('span', { class: 'ico app-ico', html: app.icon }), h('span', { class: 'run-dot' + (wins.length > 1 ? ' multi' : '') }));
        b.addEventListener('click', function () {
          var ws = OS.wm.findByApp(id);
          if (!ws.length) { OS.launch(id); return; }
          if (ws.length === 1) { var w = ws[0]; if (OS.wm.focused === w && !w.minimized) w.minimize(); else w.focus(); return; }
          // several windows: cycle through them
          var i = ws.indexOf(OS.wm.focused);
          ws[(i + 1) % ws.length].focus();
        });
        b.addEventListener('contextmenu', function (e) {
          var ws = OS.wm.findByApp(id);
          var items = ws.map(function (w) { return { label: w.title, icon: w.minimized ? 'minimize' : 'tab', action: function () { w.focus(); } }; });
          if (items.length) items.push('-');
          items.push(app.singleInstance && ws.length ? null : { label: 'New window', icon: 'plus', action: function () { OS.launch(id); } });
          items.push({ label: shell.isPinned(id) ? 'Unpin' : 'Pin to shelf', icon: 'pin', action: function () { shell.togglePin(id); } });
          if (ws.length) items.push({ label: ws.length > 1 ? 'Close all windows' : 'Close', icon: 'close', action: function () { ws.forEach(function (w) { w.close(); }); } });
          OS.contextMenu(e, items);
        });
        box.appendChild(b);
      });
      box.hidden = !ids.length;
    },
    updateSaveBtn: function () {
      var d = !!OS.dirty;
      this.el.save.classList.toggle('dirty', d);
      this.el.save.title = d ? 'Save (Ctrl+S): you have unsaved changes' : 'Save (Ctrl+S): everything is saved';
      if (this.panel === 'qs') this.renderQS();
    },
    scheduleSize: U.debounce(function () { shell.updateSize(); }, 800),
    updateSize: function () {
      if (!OS.state) return;
      var n = OS.storage.dataSize();
      this.lastSize = n;
      if (n > SIZE_WARN && !this.warnedSize) {
        this.warnedSize = true;
        OS.notice('<b>Your data is over 50 MB.</b> Imported files are stored as base64, which makes them about 33% larger, and the whole HTML file grows with them. ' +
          'Large files are slower to open and save. Settings → Storage lists what is using space.', { key: 'size-warn' });
      }
      this.updateStatus();
      OS.events.emit('size', n);
    },
    updateStatus: function () {
      var ic = this.el.statusIcons; if (!ic) return;
      ic.textContent = '';
      var s = OS.state && OS.state.settings;
      if (s && !s.sound.enabled) ic.appendChild(h('span', { title: 'Sounds off', html: OS.icons.volumeOff }));
      if (OS.crypto.isEnabled()) ic.appendChild(h('span', { title: 'Encrypted', html: OS.icons.lock }));
      if (this.lastSize > SIZE_WARN) ic.appendChild(h('span', { class: 'warn', title: 'Large file', html: OS.icons.warning }));
      if (OS.notifications.length) ic.appendChild(h('span', { class: 'notif-dot', title: OS.notifications.length + ' notifications' }));
    },
    tickClock: function () {
      var d = new Date(), c24 = OS.state && OS.state.settings.clock24;
      this.el.clock.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !c24 });
      if (OS.state && this._lastMin !== d.getMinutes()) { this._lastMin = d.getMinutes(); this.renderGlance(); }
    },

    /* =============================================================
       panels: launcher + quick settings
       ============================================================= */
    toggle: function (which) { if (this.panel === which) this.closePanel(); else this.openPanel(which); },
    closePanel: function () {
      if (!this.panelEl) return;
      var p = this.panelEl; p.classList.add('closing'); p.removeAttribute('id'); setTimeout(function () { p.remove(); }, 140);
      this.panelEl = null; this.panel = null;
      this.el.launcherBtn.classList.remove('open'); this.el.status.classList.remove('open');
    },
    openPanel: function (which) {
      if (!OS.state) return;
      this.closePanel(); OS.closeMenu();
      this.panel = which;
      this.panelEl = h('div', { class: 'panel ' + which, id: which === 'qs' ? 'quick-settings' : 'launcher', role: 'dialog' });
      document.getElementById('os-root').appendChild(this.panelEl);
      if (which === 'launcher') { this.el.launcherBtn.classList.add('open'); this.renderLauncher(); }
      else { this.el.status.classList.add('open'); this.renderQS(); }
    },

    renderLauncher: function () {
      var p = this.panelEl, self = this;
      var input = h('input', { class: 'launcher-search', type: 'search', placeholder: 'Search apps, files and the web', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false' });
      var body = h('div', { class: 'launcher-body' });
      p.append(h('div', { class: 'launcher-top' }, h('span', { class: 'ls-ico', html: OS.icons.search }), input), body);
      var results = [], sel = 0;

      function appTile(app) {
        var b = h('button', { class: 'lz-app', type: 'button', title: app.name }, h('span', { class: 'ico app-ico', html: app.icon }), h('span', { class: 'lbl' }, app.name));
        b.addEventListener('click', function () { self.closePanel(); OS.launch(app.id); });
        b.addEventListener('contextmenu', function (e) { self.appMenu(e, app); });
        return b;
      }
      function renderHome() {
        body.textContent = '';
        var grid = h('div', { class: 'lz-grid' });
        OS.installedApps().forEach(function (a) { grid.appendChild(appTile(a)); });
        body.appendChild(grid);
        var recent = OS.vfs.recent(4);
        if (recent.length) {
          body.appendChild(h('div', { class: 'lz-heading' }, 'Recent files'));
          var row = h('div', { class: 'lz-recent' });
          recent.forEach(function (m) {
            var b = h('button', { class: 'lz-file', type: 'button', title: m.path }, h('span', { class: 'ico', html: OS.icons[OS.vfs.iconFor(m)] }),
              h('span', { class: 'lz-file-txt' }, h('span', { class: 'lbl' }, m.name), h('span', { class: 'sub' }, U.timeAgo(m.modified))));
            b.addEventListener('click', function () { self.closePanel(); OS.openFile(m.id); });
            row.appendChild(b);
          });
          body.appendChild(row);
        }
      }
      function renderResults(q) {
        body.textContent = '';
        results = [];
        var ql = q.toLowerCase();
        OS.installedApps().filter(function (a) { return a.name.toLowerCase().indexOf(ql) >= 0 || (a.keywords || '').toLowerCase().indexOf(ql) >= 0; })
          .forEach(function (a) { results.push({ icon: a.icon, appIcon: true, label: a.name, sub: 'App', run: function () { OS.launch(a.id); } }); });
        OS.vfs.search(q, 8).forEach(function (m) {
          results.push({ icon: OS.icons[OS.vfs.iconFor(m)], label: m.name, sub: m.path, run: function () { OS.openFile(m.id); } });
        });
        if (OS.isInstalled('browser')) results.push({ icon: OS.icons.globe, label: 'Search the web for "' + q + '"', sub: 'Browser', run: function () { OS.launch('browser', { search: q }); } });
        // a few settings shortcuts
        [['dark', 'Dark theme', function () { OS.state.settings.theme = 'dark'; OS.markDirty(); shell.applyTheme(); }],
         ['light', 'Light theme', function () { OS.state.settings.theme = 'light'; OS.markDirty(); shell.applyTheme(); }],
         ['wallpaper', 'Change wallpaper', function () { OS.launch('settings', { section: 'personalize' }); }],
         ['password', 'Password and lock', function () { OS.launch('settings', { section: 'security' }); }]].forEach(function (s) {
          if (s[0].indexOf(ql) === 0 || s[1].toLowerCase().indexOf(ql) >= 0) results.push({ icon: OS.icons.sliders, label: s[1], sub: 'Setting', run: s[2] });
        });
        sel = 0;
        if (!results.length) { body.appendChild(h('div', { class: 'lz-empty' }, 'No results for "' + q + '"')); return; }
        var list = h('div', { class: 'lz-results', role: 'listbox' });
        results.forEach(function (r, i) {
          var b = h('button', { class: 'lz-result' + (i === 0 ? ' active' : ''), type: 'button', role: 'option' },
            h('span', { class: 'ico' + (r.appIcon ? ' app-ico' : ''), html: r.icon }), h('span', { class: 'lz-file-txt' }, h('span', { class: 'lbl' }, r.label), h('span', { class: 'sub' }, r.sub)));
          b.addEventListener('click', function () { self.closePanel(); r.run(); });
          b.addEventListener('pointerenter', function () { setSel(i); });
          list.appendChild(b);
        });
        body.appendChild(list);
      }
      function setSel(i) {
        var items = body.querySelectorAll('.lz-result'); if (!items.length) return;
        sel = (i + items.length) % items.length;
        items.forEach(function (x, k) { x.classList.toggle('active', k === sel); });
        items[sel].scrollIntoView({ block: 'nearest' });
      }
      input.addEventListener('input', function () { var q = input.value.trim(); if (q) renderResults(q); else renderHome(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel(sel + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(sel - 1); }
        else if (e.key === 'Enter' && input.value.trim() && results[sel]) { e.preventDefault(); var r = results[sel]; self.closePanel(); r.run(); }
      });
      renderHome();
      setTimeout(function () { input.focus(); }, 30);
    },
    appMenu: function (e, app) {
      var self = this;
      OS.contextMenu(e, [
        { label: 'Open', icon: 'open', action: function () { self.closePanel(); OS.launch(app.id); } },
        { label: this.isPinned(app.id) ? 'Unpin from shelf' : 'Pin to shelf', icon: 'pin', action: function () { self.togglePin(app.id); } },
        { label: OS.state.settings.desktopApps.indexOf(app.id) >= 0 ? 'Remove from desktop' : 'Add to desktop', icon: 'desktop', action: function () { self.toggleDesktop(app.id); } },
        app.optional ? '-' : null,
        app.optional ? { label: 'Uninstall', icon: 'trash', danger: true, action: function () { self.closePanel(); OS.uninstallApp(app.id).then(function (ok) { if (ok) OS.toast(app.name + ' was uninstalled'); }); } } : null
      ]);
    },

    renderQS: function () {
      var p = this.panelEl, self = this; if (!p || !OS.state) return;
      var s = OS.state.settings;
      p.textContent = '';
      var name = s.userName || 'Nimbus user';
      var head = h('div', { class: 'qs-head' },
        h('div', { class: 'avatar' }, (s.userName || 'N').trim().charAt(0).toUpperCase()),
        h('div', { class: 'qs-who' }, h('b', null, name), h('span', null, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))),
        h('button', { class: 'icon-btn', type: 'button', title: 'Settings', 'aria-label': 'Settings', html: OS.icons.sliders, onclick: function () { self.closePanel(); OS.launch('settings'); } }),
        OS.crypto.isEnabled() ? h('button', { class: 'icon-btn', type: 'button', title: 'Lock now', 'aria-label': 'Lock now', html: OS.icons.lock, onclick: function () { self.closePanel(); shell.lockNow(); } }) : null);
      function tile(icon, label, sub, active, fn, opts) {
        opts = opts || {};
        return h('button', { class: 'qs-tile' + (active ? ' on' : ''), type: 'button', disabled: !!opts.disabled, title: opts.title || '', 'aria-pressed': opts.toggle ? String(!!active) : null, onclick: fn },
          h('span', { class: 'qs-ico', html: OS.icons[icon] }), h('span', { class: 'qs-txt' }, h('b', null, label), sub ? h('span', null, sub) : null));
      }
      var dark = OS.theme.isDark();
      var fsOK = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
      var isFs = !!document.fullscreenElement;
      var tiles = h('div', { class: 'qs-tiles' },
        tile(OS.dirty ? 'save' : 'check', OS.dirty ? 'Save' : 'Saved', OS.dirty ? 'Unsaved changes' : U.formatBytes(this.lastSize || 0), OS.dirty, function () { OS.storage.save(); }),
        tile(dark ? 'moon' : 'sun', 'Dark theme', s.theme === 'auto' ? 'Automatic' : (dark ? 'On' : 'Off'), dark, function () {
          s.theme = dark ? 'light' : 'dark'; OS.markDirty(); self.applyTheme().then(function () { self.renderQS(); });
        }, { toggle: true }),
        tile(s.sound.enabled ? 'volume' : 'volumeOff', 'Sounds', s.sound.enabled ? 'On' : 'Off', s.sound.enabled, function () {
          s.sound.enabled = !s.sound.enabled; OS.markDirty(); if (s.sound.enabled) OS.sound.play('pop'); self.updateStatus(); self.renderQS();
        }, { toggle: true }),
        tile(isFs ? 'fullscreenExit' : 'fullscreen', 'Full screen', isFs ? 'On' : (fsOK ? 'Off' : 'Not available'), isFs, function () {
          if (isFs) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () { OS.toast('Full screen is blocked in this browser.'); });
        }, { toggle: true, disabled: !fsOK }),
        tile('download', 'Download copy', 'Save as new file', false, function () { self.closePanel(); OS.storage.save({ download: true }); }),
        OS.crypto.isEnabled() ? tile('lock', 'Lock', 'Encrypted', false, function () { self.closePanel(); shell.lockNow(); })
          : tile('unlock', 'Not locked', 'Set a password', false, function () { self.closePanel(); OS.launch('settings', { section: 'security' }); }));
      var vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.sound.volume), 'aria-label': 'Volume', class: 'qs-range' });
      vol.addEventListener('input', function () { s.sound.volume = +vol.value; OS.sound.setVolume(+vol.value); });
      vol.addEventListener('change', function () { OS.markDirty(); OS.sound.play('pop'); });
      var volRow = h('div', { class: 'qs-slider' }, h('span', { html: OS.icons.volume }), vol);

      var notifs = h('div', { class: 'qs-notifs' });
      var nh = h('div', { class: 'qs-nhead' }, h('b', null, 'Notifications'),
        OS.notifications.length ? h('button', { class: 'btn text small', type: 'button', onclick: function () { OS.notifications.length = 0; OS.events.emit('notifications'); } }, 'Clear all') : null);
      notifs.appendChild(nh);
      if (!OS.notifications.length) notifs.appendChild(h('div', { class: 'qs-empty' }, 'No notifications'));
      OS.notifications.slice(0, 20).forEach(function (n) {
        var item = h('div', { class: 'qs-notif' }, h('span', { class: 'qs-nico', html: OS.icons[n.icon] || OS.icons.bell }),
          h('div', { class: 'qs-ntxt' }, h('b', null, n.title), n.body ? h('span', null, n.body) : null, h('small', null, U.timeAgo(n.at))),
          n.action ? h('button', { class: 'btn text small', type: 'button', onclick: function () { self.closePanel(); n.action.run(); } }, n.action.label) : null);
        notifs.appendChild(item);
      });
      p.append(head, tiles, volRow, notifs);
    },

    /* =============================================================
       global keys
       ============================================================= */
    setupGlobalKeys: function () {
      document.addEventListener('keydown', function (e) {
        var k = e.key && e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === 's') {
          e.preventDefault();
          if (OS.state && !document.querySelector('#lock-screen, #setup')) OS.storage.save();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'k' && OS.state && !document.querySelector('.modal-overlay, #setup, #lock-screen')) {
          e.preventDefault(); shell.toggle('launcher'); return;
        }
        if (e.key === 'Escape' && shell.panel) { e.preventDefault(); var w = shell.panel; shell.closePanel(); (w === 'qs' ? shell.el.status : shell.el.launcherBtn).focus(); }
      });
    },

    /* =============================================================
       lock screen
       ============================================================= */
    /** Show the lock screen for an encrypted envelope. Resolves with { data, password } once unlocked. */
    lockScreen: function (envelope) {
      return new Promise(function (resolve) {
        var clock = h('div', { class: 'lk-time' }), date = h('div', { class: 'lk-date' });
        function tick() { var d = new Date(); clock.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); date.textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); }
        tick(); var timer = setInterval(tick, 5000);
        var input = h('input', { class: 'lk-input', type: 'password', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Password' });
        var btn = h('button', { class: 'lk-go', type: 'submit', 'aria-label': 'Unlock', html: OS.icons.forward });
        var err = h('div', { class: 'lk-err', role: 'alert' });
        var form = h('form', { class: 'lk-form' }, input, btn);
        var scr = h('div', { class: 'screen lock', id: 'lock-screen' },
          h('div', { class: 'lk-top' }, clock, date),
          h('div', { class: 'lk-card' },
            h('div', { class: 'lk-avatar', html: OS.icons.lock }),
            h('div', { class: 'lk-title' }, OS.storage.APP_NAME + ' is locked'),
            form, err,
            h('div', { class: 'lk-note' }, 'Forgotten passwords cannot be recovered.')));
        scr.style.background = OS.theme.wallpaperCSS({ type: 'preset', value: 'dusk' }, true);
        document.getElementById('os-root').appendChild(scr);
        if (!OS.crypto.available) {
          input.disabled = true; btn.disabled = true;
          err.textContent = OS.crypto.unavailableReason + ' This file is encrypted, so it cannot be opened in this browser.';
        }
        setTimeout(function () { input.focus(); }, 30);
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          if (!input.value) { err.textContent = 'Enter your password.'; return; }
          btn.disabled = true; input.disabled = true; err.textContent = '';
          btn.innerHTML = '<span class="spinner"></span>';
          scr.classList.add('busy');
          try {
            var pw = input.value;
            var data = await OS.crypto.unlock(envelope, pw);
            clearInterval(timer);
            scr.classList.add('unlocking');
            OS.sound.play('unlock');
            setTimeout(function () { scr.remove(); }, 350);
            resolve({ data: data, password: pw });
          } catch (ex) {
            scr.classList.remove('busy');
            btn.disabled = false; input.disabled = false; btn.innerHTML = OS.icons.forward;
            err.textContent = ex.wrongPassword ? 'Wrong password. Try again.' : ('Could not unlock: ' + ex.message);
            form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
            OS.sound.play('error', { force: false });
            input.select(); input.focus();
          }
        });
      });
    },

    /** "Lock now": encrypt the live state into memory, drop plaintext, show the lock screen. */
    lockNow: async function () {
      if (!OS.crypto.isEnabled() || !OS.state) return;
      if (!(await OS.wm.closeAll(false))) { OS.toast('Lock cancelled: a window has unsaved changes.', 'warn'); return; }
      var wasDirty = OS.dirty;
      var env = await OS.crypto.encryptState(OS.state);
      if (wasDirty) { try { await OS.storage.backup.write(); } catch (e) { /* best effort */ } }
      OS.sound.play('lock');
      OS.state = null;                 // drop decrypted data
      OS.crypto.forgetKey();           // drop the key
      OS.clipboard = null;
      shell.hideDesktop();
      OS.theme.applyDefault();
      var res = await shell.lockScreen(env);
      OS.state = res.data;
      OS.dirty = wasDirty;
      shell.showDesktop();
      OS.events.emit('dirty', OS.dirty);
    }
  };

  OS.shell = shell;
  OS.clipboard = null;   // { op: 'copy'|'cut', ids: [...] } shared by Files and the desktop
})();
