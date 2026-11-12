/* =====================================================================
   GAME: SOLITAIRE (Klondike rules, a traditional card game)
   Drag cards with mouse or touch. Tap/click a card to send it to the
   best legal spot. Draw 1 or 3. Undo. Auto-finish.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var SUITS = ['♠', '♥', '♦', '♣'], RED = [false, true, true, false];
  var RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  function suit(id) { return Math.floor(id / 13); }
  function rank(id) { return id % 13 + 1; }
  function red(id) { return RED[suit(id)]; }

  OS.registerApp({
    id: 'solitaire',
    name: 'Solitaire',
    icon: OS.appIcons.solitaire,
    optional: true,
    category: 'Games',
    description: 'The classic patience card game. Build the four suits from Ace to King. Drag cards, or just tap one to send it where it fits. Draw one or three.',
    keywords: 'cards klondike patience game',
    defaultSize: { w: 900, h: 640 },
    launch: function (win) {
      var stats = win.getState({ played: 0, won: 0, best: 0, draw: 1 });
      var g, undoStack = [], started = 0, moves = 0, timer = null, finished = false;
      var board = h('div', { class: 'so-board' });
      var info = h('span', { class: 'so-info' });
      var drawSel = h('button', { class: 'chip', type: 'button', title: 'Cards drawn from the stock', onclick: function () { stats.draw = stats.draw === 1 ? 3 : 1; drawSel.textContent = 'Draw ' + stats.draw; newGame(); } }, 'Draw ' + stats.draw);
      var bUndo = h('button', { class: 'btn text small', type: 'button', onclick: function () { undo(); } }, h('span', { html: OS.icons.undo }), 'Undo');
      var bAuto = h('button', { class: 'btn tonal small', type: 'button', hidden: true, onclick: function () { autoFinish(); } }, h('span', { html: OS.icons.sparkle }), 'Finish');
      var bar = h('div', { class: 'toolbar so-bar' },
        h('button', { class: 'btn tonal small', type: 'button', onclick: function () { newGame(); } }, h('span', { html: OS.icons.refresh }), 'New game'),
        bUndo, drawSel, bAuto, h('span', { class: 'grow' }), info);
      win.body.classList.add('app-solitaire');
      win.body.append(bar, board);

      // card elements are created once and positioned on every render
      var els = [];
      for (var i = 0; i < 52; i++) {
        var r = rank(i), s = SUITS[suit(i)];
        var face = h('div', { class: 'so-face' + (red(i) ? ' red' : '') },
          h('span', { class: 'so-corner tl' }, h('b', null, RANKS[r]), h('i', null, s)),
          h('span', { class: 'so-center' + (r > 10 ? ' court' : '') }, r > 10 ? RANKS[r] : s),
          h('span', { class: 'so-corner br' }, h('b', null, RANKS[r]), h('i', null, s)));
        var el = h('div', { class: 'so-card', dataset: { id: String(i) }, 'aria-label': RANKS[r] + ' of ' + ['spades', 'hearts', 'diamonds', 'clubs'][suit(i)] }, face, h('div', { class: 'so-back' }));
        els.push(el); board.appendChild(el);
      }
      var slots = [];
      function slot(cls) { var s = h('div', { class: 'so-slot ' + cls }); board.insertBefore(s, board.firstChild); slots.push(s); return s; }
      var stockSlot = slot('stock'), wasteSlot = slot('waste'), fSlots = [0, 1, 2, 3].map(function (k) { var s = slot('found'); s.textContent = SUITS[k]; return s; }), tSlots = [0, 1, 2, 3, 4, 5, 6].map(function () { return slot('tab'); });
      stockSlot.innerHTML = OS.icons.refresh;
      stockSlot.addEventListener('click', function () { draw(); });

      function newGame() {
        if (g && moves > 0 && !finished) stats.played++;
        var deck = U.shuffle(Array.from({ length: 52 }, function (_, k) { return k; }));
        g = { stock: [], waste: [], f: [[], [], [], []], t: [[], [], [], [], [], [], []], up: {} };
        for (var c = 0; c < 7; c++) for (var k = c; k < 7; k++) { var id = deck.pop(); g.t[k].push(id); if (k === c) g.up[id] = true; }
        g.stock = deck;
        undoStack = []; moves = 0; started = 0; finished = false;
        clearInterval(timer); timer = setInterval(updInfo, 1000);
        board.classList.remove('won');
        render(true);
      }
      function snap() { undoStack.push(JSON.stringify(g)); if (undoStack.length > 200) undoStack.shift(); }
      function undo() { var s = undoStack.pop(); if (!s) return; g = JSON.parse(s); moves++; render(); }
      function begin() { if (!started) started = Date.now(); }
      function elapsed() { return started ? Date.now() - started : 0; }
      function updInfo() {
        var t = Math.floor(elapsed() / 1000);
        info.textContent = moves + ' moves · ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + (stats.won ? '  ·  won ' + stats.won + '/' + Math.max(stats.played, stats.won) : '');
        bUndo.disabled = !undoStack.length;
      }

      /* ---- rules ---- */
      function canFound(id, fi) {
        var f = g.f[fi];
        if (!f.length) return rank(id) === 1 && suit(id) === fi;
        var top = f[f.length - 1];
        return suit(id) === suit(top) && rank(id) === rank(top) + 1;
      }
      function canTab(id, ti) {
        var t = g.t[ti];
        if (!t.length) return rank(id) === 13;
        var top = t[t.length - 1];
        return g.up[top] && red(top) !== red(id) && rank(top) === rank(id) + 1;
      }
      function locate(id) {
        if (g.waste.indexOf(id) >= 0) return { pile: 'waste', arr: g.waste, idx: g.waste.indexOf(id) };
        for (var i = 0; i < 4; i++) if (g.f[i].indexOf(id) >= 0) return { pile: 'f', n: i, arr: g.f[i], idx: g.f[i].indexOf(id) };
        for (var j = 0; j < 7; j++) if (g.t[j].indexOf(id) >= 0) return { pile: 't', n: j, arr: g.t[j], idx: g.t[j].indexOf(id) };
        return { pile: 'stock', arr: g.stock, idx: g.stock.indexOf(id) };
      }
      function movable(loc) {
        if (loc.pile === 'stock') return false;
        if (loc.pile === 'waste' || loc.pile === 'f') return loc.idx === loc.arr.length - 1;
        return !!g.up[loc.arr[loc.idx]];
      }
      /** Try to move cards starting at loc to a destination {pile:'f'|'t', n}. */
      function tryMove(loc, dest) {
        var ids = loc.arr.slice(loc.idx), lead = ids[0];
        if (dest.pile === 'f') { if (ids.length !== 1 || !canFound(lead, dest.n)) return false; }
        else if (dest.pile === 't') { if (loc.pile === 't' && loc.n === dest.n) return false; if (!canTab(lead, dest.n)) return false; }
        else return false;
        snap(); begin();
        loc.arr.splice(loc.idx);
        var target = dest.pile === 'f' ? g.f[dest.n] : g.t[dest.n];
        ids.forEach(function (x) { target.push(x); });
        moves++;
        flipTops();
        OS.sound.play('click');
        return true;
      }
      function flipTops() { g.t.forEach(function (t) { if (t.length && !g.up[t[t.length - 1]]) g.up[t[t.length - 1]] = true; }); }
      function draw() {
        if (finished) return;
        snap(); begin();
        if (!g.stock.length) {
          if (!g.waste.length) { undoStack.pop(); return; }
          g.stock = g.waste.reverse(); g.waste = [];
          g.stock.forEach(function (id) { g.up[id] = false; });
        } else {
          for (var k = 0; k < stats.draw && g.stock.length; k++) { var id = g.stock.pop(); g.up[id] = true; g.waste.push(id); }
        }
        moves++; OS.sound.play('click'); render();
      }
      /** Click/tap: send a card to the best legal place. */
      function smartMove(id) {
        var loc = locate(id);
        if (!movable(loc)) return false;
        if (loc.idx === loc.arr.length - 1 && loc.pile !== 'f') for (var i = 0; i < 4; i++) if (tryMove(loc, { pile: 'f', n: i })) return true;
        var order = [0, 1, 2, 3, 4, 5, 6].sort(function (a, b) { return (g.t[b].length ? 1 : 0) - (g.t[a].length ? 1 : 0); });
        for (var j = 0; j < order.length; j++) if (tryMove(loc, { pile: 't', n: order[j] })) return true;
        return false;
      }
      function canAutoFinish() { return !g.stock.length && !g.waste.length && g.t.every(function (t) { return t.every(function (id) { return g.up[id]; }); }); }
      function autoFinish() {
        bAuto.disabled = true;
        (function stepAuto() {
          if (finished) return;
          for (var j = 0; j < 7; j++) {
            var t = g.t[j]; if (!t.length) continue;
            var id = t[t.length - 1], loc = locate(id);
            for (var i = 0; i < 4; i++) if (tryMove(loc, { pile: 'f', n: i })) { render(); setTimeout(stepAuto, 90); return; }
          }
        })();
      }
      function checkWin() {
        if (finished || g.f.some(function (f) { return f.length !== 13; })) return;
        finished = true; clearInterval(timer);
        var t = elapsed();
        stats.played++; stats.won++;
        var best = !stats.best || t < stats.best;
        if (best) stats.best = t;
        win.setState(stats);
        board.classList.add('won');
        OS.sound.play('win');
        setTimeout(function () {
          OS.dialogs.modal({ title: 'You won!', icon: 'trophy', body: 'Finished in ' + Math.round(t / 1000) + ' seconds with ' + moves + ' moves.' + (best ? ' That is your best time!' : '') + '\nGames won: ' + stats.won,
            buttons: [{ label: 'Close', value: null }, { label: 'New game', value: 'new', primary: true }] }).then(function (v) { if (v === 'new') newGame(); });
        }, 700);
      }

      /* ---- layout & render ---- */
      var L = {};
      function layout() {
        var W = board.clientWidth, H = board.clientHeight;
        var gap = Math.max(6, Math.min(18, W * 0.015));
        var cw = Math.min(110, (W - gap * 8) / 7, (H - gap * 3) / 1.4 / 2.4);
        cw = Math.max(36, cw);
        L = { gap: gap, cw: cw, ch: cw * 1.4, W: W, H: H };
        L.x = function (col) { return (W - (cw * 7 + gap * 6)) / 2 + col * (cw + gap); };
        L.ty = gap * 2 + L.ch;
        board.style.setProperty('--cw', cw + 'px');
      }
      function place(el, x, y, z) { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; el.style.zIndex = z; }
      function render(deal) {
        if (win.closed) return;
        layout();
        var cw = L.cw, ch = L.ch, gap = L.gap;
        [stockSlot, wasteSlot].concat(fSlots, tSlots).forEach(function (s) { s.style.width = cw + 'px'; s.style.height = ch + 'px'; });
        place(stockSlot, L.x(0), gap, 0); place(wasteSlot, L.x(1), gap, 0);
        fSlots.forEach(function (s, i) { place(s, L.x(3 + i), gap, 0); });
        tSlots.forEach(function (s, i) { place(s, L.x(i), L.ty, 0); });
        var z = 1;
        function show(id, x, y, up) {
          var el = els[id];
          el.classList.toggle('up', !!up);
          el.style.width = cw + 'px'; el.style.height = ch + 'px';
          place(el, x, y, z++);
        }
        g.stock.forEach(function (id, i) { show(id, L.x(0) + Math.min(i, 3) * 0.6, gap - Math.min(i, 3) * 0.6, false); });
        var wFan = stats.draw === 3 ? cw * 0.24 : 0, wv = g.waste.length;
        g.waste.forEach(function (id, i) { var k = Math.max(0, i - Math.max(0, wv - 3)); show(id, L.x(1) + k * wFan, gap, true); });   // draw-3 fans out the top three
        g.f.forEach(function (f, fi) { f.forEach(function (id) { show(id, L.x(3 + fi), gap, true); }); });
        g.t.forEach(function (t, ti) {
          var downOff = ch * 0.13, upOff = ch * 0.27, need = 0;
          t.forEach(function (id, i) { if (i < t.length - 1) need += g.up[id] ? upOff : downOff; });
          var avail = L.H - L.ty - ch - gap, k = need > avail && need > 0 ? avail / need : 1, y = L.ty;
          t.forEach(function (id) { show(id, L.x(ti), y, g.up[id]); y += (g.up[id] ? upOff : downOff) * k; });
          tSlots[ti].dataset.bottom = String(y + ch);
        });
        stockSlot.classList.toggle('empty', !g.stock.length);
        board.classList.toggle('dealing', !!deal);
        if (deal) setTimeout(function () { board.classList.remove('dealing'); }, 500);
        bAuto.hidden = !canAutoFinish() || finished;
        bAuto.disabled = false;
        updInfo();
        checkWin();
      }

      /* ---- pointer interaction ---- */
      board.addEventListener('pointerdown', function (e) {
        var el = e.target.closest('.so-card'); if (!el || e.button !== 0 || finished) return;
        var id = +el.dataset.id, loc = locate(id);
        if (loc.pile === 'stock') { draw(); return; }
        if (!movable(loc)) return;
        e.preventDefault();
        var group = loc.arr.slice(loc.idx).map(function (x) { return els[x]; });
        var br = board.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, moved = false;
        var origin = group.map(function (g2) { var m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(g2.style.transform); return { x: +m[1], y: +m[2] }; });
        el.setPointerCapture(e.pointerId);
        function move(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
          if (!moved) { moved = true; board.classList.add('dragging'); group.forEach(function (c) { c.classList.add('lift'); }); }
          group.forEach(function (c, i) { c.style.transform = 'translate(' + (origin[i].x + dx) + 'px,' + (origin[i].y + dy) + 'px)'; c.style.zIndex = 1000 + i; });
        }
        function up(ev) {
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
          board.classList.remove('dragging'); group.forEach(function (c) { c.classList.remove('lift'); });
          if (!moved) { if (!smartMove(id)) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } render(); return; }
          // drop target: whichever pile the lead card's center is over
          var cx = origin[0].x + (ev.clientX - sx) + L.cw / 2, cy = origin[0].y + (ev.clientY - sy) + L.ch / 2, done = false;
          if (cy < L.ty - L.gap / 2) {
            for (var i = 0; i < 4 && !done; i++) { var fx = L.x(3 + i); if (cx > fx - L.gap && cx < fx + L.cw + L.gap) done = tryMove(locate(id), { pile: 'f', n: i }); }
          } else {
            for (var j = 0; j < 7 && !done; j++) { var tx = L.x(j); if (cx > tx - L.gap / 2 && cx < tx + L.cw + L.gap / 2) done = tryMove(locate(id), { pile: 't', n: j }); }
          }
          void br;
          render();
        }
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
      board.addEventListener('dblclick', function (e) { var el = e.target.closest('.so-card'); if (el) { var loc = locate(+el.dataset.id); for (var i = 0; i < 4; i++) if (tryMove(loc, { pile: 'f', n: i })) { render(); return; } } });
      win.body.tabIndex = -1;
      win.body.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        else if (e.key === ' ' && e.target === win.body) { e.preventDefault(); draw(); }
      });
      win.onResize(function () { render(); });
      if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (g) render(); }); ro.observe(board); win.onDestroy(function () { ro.disconnect(); }); }
      win.onDestroy(function () { clearInterval(timer); });
      setTimeout(newGame, 0);
    }
  });
})();
