const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/** 主进程到 utility process 的私有通道；渲染页面没有路径参数入口。 */
function createBackupRpc({ getChild, timeoutMs = 120000 }) {
  const pending = new Map();
  const onMessage = message => {
    if (message?.type !== 'backup-transfer-response') return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId); clearTimeout(request.timer);
    if (message.ok) request.resolve(message.result);
    else request.reject(new Error(message.message || '完整备份操作失败，原资料已保留。'));
  };
  return {
    onMessage,
    request(action, input) {
      const child = getChild();
      if (!child) return Promise.reject(new Error('本地服务不可用，请重新打开应用后操作备份。'));
      return new Promise((resolve, reject) => {
        const requestId = randomUUID();
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('完整备份等待超时，请检查所选目录后重试。')); }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        try { child.postMessage({ type: 'backup-transfer-request', requestId, action, ...input }); }
        catch { clearTimeout(timer); pending.delete(requestId); reject(new Error('完整备份通道已关闭，请重新打开应用。')); }
      });
    },
    close() {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('完整备份通道已关闭，请重新打开应用。')); }
      pending.clear();
    }
  };
}

function createBackupTransfers({ getWindow, getOrigin, isClosing, rpc, dialog }) {
  let busy = false;
  function trusted(event) {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || new URL(window.webContents.getURL()).origin !== getOrigin()) throw new Error('无效的完整备份请求。');
    if (isClosing()) throw new Error('应用正在关闭，请重新打开后操作备份。');
    return window;
  }
  async function current(event, datasetId) {
    const window = trusted(event);
    const currentDataset = await window.webContents.executeJavaScript('globalThis.knowraRuntime?.datasetId');
    trusted(event);
    if (currentDataset !== datasetId) throw new Error('资料库已变化，请重新加载后操作备份。');
    await rpc.request('status', { datasetId });
    trusted(event);
    return window;
  }
  return {
    async transfer(event, input) {
      trusted(event);
      if (!input || !['export', 'import'].includes(input.action) || typeof input.datasetId !== 'string' || !input.datasetId || input.datasetId.length > 200
        || Object.keys(input).some(key => !['action', 'datasetId', 'backupId'].includes(key))
        || (input.action === 'export' ? typeof input.backupId !== 'string' || !/^\d+-[a-f0-9-]+$/.test(input.backupId) : input.backupId !== undefined)) throw new Error('完整备份操作参数无效。');
      if (busy) throw new Error('已有完整备份操作进行中，请等待完成。');
      busy = true;
      try {
        const window = await current(event, input.datasetId);
        const choice = await dialog.showOpenDialog(window, { title: input.action === 'export' ? '选择完整备份的独立父目录' : '选择外部完整备份目录',
          properties: ['openDirectory'], buttonLabel: input.action === 'export' ? '导出到此目录' : '检查并导入' });
        trusted(event);
        if (choice.canceled || !choice.filePaths?.length) return null;
        if (choice.filePaths.length !== 1 || !path.isAbsolute(choice.filePaths[0])) throw new Error('请选择一个完整备份目录。');
        const selected = fs.lstatSync(choice.filePaths[0]);
        if (!selected.isDirectory() || selected.isSymbolicLink()) throw new Error('所选目录必须是普通目录，不能是符号链接。');
        const selection = { path: choice.filePaths[0], dev: selected.dev, ino: selected.ino };
        await current(event, input.datasetId);
        const result = await rpc.request(input.action, { datasetId: input.datasetId, backupId: input.backupId, selection });
        await current(event, input.datasetId); // 恢复/退出期间的过期回执不能显示成功。
        return result;
      } finally { busy = false; }
    }
  };
}

module.exports = { createBackupRpc, createBackupTransfers };
