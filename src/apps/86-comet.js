/* =====================================================================
   GAME: COMET
   Steer a comet through space and collect stardust; every piece makes
   your tail longer and you a little faster. Golden stars are worth 5
   but fade away. Don't hit your own tail (or the edge, in Classic).
   Arrow keys / WASD, swipe on touch screens, Space to pause.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var COLS = 28, ROWS = 18;

  OS.registerApp({
    id: 'comet',
    name: 'Comet',
    icon: OS.appIcons.comet,
    optional: true,
    category: 'Games',
    description: 'Steer a comet through space, collect stardust and grow your tail without crashing into it. Golden stars are worth extra, but fade fast. Two modes, keyboard or swipe.',
    keywords: 'snake arcade game',
    defaultSize: { w: 760, h: 560 },
    launch: function (win) {
      var save = win.getState({ best: { classic: 0, wrap: 0 }, mode: 'wrap' });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var canvas = h('canvas', { class: 'cm-canvas', 'aria-label': 'Comet game' });
      var ctx = canvas.getContext('2d');
      var hud = h('div', { class: 'cm-hud' });
      var overlay = h('div', { class: 'cm-overlay' });
      var wrap = h('div', { class: 'cm-wrap' }, canvas, hud, overlay);
      win.body.classList.add('app-comet');
      win.body.tabIndex = -1;
      win.body.append(wrap);

      var s = null, cell = 20, ox = 0, oy = 0, stars = null, raf = 0, last = 0, acc = 0, particles = [];

      function reset() {
        var cx = Math.floor(COLS / 3), cy = Math.floor(ROWS / 2);
        s = { body: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }], dir: { x: 1, y: 0 }, queue: [], score: 0, speed: 135, food: null, bonus: null, eaten: 0, status: 'ready', mode: save.mode };
        s.food = freeCell();
      }
      function freeCell() {
        for (var tries = 0; tries < 500; tries++) {
          var p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
          if (!s.body.some(function (b) { return b.x === p.x && b.y === p.y; }) && !(s.food && s.food.x === p.x && s.food.y === p.y)) return p;
        }
        return { x: 0, y: 0 };
      }
      function resize() {
        var r = wrap.getBoundingClientRect();
        cell = Math.max(8, Math.floor(Math.min(r.width / COLS, r.height / ROWS)));
        var W = cell * COLS, H = cell * ROWS;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ox = 0; oy = 0;
        // static star field
        stars = document.createElement('canvas'); stars.width = W * dpr; stars.height = H * dpr;
        var sc = stars.getContext('2d'); sc.scale(dpr, dpr);
        var g = sc.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#1c0f33');
        sc.fillStyle = g; sc.fillRect(0, 0, W, H);
        for (var i = 0; i < 140; i++) { sc.globalAlpha = 0.25 + Math.random() * 0.6; sc.fillStyle = '#fff'; sc.beginPath(); sc.arc(Math.random() * W, Math.random() * H, Math.random() * 1.3, 0, 7); sc.fill(); }
        sc.globalAlpha = 1;
        draw(performance.now());
      }

      function setDir(x, y) {
        if (!s || s.status === 'over') return;
        if (s.status === 'ready' || s.status === 'paused') start();
        var lastDir = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
        if (lastDir.x === -x && lastDir.y === -y) return;          // no instant reversal
        if (lastDir.x === x && lastDir.y === y) return;
        if (s.queue.length < 3) s.queue.push({ x: x, y: y });
      }
      function start() {
        if (s.status === 'over') reset();
        s.status = 'playing'; overlay.hidden = true;
        last = performance.now(); acc = 0;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
        win.body.focus();
      }
      function pause() { if (s.status !== 'playing') return; s.status = 'paused'; showOverlay(); }

      function step() {
        if (s.queue.length) s.dir = s.queue.shift();
        var head = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
        if (s.mode === 'wrap') { head.x = (head.x + COLS) % COLS; head.y = (head.y + ROWS) % ROWS; }
        else if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return gameOver();
        var grow = head.x === s.food.x && head.y === s.food.y;
        var bonus = s.bonus && head.x === s.bonus.x && head.y === s.bonus.y;
        var bodyToCheck = grow ? s.body : s.body.slice(0, -1);
        if (bodyToCheck.some(function (b) { return b.x === head.x && b.y === head.y; })) return gameOver();
        s.body.unshift(head);
        if (grow) {
          s.score += 1; s.eaten++; s.speed = Math.max(62, s.speed - 2.5);
          burst(head, '#9fe8ff'); OS.sound.play('pop');
          s.food = freeCell();
          if (!s.bonus && s.eaten % 5 === 0) s.bonus = Object.assign(freeCell(), { until: performance.now() + 6000 });
        } else s.body.pop();
        if (bonus) { s.score += 5; burst(head, '#ffd75e'); OS.sound.play('success'); s.bonus = null; for (var i = 0; i < 2; i++) s.body.push(Object.assign({}, s.body[s.body.length - 1])); }
      }
      function gameOver() {
        s.status = 'over';
        burst(s.body[0], '#ff7a8a');
        var best = save.best[s.mode] || 0;
        s.newBest = s.score > best;
        if (s.newBest) { save.best[s.mode] = s.score; win.setState(save); }
        OS.sound.play(s.newBest && s.score > 0 ? 'win' : 'lose');
        setTimeout(showOverlay, 450);
      }
      function burst(p, color) {
        for (var i = 0; i < 18; i++) {
          var a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 120;
          particles.push({ x: (p.x + 0.5) * cell, y: (p.y + 0.5) * cell, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: color });
        }
      }
      function loop(t) {
        var dt = Math.min(100, t - last); last = t;
        if (s.status === 'playing') {
          acc += dt;
          while (acc >= s.speed && s.status === 'playing') { acc -= s.speed; step(); }
          if (s.bonus && t > s.bonus.until) s.bonus = null;
        }
        particles.forEach(function (p) { p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt / 700; });
        particles = particles.filter(function (p) { return p.life > 0; });
        draw(t);
        if (s.status === 'playing' || particles.length) raf = requestAnimationFrame(loop);
      }
      function sparkle(x, y, r, color, rot) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
        ctx.fillStyle = color; ctx.beginPath();
        for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr = i % 2 ? r * 0.38 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      function draw(t) {
        if (!stars || !s) return;
        var W = cell * COLS, H = cell * ROWS;
        ctx.drawImage(stars, 0, 0, W, H);
        // food
        var pulse = 1 + Math.sin(t / 180) * 0.15;
        ctx.shadowColor = '#9fe8ff'; ctx.shadowBlur = 14;
        sparkle((s.food.x + 0.5) * cell, (s.food.y + 0.5) * cell, cell * 0.42 * pulse, '#c9f4ff', t / 900);
        if (s.bonus) {
          var left = Math.max(0, (s.bonus.until - t) / 6000);
          ctx.shadowColor = '#ffd75e';
          sparkle((s.bonus.x + 0.5) * cell, (s.bonus.y + 0.5) * cell, cell * 0.55 * pulse, '#ffd75e', -t / 700);
          ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,215,94,.6)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc((s.bonus.x + 0.5) * cell, (s.bonus.y + 0.5) * cell, cell * 0.75, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); ctx.stroke();
        }
        // tail, from end to head
        var n = s.body.length;
        for (var i = n - 1; i >= 0; i--) {
          var b = s.body[i], k = 1 - i / Math.max(n, 6);
          var hueA = 190 + (1 - k) * 90;
          ctx.shadowBlur = i === 0 ? 22 : 8; ctx.shadowColor = 'hsla(' + hueA + ',100%,70%,.9)';
          ctx.fillStyle = 'hsla(' + hueA + ',95%,' + (60 + k * 25) + '%,' + (0.25 + k * 0.75) + ')';
          ctx.beginPath(); ctx.arc((b.x + 0.5) * cell, (b.y + 0.5) * cell, cell * (0.22 + k * 0.26), 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        var hd = s.body[0];
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((hd.x + 0.5) * cell, (hd.y + 0.5) * cell, cell * 0.22, 0, Math.PI * 2); ctx.fill();
        particles.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); });
        ctx.globalAlpha = 1;
        if (s.mode === 'classic') { ctx.strokeStyle = 'rgba(160,190,255,.35)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2); }
        hud.textContent = '';
        hud.append(h('span', null, h('b', null, String(s.score)), ' stardust'), h('span', null, 'Best ' + (save.best[s.mode] || 0)));
      }

      function showOverlay() {
        overlay.hidden = false; overlay.textContent = '';
        var modes = h('div', { class: 'seg cm-modes' });
        [['wrap', 'Drift', 'Fly through the edges'], ['classic', 'Classic', 'The edges are walls']].forEach(function (m) {
          modes.appendChild(h('button', { class: 'seg-btn' + (save.mode === m[0] ? ' on' : ''), type: 'button', title: m[2], onclick: function () { save.mode = m[0]; reset(); showOverlay(); draw(performance.now()); } }, m[1]));
        });
        var title, sub, btn;
        if (s.status === 'over') { title = s.newBest && s.score ? 'New best!' : 'Crashed'; sub = s.score + ' stardust · best ' + (save.best[s.mode] || 0); btn = 'Play again'; }
        else if (s.status === 'paused') { title = 'Paused'; sub = 'Press Space or tap to continue'; btn = 'Resume'; }
        else { title = 'Comet'; sub = 'Collect stardust and grow your tail. Arrow keys, WASD or swipe.'; btn = 'Start'; }
        var go = h('button', { class: 'btn primary', type: 'button', onclick: function () { if (s.status === 'over') reset(); start(); } }, h('span', { html: OS.icons.play }), btn);
        overlay.append(h('div', { class: 'cm-card' }, h('h2', null, title), h('p', null, sub), s.status !== 'paused' ? modes : null, go));
        setTimeout(function () { go.focus(); }, 30);
      }

      win.body.addEventListener('keydown', function (e) {
        var k = e.key.toLowerCase();
        var map = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
        if (map[k]) { e.preventDefault(); setDir(map[k][0], map[k][1]); }
        else if (k === ' ' || k === 'p') {
          if (e.target.tagName === 'BUTTON' && k === ' ') return;
          e.preventDefault();
          if (s.status === 'playing') pause(); else { if (s.status === 'over') reset(); start(); }
        }
      });
      var sw = null;
      canvas.addEventListener('pointerdown', function (e) { sw = { x: e.clientX, y: e.clientY }; win.body.focus(); });
      canvas.addEventListener('pointerup', function (e) {
        if (!sw) return;
        var dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { if (s.status === 'playing') pause(); return; }
        if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0); else setDir(0, dy > 0 ? 1 : -1);
      });
      canvas.style.touchAction = 'none';
      // pause when the window loses focus
      var off = OS.wm.events.on('change', function () { if (OS.wm.focused !== win && s && s.status === 'playing') pause(); });
      win.onDestroy(function () { off(); cancelAnimationFrame(raf); });
      if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(wrap); win.onDestroy(function () { ro.disconnect(); }); }
      reset(); setTimeout(function () { resize(); showOverlay(); }, 0);
    }
  });
})();
