/* =====================================================================
   CORE 4: STORAGE
   - data model + defaults + migrations
   - reading the embedded <script id="os-data"> tag
   - safe JSON escaping
   - building the saved HTML from the pristine snapshot
   - save paths: File System Access API (Chromium) / download fallback
   - crash-recovery backup in browser storage (never primary storage)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util;

  var SCHEMA_VERSION = 3;
  var APP_NAME = 'Nimbus';

  function now() { return Date.now(); }

  /** Optional apps installed on a fresh system (the setup wizard can change this). */
  var DEFAULT_INSTALLED = ['browser', 'photos', 'music', 'clock', 'solitaire', 'comet', 'sudoku', 'todo', 'calculator', 'paint', 'terminal'];
  var DEFAULT_SHELF = ['explorer', 'browser', 'notepad', 'photos', 'store', 'settings'];
  var DEFAULT_DESKTOP_APPS = ['explorer', 'browser', 'store'];

  function welcomeText() {
    return '# Welcome to Nimbus\n\nEverything you see lives inside **one HTML file**: the system, the apps, and all your files.\n\n' +
      '## Saving\n' +
      '- Press **Ctrl+S** (or **Cmd+S**), or click the status area in the corner and choose *Save*.\n' +
      '- In Chrome or Edge, pick this same file when asked; later saves overwrite it in one keystroke.\n' +
      '- In Firefox or Safari, a fresh copy is downloaded. Replace the old file with it.\n\n' +
      '## Getting around\n' +
      '- Click the circle in the bottom-left corner (or press **Ctrl+K**) to search apps and files.\n' +
      '- Right-click almost anything for more options.\n' +
      '- Drag a window to the left or right edge to snap it, or to the top to maximize it.\n' +
      '- Drag files from your computer onto the desktop or into Files to import them.\n' +
      '- Get more apps and games in the **Store**.\n\n' +
      'Try the *Terminal* and type `help`.\n';
  }

  function defaultTree() {
    var t = now();
    var nodes = {};
    function folder(id, name, parent, extra) { nodes[id] = Object.assign({ id: id, name: name, type: 'folder', parent: parent, created: t, modified: t, children: [] }, extra || {}); if (parent) nodes[parent].children.push(id); }
    function file(id, name, parent, content, mime) { nodes[id] = { id: id, name: name, type: 'file', parent: parent, created: t, modified: t, encoding: 'text', mime: mime, content: content }; nodes[parent].children.push(id); }
    folder('root', '', null);
    folder('f-desk', 'Desktop', 'root');
    folder('f-docs', 'Documents', 'root');
    folder('f-pics', 'Pictures', 'root');
    folder('f-music', 'Music', 'root');
    folder('f-trash', 'Trash', 'root', { hidden: true });
    file('f-welcome', 'Welcome.md', 'f-docs', welcomeText(), 'text/markdown');
    return { root: 'root', nodes: nodes, special: { desktop: 'f-desk', documents: 'f-docs', pictures: 'f-pics', music: 'f-music', trash: 'f-trash' } };
  }

  function defaultSettings() {
    return {
      theme: 'auto',
      wallpaper: { type: 'preset', value: 'peaks' },
      accent: 'auto',
      iconStyle: 'colorful',
      userName: '',
      clock24: false,
      sound: { enabled: true, volume: 0.6, ui: true },
      shelf: DEFAULT_SHELF.slice(),
      desktopApps: DEFAULT_DESKTOP_APPS.slice(),
      browser: { searchEngine: 'wikipedia' },
      fallbackNoticeDismissed: false
    };
  }

  function defaultData() {
    return {
      version: SCHEMA_VERSION,
      fileId: U.uid(16),
      savedAt: 0,
      setupDone: false,
      settings: defaultSettings(),
      installed: DEFAULT_INSTALLED.slice(),
      sideloaded: [],
      vfs: defaultTree(),
      apps: { todo: { items: [
        { id: U.uid(6), text: 'Save Nimbus with Ctrl+S', done: false },
        { id: U.uid(6), text: 'Drag a photo onto the desktop', done: false },
        { id: U.uid(6), text: 'Find a game in the Store', done: false }
      ] } },
      windows: {}
    };
  }

  /** Make sure the well-known folders exist (used by the v2 -> v3 migration and for repairs). */
  function ensureSpecialFolders(d) {
    var nodes = d.vfs.nodes, root = nodes[d.vfs.root], t = now();
    d.vfs.special = d.vfs.special || {};
    [['desktop', 'Desktop'], ['documents', 'Documents'], ['pictures', 'Pictures'], ['music', 'Music'], ['trash', 'Trash']].forEach(function (p) {
      var key = p[0], name = p[1], id = d.vfs.special[key];
      if (id && nodes[id] && nodes[id].type === 'folder') return;
      // reuse an existing root folder with that name if there is one
      id = root.children.find(function (c) { return nodes[c] && nodes[c].type === 'folder' && nodes[c].name.toLowerCase() === name.toLowerCase(); });
      if (!id) {
        id = 'f-' + key + '-' + U.uid(4);
        nodes[id] = { id: id, name: name, type: 'folder', parent: root.id, created: t, modified: t, children: [] };
        root.children.push(id);
      }
      if (key === 'trash') nodes[id].hidden = true;
      d.vfs.special[key] = id;
    });
  }

  /**
   * Migrations: migrations[n] upgrades a version-n object to version n+1.
   * Add a new entry (and bump SCHEMA_VERSION) whenever the data shape changes.
   */
  var OLD_GRADIENTS = { aurora: 'bloom', ocean: 'tide', sunset: 'dunes', forest: 'meadow', dusk: 'dusk', mono: 'peaks' };
  var migrations = {
    // v1 had no clock setting and stored window geometry under "geometry".
    1: function (d) {
      d.settings = d.settings || {};
      if (d.settings.clock24 == null) d.settings.clock24 = false;
      if (d.geometry && !d.windows) { d.windows = d.geometry; }
      delete d.geometry;
    },
    // v2 -> v3 (Nimbus): new folders and trash, installable apps, shelf, sounds, new wallpapers.
    2: function (d) {
      var s = d.settings = d.settings || {};
      if (s.wallpaper && s.wallpaper.type === 'gradient') s.wallpaper = { type: 'preset', value: OLD_GRADIENTS[s.wallpaper.value] || 'peaks' };
      if (!d.installed) d.installed = DEFAULT_INSTALLED.slice();
      if (!d.sideloaded) d.sideloaded = [];
      if (d.vfs && d.vfs.nodes) ensureSpecialFolders(d);
    }
  };

  function migrate(d) {
    if (!d || typeof d !== 'object') throw new Error('Data is not an object');
    if (!d.version) d.version = 1;
    if (d.version > SCHEMA_VERSION) throw new Error('This file was saved by a newer version of Nimbus (data v' + d.version + ').');
    while (d.version < SCHEMA_VERSION) {
      var m = migrations[d.version];
      if (!m) throw new Error('No migration from data v' + d.version);
      m(d);
      d.version++;
    }
    // Fill anything missing (also repairs partially broken files).
    var def = defaultData();
    if (!d.fileId) d.fileId = def.fileId;
    d.settings = Object.assign({}, def.settings, d.settings || {});
    d.settings.sound = Object.assign({}, def.settings.sound, d.settings.sound || {});
    d.settings.browser = Object.assign({}, def.settings.browser, d.settings.browser || {});
    if (!d.vfs || !d.vfs.nodes || !d.vfs.nodes[d.vfs.root]) d.vfs = def.vfs;
    ensureSpecialFolders(d);
    if (!Array.isArray(d.installed)) d.installed = def.installed;
    if (!Array.isArray(d.sideloaded)) d.sideloaded = [];
    d.apps = d.apps || {};
    d.windows = d.windows || {};
    if (d.setupDone == null) d.setupDone = true;
    d.savedAt = d.savedAt || 0;
    return d;
  }

  /** Read the JSON embedded in this file. Returns null for a fresh template. */
  function readEmbedded() {
    var el = document.getElementById('os-data');
    var txt = el ? el.textContent.trim() : '';
    if (!txt || txt === 'null') return null;
    return JSON.parse(txt);
  }

  /**
   * Make JSON safe to place inside <script type="application/json">.
   * "<" becomes \u003c, which neutralizes a closing script tag and HTML comment openers.
   * U+2028/U+2029 are escaped as well. The result is still valid JSON.
   */
  function escapeJSON(json) {
    return json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }

  /** Strip anything not part of the original template (e.g. extension-injected nodes). */
  function sanitizeClone(root) {
    ['head', 'body'].forEach(function (tag) {
      var part = root.querySelector(tag);
      if (!part) return;
      Array.from(part.children).forEach(function (c) { if (!c.hasAttribute('data-keep')) c.remove(); });
      Array.from(part.attributes).forEach(function (a) { part.removeAttribute(a.name); });
    });
    Array.from(root.attributes).forEach(function (a) { if (a.name !== 'lang') root.removeAttribute(a.name); });
    var r = root.querySelector('#os-root');
    if (r) r.textContent = '';
  }

  /** Build the complete HTML document for a payload (plain data or encrypted envelope). */
  function buildHTML(payload) {
    var json = escapeJSON(JSON.stringify(payload));
    var out = '<!DOCTYPE html>\n';
    __OS_PRISTINE__.forEach(function (n) {
      if (n.nodeType === 10) return;                                  // doctype: written above
      if (n.nodeType === 8) { out += '<!' + '--' + n.data + '--' + '>\n'; return; } // README comment
      if (n.nodeType === 1) {
        var c = n.cloneNode(true);
        sanitizeClone(c);
        var tag = c.querySelector('#os-data');
        if (!tag) throw new Error('Template is missing the os-data tag');
        tag.textContent = json;
        out += c.outerHTML + '\n';
      }
    });
    return out;
  }

  /** Serialized size of the live data in bytes (what goes into the tag, before encryption). */
  function dataSize() {
    if (!OS.state) return 0;
    return new Blob([JSON.stringify(OS.state)]).size;
  }

  /* ------------------------- saving ------------------------- */
  var fileHandle = null;      // File System Access handle, memory only, per session
  var saving = false;

  async function makePayload() {
    return OS.crypto.isEnabled() ? await OS.crypto.encryptState(OS.state) : OS.state;
  }

  /**
   * Save the OS to disk.
   * opts.download: force the download path (used by "Download a copy").
   * Returns true on success, false on cancel/failure.
   */
  async function save(opts) {
    opts = opts || {};
    if (!OS.state || saving) return false;
    saving = true;
    OS.events.emit('saving', true);
    try {
      // Give the focused app a chance to commit its buffer (e.g. Notepad), so Ctrl+S "saves everything".
      if (!opts.download && OS.wm && OS.wm.focused && OS.wm.focused.onSaveShortcut) {
        try { await OS.wm.focused.onSaveShortcut(); } catch (e) { console.warn(e); }
      }
      var counterAtSave = OS.changeCounter;
      var prevSavedAt = OS.state.savedAt;
      OS.state.savedAt = now();
      var html = buildHTML(await makePayload());
      var blob = new Blob([html], { type: 'text/html' });

      var canFSA = !opts.download && typeof window.showSaveFilePicker === 'function'; // detect at save time
      if (canFSA) {
        try {
          if (!fileHandle) {
            fileHandle = await window.showSaveFilePicker({
              suggestedName: 'nimbus.html',
              types: [{ description: 'Nimbus file', accept: { 'text/html': ['.html', '.htm'] } }]
            });
          }
          var w = await fileHandle.createWritable();
          await w.write(blob);
          await w.close();
          finish(counterAtSave);
          OS.toast('Saved ' + fileHandle.name + ' (' + U.formatBytes(blob.size) + ')', 'ok');
          return true;
        } catch (err) {
          if (err && err.name === 'AbortError') {        // the user pressed Cancel: do nothing
            OS.state.savedAt = prevSavedAt;
            OS.toast('Save cancelled');
            return false;
          }
          console.warn('File System Access save failed, falling back to download:', err);
          fileHandle = null;
          OS.notice('<b>Could not write the file directly</b> (' + U.escapeHtml((err && (err.name + ': ' + err.message)) || 'unknown error') +
            '). Your browser may block this feature. A copy is being downloaded instead.', { key: 'fsa-fail' });
        }
      }
      U.downloadBlob(blob, 'nimbus.html');
      finish(counterAtSave);
      OS.toast('Downloaded nimbus.html (' + U.formatBytes(blob.size) + ')', 'ok');
      if (!opts.download && !OS.state.settings.fallbackNoticeDismissed) showFallbackNotice();
      return true;
    } catch (err) {
      console.error(err);
      OS.dialogs.alert('Saving failed: ' + err.message, { title: 'Save error' });
      return false;
    } finally {
      saving = false;
      OS.events.emit('saving', false);
    }
  }
  function finish(counterAtSave) {
    // Only clear dirty if nothing changed while we were writing.
    if (OS.changeCounter === counterAtSave) OS.clearDirty();
    backup.lastCounter = OS.changeCounter;
    OS.events.emit('saved');
  }

  var fallbackShown = false;
  function showFallbackNotice() {
    if (fallbackShown) return;
    fallbackShown = true;
    OS.notice('<b>Your browser saved a new copy.</b> This browser cannot overwrite the open file, so it downloaded <i>nimbus.html</i>. ' +
      'Replace your old file with the downloaded one (for example, copy it back to your USB stick). Your old file was not changed.',
      { dontShowAgain: function () { if (OS.state) OS.state.settings.fallbackNoticeDismissed = true; } });
  }

  function hasFSA() { return typeof window.showSaveFilePicker === 'function'; }
  function forgetHandle() { fileHandle = null; }

  /* --------------------- crash-recovery backup --------------------- */
  var LS_PREFIX = 'nimbus-backup:';
  var backup = {
    lastCounter: 0,
    timer: null,

    start: function () {
      if (this.timer) return;
      var self = this;
      this.timer = setInterval(function () { self.tick(); }, 30000);
    },
    tick: async function () {
      if (!OS.state || !OS.dirty || OS.changeCounter === this.lastCounter) return;
      var c = OS.changeCounter;
      try { await this.write(); this.lastCounter = c; } catch (e) { console.warn('Backup failed:', e); }
    },
    /** Write a backup now. Encrypted when a password is set; never plaintext then. */
    write: async function () {
      if (!OS.state) return;
      var rec = { fileId: OS.state.fileId, backupAt: now() };
      if (OS.crypto.isEnabled()) rec.envelope = await OS.crypto.encryptState(OS.state);
      else rec.data = OS.state;
      var str = JSON.stringify(rec);
      var key = LS_PREFIX + OS.state.fileId;
      var ok = false;
      try { localStorage.setItem(key, str); ok = true; } catch (e) { /* quota or disabled */ }
      if (ok) { await idb.del(key).catch(function () {}); return; }
      await idb.set(key, str);  // larger quota
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
    read: async function (fileId) {
      var key = LS_PREFIX + fileId, recs = [];
      try { var s = localStorage.getItem(key); if (s) recs.push(JSON.parse(s)); } catch (e) { /* ignore */ }
      try { var s2 = await idb.get(key); if (s2) recs.push(JSON.parse(s2)); } catch (e) { /* ignore */ }
      recs = recs.filter(function (r) { return r && r.fileId === fileId; });
      recs.sort(function (a, b) { return b.backupAt - a.backupAt; });
      return recs[0] || null;
    },
    remove: async function (fileId) {
      var key = LS_PREFIX + fileId;
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
      await idb.del(key).catch(function () {});
    }
  };

  /* minimal IndexedDB key/value wrapper (only used if localStorage is full or blocked) */
  var idb = (function () {
    var dbp = null;
    function db() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
        var r;
        try { r = indexedDB.open('nimbus-backup', 1); } catch (e) { return rej(e); }
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return dbp;
    }
    function op(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var tx = d.transaction('kv', mode), st = tx.objectStore('kv'), req = fn(st);
          tx.oncomplete = function () { res(req && req.result); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    }
    return {
      get: function (k) { return op('readonly', function (s) { return s.get(k); }); },
      set: function (k, v) { return op('readwrite', function (s) { return s.put(v, k); }); },
      del: function (k) { return op('readwrite', function (s) { return s.delete(k); }); }
    };
  })();

  OS.storage = {
    SCHEMA_VERSION: SCHEMA_VERSION, APP_NAME: APP_NAME, defaultData: defaultData, defaultSettings: defaultSettings, DEFAULT_INSTALLED: DEFAULT_INSTALLED, migrate: migrate, readEmbedded: readEmbedded,
    escapeJSON: escapeJSON, buildHTML: buildHTML, dataSize: dataSize, save: save, hasFSA: hasFSA,
    forgetHandle: forgetHandle, backup: backup, makePayload: makePayload
  };
})();
