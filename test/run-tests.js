#!/usr/bin/env node
/*
 * End-to-end tests for dist/nimbus.html (headless Chromium via Playwright).
 * Usage: node build.js && node test/run-tests.js [filter]
 *
 * Every test has a hard time limit (TEST_TIMEOUT); a test that runs over
 * is stopped and reported as a TIMEOUT together with the step it was on.
 *
 * The File System Access API is exercised through a stand-in for
 * window.showSaveFilePicker, because a headless browser cannot click
 * through the native save dialog. The stand-in records what our code
 * writes, so the save logic is tested; the browser's own dialog is not.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'nimbus.html');
const OUT = path.join(__dirname, '.out');
const TEST_TIMEOUT = 60000, STEP_TIMEOUT = 10000;
const FILTER = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let browser, currentStep = '';
const openContexts = new Set();

function step(s) { currentStep = s; }
function url(p) { return 'file://' + p; }
function write(name, html) { const p = path.join(OUT, name); fs.writeFileSync(p, html); return p; }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function assert(c, msg) { if (!c) throw new Error('Assertion failed: ' + msg); }
function dataTag(html) {
  const m = /<script type="application\/json" id="os-data" data-keep="">([\s\S]*?)<\/script>/.exec(html);
  assert(m, 'os-data tag found in saved HTML');
  return m[1];
}
/** Markup only: contents of <script>/<style> removed exactly as the HTML parser would (they end at the first closing tag). */
function markupOnly(html) {
  return html.replace(/(<script[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>').replace(/(<style[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
}

/** mode: 'fsa' (stand-in picker), 'none' (API absent), 'blocked' (throws SecurityError), 'cancel' (AbortError) */
async function open(file, mode = 'fsa', opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, acceptDownloads: true, colorScheme: opts.dark ? 'dark' : 'light' });
  openContexts.add(ctx);
  await ctx.addInitScript((mode) => {
    window.__saves = []; window.__alerts = [];
    window.alert = (m) => window.__alerts.push(String(m));
    if (mode === 'none') Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    else {
      window.showSaveFilePicker = async () => {
        if (mode === 'blocked') throw new DOMException('Blocked by policy', 'SecurityError');
        if (mode === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
        return { name: 'nimbus.html', createWritable: async () => ({ write: async (b) => { window.__saves.push(await b.text()); }, close: async () => {} }) };
      };
    }
  }, mode);
  const page = await ctx.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT);
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) page.__errors.push('console: ' + m.text()); });
  page.__beforeunload = 0;
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') { page.__beforeunload++; d.accept(); return; }
    page.__errors.push('native dialog: ' + d.message()); d.dismiss();
  });
  if (process.env.DEBUG_LAUNCH) page.on('console', (m) => { if (m.text().startsWith('LAUNCH')) console.log('   ', m.text()); });
  await page.goto(url(file));
  if (process.env.DEBUG_LAUNCH) await page.evaluate(() => { document.addEventListener('click', (e) => console.log('LAUNCH-CLICK ' + e.type + ' trusted=' + e.isTrusted + ' at ' + e.clientX + ',' + e.clientY + ' detail=' + e.detail + ' target=' + (e.target.className || e.target.tagName) + ' active=' + (document.activeElement && (document.activeElement.className || document.activeElement.tagName))), true); });
  if (process.env.DEBUG_LAUNCH) await page.evaluate(() => { const L = OS.launch; OS.launch = function (id) { console.log('LAUNCH ' + id + ' :: ' + new Error().stack.split('\n').slice(2, 5).join(' | ')); return L.apply(this, arguments); }; });
  return page;
}
async function waitDesktop(page) { await page.waitForSelector('#shelf:not([hidden])'); await page.waitForFunction(() => !document.getElementById('splash')); }
/** Go through the first-run wizard. pw: optional password. */
async function finishSetup(page, pw) {
  await page.waitForSelector('#setup .setup-card');
  for (let i = 0; i < 5; i++) { await page.click('#setup-next'); await page.waitForTimeout(60); }
  if (pw) {
    await page.fill('#setup input[placeholder="Password"]', pw);
    await page.fill('#setup input[placeholder="Repeat password"]', pw);
    await page.click('#setup-next');                         // derives the key, then moves on
  } else {
    await page.click('#setup .setup-actions .btn.text');   // Skip
  }
  await page.waitForFunction(() => /saving/i.test(document.querySelector('#setup h1').textContent), null, { timeout: 20000 });
  await page.click('#setup-next');                           // Finish
  await page.waitForSelector('#setup', { state: 'detached' });
  await waitDesktop(page);
}
async function lastSave(page) { return page.evaluate(() => window.__saves[window.__saves.length - 1]); }
async function saveFSA(page) {
  const n = await page.evaluate(() => window.__saves.length);
  await page.keyboard.press('Control+S');
  await page.waitForFunction((n) => window.__saves.length > n, n);
  await page.waitForFunction(() => !document.getElementById('save-btn').classList.contains('dirty'));
  return lastSave(page);
}
async function saveDownload(page, trigger) {
  const [dl] = await Promise.all([page.waitForEvent('download'), trigger ? trigger() : page.keyboard.press('Control+S')]);
  const p = path.join(OUT, 'dl-' + Date.now() + '-' + dl.suggestedFilename());
  await dl.saveAs(p);
  return { path: p, name: dl.suggestedFilename(), html: fs.readFileSync(p, 'utf8'), buf: fs.readFileSync(p) };
}
async function readPath(page, p) { return page.evaluate((p) => { const id = OS.vfs.resolvePath(p); return id ? OS.vfs.readText(id) : null; }, p); }
async function closeCtx(page) { const c = page.context(); openContexts.delete(c); await c.close(); }
async function fresh(mode) { const p = await open(DIST, mode || 'fsa'); await finishSetup(p); return p; }
function noErrors(page) { assert(page.__errors.length === 0, 'no page errors: ' + page.__errors.join('; ')); }

