/* =====================================================================
   CORE 7: THEME (dynamic color + wallpapers)
   A single "seed" color (taken from the wallpaper) produces tonal
   palettes in OKLCH, which are mapped to Material-style color roles
   (primary, containers, surfaces...) for light and dark mode.
   Wallpapers are original vector artwork generated as SVG.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- color math: sRGB <-> OKLab/OKLCH ---------------- */
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function rgbToOklch(rgb) {
    var r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var H = Math.atan2(B, A) * 180 / Math.PI;
    return { L: L, C: Math.sqrt(A * A + B * B), H: H < 0 ? H + 360 : H };
  }
  function oklchToRgb(L, C, H) {
    var a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }
  function inGamut(rgb) { return rgb.every(function (c) { return c >= -0.0005 && c <= 1.0005; }); }
  /** Color at a given lightness/chroma/hue; chroma is reduced until it fits in sRGB. */
  function tone(L, C, H) {
    var rgb = oklchToRgb(L, C, H);
    while (!inGamut(rgb) && C > 0.001) { C *= 0.92; rgb = oklchToRgb(L, C, H); }
    return rgb.map(function (c) { return Math.round(Math.max(0, Math.min(1, c)) * 255); });
  }
  function hex(rgb) { return '#' + rgb.map(function (c) { return c.toString(16).padStart(2, '0'); }).join(''); }
  function rgba(rgb, a) { return 'rgba(' + rgb.join(',') + ',' + a + ')'; }

  /** Build all color roles for a seed color. */
  function scheme(seedHex, dark) {
    var s = rgbToOklch(hexToRgb(seedHex));
    var H = s.H, C = Math.max(0.03, Math.min(s.C, 0.16));
    var nC = Math.min(C * 0.12, 0.018), nvC = Math.min(C * 0.25, 0.035);   // neutral / neutral-variant chroma
    var H2 = (H + 30) % 360;                                               // tertiary-ish hue for accents
    var t = function (L, c, h) { return tone(L, c, h == null ? H : h); };
    var r = dark ? {
      primary: t(0.80, C * 0.75), onPrimary: t(0.28, C * 0.6),
      primaryContainer: t(0.36, C * 0.65), onPrimaryContainer: t(0.92, C * 0.35),
      secondaryContainer: t(0.33, nvC * 1.4), onSecondaryContainer: t(0.91, nvC),
      tertiaryContainer: t(0.36, C * 0.55, H2), onTertiaryContainer: t(0.92, C * 0.3, H2),
      surface: t(0.17, nC), surfaceLow: t(0.195, nC), surfaceC: t(0.215, nC), surfaceHigh: t(0.245, nC), surfaceHighest: t(0.275, nC),
      onSurface: t(0.93, nC * 0.6), onSurfaceVariant: t(0.79, nvC), outline: t(0.60, nvC), outlineVariant: t(0.36, nvC),
      error: tone(0.78, 0.13, 25), onError: tone(0.3, 0.1, 25), errorContainer: tone(0.38, 0.12, 25), onErrorContainer: tone(0.92, 0.05, 25),
      success: tone(0.78, 0.12, 150), warn: tone(0.82, 0.13, 80)
    } : {
      primary: t(0.50, C), onPrimary: [255, 255, 255],
      primaryContainer: t(0.91, C * 0.4), onPrimaryContainer: t(0.27, C * 0.8),
      secondaryContainer: t(0.92, nvC * 1.3), onSecondaryContainer: t(0.27, nvC),
      tertiaryContainer: t(0.91, C * 0.35, H2), onTertiaryContainer: t(0.27, C * 0.7, H2),
      surface: t(0.985, nC * 0.6), surfaceLow: t(0.965, nC), surfaceC: t(0.948, nC), surfaceHigh: t(0.928, nC), surfaceHighest: t(0.905, nC),
      onSurface: t(0.22, nC), onSurfaceVariant: t(0.43, nvC), outline: t(0.62, nvC), outlineVariant: t(0.86, nvC),
      error: tone(0.53, 0.18, 25), onError: [255, 255, 255], errorContainer: tone(0.92, 0.04, 25), onErrorContainer: tone(0.32, 0.12, 25),
      success: tone(0.52, 0.12, 150), warn: tone(0.58, 0.13, 70)
    };
    return r;
  }

  function cssVars(sc, dark) {
    var v = {
      '--primary': hex(sc.primary), '--on-primary': hex(sc.onPrimary),
      '--primary-container': hex(sc.primaryContainer), '--on-primary-container': hex(sc.onPrimaryContainer),
      '--secondary-container': hex(sc.secondaryContainer), '--on-secondary-container': hex(sc.onSecondaryContainer),
      '--tertiary-container': hex(sc.tertiaryContainer), '--on-tertiary-container': hex(sc.onTertiaryContainer),
      '--surface': hex(sc.surface), '--surface-low': hex(sc.surfaceLow), '--surface-container': hex(sc.surfaceC),
      '--surface-high': hex(sc.surfaceHigh), '--surface-highest': hex(sc.surfaceHighest),
      '--on-surface': hex(sc.onSurface), '--on-surface-variant': hex(sc.onSurfaceVariant),
      '--outline': hex(sc.outline), '--outline-variant': hex(sc.outlineVariant),
      '--error': hex(sc.error), '--on-error': hex(sc.onError), '--error-container': hex(sc.errorContainer), '--on-error-container': hex(sc.onErrorContainer),
      '--success': hex(sc.success), '--warn': hex(sc.warn),
      '--hover': rgba(sc.onSurface, 0.08), '--pressed': rgba(sc.onSurface, 0.12),
      '--selected': rgba(sc.primary, dark ? 0.24 : 0.14), '--focus-ring': rgba(sc.primary, 0.45),
      '--scrim': dark ? 'rgba(0,0,0,.55)' : 'rgba(10,14,24,.32)',
      '--glass': rgba(sc.surfaceC, dark ? 0.78 : 0.8), '--glass-strong': rgba(sc.surfaceLow, dark ? 0.9 : 0.9),
      '--shadow-1': dark ? '0 1px 3px rgba(0,0,0,.4)' : '0 1px 2px rgba(20,25,40,.08), 0 1px 3px rgba(20,25,40,.06)',
      '--shadow-2': dark ? '0 6px 20px rgba(0,0,0,.45)' : '0 4px 14px rgba(20,25,40,.10), 0 1px 3px rgba(20,25,40,.06)',
      '--shadow-3': dark ? '0 18px 48px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4)' : '0 18px 44px rgba(20,25,40,.18), 0 3px 10px rgba(20,25,40,.08)'
    };
    return v;
  }

  /* ---------------- wallpapers (original vector art) ---------------- */
  function svgURL(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  function svg(inner, bg) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="1600" height="1000" fill="' + bg + '"/>' + inner + '</svg>';
  }
  function lg(id, a, b, vertical) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (vertical ? 0 : 1) + '" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
  }
  function rg(id, c, o) {
    return '<radialGradient id="' + id + '"><stop offset="0" stop-color="' + c + '" stop-opacity="' + o + '"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>';
  }

  var WALLPAPERS = {
    dunes: { name: 'Dunes', seed: '#c9824e', art: function (d) {
      var c = d ? ['#2a1d22', '#4a2c2c', '#6b3b33', '#8d4c3a', '#b0603f', '#e2a36f'] : ['#f6d8b8', '#f0b98c', '#e59c6b', '#d27f53', '#b9653f', '#fff0dc'];
      return svg('<defs>' + lg('s', c[0], c[1], 1) + '</defs><rect width="1600" height="1000" fill="url(#s)"/>' +
        '<circle cx="1180" cy="300" r="110" fill="' + c[5] + '" opacity="' + (d ? .5 : .9) + '"/>' +
        '<path d="M0 560C260 470 520 520 760 600S1260 700 1600 560V1000H0z" fill="' + c[2] + '"/>' +
        '<path d="M0 690C300 610 600 650 880 730S1340 800 1600 700V1000H0z" fill="' + c[3] + '"/>' +
        '<path d="M0 820C240 760 520 790 800 850S1300 920 1600 830V1000H0z" fill="' + c[4] + '"/>', c[0]);
    } },
    peaks: { name: 'Peaks', seed: '#4f7fc8', art: function (d) {
      var c = d ? ['#0f1626', '#1b2a45', '#233a60', '#2d4b7a', '#3a5f95', '#c9d6f0'] : ['#dbe6f8', '#b8cdf0', '#8aaee6', '#6690d6', '#4a73bd', '#ffffff'];
      return svg('<defs>' + lg('s', c[0], c[1], 1) + '</defs><rect width="1600" height="1000" fill="url(#s)"/>' +
        '<circle cx="1240" cy="230" r="56" fill="' + c[5] + '" opacity="' + (d ? .35 : .55) + '"/>' +
        '<path d="M0 640L260 400 430 520 700 260 980 560 1160 420 1600 700V1000H0z" fill="' + c[2] + '"/>' +
        '<path d="M0 760L340 520 560 660 860 470 1180 700 1380 600 1600 740V1000H0z" fill="' + c[3] + '"/>' +
        '<path d="M0 880L300 720 640 840 980 690 1300 860 1600 780V1000H0z" fill="' + c[4] + '"/>', c[0]);
    } },
    bloom: { name: 'Bloom', seed: '#b4589a', art: function (d) {
      var bg = d ? '#1c1420' : '#fbe9f2', a = d ? '#7a2f6a' : '#f2a7cf', b = d ? '#4b2a7a' : '#c9b2f5', c2 = d ? '#8f3b4f' : '#ffc4b8';
      return svg('<defs>' + rg('a', a, d ? .9 : 1) + rg('b', b, d ? .9 : 1) + rg('c', c2, d ? .8 : 1) + '</defs>' +
        '<circle cx="380" cy="300" r="520" fill="url(#a)"/><circle cx="1250" cy="380" r="560" fill="url(#b)"/><circle cx="820" cy="900" r="520" fill="url(#c)"/>' +
        '<circle cx="1180" cy="760" r="140" fill="none" stroke="' + (d ? '#ffffff' : '#7a3a66') + '" stroke-opacity=".12" stroke-width="2"/>' +
        '<circle cx="1180" cy="760" r="210" fill="none" stroke="' + (d ? '#ffffff' : '#7a3a66') + '" stroke-opacity=".08" stroke-width="2"/>', bg);
    } },
    tide: { name: 'Tide', seed: '#2b8f88', art: function (d) {
      var c = d ? ['#0b1d1f', '#0f2e30', '#134246', '#17585b', '#1d6f70'] : ['#e3f4f1', '#b8e3dc', '#86cdc3', '#56b1a7', '#2f8f88'];
      var p = '';
      for (var i = 0; i < 4; i++) {
        var y = 430 + i * 140;
        p += '<path d="M0 ' + y + 'C200 ' + (y - 70) + ' 400 ' + (y + 70) + ' 600 ' + y + 'S1000 ' + (y - 70) + ' 1200 ' + y + 'S1500 ' + (y + 50) + ' 1600 ' + (y - 20) + 'V1000H0z" fill="' + c[i + 1] + '"/>';
      }
      return svg(p, c[0]);
    } },
    meadow: { name: 'Meadow', seed: '#6c9a3e', art: function (d) {
      var c = d ? ['#111a12', '#1a2a18', '#22381d', '#2c4a22', '#3a5e2a', '#e8e3b0'] : ['#eef4dc', '#d6e8b0', '#b6d483', '#94bd5c', '#729f3f', '#fff6c8'];
      return svg('<defs>' + lg('s', c[0], c[1], 1) + '</defs><rect width="1600" height="1000" fill="url(#s)"/>' +
        '<circle cx="1260" cy="260" r="90" fill="' + c[5] + '" opacity="' + (d ? .45 : .95) + '"/>' +
        '<ellipse cx="350" cy="900" rx="900" ry="400" fill="' + c[2] + '"/>' +
        '<ellipse cx="1350" cy="980" rx="900" ry="420" fill="' + c[3] + '"/>' +
        '<ellipse cx="700" cy="1150" rx="1000" ry="420" fill="' + c[4] + '"/>', c[0]);
    } },
    dusk: { name: 'Dusk', seed: '#6a5acd', art: function (d) {
      var top = d ? '#0d0b1e' : '#2e2766', low = d ? '#5b2d5f' : '#e58fb1';
      var stars = '', rnd = 7;
      for (var i = 0; i < 70; i++) { rnd = (rnd * 9301 + 49297) % 233280; var x = rnd / 233280 * 1600; rnd = (rnd * 9301 + 49297) % 233280; var y = rnd / 233280 * 560; stars += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (1 + (i % 3) * 0.6) + '" fill="#fff" opacity="' + (0.35 + (i % 5) * 0.12) + '"/>'; }
      return svg('<defs>' + lg('s', top, low, 1) + '</defs><rect width="1600" height="1000" fill="url(#s)"/>' + stars +
        '<mask id="moon"><circle cx="1230" cy="250" r="70" fill="#fff"/><circle cx="1262" cy="228" r="62" fill="#000"/></mask>' +
        '<circle cx="1230" cy="250" r="70" fill="#fff4e0" opacity=".92" mask="url(#moon)"/>' +
        '<path d="M0 820C300 760 600 800 900 780S1400 740 1600 790V1000H0z" fill="' + (d ? '#140f26' : '#3a2f6e') + '"/>', top);
    } }
  };

  /** Find a seed color in an image (most common strongly-colored hue) and how bright its top-left area is. */
  function seedFromImage(dataURL) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = 48; c.height = 48;
          var x = c.getContext('2d'); x.drawImage(img, 0, 0, 48, 48);
          var px = x.getImageData(0, 0, 48, 48).data, bins = new Array(36).fill(0), sums = new Array(36).fill(null);
          var lumSum = 0, lumN = 0;
          for (var i = 0; i < px.length; i += 4) {
            var p = i / 4, row = Math.floor(p / 48), col = p % 48;
            if (row < 20 && col < 24) { lumSum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; lumN++; }
            var o = rgbToOklch([px[i] / 255, px[i + 1] / 255, px[i + 2] / 255]);
            if (o.C < 0.04 || o.L < 0.2 || o.L > 0.95) continue;
            var b = Math.floor(o.H / 10) % 36, w = o.C;
            bins[b] += w;
            sums[b] = sums[b] || [0, 0, 0, 0];
            sums[b][0] += px[i] * w; sums[b][1] += px[i + 1] * w; sums[b][2] += px[i + 2] * w; sums[b][3] += w;
          }
          var best = bins.indexOf(Math.max.apply(null, bins));
          var light = lumN ? lumSum / lumN / 255 > 0.62 : false;
          if (!sums[best]) return resolve({ seed: '#6b72c9', light: light });
          var s = sums[best];
          resolve({ seed: hex([s[0] / s[3], s[1] / s[3], s[2] / s[3]].map(Math.round)), light: light });
        } catch (e) { resolve({ seed: '#6b72c9', light: false }); }
      };
      img.onerror = function () { resolve({ seed: '#6b72c9', light: false }); };
      img.src = dataURL;
    });
  }

  var seedCache = {};
  var media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var theme = {
    WALLPAPERS: WALLPAPERS,
    scheme: scheme, hexToRgb: hexToRgb, rgbToOklch: rgbToOklch,
    current: { seed: '#6b72c9', dark: false },

    isDark: function () {
      var t = OS.state ? OS.state.settings.theme : 'auto';
      if (t === 'dark') return true;
      if (t === 'light') return false;
      return !!(media && media.matches);
    },
    /** Seed color for the current wallpaper (or the chosen accent). */
    seed: async function () {
      var s = OS.state && OS.state.settings;
      if (!s) return '#6b72c9';
      if (s.accent && s.accent !== 'auto') return s.accent;
      var wp = s.wallpaper || {};
      if (wp.type === 'color') return wp.value;
      if (wp.type === 'image' && OS.vfs.exists(wp.value)) {
        if (seedCache.id !== wp.value) {
          var r = await seedFromImage(OS.vfs.readDataURL(wp.value));
          seedCache = { id: wp.value, seed: r.seed, light: r.light };   // memory only, never saved
        }
        return seedCache.seed;
      }
      return (WALLPAPERS[wp.value] || WALLPAPERS.peaks).seed;
    },
    /** Apply colors + wallpaper. Safe to call often. */
    apply: async function () {
      var dark = this.isDark();
      var seed = await this.seed();
      this.current = { seed: seed, dark: dark };
      var root = document.documentElement;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      var vars = cssVars(scheme(seed, dark), dark);
      for (var k in vars) root.style.setProperty(k, vars[k]);
      root.classList.toggle('themed-icons', !!(OS.state && OS.state.settings.iconStyle === 'themed'));
      OS.events.emit('theme', this.current);
    },
    /** Is the top-left of the wallpaper light (so desktop text should be dark)? */
    wallpaperIsLight: function () {
      var s = OS.state && OS.state.settings; if (!s) return false;
      var wp = s.wallpaper || {}, dark = this.isDark();
      if (wp.type === 'color') { var o = rgbToOklch(hexToRgb(wp.value)); return o.L > 0.72; }
      if (wp.type === 'image') return seedCache.id === wp.value ? !!seedCache.light : false;
      return !dark && wp.value !== 'dusk';
    },
    /** CSS background value for the desktop. */
    wallpaperCSS: function (wp, dark) {
      wp = wp || {};
      if (wp.type === 'color') return wp.value;
      if (wp.type === 'image' && OS.state && OS.vfs.exists(wp.value)) {
        try { return 'center / cover no-repeat url("' + OS.vfs.readDataURL(wp.value) + '"), #222'; } catch (e) { /* fall through */ }
      }
      var w = WALLPAPERS[wp.value] || WALLPAPERS.peaks;
      return 'center / cover no-repeat ' + svgURL(w.art(dark)) + ', ' + w.seed;
    },
    /** Neutral default colors before any data is loaded (lock screen, boot). */
    applyDefault: function () {
      var dark = !!(media && media.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      var vars = cssVars(scheme('#6b72c9', dark), dark);
      for (var k in vars) document.documentElement.style.setProperty(k, vars[k]);
    }
  };
  if (media && media.addEventListener) media.addEventListener('change', function () { if (OS.state && OS.state.settings.theme === 'auto') { theme.apply(); OS.shell && OS.shell.applyWallpaper(); } });

  OS.theme = theme;
})();
