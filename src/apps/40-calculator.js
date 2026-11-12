/* =====================================================================
   APP: CALCULATOR (own expression parser, no eval)
   Grammar (precedence low -> high):
     expr    := term (('+' | '-') term)*
     term    := unary (('*' | '/') unary | implicit '(' unary)*
     unary   := ('-' | '+') unary | power
     power   := postfix ('^' unary)?          (right-associative, -2^2 = -4)
     postfix := primary '%'*                  (50% = 0.5)
     primary := number | '(' expr ')'
   ===================================================================== */
(function () {
  'use strict';
  var h = OS.util.h;

  function tokenize(s) {
    var out = [], i = 0;
    s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        var m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
        if (!m) throw new Error('Bad number');
        out.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if ('+-*/^%()'.indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      throw new Error('Unexpected "' + c + '"');
    }
    return out;
  }

  function evaluate(src) {
    var tk = tokenize(src), p = 0;
    function peek() { return tk[p] && tk[p].t; }
    function eat(t) { if (peek() !== t) throw new Error('Expected ' + t); p++; }
    function expr() {
      var v = term();
      while (peek() === '+' || peek() === '-') { var op = tk[p++].t, r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    function term() {
      var v = unary();
      for (;;) {
        var t = peek();
        if (t === '*' || t === '/') {
          p++; var r = unary();
          if (t === '/' && r === 0) throw new Error('Cannot divide by zero');
          v = t === '*' ? v * r : v / r;
        } else if (t === '(') { v = v * unary(); }       // implicit multiplication: 2(3)
        else return v;
      }
    }
    function unary() {
      if (peek() === '-') { p++; return -unary(); }
      if (peek() === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      var b = postfix();
      if (peek() === '^') { p++; return Math.pow(b, unary()); }
      return b;
    }
    function postfix() { var v = primary(); while (peek() === '%') { p++; v = v / 100; } return v; }
    function primary() {
      var t = tk[p];
      if (!t) throw new Error('Incomplete expression');
      if (t.t === 'n') { p++; return t.v; }
      if (t.t === '(') { p++; var v = expr(); eat(')'); return v; }
      throw new Error('Unexpected "' + t.t + '"');
    }
    if (!tk.length) return 0;
    var v = expr();
    if (p < tk.length) throw new Error('Unexpected "' + tk[p].t + '"');
    if (!isFinite(v)) throw new Error('Result is too large');
    return v;
  }
  function format(v) {
    if (Object.is(v, -0)) v = 0;
    var r = parseFloat(v.toPrecision(12));
    return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-9 && r !== 0) ? r.toExponential(8).replace(/\.?0+e/, 'e') : String(r);
  }
  OS.calc = { evaluate: evaluate, format: format };

  OS.registerApp({
    id: 'calculator',
    name: 'Calculator',
    icon: OS.appIcons.calculator,
    defaultSize: { w: 320, h: 470 },
    launch: function (win) {
      var expr = '', justEvaluated = false;
      var exprEl = h('div', { class: 'calc-expr', 'aria-live': 'polite' });
      var resEl = h('div', { class: 'calc-res' });
      var keys = [
        ['C', 'clear'], ['(', '('], [')', ')'], ['⌫', 'back'],
        ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '/'],
        ['4', '4'], ['5', '5'], ['6', '6'], ['×', '*'],
        ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-'],
        ['0', '0'], ['.', '.'], ['%', '%'], ['+', '+'],
        ['x^y', '^'], ['=', '=']
      ];
      var pad = h('div', { class: 'calc-pad' });
      keys.forEach(function (k) {
        var cls = 'calc-key' + (/[\/*\-+^%()]/.test(k[1]) ? ' op' : '') + (k[1] === '=' ? ' eq' : '') + (k[1] === 'clear' || k[1] === 'back' ? ' fn' : '');
        pad.appendChild(h('button', { class: cls, type: 'button', tabindex: '-1', onclick: function () { press(k[1]); win.body.focus(); } }, k[0]));
      });
      win.body.classList.add('app-calc');
      win.body.append(h('div', { class: 'calc-display' }, exprEl, resEl), pad);

      function show() {
        exprEl.textContent = expr.replace(/\*/g, '×').replace(/\//g, '÷') || '0';
        if (justEvaluated) return;
        try { resEl.textContent = expr ? '= ' + format(evaluate(expr)) : ''; resEl.classList.remove('err'); }
        catch (e) { resEl.textContent = ''; }
      }
      function press(k) {
        if (k === 'clear') { expr = ''; justEvaluated = false; resEl.textContent = ''; }
        else if (k === 'back') { expr = expr.slice(0, -1); justEvaluated = false; }
        else if (k === '=') {
          try { var v = format(evaluate(expr)); resEl.textContent = expr + ' ='; resEl.classList.remove('err'); expr = v; justEvaluated = true; exprEl.textContent = v; return; }
          catch (e) { resEl.textContent = e.message; resEl.classList.add('err'); justEvaluated = true; return; }
        } else {
          if (justEvaluated && /[0-9.(]/.test(k)) expr = '';
          justEvaluated = false;
          expr += k;
        }
        show();
      }
      win.body.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var k = e.key;
        if (/^[0-9.+\-*/^%()]$/.test(k)) { e.preventDefault(); press(k); }
        else if (k === 'x' || k === 'X') { e.preventDefault(); press('*'); }
        else if (k === 'Enter' || k === '=') { e.preventDefault(); press('='); }
        else if (k === 'Backspace') { e.preventDefault(); press('back'); }
        else if (k === 'Escape' || k === 'Delete') { e.preventDefault(); press('clear'); }
      });
      win.el.addEventListener('pointerdown', function () { setTimeout(function () { if (!win.body.contains(document.activeElement) || document.activeElement === document.body) win.body.focus(); }, 0); });
      show();
      setTimeout(function () { win.body.focus(); }, 0);
    }
  });
})();
