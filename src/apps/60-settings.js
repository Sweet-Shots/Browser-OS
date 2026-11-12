/* =====================================================================
   APP: SETTINGS
   Personalize, Sounds, Apps, Password, Storage & saving, About
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var ACCENTS = ['auto', '#4f66e8', '#1f8f9f', '#2f9d6d', '#7a9a2e', '#c9824e', '#d0507a', '#8a5cd6', '#5c6575'];

  OS.registerApp({
    id: 'settings',
    name: 'Settings',
    icon: OS.appIcons.settings,
    category: 'System',
    keywords: 'preferences wallpaper theme password storage',
    defaultSize: { w: 860, h: 600 },
    singleInstance: true,
    launch: function (win, args) {
      var dlg = win.dialogs, vfs = win.vfs;
      var sections = [
        { id: 'personalize', label: 'Personalize', icon: 'palette', render: personalize },
        { id: 'sounds', label: 'Sounds', icon: 'volume', render: sounds },
        { id: 'apps', label: 'Apps', icon: 'apps', render: appsSection },
        { id: 'security', label: 'Password', icon: 'shield', render: security },
        { id: 'storage', label: 'Storage & saving', icon: 'database', render: storage },
        { id: 'about', label: 'About ' + OS.storage.APP_NAME, icon: 'info', render: about }
      ];
      var current = args.section === 'appearance' ? 'personalize' : (args.section || 'personalize');
      var nav = h('nav', { class: 'st-nav', 'aria-label': 'Settings sections' });
      var main = h('div', { class: 'st-main' });
      win.body.classList.add('app-settings');
      win.body.append(nav, main);

      function S() { return OS.state.settings; }
      function changed() { OS.markDirty(); }
      function card(title, desc) {
        var c = h('section', { class: 'st-card' }, title ? h('h3', null, title) : null, desc ? h('p', { class: 'st-desc' }, desc) : null);
        for (var i = 2; i < arguments.length; i++) if (arguments[i]) c.appendChild(arguments[i]);
        return c;
      }
      function row() { var r = h('div', { class: 'st-row' }); for (var i = 0; i < arguments.length; i++) if (arguments[i]) r.appendChild(arguments[i]); return r; }
      /** A list item with a label/description on the left and a control on the right. */
      function item(label, desc, control, icon) {
        return h('label', { class: 'st-item' }, icon ? h('span', { class: 'st-item-ico', html: OS.icons[icon] }) : null,
          h('span', { class: 'st-item-txt' }, h('b', null, label), desc ? h('small', null, desc) : null), control);
      }
      function sw(on, fn) { var c = h('input', { type: 'checkbox', class: 'switch', checked: !!on }); c.addEventListener('change', function () { fn(c.checked); }); return c; }
      function go(id) { current = id; render(); main.scrollTop = 0; }

      function render() {
        if (win.closed || !OS.state) return;
        nav.textContent = '';
        nav.appendChild(h('div', { class: 'st-profile' }, h('div', { class: 'avatar' }, (S().userName || 'N').charAt(0).toUpperCase()),
          h('div', null, h('b', null, S().userName || 'Nimbus user'), h('small', null, OS.crypto.isEnabled() ? 'Encrypted' : 'Not encrypted'))));
        sections.forEach(function (s) {
          nav.appendChild(h('button', { class: 'st-tab' + (s.id === current ? ' active' : ''), type: 'button', 'aria-current': s.id === current ? 'page' : null, onclick: function () { go(s.id); } },
            h('span', { html: OS.icons[s.icon] }), h('span', null, s.label)));
        });
        var scroll = main.scrollTop;
        main.textContent = '';
        var sec = sections.find(function (s) { return s.id === current; }) || sections[0];
        main.appendChild(h('h2', null, sec.label));
        sec.render(main);
        main.scrollTop = scroll;
      }

      /* ---------------- personalize ---------------- */
      function personalize(m) {
        var s = S(), dark = OS.theme.isDark();
        var preview = h('div', { class: 'st-preview' });
        preview.style.background = OS.theme.wallpaperCSS(s.wallpaper, dark);
        preview.appendChild(h('div', { class: 'st-prev-win' }, h('div', { class: 'st-prev-bar' }), h('div', { class: 'st-prev-body' }, h('span'), h('span'), h('span'))));
        preview.appendChild(h('div', { class: 'st-prev-shelf' }, h('i'), h('i'), h('i')));

        var modes = h('div', { class: 'seg' });
        [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['auto', 'Automatic', 'auto']].forEach(function (t) {
          modes.appendChild(h('button', { class: 'seg-btn' + (s.theme === t[0] ? ' on' : ''), type: 'button', 'aria-pressed': String(s.theme === t[0]),
            onclick: function () { s.theme = t[0]; changed(); OS.shell.applyTheme().then(render); } }, h('span', { html: OS.icons[t[2]] }), t[1]));
        });
        m.appendChild(card(null, null, h('div', { class: 'st-hero' }, preview, h('div', { class: 'st-hero-side' }, h('h3', null, 'Theme'), modes,
          h('p', { class: 'st-desc' }, 'Automatic follows your computer\'s light or dark setting.')))));

        var grid = h('div', { class: 'wp-grid' });
        Object.keys(OS.theme.WALLPAPERS).forEach(function (k) {
          var on = s.wallpaper.type === 'preset' && s.wallpaper.value === k;
          var b = h('button', { class: 'wp-thumb' + (on ? ' on' : ''), type: 'button', title: OS.theme.WALLPAPERS[k].name, 'aria-pressed': String(on),
            onclick: function () { setWp({ type: 'preset', value: k }); } }, h('span', null, OS.theme.WALLPAPERS[k].name));
          b.style.background = OS.theme.wallpaperCSS({ type: 'preset', value: k }, dark);
          grid.appendChild(b);
        });
        if (s.wallpaper.type === 'image' && vfs.exists(s.wallpaper.value)) {
          var cur = h('button', { class: 'wp-thumb on', type: 'button', title: vfs.stat(s.wallpaper.value).name }, h('span', null, 'Your picture'));
          cur.style.background = OS.theme.wallpaperCSS(s.wallpaper, dark);
          grid.appendChild(cur);
        }
        var colorIn = h('input', { type: 'color', value: s.wallpaper.type === 'color' ? s.wallpaper.value : '#3b4a6b', 'aria-label': 'Solid color' });
        colorIn.addEventListener('change', function () { setWp({ type: 'color', value: colorIn.value }); });
        var pickBtn = h('button', { class: 'btn tonal small', type: 'button' }, h('span', { html: OS.icons.image }), 'From Files…');
        pickBtn.addEventListener('click', async function () {
          var id = await dlg.openFile({ title: 'Choose a wallpaper', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'], start: vfs.special('pictures') });
          if (id) setWp({ type: 'image', value: id });
        });
        var upIn = h('input', { type: 'file', accept: 'image/*', hidden: true });
        upIn.addEventListener('change', async function () {
          var f = upIn.files[0]; upIn.value = ''; if (!f) return;
          var ids = await OS.importHostFiles([f], vfs.special('pictures'));
          if (ids[0]) setWp({ type: 'image', value: ids[0] });
        });
        var upBtn = h('button', { class: 'btn tonal small', type: 'button', onclick: function () { upIn.click(); } }, h('span', { html: OS.icons.upload }), 'From computer…');
        m.appendChild(card('Wallpaper', 'Colors across the system adapt to your wallpaper.', grid,
          row(h('label', { class: 'st-color' }, colorIn, 'Solid color'), pickBtn, upBtn, upIn)));

        var acc = h('div', { class: 'st-accents' });
        ACCENTS.forEach(function (c) {
          var on = (s.accent || 'auto') === c;
          var b = h('button', { class: 'st-accent' + (on ? ' on' : '') + (c === 'auto' ? ' auto' : ''), type: 'button', title: c === 'auto' ? 'From wallpaper' : c, 'aria-label': c === 'auto' ? 'Accent from wallpaper' : 'Accent ' + c, 'aria-pressed': String(on),
            onclick: function () { s.accent = c; changed(); OS.shell.applyTheme().then(render); } }, c === 'auto' ? h('span', { html: OS.icons.sparkle }) : null);
          if (c !== 'auto') b.style.background = c;
          acc.appendChild(b);
        });
        var iconsSeg = h('div', { class: 'seg' });
        [['colorful', 'Colorful'], ['themed', 'Themed']].forEach(function (t) {
          iconsSeg.appendChild(h('button', { class: 'seg-btn' + (s.iconStyle === t[0] ? ' on' : ''), type: 'button', 'aria-pressed': String(s.iconStyle === t[0]),
            onclick: function () { s.iconStyle = t[0]; changed(); OS.shell.applyTheme().then(render); } }, t[1]));
        });
        m.appendChild(card('Colors', null,
          h('div', { class: 'st-sub' }, 'Accent color'), acc,
          h('div', { class: 'st-sub' }, 'App icons'), iconsSeg));

        var nameIn = h('input', { class: 'input', type: 'text', value: s.userName || '', maxlength: '40', placeholder: 'Your name', 'aria-label': 'Your name' });
        if (s.userName) nameIn.value = s.userName;
        nameIn.addEventListener('change', function () { s.userName = nameIn.value.trim(); changed(); OS.shell.renderGlance(); render(); });
        m.appendChild(card('You', null,
          item('Your name', 'Used in greetings and the terminal', nameIn, 'person'),
          item('24-hour clock', null, sw(s.clock24, function (v) { s.clock24 = v; changed(); OS.shell.tickClock(); }), 'clock')));
      }
      function setWp(v) { S().wallpaper = v; changed(); OS.shell.applyTheme().then(render); }

      /* ---------------- sounds ---------------- */
      function sounds(m) {
        var snd = S().sound;
        var vol = h('input', { type: 'range', class: 'range', min: '0', max: '1', step: '0.05', value: String(snd.volume), 'aria-label': 'Volume' });
        vol.addEventListener('input', function () { snd.volume = +vol.value; OS.sound.setVolume(+vol.value); });
        vol.addEventListener('change', function () { changed(); OS.sound.play('pop', { force: true }); });
        m.appendChild(card(null, OS.sound.available ? null : 'This browser cannot play generated sounds.',
          item('System sounds', 'Notifications, alarms, unlocking and games', sw(snd.enabled, function (v) { snd.enabled = v; changed(); OS.shell.updateStatus(); if (v) OS.sound.play('pop'); }), 'volume'),
          item('Interface sounds', 'Soft clicks when windows open, close and minimize', sw(snd.ui, function (v) { snd.ui = v; changed(); }), 'sparkle'),
          h('div', { class: 'st-item' }, h('span', { class: 'st-item-ico', html: OS.icons.volume }), h('span', { class: 'st-item-txt' }, h('b', null, 'Volume')), vol)));
        var list = h('div', { class: 'st-sounds' });
        [['startup', 'Start up'], ['notify', 'Notification'], ['success', 'Success'], ['alarm', 'Alarm'], ['unlock', 'Unlock'], ['trash', 'Trash'], ['error', 'Error'], ['win', 'Game won']].forEach(function (x) {
          list.appendChild(h('button', { class: 'chip', type: 'button', onclick: function () { OS.sound.play(x[0], { force: true }); } }, h('span', { html: OS.icons.play }), x[1]));
        });
        m.appendChild(card('Preview', 'All sounds are generated live by your browser, so there are no audio files in Nimbus.', list));
      }

      /* ---------------- apps ---------------- */
      function appsSection(m) {
        var s = S();
        var list = h('div', { class: 'st-applist' });
        OS.installedApps().forEach(function (a) {
          var pin = h('button', { class: 'chip' + (s.shelf.indexOf(a.id) >= 0 ? ' on' : ''), type: 'button', onclick: function () { OS.shell.togglePin(a.id); render(); } }, h('span', { html: OS.icons.pin }), 'Shelf');
          var desk = h('button', { class: 'chip' + (s.desktopApps.indexOf(a.id) >= 0 ? ' on' : ''), type: 'button', onclick: function () { OS.shell.toggleDesktop(a.id); render(); } }, h('span', { html: OS.icons.desktop }), 'Desktop');
          var rm = a.optional || a.sideloaded ? h('button', { class: 'icon-btn sm', type: 'button', title: 'Uninstall ' + a.name, 'aria-label': 'Uninstall ' + a.name, html: OS.icons.trash,
            onclick: async function () {
              if (a.sideloaded) { OS.launch('store', { tab: 'installed' }); return; }
              if (await OS.uninstallApp(a.id)) { OS.toast(a.name + ' was uninstalled'); render(); }
            } }) : h('span', { class: 'st-sys small muted' }, 'Built in');
          list.appendChild(h('div', { class: 'st-app' }, h('span', { class: 'ico app-ico', html: a.icon }), h('div', { class: 'st-app-txt' }, h('b', null, a.name), h('small', null, a.category)), pin, desk, rm));
        });
        m.appendChild(card('Installed apps', 'Choose what appears on the shelf and the desktop. Get more apps in the Store.', list,
          row(h('button', { class: 'btn tonal', type: 'button', onclick: function () { OS.launch('store'); } }, h('span', { html: OS.icons.bag }), 'Open Store'))));
      }

      /* ---------------- security ---------------- */
      function security(m) {
        if (!OS.crypto.available) { m.appendChild(card('Password protection unavailable', OS.crypto.unavailableReason)); return; }
        var on = OS.crypto.isEnabled();
        var status = h('div', { class: 'st-status ' + (on ? 'ok' : 'off') }, h('span', { html: OS.icons[on ? 'lock' : 'unlock'] }),
          h('div', null, h('b', null, on ? 'Your file is encrypted' : 'No password'),
            h('small', null, on ? 'AES-GCM with a key derived from your password (PBKDF2-SHA-256, ' + OS.crypto.ITERATIONS.toLocaleString() + ' iterations).' : 'Anyone who opens the file can read your data.')));
        var warn = h('div', { class: 'warnbox' }, h('span', { html: OS.icons.warning }),
          h('span', null, h('b', null, 'There is no way to recover a forgotten password. '), 'If you lose it, nobody can decrypt your data. Changes apply to the file the next time you save.'));
        var buttons = on
          ? row(h('button', { class: 'btn tonal', type: 'button', onclick: changePw }, 'Change password'),
              h('button', { class: 'btn tonal', type: 'button', onclick: function () { OS.shell.lockNow(); } }, h('span', { html: OS.icons.lock }), 'Lock now'),
              h('button', { class: 'btn text danger', type: 'button', onclick: removePw }, 'Remove password'))
          : row(h('button', { class: 'btn primary', type: 'button', onclick: setPw }, 'Set a password'));
        m.appendChild(card(null, null, status, warn, buttons));
      }
      async function askNew(title) {
        var a = h('input', { class: 'input', type: 'password', placeholder: 'New password', autocomplete: 'new-password' });
        var b = h('input', { class: 'input', type: 'password', placeholder: 'Repeat new password', autocomplete: 'new-password' });
        var v = await dlg.modal({ title: title, icon: 'shield', initialFocus: a,
          body: h('div', null, h('p', null, 'Choose a password you will remember. It cannot be recovered.'), a, h('div', { style: { height: '8px' } }), b),
          buttons: [{ label: 'Cancel', value: null }, { label: 'Set password', value: 'ok', primary: true }],
          onSubmit: function () { if (a.value.length < 4) return 'Use at least 4 characters.'; if (a.value !== b.value) return 'The passwords do not match.'; return true; } });
        return v === 'ok' ? a.value : null;
      }
      async function askCurrent(title) {
        var ok = false;
        var i = h('input', { class: 'input', type: 'password', placeholder: 'Current password', autocomplete: 'current-password' });
        await dlg.modal({ title: title, icon: 'lock', initialFocus: i, body: h('div', null, h('p', null, 'Enter your current password.'), i),
          buttons: [{ label: 'Cancel', value: null }, { label: 'Continue', value: 'ok', primary: true }],
          onSubmit: async function () { if (!(await OS.crypto.verify(i.value))) return 'Wrong password.'; ok = true; return true; } });
        return ok;
      }
      async function setPw() {
        var pw = await askNew('Set a password'); if (pw == null) return;
        await OS.crypto.setPassword(pw);
        await afterPasswordChange('Password set. Save now to encrypt the file.');
      }
      async function changePw() {
        if (!(await askCurrent('Change password'))) return;
        var pw = await askNew('New password'); if (pw == null) return;
        await OS.crypto.setPassword(pw);
        await afterPasswordChange('Password changed. Save now to apply it to the file.');
      }
      async function removePw() {
        if (!(await askCurrent('Remove password'))) return;
        if (!(await dlg.confirm('After the next save, the file will no longer be encrypted and anyone who opens it can read your data. Continue?', { title: 'Remove password', okLabel: 'Remove', danger: true }))) return;
        OS.crypto.removePassword();
        await afterPasswordChange('Password removed. Save to write an unencrypted file.');
      }
      async function afterPasswordChange(msg) {
        changed();
        // Replace any existing backup right away so no plaintext copy stays behind in browser storage.
        try { await OS.storage.backup.write(); } catch (e) { console.warn(e); }
        OS.shell.updateStatus();
        OS.toast(msg, 'ok', 4500);
        render();
      }

      /* ---------------- storage ---------------- */
      function storage(m) {
        var size = OS.storage.dataSize(), big = size > 50 * 1024 * 1024;
        var pct = Math.min(100, size / (200 * 1024 * 1024) * 100);
        m.appendChild(card(null, null,
          h('div', { class: 'st-big' + (big ? ' warn' : '') }, U.formatBytes(size), h('small', null, ' of data in this file')),
          h('div', { class: 'st-meter' }, h('span', { style: { width: Math.max(1, pct) + '%' } })),
          h('p', { class: 'st-desc' }, 'This is everything stored inside the HTML file: files, settings and app data' +
            (OS.crypto.isEnabled() ? '. Encryption adds about a third, because encrypted data is stored as base64.' : '.') +
            ' Imported pictures and other binary files are stored as base64, which makes them about 33% larger than the originals.'),
          big ? h('div', { class: 'warnbox' }, h('span', { html: OS.icons.warning }), h('span', null, h('b', null, 'Over 50 MB. '), 'The whole HTML file grows with your data. Large files are slow to open and save. Delete or export big files you do not need, and empty the Trash.')) : null,
          largest()));

        var fsa = OS.storage.hasFSA();
        m.appendChild(card('Saving', fsa
          ? 'This browser can overwrite the file directly. The first save in each session asks where to save: choose this same file.'
          : 'This browser cannot overwrite files, so each save downloads a new copy named nimbus.html. Replace your old file with it.',
          row(h('button', { class: 'btn primary', type: 'button', onclick: function () { OS.storage.save(); } }, h('span', { html: OS.icons.save }), 'Save now'),
            h('button', { class: 'btn tonal', type: 'button', onclick: function () { OS.storage.save({ download: true }); } }, h('span', { html: OS.icons.download }), 'Download a copy'))));

        var trashN = vfs.list(vfs.special('trash')).length;
        if (trashN) m.appendChild(card('Trash', trashN + ' item' + (trashN > 1 ? 's' : '') + ' (' + U.formatBytes(vfs.size(vfs.special('trash'))) + ') still take up space in the file.',
          row(h('button', { class: 'btn tonal', type: 'button', onclick: function () { OS.launch('explorer', { folderId: vfs.special('trash') }); } }, 'Open Trash'))));

        var importIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
        importIn.addEventListener('change', function () { var f = importIn.files[0]; importIn.value = ''; if (f) importJSON(f); });
        m.appendChild(card('Export & import', 'Export everything as a JSON file (useful as a backup or to move your data). Importing replaces ALL current data.',
          row(h('button', { class: 'btn tonal', type: 'button', onclick: exportJSON }, h('span', { html: OS.icons.download }), 'Export all data'),
            h('button', { class: 'btn tonal', type: 'button', onclick: function () { importIn.click(); } }, h('span', { html: OS.icons.upload }), 'Import…'), importIn)));

        m.appendChild(card('Crash-recovery backup', 'While you have unsaved changes, a backup is kept in this browser every 30 seconds. It never leaves this computer and is encrypted if you use a password. If the tab crashes, open the same file here again to restore it.',
          row(h('button', { class: 'btn text', type: 'button', onclick: async function () { await OS.storage.backup.remove(OS.state.fileId); OS.toast('Backup removed from this browser'); } }, 'Remove backup from this browser'))));

        m.appendChild(card('Reset everything', 'Delete all files, settings, apps and the password, and start over. Nothing changes in the file until you save.',
          row(h('button', { class: 'btn text danger', type: 'button', onclick: resetAll }, h('span', { html: OS.icons.trash }), 'Reset everything…'))));
      }
      function largest() {
        var files = vfs.largestFiles(8).filter(function (f) { return f.size > 0; });
        if (!files.length) return null;
        var t = h('table', { class: 'st-table' }, h('thead', null, h('tr', null, h('th', null, 'Largest files'), h('th', null, 'Size'))));
        var tb = h('tbody'); t.appendChild(tb);
        files.forEach(function (f) {
          tb.appendChild(h('tr', null, h('td', null, h('a', { href: '#', onclick: function (e) { e.preventDefault(); OS.launch('explorer', { folderId: f.parent, select: f.id }); } }, f.path)), h('td', null, U.formatBytes(f.size))));
        });
        return t;
      }
      async function exportJSON() {
        if (OS.crypto.isEnabled() && !(await dlg.confirm('The exported file is NOT encrypted. Anyone with it can read your data. Export anyway?', { title: 'Export', okLabel: 'Export' }))) return;
        U.downloadBlob(new Blob([JSON.stringify(OS.state, null, 1)], { type: 'application/json' }), 'nimbus-data.json');
      }
      async function importJSON(file) {
        var data;
        try {
          data = JSON.parse(await file.text());
          if (data && data.encrypted) throw new Error('This is an encrypted file. Import a JSON export made with "Export all data".');
          if (!data || !data.vfs || !data.vfs.nodes) throw new Error('This does not look like a Nimbus data export.');
          data = OS.storage.migrate(data);
        } catch (e) { dlg.alert('Import failed: ' + e.message, { title: 'Import', icon: 'warning' }); return; }
        if (!(await dlg.confirm('Replace ALL current files and settings with "' + file.name + '"? Your current data will be lost unless you saved a copy.', { title: 'Import data', okLabel: 'Replace everything', danger: true }))) return;
        var keepId = OS.state.fileId;
        if (!(await OS.wm.closeAll(false))) return;
        data.fileId = keepId; data.setupDone = true;
        OS.state = data;
        OS.markDirty(); OS.shell.showDesktop();
        OS.toast('Data imported. Save to write it into the file.', 'ok', 4500);
      }
      async function resetAll() {
        var v = await dlg.prompt('This deletes ALL files, settings, apps and the password. Type RESET to confirm.', { title: 'Reset everything', okLabel: 'Reset', placeholder: 'RESET',
          validate: function (x) { return x === 'RESET' ? '' : 'Type RESET in capital letters.'; } });
        if (v !== 'RESET') return;
        var oldId = OS.state.fileId;
        await OS.wm.closeAll(true);
        await OS.storage.backup.remove(oldId);
        OS.crypto.removePassword();
        OS.storage.forgetHandle();
        var d = OS.storage.defaultData(); d.setupDone = true;
        OS.state = d;
        OS.markDirty(); OS.shell.showDesktop();
        OS.toast('Everything was reset. Save to write the fresh desktop into the file.', 'ok', 5000);
      }

      /* ---------------- about ---------------- */
      function about(m) {
        var st = OS.state;
        m.appendChild(card(null, null, h('div', { class: 'st-about' }, h('div', { class: 'st-logo', html: OS.shell.LOGO }),
          h('div', null, h('h3', null, OS.storage.APP_NAME), h('p', { class: 'st-desc' }, 'A portable desktop that lives in a single HTML file.')))));
        function tr(a, b) { return h('tr', null, h('td', null, a), h('td', null, b)); }
        m.appendChild(card('This file', null, h('table', { class: 'st-table' }, h('tbody', null,
          tr('Data format', 'version ' + st.version),
          tr('File ID', h('span', { class: 'mono small' }, st.fileId)),
          tr('Last saved', st.savedAt ? new Date(st.savedAt).toLocaleString() : 'never'),
          tr('Saving', OS.storage.hasFSA() ? 'Overwrites the file directly' : 'Downloads a new copy'),
          tr('Encryption', OS.crypto.available ? (OS.crypto.isEnabled() ? 'On' : 'Available, off') : 'Not available in this browser'),
          tr('Apps', OS.installedApps().length + ' installed')))));
        m.appendChild(card('Tips', null, h('ul', { class: 'st-tips' },
          h('li', null, 'Ctrl+K opens the launcher. Type to search apps and files.'),
          h('li', null, 'Drag a window to the left or right edge to snap it, or to the top to maximize.'),
          h('li', null, 'Right-click the desktop, files and shelf icons for more options.'),
          h('li', null, 'For a full-screen "real OS" feel, use Full screen in quick settings.'),
          h('li', null, 'On your own computer you can open Nimbus as a borderless app window: start Chrome or Edge with  ', h('code', { class: 'mono' }, '--app=' + location.href.split('#')[0]), '  (put this in a desktop shortcut).'))));
        m.appendChild(card('Credits', 'Interface font: Figtree, by Erik Kennedy, under the SIL Open Font License 1.1. Icons, wallpapers and sounds were made for ' + OS.storage.APP_NAME + '.'));
      }

      win._onRelaunch = function (a) { if (a.section) go(a.section === 'appearance' ? 'personalize' : a.section); };
      var offs = [OS.events.on('size', function () { if (current === 'storage') render(); }), OS.events.on('apps-changed', function () { if (current === 'apps') render(); })];
      win.onDestroy(function () { offs.forEach(function (f) { f(); }); });
      render();
    }
  });
})();
