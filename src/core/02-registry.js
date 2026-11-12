/* =====================================================================
   CORE 2: OS CORE (state, dirty tracking, app registry, launching)
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
   * def: { id, name, icon (svg string), fileTypes?, defaultSize?, singleInstance?, hidden?, launch(win, args) }
   */
  OS.registerApp = function (def) {
    if (!def || !def.id || typeof def.launch !== 'function') throw new Error('registerApp: id and launch() are required');
    if (OS.apps.has(def.id)) throw new Error('registerApp: duplicate app id "' + def.id + '"');
    OS.apps.set(def.id, Object.assign({
      name: def.id, icon: OS.appIcons.generic, fileTypes: [], defaultSize: { w: 640, h: 440 }, singleInstance: false
    }, def));
    OS.events.emit('apps-changed');
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
    args = args || {};
    if (app.singleInstance) {
      var existing = OS.wm.findByApp(appId)[0];
      if (existing) { existing.focus(); if (existing._onRelaunch) existing._onRelaunch(args); return existing; }
    }
    var win = OS.wm.create(app);
    try { app.launch(win, args); }
    catch (err) {
      console.error(err);
      win.close(true);
      OS.dialogs.alert('The app "' + app.name + '" failed to start: ' + err.message, { title: 'App error' });
      return null;
    }
    return win;
  };

  /** Find the app that opens a file, by extension (then by MIME type). */
  OS.appForFile = function (name, mime) {
    var ext = U.extOf(name);
    var found = null;
    OS.apps.forEach(function (app) { if (!found && ext && app.fileTypes.indexOf(ext) >= 0) found = app; });
    if (!found && mime) {
      OS.apps.forEach(function (app) {
        if (!found && (app.mimeTypes || []).some(function (m) { return mime.indexOf(m) === 0; })) found = app;
      });
    }
    return found;
  };

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
    if (ids.length) OS.toast('Imported ' + ids.length + ' file' + (ids.length > 1 ? 's' : '') + ' to ' + OS.vfs.pathOf(folderId), 'ok');
    if (errors.length) OS.dialogs.alert('Some files could not be imported:\n' + errors.join('\n'), { title: 'Import' });
    return ids;
  };
})();
