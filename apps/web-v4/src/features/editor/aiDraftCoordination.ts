import { apiClient } from '@study-accelerator/web-core';
const key = 'knowra:ai-draft-locks:v1';
interface Lock { clientId: string; scope: string; noteId: string }
interface Pending { scope: string; noteId: string; dirty: boolean; version: number; confirmed: number; error: Error | null }
export function createAiDraftCoordination({ clientId, storage, send }: {
  clientId: string; storage: Pick<Storage, 'getItem' | 'setItem'>;
  send(input: { clientId: string; noteId: string; dirty: boolean }): Promise<unknown>;
}) {
  let tail = Promise.resolve();
  const pending = new Map<string, Pending>();
  const storageErrors = new Map<string, Error>();
  function locks(): Lock[] {
    const value: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (!Array.isArray(value) || value.some(row => !row || typeof row.clientId !== 'string' || typeof row.scope !== 'string' || typeof row.noteId !== 'string')) throw new Error('草稿协调记录无效，请保留恢复草稿。');
    return value as Lock[];
  }
  function enqueue(row: Pending) {
    const version = row.version, dirty = row.dirty;
    tail = tail.then(async () => {
      // 同一草稿的新状态覆盖尚未发送的旧状态，已发送的状态仍按序完成。
      if (row.version !== version || row.confirmed === version) return;
      try {
        await send({ clientId, noteId: row.noteId, dirty });
        if (row.version === version) { row.confirmed = version; row.error = null; }
      } catch { if (row.version === version) row.error = new Error('草稿状态尚未确认，请先保存草稿并重试。'); }
    });
  }
  function persist(row: Pending, localKey: string) {
    try {
      const current = locks().filter(lock => !(lock.clientId === clientId && lock.scope === row.scope && lock.noteId === row.noteId));
      if (row.dirty) current.push({ clientId, scope: row.scope, noteId: row.noteId });
      storage.setItem(key, JSON.stringify(current)); storageErrors.delete(localKey);
    } catch { storageErrors.set(localKey, new Error('草稿协调存储不可用，请先保存草稿再执行 AI 写入。')); }
  }
  return {
    register(scope: string, noteId: string, dirty: boolean) {
      const localKey = JSON.stringify([scope, noteId]);
      let row = pending.get(localKey);
      if (!row) { row = { scope, noteId, dirty, version: 1, confirmed: 0, error: null }; pending.set(localKey, row); }
      else if (row.dirty !== dirty) { row.dirty = dirty; row.version++; row.error = null; }
      persist(row, localKey);
      if (row.confirmed !== row.version) enqueue(row);
    },
    hasDraft(scope: string, noteIds: string[]) { return locks().some(row => row.scope === scope && noteIds.includes(row.noteId)); },
    async flush() {
      await tail;
      // 每个草稿独立保留失败；其他笔记的成功不能掩盖失败。允许清除锁失败后重试。
      for (const [localKey, row] of pending) {
        if (storageErrors.has(localKey)) persist(row, localKey);
        if (row.confirmed !== row.version) enqueue(row);
      }
      await tail;
      const error = storageErrors.values().next().value ?? [...pending.values()].find(row => row.error)?.error;
      if (error) throw error;
    }
  };
}
let singleton: ReturnType<typeof createAiDraftCoordination> | undefined;
function coordination() {
  if (!singleton) {
    let clientId: string;
    try { clientId = sessionStorage.getItem(`${key}:client`) ?? crypto.randomUUID(); sessionStorage.setItem(`${key}:client`, clientId); }
    catch { clientId = crypto.randomUUID(); }
    singleton = createAiDraftCoordination({ clientId, storage: { getItem: name => localStorage.getItem(name), setItem: (name, value) => localStorage.setItem(name, value) }, send: input => apiClient.requestJson('/api/ai/actions/drafts', {
      method: 'POST', headers: { 'X-Knowra-AI-Action': '1' }, body: JSON.stringify(input)
    }) });
  }
  return singleton;
}
export const registerAiDraft = (scope: string, noteId: string, dirty: boolean) => coordination().register(scope, noteId, dirty);
export const hasCoordinatedDraft = (scope: string, noteIds: string[]) => coordination().hasDraft(scope, noteIds);
export const flushAiDraftCoordination = () => coordination().flush();
