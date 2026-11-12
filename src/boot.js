/* =====================================================================
   BOOT: load data -> (unlock) -> (first-run setup) -> desktop -> backup check
   Runs after all apps have registered.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  function fatal(title, msg, actions) {
    var card = h('div', { class: 'setup-card' }, h('div', { class: 'setup-icon', html: OS.icons.warning }), h('h1', null, title), h('p', { class: 'setup-text' }, msg), actions || null);
    document.getElementById('os-root').appendChild(h('div', { class: 'screen setup' }, card));
  }

  async function checkBackup(password) {
    var st = OS.state, rec;
    try { rec = await OS.storage.backup.read(st.fileId); } catch (e) { return; }
    if (!rec || !(rec.backupAt > (st.savedAt || 0))) return;

    var restored = null, env = rec.envelope, pwForEnv = null;
    if (rec.data) restored = rec.data;
    else if (env) {
      restored = await OS.crypto.tryActiveKey(env);
      if (!restored && password) {
        try { restored = await OS.crypto.unlock(env, password, { dontActivate: true }); pwForEnv = password; } catch (e) { restored = null; }
      }
      while (!restored && OS.crypto.available) {
        var pw = await OS.dialogs.prompt('A crash-recovery backup from ' + new Date(rec.backupAt).toLocaleString() +
          ' was found, but it is encrypted with a different password. Enter that password to restore it, or cancel to ignore it.',
          { title: 'Recovery backup', type: 'password', okLabel: 'Decrypt' });
        if (pw == null) return;
        try { restored = await OS.crypto.unlock(env, pw, { dontActivate: true }); pwForEnv = pw; }
        catch (e) { OS.toast('Wrong password', 'error'); }
      }
    }
    if (!restored) return;

    var choice = await OS.dialogs.choose(
      'This browser has a crash-recovery backup from ' + new Date(rec.backupAt).toLocaleString() +
      ', which is newer than the data saved in this file' + (st.savedAt ? ' (' + new Date(st.savedAt).toLocaleString() + ')' : '') + '.\n' +
      'Restore it? If you ignore it, it will be overwritten the next time you make changes.',
      [{ label: 'Ignore', value: 'ignore' }, { label: 'Restore backup', value: 'restore', primary: true }],
      { title: 'Restore unsaved changes?' });
    if (choice !== 'restore') return;
    try {
      var data = OS.storage.migrate(restored);
      data.fileId = st.fileId;
      if (pwForEnv) await OS.crypto.unlock(env, pwForEnv);  // backup used a password: keep protecting the data with it
      await OS.wm.closeAll(true);
      OS.state = data;
      OS.apps.forEach(function (a, id) { if (a.sideloaded) OS.apps.delete(id); });
      loadSideloaded();
      OS.shell.showDesktop();
      OS.markDirty();
      OS.toast('Backup restored. Save to keep it in the file.', 'ok', 5000);
    } catch (e) {
      OS.dialogs.alert('The backup could not be restored: ' + e.message, { title: 'Recovery backup' });
    }
  }

  /** Run apps the user installed from a file (Store > Install from file). Errors never stop the boot. */
  function loadSideloaded() {
    (OS.state.sideloaded || []).forEach(function (pkg) {
      if (OS.apps.has(pkg.id)) return;
      try {
        var before = new Set(OS.apps.keys());
        var el = document.createElement('script');
        el.textContent = '(function(){try{' + pkg.code + '\n}catch(e){console.error("Sideloaded app failed:",e);}})();';
        document.body.appendChild(el); el.remove();     // the saved file is built from the pristine snapshot, so this never persists in the HTML
        OS.apps.forEach(function (a, id) { if (!before.has(id)) { a.sideloaded = true; a.optional = false; } });
      } catch (e) { console.error(e); }
    });
  }
  OS.loadSideloaded = loadSideloaded;

  async function boot() {
    OS.theme.applyDefault();
    OS.shell.mount();
    OS.shell.hideDesktop();
    var splash = OS.shell.splash();

    var raw;
    try { raw = OS.storage.readEmbedded(); }
    catch (e) {
      console.error(e);
      splash.done();
      fatal('This file is damaged', 'The data inside this file could not be read (' + e.message + '). Nothing has been changed. Open a backup copy of the file instead.',
        h('button', { class: 'btn tonal', type: 'button', onclick: function () { location.reload(); } }, 'Reload'));
      return;
    }

    var data, password = null;
    try {
      if (raw && raw.encrypted) {
        splash.done();
        var res = await OS.shell.lockScreen(raw);
        password = res.password;
        data = OS.storage.migrate(res.data);
        data.fileId = raw.fileId || data.fileId;
      } else if (raw) {
        data = OS.storage.migrate(raw);
      } else {
        data = OS.storage.defaultData();
      }
    } catch (e) {
      console.error(e);
      splash.done();
      fatal('Cannot open this file', e.message);
      return;
    }

    OS.state = data;
    loadSideloaded();
    await OS.theme.apply();
    OS.shell.showDesktop();
    splash.done();
    if (!data.setupDone) {
      await OS.setup.run();
      OS.notify('Welcome to ' + OS.storage.APP_NAME, 'Open the guide to learn the basics.', { icon: 'sparkle', sound: false,
        action: { label: 'Open guide', run: function () { var id = OS.vfs.resolvePath('/Documents/Welcome.md'); if (id) OS.launch('notepad', { fileId: id, preview: true }); } } });
    } else if (!password) {
      OS.sound.play('startup');   // may stay silent until the first click: browsers block audio before a gesture
    }
    OS.storage.backup.start();
    await checkBackup(password);
    password = null;
  }

  OS.boot = boot;
  if (!window.__OS_NO_AUTOBOOT__) boot().catch(function (e) { console.error(e); fatal('Startup failed', e.message); });
})();
