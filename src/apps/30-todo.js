/* =====================================================================
   APP: TO-DO LIST (state stored in data.apps.todo)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;

  OS.registerApp({
    id: 'todo',
    name: 'To-do',
    icon: OS.appIcons.todo,
    defaultSize: { w: 440, h: 520 },
    singleInstance: true,
    launch: function (win) {
      function items() { return win.getState({ items: [] }).items; }
      function commit(list) { win.setState({ items: list }); render(); }

      var input = h('input', { class: 'input', type: 'text', placeholder: 'Add a task and press Enter', 'aria-label': 'New task', maxlength: '500' });
      var addBtn = h('button', { class: 'btn primary', type: 'button', title: 'Add', html: OS.icons.plus });
      var list = h('ul', { class: 'td-list' });
      var footer = h('div', { class: 'td-footer' });
      win.body.classList.add('app-todo');
      win.body.append(h('form', { class: 'td-add', onsubmit: function (e) { e.preventDefault(); add(); } }, input, addBtn), list, footer);
      addBtn.addEventListener('click', add);

      function add() {
        var t = input.value.trim(); if (!t) return;
        var l = items().slice(); l.push({ id: U.uid(6), text: t, done: false });
        input.value = ''; commit(l); input.focus();
      }
      function update(id, patch) { commit(items().map(function (it) { return it.id === id ? Object.assign({}, it, patch) : it; })); }
      function remove(id) { commit(items().filter(function (it) { return it.id !== id; })); }
      function moveBy(id, d) {
        var l = items().slice(), i = l.findIndex(function (x) { return x.id === id; }), j = i + d;
        if (i < 0 || j < 0 || j >= l.length) return;
        var t = l[i]; l[i] = l[j]; l[j] = t; commit(l);
        var b = list.querySelector('[data-id="' + id + '"] .td-' + (d < 0 ? 'up' : 'down')); if (b) b.focus();
      }
      function edit(li, it) {
        var ed = h('input', { class: 'input td-edit', type: 'text', maxlength: '500' }); ed.value = it.text;
        var txt = li.querySelector('.td-text'); txt.replaceWith(ed); ed.focus(); ed.select();
        var finished = false;
        function done(save) {
          if (finished) return; finished = true;
          var v = ed.value.trim();
          if (save && v && v !== it.text) update(it.id, { text: v }); else render();
        }
        ed.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
        ed.addEventListener('blur', function () { done(true); });
      }

      /* pointer-based drag reorder via the grip handle (works with mouse and touch) */
      function startDrag(e, li, id) {
        if (e.button !== 0) return;
        e.preventDefault();
        var grip = e.currentTarget; grip.setPointerCapture(e.pointerId);
        li.classList.add('dragging');
        function move(ev) {
          var siblings = Array.from(list.children).filter(function (c) { return c !== li; });
          var before = siblings.find(function (c) { var r = c.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
          if (before) list.insertBefore(li, before); else list.appendChild(li);
        }
        function up() {
          grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
          li.classList.remove('dragging');
          var order = Array.from(list.children).map(function (c) { return c.dataset.id; });
          var byId = {}; items().forEach(function (x) { byId[x.id] = x; });
          var newList = order.map(function (k) { return byId[k]; }).filter(Boolean);
          if (newList.map(function (x) { return x.id; }).join() !== items().map(function (x) { return x.id; }).join()) commit(newList);
        }
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
      }

      function render() {
        if (win.closed) return;
        var l = items();
        list.textContent = '';
        if (!l.length) list.appendChild(h('li', { class: 'td-empty' }, 'Nothing to do. Add a task above.'));
        l.forEach(function (it, i) {
          var cb = h('input', { type: 'checkbox', class: 'td-check', checked: !!it.done, 'aria-label': 'Done' });
          var li = h('li', { class: 'td-item' + (it.done ? ' done' : ''), dataset: { id: it.id } },
            h('span', { class: 'td-grip', title: 'Drag to reorder', html: OS.icons.grip }),
            cb,
            h('span', { class: 'td-text', title: 'Double-click to edit' }, it.text),
            h('button', { class: 'icon-btn td-up', type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, html: OS.icons.chevUp }),
            h('button', { class: 'icon-btn td-down', type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === l.length - 1, html: OS.icons.chevDown }),
            h('button', { class: 'icon-btn td-editbtn', type: 'button', title: 'Edit', 'aria-label': 'Edit', html: OS.icons.edit }),
            h('button', { class: 'icon-btn td-del', type: 'button', title: 'Delete', 'aria-label': 'Delete', html: OS.icons.trash }));
          cb.addEventListener('change', function () { update(it.id, { done: cb.checked }); });
          li.querySelector('.td-text').addEventListener('dblclick', function () { edit(li, it); });
          li.querySelector('.td-editbtn').addEventListener('click', function () { edit(li, it); });
          li.querySelector('.td-del').addEventListener('click', function () { remove(it.id); });
          li.querySelector('.td-up').addEventListener('click', function () { moveBy(it.id, -1); });
          li.querySelector('.td-down').addEventListener('click', function () { moveBy(it.id, 1); });
          li.querySelector('.td-grip').addEventListener('pointerdown', function (e) { startDrag(e, li, it.id); });
          list.appendChild(li);
        });
        var done = l.filter(function (x) { return x.done; }).length;
        footer.textContent = '';
        footer.append(h('span', { class: 'muted small' }, (l.length - done) + ' left · ' + done + ' done'),
          done ? h('button', { class: 'btn', type: 'button', onclick: function () { commit(items().filter(function (x) { return !x.done; })); } }, 'Clear completed') : null);
      }
      render();
      setTimeout(function () { input.focus(); }, 0);
    }
  });
})();
