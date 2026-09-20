const { contextBridge, ipcRenderer } = require('electron');
let registered = false;
contextBridge.exposeInMainWorld('knowraDesktop', {
  readRecoveryDrafts() { const result = ipcRenderer.sendSync('read-recovery-drafts'); if (result.error) throw new Error(result.error); return result.drafts; },
  writeRecoveryDraft(key, draft) { return ipcRenderer.invoke('write-recovery-draft', key, draft); },
  onCancelClose(callback) { if (typeof callback === 'function') ipcRenderer.on('cancel-close', () => callback()); },
  onPrepareClose(callback) {
    if (registered || typeof callback !== 'function') return;
    registered = true;
    ipcRenderer.on('prepare-close', async (_event, id, mode) => {
      try { await callback(mode); ipcRenderer.send('close-result', { id, ok: true }); }
      catch (error) { ipcRenderer.send('close-result', { id, ok: false, message: String(error?.message || '保存未完成') }); }
    });
    ipcRenderer.send('renderer-ready');
  }
});
