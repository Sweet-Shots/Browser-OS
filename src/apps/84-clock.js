/* =====================================================================
   APP: CLOCK (clock, alarms, timer, stopwatch)
   Alarms and the timer keep running when the window is closed, as long
   as Nimbus is open in the browser.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDur(ms, tenths) {
    ms = Math.max(0, ms);
    var t = Math.floor(ms / 1000), hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
    return (hh ? hh + ':' + pad(mm) : mm) + ':' + pad(ss) + (tenths ? '.' + Math.floor(ms % 1000 / 100) : '');
  }
  function alarmsState() { return OS.state ? OS.getAppState('clock', { alarms: [] }) : { alarms: [] }; }
  function fmtTime(hm) {
    var p = hm.split(':'), d = new Date(); d.setHours(+p[0], +p[1], 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !(OS.state && OS.state.settings.clock24) });
  }

  /* ---------- background service: alarms + timer ---------- */
  var svc = { timer: null, stopwatch: { running: false, start: 0, acc: 0, laps: [] }, lastMinute: '' };
  OS.clockService = svc;
  setInterval(function () {
    if (!OS.state) return;
    var now = new Date(), key = pad(now.getHours()) + ':' + pad(now.getMinutes());
    if (key !== svc.lastMinute) {
      svc.lastMinute = key;
      alarmsState().alarms.forEach(function (a) {
        if (!a.on || a.time !== key) return;
        if (a.days && a.days.length && a.days.indexOf(now.getDay()) < 0) return;
        if (!a.days || !a.days.length) { a.on = false; OS.markDirty(); }
        ring('Alarm', (a.label || 'Alarm') + ' · ' + fmtTime(a.time));
      });
    }
    if (svc.timer && svc.timer.running && Date.now() >= svc.timer.end) {
      svc.timer.running = false; svc.timer.left = 0;
      ring('Timer finished', fmtDur(svc.timer.total) + ' timer');
    }
  }, 1000);
  function ring(title, body) {
    OS.notify(title, body, { icon: 'alarm', sound: 'alarm', action: { label: 'Open Clock', run: function () { OS.launch('clock'); } } });
    var n = 0, iv = setInterval(function () { if (++n >= 3) clearInterval(iv); OS.sound.play('alarm'); }, 1600);
  }
  /** Next enabled alarm as text (shown on the desktop). */
  OS.clockNextAlarm = function () {
    if (!OS.state || !OS.isInstalled('clock')) return null;
    var list = alarmsState().alarms.filter(function (a) { return a.on; });
    if (!list.length) return null;
    var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), best = null, bestDelta = 1e9;
    list.forEach(function (a) {
      var p = a.time.split(':'), m = +p[0] * 60 + +p[1];
      for (var d = 0; d < 8; d++) {
        var day = (now.getDay() + d) % 7, delta = m - nowMin + d * 1440;
        if (delta <= 0) continue;
        if (a.days && a.days.length && a.days.indexOf(day) < 0) continue;
        if (delta < bestDelta) { bestDelta = delta; best = a; }
        break;
      }
    });
    return best ? 'Alarm ' + fmtTime(best.time) + (bestDelta > 1440 ? '' : bestDelta < 60 ? ' (in ' + bestDelta + ' min)' : '') : null;
  };

  OS.registerApp({
    id: 'clock',
    name: 'Clock',
    icon: OS.appIcons.clock,
    optional: true,
    category: 'Utilities',
    description: 'A clock, alarms, a timer and a stopwatch. Alarms ring while Nimbus is open, even with the Clock window closed.',
    keywords: 'alarm timer stopwatch time',
    singleInstance: true,
    defaultSize: { w: 560, h: 560 },
    launch: function (win, args) {
      var tab = args.tab || 'clock', tick = null;
      var tabsEl = h('div', { class: 'ck-tabs', role: 'tablist' });
      var page = h('div', { class: 'ck-page' });
      win.body.classList.add('app-clock');
      win.body.append(tabsEl, page);
      var TABS = [['clock', 'Clock', 'clock'], ['alarms', 'Alarms', 'alarm'], ['timer', 'Timer', 'timer'], ['stopwatch', 'Stopwatch', 'stopwatch']];

      function go(t) { tab = t; render(); }
      function render() {
        clearInterval(tick);
        tabsEl.textContent = '';
        TABS.forEach(function (t) {
          tabsEl.appendChild(h('button', { class: 'ck-tab' + (t[0] === tab ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(t[0] === tab), onclick: function () { go(t[0]); } },
            h('span', { html: OS.icons[t[2]] }), h('span', null, t[1])));
        });
        page.textContent = '';
        ({ clock: clockPage, alarms: alarmPage, timer: timerPage, stopwatch: swPage })[tab]();
      }

      /* ---- clock ---- */
      function clockPage() {
        var face = h('div', { class: 'ck-face' });
        var marks = '';
        for (var i = 0; i < 60; i++) {
          var a = i * 6 * Math.PI / 180, big = i % 5 === 0, r1 = big ? 84 : 89;
          marks += '<line x1="' + (100 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (100 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (100 + Math.sin(a) * 94).toFixed(1) + '" y2="' + (100 - Math.cos(a) * 94).toFixed(1) + '" stroke-width="' + (big ? 3 : 1.2) + '"/>';
        }
        face.innerHTML = '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="98" class="ck-bg"/><g class="ck-marks">' + marks + '</g>' +
          '<line class="ck-h" x1="100" y1="100" x2="100" y2="52"/><line class="ck-m" x1="100" y1="100" x2="100" y2="26"/><line class="ck-s" x1="100" y1="112" x2="100" y2="20"/><circle cx="100" cy="100" r="5" class="ck-dot"/></svg>';
        var digital = h('div', { class: 'ck-digital' }), date = h('div', { class: 'ck-date muted' });
        page.append(face, digital, date);
        function upd() {
          var d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, hr = d.getHours() % 12 + m / 60;
          face.querySelector('.ck-h').setAttribute('transform', 'rotate(' + hr * 30 + ' 100 100)');
          face.querySelector('.ck-m').setAttribute('transform', 'rotate(' + m * 6 + ' 100 100)');
          face.querySelector('.ck-s').setAttribute('transform', 'rotate(' + Math.floor(s) * 6 + ' 100 100)');
          digital.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: !OS.state.settings.clock24 });
          date.textContent = d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
        upd(); tick = setInterval(upd, 250);
      }

      /* ---- alarms ---- */
      function alarmPage() {
        var st = alarmsState(), list = h('div', { class: 'ck-alarms' });
        var DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        if (!st.alarms.length) list.appendChild(h('div', { class: 'ph-empty' }, h('span', { html: OS.icons.alarm }), h('b', null, 'No alarms'), h('span', null, 'Alarms ring while Nimbus is open in your browser.')));
        st.alarms.forEach(function (a, i) {
          var tg = h('input', { type: 'checkbox', class: 'switch', checked: !!a.on, 'aria-label': 'Alarm on' });
          tg.addEventListener('change', function () { a.on = tg.checked; OS.markDirty(); OS.shell.renderGlance(); render(); });
          var days = h('div', { class: 'ck-days' });
          DAYS.forEach(function (d, di) {
            var on = (a.days || []).indexOf(di) >= 0;
            days.appendChild(h('button', { class: 'ck-day' + (on ? ' on' : ''), type: 'button', title: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][di], 'aria-pressed': String(on),
              onclick: function () { a.days = a.days || []; if (on) a.days = a.days.filter(function (x) { return x !== di; }); else a.days.push(di); OS.markDirty(); render(); } }, d));
          });
          list.appendChild(h('div', { class: 'ck-alarm' + (a.on ? '' : ' off') },
            h('div', { class: 'ck-alarm-main' }, h('div', { class: 'ck-alarm-time' }, fmtTime(a.time)), h('div', { class: 'muted small' }, (a.label || 'Alarm') + ' · ' + (a.days && a.days.length ? 'Repeats' : 'Once')), days),
            tg, h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Delete alarm', html: OS.icons.trash, onclick: function () { st.alarms.splice(i, 1); OS.markDirty(); OS.shell.renderGlance(); render(); } })));
        });
        var timeIn = h('input', { class: 'input', type: 'time', value: '07:30', 'aria-label': 'Alarm time' });
        var labelIn = h('input', { class: 'input', type: 'text', placeholder: 'Label (optional)', maxlength: '40', 'aria-label': 'Alarm label' });
        var add = h('button', { class: 'btn primary', type: 'button', onclick: function () {
          if (!timeIn.value) return;
          st.alarms.push({ id: U.uid(4), time: timeIn.value.slice(0, 5), label: labelIn.value.trim(), on: true, days: [] });
          st.alarms.sort(function (x, y) { return x.time.localeCompare(y.time); });
          OS.markDirty(); OS.shell.renderGlance(); render();
          OS.toast('Alarm set for ' + fmtTime(timeIn.value.slice(0, 5)));
        } }, h('span', { html: OS.icons.plus }), 'Add alarm');
        page.append(list, h('div', { class: 'ck-add' }, timeIn, labelIn, add));
      }

      /* ---- timer ---- */
      function timerPage() {
        var t = svc.timer;
        var ring = h('div', { class: 'ck-ring' });
        ring.innerHTML = '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" class="ck-track"/><circle cx="100" cy="100" r="90" class="ck-prog" pathLength="1000"/></svg>';
        var label = h('div', { class: 'ck-ring-label' });
        ring.appendChild(label);
        page.appendChild(ring);
        var ctrls = h('div', { class: 'ck-ctrls' });
        page.appendChild(ctrls);
        if (!t || (!t.running && !t.left)) {
          var hIn = h('input', { class: 'input ck-num', type: 'number', min: '0', max: '23', value: '0', 'aria-label': 'Hours' });
          var mIn = h('input', { class: 'input ck-num', type: 'number', min: '0', max: '59', value: '5', 'aria-label': 'Minutes' });
          var sIn = h('input', { class: 'input ck-num', type: 'number', min: '0', max: '59', value: '0', 'aria-label': 'Seconds' });
          label.append(h('div', { class: 'ck-set' }, hIn, h('span', null, ':'), mIn, h('span', null, ':'), sIn), h('small', { class: 'muted' }, 'hours · minutes · seconds'));
          ring.classList.add('setup');
          var presets = h('div', { class: 'ck-presets' });
          [1, 3, 5, 10, 15, 25].forEach(function (mins) { presets.appendChild(h('button', { class: 'chip', type: 'button', onclick: function () { startTimer(mins * 60000); } }, mins + ' min')); });
          ctrls.append(presets, h('button', { class: 'btn primary', type: 'button', onclick: function () {
            var ms = ((+hIn.value || 0) * 3600 + (+mIn.value || 0) * 60 + (+sIn.value || 0)) * 1000;
            if (ms > 0) startTimer(ms);
          } }, h('span', { html: OS.icons.play }), 'Start'));
          return;
        }
        var prog = ring.querySelector('.ck-prog');
        function upd() {
          var left = t.running ? t.end - Date.now() : t.left;
          label.textContent = fmtDur(left + 999);
          prog.style.strokeDashoffset = String(1000 - Math.max(0, left) / t.total * 1000);
          if (t.running && left <= 0) render();
        }
        ctrls.append(
          h('button', { class: 'btn tonal', type: 'button', onclick: function () { svc.timer = null; render(); } }, 'Reset'),
          t.running ? h('button', { class: 'btn primary', type: 'button', onclick: function () { t.left = t.end - Date.now(); t.running = false; render(); } }, h('span', { html: OS.icons.pause }), 'Pause')
            : h('button', { class: 'btn primary', type: 'button', onclick: function () { t.end = Date.now() + t.left; t.running = true; render(); } }, h('span', { html: OS.icons.play }), 'Resume'),
          h('button', { class: 'btn tonal', type: 'button', onclick: function () { if (t.running) t.end += 60000; else t.left += 60000; t.total += 60000; upd(); } }, '+1 min'));
        upd(); tick = setInterval(upd, 200);
      }
      function startTimer(ms) { svc.timer = { total: ms, end: Date.now() + ms, running: true, left: ms }; OS.sound.play('pop'); render(); }

      /* ---- stopwatch ---- */
      function swPage() {
        var sw = svc.stopwatch;
        var big = h('div', { class: 'ck-sw' });
        var laps = h('div', { class: 'ck-laps' });
        function elapsed() { return sw.acc + (sw.running ? Date.now() - sw.start : 0); }
        function upd() { big.textContent = fmtDur(elapsed(), true); }
        function renderLaps() {
          laps.textContent = '';
          sw.laps.slice().reverse().forEach(function (l, i) {
            laps.appendChild(h('div', { class: 'ck-lap' }, h('span', null, 'Lap ' + (sw.laps.length - i)), h('span', { class: 'muted' }, '+' + fmtDur(l.split, true)), h('b', null, fmtDur(l.total, true))));
          });
        }
        var ctrls = h('div', { class: 'ck-ctrls' },
          sw.running ? h('button', { class: 'btn tonal', type: 'button', onclick: function () { var t = elapsed(), prev = sw.laps.length ? sw.laps[sw.laps.length - 1].total : 0; sw.laps.push({ total: t, split: t - prev }); renderLaps(); } }, h('span', { html: OS.icons.flag }), 'Lap')
            : h('button', { class: 'btn tonal', type: 'button', disabled: !elapsed(), onclick: function () { sw.acc = 0; sw.laps = []; render(); } }, 'Reset'),
          sw.running ? h('button', { class: 'btn primary', type: 'button', onclick: function () { sw.acc = elapsed(); sw.running = false; render(); } }, h('span', { html: OS.icons.pause }), 'Stop')
            : h('button', { class: 'btn primary', type: 'button', onclick: function () { sw.start = Date.now(); sw.running = true; render(); } }, h('span', { html: OS.icons.play }), 'Start'));
        page.append(big, ctrls, laps);
        upd(); renderLaps();
        if (sw.running) tick = setInterval(upd, 50);
      }

      win.onDestroy(function () { clearInterval(tick); });
      win._onRelaunch = function (a) { if (a.tab) go(a.tab); };
      render();
    }
  });
})();
