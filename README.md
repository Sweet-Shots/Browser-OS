# Nimbus

A portable desktop that lives in **one HTML file**. Put `dist/nimbus.html` on a USB stick or cloud drive and double-click it on any computer: no install, no internet, no admin rights. Your files, settings and apps are saved inside the file itself.

- **Material You-style desktop:** shelf with pinned and running apps, a launcher with search (Ctrl+K), quick settings with notifications, window snapping, and colors that follow your wallpaper. Light and dark themes.
- **Apps:** Files (with Trash), Notepad (Markdown preview), Settings, Store, Browser, Photos, Music, Clock (alarms, timer, stopwatch), Paint, To-do, Calculator, Terminal.
- **Games:** Solitaire, Comet (an original snake-style game) and Sudoku.
- **Saving:** Chrome and Edge overwrite the file in place. Firefox and Safari download an updated copy. A crash-recovery backup is kept in the browser while you have unsaved changes.
- **Optional password:** everything in the file is encrypted with AES-GCM (PBKDF2-SHA-256, 600,000 iterations). There is no password recovery.

The full user guide is the comment at the top of `dist/nimbus.html`.

## Develop

```bash
node build.js
```

The build writes `src/` into `dist/nimbus.html`. It has no dependencies, and the built file needs no tooling at runtime.

```bash
node test/run-tests.js
```

The test suite runs 22 end-to-end tests in headless Chromium and needs Playwright. Every test has a 60-second limit.

| Path | What |
| --- | --- |
| `src/index.html` | Page template and user README |
| `src/core/` | Snapshot, utilities, icons, app registry, storage, crypto, file system, theme, sound, dialogs, window manager, shell, setup wizard |
| `src/apps/` | One file per app, each a single `OS.registerApp({...})` call |
| `src/styles/` | CSS |
| `src/fonts/` | Figtree (SIL Open Font License 1.1) |

To add an app, write one `OS.registerApp({ id, name, icon, launch(win, args) { ... } })` block in `src/apps/`, or install a `.js` file from **Store → Install from file**. See `src/apps/99-example.js`.
