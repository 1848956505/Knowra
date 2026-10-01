import { createAiDraftCoordination } from './aiDraftCoordination';
it('清除草稿锁失败后 flush 重试，重复注册相同状态也不会丢失重试', async () => {
  localStorage.clear();
  const send = vi.fn().mockRejectedValueOnce(new Error('断线')).mockResolvedValue({});
  const coordinator = createAiDraftCoordination({ clientId: 'tab', storage: localStorage, send });
  coordinator.register('space', 'a', false);
  await coordinator.flush();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toEqual({ clientId: 'tab', noteId: 'a', dirty: false });
});
it('笔记 B 上报成功不能掩盖笔记 A 失败，修复网络后重新确认 A', async () => {
  localStorage.clear(); let failed = true;
  const send = vi.fn(async ({ noteId }: { noteId: string }) => { if (noteId === 'a' && failed) throw new Error('断线'); });
  const coordinator = createAiDraftCoordination({ clientId: 'tab', storage: localStorage, send });
  coordinator.register('space', 'a', false); coordinator.register('space', 'b', false);
  await expect(coordinator.flush()).rejects.toThrow('尚未确认');
  failed = false; await coordinator.flush();
  expect(send.mock.calls.filter(([input]) => input.noteId === 'a')).toHaveLength(3);
});
it('上报中的旧 dirty 状态完成后，仍确认最新清除状态', async () => {
  localStorage.clear(); let release: (() => void) | undefined;
  const send = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue({});
  const coordinator = createAiDraftCoordination({ clientId: 'tab', storage: localStorage, send });
  coordinator.register('space', 'a', true); await Promise.resolve();
  coordinator.register('space', 'a', false); release?.(); await coordinator.flush();
  expect(send.mock.calls.at(-1)?.[0].dirty).toBe(false);
  expect(coordinator.hasDraft('space', ['a'])).toBe(false);
});

it('浏览器禁止 Storage getter 时注册不抛出，flush 阻止 AI 写入', async () => {
  const original=Object.getOwnPropertyDescriptor(window,'localStorage');
  Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('禁止存储','SecurityError');}});
  try { const {registerAiDraft,flushAiDraftCoordination}=await import('./aiDraftCoordination');expect(()=>registerAiDraft('space','locked',true)).not.toThrow();await expect(flushAiDraftCoordination()).rejects.toThrow('协调存储不可用'); }
  finally { if(original)Object.defineProperty(window,'localStorage',original); }
});
