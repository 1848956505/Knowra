const { contextBridge, ipcRenderer } = require('electron');
let registered = false;
contextBridge.exposeInMainWorld('knowraDesktop', {
  onCancelClose(callback) { if (typeof callback === 'function') ipcRenderer.on('cancel-close', () => callback()); },
  onPrepareClose(callback) {
    if (registered || typeof callback !== 'function') return;
    registered = true;
    ipcRenderer.on('prepare-close', async (_event, id) => {
      try { await callback(); ipcRenderer.send('close-result', { id, ok: true }); }
      catch (error) { ipcRenderer.send('close-result', { id, ok: false, message: String(error?.message || '保存未完成') }); }
    });
    ipcRenderer.send('renderer-ready');
  }
});
