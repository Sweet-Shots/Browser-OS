/* =====================================================================
   CORE 8: SOUND
   Every sound is synthesized with the Web Audio API (no audio files).
   Browsers only allow audio after a user gesture, so the first sounds
   may be silent until the user clicks or types; that's expected.
   ===================================================================== */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null;

  function settings() { return (OS.state && OS.state.settings.sound) || { enabled: true, volume: 0.6, ui: true }; }
  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination); } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    master.gain.value = settings().volume;
    return ctx;
  }
  // Unlock audio on the first interaction.
  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function once() { ensure(); window.removeEventListener(ev, once, true); }, true);
  });

  /** One note: frequency, start offset (s), duration (s), waveform, peak gain. */
  function note(f, at, dur, type, peak, glideTo) {
    var c = ctx, t0 = c.currentTime + (at || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(at, dur, peak, freq) {
    var c = ctx, t0 = c.currentTime + (at || 0);
    var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = 0.9;
    g.gain.value = peak || 0.2;
    src.connect(f); f.connect(g); g.connect(master); src.start(t0);
  }

  // Note frequencies
  var N = { C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5 };

  var SOUNDS = {
    startup: function () { [N.C5, N.G5, N.E5, N.C6].forEach(function (f, i) { note(f, i * 0.11, 1.4 - i * 0.15, 'sine', 0.16); note(f * 2, i * 0.11, 0.5, 'sine', 0.03); }); },
    unlock: function () { note(N.E5, 0, 0.18, 'sine', 0.16); note(N.A5, 0.08, 0.3, 'sine', 0.16); },
    lock: function () { note(N.A5, 0, 0.16, 'sine', 0.15); note(N.E5, 0.08, 0.3, 'sine', 0.15); },
    open: function () { note(N.G5, 0, 0.09, 'sine', 0.07, N.C6); },
    close: function () { note(N.C6, 0, 0.1, 'sine', 0.06, N.G5); },
    minimize: function () { note(N.E5, 0, 0.12, 'sine', 0.05, N.C5); },
    click: function () { note(1800, 0, 0.03, 'triangle', 0.035); },
    notify: function () { note(N.E5, 0, 0.25, 'sine', 0.14); note(N.B5, 0.12, 0.45, 'sine', 0.12); },
    success: function () { note(N.C5, 0, 0.16, 'sine', 0.13); note(N.E5, 0.08, 0.16, 'sine', 0.13); note(N.G5, 0.16, 0.42, 'sine', 0.13); },
    error: function () { note(220, 0, 0.16, 'triangle', 0.16); note(196, 0.13, 0.26, 'triangle', 0.16); },
    trash: function () { noise(0, 0.22, 0.25, 1400); note(400, 0, 0.15, 'sine', 0.06, 180); },
    alarm: function () { for (var i = 0; i < 4; i++) { note(N.A5, i * 0.28, 0.12, 'square', 0.06); note(N.E6, i * 0.28 + 0.13, 0.12, 'square', 0.05); } },
    pop: function () { note(660, 0, 0.07, 'sine', 0.1, 1100); },
    win: function () { [N.C5, N.E5, N.G5, N.C6, N.E6].forEach(function (f, i) { note(f, i * 0.09, 0.5, 'triangle', 0.1); }); },
    lose: function () { [N.G4, N.E4, N.C4].forEach(function (f, i) { note(f, i * 0.16, 0.35, 'triangle', 0.12); }); }
  };
  var UI = { open: 1, close: 1, minimize: 1, click: 1, pop: 1 };

  OS.sound = {
    available: !!AC,
    names: Object.keys(SOUNDS),
    /** Play a named sound if sounds are on. opts.force plays even when disabled (used for previews). */
    play: function (name, opts) {
      var s = settings();
      if (!(opts && opts.force)) {
        if (!s.enabled) return;
        if (UI[name] && !s.ui) return;
      }
      if (!SOUNDS[name] || !ensure()) return;
      try { SOUNDS[name](); } catch (e) { /* audio is best-effort */ }
    },
    setVolume: function (v) { if (master) master.gain.value = v; }
  };
})();
