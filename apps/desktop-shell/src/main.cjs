const { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

app.setName('知境·Knowra');
const smokeDirectory = process.env.KNOWRA_DESKTOP_SMOKE_DIR;
if (smokeDirectory) app.setPath('userData', path.join(smokeDirectory, 'shell'));
else app.setPath('userData', path.join(app.getPath('appData'), 'Knowra', 'shell'));
let window, child, origin, rendererReady = false, shuttingDown = false, finished = false;
let pendingClose;
const dataDirectory = smokeDirectory ? path.join(smokeDirectory, 'offline') : path.join(app.getPath('appData'), 'Knowra', 'offline');
const root = __dirname;
const logDirectory = path.join(app.getPath('userData'), 'logs');
function log(message) {
  fs.mkdirSync(logDirectory, { recursive: true });
  fs.appendFileSync(path.join(logDirectory, 'desktop.log'), `${new Date().toISOString()} ${message}\n`);
}
function focus() { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } }
function external(url) {
  try { if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch { /* 忽略非法链接。 */ }
}
function prepareRenderer() {
  if (!rendererReady || !window || window.isDestroyed()) return Promise.reject(new Error('页面尚未就绪，请稍后退出。'));
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pendingClose = null; reject(new Error('保存等待超时，窗口已保留，请稍后重试。')); }, 20000);
    pendingClose = { id, resolve: () => { clearTimeout(timer); pendingClose = null; resolve(); }, reject: message => { clearTimeout(timer); pendingClose = null; reject(new Error(message)); } };
    window.webContents.send('prepare-close', id);
  });
}
async function quitSafely() {
  if (shuttingDown || finished) return;
  shuttingDown = true;
  try {
    await prepareRenderer();
    if (child) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.removeListener('exit', onExit); reject(new Error('本地服务仍在结束请求，请稍后重试退出。')); }, 15000);
        const onExit = () => { clearTimeout(timer); resolve(); };
        child.once('exit', onExit);
        child.postMessage('shutdown');
      });
    }
    finished = true;
    window?.destroy();
    app.quit();
  } catch (error) {
    shuttingDown = false;
    window?.webContents.send('cancel-close');
    log(`退出暂停：${error.message}`);
    focus();
    await dialog.showMessageBox(window, { type: 'warning', title: '尚未退出', message: '请完成保存后再退出', detail: error.message, buttons: ['返回应用'] });
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', focus);
  app.on('activate', focus);
  app.on('before-quit', event => { if (!finished) { event.preventDefault(); void quitSafely(); } });
  ipcMain.on('renderer-ready', event => { if (event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame) rendererReady = true; });
  ipcMain.on('close-result', (event, result) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || result?.id !== pendingClose?.id) return;
    if (result.ok === true) pendingClose.resolve();
    else pendingClose.reject(String(result.message || '保存未完成').slice(0, 500));
  });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '知境·Knowra', submenu: [{ role: 'about', label: '关于知境·Knowra' }, { type: 'separator' }, { label: '打开本机资料目录', click: () => { void shell.openPath(dataDirectory); } }, { type: 'separator' }, { role: 'hide', label: '隐藏知境·Knowra' }, { role: 'hideOthers', label: '隐藏其他应用' }, { role: 'unhide', label: '显示全部' }, { type: 'separator' }, { label: '退出知境·Knowra', accelerator: 'Command+Q', click: () => { void quitSafely(); } }] },
      { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
      { label: '窗口', submenu: [{ role: 'minimize', label: '最小化' }, { role: 'zoom', label: '缩放' }, { role: 'togglefullscreen', label: '全屏' }, { type: 'separator' }, { label: '关闭并保存', accelerator: 'Command+W', click: () => { void quitSafely(); } }] }
    ]));
    child = utilityProcess.fork(path.join(root, 'runtime.mjs'), [dataDirectory, path.join(root, 'web')], { serviceName: 'Knowra 本地资料服务', stdio: 'pipe' });
    // 不记录启动 URL 或同步凭据；原始服务输出仅在内存排空。
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.on('exit', code => {
      child = null;
      if (!shuttingDown && !finished) {
        log(`本地服务退出：${code}`);
        dialog.showErrorBox('本地服务已停止', '本机已保存的数据仍在资料目录中。页面已保留，请先复制或导出尚未保存的正文，再重新打开应用。');
        if (!window) { finished = true; app.quit(); }
      }
    });
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('本地服务启动超时')), 30000);
      child.on('message', message => {
        if (message.type === 'ready') { clearTimeout(timer); resolve(message); }
        if (message.type === 'error') { clearTimeout(timer); reject(new Error(message.message)); }
      });
    });
    origin = ready.origin;
    window = new BrowserWindow({ width: 1380, height: 920, minWidth: 960, minHeight: 640, show: false, title: '知境·Knowra', backgroundColor: '#f8f7f3', webPreferences: { preload: path.join(root, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
    window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) { event.preventDefault(); external(url); }
    });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('render-process-gone', () => { rendererReady = false; log('页面进程异常退出'); dialog.showErrorBox('页面已停止', '请重新打开应用；本机已保存内容仍保留。'); finished = true; child?.kill(); window.destroy(); app.quit(); });
    window.on('close', event => { if (!finished) { event.preventDefault(); void quitSafely(); } });
    await window.loadURL(ready.launchUrl);
    window.show();
    log(`启动完成，Electron ${process.versions.electron}，Node ${process.versions.node}`);
    if (smokeDirectory) fs.writeFileSync(path.join(smokeDirectory, 'ready.json'), JSON.stringify({ origin, node: process.versions.node, electron: process.versions.electron }));
  }).catch(error => {
    log(`启动失败：${error.message}`);
    dialog.showErrorBox('无法启动知境·Knowra', `${error.message}\n\n资料目录：${dataDirectory}`);
    finished = true; child?.kill(); window?.destroy(); app.quit();
  });
}