async function test(name, fn) {
  if (FILTER && !FILTER.test(name)) return;
  const t0 = Date.now(); currentStep = 'start';
  let timer;
  try {
    const note = await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('TIMEOUT after ' + TEST_TIMEOUT / 1000 + 's at step: ' + currentStep)), TEST_TIMEOUT); })]);
    results.push({ name, ok: true, note, ms: Date.now() - t0 });
    console.log('PASS', name, '(' + ((Date.now() - t0) / 1000).toFixed(1) + 's)', note ? '- ' + note : '');
  } catch (e) {
    results.push({ name, ok: false, note: e.message, ms: Date.now() - t0 });
    console.log('FAIL', name, '(' + ((Date.now() - t0) / 1000).toFixed(1) + 's) [step: ' + currentStep + '] -', e.message.split('\n')[0]);
  } finally {
    clearTimeout(timer);
    if (results[results.length - 1] && !results[results.length - 1].ok) {
      let k = 0;
      for (const c of openContexts) for (const pg of c.pages()) await pg.screenshot({ path: path.join(OUT, 'FAIL-' + name.replace(/\W+/g, '_').slice(0, 40) + '-' + (k++) + '.png') }).catch(() => {});
    }
    for (const c of openContexts) { await c.close().catch(() => {}); }
    openContexts.clear();
  }
}

/** Create a note through the real UI: Notepad -> type -> Ctrl+S -> Save-as dialog. */
async function createNoteViaUI(page, name, text) {
  step('open notepad');
  await page.evaluate(() => OS.launch('notepad'));
  await page.waitForSelector('.win.focused .np-text');
  await page.locator('.win.focused .np-text').fill(text);
  step('ctrl+s in notepad');
  await page.keyboard.press('Control+S');                      // Notepad asks for a name first
  const input = page.locator('.modal .input');
  await input.waitFor();
  assert((await page.textContent('.modal .crumb.current')) === 'Documents', 'save-as starts in Documents');
  await input.fill(name);
  await page.keyboard.press('Enter');
}

const RUNTIME_MARKERS = ['class="win', 'id="shelf"', 'id="launcher"', 'id="quick-settings"', 'id="lock-screen"', 'id="setup"', 'id="splash"', 'modal-overlay', 'class="toast', 'id="desktop"', 'ctx-menu', 'data-theme='];
function assertClean(html) {
  const markup = markupOnly(html);
  RUNTIME_MARKERS.forEach((m) => assert(!markup.includes(m), 'saved HTML has no runtime DOM marker ' + m));
  assert(/<div id="os-root" data-keep=""><\/div>/.test(html), '#os-root is empty in saved HTML');
  assert(html.startsWith('<!DOCTYPE html>'), 'starts with doctype');
  assert((markup.match(/<!DOCTYPE/gi) || []).length === 1, 'exactly one doctype');
  assert(/<html lang="en">/.test(html), 'html element has only lang (no runtime style/theme attributes)');
  assert(html.includes('NIMBUS: a portable, single-file web desktop'), 'README comment preserved');
}

