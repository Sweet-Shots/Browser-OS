/* =====================================================================
   CORE 3: OS CORE (state, dirty tracking, app registry, launching)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util;

  OS.events = new U.Emitter();
  OS.state = null;          // decrypted, live data object (null while locked)
  OS.dirty = false;         // unsaved changes compared to the file on disk
  OS.changeCounter = 0;     // bumps on every markDirty(); used by the backup timer
  OS.apps = new Map();

  /** Mark data as changed (unsaved). Called by the VFS and by apps. */
  OS.markDirty = function () {
    if (!OS.state) return;
    OS.dirty = true;
    OS.changeCounter++;
    OS.events.emit('dirty', true);
  };
  OS.clearDirty = function () { OS.dirty = false; OS.events.emit('dirty', false); };

  /**
   * Register an app. See the example at the end of the script.
   * def: { id, name, icon (svg string), fileTypes?, defaultSize?, singleInstance?, hidden?, launch(win, args),
   *        optional? (installable from the Store), category?, description?, priority? (wins file associations) }
   */
  OS.registerApp = function (def) {
    if (!def || !def.id || typeof def.launch !== 'function') throw new Error('registerApp: id and launch() are required');
    if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(def.id)) throw new Error('registerApp: invalid id "' + def.id + '"');
    if (OS.apps.has(def.id)) throw new Error('registerApp: an app with id "' + def.id + '" already exists');
    OS.apps.set(def.id, Object.assign({
      name: def.id, icon: OS.appIcons.generic, fileTypes: [], defaultSize: { w: 640, h: 440 }, singleInstance: false,
      optional: false, category: 'Utilities', description: '', priority: 0
    }, def));
    OS.events.emit('apps-changed');
  };

  /** Core apps are always installed; optional ones only if listed in data.installed. */
  OS.isInstalled = function (appId) {
    var a = OS.apps.get(appId);
    if (!a) return false;
    if (a.sideloaded) return true;
    return !a.optional || !!(OS.state && OS.state.installed.indexOf(appId) >= 0);
  };
  /** Installed, visible apps in display order. */
  OS.installedApps = function () {
    var out = [];
    OS.apps.forEach(function (a) { if (!a.hidden && OS.isInstalled(a.id)) out.push(a); });
    return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  };
  OS.installApp = function (appId) {
    var a = OS.apps.get(appId);
    if (!a || !a.optional || OS.isInstalled(appId)) return;
    OS.state.installed.push(appId);
    OS.markDirty();
    OS.events.emit('apps-changed');
  };
  OS.uninstallApp = async function (appId) {
    var a = OS.apps.get(appId);
    if (!a || !a.optional) return false;
    var wins = OS.wm.findByApp(appId);
    for (var i = 0; i < wins.length; i++) if (!(await wins[i].close())) return false;
    OS.state.installed = OS.state.installed.filter(function (x) { return x !== appId; });
    var st = OS.state.settings;
    st.shelf = st.shelf.filter(function (x) { return x !== appId; });
    st.desktopApps = st.desktopApps.filter(function (x) { return x !== appId; });
    OS.markDirty();
    OS.events.emit('apps-changed');
    return true;
  };

  /** Per-app persistent state stored in the saved data (data.apps[appId]). */
  OS.getAppState = function (appId, defaults) {
    if (!OS.state) return defaults || {};
    var s = OS.state.apps[appId];
    if (!s) { s = OS.state.apps[appId] = JSON.parse(JSON.stringify(defaults || {})); }
    return s;
  };
  OS.setAppState = function (appId, value) {
    if (!OS.state) return;
    OS.state.apps[appId] = JSON.parse(JSON.stringify(value));
    OS.markDirty();
  };

  /** Launch an app (or focus the existing window of a single-instance app). */
  OS.launch = function (appId, args) {
    var app = OS.apps.get(appId);
    if (!app || !OS.state) return null;
    if (!OS.isInstalled(appId)) {
      OS.toast(app.name + ' is not installed. Get it from the Store.');
      return null;
    }
    args = args || {};
    if (app.singleInstance) {
      var existing = OS.wm.findByApp(appId)[0];
      if (existing) { existing.focus(); if (existing._onRelaunch) existing._onRelaunch(args); return existing; }
    }
    var win = OS.wm.create(app);
    // after the app has rendered, give the window keyboard focus unless the app focused something itself
    setTimeout(function () { if (!win.closed && !win.el.contains(document.activeElement)) win.body.focus({ preventScroll: true }); }, 50);
    try { app.launch(win, args); }
    catch (err) {
      console.error(err);
      win.close(true);
      OS.dialogs.alert('The app "' + app.name + '" failed to start: ' + err.message, { title: 'App error' });
      return null;
    }
    return win;
  };

  /** All installed apps that can open a file, best match first (extension beats MIME type, then priority). */
  OS.appsForFile = function (name, mime) {
    var ext = U.extOf(name), list = [];
    OS.apps.forEach(function (app) {
      if (!OS.isInstalled(app.id)) return;
      var score = 0;
      if (ext && app.fileTypes.indexOf(ext) >= 0) score = 2;
      else if (mime && (app.mimeTypes || []).some(function (m) { return mime.indexOf(m) === 0; })) score = 1;
      if (score) list.push({ app: app, score: score * 100 + (app.priority || 0) });
    });
    return list.sort(function (a, b) { return b.score - a.score; }).map(function (x) { return x.app; });
  };
  OS.appForFile = function (name, mime) { return OS.appsForFile(name, mime)[0] || null; };
  /** Open a file with a specific app. */
  OS.openWith = function (appId, fileId) { return OS.launch(appId, { fileId: fileId }); };

  /** Open a VFS file in the right app. */
  OS.openFile = function (fileId) {
    var vfs = OS.vfs;
    var node = vfs.stat(fileId);
    if (!node) return null;
    if (node.type === 'folder') return OS.launch('explorer', { folderId: fileId });
    var app = OS.appForFile(node.name, node.mime);
    if (app) return OS.launch(app.id, { fileId: fileId });
    OS.dialogs.choose('No app can open "' + node.name + '". Do you want to export it to your computer instead?',
      [{ label: 'Cancel', value: null }, { label: 'Export', value: 'export', primary: true }], { title: 'Open file' })
      .then(function (v) { if (v === 'export') OS.exportFile(fileId); });
    return null;
  };

  /**
   * Notifications: a toast now, and an entry in the quick settings panel.
   * opts: { icon (glyph name), sound (name or false), action: { label, run } }
   */
  OS.notifications = [];
  OS.notify = function (title, body, opts) {
    opts = opts || {};
    var n = { id: U.uid(4), title: title, body: body || '', icon: opts.icon || 'bell', at: Date.now(), action: opts.action || null, app: opts.app || null };
    OS.notifications.unshift(n);
    if (OS.notifications.length > 50) OS.notifications.pop();
    if (opts.sound !== false) OS.sound.play(opts.sound || 'notify');
    OS.toast(n, opts.type);
    OS.events.emit('notifications');
    return n;
  };

  /** Download a VFS file to the host computer with its original name and type. */
  OS.exportFile = function (fileId) {
    var node = OS.vfs.stat(fileId);
    if (!node || node.type !== 'file') return;
    var bytes = OS.vfs.readBytes(fileId);
    U.downloadBlob(new Blob([bytes], { type: node.mime || 'application/octet-stream' }), node.name);
  };

  /** Import File objects from the host into a VFS folder. Returns created ids. */
  OS.importHostFiles = async function (files, folderId) {
    var ids = [], errors = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var buf = new Uint8Array(await f.arrayBuffer());
        var name = OS.vfs.uniqueName(folderId, f.name || 'file');
        var mime = f.type || OS.vfs.guessMime(name);
        var text = null;
        // Store as text only if it is valid UTF-8 and looks textual; otherwise base64. Both round-trip byte-exactly.
        if (OS.vfs.isTextLike(name, mime) && buf.length < 20 * 1024 * 1024) {
          try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf); } catch (e) { text = null; }
        }
        var id = text !== null
          ? OS.vfs.createFile(folderId, name, text, { mime: mime })
          : OS.vfs.createFile(folderId, name, U.bytesToB64(buf), { encoding: 'base64', mime: mime });
        ids.push(id);
      } catch (err) { errors.push((f.name || 'file') + ': ' + err.message); }
    }
    if (ids.length) OS.notify('Imported ' + ids.length + ' file' + (ids.length > 1 ? 's' : ''), 'Saved to ' + OS.vfs.pathOf(folderId), { icon: 'upload', action: { label: 'Show', run: function () { OS.launch('explorer', { folderId: folderId, select: ids[ids.length - 1] }); } } });
    if (errors.length) OS.dialogs.alert('Some files could not be imported:\n' + errors.join('\n'), { title: 'Import' });
    return ids;
  };
})();
