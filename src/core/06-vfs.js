/* =====================================================================
   CORE 6: VIRTUAL FILE SYSTEM
   The ONLY code allowed to touch OS.state.vfs. Apps and the terminal
   use this API. Nodes:
     folder: { id, name, type:'folder', parent, created, modified, children:[ids] }
     file:   { id, name, type:'file', parent, created, modified,
               encoding:'text'|'base64', mime, content }
   Optional: hidden (not listed), trashed: { from, name, at } (in Trash).
   Well-known folders live in vfs.special (desktop, documents, pictures,
   music, trash); they cannot be renamed, moved or deleted.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util;
  var events = new U.Emitter();

  function T() { if (!OS.state) throw new Error('File system is locked'); return OS.state.vfs; }
  function N(id) { var n = T().nodes[id]; if (!n) throw new Error('No such file or folder'); return n; }
  function changed(kind, id) { OS.markDirty(); events.emit('change', { kind: kind, id: id }); }
  function touch(n) { n.modified = Date.now(); }

  var MIME = {
    txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv', log: 'text/plain',
    html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', xml: 'application/xml', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    pdf: 'application/pdf', zip: 'application/zip', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm'
  };
  var TEXT_EXT = ['txt', 'md', 'json', 'csv', 'log', 'html', 'htm', 'css', 'js', 'xml', 'svg', 'ini', 'yml', 'yaml', 'py', 'sh'];

  function guessMime(name) { return MIME[U.extOf(name)] || 'application/octet-stream'; }
  function isTextLike(name, mime) {
    return TEXT_EXT.indexOf(U.extOf(name)) >= 0 || /^text\//.test(mime || '') || /json|xml|javascript/.test(mime || '');
  }

  /** Validate a file/folder name. Returns an error string, or '' if valid. */
  function nameError(name) {
    if (typeof name !== 'string' || !name.trim()) return 'Name cannot be empty.';
    if (name !== name.trim()) return 'Name cannot start or end with spaces.';
    if (name.indexOf('/') >= 0) return 'Name cannot contain "/".';
    if (name === '.' || name === '..') return 'That name is reserved.';
    if (/[\u0000-\u001f]/.test(name)) return 'Name contains invalid characters.';
    if (name.length > 255) return 'Name is too long.';
    return '';
  }
  function findChild(parentId, name, exceptId) {
    var p = N(parentId), lower = name.toLowerCase();
    if (p.type !== 'folder') return null;
    for (var i = 0; i < p.children.length; i++) {
      var c = T().nodes[p.children[i]];
      if (c && c.id !== exceptId && c.name.toLowerCase() === lower) return c.id;
    }
    return null;
  }
  function checkName(parentId, name, exceptId) {
    var e = nameError(name);
    if (e) throw new Error(e);
    if (findChild(parentId, name, exceptId)) throw new Error('"' + name + '" already exists in this folder.');
  }
  function requireFolder(id) { var n = N(id); if (n.type !== 'folder') throw new Error('"' + n.name + '" is not a folder'); return n; }
  function newId() { var id; do { id = U.uid(8); } while (T().nodes[id]); return id; }

  function sizeOf(n) {
    if (n.type === 'file') return n.encoding === 'base64' ? n.content.length : U.utf8Len(n.content);
    return n.children.reduce(function (s, c) { var cn = T().nodes[c]; return s + (cn ? sizeOf(cn) : 0); }, 0);
  }
  function meta(n) {
    return {
      id: n.id, name: n.name, type: n.type, parent: n.parent, created: n.created, modified: n.modified,
      mime: n.mime || null, encoding: n.encoding || null, size: sizeOf(n),
      childCount: n.type === 'folder' ? n.children.length : 0,
      hidden: !!n.hidden, trashed: n.trashed ? Object.assign({}, n.trashed) : null, system: isSpecial(n.id)
    };
  }
  function isSpecial(id) {
    var sp = T().special || {};
    for (var k in sp) if (sp[k] === id) return true;
    return id === T().root;
  }
  function protect(id, what) { if (isSpecial(id)) throw new Error('"' + (T().nodes[id].name || 'Home') + '" is a system folder and cannot be ' + what + '.'); }
  function isAncestor(ancestorId, id) {
    var n = T().nodes[id];
    while (n) { if (n.id === ancestorId) return true; n = n.parent ? T().nodes[n.parent] : null; }
    return false;
  }

  var vfs = {
    events: events,
    on: function (ev, fn) { return events.on(ev, fn); },
    root: function () { return T().root; },
    guessMime: guessMime, isTextLike: isTextLike, nameError: nameError,

    exists: function (id) { return !!(OS.state && T().nodes[id]); },
    stat: function (id) { var n = OS.state && T().nodes[id]; return n ? meta(n) : null; },
    isFolder: function (id) { var n = OS.state && T().nodes[id]; return !!n && n.type === 'folder'; },

    /** List a folder: folders first, then files, alphabetically. */
    list: function (folderId, opts) {
      var f = requireFolder(folderId), showHidden = opts && opts.hidden;
      return f.children.map(function (c) { return T().nodes[c]; }).filter(function (n) { return n && (showHidden || !n.hidden); }).map(meta).sort(function (a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
    },
    findChild: function (parentId, name) { return findChild(parentId, name); },

    /** Raw content: { content, encoding, mime } */
    read: function (id) {
      var n = N(id); if (n.type !== 'file') throw new Error('"' + n.name + '" is a folder');
      return { content: n.content, encoding: n.encoding, mime: n.mime };
    },
    readText: function (id) {
      var r = vfs.read(id);
      return r.encoding === 'base64' ? new TextDecoder().decode(U.b64ToBytes(r.content)) : r.content;
    },
    readBytes: function (id) {
      var r = vfs.read(id);
      return r.encoding === 'base64' ? U.b64ToBytes(r.content) : new TextEncoder().encode(r.content);
    },
    readDataURL: function (id) {
      var r = vfs.read(id);
      var b64 = r.encoding === 'base64' ? r.content : U.bytesToB64(new TextEncoder().encode(r.content));
      return 'data:' + (r.mime || 'application/octet-stream') + ';base64,' + b64;
    },

    /** Create a file. opts: { encoding:'text'|'base64', mime } */
    createFile: function (parentId, name, content, opts) {
      opts = opts || {};
      requireFolder(parentId); checkName(parentId, name);
      var id = newId(), t = Date.now();
      T().nodes[id] = { id: id, name: name, type: 'file', parent: parentId, created: t, modified: t,
        encoding: opts.encoding === 'base64' ? 'base64' : 'text', mime: opts.mime || guessMime(name), content: content == null ? '' : String(content) };
      var p = N(parentId); p.children.push(id); touch(p);
      changed('create', id);
      return id;
    },
    /** Replace a file's content. */
    write: function (id, content, opts) {
      opts = opts || {};
      var n = N(id); if (n.type !== 'file') throw new Error('"' + n.name + '" is a folder');
      n.content = content == null ? '' : String(content);
      if (opts.encoding) n.encoding = opts.encoding === 'base64' ? 'base64' : 'text';
      if (opts.mime) n.mime = opts.mime;
      touch(n);
      changed('write', id);
    },
    /** Create or overwrite a file by name inside a folder. Returns id. */
    writeAt: function (parentId, name, content, opts) {
      var existing = findChild(parentId, name);
      if (existing) {
        if (T().nodes[existing].type === 'folder') throw new Error('"' + name + '" is a folder');
        vfs.write(existing, content, opts); return existing;
      }
      return vfs.createFile(parentId, name, content, opts);
    },
    mkdir: function (parentId, name) {
      requireFolder(parentId); checkName(parentId, name);
      var id = newId(), t = Date.now();
      T().nodes[id] = { id: id, name: name, type: 'folder', parent: parentId, created: t, modified: t, children: [] };
      var p = N(parentId); p.children.push(id); touch(p);
      changed('create', id);
      return id;
    },
    rename: function (id, newName) {
      var n = N(id);
      protect(id, 'renamed');
      if (newName === n.name) return;
      checkName(n.parent, newName, id);
      n.name = newName; touch(n);
      if (n.type === 'file' && (!n.mime || n.mime === 'application/octet-stream')) n.mime = guessMime(newName);
      changed('rename', id);
    },
    move: function (id, newParentId) {
      var n = N(id);
      protect(id, 'moved');
      requireFolder(newParentId);
      if (n.parent === newParentId) return;
      if (n.type === 'folder' && isAncestor(id, newParentId)) throw new Error('A folder cannot be moved into itself or one of its subfolders.');
      checkName(newParentId, n.name, id);
      var old = N(n.parent);
      old.children = old.children.filter(function (c) { return c !== id; }); touch(old);
      var np = N(newParentId); np.children.push(id); touch(np);
      n.parent = newParentId;
      if (n.trashed && !vfs.inTrash(id)) delete n.trashed;   // dragged back out of the Trash
      changed('move', id);
    },
    /** Delete a file or folder (recursively). */
    delete: function (id) {
      var n = N(id);
      protect(id, 'deleted');
      (function rm(x) {
        var node = T().nodes[x]; if (!node) return;
        if (node.type === 'folder') node.children.slice().forEach(rm);
        delete T().nodes[x];
      })(id);
      var p = T().nodes[n.parent];
      if (p) { p.children = p.children.filter(function (c) { return c !== id; }); touch(p); }
      changed('delete', id);
    },
    /** Update modified time (terminal "touch"). */
    touch: function (id) { touch(N(id)); changed('write', id); },

    /** Id of a well-known folder: 'desktop' | 'documents' | 'pictures' | 'music' | 'trash'. */
    special: function (key) { var sp = T().special || {}; return sp[key] && T().nodes[sp[key]] ? sp[key] : T().root; },
    isSystem: function (id) { return isSpecial(id); },
    /** Is this node inside the Trash? */
    inTrash: function (id) { var tr = (T().special || {}).trash; return !!tr && id !== tr && isAncestor(tr, id); },

    /** Copy a file or folder (deep) into a folder. Returns the new id. */
    copy: function (id, destParentId, newName) {
      var src = N(id);
      requireFolder(destParentId);
      if (src.type === 'folder' && isAncestor(id, destParentId)) throw new Error('A folder cannot be copied into itself.');
      var name = newName || vfs.uniqueName(destParentId, src.name, ' copy');
      checkName(destParentId, name);
      function clone(node, parentId, nm) {
        var nid = newId(), t = Date.now();
        var c = { id: nid, name: nm, type: node.type, parent: parentId, created: t, modified: t };
        if (node.type === 'file') { c.encoding = node.encoding; c.mime = node.mime; c.content = node.content; }
        else c.children = [];
        T().nodes[nid] = c;
        if (node.type === 'folder') node.children.forEach(function (cid) { var ch = T().nodes[cid]; if (ch) c.children.push(clone(ch, nid, ch.name)); });
        return nid;
      }
      var nid = clone(src, destParentId, name);
      var p = N(destParentId); p.children.push(nid); touch(p);
      changed('create', nid);
      return nid;
    },

    /** Move to the Trash (remembers where it came from). */
    trash: function (id) {
      var n = N(id), tr = vfs.special('trash');
      protect(id, 'deleted');
      if (vfs.inTrash(id)) { vfs.delete(id); return; }
      var from = n.parent, oldName = n.name, name = vfs.uniqueName(tr, n.name);
      var old = N(from); old.children = old.children.filter(function (c) { return c !== id; }); touch(old);
      n.name = name; n.parent = tr; n.trashed = { from: from, name: oldName, at: Date.now() };
      N(tr).children.push(id);
      changed('trash', id);
    },
    /** Put a trashed item back where it was (or Home if that folder is gone). */
    restore: function (id) {
      var n = N(id), info = n.trashed || {};
      var dest = info.from && T().nodes[info.from] && T().nodes[info.from].type === 'folder' && !vfs.inTrash(info.from) ? info.from : T().root;
      var name = vfs.uniqueName(dest, info.name || n.name);
      var tr = N(n.parent); tr.children = tr.children.filter(function (c) { return c !== id; });
      n.parent = dest; n.name = name; delete n.trashed; touch(n);
      N(dest).children.push(id);
      changed('restore', id);
      return dest;
    },
    emptyTrash: function () {
      var tr = vfs.special('trash');
      N(tr).children.slice().forEach(function (c) { vfs.delete(c); });
    },
    /** Find files and folders by name (not inside the Trash). */
    search: function (query, limit) {
      var q = String(query || '').trim().toLowerCase(), out = [];
      if (!q) return out;
      var nodes = T().nodes;
      for (var k in nodes) {
        var n = nodes[k];
        if (!n.parent || n.hidden || vfs.inTrash(n.id)) continue;
        if (n.name.toLowerCase().indexOf(q) >= 0) out.push(meta(n));
      }
      out.sort(function (a, b) {
        var as = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1, bs = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
        return as - bs || b.modified - a.modified;
      });
      return out.slice(0, limit || 50).map(function (m) { m.path = vfs.pathOf(m.id); return m; });
    },
    /** Most recently modified files (not in the Trash). */
    recent: function (limit) {
      var nodes = T().nodes, out = [];
      for (var k in nodes) { var n = nodes[k]; if (n.type === 'file' && !n.hidden && !vfs.inTrash(n.id)) out.push(meta(n)); }
      return out.sort(function (a, b) { return b.modified - a.modified; }).slice(0, limit || 10).map(function (m) { m.path = vfs.pathOf(m.id); return m; });
    },
    /** All files whose name ends with one of the extensions (for Photos / Music). */
    findByExt: function (exts) {
      var nodes = T().nodes, out = [];
      for (var k in nodes) {
        var n = nodes[k];
        if (n.type === 'file' && exts.indexOf(U.extOf(n.name)) >= 0 && !vfs.inTrash(n.id)) out.push(meta(n));
      }
      return out.sort(function (a, b) { return b.modified - a.modified; });
    },

    /** "/Documents/a.txt" for an id. */
    pathOf: function (id) {
      var parts = [], n = T().nodes[id];
      while (n && n.parent) { parts.unshift(n.name); n = T().nodes[n.parent]; }
      return '/' + parts.join('/');
    },
    /** Resolve an absolute or relative path ('.', '..' supported). Returns id or null. */
    resolvePath: function (path, cwdId) {
      if (path == null) return null;
      path = String(path);
      if (path === '~') path = '/';
      var cur = path[0] === '/' ? T().root : (cwdId || T().root);
      var parts = path.split('/').filter(function (p) { return p && p !== '.'; });
      for (var i = 0; i < parts.length; i++) {
        var node = T().nodes[cur];
        if (!node) return null;
        if (parts[i] === '..') { cur = node.parent || cur; continue; }
        if (node.type !== 'folder') return null;
        var next = findChild(cur, parts[i]);
        if (!next) return null;
        cur = next;
      }
      return cur;
    },
    /** Split a path into { parentId, name } for creating things. parentId null if parent missing. */
    resolveParent: function (path, cwdId) {
      var clean = String(path).replace(/\/+$/, '');
      var i = clean.lastIndexOf('/');
      var parentPath = i < 0 ? '.' : (i === 0 ? '/' : clean.slice(0, i));
      var name = i < 0 ? clean : clean.slice(i + 1);
      var parentId = vfs.resolvePath(parentPath, cwdId);
      return { parentId: parentId && vfs.isFolder(parentId) ? parentId : null, name: name };
    },
    /** "photo.png" -> "photo (2).png" if needed. */
    uniqueName: function (parentId, name, suffix) {
      name = (name || 'file').replace(/\//g, '_').trim() || 'file';
      if (!findChild(parentId, name)) return name;
      var dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
      if (suffix && !findChild(parentId, base + suffix + ext)) return base + suffix + ext;
      for (var k = 2; ; k++) { var c = base + (suffix || '') + ' (' + k + ')' + ext; if (!findChild(parentId, c)) return c; }
    },
    size: function (id) { return sizeOf(N(id)); },
    isAncestor: function (ancestorId, id) { return isAncestor(ancestorId, id); },
    /** All files, largest first (for the storage report). */
    largestFiles: function (limit) {
      var all = Object.keys(T().nodes).map(function (k) { return T().nodes[k]; }).filter(function (n) { return n.type === 'file'; });

      return all.map(meta).sort(function (a, b) { return b.size - a.size; }).slice(0, limit || 10)
        .map(function (m) { m.path = vfs.pathOf(m.id); return m; });
    },
    /** Icon name for a node */
    iconFor: function (m) {
      if (m.type === 'folder') return m.id === (T().special || {}).trash ? 'trashFull' : 'folder';
      var ext = U.extOf(m.name);
      if (/^image\//.test(m.mime || '')) return 'fileImage';
      if (/^audio\//.test(m.mime || '') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'].indexOf(ext) >= 0) return 'fileAudio';
      if (['html', 'htm', 'js', 'css', 'json', 'xml', 'py', 'sh'].indexOf(ext) >= 0) return 'fileCode';
      if (isTextLike(m.name, m.mime)) return 'fileText';
      return 'file';
    }
  };
  OS.vfs = vfs;
})();
