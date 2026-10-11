import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixedLogMessages = new Set([
  '退出暂停：页面尚未就绪，请稍后退出。',
  '退出暂停：保存等待超时，窗口已保留，请稍后重试。',
  '退出暂停：本地服务仍在结束请求，请稍后重试退出。',
  '退出暂停：请先确认或取消输入法候选文字，再退出。',
  '页面进程异常退出'
]);

/** 只导出固定诊断语句；未知错误可能含正文、地址或凭据，不复制原文。 */
export function sanitizeDesktopLog(text) {
  return text.split('\n').filter(Boolean).map(line => {
    const match = /^(\d{4}-\d\d-\d\dT[\d:.]+Z) (.*)$/.exec(line);
    if (!match) return '[省略非标准日志行]';
    const [, time, message] = match;
    if (fixedLogMessages.has(message) || /^启动完成，Electron [\d.]+，Node [\d.]+$/.test(message)
      || /^本地服务退出：-?\d+$/.test(message)) return `${time} ${message}`;
    return `${time} [省略非白名单诊断内容]`;
  }).join('\n');
}

export function validateSyntheticDirectory(directory) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) && path.dirname(resolved) !== path.resolve(os.tmpdir())) {
    throw new Error('诊断只允许本次临时合成目录');
  }
  if (!/^knowra-titlebar-[\w-]+$/.test(path.basename(resolved)) || fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error('诊断目录身份无效');
  }
  return fs.realpathSync(resolved);
}

function readSyntheticLog(directory) {
  let current = directory;
  for (const segment of ['shell', 'logs', 'desktop.log']) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) return '[未生成 desktop.log]';
    if (fs.lstatSync(current).isSymbolicLink()) return '[拒绝读取符号链接日志]';
  }
  // 产品日志本身有轮转；这里再限长，不读取备份、数据库、ready.json 或配置。
  const fd = fs.openSync(current, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, 64 * 1024));
    fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
    return sanitizeDesktopLog(buffer.toString('utf8'));
  } finally { fs.closeSync(fd); }
}

export async function boundedDiagnostic(task, timeoutMs = 2000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task).then(value => ({ status: 'ok', value }), () => ({ status: 'unavailable' })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

/** 只挂观察器；不拦截退出、不自动点击弹窗、不增加45秒退出预算。 */
export async function createExitDiagnostics(application, page, directory, outputDirectory) {
  const synthetic = validateSyntheticDirectory(directory);
  const verified = await boundedDiagnostic(() => application.evaluate(({ app }, expected) => expected.includes(app.getPath('userData')),
    [path.join(synthetic, 'shell'), path.join(path.resolve(directory), 'shell')]));
  if (verified.status !== 'ok' || verified.value !== true) throw new Error('无法确认测试 APP 使用本次合成目录');
  const events = [];
  const record = phase => { if (events.length < 100) events.push({ phase, at: new Date().toISOString() }); };
  const process = application.process();
  process.once('exit', () => record('test-process-exit'));
  page.once('close', () => record('renderer-page-close'));
  page.once('crash', () => record('renderer-page-crash'));
  let requests = 0;
  page.on('request', () => { requests++; });
  page.on('requestfinished', () => { requests = Math.max(0, requests - 1); });
  page.on('requestfailed', () => { requests = Math.max(0, requests - 1); });
  const observer = await boundedDiagnostic(() => application.evaluate(({ app, ipcMain, BrowserWindow }) => {
    const events = [];
    globalThis.knowraExitDiagnosticEvents = events;
    const add = (phase, data = {}) => { if (events.length < 100) events.push({ phase, at: new Date().toISOString(), ...data }); };
    app.on('before-quit', () => add('main-before-quit'));
    app.on('will-quit', () => add('main-will-quit'));
    app.on('child-process-gone', (_event, details) => add('child-process-gone', { type: details.type, reason: details.reason, exitCode: details.exitCode }));
    ipcMain.on('close-result', (_event, result) => add('renderer-close-result', { ok: result?.ok === true }));
    for (const window of BrowserWindow.getAllWindows()) {
      window.on('close', () => add('window-close'));
      window.on('closed', () => add('window-closed'));
      window.webContents.on('unresponsive', () => add('renderer-unresponsive'));
      window.webContents.on('render-process-gone', () => add('renderer-gone'));
    }
    return true;
  }));
  const snapshots = [];
  async function snapshot(phase) {
    record(phase);
    const [main, renderer] = await Promise.all([
      boundedDiagnostic(() => application.evaluate(({ app, BrowserWindow }) => ({
        events: globalThis.knowraExitDiagnosticEvents ?? [],
        windows: BrowserWindow.getAllWindows().map(window => ({ destroyed: window.isDestroyed(), visible: window.isVisible() })),
        processes: app.getAppMetrics().map(item => ({ pid: item.pid, type: item.type }))
      }))),
      boundedDiagnostic(() => page.evaluate(() => ({
        readyState: document.readyState,
        rootInert: document.getElementById('root')?.inert === true,
        savingOverlay: [...document.querySelectorAll('[role="status"]')].some(node => node.textContent === '正在保存到本机…'),
        openNoteTabs: document.querySelectorAll('[role="tablist"][aria-label="打开的笔记"] [role="tab"]').length
      })))
    ]);
    snapshots.push({ phase, at: new Date().toISOString(), main, renderer, observedInFlightRequestCount: requests,
      process: { pid: process.pid, exitCode: process.exitCode, signalCode: process.signalCode } });
  }
  function persist() {
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, 'exit-state.json'), JSON.stringify({ observer: observer.status, events, snapshots,
      process: { pid: process.pid, exitCode: process.exitCode, signalCode: process.signalCode } }, null, 2));
    fs.writeFileSync(path.join(outputDirectory, 'desktop.log'), readSyntheticLog(synthetic));
  }
  return {
    async beforeQuit() { await snapshot('before-explicit-quit'); persist(); },
    async onFailure() {
      await snapshot('quit-failed-before-cleanup'); persist();
      // 页面截图仅限已核验的合成 APP；不截桌面、系统弹窗或其他应用。
      await boundedDiagnostic(() => page.screenshot({ path: path.join(outputDirectory, 'synthetic-renderer.png'), timeout: 2000 }), 2500);
    },
    afterCleanup() { record('cleanup-finished'); persist(); }
  };
}

/** 可观测性故障不能阻止原有退出流程或替换退出错误。 */
export async function prepareExitDiagnostics(create) {
  try {
    const diagnostics = await create();
    await diagnostics.beforeQuit();
    return diagnostics;
  } catch {
    console.error('[Mac 诊断] 初始化不可用；继续原正常退出验收。');
    return null;
  }
}
