/* =====================================================================
   APP: PAINT
   The picture has a logical size (W x H, the PNG size). The backing
   canvas is W*dpr x H*dpr so strokes look crisp on high-DPI screens;
   saving downsamples to exactly W x H.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var MAX_UNDO = 30;

  OS.registerApp({
    id: 'paint',
    name: 'Paint',
    icon: OS.appIcons.paint,
    fileTypes: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'],
    defaultSize: { w: 820, h: 580 },
    launch: function (win, args) {
      var vfs = win.vfs, dlg = win.dialogs;
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var W = 800, H = 500, tool = 'brush', fileId = null, name = 'Untitled.png', dirty = false;
      var undo = [];

      var canvas = h('canvas', { class: 'pt-canvas' });
      var ctx = canvas.getContext('2d');
      var color = h('input', { type: 'color', value: '#2b59ff', title: 'Color', 'aria-label': 'Color' });
      var size = h('input', { type: 'range', min: '1', max: '60', value: '6', title: 'Brush size', 'aria-label': 'Brush size' });
      var sizeLbl = h('span', { class: 'small muted pt-size' }, '6px');
      var bBrush = h('button', { class: 'icon-btn active', type: 'button', title: 'Brush (B)', html: OS.icons.brush });
      var bEraser = h('button', { class: 'icon-btn', type: 'button', title: 'Eraser (E)', html: OS.icons.eraser });
      var bUndo = h('button', { class: 'icon-btn', type: 'button', title: 'Undo (Ctrl+Z)', html: OS.icons.undo });
      var bClear = h('button', { class: 'icon-btn', type: 'button', title: 'Clear', html: OS.icons.clear });
      var swatches = h('div', { class: 'pt-swatches' });
      ['#1b2130', '#ffffff', '#e5484d', '#f5a524', '#ffd93d', '#30a46c', '#2b59ff', '#8e4ec6', '#d6409f', '#8d6e63'].forEach(function (c) {
        swatches.appendChild(h('button', { class: 'pt-swatch', type: 'button', title: c, style: { background: c }, onclick: function () { color.value = c; setTool('brush'); } }));
      });
      var status = h('div', { class: 'np-status' });
      var stage = h('div', { class: 'pt-stage' }, h('div', { class: 'pt-paper' }, canvas));
      win.body.classList.add('app-paint');
      win.body.append(
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn', type: 'button', onclick: function () { newImage(); } }, 'New'),
          h('button', { class: 'btn', type: 'button', onclick: function () { openImage(); } }, 'Open…'),
          h('button', { class: 'btn', type: 'button', onclick: function () { save(); } }, 'Save'),
          h('button', { class: 'btn', type: 'button', onclick: function () { saveAs(); } }, 'Save as…'),
          h('span', { class: 'sep' }), bBrush, bEraser, color, swatches, size, sizeLbl,
          h('span', { class: 'sep' }), bUndo, bClear),
        stage, status);

      function updateTitle() {
        win.setTitle((dirty ? '● ' : '') + name + ' - Paint');
        status.textContent = W + ' × ' + H + ' px' + (fileId && vfs.exists(fileId) ? '  ·  ' + vfs.pathOf(fileId) : '  ·  not saved yet') + (dpr !== 1 ? '  ·  display scale ' + dpr + '×' : '');
        bUndo.disabled = !undo.length;
      }
      function setDirty(d) { dirty = d; win.setDirty(d); updateTitle(); }

      function setup(w, hh) {
        W = w; H = hh;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
      }
      function fillWhite() {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
      }
      function snapshot() {
        undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (undo.length > MAX_UNDO) undo.shift();
        updateTitle();
      }
      function doUndo() {
        var img = undo.pop(); if (!img) return;
        ctx.putImageData(img, 0, 0); setDirty(true);
      }
      function setTool(t) { tool = t; bBrush.classList.toggle('active', t === 'brush'); bEraser.classList.toggle('active', t === 'eraser'); }

      /* ---- drawing with pointer events ---- */
      var drawing = false, last = null;
      function pos(e) {
        var r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
      }
      function stroke(a, b, pressure) {
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = color.value; ctx.fillStyle = color.value;
        var w = +size.value * (pressure ? 0.3 + pressure * 1.4 : 1); // pressure only for pens
        ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (a.x === b.x && a.y === b.y) { ctx.beginPath(); ctx.arc(a.x, a.y, w / 2, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      canvas.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        snapshot();
        drawing = true; last = pos(e); stroke(last, last, e.pointerType === 'pen' ? e.pressure : 0);
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!drawing) return;
        var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        if (!evs.length) evs = [e];
        evs.forEach(function (ev) { var p = pos(ev); stroke(last, p, e.pointerType === 'pen' ? ev.pressure : 0); last = p; });
      });
      function end() { if (drawing) { drawing = false; ctx.globalCompositeOperation = 'source-over'; setDirty(true); } }
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);

      /* ---- file operations ---- */
      async function confirmDiscard() {
        if (!dirty) return true;
        var v = await dlg.choose('Save changes to "' + name + '"?', [
          { label: 'Cancel', value: null }, { label: "Don't save", value: 'discard', danger: true }, { label: 'Save', value: 'save', primary: true }], { title: 'Paint' });
        if (v === 'save') return await save();
        return v === 'discard';
      }
      async function newImage() {
        if (!(await confirmDiscard())) return;
        var v = await dlg.prompt('Size in pixels (width x height)', { title: 'New image', value: W + 'x' + H,
          validate: function (s) { var m = /^\s*(\d+)\s*[x×*,]\s*(\d+)\s*$/.exec(s); return m && +m[1] >= 1 && +m[2] >= 1 && +m[1] <= 4096 && +m[2] <= 4096 ? '' : 'Enter something like 800x600 (max 4096).'; } });
        if (v == null) return;
        var m = /(\d+)\s*[x×*,]\s*(\d+)/.exec(v);
        setup(+m[1], +m[2]); fillWhite(); undo = []; fileId = null; name = 'Untitled.png'; setDirty(false);
      }
      function exportPNG() {
        var out = document.createElement('canvas'); out.width = W; out.height = H;
        var o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
        o.drawImage(canvas, 0, 0, W, H);
        return out.toDataURL('image/png').split(',')[1];
      }
      async function save() {
        if (!fileId || !vfs.exists(fileId) || U.extOf(name) !== 'png') return saveAs();
        try { vfs.write(fileId, exportPNG(), { encoding: 'base64', mime: 'image/png' }); setDirty(false); return true; }
        catch (e) { dlg.alert(e.message); return false; }
      }
      async function saveAs() {
        var base = name.replace(/\.[^.]+$/, '') + '.png';
        var r = await dlg.saveAs({ title: 'Save picture as PNG', defaultName: base, forceExt: 'png', extensions: ['png'], start: vfs.resolvePath('/Pictures') || vfs.root() });
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
        var id = await dlg.openFile({ title: 'Open picture', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'], start: vfs.resolvePath('/Pictures') || vfs.root() });
        if (id) load(id);
      }
      function load(id) {
        var img = new Image();
        img.onload = function () {
          setup(Math.min(img.naturalWidth, 4096), Math.min(img.naturalHeight, 4096));
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          undo = []; fileId = id; name = vfs.stat(id).name; setDirty(false);
        };
        img.onerror = function () { dlg.alert('This picture could not be opened.', { title: 'Paint' }); };
        img.src = vfs.readDataURL(id);
      }

      bBrush.addEventListener('click', function () { setTool('brush'); });
      bEraser.addEventListener('click', function () { setTool('eraser'); });
      bUndo.addEventListener('click', doUndo);
      bClear.addEventListener('click', function () { snapshot(); fillWhite(); setDirty(true); });
      size.addEventListener('input', function () { sizeLbl.textContent = size.value + 'px'; });
      win.body.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
        else if (!e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') {
          if (e.key === 'b') setTool('brush'); else if (e.key === 'e') setTool('eraser');
        }
      });
      win.onSaveShortcut = async function () { if (dirty) await save(); };
      win.onClose(confirmDiscard);

      if (args.fileId && vfs.exists(args.fileId)) { setup(W, H); fillWhite(); load(args.fileId); }
      else {
        var r = stage.getBoundingClientRect();
        setup(Math.max(200, Math.min(1600, Math.floor(r.width - 32) || 800)), Math.max(150, Math.min(1200, Math.floor(r.height - 32) || 500)));
        fillWhite(); setDirty(false);
      }
    }
  });
})();
