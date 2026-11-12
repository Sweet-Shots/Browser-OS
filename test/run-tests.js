#!/usr/bin/env node
/*
 * End-to-end tests for dist/myos.html (headless Chromium via Playwright).
 * Usage: node build.js && node test/run-tests.js
 *
 * The File System Access API is exercised through a stand-in for
 * window.showSaveFilePicker, because a headless browser cannot click
 * through the native save dialog. The stand-in records what our code
 * writes, so the save logic is tested. The real OS dialog is not.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'myos.html');
const OUT = path.join(__dirname, '.out');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let browser;

function url(p) { return 'file://' + p; }
function write(name, html) { const p = path.join(OUT, name); fs.writeFileSync(p, html); return p; }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function assert(c, msg) { if (!c) throw new Error('Assertion failed: ' + msg); }
function dataTag(html) {
  const m = /<script type="application\/json" id="os-data" data-keep="">([\s\S]*?)<\/script>/.exec(html);
  assert(m, 'os-data tag found in saved HTML');
  return m[1];
}

/** mode: 'fsa' (stand-in picker), 'none' (API absent), 'blocked' (throws SecurityError), 'cancel' (AbortError) */
async function open(file, mode = 'fsa', viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript((mode) => {
    window.__saves = []; window.__alerts = [];
    window.alert = (m) => window.__alerts.push(String(m));
    if (mode === 'none') {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    } else {
      window.showSaveFilePicker = async () => {
        if (mode === 'blocked') throw new DOMException('Blocked by policy', 'SecurityError');
        if (mode === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
        return { name: 'myos.html', createWritable: async () => ({ write: async (b) => { window.__saves.push(await b.text()); }, close: async () => {} }) };
      };
    }
  }, mode);
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  page.__beforeunload = 0;
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') { page.__beforeunload++; d.accept(); return; }
    page.__errors.push('native dialog: ' + d.message()); d.dismiss();
  });
  await page.goto(url(file));
  return page;
}
async function skipSetup(page) { await page.click('#setup-screen .btn.ghost'); await page.waitForSelector('#taskbar:not([hidden])'); }
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
async function closeCtx(page) { await page.context().close(); }

async function test(name, fn) {
  const t0 = Date.now();
  try { const note = await fn(); results.push({ name, ok: true, note, ms: Date.now() - t0 }); console.log('PASS', name, note ? '- ' + note : ''); }
  catch (e) { results.push({ name, ok: false, note: e.message, ms: Date.now() - t0 }); console.log('FAIL', name, '-', e.message); }
}

/** Create a note through the real UI: Notepad -> type -> Ctrl+S -> Save-as dialog. */
async function createNoteViaUI(page, name, text) {
  await page.evaluate(() => OS.launch('notepad'));
  await page.waitForSelector('.np-text');
  await page.locator('.win.focused .np-text').fill(text);
  await page.keyboard.press('Control+S');                       // Notepad asks for a name first
  const input = page.locator('.modal .input');
  await input.waitFor();
  // Notepad's Save As starts in /Documents
  assert((await page.textContent('.modal .crumb.current')) === 'Documents', 'save-as starts in Documents');
  await input.fill(name);
  await page.keyboard.press('Enter');
}

