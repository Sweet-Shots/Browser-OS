/* =====================================================================
   APP: STORE
   Install / uninstall the optional built-in apps, and install your own
   apps from a .js file ("sideloading").
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  var EXAMPLE_APP = [
    '// A tiny Nimbus app. Install it from Store > Install from file.',
    '// Everything an app needs is one OS.registerApp() call.',
    'OS.registerApp({',
    "  id: 'hello-counter',",
    "  name: 'Counter',",
    "  icon: OS.makeAppIcon('#e0803a', '<circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"var(--ic-fg,#fff)\"/>'),",
    "  category: 'Utilities',",
    '  defaultSize: { w: 320, h: 220 },',
    '  launch: function (win) {',
    '    var h = OS.util.h;',
    '    var state = win.getState({ clicks: 0 });',
    "    var label = h('p', { style: { fontSize: '28px', textAlign: 'center' } }, String(state.clicks));",
    "    var btn = h('button', { class: 'btn primary' }, 'Add one');",
    "    btn.addEventListener('click', function () {",
    '      state.clicks++;',
    '      win.setState(state);            // saved inside the Nimbus file',
    '      label.textContent = String(state.clicks);',
    '    });',
    "    win.body.style.alignItems = 'center';",
    "    win.body.style.justifyContent = 'center';",
    '    win.body.append(label, btn);',
    '  }',
    '});',
    ''
  ].join('\n');

  function optionalApps() {
    var out = [];
    OS.apps.forEach(function (a) { if (a.optional && !a.hidden) out.push(a); });
    return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  /** Install a sideloaded app from source code. Throws on failure. */
  function sideload(code, fileName) {
    var before = new Set(OS.apps.keys()), error = null;
    var onErr = function (e) { error = e.error || new Error(e.message); };
    window.addEventListener('error', onErr);
    var el = document.createElement('script');
    el.textContent = code + '\n//# sourceURL=' + encodeURIComponent(fileName || 'sideloaded-app.js');
    document.body.appendChild(el); el.remove();
    window.removeEventListener('error', onErr);
    var added = [];
    OS.apps.forEach(function (a, id) { if (!before.has(id)) added.push(a); });
    if (error) { added.forEach(function (a) { OS.apps.delete(a.id); }); throw new Error('The app crashed while installing: ' + error.message); }
    if (!added.length) throw new Error('No app was registered. The file must call OS.registerApp({...}).');
    if (added.length > 1) { added.forEach(function (a) { OS.apps.delete(a.id); }); throw new Error('A file may register only one app.'); }
    var a = added[0];
    a.sideloaded = true; a.optional = false;
    OS.state.sideloaded.push({ id: a.id, name: a.name, code: code, installedAt: Date.now() });
    OS.markDirty();
    OS.events.emit('apps-changed');
    return a;
  }
  async function removeSideloaded(id) {
    var wins = OS.wm.findByApp(id);
    for (var i = 0; i < wins.length; i++) if (!(await wins[i].close())) return false;
    OS.state.sideloaded = OS.state.sideloaded.filter(function (p) { return p.id !== id; });
    var st = OS.state.settings;
    st.shelf = st.shelf.filter(function (x) { return x !== id; });
    st.desktopApps = st.desktopApps.filter(function (x) { return x !== id; });
    OS.apps.delete(id);
    OS.markDirty();
    OS.events.emit('apps-changed');
    return true;
  }

  OS.registerApp({
    id: 'store',
    name: 'Store',
    icon: OS.appIcons.store,
    category: 'System',
    keywords: 'install apps games download',
    defaultSize: { w: 920, h: 620 },
    singleInstance: true,
    launch: function (win, args) {
      var tab = args.tab || 'discover', detail = null, busy = {};
      var nav = h('nav', { class: 'sx-nav' });
      var main = h('div', { class: 'sx-main' });
      win.body.classList.add('app-store');
      win.body.append(nav, main);
      var tabs = [['discover', 'Discover', 'sparkle'], ['games', 'Games', 'game'], ['apps', 'Apps', 'apps'], ['installed', 'Installed', 'check']];

      function go(t) { tab = t; detail = null; render(); main.scrollTop = 0; }
      function actionBtn(a, big) {
        var installed = OS.isInstalled(a.id);
        if (busy[a.id]) return h('button', { class: 'btn tonal' + (big ? '' : ' small'), type: 'button', disabled: true }, h('span', { class: 'spinner' }), 'Installing');
        if (installed) return h('button', { class: 'btn tonal' + (big ? '' : ' small'), type: 'button', onclick: function (e) { e.stopPropagation(); OS.launch(a.id); } }, 'Open');
        return h('button', { class: 'btn primary' + (big ? '' : ' small'), type: 'button', onclick: function (e) { e.stopPropagation(); install(a); } }, 'Install');
      }
      function install(a) {
        busy[a.id] = true; render();
        setTimeout(function () {
          delete busy[a.id];
          OS.installApp(a.id);
          if (OS.state.settings.shelf.indexOf(a.id) < 0 && a.category === 'Games') { /* games stay off the shelf by default */ }
          OS.notify(a.name + ' installed', 'Find it in the launcher.', { icon: 'check', sound: 'success', action: { label: 'Open', run: function () { OS.launch(a.id); } } });
          render();
        }, 650);
      }
      async function uninstall(a) {
        if (!(await OS.dialogs.confirm('Uninstall ' + a.name + '? Its saved data (scores, settings) is kept in case you reinstall it.', { title: 'Uninstall', okLabel: 'Uninstall', danger: true }))) return;
        if (await OS.uninstallApp(a.id)) { OS.toast(a.name + ' was uninstalled'); render(); }
      }
      function appCard(a) {
        var c = h('div', { class: 'sx-card', role: 'button', tabindex: '0', 'aria-label': a.name },
          h('span', { class: 'ico app-ico', html: a.icon }),
          h('div', { class: 'sx-card-txt' }, h('b', null, a.name), h('small', null, a.category)),
          actionBtn(a));
        c.addEventListener('click', function () { detail = a; render(); main.scrollTop = 0; });
        c.addEventListener('keydown', function (e) { if (e.key === 'Enter') { detail = a; render(); } });
        return c;
      }
      function hero(a, kicker) {
        var hc = h('div', { class: 'sx-hero' },
          h('div', { class: 'sx-hero-txt' }, h('small', null, kicker), h('h2', null, a.name), h('p', null, a.description), actionBtn(a, true)),
          h('span', { class: 'ico app-ico sx-hero-ico', html: a.icon }));
        hc.addEventListener('click', function (e) { if (e.target.tagName !== 'BUTTON') { detail = a; render(); } });
        return hc;
      }

      function render() {
        if (win.closed) return;
        nav.textContent = '';
        nav.appendChild(h('div', { class: 'sx-brand' }, h('span', { class: 'ico app-ico', html: OS.appIcons.store }), h('b', null, 'Store')));
        tabs.forEach(function (t) {
          nav.appendChild(h('button', { class: 'st-tab' + (tab === t[0] && !detail ? ' active' : ''), type: 'button', onclick: function () { go(t[0]); } }, h('span', { html: OS.icons[t[2]] }), h('span', null, t[1])));
        });
        nav.appendChild(h('div', { class: 'grow' }));
        nav.appendChild(h('button', { class: 'st-tab', type: 'button', onclick: function () { go('sideload'); } }, h('span', { html: OS.icons.code }), h('span', null, 'Install from file')));
        main.textContent = '';
        if (detail) return renderDetail(detail);
        var apps = optionalApps();
        if (tab === 'discover') {
          var featured = apps.filter(function (a) { return !OS.isInstalled(a.id); })[0] || apps.filter(function (a) { return a.category === 'Games'; })[0];
          if (featured) main.appendChild(hero(featured, OS.isInstalled(featured.id) ? 'Featured' : 'Featured · not installed yet'));
          main.appendChild(h('h3', { class: 'sx-h' }, 'Games'));
          main.appendChild(grid(apps.filter(function (a) { return a.category === 'Games'; })));
          main.appendChild(h('h3', { class: 'sx-h' }, 'Apps'));
          main.appendChild(grid(apps.filter(function (a) { return a.category !== 'Games'; })));
        } else if (tab === 'games') {
          main.appendChild(h('h2', { class: 'sx-title' }, 'Games'));
          main.appendChild(grid(apps.filter(function (a) { return a.category === 'Games'; })));
        } else if (tab === 'apps') {
          main.appendChild(h('h2', { class: 'sx-title' }, 'Apps'));
          main.appendChild(grid(apps.filter(function (a) { return a.category !== 'Games'; })));
        } else if (tab === 'installed') {
          main.appendChild(h('h2', { class: 'sx-title' }, 'Installed'));
          var inst = apps.filter(function (a) { return OS.isInstalled(a.id); });
          main.appendChild(inst.length ? grid(inst) : h('p', { class: 'muted' }, 'No optional apps installed.'));
          var side = OS.state.sideloaded || [];
          if (side.length) {
            main.appendChild(h('h3', { class: 'sx-h' }, 'Installed from files'));
            var list = h('div', { class: 'sx-side-list' });
            side.forEach(function (p) {
              var a = OS.apps.get(p.id);
              list.appendChild(h('div', { class: 'sx-side' }, h('span', { class: 'ico app-ico', html: a ? a.icon : OS.appIcons.generic }),
                h('div', { class: 'sx-card-txt' }, h('b', null, p.name), h('small', null, a ? 'Installed ' + U.formatDate(p.installedAt) : 'Failed to load')),
                a ? h('button', { class: 'btn tonal small', type: 'button', onclick: function () { OS.launch(p.id); } }, 'Open') : null,
                h('button', { class: 'btn text small danger', type: 'button', onclick: async function () {
                  if (!(await OS.dialogs.confirm('Remove "' + p.name + '"?', { title: 'Uninstall', okLabel: 'Uninstall', danger: true }))) return;
                  if (await removeSideloaded(p.id)) { OS.toast(p.name + ' was removed'); render(); }
                } }, 'Uninstall')));
            });
            main.appendChild(list);
          }
        } else if (tab === 'sideload') renderSideload();
      }
      function grid(list) { var g = h('div', { class: 'sx-grid' }); list.forEach(function (a) { g.appendChild(appCard(a)); }); return g; }

      function renderDetail(a) {
        var installed = OS.isInstalled(a.id);
        main.appendChild(h('button', { class: 'btn text small sx-back', type: 'button', onclick: function () { detail = null; render(); } }, h('span', { html: OS.icons.back }), 'Back'));
        main.appendChild(h('div', { class: 'sx-detail' },
          h('span', { class: 'ico app-ico sx-detail-ico', html: a.icon }),
          h('div', { class: 'sx-detail-txt' }, h('h2', null, a.name), h('div', { class: 'muted' }, a.category + (installed ? ' · Installed' : '')),
            h('div', { class: 'sx-detail-actions' }, actionBtn(a, true),
              installed && a.optional ? h('button', { class: 'btn text danger', type: 'button', onclick: function () { uninstall(a); } }, 'Uninstall') : null))));
        main.appendChild(h('section', { class: 'st-card' }, h('h3', null, 'About this app'), h('p', { class: 'st-desc' }, a.description || 'No description.'),
          a.fileTypes && a.fileTypes.length ? h('p', { class: 'st-desc' }, 'Opens: ' + a.fileTypes.map(function (x) { return '.' + x; }).join(', ')) : null,
          h('p', { class: 'st-desc' }, 'Works offline. Its data is saved inside your ' + OS.storage.APP_NAME + ' file.')));
      }

      function renderSideload() {
        var fileIn = h('input', { type: 'file', accept: '.js,text/javascript,application/javascript', hidden: true });
        fileIn.addEventListener('change', async function () {
          var f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
          var code = await f.text();
          var ok = await OS.dialogs.confirm('"' + f.name + '" will run with full access to everything in ' + OS.storage.APP_NAME + ', including all your files. Only install apps you wrote yourself or got from someone you trust.',
            { title: 'Install app from file?', okLabel: 'Install', danger: true });
          if (!ok) return;
          try { var a = sideload(code, f.name); OS.notify(a.name + ' installed', 'Installed from ' + f.name, { icon: 'check', sound: 'success', action: { label: 'Open', run: function () { OS.launch(a.id); } } }); go('installed'); }
          catch (e) { OS.dialogs.alert(e.message, { title: 'Could not install', icon: 'warning', sound: 'error' }); }
        });
        main.appendChild(h('h2', { class: 'sx-title' }, 'Install from file'));
        main.appendChild(h('section', { class: 'st-card' },
          h('p', { class: 'st-desc' }, 'Developers can add their own apps: a JavaScript file that calls OS.registerApp(). The app is stored inside your ' + OS.storage.APP_NAME + ' file, so it goes wherever the file goes.'),
          h('div', { class: 'warnbox' }, h('span', { html: OS.icons.warning }), h('span', null, h('b', null, 'Apps from files are not checked. '), 'They can read, change or delete all your files. Never install one you don\'t trust.')),
          h('div', { class: 'st-row' },
            h('button', { class: 'btn primary', type: 'button', onclick: function () { fileIn.click(); } }, h('span', { html: OS.icons.upload }), 'Choose a .js file…'),
            h('button', { class: 'btn tonal', type: 'button', onclick: function () { U.downloadBlob(new Blob([EXAMPLE_APP], { type: 'text/javascript' }), 'nimbus-example-app.js'); } }, h('span', { html: OS.icons.download }), 'Download an example'),
            fileIn)));
      }

      win._onRelaunch = function (a) { if (a.tab) go(a.tab); };
      var off = OS.events.on('apps-changed', function () { render(); });
      win.onDestroy(off);
      render();
    }
  });

  OS.store = { sideload: sideload, removeSideloaded: removeSideloaded, EXAMPLE_APP: EXAMPLE_APP };
})();
