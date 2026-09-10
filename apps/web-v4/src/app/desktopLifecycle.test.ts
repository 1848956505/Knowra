import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let prepare: () => Promise<void>;
let cancel: () => void;
const originalFetch = window.fetch;
beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"><input /></div>';
  window.fetch = vi.fn(async () => new Response('{}'));
  window.knowraDesktop = {
    onPrepareClose: callback => { prepare = callback; },
    onCancelClose: callback => { cancel = callback; }
  };
});
afterEach(() => { delete window.knowraDesktop; window.fetch = originalFetch; document.body.innerHTML = ''; });

describe('桌面退出保存', () => {
  it('先等待附件操作，再提取编辑器正文和清空保存队列；等待期间禁止继续编辑', async () => {
    const { installDesktopLifecycle, registerDesktopSave, trackDesktopTask } = await import('./desktopLifecycle');
    installDesktopLifecycle();
    const order: string[] = [];
    let uploaded!: () => void;
    const pending = trackDesktopTask(() => new Promise<void>(resolve => { uploaded = () => { order.push('attachment'); resolve(); }; }));
    registerDesktopSave(async () => { order.push('flush'); });
    registerDesktopSave(async () => { order.push('editor'); }, 0);
    const closing = prepare();
    expect(document.getElementById('root')?.inert).toBe(true);
    uploaded(); await pending; await closing;
    expect(order).toEqual(['attachment', 'editor', 'flush']);
    expect(document.getElementById('root')?.inert).toBe(true);
    cancel();
    expect(document.getElementById('root')?.inert).toBe(false);
  });
  it('保存失败拒绝退出，并恢复页面编辑', async () => {
    const { installDesktopLifecycle, registerDesktopSave } = await import('./desktopLifecycle');
    installDesktopLifecycle();
    registerDesktopSave(async () => { throw new Error('磁盘写入失败'); });
    await expect(prepare()).rejects.toThrow('磁盘写入失败');
    expect(document.querySelector('[role=status]')).toBeNull();
    expect(document.getElementById('root')?.inert).toBe(false);
  });
  it('输入法候选未结束时不确认退出', async () => {
    const { installDesktopLifecycle } = await import('./desktopLifecycle');
    installDesktopLifecycle();
    document.dispatchEvent(new CompositionEvent('compositionstart'));
    await expect(prepare()).rejects.toThrow('输入法');
    document.dispatchEvent(new CompositionEvent('compositionend'));
    await prepare(); cancel();
  });
});
