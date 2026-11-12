/* =====================================================================
   APP: SETTINGS (appearance, password, storage, save/export, reset)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  OS.registerApp({
    id: 'settings',
    name: 'Settings',
    icon: OS.appIcons.settings,
    defaultSize: { w: 760, h: 540 },
    singleInstance: true,
    launch: function (win, args) {
      var dlg = win.dialogs, vfs = win.vfs;
      var sections = [
        { id: 'appearance', label: 'Appearance', icon: 'palette', render: appearance },
        { id: 'security', label: 'Password', icon: 'shield', render: security },
        { id: 'storage', label: 'Storage & saving', icon: 'database', render: storage },
        { id: 'about', label: 'About', icon: 'info', render: about }
      ];
      var current = args.section || 'appearance';
      var nav = h('nav', { class: 'st-nav' });
      var main = h('div', { class: 'st-main' });
      win.body.classList.add('app-settings');
      win.body.append(nav, main);

      function S() { return OS.state.settings; }
      function changed() { OS.markDirty(); }
      function card(title, desc) {
        var c = h('section', { class: 'st-card' }, h('h3', null, title), desc ? h('p', { class: 'muted' }, desc) : null);
        for (var i = 2; i < arguments.length; i++) if (arguments[i]) c.appendChild(arguments[i]);
        return c;
      }
      function row() { var r = h('div', { class: 'st-row' }); for (var i = 0; i < arguments.length; i++) if (arguments[i]) r.appendChild(arguments[i]); return r; }
      function go(id) { current = id; render(); }

      function render() {
        if (win.closed || !OS.state) return;
        nav.textContent = '';
        sections.forEach(function (s) {
          nav.appendChild(h('button', { class: 'st-tab' + (s.id === current ? ' active' : ''), type: 'button', onclick: function () { go(s.id); } },
            h('span', { html: OS.icons[s.icon] }), h('span', null, s.label)));
        });
        main.textContent = '';
        var sec = sections.find(function (s) { return s.id === current; }) || sections[0];
        main.appendChild(h('h2', null, sec.label));
        sec.render(main);
      }

      /* ---------------- appearance ---------------- */
      function appearance(m) {
        var themes = row();
        [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].forEach(function (t) {
          themes.appendChild(h('button', { class: 'btn' + (S().theme === t[0] ? ' primary' : ''), type: 'button',
            onclick: function () { S().theme = t[0]; OS.shell.applyTheme(); changed(); render(); } }, h('span', { html: OS.icons[t[2]] }), t[1]));
        });
        m.appendChild(card('Theme', null, themes));

        var wp = S().wallpaper;
        var grid = h('div', { class: 'st-wps' });
        Object.keys(OS.shell.GRADIENTS).forEach(function (k) {
          grid.appendChild(h('button', { class: 'st-wp' + (wp.type === 'gradient' && wp.value === k ? ' active' : ''), type: 'button', title: k,
            style: { background: OS.shell.GRADIENTS[k] }, onclick: function () { setWp({ type: 'gradient', value: k }); } }, h('span', null, k)));
        });
        var colorIn = h('input', { type: 'color', value: wp.type === 'color' ? wp.value : '#3b4a6b', 'aria-label': 'Wallpaper color' });
        colorIn.addEventListener('input', function () { setWp({ type: 'color', value: colorIn.value }, true); });
        colorIn.addEventListener('change', function () { render(); });
        var imgBtn = h('button', { class: 'btn', type: 'button' }, h('span', { html: OS.icons.image }), 'Choose picture…');
        imgBtn.addEventListener('click', async function () {
          var id = await dlg.openFile({ title: 'Choose wallpaper', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'], start: vfs.resolvePath('/Pictures') || vfs.root() });
          if (id) setWp({ type: 'image', value: id });
        });
        var imgInfo = wp.type === 'image' && vfs.exists(wp.value) ? h('span', { class: 'muted small' }, 'Current: ' + vfs.pathOf(wp.value)) : null;
        m.appendChild(card('Wallpaper', 'Pick a gradient, a solid color, or a picture from your files (import pictures in Files first).',
          grid, row(h('label', { class: 'st-color' }, colorIn, 'Solid color'), imgBtn, imgInfo)));

        var c24 = h('input', { type: 'checkbox', checked: !!S().clock24 });
        c24.addEventListener('change', function () { S().clock24 = c24.checked; OS.shell.tickClock(); changed(); });
        m.appendChild(card('Clock', null, h('label', { class: 'st-check' }, c24, 'Use 24-hour time')));
      }
      function setWp(v, noRender) { S().wallpaper = v; OS.shell.applyWallpaper(); changed(); if (!noRender) render(); }

      /* ---------------- security ---------------- */
      function security(m) {
        if (!OS.crypto.available) { m.appendChild(card('Password protection unavailable', OS.crypto.unavailableReason)); return; }
        var on = OS.crypto.isEnabled();
        var status = h('div', { class: 'st-status ' + (on ? 'ok' : 'off') }, h('span', { html: OS.icons[on ? 'lock' : 'unlock'] }),
          on ? 'Password is set. The saved file is encrypted (AES-GCM, PBKDF2-SHA-256, ' + OS.crypto.ITERATIONS.toLocaleString() + ' iterations).'
            : 'No password. Anyone who opens the file can read your data.');
        var warn = h('div', { class: 'st-warn' }, h('span', { html: OS.icons.warning }),
          h('div', null, h('b', null, 'There is no way to recover a forgotten password. '), 'If you lose it, nobody can decrypt your data. The change takes effect in the file the next time you save.'));
        var buttons = on
          ? row(h('button', { class: 'btn', type: 'button', onclick: changePw }, 'Change password'),
              h('button', { class: 'btn danger', type: 'button', onclick: removePw }, 'Remove password'),
              h('button', { class: 'btn', type: 'button', onclick: function () { OS.shell.lockNow(); } }, h('span', { html: OS.icons.lock }), 'Lock now'))
          : row(h('button', { class: 'btn primary', type: 'button', onclick: setPw }, 'Set a password'));
        m.appendChild(card('Password', null, status, warn, buttons));
      }
      async function askNew(title) {
        var a = h('input', { class: 'input', type: 'password', placeholder: 'New password', autocomplete: 'new-password' });
        var b = h('input', { class: 'input', type: 'password', placeholder: 'Repeat new password', autocomplete: 'new-password' });
        var v = await dlg.modal({ title: title, initialFocus: a,
          body: h('div', null, h('p', null, 'Choose a password you will remember. It cannot be recovered.'), a, h('div', { style: { height: '8px' } }), b),
          buttons: [{ label: 'Cancel', value: null }, { label: 'Set password', value: 'ok', primary: true }],
          onSubmit: function () { if (a.value.length < 4) return 'Use at least 4 characters.'; if (a.value !== b.value) return 'The passwords do not match.'; return true; } });
        return v === 'ok' ? a.value : null;
      }
      async function askCurrent(title) {
        var ok = false;
        await dlg.modal({ title: title, body: (function () {
          var i = h('input', { class: 'input', type: 'password', placeholder: 'Current password', autocomplete: 'current-password', id: 'st-cur-pw' });
          setTimeout(function () { i.focus(); }, 0);
          return h('div', null, h('p', null, 'Enter your current password.'), i);
        })(),
          buttons: [{ label: 'Cancel', value: null }, { label: 'Continue', value: 'ok', primary: true }],
          onSubmit: async function () {
            var el = document.getElementById('st-cur-pw');
            if (!(await OS.crypto.verify(el.value))) return 'Wrong password.';
            ok = true; return true;
          } });
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
        OS.toast(msg, 'ok', 4500);
        render();
      }

      /* ---------------- storage ---------------- */
      function storage(m) {
        var size = OS.storage.dataSize();
        var big = size > 50 * 1024 * 1024;
        m.appendChild(card('Data size', null,
          h('div', { class: 'st-big' + (big ? ' warn' : '') }, U.formatBytes(size)),
          h('p', { class: 'muted' }, 'This is the size of all your files, settings and app data as stored inside the HTML file' +
            (OS.crypto.isEnabled() ? '. Encryption adds about another third, because the encrypted data is stored as base64.' : '.') +
            ' Imported binary files (pictures, PDFs...) are stored as base64, which makes them about 33% larger than the originals.'),
          big ? h('div', { class: 'st-warn' }, h('span', { html: OS.icons.warning }), h('div', null, h('b', null, 'Over 50 MB. '), 'The whole HTML file grows with your data. Large files are slow to open and save, and some browsers struggle above a few hundred MB. Delete or export big files you do not need.')) : null,
          largest()));

        var fsa = OS.storage.hasFSA();
        m.appendChild(card('Saving', fsa
          ? 'Your browser can overwrite this file directly. The first save in each session asks where to save: choose this same file.'
          : 'Your browser cannot overwrite files, so each save downloads a new copy named myos.html. Replace your old file with it.',
          row(h('button', { class: 'btn primary', type: 'button', onclick: function () { OS.storage.save(); } }, h('span', { html: OS.icons.save }), 'Save now'),
            h('button', { class: 'btn', type: 'button', onclick: function () { OS.storage.save({ download: true }); } }, h('span', { html: OS.icons.download }), 'Download a copy'))));

        var importIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
        importIn.addEventListener('change', function () { var f = importIn.files[0]; importIn.value = ''; if (f) importJSON(f); });
        m.appendChild(card('Export & import', 'Export everything as a JSON file (useful as a backup or to move your data). Importing replaces ALL current data.',
          row(h('button', { class: 'btn', type: 'button', onclick: exportJSON }, h('span', { html: OS.icons.download }), 'Export all data (JSON)'),
            h('button', { class: 'btn', type: 'button', onclick: function () { importIn.click(); } }, h('span', { html: OS.icons.upload }), 'Import JSON…'), importIn)));

        m.appendChild(card('Reset everything', 'Delete all files, settings, the password and app data, and start over with a fresh desktop. This cannot be undone once you save.',
          row(h('button', { class: 'btn danger', type: 'button', onclick: resetAll }, h('span', { html: OS.icons.trash }), 'Reset everything…'))));
      }
      function largest() {
        var files = vfs.largestFiles(8).filter(function (f) { return f.size > 0; });
        if (!files.length) return null;
        var t = h('table', { class: 'st-table' }, h('thead', null, h('tr', null, h('th', null, 'Largest files'), h('th', null, 'Size'))));
        var tb = h('tbody'); t.appendChild(tb);
        files.forEach(function (f) {
          tb.appendChild(h('tr', null, h('td', null, h('a', { href: '#', onclick: function (e) { e.preventDefault(); OS.launch('explorer', { folderId: f.parent }); } }, f.path)), h('td', null, U.formatBytes(f.size))));
        });
        return t;
      }
      async function exportJSON() {
        if (OS.crypto.isEnabled() && !(await dlg.confirm('The exported JSON is NOT encrypted. Anyone with the file can read your data. Export anyway?', { title: 'Export', okLabel: 'Export' }))) return;
        U.downloadBlob(new Blob([JSON.stringify(OS.state, null, 1)], { type: 'application/json' }), 'myos-data.json');
      }
      async function importJSON(file) {
        var data;
        try {
          data = JSON.parse(await file.text());
          if (data && data.encrypted) throw new Error('This is an encrypted file. Import a JSON export made with "Export all data".');
          if (!data || !data.vfs || !data.vfs.nodes) throw new Error('This does not look like a MyOS data export.');
          data = OS.storage.migrate(data);
        } catch (e) { dlg.alert('Import failed: ' + e.message, { title: 'Import' }); return; }
        if (!(await dlg.confirm('Replace ALL current files and settings with "' + file.name + '"? Your current data will be lost unless you saved a copy.', { title: 'Import data', okLabel: 'Replace everything', danger: true }))) return;
        var keepId = OS.state.fileId;
        if (!(await OS.wm.closeAll(false))) return;
        data.fileId = keepId; data.setupDone = true;
        OS.state = data;
        OS.markDirty(); OS.shell.showDesktop();
        OS.toast('Data imported. Save to write it into the file.', 'ok', 4500);
      }
      async function resetAll() {
        var v = await dlg.prompt('This deletes ALL files, settings and the password. Type RESET to confirm.', { title: 'Reset everything', okLabel: 'Reset', placeholder: 'RESET',
          validate: function (s) { return s === 'RESET' ? '' : 'Type RESET in capital letters.'; } });
        if (v !== 'RESET') return;
        var oldId = OS.state.fileId;
        await OS.wm.closeAll(true);
        await OS.storage.backup.remove(oldId);
        OS.crypto.removePassword();
        OS.storage.forgetHandle();
        var d = OS.storage.defaultData(); d.setupDone = true;
        OS.state = d;
        OS.markDirty(); OS.shell.showDesktop();
        OS.toast('Everything was reset. Save to write the empty desktop into the file.', 'ok', 5000);
      }

      /* ---------------- about ---------------- */
      function about(m) {
        var st = OS.state;
        m.appendChild(card('MyOS', 'A portable desktop that lives in a single HTML file.',
          h('table', { class: 'st-table' }, h('tbody', null,
            h('tr', null, h('td', null, 'Data format version'), h('td', null, String(st.version))),
            h('tr', null, h('td', null, 'File ID'), h('td', { class: 'mono small' }, st.fileId)),
            h('tr', null, h('td', null, 'Last saved'), h('td', null, st.savedAt ? new Date(st.savedAt).toLocaleString() : 'never')),
            h('tr', null, h('td', null, 'Direct file saving'), h('td', null, OS.storage.hasFSA() ? 'available (File System Access API)' : 'not available: downloads a copy')),
            h('tr', null, h('td', null, 'Encryption'), h('td', null, OS.crypto.available ? 'available' : 'unavailable')),
            h('tr', null, h('td', null, 'Apps installed'), h('td', null, String(OS.apps.size)))))));
        m.appendChild(card('Crash-recovery backup', 'While you have unsaved changes, a backup is kept in this browser every 30 seconds. It stays only on this computer, and it is encrypted if you use a password. If the tab crashes, reopen the same file here to restore it.',
          row(h('button', { class: 'btn', type: 'button', onclick: async function () {
            await OS.storage.backup.remove(st.fileId); OS.toast('Backup removed from this browser');
          } }, 'Remove backup from this browser'))));
      }

      win._onRelaunch = function (a) { if (a.section) go(a.section); };
      var offs = [OS.events.on('size', function () { if (current === 'storage') render(); })];
      win.onDestroy(function () { offs.forEach(function (f) { f(); }); });
      render();
    }
  });
})();
