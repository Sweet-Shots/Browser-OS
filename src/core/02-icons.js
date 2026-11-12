/* =====================================================================
   CORE 2: ICONS
   All icons are drawn for Nimbus. UI glyphs are 24x24 rounded strokes
   using currentColor. App icons are circles whose colors come from CSS
   variables (--ic-bg / --ic-fg), so "themed icons" can recolor them
   from the wallpaper palette.
   ===================================================================== */
(function () {
  'use strict';

  function glyph(d, filled) {
    return '<svg viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none') + '" stroke="' + (filled ? 'none' : 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /** Gear outline generated from polar coordinates (used by the Settings icon). */
  function gearPath(cx, cy, teeth, rO, rI, hole) {
    var pts = [], step = Math.PI * 2 / teeth;
    for (var i = 0; i < teeth; i++) {
      var a = i * step - Math.PI / 2;
      [[-0.30, rI], [-0.17, rO], [0.17, rO], [0.30, rI]].forEach(function (p) {
        var ang = a + p[0] * step * 1.6;
        pts.push((cx + Math.cos(ang) * p[1]).toFixed(2) + ' ' + (cy + Math.sin(ang) * p[1]).toFixed(2));
      });
    }
    return 'M' + pts.join('L') + 'Z M' + (cx + hole) + ' ' + cy + 'a' + hole + ' ' + hole + ' 0 1 0 ' + (-2 * hole) + ' 0a' + hole + ' ' + hole + ' 0 1 0 ' + (2 * hole) + ' 0Z';
  }

  var FG = 'var(--ic-fg,#fff)', BG = 'var(--ic-bg,#555)';
  /** App icon: colored circle + glyph drawn in a 24-unit box centered in 48. */
  function appIcon(color, inner) {
    return '<svg viewBox="0 0 48 48" aria-hidden="true" style="--ic-bg-default:' + color + '">' +
      '<circle cx="24" cy="24" r="22" fill="var(--ic-bg,' + color + ')"/>' +
      '<g transform="translate(12 12)">' + inner.replace(/\$BG/g, 'var(--ic-bg,' + color + ')') + '</g></svg>';
  }

  var appIcons = {
    explorer: appIcon('#e3a03a', '<path fill="' + FG + '" d="M2 6.2A2.2 2.2 0 0 1 4.2 4h4.5l2.1 2.3h8A2.2 2.2 0 0 1 21 8.5v9.3a2.2 2.2 0 0 1-2.2 2.2H4.2A2.2 2.2 0 0 1 2 17.8z"/><path d="M2.5 9.6h18" stroke="$BG" stroke-width="1.6" opacity=".55"/>'),
    notepad: appIcon('#4f7fe0', '<path fill="' + FG + '" d="M6 2.5h8.5L19 7v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4A1.5 1.5 0 0 1 6.5 2.5z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" stroke="$BG" stroke-width="1.7" stroke-linecap="round"/>'),
    todo: appIcon('#2f9d6d', '<circle cx="12" cy="12" r="9.5" fill="' + FG + '"/><path d="M7.6 12.3l3 3 5.8-6.2" fill="none" stroke="$BG" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    calculator: appIcon('#647386', '<rect x="3" y="3" width="18" height="18" rx="4.5" fill="' + FG + '"/><path d="M7.5 8.5h4M9.5 6.5v4M13.5 8.5h3.5M7.6 14.6l2.8 2.8M10.4 14.6l-2.8 2.8M13.5 15h3.5M13.5 17.4h3.5" stroke="$BG" stroke-width="1.6" stroke-linecap="round"/>'),
    paint: appIcon('#d4567f', '<path fill="' + FG + '" fill-rule="evenodd" d="M12 2.5c5.5 0 9.5 3.7 9.5 8.2 0 2.9-2.1 4.8-4.6 4.8h-1.8c-1 0-1.6.9-1.2 1.8.6 1.3-.2 3.2-1.9 3.2C6.6 20.5 2.5 16.6 2.5 11.5 2.5 6.5 6.7 2.5 12 2.5zM7.3 12.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM10.3 8a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM15 8a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 15 8z"/>'),
    settings: appIcon('#5c6575', '<path fill="' + FG + '" fill-rule="evenodd" d="' + gearPath(12, 12, 8, 10, 7.6, 3.2) + '"/>'),
    terminal: appIcon('#2c3038', '<rect x="2.5" y="4" width="19" height="16" rx="3.5" fill="' + FG + '"/><path d="M6.5 9.5l3 2.5-3 2.5M11.5 15.5h5.5" fill="none" stroke="$BG" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    store: appIcon('#3a86c8', '<path fill="' + FG + '" d="M5.2 7.5h13.6l-1 12a1.8 1.8 0 0 1-1.8 1.6H8a1.8 1.8 0 0 1-1.8-1.6z"/><path d="M8.8 10V6.8a3.2 3.2 0 0 1 6.4 0V10" fill="none" stroke="' + FG + '" stroke-width="2" stroke-linecap="round"/><path d="M9.5 14.2l2.5 2.4 2.5-2.4" fill="none" stroke="$BG" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    browser: appIcon('#1f8f9f', '<circle cx="12" cy="12" r="9.5" fill="' + FG + '"/><path d="M2.8 12h18.4M12 2.6c2.6 2.6 3.8 5.8 3.8 9.4s-1.2 6.8-3.8 9.4M12 2.6C9.4 5.2 8.2 8.4 8.2 12s1.2 6.8 3.8 9.4M4.3 7h15.4M4.3 17h15.4" fill="none" stroke="$BG" stroke-width="1.4"/>'),
    photos: appIcon('#e06a48', '<rect x="2.5" y="3.5" width="19" height="17" rx="4" fill="' + FG + '"/><path d="M5 18l4.6-5.6 3.2 3.6 2.1-2.3L19 18z" fill="$BG"/><circle cx="15.8" cy="8.4" r="1.9" fill="$BG"/>'),
    music: appIcon('#8a5cd6', '<path fill="' + FG + '" d="M9 5.8l10-2.3v11.6a3 3 0 1 1-2-2.8V7.4l-6 1.4v8.5a3 3 0 1 1-2-2.8z"/>'),
    clock: appIcon('#3f56a6', '<circle cx="12" cy="12" r="9.5" fill="' + FG + '"/><path d="M12 6.8V12l3.6 2.2" fill="none" stroke="$BG" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    solitaire: appIcon('#2b7a4b', '<rect x="3" y="4.5" width="11" height="15" rx="2" transform="rotate(-12 8.5 12)" fill="' + FG + '" opacity=".55"/><rect x="9" y="3.5" width="11.5" height="16" rx="2.2" fill="' + FG + '"/><path d="M14.75 7.6c1.8 2 3.4 3 3.4 4.6a1.8 1.8 0 0 1-3 1.3l.6 2.4h-2l.6-2.4a1.8 1.8 0 0 1-3-1.3c0-1.6 1.6-2.6 3.4-4.6z" fill="$BG"/>'),
    comet: appIcon('#4b3fb8', '<path d="M3.5 20.5L13 11" stroke="' + FG + '" stroke-width="2.4" stroke-linecap="round" opacity=".45"/><path d="M6 14.5l6-6M9.5 18l6-6" stroke="' + FG + '" stroke-width="2" stroke-linecap="round" opacity=".7"/><circle cx="16" cy="8" r="5" fill="' + FG + '"/>'),
    sudoku: appIcon('#c25a3c', '<rect x="3" y="3" width="18" height="18" rx="3.5" fill="' + FG + '"/><path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" stroke="$BG" stroke-width="1.5"/><text x="6" y="7.6" font-size="4.6" font-weight="700" text-anchor="middle" fill="$BG" font-family="sans-serif">4</text><text x="18" y="19.6" font-size="4.6" font-weight="700" text-anchor="middle" fill="$BG" font-family="sans-serif">7</text><text x="12" y="13.6" font-size="4.6" font-weight="700" text-anchor="middle" fill="$BG" font-family="sans-serif">2</text>'),
    generic: appIcon('#6b72c9', '<rect x="4" y="4" width="16" height="16" rx="4.5" fill="' + FG + '"/>')
  };

  var icons = {
    apps: glyph('<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>', true),
    launcher: glyph('<circle cx="12" cy="12" r="7.5"/>'),
    save: glyph('<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9.4L20 8.1v10.4a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 18.5z"/><path d="M8.5 4v4h6V4M8.5 20v-5.5h7V20"/>'),
    download: glyph('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>'),
    upload: glyph('<path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9M5 20h14"/>'),
    lock: glyph('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
    unlock: glyph('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>'),
    close: glyph('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
    minimize: glyph('<path d="M6.5 12h11"/>'),
    maximize: glyph('<rect x="6" y="6" width="12" height="12" rx="2.5"/>'),
    restore: glyph('<rect x="5" y="9" width="10" height="10" rx="2"/><path d="M9 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/>'),
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 6.5A2.2 2.2 0 0 1 4.7 4.3h4.4l2 2.2h8.2a2.2 2.2 0 0 1 2.2 2.2v9a2.2 2.2 0 0 1-2.2 2.2H4.7a2.2 2.2 0 0 1-2.2-2.2z" fill="var(--folder,#e3a03a)"/><path d="M2.5 9.4h19" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 2.5h7.9l4.8 4.8v13a1.7 1.7 0 0 1-1.7 1.7H6.3a1.7 1.7 0 0 1-1.7-1.7V4.2a1.7 1.7 0 0 1 1.7-1.7z" fill="#9aa5b8"/><path d="M14.2 2.5v4.8H19" fill="#7c879b"/></svg>',
    fileText: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 2.5h7.9l4.8 4.8v13a1.7 1.7 0 0 1-1.7 1.7H6.3a1.7 1.7 0 0 1-1.7-1.7V4.2a1.7 1.7 0 0 1 1.7-1.7z" fill="#4f7fe0"/><path d="M14.2 2.5v4.8H19" fill="#3a66c4"/><path d="M8 12h8M8 15h8M8 18h5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>',
    fileImage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 2.5h7.9l4.8 4.8v13a1.7 1.7 0 0 1-1.7 1.7H6.3a1.7 1.7 0 0 1-1.7-1.7V4.2a1.7 1.7 0 0 1 1.7-1.7z" fill="#e06a48"/><path d="M14.2 2.5v4.8H19" fill="#c0512f"/><path d="M7.3 18.5l3-3.8 2 2.4 1.5-1.6 2.9 3z" fill="#fff"/><circle cx="9.6" cy="11.4" r="1.4" fill="#fff"/></svg>',
    fileAudio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 2.5h7.9l4.8 4.8v13a1.7 1.7 0 0 1-1.7 1.7H6.3a1.7 1.7 0 0 1-1.7-1.7V4.2a1.7 1.7 0 0 1 1.7-1.7z" fill="#8a5cd6"/><path d="M14.2 2.5v4.8H19" fill="#6d43b8"/><path d="M10.5 10.3l5-1.2v6.4a1.5 1.5 0 1 1-1-1.4v-3.2l-3 .7v4.4a1.5 1.5 0 1 1-1-1.4z" fill="#fff"/></svg>',
    fileCode: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 2.5h7.9l4.8 4.8v13a1.7 1.7 0 0 1-1.7 1.7H6.3a1.7 1.7 0 0 1-1.7-1.7V4.2a1.7 1.7 0 0 1 1.7-1.7z" fill="#1f8f9f"/><path d="M14.2 2.5v4.8H19" fill="#167381"/><path d="M10 12l-2.2 2.5L10 17M14 12l2.2 2.5L14 17" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trashFull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 7h13l-1.1 12.6a1.6 1.6 0 0 1-1.6 1.4H8.2a1.6 1.6 0 0 1-1.6-1.4z" fill="#8892a4"/><rect x="4" y="4.3" width="16" height="2.7" rx="1.2" fill="#6b7486"/><path d="M10 10.5v6.5M14 10.5v6.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>',
    newFolder: glyph('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>'),
    newFile: glyph('<path d="M6.5 3h7.5l4.5 4.5V19a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M12 11v6M9 14h6"/>'),
    rename: glyph('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    trash: glyph('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7"/>'),
    restoreFile: glyph('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'),
    move: glyph('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13h6M12.5 10.5L15 13l-2.5 2.5"/>'),
    copy: glyph('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    cut: glyph('<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.7L18 4M15.7 15.7L6 4"/>'),
    paste: glyph('<path d="M9 4h6v3H9z"/><path d="M15 5.5h2.5a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V7a1.5 1.5 0 0 1 1.5-1.5H9"/>'),
    up: glyph('<path d="M12 19V5.5M6 11l6-6 6 6"/>'),
    back: glyph('<path d="M19 12H5.5M11 6l-6 6 6 6"/>'),
    forward: glyph('<path d="M5 12h13.5M13 6l6 6-6 6"/>'),
    refresh: glyph('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>'),
    home: glyph('<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v5.5H5.5A1.5 1.5 0 0 1 4 19z"/>'),
    open: glyph('<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'),
    undo: glyph('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    redo: glyph('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    brush: glyph('<path d="M18.4 3.6a2.1 2.1 0 0 1 3 3L12 16l-4-4z"/><path d="M8 12c-2.5 0-4 2-4 4 0 1.5-1 2.5-2 3 4 1 8 0 8-4z"/>'),
    eraser: glyph('<path d="M7 20h13M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H7.5z"/><path d="M9 11l5 5"/>'),
    fill: glyph('<path d="M5 12l7-7 7 7-7 7z"/><path d="M19.5 15.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>'),
    line: glyph('<path d="M5 19L19 5"/>'),
    rect: glyph('<rect x="4.5" y="6" width="15" height="12" rx="1.5"/>'),
    circle: glyph('<circle cx="12" cy="12" r="7.5"/>'),
    picker: glyph('<path d="M14.5 5.5l4 4M12 8l4 4-8.5 8.5H3.5v-4z"/><path d="M15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3l-2 2-4-4z"/>'),
    clear: glyph('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    plus: glyph('<path d="M12 5v14M5 12h14"/>'),
    minus: glyph('<path d="M5 12h14"/>'),
    grip: glyph('<circle cx="9" cy="6" r=".9"/><circle cx="15" cy="6" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="18" r=".9"/><circle cx="15" cy="18" r=".9"/>'),
    edit: glyph('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>'),
    eye: glyph('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    chevUp: glyph('<path d="M6 15l6-6 6 6"/>'),
    chevDown: glyph('<path d="M6 9l6 6 6-6"/>'),
    chevLeft: glyph('<path d="M15 6l-6 6 6 6"/>'),
    chevRight: glyph('<path d="M9 6l6 6-6 6"/>'),
    info: glyph('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>'),
    shield: glyph('<path d="M12 3l7.5 3v5.5c0 4.7-3.2 7.9-7.5 9.5-4.3-1.6-7.5-4.8-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>'),
    sun: glyph('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    moon: glyph('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    auto: glyph('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>'),
    database: glyph('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
    image: glyph('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>'),
    palette: glyph('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.5A4.5 4.5 0 0 0 21 9.9C21 6 16.9 3 12 3z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
    warning: glyph('<path d="M10.3 4.3L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17.3v.2"/>'),
    search: glyph('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>'),
    star: glyph('<path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8L8 13.6 3.8 9.7l5.7-.7z"/>'),
    starFilled: glyph('<path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8L8 13.6 3.8 9.7l5.7-.7z" fill="currentColor"/>'),
    globe: glyph('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.6 5.6 3.6 9s-1.1 6.5-3.6 9M12 3C9.5 5.5 8.4 8.6 8.4 12s1.1 6.5 3.6 9"/>'),
    play: glyph('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
    pause: glyph('<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>'),
    skipNext: glyph('<path d="M6 6v12l8.5-6z" fill="currentColor"/><path d="M18 6v12"/>'),
    skipPrev: glyph('<path d="M18 6v12l-8.5-6z" fill="currentColor"/><path d="M6 6v12"/>'),
    shuffle: glyph('<path d="M16 4h4v4M4 20L20 4M16 20h4v-4M14.5 14.5L20 20M4 4l5 5"/>'),
    repeat: glyph('<path d="M17 2.5l3 3-3 3"/><path d="M4 11.5v-2a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3"/><path d="M20 12.5v2a4 4 0 0 1-4 4H4"/>'),
    clock: glyph('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    timer: glyph('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>'),
    alarm: glyph('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M5 3.5L2.5 6M19 3.5L21.5 6"/>'),
    stopwatch: glyph('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V10M10 2.5h4M18.5 6.5l1.5-1.5"/>'),
    flag: glyph('<path d="M5 21V4.5M5 4.5h11l-2 4 2 4H5"/>'),
    volume: glyph('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    volumeOff: glyph('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
    fullscreen: glyph('<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>'),
    fullscreenExit: glyph('<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>'),
    bell: glyph('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    person: glyph('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6"/>'),
    more: glyph('<circle cx="12" cy="5.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor"/>'),
    pin: glyph('<path d="M9 4h6l-1 5 3.5 3.5v1.5h-11v-1.5L10 9z"/><path d="M12 14v6.5"/>'),
    check: glyph('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    list: glyph('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1" fill="currentColor"/>'),
    gridView: glyph('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
    sliders: glyph('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    game: glyph('<path d="M7 7.5h10a5 5 0 0 1 4.8 6.3l-.8 2.9a2.6 2.6 0 0 1-4.4 1.1L14.3 15H9.7l-2.3 2.8a2.6 2.6 0 0 1-4.4-1.1l-.8-2.9A5 5 0 0 1 7 7.5z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="16" cy="11" r=".8" fill="currentColor"/><circle cx="17.5" cy="13" r=".8" fill="currentColor"/>'),
    sparkle: glyph('<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
    file2: glyph('<path d="M6.5 3h7.5l4.5 4.5V19a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v4.5h4.5"/>'),
    desktop: glyph('<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>'),
    music: glyph('<path d="M9 18V6l11-2.5v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>'),
    document: glyph('<path d="M6.5 3h7.5l4.5 4.5V19a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8.5 12.5h7M8.5 16h7"/>'),
    bag: glyph('<path d="M5.5 8h13l-1 11.5a1.8 1.8 0 0 1-1.8 1.5H8.3a1.8 1.8 0 0 1-1.8-1.5z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
    code: glyph('<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/>'),
    tab: glyph('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/>'),
    history: glyph('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l3 2"/>'),
    bookmark: glyph('<path d="M6.5 4h11v16.5L12 16.8l-5.5 3.7z"/>'),
    keyboard: glyph('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.3 10h.01M12.6 10h.01M16 10h.01M7.5 14h9"/>'),
    trophy: glyph('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3 3 0 0 0 8 10.5M16 6h3.5v1.5a3 3 0 0 1-3.5 3M12 13v4M8.5 20.5h7M10 17h4"/>'),
    lightbulb: glyph('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>'),
    power: glyph('<path d="M12 3.5v8M7 6.5a7.5 7.5 0 1 0 10 0"/>')
  };

  OS.icons = icons;
  OS.appIcons = appIcons;
  OS.makeAppIcon = appIcon;
})();
