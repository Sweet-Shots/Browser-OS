/* =====================================================================
   APP: BROWSER (hybrid)
   - Web pages load in a sandboxed <iframe>. Many big sites refuse to be
     shown inside another page; for those, "Open in new tab" opens the
     real browser. Pages can never navigate or script Nimbus itself
     (no allow-top-navigation, and they are a different origin).
   - HTML files from Files open in a fully isolated sandbox (srcdoc,
     no same-origin), so they cannot read Nimbus data.
   This app is the only part of Nimbus that touches the network, and
   only when you type a web address or search.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var WEB_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
  var LOCAL_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups';
  var ENGINES = {
    wikipedia: { name: 'Wikipedia (opens here)', url: 'https://en.wikipedia.org/w/index.php?search=', inside: true },
    duckduckgo: { name: 'DuckDuckGo (new tab)', url: 'https://duckduckgo.com/?q=' },
    google: { name: 'Google (new tab)', url: 'https://www.google.com/search?q=' },
    bing: { name: 'Bing (new tab)', url: 'https://www.bing.com/search?q=' }
  };
  var DEFAULT_BOOKMARKS = [
    { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
    { title: 'OpenStreetMap', url: 'https://www.openstreetmap.org/export/embed.html' },
    { title: 'Project Gutenberg', url: 'https://www.gutenberg.org/' }
  ];

  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } }
  function letter(t) { return (t || '?').replace(/^www\./, '').charAt(0).toUpperCase(); }
  function hue(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 360; return x; }
  function openExternal(url) { var w = window.open(url, '_blank', 'noopener,noreferrer'); if (!w) OS.toast('Your browser blocked the new tab. Allow pop-ups for this file and try again.', 'error', 5000); }
  /** Turn what the user typed into { url } or { search }. */
  function parseInput(text) {
    var t = text.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return { url: t };
    if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(t) && !/\s/.test(t)) return { url: 'https://' + t };
    return { search: t };
  }

  OS.registerApp({
    id: 'browser',
    name: 'Browser',
    icon: OS.appIcons.browser,
    optional: true,
    category: 'Internet',
    description: 'Tabs, bookmarks and history. Opens sites that allow embedding right inside Nimbus, sends others to a real browser tab in one click, and shows your own HTML files safely.',
    keywords: 'web internet html',
    fileTypes: ['html', 'htm'],
    priority: 1,
    defaultSize: { w: 1000, h: 680 },
    launch: function (win, args) {
      var data = win.getState({ bookmarks: DEFAULT_BOOKMARKS.slice(), history: [] });
      var tabs = [], active = null;

      /* ---- chrome ---- */
      var tabStrip = h('div', { class: 'bw-tabs', role: 'tablist' });
      var newTabBtn = h('button', { class: 'icon-btn sm bw-newtab', type: 'button', title: 'New tab', 'aria-label': 'New tab', html: OS.icons.plus, onclick: function () { openTab({ type: 'start' }); } });
      win.titleSlot.append(tabStrip, newTabBtn);
      function tb(icon, title, fn) { return h('button', { class: 'icon-btn sm', type: 'button', title: title, 'aria-label': title, html: OS.icons[icon], onclick: fn }); }
      var bBack = tb('back', 'Back', function () { nav(-1); });
      var bFwd = tb('forward', 'Forward', function () { nav(1); });
      var bReload = tb('refresh', 'Reload', function () { reload(); });
      var bHome = tb('home', 'Start page', function () { navigate({ type: 'start' }); });
      var addr = h('input', { class: 'bw-addr', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'Search or type a web address', 'aria-label': 'Address' });
      var lockIco = h('span', { class: 'bw-addr-ico', html: OS.icons.search });
      var bStar = tb('star', 'Bookmark this page', function () { toggleBookmark(); });
      var bExt = tb('open', 'Open in a real browser tab', function () { var e = cur(); if (e && e.type === 'web') openExternal(e.url); });
      var bMenu = tb('more', 'Menu', function (ev) { menu(ev); });
      var bar = h('div', { class: 'bw-bar' }, bBack, bFwd, bReload, bHome, h('div', { class: 'bw-addr-wrap' }, lockIco, addr), bStar, bExt, bMenu);
      var views = h('div', { class: 'bw-views' });
      win.body.classList.add('app-browser');
      win.body.append(bar, views);

      addr.addEventListener('focus', function () { addr.select(); });
      addr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); go(addr.value); addr.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); updateBar(); addr.blur(); }
      });
      win.body.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); addr.focus(); }
      });

      function cur() { return active && active.entries[active.idx]; }
      function go(text) {
        var p = parseInput(text); if (!p) return;
        if (p.url) navigate({ type: 'web', url: p.url });
        else search(p.search);
      }
      function search(q) {
        var eng = ENGINES[OS.state.settings.browser.searchEngine] || ENGINES.wikipedia;
        var url = eng.url + encodeURIComponent(q);
        if (eng.inside) navigate({ type: 'web', url: url, title: q });
        else { openExternal(url); OS.toast('Opened the search in a new browser tab'); }
      }

      /* ---- tabs ---- */
      function openTab(entry, background) {
        var t = { id: U.uid(4), entries: [], idx: -1, view: h('div', { class: 'bw-view' }) };
        tabs.push(t);
        views.appendChild(t.view);
        if (!background) select(t);
        navigate(entry, t);
        renderTabs();
        return t;
      }
      function select(t) {
        active = t;
        tabs.forEach(function (x) { x.view.hidden = x !== t; });
        renderTabs(); updateBar();
      }
      function closeTab(t) {
        var i = tabs.indexOf(t);
        tabs.splice(i, 1); t.view.remove();
        if (!tabs.length) { win.close(); return; }
        if (active === t) select(tabs[Math.min(i, tabs.length - 1)]);
        renderTabs();
      }
      function renderTabs() {
        tabStrip.textContent = '';
        tabs.forEach(function (t) {
          var e = t.entries[t.idx] || { type: 'start' };
          var title = e.type === 'start' ? 'New tab' : (e.title || hostOf(e.url || ''));
          var fav = e.type === 'web' ? h('span', { class: 'bw-fav', style: { background: 'hsl(' + hue(hostOf(e.url)) + ' 55% 45%)' } }, letter(hostOf(e.url)))
            : h('span', { class: 'bw-fav ico', html: OS.icons[e.type === 'local' ? 'fileCode' : 'globe'] });
          var el = h('div', { class: 'bw-tab' + (t === active ? ' on' : ''), role: 'tab', 'aria-selected': String(t === active), title: title },
            fav, h('span', { class: 'bw-tab-t' }, title),
            h('button', { class: 'bw-tab-x', type: 'button', 'aria-label': 'Close tab', html: OS.icons.close, onclick: function (ev) { ev.stopPropagation(); closeTab(t); } }));
          el.addEventListener('pointerdown', function (ev) { if (!ev.target.closest('.bw-tab-x')) select(t); });
          el.addEventListener('auxclick', function (ev) { if (ev.button === 1) closeTab(t); });
          tabStrip.appendChild(el);
        });
      }

      /* ---- navigation ---- */
      function navigate(entry, t) {
        t = t || active;
        t.entries = t.entries.slice(0, t.idx + 1);
        t.entries.push(entry); t.idx = t.entries.length - 1;
        load(t);
        if (entry.type === 'web') {
          data.history.unshift({ url: entry.url, title: entry.title || hostOf(entry.url), at: Date.now() });
          if (data.history.length > 200) data.history.length = 200;
        }
      }
      function nav(d) { var t = active; if (!t) return; var i = t.idx + d; if (i < 0 || i >= t.entries.length) return; t.idx = i; load(t); }
      function reload() { if (active) load(active); }
      function load(t) {
        var e = t.entries[t.idx];
        t.view.textContent = '';
        if (e.type === 'start') t.view.appendChild(startPage());
        else if (e.type === 'web') {
          var frame = h('iframe', { class: 'bw-frame', sandbox: WEB_SANDBOX, referrerpolicy: 'no-referrer', allow: 'fullscreen', title: e.title || e.url });
          var spin = h('div', { class: 'bw-loading' });
          var hint = h('div', { class: 'bw-hint' }, h('span', { html: OS.icons.info }),
            h('span', null, 'Page blank or refusing to load? Many sites (Google, YouTube, school portals) don\'t allow being shown inside other pages.'),
            h('button', { class: 'btn tonal small', type: 'button', onclick: function () { openExternal(e.url); } }, h('span', { html: OS.icons.open }), 'Open in new tab'),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Dismiss', html: OS.icons.close, onclick: function () { hint.remove(); } }));
          frame.addEventListener('load', function () { spin.remove(); });
          setTimeout(function () { spin.remove(); }, 15000);
          frame.src = e.url;
          t.view.append(spin, frame, hint);
        } else if (e.type === 'local') {
          var f = h('iframe', { class: 'bw-frame white', sandbox: LOCAL_SANDBOX, title: e.title });
          try { f.srcdoc = OS.vfs.readText(e.fileId); } catch (err) { f.srcdoc = '<p style="font-family:sans-serif;padding:2em">This file no longer exists.</p>'; }
          t.view.appendChild(f);
        }
        if (t === active) { updateBar(); }
        renderTabs();
      }
      function updateBar() {
        var e = cur();
        bBack.disabled = !active || active.idx <= 0;
        bFwd.disabled = !active || active.idx >= active.entries.length - 1;
        var isWeb = e && e.type === 'web';
        addr.value = !e || e.type === 'start' ? '' : e.type === 'local' ? 'nimbus:' + (OS.vfs.exists(e.fileId) ? OS.vfs.pathOf(e.fileId) : e.title) : e.url;
        lockIco.innerHTML = OS.icons[isWeb ? (e.url.indexOf('https:') === 0 ? 'lock' : 'warning') : e && e.type === 'local' ? 'file2' : 'search'];
        bStar.disabled = !isWeb; bExt.disabled = !isWeb;
        var marked = isWeb && data.bookmarks.some(function (b) { return b.url === e.url; });
        bStar.innerHTML = OS.icons[marked ? 'starFilled' : 'star'];
        bStar.classList.toggle('active', !!marked);
        win.setTitle(!e || e.type === 'start' ? 'Browser' : (e.title || hostOf(e.url)));
      }
      function toggleBookmark() {
        var e = cur(); if (!e || e.type !== 'web') return;
        var i = data.bookmarks.findIndex(function (b) { return b.url === e.url; });
        if (i >= 0) { data.bookmarks.splice(i, 1); OS.toast('Bookmark removed'); }
        else { data.bookmarks.push({ title: e.title || hostOf(e.url), url: e.url }); OS.toast('Bookmarked'); }
        win.setState(data); updateBar(); refreshStartPages();
      }
      function refreshStartPages() { tabs.forEach(function (t) { var e = t.entries[t.idx]; if (e && e.type === 'start') load(t); }); }

      /* ---- start page ---- */
      function startPage() {
        var q = h('input', { class: 'bw-start-search', type: 'search', placeholder: 'Search ' + (ENGINES[OS.state.settings.browser.searchEngine] || ENGINES.wikipedia).name.replace(/ \(.*/, '') + ' or type a web address', 'aria-label': 'Search' });
        q.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(q.value); });
        var tiles = h('div', { class: 'bw-tiles' });
        data.bookmarks.forEach(function (b, i) {
          var tile = h('button', { class: 'bw-tile', type: 'button', title: b.url },
            h('span', { class: 'bw-tile-ico', style: { background: 'hsl(' + hue(hostOf(b.url)) + ' 55% 45%)' } }, letter(b.title || hostOf(b.url))),
            h('span', { class: 'bw-tile-t' }, b.title || hostOf(b.url)));
          tile.addEventListener('click', function () { navigate({ type: 'web', url: b.url, title: b.title }); });
          tile.addEventListener('contextmenu', function (e) {
            OS.contextMenu(e, [
              { label: 'Open', icon: 'open', action: function () { navigate({ type: 'web', url: b.url, title: b.title }); } },
              { label: 'Open in new tab', icon: 'tab', action: function () { openTab({ type: 'web', url: b.url, title: b.title }); } },
              { label: 'Open in real browser', icon: 'globe', action: function () { openExternal(b.url); } },
              { label: 'Rename', icon: 'rename', action: async function () { var t = await OS.dialogs.prompt('Name', { title: 'Rename bookmark', value: b.title }); if (t) { b.title = t.trim(); win.setState(data); refreshStartPages(); } } },
              '-', { label: 'Remove', icon: 'trash', danger: true, action: function () { data.bookmarks.splice(i, 1); win.setState(data); refreshStartPages(); updateBar(); } }
            ]);
          });
          tiles.appendChild(tile);
        });
        var addTile = h('button', { class: 'bw-tile add', type: 'button', title: 'Add shortcut' }, h('span', { class: 'bw-tile-ico', html: OS.icons.plus }), h('span', { class: 'bw-tile-t' }, 'Add'));
        addTile.addEventListener('click', async function () {
          var u = await OS.dialogs.prompt('Web address', { title: 'Add shortcut', placeholder: 'example.com', validate: function (v) { var p = parseInput(v); return p && p.url ? '' : 'Enter a web address like example.com'; } });
          if (!u) return;
          var url = parseInput(u).url;
          data.bookmarks.push({ title: hostOf(url), url: url }); win.setState(data); refreshStartPages();
        });
        tiles.appendChild(addTile);
        var local = OS.vfs.findByExt(['html', 'htm']).slice(0, 6);
        var localBox = local.length ? h('div', { class: 'bw-local' }, h('h3', null, 'Your HTML files'), h('div', { class: 'bw-local-list' }, local.map(function (m) {
          var b = h('button', { class: 'lz-file', type: 'button', title: OS.vfs.pathOf(m.id) }, h('span', { class: 'ico', html: OS.icons.fileCode }),
            h('span', { class: 'lz-file-txt' }, h('span', { class: 'lbl' }, m.name), h('span', { class: 'sub' }, OS.vfs.pathOf(m.id))));
          b.addEventListener('click', function () { navigate({ type: 'local', fileId: m.id, title: m.name }); });
          return b;
        }))) : null;
        setTimeout(function () { if (!q.closest('[hidden]')) q.focus(); }, 30);
        return h('div', { class: 'bw-start' },
          h('div', { class: 'bw-start-inner' },
            h('div', { class: 'bw-logo', html: OS.appIcons.browser }),
            h('div', { class: 'bw-start-search-wrap' }, h('span', { html: OS.icons.search }), q),
            tiles, localBox,
            h('p', { class: 'bw-note' }, 'Sites that block embedding open in your real browser with one click. Nimbus only goes online when you visit a site here.')));
      }

      /* ---- menu ---- */
      function menu(ev) {
        var r = bMenu.getBoundingClientRect(), eng = OS.state.settings.browser.searchEngine;
        OS.contextMenu({ x: r.right - 230, y: r.bottom + 4 }, [
          { label: 'New tab', icon: 'plus', action: function () { openTab({ type: 'start' }); } },
          { label: 'History', icon: 'history', action: showHistory },
          { label: 'Open HTML file…', icon: 'fileCode', action: async function () { var id = await OS.dialogs.openFile({ title: 'Open HTML file', extensions: ['html', 'htm'] }); if (id) navigate({ type: 'local', fileId: id, title: OS.vfs.stat(id).name }); } },
          '-'
        ].concat(Object.keys(ENGINES).map(function (k) {
          return { label: 'Search with ' + ENGINES[k].name, checked: eng === k, icon: 'search', action: function () { OS.state.settings.browser.searchEngine = k; OS.markDirty(); refreshStartPages(); } };
        })));
        void ev;
      }
      function showHistory() {
        var list = h('div', { class: 'bw-hist' });
        if (!data.history.length) list.appendChild(h('p', { class: 'muted' }, 'No history yet.'));
        data.history.slice(0, 100).forEach(function (x) {
          var b = h('button', { class: 'bw-hist-row', type: 'button' }, h('span', { class: 'bw-fav', style: { background: 'hsl(' + hue(hostOf(x.url)) + ' 55% 45%)' } }, letter(hostOf(x.url))),
            h('span', { class: 'lz-file-txt' }, h('span', { class: 'lbl' }, x.title), h('span', { class: 'sub' }, x.url)), h('small', { class: 'muted' }, U.timeAgo(x.at)));
          b.addEventListener('click', function () { document.querySelector('.modal-overlay:last-child .btn.text') && document.querySelector('.modal-overlay:last-child .btn.text').click(); navigate({ type: 'web', url: x.url, title: x.title }); });
          list.appendChild(b);
        });
        OS.dialogs.modal({ title: 'History', wide: true, body: list, cancelValue: null,
          buttons: [{ label: 'Close', value: null }, { label: 'Clear history', value: 'clear', danger: true, primary: true }] })
          .then(function (v) { if (v === 'clear') { data.history = []; win.setState(data); OS.toast('History cleared'); } });
      }

      win._onRelaunch = function (a) { start(a, true); };
      function start(a, existing) {
        if (a.fileId && OS.vfs.exists(a.fileId)) (existing ? openTab : navigate)({ type: 'local', fileId: a.fileId, title: OS.vfs.stat(a.fileId).name });
        else if (a.url) (existing ? openTab : navigate)({ type: 'web', url: a.url });
        else if (a.search) { if (existing) openTab({ type: 'start' }); search(a.search); }
        else if (existing) openTab({ type: 'start' });
      }
      openTab({ type: 'start' });
      start(args, false);
    }
  });
})();
