/* =====================================================================
   EXAMPLE APP: how to add your own app
   ---------------------------------------------------------------------
   Copy this block, remove the comment markers, change the id/name, and
   rebuild (node build.js), or paste it at the end of the script in a
   built myos.html. That's all: the app gets a desktop icon, a start
   menu entry, a window, and (if fileTypes is set) opens matching files.

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
