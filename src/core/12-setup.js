/* =====================================================================
   CORE 12: SETUP WIZARD (first launch)
   Runs on top of the live desktop so choices preview instantly.
   Steps: welcome, name, look, sounds, apps, password, saving.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  function browserName() {
    var ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'Microsoft Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'your browser';
  }

  /** Run the wizard. Resolves when finished. */
  function run() {
    return new Promise(function (resolve) {
      var st = OS.state, s = st.settings, step = 0, pwDone = false;
      var card = h('div', { class: 'setup-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'setup-title' });
      var scr = h('div', { class: 'screen setup', id: 'setup' }, card);
      document.getElementById('os-root').appendChild(scr);

      var steps = [welcome, name, look, sounds, apps, security, saving];

      function frame(opts) {
        card.textContent = '';
        var dots = h('div', { class: 'setup-dots', 'aria-hidden': 'true' });
        steps.forEach(function (_, i) { dots.appendChild(h('span', { class: i === step ? 'on' : (i < step ? 'done' : '') })); });
        var back = step > 0 && !opts.noBack ? h('button', { class: 'btn text', type: 'button', onclick: function () { go(step - 1); } }, 'Back') : h('span');
        var next = h('button', { class: 'btn primary', type: 'button', id: 'setup-next' }, opts.next || 'Next');
        next.addEventListener('click', async function () {
          if (opts.onNext) { next.disabled = true; var ok = await opts.onNext(); next.disabled = false; if (ok === false) return; }
          if (step === steps.length - 1) finish(); else go(step + 1);
        });
        var skip = opts.skip ? h('button', { class: 'btn text', type: 'button', onclick: function () { go(step + 1); } }, opts.skip) : null;
        [opts.icon ? h('div', { class: 'setup-icon', html: opts.icon }) : null,
          h('h1', { id: 'setup-title' }, opts.title),
          opts.text ? h('p', { class: 'setup-text' }, opts.text) : null,
          h('div', { class: 'setup-body' }, opts.body || null),
          h('div', { class: 'setup-foot' }, back, dots, h('div', { class: 'setup-actions' }, skip, next))
        ].forEach(function (n) { if (n) card.appendChild(n); });   // (native append() would print "null")
        setTimeout(function () { var f = card.querySelector('input:not([type=checkbox]):not([type=range]), .setup-body button') || next; f.focus(); }, 40);
      }
      function go(i) { step = i; card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter'); steps[step](); }

      function welcome() {
        frame({ icon: OS.shell.LOGO, title: 'Welcome to ' + OS.storage.APP_NAME, noBack: true, next: 'Get started',
          text: 'A whole desktop that lives in a single file. Carry it on a USB stick or a cloud drive and open it on any computer, no installing needed.',
          body: h('div', { class: 'setup-facts' },
            fact('globe', 'Works offline', 'Nothing is uploaded anywhere. Your files stay inside this file.'),
            fact('save', 'Saves into itself', 'When you save, ' + browserName() + (OS.storage.hasFSA() ? ' can update this file directly.' : ' downloads an updated copy.')),
            fact('shield', 'Private if you want', OS.crypto.available ? 'Add a password and everything is encrypted.' : 'Password protection is not available in this browser.')) });
      }
      function fact(icon, title, text) { return h('div', { class: 'setup-fact' }, h('span', { html: OS.icons[icon] }), h('div', null, h('b', null, title), h('span', null, text))); }

      function name() {
        var input = h('input', { class: 'input big', type: 'text', placeholder: 'Your name', maxlength: '40', autocomplete: 'given-name', 'aria-label': 'Your name' });
        input.value = s.userName || '';
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('setup-next').click(); });
        frame({ icon: OS.icons.person, title: 'What should we call you?', text: 'Used for greetings and the terminal prompt. You can leave it empty.',
          body: input, onNext: function () { s.userName = input.value.trim(); return true; } });
      }

      function look() {
        var body = h('div', { class: 'setup-look' });
        function render() {
          body.textContent = '';
          var modes = h('div', { class: 'seg' });
          [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['auto', 'Automatic', 'auto']].forEach(function (m) {
            modes.appendChild(h('button', { class: 'seg-btn' + (s.theme === m[0] ? ' on' : ''), type: 'button', 'aria-pressed': String(s.theme === m[0]),
              onclick: function () { s.theme = m[0]; OS.shell.applyTheme(); render(); } }, h('span', { html: OS.icons[m[2]] }), m[1]));
          });
          var wps = h('div', { class: 'wp-grid' });
          Object.keys(OS.theme.WALLPAPERS).forEach(function (k) {
            var on = s.wallpaper.type === 'preset' && s.wallpaper.value === k;
            var b = h('button', { class: 'wp-thumb' + (on ? ' on' : ''), type: 'button', title: OS.theme.WALLPAPERS[k].name, 'aria-pressed': String(on),
              onclick: function () { s.wallpaper = { type: 'preset', value: k }; OS.shell.applyTheme(); render(); } }, h('span', null, OS.theme.WALLPAPERS[k].name));
            b.style.background = OS.theme.wallpaperCSS({ type: 'preset', value: k }, OS.theme.isDark());
            wps.appendChild(b);
          });
          var iconsSeg = h('div', { class: 'seg' });
          [['colorful', 'Colorful icons'], ['themed', 'Themed icons']].forEach(function (m) {
            iconsSeg.appendChild(h('button', { class: 'seg-btn' + (s.iconStyle === m[0] ? ' on' : ''), type: 'button', 'aria-pressed': String(s.iconStyle === m[0]),
              onclick: function () { s.iconStyle = m[0]; OS.shell.applyTheme(); render(); } }, m[1]));
          });
          body.append(h('label', { class: 'setup-label' }, 'Theme'), modes, h('label', { class: 'setup-label' }, 'Wallpaper'), wps,
            h('label', { class: 'setup-label' }, 'App icons'), iconsSeg,
            h('p', { class: 'setup-hint' }, 'Colors across the system follow your wallpaper.'));
        }
        render();
        frame({ icon: OS.icons.palette, title: 'Make it yours', body: body });
      }

      function sounds() {
        var on = h('input', { type: 'checkbox', class: 'switch', checked: s.sound.enabled, 'aria-label': 'System sounds' });
        var ui = h('input', { type: 'checkbox', class: 'switch', checked: s.sound.ui, 'aria-label': 'Interface sounds' });
        var vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.sound.volume), class: 'range', 'aria-label': 'Volume' });
        on.addEventListener('change', function () { s.sound.enabled = on.checked; if (on.checked) OS.sound.play('pop'); });
        ui.addEventListener('change', function () { s.sound.ui = ui.checked; });
        vol.addEventListener('input', function () { s.sound.volume = +vol.value; OS.sound.setVolume(+vol.value); });
        vol.addEventListener('change', function () { OS.sound.play('notify', { force: true }); });
        frame({ icon: OS.icons.volume, title: 'Sounds',
          text: OS.sound.available ? 'Gentle sounds for notifications, alarms, games and unlocking.' : 'This browser cannot play generated sounds.',
          body: h('div', { class: 'setup-list' },
            h('label', { class: 'setup-row' }, h('span', null, h('b', null, 'System sounds'), h('small', null, 'Notifications, alarms, games')), on),
            h('label', { class: 'setup-row' }, h('span', null, h('b', null, 'Interface sounds'), h('small', null, 'Soft clicks when windows open and close')), ui),
            h('div', { class: 'setup-row' }, h('span', { html: OS.icons.volume, class: 'row-ico' }), vol),
            h('button', { class: 'btn tonal', type: 'button', onclick: function () { OS.sound.play('startup', { force: true }); } }, h('span', { html: OS.icons.play }), 'Play a sample')) });
      }

      function apps() {
        var optional = [];
        OS.apps.forEach(function (a) { if (a.optional && !a.sideloaded) optional.push(a); });
        optional.sort(function (a, b) { return (a.category + a.name).localeCompare(b.category + b.name); });
        var list = h('div', { class: 'setup-apps' });
        optional.forEach(function (a) {
          var cb = h('input', { type: 'checkbox', checked: st.installed.indexOf(a.id) >= 0 });
          cb.addEventListener('change', function () {
            st.installed = st.installed.filter(function (x) { return x !== a.id; });
            if (cb.checked) st.installed.push(a.id);
          });
          list.appendChild(h('label', { class: 'setup-app' }, h('span', { class: 'ico app-ico', html: a.icon }),
            h('span', { class: 'sa-txt' }, h('b', null, a.name), h('small', null, a.category)), cb));
        });
        frame({ icon: OS.icons.bag, title: 'Pick your apps', text: 'Files, Notepad, Settings and the Store are always there. You can add or remove the rest any time in the Store.', body: list,
          onNext: function () { OS.events.emit('apps-changed'); return true; } });
      }

      function security() {
        if (!OS.crypto.available) {
          frame({ icon: OS.icons.shield, title: 'Password', text: OS.crypto.unavailableReason, body: null });
          return;
        }
        if (pwDone) {
          frame({ icon: OS.icons.shield, title: 'Password set', text: 'Your data will be encrypted every time you save. You can change or remove the password in Settings.', body: null });
          return;
        }
        var p1 = h('input', { class: 'input big', type: 'password', placeholder: 'Password', autocomplete: 'new-password', 'aria-label': 'Password' });
        var p2 = h('input', { class: 'input big', type: 'password', placeholder: 'Repeat password', autocomplete: 'new-password', 'aria-label': 'Repeat password' });
        var err = h('div', { class: 'setup-err', role: 'alert' });
        frame({ icon: OS.icons.shield, title: 'Protect your files?', skip: 'Skip',
          text: 'With a password, everything inside the file is encrypted. Without it, anyone who opens the file can read it.',
          body: h('div', { class: 'setup-pw' }, p1, p2, err,
            h('div', { class: 'warnbox' }, h('span', { html: OS.icons.warning }), h('span', null, h('b', null, 'There is no password recovery. '), 'If you forget it, nobody can decrypt your data.'))),
          next: 'Set password',
          onNext: async function () {
            if (!p1.value && !p2.value) { err.textContent = 'Type a password, or choose Skip.'; return false; }
            if (p1.value.length < 4) { err.textContent = 'Use at least 4 characters.'; return false; }
            if (p1.value !== p2.value) { err.textContent = 'The passwords do not match.'; return false; }
            err.innerHTML = '<span class="spinner"></span> Setting up encryption...';
            try { await OS.crypto.setPassword(p1.value); pwDone = true; return true; }
            catch (e) { err.textContent = e.message; return false; }
          } });
        [p1, p2].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('setup-next').click(); }); });
      }

      function saving() {
        var fsa = OS.storage.hasFSA();
        var saveBtn = h('button', { class: 'btn tonal', type: 'button' }, h('span', { html: OS.icons.save }), 'Save now');
        var status = h('div', { class: 'setup-hint' });
        saveBtn.addEventListener('click', async function () {
          st.setupDone = true; OS.markDirty();
          var ok = await OS.storage.save();
          status.textContent = ok ? 'Saved. You are all set.' : 'Not saved yet. You can save any time with Ctrl+S.';
        });
        frame({ icon: OS.icons.save, title: 'One last thing: saving', next: 'Finish',
          text: fsa
            ? browserName() + ' can update this file directly. The first time you save, choose this same file in the dialog. After that, Ctrl+S saves instantly.'
            : browserName() + ' cannot change files you opened, so every save downloads a fresh copy called nimbus.html. Replace your old file with the new one, for example on your USB stick.',
          body: h('div', { class: 'setup-save' },
            h('div', { class: 'setup-facts' },
              fact('keyboard', 'Ctrl+S (Cmd+S on Mac)', 'Saves from anywhere.'),
              fact('save', 'A dot on the save button', 'Means you have unsaved changes.'),
              fact('history', 'Crash recovery', 'Unsaved work is backed up in this browser every 30 seconds.')),
            saveBtn, status) });
      }

      function finish() {
        st.setupDone = true;
        OS.markDirty();
        scr.classList.add('hide');
        setTimeout(function () { scr.remove(); }, 300);
        OS.events.emit('apps-changed');
        OS.sound.play('startup');
        resolve();
      }

      go(0);
    });
  }

  OS.setup = { run: run };
})();
