/* =====================================================================
   EXAMPLE APP: how to add your own app
   ---------------------------------------------------------------------
   Three ways to add an app:
   1. Save the block below (without the comment markers) as a .js file
      and install it in Nimbus: Store > Install from file.
   2. Put it in src/apps/ and rebuild with "node build.js".
   3. Paste it at the end of the script in a built nimbus.html.
   The app appears in the launcher, can be pinned to the shelf or the
   desktop, gets windows, and (if fileTypes is set) opens those files.
   Set optional: true to make it installable from the Store instead.

   OS.registerApp({
     id: 'hello',                       // unique id (also the key for saved window size and app state)
     name: 'Hello',
     icon: OS.appIcons.generic,         // any inline <svg> string
     fileTypes: [],                     // e.g. ['csv'] to open .csv files from Files / Terminal "open"
     defaultSize: { w: 360, h: 240 },
     singleInstance: false,
     launch: function (win, args) {
       // win.body       : element to render into
       // win.setTitle() : change the title bar text
       // win.close()    : close the window
       // win.onClose(fn): fn may return false (or a Promise of false) to keep the window open
       // win.getState(defaults) / win.setState(obj): persistent per-app data (saved in the file)
       // win.vfs, win.dialogs, win.toast, win.markDirty()
       var count = win.getState({ clicks: 0 }).clicks;
       var label = OS.util.h('p', { style: { padding: '16px' } }, 'Clicked ' + count + ' times');
       var btn = OS.util.h('button', { class: 'btn primary', style: { margin: '0 16px' } }, 'Click me');
       btn.addEventListener('click', function () {
         count++;
         win.setState({ clicks: count });     // marks the OS as having unsaved changes
         label.textContent = 'Clicked ' + count + ' times';
       });
       win.body.append(label, btn);
     }
   });
   ===================================================================== */
