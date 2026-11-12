/* =====================================================================
   APP: MUSIC (plays audio files stored in Nimbus)
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util, h = U.h;
  var EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'];

  function fmt(t) { if (!isFinite(t)) return '0:00'; t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

  OS.registerApp({
    id: 'music',
    name: 'Music',
    icon: OS.appIcons.music,
    optional: true,
    category: 'Creativity',
    description: 'Play the songs stored in your Nimbus file, with shuffle, repeat and a queue. Import MP3, WAV, OGG, M4A or FLAC.',
    keywords: 'audio songs player mp3',
    fileTypes: EXT,
    mimeTypes: ['audio/'],
    singleInstance: true,
    defaultSize: { w: 820, h: 560 },
    launch: function (win, args) {
      var vfs = win.vfs, prefs = win.getState({ volume: 0.8, shuffle: false, repeat: 'off' });
      var audio = new Audio(), queue = [], pos = -1, objUrl = null;
      audio.volume = prefs.volume;

      var fileIn = h('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true });
      fileIn.addEventListener('change', async function () { var f = Array.from(fileIn.files); fileIn.value = ''; if (f.length) await OS.importHostFiles(f, vfs.special('music')); });
      var listEl = h('div', { class: 'mu-list', role: 'list' });
      var art = h('div', { class: 'mu-art' }, h('span', { html: OS.icons.music }), h('div', { class: 'mu-eq' }, h('i'), h('i'), h('i'), h('i')));
      var title = h('div', { class: 'mu-title' }, 'Nothing playing');
      var sub = h('div', { class: 'mu-sub muted' }, 'Pick a song from your library');
      var seek = h('input', { type: 'range', class: 'range mu-seek', min: '0', max: '1000', value: '0', 'aria-label': 'Seek' });
      var tCur = h('span', { class: 'mu-time' }, '0:00'), tDur = h('span', { class: 'mu-time' }, '0:00');
      function tb(icon, label, fn, cls) { return h('button', { class: 'icon-btn' + (cls ? ' ' + cls : ''), type: 'button', title: label, 'aria-label': label, html: OS.icons[icon], onclick: fn }); }
      var bPlay = h('button', { class: 'mu-play', type: 'button', 'aria-label': 'Play', html: OS.icons.play, onclick: function () { toggle(); } });
      var bShuffle = tb('shuffle', 'Shuffle', function () { prefs.shuffle = !prefs.shuffle; updateBtns(); });
      var bRepeat = tb('repeat', 'Repeat', function () { prefs.repeat = prefs.repeat === 'off' ? 'all' : prefs.repeat === 'all' ? 'one' : 'off'; updateBtns(); });
      var vol = h('input', { type: 'range', class: 'range mu-vol', min: '0', max: '1', step: '0.02', value: String(prefs.volume), 'aria-label': 'Volume' });
      vol.addEventListener('input', function () { audio.volume = +vol.value; prefs.volume = +vol.value; });
      var player = h('div', { class: 'mu-player' }, art,
        h('div', { class: 'mu-info' }, title, sub),
        h('div', { class: 'mu-seekrow' }, tCur, seek, tDur),
        h('div', { class: 'mu-ctrls' }, bShuffle, tb('skipPrev', 'Previous', function () { prev(); }), bPlay, tb('skipNext', 'Next', function () { next(true); }), bRepeat),
        h('div', { class: 'mu-volrow' }, h('span', { html: OS.icons.volume }), vol));
      var side = h('div', { class: 'mu-side' },
        h('div', { class: 'mu-head' }, h('h2', null, 'Library'), h('span', { class: 'grow' }),
          h('button', { class: 'btn tonal small', type: 'button', onclick: function () { fileIn.click(); } }, h('span', { html: OS.icons.upload }), 'Import')), listEl);
      win.body.classList.add('app-music');
      win.body.append(side, player, fileIn);

      function library() { return vfs.findByExt(EXT).sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }); }
      function renderList() {
        var songs = library(), playing = queue[pos];
        listEl.textContent = '';
        if (!songs.length) listEl.appendChild(h('div', { class: 'ph-empty' }, h('span', { html: OS.icons.music }), h('b', null, 'No music yet'), h('span', null, 'Import audio files and they will appear here.')));
        songs.forEach(function (m, i) {
          var on = playing && playing.id === m.id;
          var r = h('button', { class: 'mu-row' + (on ? ' on' : ''), type: 'button', role: 'listitem' },
            h('span', { class: 'mu-num' }, on && !audio.paused ? h('span', { class: 'mu-mini-eq' }, h('i'), h('i'), h('i')) : String(i + 1)),
            h('span', { class: 'lz-file-txt' }, h('span', { class: 'lbl' }, U.basename(m.name)), h('span', { class: 'sub' }, vfs.pathOf(m.parent))),
            h('span', { class: 'muted small' }, U.formatBytes(m.size)));
          r.addEventListener('click', function () { playList(songs, i); });
          r.addEventListener('contextmenu', function (e) {
            OS.contextMenu(e, [{ label: 'Play', icon: 'play', action: function () { playList(songs, i); } },
              { label: 'Show in Files', icon: 'folder', action: function () { OS.launch('explorer', { folderId: m.parent, select: m.id }); } },
              { label: 'Export', icon: 'download', action: function () { OS.exportFile(m.id); } }]);
          });
          listEl.appendChild(r);
        });
      }
      function playList(songs, i) {
        queue = songs.slice();
        if (prefs.shuffle) { var first = queue.splice(i, 1)[0]; U.shuffle(queue); queue.unshift(first); i = 0; }
        pos = i; load(true);
      }
      function load(autoplay) {
        var m = queue[pos]; if (!m) return;
        if (objUrl) URL.revokeObjectURL(objUrl);
        try { objUrl = URL.createObjectURL(new Blob([vfs.readBytes(m.id)], { type: m.mime || 'audio/mpeg' })); }
        catch (e) { OS.toast('Could not read ' + m.name, 'error'); return; }
        audio.src = objUrl;
        title.textContent = U.basename(m.name); sub.textContent = vfs.pathOf(m.parent);
        win.setTitle(U.basename(m.name));
        art.style.setProperty('--h', String((m.name.length * 47) % 360));
        if (autoplay) audio.play().catch(function (e) { OS.toast('This file could not be played: ' + (e.message || 'unsupported format'), 'error', 5000); });
        renderList();
      }
      function toggle() {
        if (!queue.length) { var s = library(); if (s.length) playList(s, 0); return; }
        if (audio.paused) audio.play().catch(function () {}); else audio.pause();
      }
      function next(user) {
        if (!queue.length) return;
        if (prefs.repeat === 'one' && !user) { audio.currentTime = 0; audio.play(); return; }
        if (pos < queue.length - 1) pos++;
        else if (prefs.repeat === 'all' || user) pos = 0;
        else { audio.pause(); audio.currentTime = 0; return; }
        load(true);
      }
      function prev() {
        if (audio.currentTime > 3 || pos <= 0) { audio.currentTime = 0; return; }
        pos--; load(true);
      }
      function updateBtns() {
        bShuffle.classList.toggle('active', prefs.shuffle);
        bRepeat.classList.toggle('active', prefs.repeat !== 'off');
        bRepeat.title = 'Repeat: ' + prefs.repeat;
        bRepeat.innerHTML = OS.icons.repeat + (prefs.repeat === 'one' ? '<b class="mu-one">1</b>' : '');
      }
      var seeking = false;
      seek.addEventListener('input', function () { seeking = true; tCur.textContent = fmt(seek.value / 1000 * audio.duration); });
      seek.addEventListener('change', function () { if (isFinite(audio.duration)) audio.currentTime = seek.value / 1000 * audio.duration; seeking = false; });
      audio.addEventListener('timeupdate', function () {
        if (seeking) return;
        tCur.textContent = fmt(audio.currentTime); tDur.textContent = fmt(audio.duration);
        seek.value = isFinite(audio.duration) && audio.duration ? String(Math.round(audio.currentTime / audio.duration * 1000)) : '0';
      });
      audio.addEventListener('play', function () { bPlay.innerHTML = OS.icons.pause; bPlay.setAttribute('aria-label', 'Pause'); player.classList.add('playing'); renderList(); });
      audio.addEventListener('pause', function () { bPlay.innerHTML = OS.icons.play; bPlay.setAttribute('aria-label', 'Play'); player.classList.remove('playing'); renderList(); });
      audio.addEventListener('ended', function () { next(false); });
      audio.addEventListener('error', function () { if (audio.src) OS.toast('This format is not supported by your browser.', 'error'); });
      win.body.tabIndex = -1;
      win.body.addEventListener('keydown', function (e) { if (e.key === ' ' && e.target === win.body) { e.preventDefault(); toggle(); } });

      var off = vfs.on('change', U.debounce(function () { if (!win.closed) renderList(); }, 100));
      win.onDestroy(function () { off(); audio.pause(); audio.removeAttribute('src'); if (objUrl) URL.revokeObjectURL(objUrl); });
      win._onRelaunch = function (a) { if (a.fileId) { var s = library(); playList(s, Math.max(0, s.findIndex(function (x) { return x.id === a.fileId; }))); } };
      updateBtns(); renderList();
      if (args.fileId && vfs.exists(args.fileId)) win._onRelaunch(args);
    }
  });
})();
