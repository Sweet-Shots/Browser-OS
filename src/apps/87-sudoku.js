/* =====================================================================
   GAME: SUDOKU
   Puzzles are generated on the spot and always have exactly one
   solution. Notes, hints, mistake highlighting, keyboard support.
   Your game in progress is kept in the Nimbus file.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var LEVELS = { easy: { name: 'Easy', clues: 40 }, medium: { name: 'Medium', clues: 32 }, hard: { name: 'Hard', clues: 27 } };

  /* ---------- generator / solver (bitmask backtracking) ---------- */
  function boxOf(i) { return Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor(i % 9 / 3); }
  function candidates(g, i) {
    var used = 0, r = Math.floor(i / 9), c = i % 9, b = boxOf(i);
    for (var k = 0; k < 9; k++) {
      used |= 1 << g[r * 9 + k]; used |= 1 << g[k * 9 + c];
      var br = Math.floor(b / 3) * 3 + Math.floor(k / 3), bc = (b % 3) * 3 + k % 3;
      used |= 1 << g[br * 9 + bc];
    }
    var out = [];
    for (var n = 1; n <= 9; n++) if (!(used & (1 << n))) out.push(n);
    return out;
  }
  /** Count solutions up to `limit` (fills g with the first solution found when fill=true). */
  function solve(g, limit, shuffle) {
    var count = 0;
    (function rec() {
      if (count >= limit) return;
      var best = -1, bestC = null;
      for (var i = 0; i < 81; i++) {
        if (g[i]) continue;
        var c = candidates(g, i);
        if (!bestC || c.length < bestC.length) { best = i; bestC = c; if (c.length <= 1) break; }
      }
      if (best < 0) { count++; if (count === 1 && shuffle !== 'keep') solve.first = g.slice(); return; }
      if (shuffle === true) U.shuffle(bestC);
      for (var k = 0; k < bestC.length && count < limit; k++) { g[best] = bestC[k]; rec(); }
      g[best] = 0;
    })();
    return count;
  }
  function generate(level) {
    var full = new Array(81).fill(0);
    solve(full, 1, true);
    var solution = solve.first.slice();
    var puzzle = solution.slice(), order = U.shuffle(Array.from({ length: 81 }, function (_, i) { return i; }));
    var clues = 81, target = LEVELS[level].clues;
    for (var k = 0; k < order.length && clues > target; k++) {
      var i = order[k], keep = puzzle[i];
      puzzle[i] = 0;
      if (solve(puzzle.slice(), 2, 'keep') !== 1) puzzle[i] = keep; else clues--;
    }
    return { puzzle: puzzle, solution: solution };
  }
  OS.sudoku = { generate: generate, solve: solve };

  OS.registerApp({
    id: 'sudoku',
    name: 'Sudoku',
    icon: OS.appIcons.sudoku,
    optional: true,
    category: 'Games',
    description: 'Fresh number puzzles every time, each with exactly one solution. Three difficulties, pencil notes, hints, and your game is saved in the file.',
    keywords: 'numbers puzzle logic game',
    defaultSize: { w: 620, h: 700 },
    launch: function (win) {
      var save = win.getState({ level: 'easy', game: null, wins: { easy: 0, medium: 0, hard: 0 }, showErrors: true });
      var sel = -1, notesMode = false, timer = null;
      var gridEl = h('div', { class: 'sd-grid', role: 'grid', 'aria-label': 'Sudoku board' });
      var info = h('span', { class: 'sd-info muted small' });
      var levelSeg = h('div', { class: 'seg sd-levels' });
      var bNotes = h('button', { class: 'chip', type: 'button', title: 'Pencil notes (N)', onclick: function () { notesMode = !notesMode; renderPad(); } }, h('span', { html: OS.icons.edit }), 'Notes');
      var bErr = h('button', { class: 'chip', type: 'button', title: 'Highlight mistakes', onclick: function () { save.showErrors = !save.showErrors; render(); } }, h('span', { html: OS.icons.eye }), 'Mistakes');
      var pad = h('div', { class: 'sd-pad' });
      win.body.classList.add('app-sudoku');
      win.body.tabIndex = -1;
      win.body.append(h('div', { class: 'sd-top' }, levelSeg, h('span', { class: 'grow' }), info),
        h('div', { class: 'sd-board-wrap' }, gridEl),
        h('div', { class: 'sd-tools' }, bNotes, bErr,
          h('button', { class: 'chip', type: 'button', title: 'Reveal one cell', onclick: hint }, h('span', { html: OS.icons.lightbulb }), 'Hint'),
          h('button', { class: 'chip', type: 'button', title: 'Erase (Backspace)', onclick: function () { input(0); } }, h('span', { html: OS.icons.eraser }), 'Erase'),
          h('button', { class: 'chip', type: 'button', onclick: function () { newGame(save.level); } }, h('span', { html: OS.icons.refresh }), 'New')),
        pad);

      Object.keys(LEVELS).forEach(function (k) {
        levelSeg.appendChild(h('button', { class: 'seg-btn', type: 'button', dataset: { level: k }, onclick: async function () {
          if (save.game && !save.game.done && save.game.filled > 0 && !(await OS.dialogs.confirm('Start a new ' + LEVELS[k].name.toLowerCase() + ' puzzle? Your current game will be lost.', { title: 'New puzzle', okLabel: 'New puzzle' }))) return;
          newGame(k);
        } }, LEVELS[k].name));
      });
      var cells = [];
      for (var i = 0; i < 81; i++) {
        var c = h('button', { class: 'sd-cell', type: 'button', role: 'gridcell', tabindex: '-1', dataset: { i: String(i) } });
        if (i % 9 === 2 || i % 9 === 5) c.classList.add('br');
        if (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5) c.classList.add('bb');
        c.addEventListener('click', (function (k) { return function () { sel = k; render(); win.body.focus(); }; })(i));
        cells.push(c); gridEl.appendChild(c);
      }
      for (var n = 1; n <= 9; n++) pad.appendChild(h('button', { class: 'sd-num', type: 'button', dataset: { n: String(n) }, onclick: (function (k) { return function () { input(k); win.body.focus(); }; })(n) }, h('b', null, String(n)), h('small')));

      function newGame(level) {
        save.level = level;
        info.textContent = 'Generating…';
        setTimeout(function () {
          var p = generate(level);
          save.game = { puzzle: p.puzzle, solution: p.solution, values: p.puzzle.slice(), notes: new Array(81).fill(0), time: 0, done: false, hints: 0, filled: 0, mistakes: 0 };
          sel = p.puzzle.indexOf(0);
          startClock(); render();
        }, 10);
      }
      function startClock() {
        clearInterval(timer);
        timer = setInterval(function () { if (save.game && !save.game.done && OS.wm.focused === win) { save.game.time++; updInfo(); } }, 1000);
      }
      function updInfo() {
        var g = save.game; if (!g) return;
        var t = g.time;
        info.textContent = LEVELS[save.level].name + ' · ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + (g.mistakes ? ' · ' + g.mistakes + ' mistake' + (g.mistakes > 1 ? 's' : '') : '');
      }
      function input(n) {
        var g = save.game; if (!g || g.done || sel < 0 || g.puzzle[sel]) return;
        if (notesMode && n) {
          if (g.values[sel]) return;
          g.notes[sel] ^= 1 << n;
        } else {
          if (n && g.values[sel] === n) n = 0;           // tapping the same number clears it
          g.values[sel] = n; g.notes[sel] = 0;
          if (n) {
            g.filled++;
            if (n !== g.solution[sel]) { g.mistakes++; if (save.showErrors) OS.sound.play('error'); }
            else {
              // clear this number from notes in the same row, column and box
              var r = Math.floor(sel / 9), c = sel % 9, b = boxOf(sel);
              for (var k = 0; k < 81; k++) if (Math.floor(k / 9) === r || k % 9 === c || boxOf(k) === b) g.notes[k] &= ~(1 << n);
              OS.sound.play('click');
            }
          }
        }
        render(); checkWin();
      }
      function hint() {
        var g = save.game; if (!g || g.done) return;
        var target = sel >= 0 && !g.puzzle[sel] && g.values[sel] !== g.solution[sel] ? sel : -1;
        if (target < 0) { var empties = []; for (var i = 0; i < 81; i++) if (g.values[i] !== g.solution[i]) empties.push(i); if (!empties.length) return; target = empties[Math.floor(Math.random() * empties.length)]; }
        g.values[target] = g.solution[target]; g.notes[target] = 0; g.hints++; g.puzzle[target] = g.solution[target];   // hinted cells become fixed
        sel = target; OS.sound.play('pop'); render(); checkWin();
      }
      function checkWin() {
        var g = save.game;
        if (!g || g.done) return;
        for (var i = 0; i < 81; i++) if (g.values[i] !== g.solution[i]) return;
        g.done = true; save.wins[save.level] = (save.wins[save.level] || 0) + 1;
        win.setState(save);
        gridEl.classList.add('solved'); OS.sound.play('win');
        setTimeout(function () {
          OS.dialogs.modal({ title: 'Solved!', icon: 'trophy', body: LEVELS[save.level].name + ' puzzle in ' + Math.floor(g.time / 60) + ' min ' + g.time % 60 + ' s' + (g.hints ? ' with ' + g.hints + ' hint' + (g.hints > 1 ? 's' : '') : '') + '.\nPuzzles solved at this level: ' + save.wins[save.level],
            buttons: [{ label: 'Close', value: null }, { label: 'Next puzzle', value: 'new', primary: true }] }).then(function (v) { if (v === 'new') newGame(save.level); });
        }, 600);
      }
      function render() {
        var g = save.game; if (!g || win.closed) return;
        levelSeg.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('on', b.dataset.level === save.level); });
        bNotes.classList.toggle('on', notesMode); bErr.classList.toggle('on', save.showErrors);
        gridEl.classList.toggle('solved', g.done);
        var sv = sel >= 0 ? g.values[sel] : 0, sr = Math.floor(sel / 9), sc = sel % 9, sb = sel >= 0 ? boxOf(sel) : -1;
        cells.forEach(function (c, i) {
          var v = g.values[i];
          c.className = 'sd-cell' + (i % 9 === 2 || i % 9 === 5 ? ' br' : '') + (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5 ? ' bb' : '') +
            (g.puzzle[i] ? ' given' : '') + (i === sel ? ' sel' : '') +
            (sel >= 0 && i !== sel && (Math.floor(i / 9) === sr || i % 9 === sc || boxOf(i) === sb) ? ' peer' : '') +
            (sv && v === sv && i !== sel ? ' same' : '') +
            (save.showErrors && v && !g.puzzle[i] && v !== g.solution[i] ? ' wrong' : '');
          c.textContent = '';
          if (v) c.textContent = String(v);
          else if (g.notes[i]) {
            var nb = h('span', { class: 'sd-notes' });
            for (var n = 1; n <= 9; n++) nb.appendChild(h('i', null, g.notes[i] & (1 << n) ? String(n) : ''));
            c.appendChild(nb);
          }
          c.setAttribute('aria-label', 'Row ' + (Math.floor(i / 9) + 1) + ' column ' + (i % 9 + 1) + (v ? ', ' + v : ', empty'));
        });
        renderPad(); updInfo();
      }
      function renderPad() {
        var g = save.game; if (!g) return;
        bNotes.classList.toggle('on', notesMode);
        pad.classList.toggle('notes', notesMode);
        pad.querySelectorAll('.sd-num').forEach(function (b) {
          var n = +b.dataset.n, left = 9;
          g.values.forEach(function (v, i) { if (v === n && v === g.solution[i]) left--; });
          b.querySelector('small').textContent = left > 0 ? String(left) : '';
          b.disabled = left <= 0;
        });
      }
      win.body.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
        var k = e.key;
        if (/^[1-9]$/.test(k)) { e.preventDefault(); input(+k); }
        else if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); input(0); }
        else if (k === 'n' || k === 'N') { e.preventDefault(); notesMode = !notesMode; renderPad(); }
        else if (k.indexOf('Arrow') === 0) {
          e.preventDefault();
          if (sel < 0) sel = 0;
          var r = Math.floor(sel / 9), c = sel % 9;
          if (k === 'ArrowUp') r = (r + 8) % 9; else if (k === 'ArrowDown') r = (r + 1) % 9; else if (k === 'ArrowLeft') c = (c + 8) % 9; else c = (c + 1) % 9;
          sel = r * 9 + c; render();
        }
      });
      // fit the board to the window (width and height)
      var boardWrap = gridEl.parentNode;
      function fit() {
        var w = win.body.clientWidth - 32, hh = win.body.clientHeight - 210;
        var size = Math.max(220, Math.min(540, w, hh));
        boardWrap.style.width = size + 'px'; pad.style.width = size + 'px';
        win.body.querySelector('.sd-top').style.width = size + 'px';
      }
      if (window.ResizeObserver) { var ro = new ResizeObserver(fit); ro.observe(win.body); win.onDestroy(function () { ro.disconnect(); }); }
      fit();
      win.onDestroy(function () { clearInterval(timer); });
      if (save.game && !save.game.done) { sel = save.game.values.indexOf(0); startClock(); render(); }
      else newGame(save.level);
      setTimeout(function () { win.body.focus(); }, 0);
    }
  });
})();
