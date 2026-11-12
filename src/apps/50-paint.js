/* =====================================================================
   APP: PAINT
   The picture has a logical size (W x H, the PNG size). The backing
   canvas is W*dpr x H*dpr so strokes look crisp on high-DPI screens;
   saving downsamples to exactly W x H.
   Tools: brush, eraser, line, rectangle, ellipse, fill, color picker.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var MAX_UNDO = 30;
  var IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

  OS.registerApp({
    id: 'paint',
    name: 'Paint',
    icon: OS.appIcons.paint,
    optional: true,
    category: 'Creativity',
    description: 'Sketch, doodle and edit pictures with brushes, shapes, fill and an eyedropper. Saves PNG files.',
    keywords: 'draw image picture',
    fileTypes: IMG,
    mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'],
    defaultSize: { w: 900, h: 620 },
    launch: function (win, args) {
      var vfs = win.vfs, dlg = win.dialogs;
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var W = 800, H = 500, tool = 'brush', fileId = null, name = 'Untitled.png', dirty = false;
      var undo = [], redo = [];

      var canvas = h('canvas', { class: 'pt-canvas' });
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      var color = h('input', { type: 'color', value: '#3f6ee8', title: 'Color', 'aria-label': 'Color' });
      var size = h('input', { type: 'range', min: '1', max: '64', value: '6', class: 'range pt-range', title: 'Size', 'aria-label': 'Brush size' });
      var sizeLbl = h('span', { class: 'small muted pt-size' }, '6');
      var fillShapes = h('input', { type: 'checkbox', class: 'pt-fillcb', title: 'Fill shapes' });
      var tools = {};
      var toolDefs = [['brush', 'Brush (B)'], ['eraser', 'Eraser (E)'], ['line', 'Line (L)'], ['rect', 'Rectangle (R)'], ['circle', 'Ellipse (O)'], ['fill', 'Fill (F)'], ['picker', 'Pick color (I)']];
      var toolBox = h('div', { class: 'pt-tools' });
      toolDefs.forEach(function (t) {
        tools[t[0]] = h('button', { class: 'icon-btn sm', type: 'button', title: t[1], 'aria-label': t[1], html: OS.icons[t[0]], onclick: function () { setTool(t[0]); } });
        toolBox.appendChild(tools[t[0]]);
      });
      var bUndo = h('button', { class: 'icon-btn sm', type: 'button', title: 'Undo (Ctrl+Z)', html: OS.icons.undo, onclick: function () { doUndo(); } });
      var bRedo = h('button', { class: 'icon-btn sm', type: 'button', title: 'Redo (Ctrl+Y)', html: OS.icons.redo, onclick: function () { doRedo(); } });
      var swatches = h('div', { class: 'pt-swatches' });
      ['#1b1d26', '#ffffff', '#e5484d', '#f5a524', '#ffd93d', '#30a46c', '#12a4b4', '#3f6ee8', '#8e4ec6', '#d6409f', '#8d6e63', '#9aa4b2'].forEach(function (c) {
        swatches.appendChild(h('button', { class: 'pt-swatch', type: 'button', title: c, 'aria-label': 'Color ' + c, style: { background: c }, onclick: function () { color.value = c; if (tool === 'eraser' || tool === 'picker') setTool('brush'); } }));
      });
      var status = h('div', { class: 'np-status' });
      var stage = h('div', { class: 'pt-stage' }, h('div', { class: 'pt-paper' }, canvas));
      win.body.classList.add('app-paint');
      win.body.append(
        h('div', { class: 'toolbar' },
          h('button', { class: 'icon-btn sm', type: 'button', title: 'New', html: OS.icons.newFile, onclick: function () { newImage(); } }),
          h('button', { class: 'icon-btn sm', type: 'button', title: 'Open…', html: OS.icons.folder, onclick: function () { openImage(); } }),
          h('button', { class: 'icon-btn sm', type: 'button', title: 'Save (Ctrl+S)', html: OS.icons.save, onclick: function () { save(); } }),
          h('button', { class: 'btn text small', type: 'button', onclick: function () { saveAs(); } }, 'Save as…'),
          h('span', { class: 'sep' }), toolBox, h('span', { class: 'sep' }),
          color, swatches),
        h('div', { class: 'toolbar pt-sub' },
          h('span', { class: 'small muted' }, 'Size'), size, sizeLbl,
          h('label', { class: 'small pt-fill-label' }, fillShapes, 'Filled shapes'),
          h('span', { class: 'grow' }), bUndo, bRedo,
          h('button', { class: 'btn text small', type: 'button', onclick: function () { snapshot(); fillWhite(); setDirty(true); } }, 'Clear')),
        stage, status);

      function updateTitle() {
        win.setTitle((dirty ? '• ' : '') + name);
        status.textContent = W + ' × ' + H + ' px' + (fileId && vfs.exists(fileId) ? '  ·  ' + vfs.pathOf(fileId) : '  ·  not saved yet');
        bUndo.disabled = !undo.length; bRedo.disabled = !redo.length;
      }
      function setDirty(d) { dirty = d; win.setDirty(d); updateTitle(); }
      function setup(w, hh) {
        W = w; H = hh;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function fillWhite() {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
      }
      function grab() { return ctx.getImageData(0, 0, canvas.width, canvas.height); }
      function snapshot() { undo.push(grab()); if (undo.length > MAX_UNDO) undo.shift(); redo = []; updateTitle(); }
      function doUndo() { var img = undo.pop(); if (!img) return; redo.push(grab()); ctx.putImageData(img, 0, 0); setDirty(true); }
      function doRedo() { var img = redo.pop(); if (!img) return; undo.push(grab()); ctx.putImageData(img, 0, 0); setDirty(true); }
      function setTool(t) {
        tool = t;
        Object.keys(tools).forEach(function (k) { tools[k].classList.toggle('active', k === t); });
        canvas.style.cursor = t === 'picker' ? 'copy' : t === 'fill' ? 'cell' : 'crosshair';
      }

      /* ---- drawing ---- */
      var drawing = false, last = null, start = null, base = null;
      function pos(e) {
        var r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
      }
      function style(pressure) {
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = color.value; ctx.fillStyle = color.value;
        ctx.lineWidth = +size.value * (pressure ? 0.3 + pressure * 1.4 : 1);   // pressure only for pens
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      }
      function segment(a, b, pressure) {
        style(pressure);
        if (a.x === b.x && a.y === b.y) { ctx.beginPath(); ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      function shape(a, b, shift) {
        ctx.putImageData(base, 0, 0);
        style(0);
        var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), hh = Math.abs(b.y - a.y);
        if (shift && tool !== 'line') { var m = Math.max(w, hh); w = hh = m; if (b.x < a.x) x = a.x - m; if (b.y < a.y) y = a.y - m; }
        ctx.beginPath();
        if (tool === 'line') {
          var ex = b.x, ey = b.y;
          if (shift) { var ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(b.x - a.x, b.y - a.y); ex = a.x + Math.cos(ang) * len; ey = a.y + Math.sin(ang) * len; }
          ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke(); return;
        }
        if (tool === 'rect') ctx.rect(x, y, w, hh);
        else ctx.ellipse(x + w / 2, y + hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2);
        if (fillShapes.checked) ctx.fill(); else ctx.stroke();
      }
      function hexToRGBA(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 255]; }
      /** Scanline flood fill on device pixels. */
      function flood(p) {
        var img = grab(), d = img.data, w = img.width, hh = img.height;
        var sx = Math.floor(p.x * dpr), sy = Math.floor(p.y * dpr);
        if (sx < 0 || sy < 0 || sx >= w || sy >= hh) return false;
        var i0 = (sy * w + sx) * 4, target = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], fill = hexToRGBA(color.value);
        if (target.every(function (v, k) { return Math.abs(v - fill[k]) < 3; })) return false;
        var tol = 48;
        function match(i) { return Math.abs(d[i] - target[0]) + Math.abs(d[i + 1] - target[1]) + Math.abs(d[i + 2] - target[2]) + Math.abs(d[i + 3] - target[3]) <= tol; }
        var seen = new Uint8Array(w * hh), stack = [sx, sy];
        while (stack.length) {
          var y = stack.pop(), x = stack.pop(), idx = y * w + x;
          while (x >= 0 && !seen[idx] && match(idx * 4)) { x--; idx--; }
          x++; idx++;
          var up = false, down = false;
          while (x < w && !seen[idx] && match(idx * 4)) {
            seen[idx] = 1; var q = idx * 4; d[q] = fill[0]; d[q + 1] = fill[1]; d[q + 2] = fill[2]; d[q + 3] = 255;
            if (y > 0) { var iu = idx - w; if (!seen[iu] && match(iu * 4)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false; }
            if (y < hh - 1) { var id = idx + w; if (!seen[id] && match(id * 4)) { if (!down) { stack.push(x, y + 1); down = true; } } else down = false; }
            x++; idx++;
          }
        }
        ctx.putImageData(img, 0, 0);
        return true;
      }
      function pick(p) {
        var px = ctx.getImageData(Math.floor(p.x * dpr), Math.floor(p.y * dpr), 1, 1).data;
        color.value = '#' + [px[0], px[1], px[2]].map(function (c) { return c.toString(16).padStart(2, '0'); }).join('');
        setTool('brush');
      }
      canvas.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var p = pos(e);
        if (tool === 'picker') { pick(p); return; }
        if (tool === 'fill') { var before = grab(); if (flood(p)) { undo.push(before); if (undo.length > MAX_UNDO) undo.shift(); redo = []; setDirty(true); } return; }
        canvas.setPointerCapture(e.pointerId);
        snapshot();
        drawing = true; last = start = p;
        if (tool === 'brush' || tool === 'eraser') segment(p, p, e.pointerType === 'pen' ? e.pressure : 0);
        else base = grab();
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!drawing) return;
        if (tool === 'brush' || tool === 'eraser') {
          var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
          if (!evs.length) evs = [e];
          evs.forEach(function (ev) { var p = pos(ev); segment(last, p, e.pointerType === 'pen' ? ev.pressure : 0); last = p; });
        } else shape(start, pos(e), e.shiftKey);
      });
      function end() { if (drawing) { drawing = false; base = null; ctx.globalCompositeOperation = 'source-over'; setDirty(true); } }
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);

      /* ---- file operations ---- */
      async function confirmDiscard() {
        if (!dirty) return true;
        var v = await dlg.choose('Save changes to "' + name + '" before closing?', [
          { label: 'Cancel', value: null }, { label: "Don't save", value: 'discard', danger: true }, { label: 'Save', value: 'save', primary: true }], { title: 'Unsaved picture' });
        if (v === 'save') return await save();
        return v === 'discard';
      }
      async function newImage() {
        if (!(await confirmDiscard())) return;
        var v = await dlg.prompt('Size in pixels (width x height)', { title: 'New picture', value: W + 'x' + H,
          validate: function (s) { var m = /^\s*(\d+)\s*[x×*,]\s*(\d+)\s*$/.exec(s); return m && +m[1] >= 1 && +m[2] >= 1 && +m[1] <= 4096 && +m[2] <= 4096 ? '' : 'Enter something like 800x600 (max 4096).'; } });
        if (v == null) return;
        var m = /(\d+)\s*[x×*,]\s*(\d+)/.exec(v);
        setup(+m[1], +m[2]); fillWhite(); undo = []; redo = []; fileId = null; name = 'Untitled.png'; setDirty(false);
      }
      function exportPNG() {
        var out = document.createElement('canvas'); out.width = W; out.height = H;
        var o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
        o.drawImage(canvas, 0, 0, W, H);
        return out.toDataURL('image/png').split(',')[1];
      }
      async function save() {
        if (!fileId || !vfs.exists(fileId) || vfs.inTrash(fileId) || U.extOf(name) !== 'png') return saveAs();
        try { vfs.write(fileId, exportPNG(), { encoding: 'base64', mime: 'image/png' }); setDirty(false); return true; }
        catch (e) { dlg.alert(e.message); return false; }
      }
      async function saveAs() {
        var r = await dlg.saveAs({ title: 'Save picture as PNG', defaultName: U.basename(name) + '.png', forceExt: 'png', extensions: ['png'], start: vfs.special('pictures') });
        if (!r) return false;
        try {
          var data = exportPNG();
          if (r.existingId) { vfs.write(r.existingId, data, { encoding: 'base64', mime: 'image/png' }); fileId = r.existingId; }
          else fileId = vfs.createFile(r.parentId, r.name, data, { encoding: 'base64', mime: 'image/png' });
          name = r.name; setDirty(false); return true;
        } catch (e) { dlg.alert(e.message); return false; }
      }
      async function openImage() {
        if (!(await confirmDiscard())) return;
        var id = await dlg.openFile({ title: 'Open picture', extensions: IMG, start: vfs.special('pictures') });
        if (id) load(id);
      }
      function load(id) {
        var img = new Image();
        img.onload = function () {
          setup(Math.min(img.naturalWidth, 4096), Math.min(img.naturalHeight, 4096));
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          undo = []; redo = []; fileId = id; name = vfs.stat(id).name; setDirty(false);
        };
        img.onerror = function () { dlg.alert('This picture could not be opened.', { title: 'Paint' }); };
        img.src = vfs.readDataURL(id);
      }

      size.addEventListener('input', function () { sizeLbl.textContent = size.value; });
      win.body.addEventListener('keydown', function (e) {
        var k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z') { e.preventDefault(); doUndo(); }
        else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); doRedo(); }
        else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName !== 'INPUT') {
          var map = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', o: 'circle', f: 'fill', i: 'picker' };
          if (map[k]) setTool(map[k]);
        }
      });
      win.onSaveShortcut = async function () { if (dirty) await save(); };
      win.onClose(confirmDiscard);
      setTool('brush');

      if (args.fileId && vfs.exists(args.fileId)) { setup(W, H); fillWhite(); load(args.fileId); }
      else {
        var r = stage.getBoundingClientRect();
        setup(Math.max(200, Math.min(1600, Math.floor(r.width - 40) || 800)), Math.max(150, Math.min(1200, Math.floor(r.height - 40) || 500)));
        fillWhite(); setDirty(false);
      }
    }
  });
})();
