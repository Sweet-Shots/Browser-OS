#!/usr/bin/env node
/*
 * Build: inline all CSS, JS and fonts from src/ into dist/nimbus.html.
 * No dependencies. Usage: node build.js
 *
 * Order: src/styles/*.css (sorted), then JS: src/core/*.js (sorted),
 * src/apps/*.js (sorted), src/boot.js. Everything becomes ONE classic
 * inline <script> so the first line can snapshot the pristine document.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT_DIR = path.join(__dirname, 'dist');
const OUT = path.join(OUT_DIR, 'nimbus.html');

function files(dir, ext) {
  return fs.readdirSync(path.join(SRC, dir)).filter(f => f.endsWith(ext)).sort().map(f => path.join(SRC, dir, f));
}
function read(f) { return fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); }
function rel(f) { return path.relative(__dirname, f).split(path.sep).join('/'); }

let css = files('styles', '.css').map(f => `/* ---- ${rel(f)} ---- */\n${read(f)}`).join('\n');
// Fonts: @@FONT_<NAME>@@ in CSS becomes the base64 of src/fonts/<name>-latin-wght.woff2
css = css.replace(/@@FONT_([A-Z0-9]+)@@/g, (_, name) => {
  const f = path.join(SRC, 'fonts', name.toLowerCase() + '-latin-wght.woff2');
  return fs.readFileSync(f).toString('base64');
});
const jsFiles = [...files('core', '.js'), ...files('apps', '.js'), path.join(SRC, 'boot.js')];
const js = jsFiles.map(f => `/* ---- ${rel(f)} ---- */\n${read(f)}`).join('\n');

// Safety checks: inline code must not be able to close its own tag.
if (/<\/script/i.test(js)) throw new Error('JS contains "</script": escape it as "<\\/script"');
if (/<!--/.test(js)) throw new Error('JS contains "<!--", which can confuse the HTML parser inside <script>');
if (/<\/style/i.test(css)) throw new Error('CSS contains "</style"');
// Raw line/paragraph separators or control characters in source are almost always an editing accident.
jsFiles.forEach(f => {
  const src = read(f);
  const bad = src.search(/[\u2028\u2029\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  if (bad >= 0) throw new Error(`${rel(f)}: unexpected control/separator character at offset ${bad} (use a \\u escape instead)`);
});

let html = read(path.join(SRC, 'index.html'));
const readme = /<!--([\s\S]*?)-->/.exec(html);
if (readme && readme[1].includes('--')) throw new Error('README comment must not contain "--"');
if (!html.includes('/*@@CSS@@*/') || !html.includes('/*@@JS@@*/')) throw new Error('Template placeholders missing');
// Function replacers: JS source contains "$&" etc. that a string replacement would interpret.
html = html.replace('/*@@CSS@@*/', () => css).replace('/*@@JS@@*/', () => js);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Built ${rel(OUT)}: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB from ${jsFiles.length} JS + ${files('styles', '.css').length} CSS files`);
