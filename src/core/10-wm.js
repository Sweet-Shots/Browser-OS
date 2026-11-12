/* =====================================================================
   CORE 10: WINDOW MANAGER
   Pointer Events + pointer capture for drag/resize (mouse, pen, touch).
   Windows are kept reachable: the title bar can never leave the screen.
   Drag a window to the left/right edge to snap it to half the screen,
   or to the top edge to maximize it.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var MIN_W = 220, MIN_H = 140, KEEP_VISIBLE = 96, NARROW = 700;

  var wm = {
    windows: [],          // in creation order
    focused: null,
    z: 10,
    events: new U.Emitter(),
    layer: null,

    mount: function (layerEl) {
      this.layer = layerEl;
      this.snapPreview = h('div', { class: 'snap-preview', hidden: true });
      layerEl.appendChild(this.snapPreview);
      window.addEventListener('resize', U.debounce(function () { wm.clampAll(); }, 60));
    },
    area: function () {
      var r = this.layer.getBoundingClientRect();
      return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    },
    isNarrow: function () { return window.innerWidth < NARROW; },
    findByApp: function (appId) { return this.windows.filter(function (w) { return w.app.id === appId; }); },

    /** Create a window for an app (the app then renders into win.body). */
    create: function (app) {
      var win = makeWindow(app);
      this.windows.push(win);
      this.layer.appendChild(win.el);
      win.focus();
      OS.sound.play('open');
      this.events.emit('change');
      return win;
    },

    focus: function (win) {
      if (this.focused && this.focused !== win) this.focused.el.classList.remove('focused');
      if (!win) { this.focused = null; this.events.emit('change'); return; }
      if (win.minimized) { win.minimized = false; win.el.classList.remove('minimized'); }
      if (this.focused !== win || win.el.style.zIndex != this.z) win.el.style.zIndex = ++this.z;
      this.focused = win;
      win.el.classList.add('focused');
      this.events.emit('change');
    },
    focusTop: function () {
      var vis = this.windows.filter(function (w) { return !w.minimized; });
      vis.sort(function (a, b) { return (+b.el.style.zIndex) - (+a.el.style.zIndex); });
      this.focus(vis[0] || null);
    },

    /** Close every window. force=true skips the apps' "unsaved changes" prompts. Returns false if one refused. */
    closeAll: async function (force) {
      var list = this.windows.slice();
      for (var i = 0; i < list.length; i++) { if (!(await list[i].close(force))) return false; }
      return true;
    },
    hasUnsavedWindows: function () { return this.windows.some(function (w) { return w.dirty; }); },

    clampAll: function () { this.windows.forEach(function (w) { w._clamp(); }); },
    showSnapPreview: function (zone) {
      var p = this.snapPreview;
      if (!zone) { p.hidden = true; return; }
      var a = this.area();
      p.hidden = false;
      p.style.left = (zone === 'right' ? a.w / 2 : 0) + 'px'; p.style.top = '0px';
      p.style.width = (zone === 'top' ? a.w : a.w / 2) + 'px'; p.style.height = a.h + 'px';
    },

    /** Keep geometry on screen. */
    clampRect: function (r) {
      var a = this.area();
      var w = Math.min(Math.max(r.w, Math.min(MIN_W, a.w)), a.w);
      var hh = Math.min(Math.max(r.h, Math.min(MIN_H, a.h)), a.h);
      var keep = Math.min(KEEP_VISIBLE, w);
      var x = U.clamp(r.x, keep - w, a.w - keep);
      var y = U.clamp(r.y, 0, Math.max(0, a.h - 40));   // title bar (38px) always reachable
      return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) };
    }
  };

  function makeWindow(app) {
    var closeGuards = [], destroyHandlers = [], resizeHandlers = [];
    var titleEl = h('div', { class: 'win-title' }, app.name);
    var btnMin = h('button', { class: 'win-ctrl', type: 'button', title: 'Minimize', 'aria-label': 'Minimize', html: OS.icons.minimize });
    var btnMax = h('button', { class: 'win-ctrl', type: 'button', title: 'Maximize', 'aria-label': 'Maximize', html: OS.icons.maximize });
    var btnClose = h('button', { class: 'win-ctrl close', type: 'button', title: 'Close', 'aria-label': 'Close', html: OS.icons.close });
    var slot = h('div', { class: 'win-slot' });
    var titlebar = h('div', { class: 'win-titlebar' }, h('span', { class: 'ico app-ico', html: app.icon }), titleEl, slot, h('div', { class: 'win-ctrls' }, btnMin, btnMax, btnClose));
    var body = h('div', { class: 'win-body', tabindex: '-1' });
    var el = h('div', { class: 'win', role: 'dialog', 'aria-label': app.name }, titlebar, body);
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(function (d) { el.appendChild(h('div', { class: 'rz ' + d, dataset: { dir: d } })); });

    var rect = initialRect(app);
    var win = {
      id: U.uid(6), app: app, el: el, body: body, titlebar: titlebar, titleSlot: slot, titleEl: titleEl,
      title: app.name, minimized: false, maximized: false, closed: false, dirty: false,
      onSaveShortcut: null,   // optional async fn: called on Ctrl+S before the OS saves
      // shared services
      os: OS, vfs: OS.vfs, dialogs: OS.dialogs, toast: OS.toast,
      markDirty: function () { OS.markDirty(); },
      getState: function (defaults) { return OS.getAppState(app.id, defaults); },
      setState: function (v) { OS.setAppState(app.id, v); },

      setTitle: function (t) { win.title = t; titleEl.textContent = t; el.setAttribute('aria-label', t); wm.events.emit('change'); },
      /** Apps with unsaved edits call setDirty(true): used for the tab-close warning. */
      setDirty: function (d) { win.dirty = !!d; OS.events.emit('window-dirty'); },
      /** cb() may return false (or a Promise of false) to block closing. */
      onClose: function (cb) { closeGuards.push(cb); },
      onDestroy: function (cb) { destroyHandlers.push(cb); },
      onResize: function (cb) { resizeHandlers.push(cb); },
      focus: function () { wm.focus(win); },
      minimize: function () {
        if (win.minimized) return;
        win.minimized = true;
        OS.sound.play('minimize');
        el.classList.add('minimizing');
        setTimeout(function () { el.classList.remove('minimizing'); if (win.minimized) el.classList.add('minimized'); }, 160);
        if (wm.focused === win) { el.classList.remove('focused'); wm.focused = null; wm.focusTop(); }
        wm.events.emit('change');
      },
      toggleMaximize: function () { win.maximized ? restore() : maximize(); },
      close: async function (force) {
        if (win.closed) return true;
        if (!force) {
          for (var i = 0; i < closeGuards.length; i++) {
            var ok;
            try { ok = await closeGuards[i](); } catch (e) { console.error(e); ok = true; }
            if (ok === false) return false;
          }
        }
        win.closed = true;
        destroyHandlers.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
        if (!force) OS.sound.play('close');
        el.classList.add('closing');
        el.style.pointerEvents = 'none';
        setTimeout(function () { el.remove(); }, force ? 0 : 140);
        wm.windows = wm.windows.filter(function (w) { return w !== win; });
        if (wm.focused === win) { wm.focused = null; wm.focusTop(); }
        OS.events.emit('window-dirty');
        wm.events.emit('change');
        return true;
      },
      _clamp: function () {
        if (win.maximized) { fireResize(); return; }
        if (win.snapped) { snapTo(win.snapped); return; }
        rect = wm.clampRect(rect); apply(); fireResize();
      }
    };

    function apply() {
      el.style.left = rect.x + 'px'; el.style.top = rect.y + 'px';
      el.style.width = rect.w + 'px'; el.style.height = rect.h + 'px';
    }
    function fireResize() { resizeHandlers.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
    function remember() {
      if (!OS.state) return;
      // Stored in the data and written on the next save; moving windows alone doesn't count as "unsaved".
      OS.state.windows[app.id] = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, max: win.maximized };
    }
    /** Snap to the left or right half of the screen. */
    function snapTo(side) {
      var a = wm.area();
      if (!win.snapped) win._preSnap = Object.assign({}, rect);
      win.snapped = side;
      rect = { x: side === 'left' ? 0 : Math.floor(a.w / 2), y: 0, w: Math.ceil(a.w / 2), h: a.h };
      el.classList.add('snapped');
      apply(); remember(); setTimeout(fireResize, 0);
    }
    function unsnap() { win.snapped = null; el.classList.remove('snapped'); }
    win.snap = snapTo;
    function maximize() {
      unsnap();
      win.maximized = true; el.classList.add('maximized');
      btnMax.innerHTML = OS.icons.restore; btnMax.title = 'Restore';
      remember(); setTimeout(fireResize, 0);
    }
    function restore() {
      win.maximized = false; el.classList.remove('maximized');
      btnMax.innerHTML = OS.icons.maximize; btnMax.title = 'Maximize';
      rect = wm.clampRect(rect); apply(); remember(); setTimeout(fireResize, 0);
    }

    // ---- focus on any pointer interaction ----
    el.addEventListener('pointerdown', function () { if (wm.focused !== win) win.focus(); }, true);
    // keep keyboard focus inside the window you clicked (so app shortcuts work), without stealing it from inputs
    el.addEventListener('pointerup', function () {
      setTimeout(function () { if (!win.closed && !el.contains(document.activeElement)) body.focus({ preventScroll: true }); }, 0);
    });
    el.addEventListener('focusin', function () { if (wm.focused !== win) win.focus(); });

    btnMin.addEventListener('click', function (e) { e.stopPropagation(); win.minimize(); });
    btnMax.addEventListener('click', function (e) { e.stopPropagation(); win.toggleMaximize(); });
    btnClose.addEventListener('click', function (e) { e.stopPropagation(); win.close(); });
    titlebar.addEventListener('dblclick', function (e) { if (!e.target.closest('.win-ctrl, button, input, [role=tab]')) win.toggleMaximize(); });

    // ---- drag by title bar ----
    titlebar.addEventListener('pointerdown', function (e) {
      // controls placed in the title bar (buttons, tabs, inputs) keep their own clicks
      if (e.button !== 0 || e.target.closest('.win-ctrl, button, input, select, textarea, a, [role=tab]')) return;
      var startX = e.clientX, startY = e.clientY, moved = false, origin = Object.assign({}, rect);
      titlebar.setPointerCapture(e.pointerId);
      function move(ev) {
        var dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!moved) {
          moved = true; document.body.classList.add('dragging');
          if (win.maximized || win.snapped) {
            // leave maximized/snapped and keep the window under the pointer proportionally
            var a = wm.area(), wrect = el.getBoundingClientRect(), frac = (startX - wrect.left) / wrect.width;
            var pre = win._preSnap || rect;
            win.maximized = false; el.classList.remove('maximized');
            unsnap();
            btnMax.innerHTML = OS.icons.maximize; btnMax.title = 'Maximize';
            origin.w = Math.min(pre.w, a.w); origin.h = Math.min(pre.h, a.h);
            origin.x = startX - frac * origin.w; origin.y = 0;
            win._preSnap = null;
          }
        }
        rect = wm.clampRect({ x: origin.x + dx, y: origin.y + dy, w: origin.w, h: origin.h });
        apply();
        // snap zones (not on narrow screens)
        var ar = wm.layer.getBoundingClientRect();
        snapZone = wm.isNarrow() ? null : ev.clientX <= ar.left + 4 ? 'left' : ev.clientX >= ar.right - 5 ? 'right' : ev.clientY <= ar.top + 3 ? 'top' : null;
        wm.showSnapPreview(snapZone);
      }
      var snapZone = null;
      function up() {
        titlebar.removeEventListener('pointermove', move);
        titlebar.removeEventListener('pointerup', up);
        titlebar.removeEventListener('pointercancel', up);
        document.body.classList.remove('dragging');
        wm.showSnapPreview(null);
        if (snapZone === 'top') { win._preSnap = Object.assign({}, rect); maximize(); }
        else if (snapZone) snapTo(snapZone);
        else if (moved) { remember(); fireResize(); }
      }
      titlebar.addEventListener('pointermove', move);
      titlebar.addEventListener('pointerup', up);
      titlebar.addEventListener('pointercancel', up);
    });

    // ---- resize from edges/corners ----
    el.querySelectorAll('.rz').forEach(function (handle) {
      handle.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || win.maximized) return;
        e.preventDefault(); e.stopPropagation();
        win.focus();
        unsnap();
        var dir = handle.dataset.dir, sx = e.clientX, sy = e.clientY, o = Object.assign({}, rect);
        var a = wm.area();
        handle.setPointerCapture(e.pointerId);
        document.body.classList.add('dragging');
        function move(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy, r = Object.assign({}, o);
          var minW = Math.min(MIN_W, a.w), minH = Math.min(MIN_H, a.h);
          if (dir.indexOf('e') >= 0) r.w = Math.max(minW, Math.min(o.w + dx, a.w - o.x));
          if (dir.indexOf('s') >= 0) r.h = Math.max(minH, Math.min(o.h + dy, a.h - o.y));
          if (dir.indexOf('w') >= 0) { var nx = Math.max(Math.min(o.x + dx, o.x + o.w - minW), Math.min(0, o.x)); r.w = o.w + (o.x - nx); r.x = nx; }
          if (dir.indexOf('n') >= 0) { var ny = U.clamp(o.y + dy, 0, o.y + o.h - minH); r.h = o.h + (o.y - ny); r.y = ny; }
          rect = r; apply(); fireResize();
        }
        function up() {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          document.body.classList.remove('dragging');
          rect = wm.clampRect(rect); apply(); remember(); fireResize();
        }
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    });

    apply();
    if (wm.isNarrow() || rect.max) maximize();
    return win;
  }

  function initialRect(app) {
    var a = wm.area();
    var saved = OS.state && OS.state.windows[app.id];
    var r;
    if (saved && saved.w) r = { x: saved.x, y: saved.y, w: saved.w, h: saved.h };
    else {
      var w = Math.min(app.defaultSize.w, a.w - 24), hh = Math.min(app.defaultSize.h, a.h - 24);
      r = { x: (a.w - w) / 2, y: Math.max(8, (a.h - hh) / 2 - 20), w: w, h: hh };
    }
    // cascade if another window already sits at that spot
    for (var k = 0; k < 12 && wm.windows.some(function (o) { return Math.abs(parseInt(o.el.style.left, 10) - Math.round(r.x)) < 4 && Math.abs(parseInt(o.el.style.top, 10) - Math.round(r.y)) < 4; }); k++) {
      r.x += 28; r.y += 28;
      if (r.x + r.w > a.w || r.y + r.h > a.h) { r.x = 16 + k * 8; r.y = 16 + k * 8; }
    }
    r = wm.clampRect(r);
    r.max = !!(saved && saved.max);
    return r;
  }

  OS.wm = wm;
})();