(async () => {
  browser = await chromium.launch();
  const template = fs.readFileSync(DIST, 'utf8');
  const tStart = Date.now();

  await test('Template: single file, no external resources, all apps launch offline', async () => {
    assert(!/<script[^>]+src=/i.test(template), 'no external scripts');
    assert(!/<link[^>]+href=/i.test(template), 'no external stylesheets');
    assert(!/type="module"/i.test(template), 'no module scripts');
    assert(!/url\(\s*['"]?https?:/i.test(template), 'no remote CSS urls');
    assert(!/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(template), 'no network APIs used');
    assert(!/\beval\(|new Function/.test(template), 'no eval / new Function');
    const page = await open(DIST);
    const reqs = [];
    page.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) reqs.push(r.url()); });
    step('setup'); await finishSetup(page);
    const ids = await page.evaluate(() => Array.from(OS.apps.keys()));
    for (const id of ids) { step('launch ' + id); await page.evaluate((id) => { OS.installApp(id); OS.launch(id); }, id); await page.waitForTimeout(80); }
    await page.waitForTimeout(500);
    assert(reqs.length === 0, 'no network requests, got ' + reqs.join(','));
    noErrors(page);
    return (template.length / 1024).toFixed(0) + ' KB, ' + ids.length + ' apps launched, 0 network requests';
  });

  // ---------------------------------------------------------------- save paths
  let fsaSaved;
  await test('Round trip via File System Access path (note persists)', async () => {
    const page = await open(DIST, 'fsa');
    await finishSetup(page);
    await createNoteViaUI(page, 'hello.txt', 'Hello from the FSA path');
    step('wait for save');
    await page.waitForFunction(() => window.__saves.length === 1);
    fsaSaved = await lastSave(page);
    assert(await page.evaluate(() => !OS.dirty), 'not dirty after save');
    noErrors(page);
    await closeCtx(page);
    step('reopen');
    const p2 = await open(write('fsa-1.html', fsaSaved), 'fsa');
    await waitDesktop(p2);
    assert(!(await p2.$('#setup')), 'setup wizard not shown again');
    assert((await readPath(p2, '/Documents/hello.txt')) === 'Hello from the FSA path', 'note content persisted');
    return 'Notepad → Ctrl+S → reopened: content identical';
  });

  await test('Round trip via download fallback (File System Access API unavailable)', async () => {
    const page = await open(DIST, 'none');
    await finishSetup(page);
    assert(await page.evaluate(() => !OS.storage.hasFSA()), 'FSA reported unavailable');
    await page.evaluate(() => OS.launch('notepad'));
    await page.locator('.np-text').fill('Hello from the download path');
    await page.keyboard.press('Control+S');
    await page.locator('.modal .input').fill('dl.txt');
    step('download');
    const dl = await saveDownload(page, () => page.keyboard.press('Enter'));
    assert(dl.name === 'nimbus.html', 'download is named nimbus.html, got ' + dl.name);
    await page.waitForSelector('.notice');
    assert(/replace your old file/i.test(await page.textContent('.notice')), 'fallback notice explains replacing the file');
    await page.click('.notice .btn');
    assert(!(await page.$('.notice')), 'notice is dismissible');
    await closeCtx(page);
    const p2 = await open(dl.path, 'none');
    await waitDesktop(p2);
    assert((await readPath(p2, '/Documents/dl.txt')) === 'Hello from the download path', 'note persisted via fallback');
    return 'downloaded nimbus.html, notice shown + dismissed, reopened intact';
  });

  await test('FSA blocked by policy (SecurityError) falls back to download with a message', async () => {
    const page = await open(DIST, 'blocked');
    await finishSetup(page);
    await page.evaluate(() => OS.vfs.createFile(OS.vfs.root(), 'x.txt', 'blocked-path'));
    const dl = await saveDownload(page);
    await page.waitForSelector('.notice');
    const txt = await page.textContent('#notices');
    assert(/could not write the file directly/i.test(txt) && /SecurityError/.test(txt), 'explains why');
    await closeCtx(page);
    const p2 = await open(dl.path);
    await waitDesktop(p2);
    assert((await readPath(p2, '/x.txt')) === 'blocked-path', 'content persisted');
    return 'SecurityError → message + downloaded copy that reopens correctly';
  });

  await test('Cancelling the save dialog does NOT download and keeps unsaved state', async () => {
    const page = await open(DIST, 'cancel');
    await finishSetup(page);
    await page.evaluate(() => OS.vfs.createFile(OS.vfs.root(), 'c.txt', 'x'));
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.keyboard.press('Control+S');
    await page.waitForTimeout(800);
    assert(!downloaded, 'no download on cancel');
    assert(await page.evaluate(() => OS.dirty && document.getElementById('save-btn').classList.contains('dirty')), 'still dirty, dot visible');
    return 'AbortError → no fallback download, dot remains';
  });

  await test('Save → reopen → save three times: stable size, no runtime DOM', async () => {
    let html = fsaSaved, sizes = [], skeletons = [];
    for (let i = 1; i <= 3; i++) {
      step('cycle ' + i);
      const page = await open(write('cycle-' + i + '.html', html), 'fsa');
      await waitDesktop(page);
      await page.evaluate(() => { OS.launch('explorer'); OS.launch('terminal'); OS.launch('settings'); OS.shell.openPanel('qs'); OS.toast('busy'); OS.dialogs.alert('open dialog'); });
      await page.evaluate(() => OS.markDirty());
      await page.evaluate(() => OS.storage.save());
      await page.waitForFunction(() => window.__saves.length === 1);
      html = await lastSave(page);
      assertClean(html);
      sizes.push(Buffer.byteLength(html));
      skeletons.push(html.replace(dataTag(html), ''));
      await closeCtx(page);
    }
    assert(skeletons[0] === skeletons[1] && skeletons[1] === skeletons[2], 'template part is byte-identical across saves');
    const spread = Math.max(...sizes) - Math.min(...sizes);
    assert(spread < 300, 'size stable (spread ' + spread + ' bytes)');
    return 'sizes ' + sizes.join(' / ') + ' bytes; template identical; windows/panels/dialogs never saved';
  });

  await test('Script-injection note </script><script>alert(1)</script> round-trips safely', async () => {
    const evil = '</script><script>alert(1)</script> and <!-- comment --> and \u2028\u2029 separators';
    const page = await open(DIST, 'fsa');
    await finishSetup(page);
    await createNoteViaUI(page, 'evil.txt', evil);
    await page.waitForFunction(() => window.__saves.length === 1);
    const html = await lastSave(page);
    await closeCtx(page);
    const tag = dataTag(html);
    assert(!tag.includes('<'), 'no raw "<" inside os-data');
    assert(!html.includes('<script>alert(1)'), 'payload not present as markup');
    assert(!/[\u2028\u2029]/.test(tag), 'U+2028/2029 escaped');
    assert((markupOnly(html).match(/<script/gi) || []).length === 2, 'still exactly two <script> elements');
    const p2 = await open(write('evil.html', html), 'fsa');
    await waitDesktop(p2);
    await p2.evaluate(() => OS.launch('notepad', { fileId: OS.vfs.resolvePath('/Documents/evil.txt') }));
    await p2.waitForTimeout(300);
    assert((await p2.evaluate(() => window.__alerts.length)) === 0, 'no alert ran');
    noErrors(p2);
    assert((await readPath(p2, '/Documents/evil.txt')) === evil, 'content identical after reopen');
    return 'escaped as \\u003c; reopened with no script execution; text identical';
  });

  await test('Password: encrypted file has no plaintext; wrong password rejected; Lock now', async () => {
    const page = await open(DIST, 'fsa');
    step('setup with password');
    await finishSetup(page, 'correct horse');
    await page.evaluate(() => { const d = OS.vfs.special('documents'); OS.vfs.createFile(d, 'TopSecretFileName.txt', 'SECRET-PAYLOAD-12345'); OS.state.settings.userName = 'Zed Secretname'; OS.markDirty(); });
    step('backup');
    await page.evaluate(() => OS.storage.backup.write());
    const ls = await page.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n'));
    assert(ls.length > 0 && !/SECRET-PAYLOAD|TopSecretFileName|Secretname|Welcome/.test(ls), 'backup in browser storage is encrypted');
    step('save');
    const html = await saveFSA(page);
    await closeCtx(page);
    const obj = JSON.parse(dataTag(html));
    const keys = Object.keys(obj).sort().join(',');
    assert(keys === 'ciphertext,encrypted,fileId,iterations,iv,salt,version', 'envelope has only the allowed keys: ' + keys);
    assert(obj.iterations >= 600000 && Buffer.from(obj.salt, 'base64').length === 16 && Buffer.from(obj.iv, 'base64').length === 12, 'KDF params');
    const count = (h, s) => h.split(s).length - 1;
    ['SECRET-PAYLOAD', 'TopSecretFileName', 'Secretname', 'Welcome.md', '"theme"', 'Save Nimbus with Ctrl+S'].forEach((s) =>
      assert(count(html, s) === count(template, s), 'no plaintext "' + s + '" added to saved file'));
    assertClean(html);

    step('reopen locked');
    const p2 = await open(write('enc.html', html), 'fsa');
    await p2.waitForSelector('#lock-screen .lk-input');
    await p2.fill('#lock-screen .lk-input', 'wrong password');
    await p2.click('#lock-screen .lk-go');
    await p2.waitForFunction(() => /wrong password/i.test(document.querySelector('#lock-screen .lk-err').textContent), null, { timeout: 20000 });
    assert(await p2.evaluate(() => OS.state === null), 'still locked after wrong password');
    await p2.fill('#lock-screen .lk-input', 'correct horse');
    await p2.click('#lock-screen .lk-go');
    await waitDesktop(p2);
    await p2.waitForSelector('#lock-screen', { state: 'detached' });
    assert((await readPath(p2, '/Documents/TopSecretFileName.txt')) === 'SECRET-PAYLOAD-12345', 'decrypted content');
    await p2.evaluate(() => OS.markDirty());
    const again = await saveFSA(p2);
    assert(JSON.parse(dataTag(again)).iv !== obj.iv, 'fresh IV on each save');

    step('lock now');
    await p2.evaluate(() => OS.launch('notepad'));
    await p2.evaluate(() => { OS.shell.lockNow(); });   // don't await: it resolves only after unlocking
    await p2.waitForSelector('#lock-screen .lk-input');
    assert(await p2.evaluate(() => OS.state === null && !OS.crypto.isEnabled()), 'state and key dropped');
    const body = await p2.evaluate(() => document.body.innerHTML);
    assert(!body.includes('SECRET-PAYLOAD') && !body.includes('TopSecretFileName') && !body.includes('Secretname') && !body.includes('class="win'), 'no decrypted data or windows left in DOM');
    await p2.fill('#lock-screen .lk-input', 'correct horse');
    await p2.click('#lock-screen .lk-go');
    await p2.waitForSelector('#lock-screen', { state: 'detached', timeout: 20000 });
    assert((await readPath(p2, '/Documents/TopSecretFileName.txt')) === 'SECRET-PAYLOAD-12345', 'unlocked again');
    noErrors(p2);
    return 'envelope keys only; no plaintext anywhere; wrong pw → error; new IV per save; Lock now wipes DOM + state';
  });

  await test('Binary import → save → reopen → export is byte-identical', async () => {
    const bin = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), crypto.randomBytes(200000), Buffer.from(Array.from({ length: 256 }, (_, i) => i))]);
    const src = path.join(OUT, 'sample.png'); fs.writeFileSync(src, bin);
    const txt = Buffer.from('\ufeffBOM text, CRLF\r\nline 2 ünïcødé\r\n'); const srcTxt = path.join(OUT, 'notes.txt'); fs.writeFileSync(srcTxt, txt);
    const page = await fresh();
    await page.evaluate(() => OS.launch('explorer'));
    step('import');
    await page.setInputFiles('.app-files input[type=file]', [src, srcTxt]);
    await page.waitForFunction(() => OS.vfs.resolvePath('/sample.png') && OS.vfs.resolvePath('/notes.txt'));
    const sizeCol = await page.textContent('.fx-row[data-id] .c-size');
    const html = await saveFSA(page);
    await closeCtx(page);
    const p2 = await open(write('bin.html', html), 'fsa');
    await waitDesktop(p2);
    const outs = [];
    for (const p of ['/sample.png', '/notes.txt']) {
      step('export ' + p);
      const [dl] = await Promise.all([p2.waitForEvent('download'), p2.evaluate((p) => OS.exportFile(OS.vfs.resolvePath(p)), p)]);
      const o = path.join(OUT, 'export-' + dl.suggestedFilename()); await dl.saveAs(o); outs.push({ name: dl.suggestedFilename(), buf: fs.readFileSync(o) });
    }
    assert(outs[0].name === 'sample.png' && outs[1].name === 'notes.txt', 'original names kept');
    assert(sha(outs[0].buf) === sha(bin), 'binary byte-identical');
    assert(sha(outs[1].buf) === sha(txt), 'text (BOM, CRLF, UTF-8) byte-identical');
    return bin.length + ' B binary + text file, SHA-256 identical; size column "' + sizeCol + '"';
  });

  await test('Windows stay reachable at tiny and huge viewport sizes; snapping', async () => {
    const page = await fresh();
    await page.evaluate(() => { OS.launch('notepad'); OS.launch('calculator'); OS.launch('explorer'); });
    const tb = page.locator('.win.focused .win-titlebar');
    const bb = await tb.boundingBox();
    step('drag off-screen');
    await page.mouse.move(bb.x + 60, bb.y + 15); await page.mouse.down();
    await page.mouse.move(-3000, 5000, { steps: 5 }); await page.mouse.up();
    async function check(label) {
      const r = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight - 64;
        return OS.wm.windows.map((w) => { const t = w.titlebar.getBoundingClientRect(); return { l: t.left, r: t.right, t: t.top, b: t.bottom, vw, vh }; });
      });
      r.forEach((w, i) => {
        assert(w.t >= 0 && w.b <= w.vh + 1, label + ': window ' + i + ' title bar vertically visible (' + w.t + '..' + w.b + ' / ' + w.vh + ')');
        assert(Math.min(w.r, w.vw) - Math.max(w.l, 0) >= 60, label + ': window ' + i + ' title bar has ≥60px visible horizontally');
      });
    }
    await check('after drag off-screen');
    for (const [w, h] of [[2560, 1440], [320, 480], [200, 260], [1280, 800]]) { step('viewport ' + w + 'x' + h); await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(200); await check(w + 'x' + h); }
    step('snap left');
    const b2 = await page.locator('.win.focused .win-titlebar').boundingBox();
    await page.mouse.move(b2.x + 100, b2.y + 15); await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 3 }); await page.mouse.move(0, 300, { steps: 3 });
    assert(await page.evaluate(() => !OS.wm.snapPreview.hidden), 'snap preview shown at edge');
    await page.mouse.up();
    const snapped = await page.evaluate(() => { const w = OS.wm.focused; const r = w.el.getBoundingClientRect(); return { side: w.snapped, x: r.left, w: r.width, vw: innerWidth }; });
    assert(snapped.side === 'left' && snapped.x === 0 && Math.abs(snapped.w - snapped.vw / 2) <= 1, 'snapped to left half: ' + JSON.stringify(snapped));
    step('narrow screens');
    await page.setViewportSize({ width: 600, height: 800 });
    await page.evaluate(() => OS.launch('todo'));
    assert(await page.evaluate(() => OS.wm.focused.maximized), 'new window maximized under 700px');
    await page.screenshot({ path: path.join(OUT, 'narrow.png') });
    return 'reachable after off-screen drag and at 2560x1440, 320x480, 200x260; snap-to-half works; <700px opens maximized';
  });

  await test('Crash-recovery backup is offered and restores unsaved work', async () => {
    const page = await open(write('backup-base.html', fsaSaved), 'fsa');
    await waitDesktop(page);
    await page.evaluate(() => OS.vfs.createFile(OS.vfs.root(), 'unsaved.txt', 'not yet saved'));
    await page.evaluate(() => OS.storage.backup.tick());
    step('reload');
    await page.reload();
    assert(page.__beforeunload === 1, 'unsaved-changes warning shown when leaving the page');
    await page.waitForSelector('.modal');
    assert(/crash-recovery backup/i.test(await page.textContent('.modal')), 'restore offered');
    await page.click('.modal .btn.primary');
    await page.waitForFunction(() => OS.vfs.resolvePath('/unsaved.txt'));
    assert(await page.evaluate(() => OS.dirty), 'restored data is marked unsaved');
    return 'leave-page warning fired; backup offered after reload and restored';
  });

  await test('Migration: version-1 and version-2 (MyOS) files open and upgrade to v3', async () => {
    const page = await fresh();
    const files = await page.evaluate(() => {
      const base = JSON.parse(JSON.stringify(OS.state));
      const v1 = JSON.parse(JSON.stringify(base));
      v1.version = 1; delete v1.settings.clock24; v1.geometry = { notepad: { x: 40, y: 50, w: 500, h: 300 } }; delete v1.windows;
      const v2 = JSON.parse(JSON.stringify(base));
      v2.version = 2; v2.settings.wallpaper = { type: 'gradient', value: 'ocean' }; delete v2.installed; delete v2.sideloaded; delete v2.vfs.special;
      // a v2 tree had no Desktop/Music/Trash folders
      ['f-desk', 'f-music', 'f-trash'].forEach((id) => { delete v2.vfs.nodes[id]; v2.vfs.nodes.root.children = v2.vfs.nodes.root.children.filter((c) => c !== id); });
      return { v1: OS.storage.buildHTML(v1), v2: OS.storage.buildHTML(v2) };
    });
    await closeCtx(page);
    const p1 = await open(write('v1.html', files.v1), 'fsa');
    await waitDesktop(p1);
    const s1 = await p1.evaluate(() => ({ v: OS.state.version, c: OS.state.settings.clock24, w: OS.state.windows.notepad, g: 'geometry' in OS.state }));
    assert(s1.v === 3 && s1.c === false && s1.w && s1.w.x === 40 && !s1.g, 'v1 migrated: ' + JSON.stringify(s1));
    const p2 = await open(write('v2.html', files.v2), 'fsa');
    await waitDesktop(p2);
    const s2 = await p2.evaluate(() => ({ v: OS.state.version, wp: OS.state.settings.wallpaper, inst: OS.state.installed.length, desk: OS.vfs.pathOf(OS.vfs.special('desktop')), trash: OS.vfs.isFolder(OS.vfs.special('trash')), docs: OS.vfs.special('documents') }));
    assert(s2.v === 3 && s2.wp.type === 'preset' && s2.wp.value === 'tide' && s2.inst > 0 && s2.desk === '/Desktop' && s2.trash && s2.docs === 'f-docs', 'v2 migrated: ' + JSON.stringify(s2));
    noErrors(p2);
    return 'v1 → v3 and v2 → v3 (wallpaper mapped, Desktop/Music/Trash created, apps installed)';
  });

  await test('VFS rules, Trash + restore, copy/paste, protected system folders', async () => {
    const page = await fresh();
    const r = await page.evaluate(() => {
      const v = OS.vfs, root = v.root(), out = {};
      function tryIt(k, fn) { try { fn(); out[k] = 'ok'; } catch (e) { out[k] = 'err'; } }
      const a = v.mkdir(root, 'A'), b = v.mkdir(a, 'B'), f = v.createFile(b, 'n.txt', 'x');
      tryIt('slash', () => v.createFile(root, 'x/y', ''));
      tryIt('empty', () => v.mkdir(root, '  '));
      tryIt('dup', () => v.mkdir(root, 'a'));
      tryIt('self', () => v.move(a, a));
      tryIt('desc', () => v.move(a, b));
      tryIt('sysDelete', () => v.delete(v.special('documents')));
      tryIt('sysRename', () => v.rename(v.special('trash'), 'Bin'));
      const c = v.copy(a, root);
      out.copyName = v.stat(c).name; out.copyDeep = v.readText(v.resolvePath('/A copy/B/n.txt'));
      v.trash(a);
      out.trashed = !v.resolvePath('/A') && v.inTrash(a) && v.list(root).every((m) => m.name !== 'Trash');
      v.restore(a);
      out.restored = v.resolvePath('/A/B/n.txt') === f;
      v.trash(f); v.emptyTrash();
      out.emptied = !v.exists(f) && v.list(v.special('trash')).length === 0;
      return out;
    });
    assert(['slash', 'empty', 'dup', 'self', 'desc', 'sysDelete', 'sysRename'].every((k) => r[k] === 'err'), 'rules enforced ' + JSON.stringify(r));
    assert(r.copyName === 'A copy' && r.copyDeep === 'x' && r.trashed && r.restored && r.emptied, JSON.stringify(r));
    noErrors(page);
    return 'name rules, system folders protected, deep copy, trash → restore → empty';
  });

  await test('Files app: drag to folder, Ctrl+C/Ctrl+V, Delete → Trash with Undo', async () => {
    const page = await fresh();
    await page.evaluate(() => { OS.vfs.createFile(OS.vfs.root(), 'drag-me.txt', 'x'); OS.launch('explorer'); });
    step('drag');
    await page.locator('.fx-row', { hasText: 'drag-me.txt' }).dragTo(page.locator('.fx-row', { hasText: 'Pictures' }));
    assert(await page.evaluate(() => !!OS.vfs.resolvePath('/Pictures/drag-me.txt')), 'moved by drag-and-drop');
    step('copy/paste');
    await page.locator('.fx-row', { hasText: 'Documents' }).dblclick();
    await page.locator('.fx-row', { hasText: 'Welcome.md' }).click();
    await page.keyboard.press('Control+C');
    await page.keyboard.press('Control+V');
    await page.waitForFunction(() => !!OS.vfs.resolvePath('/Documents/Welcome copy.md'));
    step('delete');
    await page.locator('.fx-row', { hasText: 'Welcome copy.md' }).click();
    await page.keyboard.press('Delete');
    await page.waitForFunction(() => !OS.vfs.resolvePath('/Documents/Welcome copy.md'));
    assert(await page.evaluate(() => OS.vfs.list(OS.vfs.special('trash')).length === 1), 'in Trash');
    step('undo');
    await page.locator('.toast', { hasText: 'moved to Trash' }).locator('.btn.text').click();   // Undo
    await page.waitForFunction(() => !!OS.vfs.resolvePath('/Documents/Welcome copy.md'));
    step('grid view');
    await page.click('.win.focused [title="Switch view"]');
    assert(await page.evaluate(() => !!document.querySelector('.fx-list.grid')), 'grid view');
    noErrors(page);
    return 'drag-and-drop move, keyboard copy/paste, delete → Trash → Undo, grid view';
  });

  await test('Terminal commands work through the VFS', async () => {
    const page = await fresh();
    await page.evaluate(() => OS.launch('terminal'));
    const type = async (cmd) => { step('cmd ' + cmd); await page.locator('.term-in').fill(cmd); await page.keyboard.press('Enter'); };
    for (const c of ['mkdir -p proj/src', 'cd proj', 'echo "hello world" > a.txt', 'echo second >> a.txt', 'touch b.txt', 'mv b.txt src/c.txt', 'cp a.txt src/d.txt',
      'cd src', 'pwd', 'cd ../..', 'cat /proj/a.txt', 'ls -l proj', 'tree proj', 'find d.txt', 'rm proj', 'rm -r proj/src', 'mkdir "My Folder"', 'cd My\\ Folder', 'pwd', 'cd /', 'rm -r Documents', 'nosuch']) await type(c);
    const out = await page.textContent('.term-out');
    const s = await page.evaluate(() => ({ a: OS.vfs.readText(OS.vfs.resolvePath('/proj/a.txt')), src: !!OS.vfs.resolvePath('/proj/src'), my: !!OS.vfs.resolvePath('/My Folder'), docs: !!OS.vfs.resolvePath('/Documents') }));
    assert(s.a === 'hello world\nsecond\n', 'echo/redirect: ' + JSON.stringify(s.a));
    assert(!s.src && s.my && s.docs, 'rm -r, quoted mkdir, system folder protected ' + JSON.stringify(s));
    assert(out.includes('/proj/src') && out.includes('/My Folder') && /is a folder \(use rm -r\)/.test(out) && /command not found/.test(out) && out.includes('└── ') && out.includes('/proj/src/d.txt'), 'outputs');
    await page.locator('.term-in').focus();
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    assert((await page.inputValue('.term-in')) === 'rm -r Documents', 'history up arrow');
    return 'mkdir/cd/pwd/echo >,>>/touch/mv/cp/cat/ls/tree/find/rm -r/quotes/history';
  });

  await test('Calculator parser (no eval) and keyboard input', async () => {
    const page = await fresh();
    const r = await page.evaluate(() => {
      const c = OS.calc, f = (e) => { try { return c.format(c.evaluate(e)); } catch (x) { return 'ERR:' + x.message; } };
      return { a: f('1+2*3'), b: f('(1+2)*3'), c: f('-2^2'), d: f('2^3^2'), e: f('0.1+0.2'), g: f('50%*8'), h: f('2(3+4)'), i: f('1/0'), j: f('1+'), k: f('7/2') };
    });
    const exp = { a: '7', b: '9', c: '-4', d: '512', e: '0.3', g: '4', h: '14', i: 'ERR:Cannot divide by zero', j: 'ERR:Incomplete expression', k: '3.5' };
    Object.keys(exp).forEach((k) => assert(r[k] === exp[k], k + ': ' + r[k] + ' != ' + exp[k]));
    await page.evaluate(() => OS.launch('calculator'));
    await page.waitForFunction(() => document.activeElement.classList.contains('app-calc'));
    await page.keyboard.type('12*(3+4)'); await page.keyboard.press('Enter');
    assert((await page.textContent('.calc-expr')) === '84', 'keyboard input → 84');
    await page.click('.calc-tape-btn');
    assert(/84/.test(await page.textContent('.calc-tape')), 'history tape shows the calculation');
    return 'precedence, unary, power, percent, implicit ×, errors, keyboard, history';
  });

  await test('Paint: draw, fill, shapes, undo/redo, save PNG, reopen in Paint', async () => {
    const page = await fresh();
    await page.evaluate(() => OS.launch('paint'));
    const c = await page.locator('.pt-canvas').boundingBox();
    step('draw');
    await page.mouse.move(c.x + 20, c.y + 20); await page.mouse.down(); await page.mouse.move(c.x + 200, c.y + 120, { steps: 10 }); await page.mouse.up();
    await page.keyboard.press('r');
    await page.mouse.move(c.x + 250, c.y + 40); await page.mouse.down(); await page.mouse.move(c.x + 350, c.y + 140, { steps: 5 }); await page.mouse.up();
    await page.keyboard.press('f');
    await page.mouse.click(c.x + 300, c.y + 90);
    const px = await page.evaluate(() => { const cv = document.querySelector('.pt-canvas'); const d = cv.getContext('2d').getImageData(Math.round(300 * cv.width / cv.clientWidth), Math.round(90 * cv.height / cv.clientHeight), 1, 1).data; return Array.from(d); });
    assert(px[0] === 0x3f && px[1] === 0x6e && px[2] === 0xe8, 'flood fill painted inside the rectangle: ' + px);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    step('save');
    await page.keyboard.press('Control+S');
    await page.locator('.modal .input').fill('drawing');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => OS.vfs.resolvePath('/Pictures/drawing.png'));
    const info = await page.evaluate(() => { const id = OS.vfs.resolvePath('/Pictures/drawing.png'); const b = OS.vfs.readBytes(id); return { sig: Array.from(b.slice(0, 4)), mime: OS.vfs.stat(id).mime }; });
    assert(info.sig.join() === '137,80,78,71' && info.mime === 'image/png', 'valid PNG');
    step('reopen');
    await page.evaluate(() => OS.openWith('paint', OS.vfs.resolvePath('/Pictures/drawing.png')));
    await page.waitForFunction(() => OS.wm.focused.title === 'drawing.png' && OS.wm.focused.app.id === 'paint');
    await page.evaluate(() => OS.openFile(OS.vfs.resolvePath('/Pictures/drawing.png')));
    await page.waitForFunction(() => OS.wm.focused.app.id === 'photos', null, { timeout: 3000 });
    noErrors(page);
    return 'brush, rectangle, flood fill, undo/redo, PNG saved; images open in Photos, "Open with" Paint';
  });

  await test('Store: install / uninstall, and installing an app from a file', async () => {
    const page = await open(DIST);
    await finishSetup(page);
    step('uninstall sudoku');
    await page.evaluate(() => OS.uninstallApp('sudoku'));
    assert(await page.evaluate(() => !OS.isInstalled('sudoku') && !OS.installedApps().some((a) => a.id === 'sudoku')), 'uninstalled');
    await page.evaluate(() => OS.launch('store', { tab: 'games' }));
    step('install sudoku');
    await page.locator('.sx-card', { hasText: 'Sudoku' }).locator('.btn.primary').click();
    await page.waitForFunction(() => OS.isInstalled('sudoku'));
    step('sideload');
    const sample = await page.evaluate(() => OS.store.EXAMPLE_APP);
    const f = path.join(OUT, 'counter.js'); fs.writeFileSync(f, sample);
    await page.evaluate(() => OS.launch('store', { tab: 'sideload' }));
    await page.setInputFiles('.app-store input[type=file]', f);
    await page.click('.modal .btn.danger-filled');
    await page.waitForFunction(() => OS.apps.has('hello-counter') && OS.isInstalled('hello-counter'));
    await page.evaluate(() => OS.launch('hello-counter'));
    await page.click('.win.focused .btn.primary');
    const html = await saveFSA(page);
    await closeCtx(page);
    step('reopen with sideloaded app');
    const p2 = await open(write('store.html', html));
    await waitDesktop(p2);
    const s = await p2.evaluate(() => ({ has: OS.apps.has('hello-counter'), clicks: OS.getAppState('hello-counter').clicks, sudoku: OS.isInstalled('sudoku') }));
    assert(s.has && s.clicks === 1 && s.sudoku, 'sideloaded app and its data survive a save: ' + JSON.stringify(s));
    await p2.evaluate(() => OS.store.removeSideloaded('hello-counter'));
    assert(await p2.evaluate(() => !OS.apps.has('hello-counter') && OS.state.sideloaded.length === 0), 'removed');
    noErrors(p2);
    return 'uninstall/install from Store; example .js app installed, used, saved, reopened, removed';
  });

  await test('Browser: local HTML runs sandboxed and cannot reach Nimbus', async () => {
    const page = await fresh();
    await page.evaluate(() => OS.vfs.createFile(OS.vfs.special('documents'), 'page.html',
      '<h1 id="t">Local page</h1><script>var r; try { r = parent.OS ? "LEAK" : "no-os"; } catch (e) { r = "blocked"; } try { localStorage.x = 1; r += "/ls-ok"; } catch (e) { r += "/ls-blocked"; } document.getElementById("t").textContent = r;</script>'));
    await page.evaluate(() => OS.openFile(OS.vfs.resolvePath('/Documents/page.html')));
    await page.waitForFunction(() => OS.wm.focused && OS.wm.focused.app.id === 'browser');
    const frame = await (await page.waitForSelector('.bw-frame.white')).contentFrame();
    await frame.waitForFunction(() => document.getElementById('t') && document.getElementById('t').textContent !== 'Local page');
    const r = await frame.evaluate(() => document.getElementById('t').textContent);
    assert(r === 'blocked/ls-blocked', 'local page isolated: ' + r);
    assert((await page.inputValue('.bw-addr')).startsWith('nimbus:/Documents/page.html'), 'address shows the file');
    step('tabs');
    await page.click('.bw-newtab');
    assert(await page.evaluate(() => document.querySelectorAll('.bw-tab').length === 2), 'second tab');
    const sb = await page.getAttribute('.bw-frame.white', 'sandbox');
    assert(!/allow-same-origin|allow-top-navigation/.test(sb), 'no same-origin / top navigation for local files');
    noErrors(page);
    return 'srcdoc sandbox: parent access and storage blocked; tabs work';
  });

  await test('Launcher (Ctrl+K) search, quick settings, notifications, desktop menu', async () => {
    const page = await fresh();
    step('launcher');
    await page.keyboard.press('Control+k');
    await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('launcher-search'));
    await page.keyboard.type('welc');
    await page.waitForSelector('.lz-result.active');
    assert(/Welcome\.md/.test(await page.textContent('.lz-result.active')), 'file found by search');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => OS.wm.focused && OS.wm.focused.app.id === 'notepad');
    step('quick settings');
    await page.click('#status');
    await page.waitForSelector('#quick-settings');
    const wasDark = await page.evaluate(() => OS.theme.isDark());
    await page.locator('.qs-tile', { hasText: 'Dark theme' }).click();
    await page.waitForFunction((d) => OS.theme.isDark() !== d, wasDark);
    assert(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === (OS.theme.isDark() ? 'dark' : 'light')), 'theme applied');
    await page.keyboard.press('Escape');
    step('notification');
    await page.evaluate(() => OS.notify('Test note', 'body text'));
    await page.click('#status');
    assert(/Test note/.test(await page.textContent('#quick-settings')), 'notification listed');
    await page.keyboard.press('Escape');
    step('desktop menu');
    await page.evaluate(() => OS.wm.closeAll(true));
    await page.mouse.click(700, 400, { button: 'right' });
    await page.waitForSelector('.ctx-menu');
    await page.locator('.ctx-item', { hasText: 'New text file' }).click();
    await page.waitForFunction(() => OS.vfs.list(OS.vfs.special('desktop')).length === 1);
    noErrors(page);
    return 'Ctrl+K search → Enter opens file; dark theme toggle; notification centre; desktop right-click';
  });

  await test('Clock alarm fires a notification; games start and respond', async () => {
    const page = await fresh();
    step('alarm');
    await page.evaluate(() => {
      const d = new Date(), t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      OS.getAppState('clock', { alarms: [] }).alarms.push({ id: 'x', time: t, label: 'Test alarm', on: true, days: [] });
      OS.clockService.lastMinute = '';
    });
    await page.waitForFunction(() => OS.notifications.some((n) => /Test alarm/.test(n.body)), null, { timeout: 3000 });
    step('solitaire');
    await page.evaluate(() => OS.launch('solitaire'));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => document.querySelectorAll('.so-card.up').length);
    await page.click('.so-slot.stock', { force: true });
    await page.waitForTimeout(300);
    assert((await page.evaluate(() => document.querySelectorAll('.so-card.up').length)) === before + 1, 'drawing turns a card face up');
    step('comet');
    await page.evaluate(() => OS.launch('comet'));
    await page.waitForSelector('.cm-card .btn.primary');
    await page.click('.cm-card .btn.primary');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => document.querySelector('.cm-overlay').hidden), 'comet game running');
    step('sudoku');
    await page.evaluate(() => OS.launch('sudoku'));
    await page.waitForSelector('.sd-cell.sel');
    const r = await page.evaluate(() => {
      const st = OS.getAppState('sudoku'), g = st.game, i = g.values.indexOf(0);
      return { i: i, ans: g.solution[i] };
    });
    await page.locator('.sd-cell').nth(r.i).click();
    await page.keyboard.press(String(r.ans));
    assert(await page.evaluate((i) => OS.getAppState('sudoku').game.values[i], r.i) === r.ans, 'sudoku accepts keyboard input');
    noErrors(page);
    return 'alarm notification; solitaire draw; comet runs; sudoku input';
  });

  await test('Dark mode and phone-size layouts render without errors', async () => {
    const page = await open(DIST, 'fsa', { dark: true, viewport: { width: 390, height: 780 } });
    await finishSetup(page);
    assert(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'), 'auto theme follows system dark mode');
    for (const id of ['explorer', 'settings', 'store', 'browser', 'sudoku']) { step('narrow ' + id); await page.evaluate((id) => { OS.wm.closeAll(true); OS.launch(id); }, id); await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, 'phone-' + id + '.png') }); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
    assert(!overflow, 'no horizontal page overflow');
    noErrors(page);
    return 'dark theme automatic; 390px wide layouts for Files, Settings, Store, Browser, Sudoku';
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed in ' + ((Date.now() - tStart) / 1000).toFixed(0) + 's');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
