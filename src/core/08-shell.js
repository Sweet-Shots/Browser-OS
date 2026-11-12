/* =====================================================================
   CORE 8: SHELL (desktop, icons, taskbar, start menu, clock, theme,
   wallpaper, lock screen, first-run setup, global keys)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var SIZE_WARN = 50 * 1024 * 1024;

  var GRADIENTS = {
    aurora: 'linear-gradient(135deg, #4f66e8 0%, #8a5ce0 55%, #d46ab8 100%)',
    ocean: 'linear-gradient(160deg, #0f5c8c 0%, #1aa3a3 60%, #8de0c8 100%)',
    sunset: 'linear-gradient(160deg, #3b2a6b 0%, #c2457a 55%, #f6a25b 100%)',
    forest: 'linear-gradient(160deg, #13322b 0%, #2f6b4f 55%, #a6c77a 100%)',
    dusk: 'linear-gradient(180deg, #151a2e 0%, #2c3563 60%, #6b5d9b 100%)',
    mono: 'linear-gradient(160deg, #3a3f4b 0%, #6b7280 100%)'
  };

  var shell = {
    GRADIENTS: GRADIENTS,
    el: {},

    /** Build the static frame once. */
    mount: function () {
      var root = document.getElementById('os-root');
      root.textContent = '';
      var el = this.el;
      el.desktop = h('div', { id: 'desktop' }, el.icons = h('div', { id: 'desktop-icons', role: 'list' }));
      el.windows = h('div', { id: 'windows' });
      el.startBtn = h('button', { id: 'start-btn', class: 'tb-btn', type: 'button', title: 'Start', 'aria-label': 'Start menu', html: OS.icons.start });
      el.tasks = h('div', { id: 'task-buttons' });
      el.size = h('button', { id: 'size-ind', class: 'tb-btn', type: 'button', title: 'Size of your data. Click for details.' }, '');
      el.save = h('button', { id: 'save-btn', class: 'tb-btn', type: 'button', title: 'Save (Ctrl+S)', 'aria-label': 'Save' }, h('span', { html: OS.icons.save }), h('span', { class: 'dot' }));
      el.clock = h('div', { id: 'clock' });
      el.taskbar = h('div', { id: 'taskbar' }, el.startBtn, el.tasks, h('div', { id: 'tray' }, el.size, el.save, el.clock));
      root.append(el.desktop, el.windows, el.taskbar, h('div', { id: 'os-modals' }), h('div', { id: 'toasts' }), h('div', { id: 'notices' }));

      OS.wm.mount(el.windows);
      OS.wm.events.on('change', function () { shell.renderTasks(); });
      OS.events.on('apps-changed', function () { if (OS.state) shell.renderIcons(); });
      OS.events.on('dirty', function () { shell.updateSaveBtn(); shell.scheduleSize(); });
      OS.events.on('saved', function () { shell.updateSaveBtn(); shell.scheduleSize(); });

      el.startBtn.addEventListener('click', function (e) { e.stopPropagation(); shell.toggleStart(); });
      el.save.addEventListener('click', function () { OS.storage.save(); });
      el.size.addEventListener('click', function () { OS.launch('settings', { section: 'storage' }); });
      document.addEventListener('pointerdown', function (e) {
        if (shell.startMenu && !shell.startMenu.contains(e.target) && !el.startBtn.contains(e.target)) shell.closeStart();
      });

      this.setupDesktopDrop();
      this.setupGlobalKeys();
      this.tickClock(); setInterval(function () { shell.tickClock(); }, 10000);

      window.addEventListener('beforeunload', function (e) {
        if (OS.dirty || OS.wm.hasUnsavedWindows()) { e.preventDefault(); e.returnValue = ''; return ''; }
      });
      // Never let a file dropped outside a drop zone navigate the tab away (that would lose unsaved work).
      window.addEventListener('dragover', function (e) { e.preventDefault(); });
      window.addEventListener('drop', function (e) { e.preventDefault(); });
    },

    /** Called after data is loaded/unlocked. */
    showDesktop: function () {
      this.applyTheme(); this.applyWallpaper();
      this.renderIcons(); this.renderTasks(); this.updateSaveBtn(); this.updateSize(); this.tickClock();
      this.el.desktop.hidden = false; this.el.taskbar.hidden = false;
    },
    hideDesktop: function () {
      this.closeStart();
      this.el.icons.textContent = '';
      this.el.desktop.style.background = '';
      this.el.desktop.hidden = true; this.el.taskbar.hidden = true;
      var m = document.getElementById('os-modals'); if (m) m.textContent = '';
    },

    applyTheme: function () {
      var t = OS.state ? OS.state.settings.theme : null;
      if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
    },
    applyWallpaper: function () {
      var d = this.el.desktop, wp = OS.state.settings.wallpaper || {};
      d.style.background = '';
      if (wp.type === 'color') d.style.background = wp.value;
      else if (wp.type === 'image' && OS.vfs.exists(wp.value)) {
        try { d.style.background = 'center / cover no-repeat url("' + OS.vfs.readDataURL(wp.value) + '"), #222'; }
        catch (e) { d.style.background = GRADIENTS.aurora; }
      } else d.style.background = GRADIENTS[wp.value] || GRADIENTS.aurora;
    },

    /* ---------------- desktop icons ---------------- */
    renderIcons: function () {
      var box = this.el.icons; box.textContent = '';
      OS.apps.forEach(function (app) {
        if (app.hidden) return;
        var lastPointer = 'mouse';
        var b = h('button', { class: 'desk-icon', type: 'button', role: 'listitem', title: app.name },
          h('span', { class: 'ico', html: app.icon }), h('span', null, app.name));
        b.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; });
        b.addEventListener('click', function () {
          box.querySelectorAll('.selected').forEach(function (x) { x.classList.remove('selected'); });
          b.classList.add('selected');
          if (lastPointer === 'touch' || lastPointer === 'pen') OS.launch(app.id);  // single tap on touch
        });
        b.addEventListener('dblclick', function () { if (lastPointer === 'mouse') OS.launch(app.id); });
        b.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); OS.launch(app.id); } });
        box.appendChild(b);
      });
    },

    /* ---------------- taskbar ---------------- */
    renderTasks: function () {
      var box = this.el.tasks; box.textContent = '';
      OS.wm.windows.forEach(function (w) {
        var b = h('button', { class: 'task-btn' + (OS.wm.focused === w ? ' focused' : '') + (w.minimized ? ' minimized' : ''), type: 'button', title: w.title },
          h('span', { class: 'ico', html: w.app.icon }), h('span', { class: 'lbl' }, w.title));
        b.addEventListener('click', function () {
          if (OS.wm.focused === w && !w.minimized) w.minimize(); else w.focus();
        });
        box.appendChild(b);
      });
    },
    updateSaveBtn: function () {
      this.el.save.classList.toggle('dirty', !!OS.dirty);
      this.el.save.title = OS.dirty ? 'Save (Ctrl+S): you have unsaved changes' : 'Save (Ctrl+S): everything is saved';
    },
    scheduleSize: U.debounce(function () { shell.updateSize(); }, 800),
    updateSize: function () {
      if (!OS.state) return;
      var n = OS.storage.dataSize();
      this.lastSize = n;
      this.el.size.textContent = U.formatBytes(n);
      this.el.size.classList.toggle('warn', n > SIZE_WARN);
      if (n > SIZE_WARN && !this.warnedSize) {
        this.warnedSize = true;
        OS.notice('<b>Your data is over 50 MB.</b> Imported files are stored as base64, which makes them about 33% larger, and the whole HTML file grows with them. ' +
          'Large files are slower to open and save. Settings → Storage lists what is using space.', { key: 'size-warn' });
      }
      OS.events.emit('size', n);
    },
    tickClock: function () {
      var d = new Date(), c24 = OS.state && OS.state.settings.clock24;
      this.el.clock.textContent = '';
      this.el.clock.append(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !c24 }),
        h('small', null, d.toLocaleDateString([], { month: 'short', day: 'numeric' })));
    },

    /* ---------------- start menu ---------------- */
    toggleStart: function () { this.startMenu ? this.closeStart() : this.openStart(); },
    closeStart: function () {
      if (!this.startMenu) return;
      this.startMenu.remove(); this.startMenu = null;
      this.el.startBtn.classList.remove('open');
    },
    openStart: function () {
      if (!OS.state) return;
      var self = this;
      var apps = h('div', { class: 'sm-apps' });
      OS.apps.forEach(function (app) {
        if (app.hidden) return;
        apps.appendChild(h('button', { class: 'sm-app', type: 'button', onclick: function () { self.closeStart(); OS.launch(app.id); } },
          h('span', { html: app.icon }), app.name));
      });
      function action(icon, label, hint, fn, disabled, title) {
        return h('button', { class: 'sm-action', type: 'button', disabled: !!disabled, title: title || '', onclick: function () { self.closeStart(); fn(); } },
          h('span', { html: OS.icons[icon] }), label, hint ? h('span', { class: 'hint' }, hint) : null);
      }
      var locked = OS.crypto.isEnabled();
      this.startMenu = h('div', { id: 'start-menu', role: 'menu' },
        h('div', { class: 'sm-head' }, 'Apps'), apps,
        h('div', { class: 'sm-actions' },
          action('save', 'Save', navigator.platform && /Mac/.test(navigator.platform) ? '⌘S' : 'Ctrl+S', function () { OS.storage.save(); }),
          action('download', 'Download a copy', '', function () { OS.storage.save({ download: true }); }),
          action('lock', 'Lock now', '', function () { shell.lockNow(); }, !locked, locked ? '' : 'Set a password in Settings to use Lock')));
      document.getElementById('os-root').appendChild(this.startMenu);
      this.el.startBtn.classList.add('open');
      var first = this.startMenu.querySelector('button'); if (first) first.focus();
    },

    /* ---------------- global keys & drop ---------------- */
    setupGlobalKeys: function () {
      document.addEventListener('keydown', function (e) {
        var k = e.key && e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 's') {
          e.preventDefault();
          if (OS.state) OS.storage.save();
          return;
        }
        if (e.key === 'Escape' && shell.startMenu) { e.preventDefault(); shell.closeStart(); shell.el.startBtn.focus(); }
      });
    },
    setupDesktopDrop: function () {
      var d = this.el.desktop, depth = 0;
      function hasFiles(e) { return e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0; }
      d.addEventListener('dragenter', function (e) { if (hasFiles(e) && OS.state) { depth++; d.classList.add('drop-target'); } });
      d.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; d.classList.remove('drop-target'); } });
      d.addEventListener('drop', function (e) {
        depth = 0; d.classList.remove('drop-target');
        if (!hasFiles(e) || !OS.state) return;
        e.preventDefault();
        var files = Array.from(e.dataTransfer.files);
        var pics = files.filter(function (f) { return /^image\//.test(f.type); });
        var other = files.filter(function (f) { return !/^image\//.test(f.type); });
        var picDir = OS.vfs.resolvePath('/Pictures') || OS.vfs.root();
        var docDir = OS.vfs.resolvePath('/Documents') || OS.vfs.root();
        (async function () {
          if (pics.length) await OS.importHostFiles(pics, picDir);
          if (other.length) await OS.importHostFiles(other, docDir);
        })();
      });
    },

    /* ---------------- lock / unlock ---------------- */
    /** Show the lock screen for an encrypted envelope. Resolves with { data, password } once unlocked. */
    lockScreen: function (envelope) {
      return new Promise(function (resolve) {
        var input = h('input', { class: 'input', type: 'password', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Password' });
        var err = h('div', { class: 'err', role: 'alert' });
        var btn = h('button', { class: 'btn primary', type: 'submit' }, 'Unlock');
        var form = h('form', null, input, err, btn);
        var card = h('div', { class: 'screen-card' },
          h('div', { class: 'big-ico', html: OS.icons.lock.replace('stroke="currentColor"', 'stroke="#fff"') }),
          h('h1', null, 'MyOS is locked'),
          h('p', null, 'Enter your password to decrypt your files.'),
          form,
          h('p', { class: 'small', style: { marginTop: '14px', marginBottom: 0 } }, 'Forgotten passwords cannot be recovered.'));
        var scr = h('div', { class: 'screen', id: 'lock-screen' }, card);
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
          btn.innerHTML = '<span class="spinner"></span>&nbsp; Unlocking…';
          try {
            var pw = input.value;
            var data = await OS.crypto.unlock(envelope, pw);
            scr.remove();
            resolve({ data: data, password: pw });
          } catch (ex) {
            btn.disabled = false; input.disabled = false; btn.textContent = 'Unlock';
            err.textContent = ex.wrongPassword ? 'Wrong password. Try again.' : ('Could not unlock: ' + ex.message);
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
      OS.state = null;                 // drop decrypted data
      OS.crypto.forgetKey();           // drop the key
      shell.hideDesktop();
      var res = await shell.lockScreen(env);
      OS.state = res.data;
      OS.dirty = wasDirty;
      shell.showDesktop();
      OS.events.emit('dirty', OS.dirty);
    },

    /** First launch: optional password. Resolves when done. */
    setupScreen: function () {
      return new Promise(function (resolve) {
        var p1 = h('input', { class: 'input', type: 'password', placeholder: 'New password', autocomplete: 'new-password', 'aria-label': 'New password' });
        var p2 = h('input', { class: 'input', type: 'password', placeholder: 'Repeat password', autocomplete: 'new-password', 'aria-label': 'Repeat password' });
        var err = h('div', { class: 'err', role: 'alert' });
        var setBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Set password');
        var skipBtn = h('button', { class: 'btn ghost', type: 'button' }, OS.crypto.available ? 'Skip, no password' : 'Continue');
        var form = h('form', null, p1, p2, err, setBtn);
        var card = h('div', { class: 'screen-card' },
          h('div', { class: 'big-ico', html: OS.icons.start }),
          h('h1', null, 'Welcome to MyOS'),
          h('p', null, 'Your desktop, files and settings all live inside this one HTML file. You can protect it with a password: everything in the file is then encrypted.'),
          OS.crypto.available
            ? h('div', { class: 'warnbox' }, h('b', null, 'There is no password recovery. '), 'If you forget your password, your data cannot be decrypted by anyone. You can add, change or remove the password later in Settings.')
            : h('div', { class: 'warnbox' }, OS.crypto.unavailableReason),
          OS.crypto.available ? form : null, skipBtn);
        var scr = h('div', { class: 'screen', id: 'setup-screen' }, card);
        document.getElementById('os-root').appendChild(scr);
        setTimeout(function () { (OS.crypto.available ? p1 : skipBtn).focus(); }, 30);
        skipBtn.addEventListener('click', function () { scr.remove(); resolve(false); });
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          if (p1.value.length < 4) { err.textContent = 'Use at least 4 characters.'; return; }
          if (p1.value !== p2.value) { err.textContent = 'The passwords do not match.'; return; }
          setBtn.disabled = true; setBtn.innerHTML = '<span class="spinner"></span>&nbsp; Setting up…';
          try { await OS.crypto.setPassword(p1.value); scr.remove(); resolve(true); }
          catch (ex) { err.textContent = ex.message; setBtn.disabled = false; setBtn.textContent = 'Set password'; }
        });
      });
    }
  };

  OS.shell = shell;
})();
