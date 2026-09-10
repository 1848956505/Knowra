/** 桌面壳仅能请求保存；不暴露文件系统、命令执行或任意 IPC。 */
const operations = new Set<Promise<unknown>>();
export function trackDesktopTask<T>(task: () => Promise<T>): Promise<T> {
  const promise = task();
  operations.add(promise);
  void promise.finally(() => operations.delete(promise)).catch(() => undefined);
  return promise;
}
const participants = new Map<() => Promise<void>, number>();
export function registerDesktopSave(save: () => Promise<void>, priority = 1) {
  participants.set(save, priority);
  return () => { participants.delete(save); };
}
interface DesktopBridge {
  onPrepareClose(callback: () => Promise<void>): void;
  onCancelClose(callback: () => void): void;
}
declare global { interface Window { knowraDesktop?: DesktopBridge; } }

export function installDesktopLifecycle() {
  if (!window.knowraDesktop) return;
  let composing = false;
  document.addEventListener('compositionstart', () => { composing = true; }, true);
  document.addEventListener('compositionend', () => { composing = false; }, true);
  const requests = new Set<Promise<unknown>>();
  const originalFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const request = originalFetch(...args);
    requests.add(request);
    void request.finally(() => requests.delete(request)).catch(() => undefined);
    return request;
  };
  let release = () => {};
  window.knowraDesktop.onCancelClose(() => release());
  window.knowraDesktop.onPrepareClose(async () => {
    if (composing) throw new Error('请先确认或取消输入法候选文字，再退出。');
    const overlay = document.createElement('div');
    overlay.textContent = '正在保存到本机…';
    overlay.setAttribute('role', 'status');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483647', background: '#fff9', display: 'grid', placeItems: 'center', fontSize: '18px' });
    document.body.append(overlay);
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    release = () => { overlay.remove(); if (root) root.inert = wasInert; };
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise(resolve => setTimeout(resolve, 0));
      // 等待上传等既有请求，再读取编辑器，随后清空跨笔记的防抖和在途保存。
      await Promise.all([...operations]);
      await Promise.allSettled([...requests]);
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const [save] of [...participants].sort((a, b) => a[1] - b[1])) await save();
      await Promise.allSettled([...requests]);
    } catch (error) {
      release();
      throw error;
    }
  });
}
