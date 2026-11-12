/* =====================================================================
   APP: TERMINAL (all commands go through the VFS API)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  /** Split a command line into words, honoring quotes and backslash escapes. ">" and ">>" are separate tokens. */
  function parse(line) {
    var out = [], cur = '', q = null, has = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === q) q = null;
        else if (c === '\\' && q === '"' && i + 1 < line.length) cur += line[++i];
        else cur += c;
        continue;
      }
      if (c === '"' || c === "'") { q = c; has = true; continue; }
      if (c === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
      if (/\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false; } continue; }
      if (c === '>') {
        if (has) { out.push(cur); cur = ''; has = false; }
        if (line[i + 1] === '>') { out.push({ op: '>>' }); i++; } else out.push({ op: '>' });
        continue;
      }
      cur += c; has = true;
    }
    if (q) throw new Error('Missing closing quote');
    if (has) out.push(cur);
    return out;
  }

  OS.registerApp({
    id: 'terminal',
    name: 'Terminal',
    icon: OS.appIcons.terminal,
    optional: true,
    category: 'Utilities',
    description: 'A command line for your files: ls, cd, cat, cp, mv, rm, find, tree and more.',
    keywords: 'shell command line console',
    defaultSize: { w: 720, h: 440 },
    launch: function (win, args) {
      var vfs = win.vfs;
      var cwd = vfs.root(), history = [], hIdx = 0, draft = '';
      var out = h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite' });
      var promptEl = h('span', { class: 'term-prompt' });
      var input = h('input', { class: 'term-in', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Command' });
      var line = h('div', { class: 'term-line' }, promptEl, input);
      var scroller = h('div', { class: 'term' }, out, line);
      win.body.classList.add('app-terminal');
      win.body.append(scroller);
      scroller.addEventListener('pointerup', function () { if (!getSelection().toString()) input.focus(); });

      function cwdPath() { if (!vfs.exists(cwd)) cwd = vfs.root(); return vfs.pathOf(cwd); }
      function user() { return ((OS.state.settings.userName || 'you').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'you'); }
      function updatePrompt() { promptEl.textContent = user() + '@nimbus:' + cwdPath() + '$ '; }
      function print(text, cls) { out.appendChild(h('div', { class: 'term-row' + (cls ? ' ' + cls : '') }, text)); }
      function err(text) { print(text, 'err'); }
      function need(path, what) {
        var id = vfs.resolvePath(path, cwd);
        if (!id) throw new Error(what + ': ' + path + ': No such file or folder');
        return id;
      }

      var commands = {
        help: { usage: 'help', desc: 'show this help', run: function () {
          Object.keys(commands).forEach(function (k) { print(commands[k].usage.padEnd(24) + commands[k].desc); });
          print('Paths: absolute (/Documents/a.txt) or relative (../a.txt). Use quotes for names with spaces. Up/Down: history. Tab: complete.', 'muted');
        } },
        ls: { usage: 'ls [-l] [path]', desc: 'list a folder', run: function (a) {
          var long = a[0] === '-l' || a[0] === '-la' || a[0] === '-al'; if (long) a = a.slice(1);
          var id = a.length ? need(a[0], 'ls') : cwd;
          var st = vfs.stat(id);
          var items = st.type === 'folder' ? vfs.list(id) : [st];
          if (!items.length) return;
          if (long) items.forEach(function (m) {
            print((m.type === 'folder' ? 'd ' : '- ') + U.formatBytes(m.size).padStart(9) + '  ' + new Date(m.modified).toLocaleString().padEnd(22) + '  ' + m.name + (m.type === 'folder' ? '/' : ''));
          });
          else print(items.map(function (m) { return m.name + (m.type === 'folder' ? '/' : ''); }).join('    '));
        } },
        cd: { usage: 'cd [path]', desc: 'change folder (cd .. goes up)', run: function (a) {
          var id = a.length ? need(a[0], 'cd') : vfs.root();
          if (!vfs.isFolder(id)) throw new Error('cd: ' + a[0] + ': Not a folder');
          cwd = id;
        } },
        pwd: { usage: 'pwd', desc: 'print current folder', run: function () { print(cwdPath()); } },
        cat: { usage: 'cat <file>...', desc: 'print file contents', run: function (a) {
          if (!a.length) throw new Error('cat: missing file');
          a.forEach(function (p) {
            var id = need(p, 'cat');
            if (vfs.isFolder(id)) throw new Error('cat: ' + p + ': Is a folder');
            var m = vfs.stat(id);
            if (m.encoding === 'base64' && !vfs.isTextLike(m.name, m.mime)) { print('[binary file, ' + U.formatBytes(m.size) + ', ' + m.mime + ']', 'muted'); return; }
            print(vfs.readText(id));
          });
        } },
        mkdir: { usage: 'mkdir [-p] <folder>...', desc: 'create folders', run: function (a) {
          var p = a[0] === '-p'; if (p) a = a.slice(1);
          if (!a.length) throw new Error('mkdir: missing folder name');
          a.forEach(function (path) {
            if (p) {
              var cur = path[0] === '/' ? vfs.root() : cwd;
              path.split('/').filter(Boolean).forEach(function (part) {
                if (part === '.') return;
                if (part === '..') { cur = vfs.stat(cur).parent || cur; return; }
                var ex = vfs.findChild(cur, part);
                if (ex) { if (!vfs.isFolder(ex)) throw new Error('mkdir: ' + part + ': exists and is not a folder'); cur = ex; }
                else cur = vfs.mkdir(cur, part);
              });
              return;
            }
            var r = vfs.resolveParent(path, cwd);
            if (!r.parentId) throw new Error('mkdir: ' + path + ': parent folder does not exist');
            vfs.mkdir(r.parentId, r.name);
          });
        } },
        touch: { usage: 'touch <file>...', desc: 'create empty file / update time', run: function (a) {
          if (!a.length) throw new Error('touch: missing file name');
          a.forEach(function (path) {
            var id = vfs.resolvePath(path, cwd);
            if (id) { vfs.touch(id); return; }
            var r = vfs.resolveParent(path, cwd);
            if (!r.parentId) throw new Error('touch: ' + path + ': parent folder does not exist');
            vfs.createFile(r.parentId, r.name, '');
          });
        } },
        rm: { usage: 'rm [-r] <path>...', desc: 'delete files (-r for folders)', run: function (a) {
          var rec = false;
          a = a.filter(function (x) { if (/^-[rRf]+$/.test(x)) { if (/[rR]/.test(x)) rec = true; return false; } return true; });
          if (!a.length) throw new Error('rm: missing operand');
          a.forEach(function (p) {
            var id = need(p, 'rm');
            if (id === vfs.root()) throw new Error('rm: refusing to remove the root folder');
            if (vfs.isFolder(id) && !rec) throw new Error('rm: ' + p + ': is a folder (use rm -r)');
            if (vfs.isAncestor(id, cwd)) cwd = vfs.stat(id).parent;
            vfs.delete(id);
          });
        } },
        mv: { usage: 'mv <src> <dest>', desc: 'move or rename', run: function (a) {
          if (a.length !== 2) throw new Error('mv: usage: mv <src> <dest>');
          var src = need(a[0], 'mv');
          var dest = vfs.resolvePath(a[1], cwd);
          if (dest && vfs.isFolder(dest)) { vfs.move(src, dest); return; }      // move into folder
          if (dest) throw new Error('mv: ' + a[1] + ': already exists');
          var r = vfs.resolveParent(a[1], cwd);
          if (!r.parentId) throw new Error('mv: ' + a[1] + ': folder does not exist');
          var e = vfs.nameError(r.name); if (e) throw new Error('mv: ' + e);
          if (r.parentId !== vfs.stat(src).parent) {
            if (vfs.isFolder(src) && vfs.isAncestor(src, r.parentId)) throw new Error('mv: cannot move a folder into itself');
            var oldName = vfs.stat(src).name;
            if (vfs.findChild(r.parentId, oldName) && oldName.toLowerCase() !== r.name.toLowerCase()) {
              throw new Error('mv: "' + oldName + '" already exists in the destination');
            }
            vfs.move(src, r.parentId);
          }
          vfs.rename(src, r.name);
        } },
        echo: { usage: 'echo <text> [> file|>> file]', desc: 'print text or write to a file', run: function (a, redir) {
          var text = a.join(' ');
          if (!redir) { print(text); return; }
          var id = vfs.resolvePath(redir.file, cwd);
          if (id && vfs.isFolder(id)) throw new Error('echo: ' + redir.file + ': Is a folder');
          if (id) { vfs.write(id, redir.op === '>>' ? vfs.readText(id) + text + '\n' : text + '\n', { encoding: 'text' }); return; }
          var r = vfs.resolveParent(redir.file, cwd);
          if (!r.parentId) throw new Error('echo: ' + redir.file + ': folder does not exist');
          vfs.createFile(r.parentId, r.name, text + '\n');
        } },
        open: { usage: 'open <path>', desc: 'open a file in its app', run: function (a) {
          if (!a.length) throw new Error('open: missing path');
          OS.openFile(need(a[0], 'open'));
        } },
        cp: { usage: 'cp [-r] <src> <dest>', desc: 'copy a file (-r for folders)', run: function (a) {
          var rec = a[0] === '-r' || a[0] === '-R'; if (rec) a = a.slice(1);
          if (a.length !== 2) throw new Error('cp: usage: cp [-r] <src> <dest>');
          var src = need(a[0], 'cp');
          if (vfs.isFolder(src) && !rec) throw new Error('cp: ' + a[0] + ': is a folder (use cp -r)');
          var dest = vfs.resolvePath(a[1], cwd);
          if (dest && vfs.isFolder(dest)) { vfs.copy(src, dest, vfs.findChild(dest, vfs.stat(src).name) ? undefined : vfs.stat(src).name); return; }
          if (dest) throw new Error('cp: ' + a[1] + ': already exists');
          var r = vfs.resolveParent(a[1], cwd);
          if (!r.parentId) throw new Error('cp: ' + a[1] + ': folder does not exist');
          vfs.copy(src, r.parentId, r.name);
        } },
        tree: { usage: 'tree [path]', desc: 'show a folder tree', run: function (a) {
          var id = a.length ? need(a[0], 'tree') : cwd, lines = [vfs.stat(id).name || '/'], count = 0;
          (function walk(fid, prefix) {
            var items = vfs.list(fid);
            items.forEach(function (m, i) {
              if (count++ > 500) return;
              var lastOne = i === items.length - 1;
              lines.push(prefix + (lastOne ? '└── ' : '├── ') + m.name + (m.type === 'folder' ? '/' : ''));
              if (m.type === 'folder') walk(m.id, prefix + (lastOne ? '    ' : '│   '));
            });
          })(id, '');
          print(lines.join('\n'));
        } },
        find: { usage: 'find <text>', desc: 'find files by name', run: function (a) {
          if (!a.length) throw new Error('find: missing search text');
          var res = vfs.search(a.join(' '), 100);
          if (!res.length) { print('No matches.', 'muted'); return; }
          res.forEach(function (m) { print(m.path + (m.type === 'folder' ? '/' : '')); });
        } },
        whoami: { usage: 'whoami', desc: 'print your user name', run: function () { print(user()); } },
        date: { usage: 'date', desc: 'print the date and time', run: function () { print(new Date().toString()); } },
        history: { usage: 'history', desc: 'list previous commands', run: function () { history.forEach(function (c, i) { print(String(i + 1).padStart(4) + '  ' + c); }); } },
        about: { usage: 'about', desc: 'about this system', run: function () {
          print([OS.storage.APP_NAME + ' (data format v' + OS.state.version + ')',
            'User:      ' + user(),
            'Apps:      ' + OS.installedApps().length + ' installed',
            'Data:      ' + U.formatBytes(OS.storage.dataSize()),
            'Encrypted: ' + (OS.crypto.isEnabled() ? 'yes (AES-GCM)' : 'no')].join('\n'));
        } },
        clear: { usage: 'clear', desc: 'clear the screen', run: function () { out.textContent = ''; } }
      };

      function exec(lineText) {
        print(promptEl.textContent + lineText, 'cmd');
        var words;
        try { words = parse(lineText); } catch (e) { err(e.message); return; }
        if (!words.length) return;
        var redir = null, idx = words.findIndex(function (w) { return typeof w === 'object'; });
        if (idx >= 0) {
          var f = words[idx + 1];
          if (typeof f !== 'string') { err('syntax error: expected a file name after ' + words[idx].op); return; }
          redir = { op: words[idx].op, file: f };
          words = words.slice(0, idx).concat(words.slice(idx + 2));
          if (words.some(function (w) { return typeof w === 'object'; })) { err('syntax error: only one redirection is supported'); return; }
        }
        var name = words[0], cmd = commands[name];
        if (!cmd) { err(name + ': command not found (type "help")'); return; }
        if (redir && name !== 'echo') { err('redirection is only supported for echo'); return; }
        try { cmd.run(words.slice(1), redir); } catch (e) { err(e.message); }
      }

      function complete() {
        var v = input.value, pos = input.selectionStart;
        var before = v.slice(0, pos), m = /(\S*)$/.exec(before), word = m[1];
        var first = !/\s/.test(before.trim()) && before.trim() === word;
        var cands;
        if (first) cands = Object.keys(commands).filter(function (c) { return c.indexOf(word) === 0; });
        else {
          var slash = word.lastIndexOf('/'), dirPart = slash >= 0 ? word.slice(0, slash + 1) : '', base = slash >= 0 ? word.slice(slash + 1) : word;
          var dirId = vfs.resolvePath(dirPart || '.', cwd);
          if (!dirId || !vfs.isFolder(dirId)) return;
          cands = vfs.list(dirId).filter(function (x) { return x.name.toLowerCase().indexOf(base.toLowerCase()) === 0; })
            .map(function (x) { return dirPart + x.name.replace(/ /g, '\\ ') + (x.type === 'folder' ? '/' : ''); });
        }
        if (cands.length === 1) {
          var ins = cands[0] + (first ? ' ' : '');
          input.value = before.slice(0, before.length - word.length) + ins + v.slice(pos);
          var np = before.length - word.length + ins.length; input.setSelectionRange(np, np);
        } else if (cands.length > 1) print(cands.join('    '), 'muted');
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var v = input.value; input.value = '';
          if (v.trim()) { history.push(v); if (history.length > 200) history.shift(); }
          hIdx = history.length; draft = '';
          exec(v); updatePrompt();
          scroller.scrollTop = scroller.scrollHeight;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (hIdx === history.length) draft = input.value;
          if (hIdx > 0) { hIdx--; input.value = history[hIdx]; }
          setTimeout(function () { input.setSelectionRange(input.value.length, input.value.length); }, 0);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (hIdx < history.length) { hIdx++; input.value = hIdx === history.length ? draft : history[hIdx]; }
        } else if (e.key === 'Tab') { e.preventDefault(); complete(); }
        else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.textContent = ''; }
      });

      print(OS.storage.APP_NAME + ' terminal. Type "help" for a list of commands.', 'muted');
      updatePrompt();
      setTimeout(function () { input.focus(); }, 0);
      win._exec = exec; // used by tests
    }
  });
})();