const RUNTIME_MARKERS = ['class="win', 'id="taskbar"', 'id="start-menu"', 'id="lock-screen"', 'id="setup-screen"', 'modal-overlay', 'class="toast', 'id="desktop"', 'data-theme='];
/** Markup only: contents of <script>/<style> removed exactly as the HTML parser would (they end at the first closing tag). */
function markupOnly(html) {
  return html.replace(/(<script[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>').replace(/(<style[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
}
function assertClean(html) {
  const markup = markupOnly(html);
  RUNTIME_MARKERS.forEach((m) => assert(!markup.includes(m), 'saved HTML has no runtime DOM marker ' + m));
  assert(/<div id="os-root" data-keep=""><\/div>/.test(html), '#os-root is empty in saved HTML');
  assert(html.startsWith('<!DOCTYPE html>'), 'starts with doctype');
  assert((markup.match(/<!DOCTYPE/gi) || []).length === 1, 'exactly one doctype');
  assert(html.includes('MyOS: a portable, single-file web desktop'), 'README comment preserved');
}

(async () => {
  browser = await chromium.launch();
  const template = fs.readFileSync(DIST, 'utf8');

  await test('Template has no network references (no http(s) src/href, no module scripts)', async () => {
    assert(!/<script[^>]+src=/i.test(template), 'no external scripts');
    assert(!/<link[^>]+href=/i.test(template), 'no external stylesheets');
    assert(!/type="module"/i.test(template), 'no module scripts');
    assert(!/url\(\s*['"]?https?:/i.test(template), 'no remote CSS urls');
    assert(!/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(template), 'no network APIs used');
    const page = await open(DIST);
    const reqs = [];
    page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) reqs.push(r.url()); });
    await skipSetup(page);
    for (const id of ['explorer', 'notepad', 'todo', 'calculator', 'paint', 'settings', 'terminal']) await page.evaluate((id) => OS.launch(id), id);
    await page.waitForTimeout(300);
    assert(reqs.length === 0, 'no network requests, got ' + reqs.join(','));
    assert(page.__errors.length === 0, 'no page errors: ' + page.__errors.join('; '));
    await closeCtx(page);
    return (template.length / 1024).toFixed(0) + ' KB file, 0 network requests, all 7 apps launched without errors';
  });

  // ---------------------------------------------------------------- 1a
  let fsaSaved;
  await test('Round trip via File System Access path (note persists)', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    await createNoteViaUI(page, 'hello.txt', 'Hello from the FSA path');
    await page.waitForFunction(() => window.__saves.length === 1);
    fsaSaved = await lastSave(page);
    assert(await page.evaluate(() => !OS.dirty), 'not dirty after save');
    assert(page.__errors.length === 0, page.__errors.join('; '));
    await closeCtx(page);
    const file = write('fsa-1.html', fsaSaved);
    const p2 = await open(file, 'fsa');
    await p2.waitForSelector('#taskbar:not([hidden])');
    assert(!(await p2.$('#setup-screen')), 'setup screen not shown again');
    const txt = await readPath(p2, '/Documents/hello.txt');
    assert(txt === 'Hello from the FSA path', 'note content persisted, got ' + JSON.stringify(txt));
    await closeCtx(p2);
    return 'note created in Notepad, Ctrl+S, reopened: content identical';
  });

  // ---------------------------------------------------------------- 1b + 6
  await test('Round trip via download fallback (File System Access API unavailable)', async () => {
    const page = await open(DIST, 'none');
    await skipSetup(page);
    assert(await page.evaluate(() => !OS.storage.hasFSA()), 'FSA reported unavailable');
    await page.evaluate(() => OS.launch('notepad'));
    await page.locator('.np-text').fill('Hello from the download path');
    await page.keyboard.press('Control+S');
    await page.locator('.modal .input').fill('dl.txt');
    const dl = await saveDownload(page, () => page.keyboard.press('Enter'));
    assert(dl.name === 'myos.html', 'download is named myos.html, got ' + dl.name);
    await page.waitForSelector('.notice');
    const notice = await page.textContent('.notice');
    assert(/replace your old file/i.test(notice), 'fallback notice explains replacing the file');
    await page.click('.notice .btn');
    assert(!(await page.$('.notice')), 'notice is dismissible');
    await closeCtx(page);
    const p2 = await open(dl.path, 'none');
    await p2.waitForSelector('#taskbar:not([hidden])');
    assert((await readPath(p2, '/Documents/dl.txt')) === 'Hello from the download path', 'note persisted via fallback');
    await closeCtx(p2);
    return 'downloaded myos.html, notice shown and dismissed, reopened: note intact';
  });

  await test('FSA blocked by policy (SecurityError) falls back to download with a message', async () => {
    const page = await open(DIST, 'blocked');
    await skipSetup(page);
    await page.evaluate(() => OS.vfs.createFile(OS.vfs.root(), 'x.txt', 'blocked-path'));
    const dl = await saveDownload(page);
    await page.waitForSelector('.notice');
    const txt = await page.textContent('#notices');
    assert(/could not write the file directly/i.test(txt) && /SecurityError/.test(txt), 'explains why');
    await closeCtx(page);
    const p2 = await open(dl.path);
    await p2.waitForSelector('#taskbar:not([hidden])');
    assert((await readPath(p2, '/x.txt')) === 'blocked-path', 'content persisted');
    await closeCtx(p2);
    return 'SecurityError → message + downloaded copy that reopens correctly';
  });

  await test('Cancelling the save dialog does NOT download and keeps unsaved state', async () => {
    const page = await open(DIST, 'cancel');
    await skipSetup(page);
    await page.evaluate(() => OS.vfs.createFile(OS.vfs.root(), 'c.txt', 'x'));
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.keyboard.press('Control+S');
    await page.waitForTimeout(800);
    assert(!downloaded, 'no download on cancel');
    assert(await page.evaluate(() => OS.dirty), 'still dirty');
    assert(await page.evaluate(() => document.getElementById('save-btn').classList.contains('dirty')), 'unsaved dot visible');
    await closeCtx(page);
    return 'AbortError → no fallback download, dot remains';
  });

  // ---------------------------------------------------------------- 2
  await test('Save → reopen → save three times: stable size, no runtime DOM', async () => {
    let html = fsaSaved, sizes = [], skeletons = [];
    for (let i = 1; i <= 3; i++) {
      const page = await open(write('cycle-' + i + '.html', html), 'fsa');
      await page.waitForSelector('#taskbar:not([hidden])');
      // open windows, menus, dialogs, toasts so there is plenty of runtime DOM around while saving
      await page.evaluate(() => { OS.launch('explorer'); OS.launch('terminal'); OS.launch('settings'); OS.shell.openStart(); OS.toast('busy'); OS.dialogs.alert('open dialog'); });
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
    assert(spread < 200, 'size stable (spread ' + spread + ' bytes)');
    const growth = sizes[2] - Buffer.byteLength(template);
    return 'sizes ' + sizes.join(' / ') + ' bytes; template part identical; total data added vs empty template: ' + growth + ' B';
  });

  // ---------------------------------------------------------------- 3
  await test('Script-injection note </script><script>alert(1)</script> round-trips safely', async () => {
    const evil = '</script><script>alert(1)</script> and <!-- comment --> and \u2028\u2029 separators';
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    await createNoteViaUI(page, 'evil.txt', evil);
    await page.waitForFunction(() => window.__saves.length === 1);
    const html = await lastSave(page);
    await closeCtx(page);
    const tag = dataTag(html);
    assert(!tag.includes('<'), 'no raw "<" inside os-data');
    assert(!html.includes('<script>alert(1)'), 'payload not present as markup');
    assert(!/[\u2028\u2029]/.test(tag), 'U+2028/2029 escaped');
    assert((markupOnly(html).match(/<script/gi) || []).length === 2, 'still exactly two <script> elements in the file');
    const p2 = await open(write('evil.html', html), 'fsa');
    await p2.waitForSelector('#taskbar:not([hidden])');
    await p2.waitForTimeout(300);
    const alerts = await p2.evaluate(() => window.__alerts);
    assert(alerts.length === 0, 'no alert ran');
    assert(p2.__errors.length === 0, 'no errors / native dialogs: ' + p2.__errors.join('; '));
    assert((await readPath(p2, '/Documents/evil.txt')) === evil, 'content identical after reopen');
    // also open it in Notepad and the Markdown preview path
    await p2.evaluate(() => OS.openFile(OS.vfs.resolvePath('/Documents/evil.txt')));
    await p2.waitForTimeout(200);
    assert((await p2.evaluate(() => window.__alerts.length)) === 0, 'no alert after opening in Notepad');
    await closeCtx(p2);
    return 'escaped as \\u003c in the tag; reopened with no script execution; text identical';
  });

  // ---------------------------------------------------------------- 4
  await test('Password: encrypted file has no plaintext; wrong password rejected; correct unlocks', async () => {
    const page = await open(DIST, 'fsa');
    await page.fill('#setup-screen input[placeholder="New password"]', 'correct horse');
    await page.fill('#setup-screen input[placeholder="Repeat password"]', 'correct horse');
    await page.click('#setup-screen .btn.primary');
    await page.waitForSelector('#taskbar:not([hidden])', { timeout: 20000 });
    await page.evaluate(() => { const d = OS.vfs.resolvePath('/Documents'); OS.vfs.createFile(d, 'TopSecretFileName.txt', 'SECRET-PAYLOAD-12345'); OS.state.settings.theme = 'dark'; });
    await page.evaluate(() => OS.storage.backup.write());
    const ls = await page.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n'));
    assert(ls.length > 0, 'backup written');
    assert(!/SECRET-PAYLOAD|TopSecretFileName|Documents|Welcome/.test(ls), 'backup in browser storage is encrypted');
    const html = await saveFSA(page);
    await closeCtx(page);

    const obj = JSON.parse(dataTag(html));
    const keys = Object.keys(obj).sort().join(',');
    assert(keys === 'ciphertext,encrypted,fileId,iterations,iv,salt,version', 'envelope has only the allowed keys: ' + keys);
    assert(obj.iterations >= 600000, 'iterations >= 600000');
    assert(Buffer.from(obj.salt, 'base64').length === 16, '16-byte salt');
    assert(Buffer.from(obj.iv, 'base64').length === 12, '12-byte IV');
    // Strings that also appear in the OS source code (e.g. "Welcome.md") must not appear MORE often than in the empty template.
    const count = (h, s) => h.split(s).length - 1;
    ['SECRET-PAYLOAD', 'TopSecretFileName', 'Welcome.md', 'Documents', '"theme"', 'Save this file with Ctrl+S', 'aurora'].forEach((s) =>
      assert(count(html, s) === count(template, s), 'no plaintext "' + s + '" added to saved file'));
    assert(!/[{,]"(vfs|settings|apps|nodes)"/.test(dataTag(html)), 'no data keys in tag');
    assertClean(html);

    const file = write('enc.html', html);
    const p2 = await open(file, 'fsa');
    await p2.waitForSelector('#lock-screen input');
    await p2.fill('#lock-screen input', 'wrong password');
    await p2.click('#lock-screen .btn');
    await p2.waitForFunction(() => /wrong password/i.test(document.querySelector('#lock-screen .err').textContent), null, { timeout: 20000 });
    assert(await p2.evaluate(() => OS.state === null), 'still locked after wrong password');
    await p2.fill('#lock-screen input', 'correct horse');
    await p2.click('#lock-screen .btn');
    await p2.waitForSelector('#taskbar:not([hidden])', { timeout: 20000 });
    assert((await readPath(p2, '/Documents/TopSecretFileName.txt')) === 'SECRET-PAYLOAD-12345', 'decrypted content');
    // IV must be fresh on every save
    await p2.evaluate(() => OS.markDirty());
    const again = await saveFSA(p2);
    const obj2 = JSON.parse(dataTag(again));
    assert(obj2.iv !== obj.iv, 'fresh IV on each save');
    assert(p2.__errors.length === 0, p2.__errors.join('; '));

    // Lock now
    await p2.evaluate(() => OS.launch('notepad'));
    await p2.evaluate(() => OS.shell.lockNow());
    await p2.waitForSelector('#lock-screen input');
    assert(await p2.evaluate(() => OS.state === null && !OS.crypto.isEnabled()), 'state and key dropped');
    const body = await p2.evaluate(() => document.body.innerHTML);
    assert(!body.includes('SECRET-PAYLOAD') && !body.includes('TopSecretFileName') && !body.includes('class="win'), 'no decrypted data or windows left in DOM');
    await p2.fill('#lock-screen input', 'correct horse');
    await p2.click('#lock-screen .btn');
    await p2.waitForSelector('#taskbar:not([hidden])', { timeout: 20000 });
    assert((await readPath(p2, '/Documents/TopSecretFileName.txt')) === 'SECRET-PAYLOAD-12345', 'unlocked again');
    await closeCtx(p2);
    return 'envelope keys only; no plaintext; wrong pw → error; correct pw opens; new IV per save; Lock now clears DOM/state';
  });

  // ---------------------------------------------------------------- 5
  await test('Binary import → save → reopen → export is byte-identical', async () => {
    const bin = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), crypto.randomBytes(200000), Buffer.from(Array.from({ length: 256 }, (_, i) => i))]);
    const src = path.join(OUT, 'sample.png'); fs.writeFileSync(src, bin);
    const txt = Buffer.from('\ufeffBOM text, CRLF\r\nline 2 ünïcødé\r\n'); const srcTxt = path.join(OUT, 'notes.txt'); fs.writeFileSync(srcTxt, txt);
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    await page.evaluate(() => OS.launch('explorer'));
    await page.setInputFiles('.app-explorer input[type=file]', [src, srcTxt]);
    await page.waitForFunction(() => OS.vfs.resolvePath('/sample.png') && OS.vfs.resolvePath('/notes.txt'));
    const sizeCol = await page.textContent('.ex-row[data-id] .c-size');
    const html = await saveFSA(page);
    await closeCtx(page);
    const p2 = await open(write('bin.html', html), 'fsa');
    await p2.waitForSelector('#taskbar:not([hidden])');
    const outs = [];
    for (const p of ['/sample.png', '/notes.txt']) {
      const [dl] = await Promise.all([p2.waitForEvent('download'), p2.evaluate((p) => OS.exportFile(OS.vfs.resolvePath(p)), p)]);
      const o = path.join(OUT, 'export-' + dl.suggestedFilename()); await dl.saveAs(o); outs.push({ name: dl.suggestedFilename(), buf: fs.readFileSync(o) });
    }
    assert(outs[0].name === 'sample.png' && outs[1].name === 'notes.txt', 'original names kept');
    assert(sha(outs[0].buf) === sha(bin), 'PNG/binary byte-identical');
    assert(sha(outs[1].buf) === sha(txt), 'text (BOM, CRLF, UTF-8) byte-identical');
    const mime = await p2.evaluate(() => OS.vfs.stat(OS.vfs.resolvePath('/sample.png')).mime);
    assert(mime === 'image/png', 'MIME kept: ' + mime);
    await closeCtx(p2);
    return bin.length + ' B binary + text file, SHA-256 identical after export; size column shows "' + sizeCol + '"';
  });

  // ---------------------------------------------------------------- 7
  await test('Windows stay reachable at tiny and huge viewport sizes', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    await page.evaluate(() => { OS.launch('notepad'); OS.launch('calculator'); OS.launch('explorer'); });
    // drag the focused window far off-screen in every direction
    const tb = page.locator('.win.focused .win-titlebar');
    const bb = await tb.boundingBox();
    await page.mouse.move(bb.x + 60, bb.y + 15); await page.mouse.down();
    await page.mouse.move(-3000, 5000, { steps: 5 }); await page.mouse.up();
    async function check(label) {
      const r = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight - 48;
        return OS.wm.windows.map((w) => { const t = w.titlebar.getBoundingClientRect(); return { l: t.left, r: t.right, t: t.top, b: t.bottom, vw, vh, max: w.maximized }; });
      });
      r.forEach((w, i) => {
        assert(w.t >= 0 && w.b <= w.vh + 1, label + ': window ' + i + ' title bar vertically visible (' + w.t + '..' + w.b + ' / ' + w.vh + ')');
        assert(Math.min(w.r, w.vw) - Math.max(w.l, 0) >= 60, label + ': window ' + i + ' title bar has ≥60px visible horizontally');
      });
      return r;
    }
    await check('after drag off-screen');
    await page.setViewportSize({ width: 2560, height: 1440 }); await page.waitForTimeout(200); await check('2560x1440');
    await page.setViewportSize({ width: 320, height: 480 }); await page.waitForTimeout(200); await check('320x480');
    await page.setViewportSize({ width: 200, height: 260 }); await page.waitForTimeout(200); await check('200x260');
    await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(200); await check('back to 1280x800');
    await page.screenshot({ path: path.join(OUT, 'resize.png') });
    // narrow screens open maximized
    await page.setViewportSize({ width: 600, height: 800 });
    await page.evaluate(() => OS.launch('todo'));
    assert(await page.evaluate(() => OS.wm.focused.maximized), 'new window maximized under 700px');
    await page.screenshot({ path: path.join(OUT, 'narrow.png') });
    await closeCtx(page);
    return 'checked after off-screen drag and at 2560x1440, 320x480, 200x260, 1280x800; <700px opens maximized';
  });

  // ---------------------------------------------------------------- extras
  await test('Crash-recovery backup is offered and restores unsaved work', async () => {
    const file = write('backup-base.html', fsaSaved);
    const page = await open(file, 'fsa');
    await page.waitForSelector('#taskbar:not([hidden])');
    await page.evaluate(() => OS.vfs.createFile(OS.vfs.root(), 'unsaved.txt', 'not yet saved'));
    await page.evaluate(() => OS.storage.backup.tick());
    await page.reload(); // simulate crash / reopen without saving (localStorage survives in this context)
    assert(page.__beforeunload === 1, 'unsaved-changes warning shown when leaving the page');
    await page.waitForSelector('.modal');
    assert(/crash-recovery backup/i.test(await page.textContent('.modal')), 'restore offered');
    await page.click('.modal .btn.primary');
    await page.waitForFunction(() => OS.vfs.resolvePath('/unsaved.txt'));
    assert(await page.evaluate(() => OS.dirty), 'restored data is marked unsaved');
    await closeCtx(page);
    return 'leave-page warning fired; backup written on tick, offered after reload, restored';
  });

  await test('Migration: a version-1 file opens and upgrades to the current version', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    const v1 = await page.evaluate(() => {
      const d = JSON.parse(JSON.stringify(OS.state));
      d.version = 1; delete d.settings.clock24; d.geometry = { notepad: { x: 40, y: 50, w: 500, h: 300 } }; delete d.windows;
      return OS.storage.buildHTML(d);
    });
    await closeCtx(page);
    const p2 = await open(write('v1.html', v1), 'fsa');
    await p2.waitForSelector('#taskbar:not([hidden])');
    const st = await p2.evaluate(() => ({ v: OS.state.version, c: OS.state.settings.clock24, w: OS.state.windows.notepad, g: 'geometry' in OS.state }));
    assert(st.v === 2 && st.c === false && st.w && st.w.x === 40 && !st.g, 'migrated: ' + JSON.stringify(st));
    await closeCtx(p2);
    return 'v1 → v2 (clock24 added, geometry → windows)';
  });

  await test('VFS rules: invalid names, duplicates, moving a folder into itself', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    const r = await page.evaluate(() => {
      const v = OS.vfs, root = v.root(), out = {};
      function tryIt(k, fn) { try { fn(); out[k] = 'ok'; } catch (e) { out[k] = 'err'; } }
      const a = v.mkdir(root, 'A'), b = v.mkdir(a, 'B');
      tryIt('slash', () => v.createFile(root, 'x/y', ''));
      tryIt('empty', () => v.mkdir(root, '  '));
      tryIt('dup', () => v.mkdir(root, 'a'));
      tryIt('self', () => v.move(a, a));
      tryIt('desc', () => v.move(a, b));
      tryIt('validMove', () => v.move(b, root));
      out.path = v.pathOf(b);
      out.resolve = v.resolvePath('../A/./', v.resolvePath('/Documents')) === a;
      return out;
    });
    assert(r.slash === 'err' && r.empty === 'err' && r.dup === 'err' && r.self === 'err' && r.desc === 'err' && r.validMove === 'ok', JSON.stringify(r));
    assert(r.path === '/B' && r.resolve, 'paths ' + JSON.stringify(r));
    await closeCtx(page);
    return 'all rules enforced';
  });

  await test('Terminal commands work through the VFS', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    await page.evaluate(() => OS.launch('terminal'));
    const type = async (cmd) => { await page.locator('.term-in').fill(cmd); await page.keyboard.press('Enter'); };
    for (const c of ['mkdir -p proj/src', 'cd proj', 'echo "hello world" > a.txt', 'echo second >> a.txt', 'touch b.txt', 'mv b.txt src/c.txt',
      'cd src', 'pwd', 'cd ../..', 'cat /proj/a.txt', 'ls -l proj', 'rm proj', 'rm -r proj/src', 'mkdir "My Folder"', 'cd My\\ Folder', 'pwd', 'cd /', 'nosuch']) await type(c);
    const out = await page.textContent('.term-out');
    const s = await page.evaluate(() => ({ a: OS.vfs.readText(OS.vfs.resolvePath('/proj/a.txt')), src: !!OS.vfs.resolvePath('/proj/src'), my: !!OS.vfs.resolvePath('/My Folder') }));
    assert(s.a === 'hello world\nsecond\n', 'echo/redirect: ' + JSON.stringify(s.a));
    assert(!s.src && s.my, 'rm -r and quoted mkdir');
    assert(out.includes('/proj/src') && out.includes('/My Folder') && /is a folder \(use rm -r\)/.test(out) && /command not found/.test(out), 'outputs');
    // history
    await page.locator('.term-in').focus();
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    assert((await page.inputValue('.term-in')) === 'cd /', 'history up arrow');
    await closeCtx(page);
    return 'mkdir/cd/pwd/echo >/>>/touch/mv/cat/ls/rm -r/quotes/history OK';
  });

  await test('Calculator parser (no eval) and keyboard input', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    const r = await page.evaluate(() => {
      const c = OS.calc, f = (e) => { try { return c.format(c.evaluate(e)); } catch (x) { return 'ERR:' + x.message; } };
      return { a: f('1+2*3'), b: f('(1+2)*3'), c: f('-2^2'), d: f('2^3^2'), e: f('0.1+0.2'), g: f('50%*8'), h: f('2(3+4)'), i: f('1/0'), j: f('1+'), k: f('7/2') };
    });
    const exp = { a: '7', b: '9', c: '-4', d: '512', e: '0.3', g: '4', h: '14', i: 'ERR:Cannot divide by zero', j: 'ERR:Incomplete expression', k: '3.5' };
    Object.keys(exp).forEach((k) => assert(r[k] === exp[k], k + ': ' + r[k] + ' != ' + exp[k]));
    assert(!/\beval\(|new Function/.test(template), 'no eval/new Function in the file');
    await page.evaluate(() => OS.launch('calculator'));
    await page.waitForFunction(() => document.activeElement.classList.contains('app-calc'));
    await page.keyboard.type('12*(3+4)'); await page.keyboard.press('Enter');
    assert((await page.textContent('.calc-expr')) === '84', 'keyboard input → 84');
    await closeCtx(page);
    return 'precedence, unary, power, percent, implicit ×, errors, keyboard';
  });

  await test('Paint draws, saves PNG into VFS, reopens it', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    await page.evaluate(() => OS.launch('paint'));
    const c = await page.locator('.pt-canvas').boundingBox();
    await page.mouse.move(c.x + 20, c.y + 20); await page.mouse.down(); await page.mouse.move(c.x + 200, c.y + 120, { steps: 10 }); await page.mouse.up();
    await page.keyboard.press('Control+S');
    await page.locator('.modal .input').fill('drawing');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => OS.vfs.resolvePath('/Pictures/drawing.png'));
    const info = await page.evaluate(() => { const id = OS.vfs.resolvePath('/Pictures/drawing.png'); const b = OS.vfs.readBytes(id); return { sig: Array.from(b.slice(0, 4)), mime: OS.vfs.stat(id).mime }; });
    assert(info.sig.join() === '137,80,78,71' && info.mime === 'image/png', 'valid PNG');
    await page.evaluate(() => OS.openFile(OS.vfs.resolvePath('/Pictures/drawing.png')));
    await page.waitForFunction(() => /drawing\.png - Paint/.test(OS.wm.focused.title));
    await closeCtx(page);
    return 'stroke drawn, Ctrl+S → saved as /Pictures/drawing.png, reopened';
  });

  await test('Explorer: drag a file onto a folder moves it; Move dialog; delete with confirmation', async () => {
    const page = await open(DIST, 'fsa');
    await skipSetup(page);
    await page.evaluate(() => { OS.vfs.createFile(OS.vfs.root(), 'drag-me.txt', 'x'); OS.launch('explorer'); });
    await page.locator('.ex-row', { hasText: 'drag-me.txt' }).dragTo(page.locator('.ex-row', { hasText: 'Pictures' }));
    assert(await page.evaluate(() => !!OS.vfs.resolvePath('/Pictures/drag-me.txt')), 'moved by drag-and-drop');
    await page.locator('.ex-row', { hasText: 'Documents' }).click();
    await page.locator('.win.focused [title="Delete (Del)"]').click();
    await page.waitForSelector('.modal');
    await page.click('.modal .btn:not(.primary)'); // cancel
    assert(await page.evaluate(() => !!OS.vfs.resolvePath('/Documents')), 'cancel keeps folder');
    await closeCtx(page);
    return 'HTML5 drag-and-drop between folders works; delete asks for confirmation';
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
