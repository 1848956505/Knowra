export interface RecoveredNoteDraft {
  markdown: string;
  baseMarkdown: string;
  baseUpdatedAt?: string;
  conflict?: string;
}

/** 同一标签页内跨路由保留；浏览器拒绝存储时仍保留内存恢复路径。 */
export function createNoteDraftRecovery() {
  const drafts = new Map<string, RecoveredNoteDraft | undefined>();
  const keyFor = (scope: string, noteId: string) => `knowra:note-draft:v1:${JSON.stringify([scope, noteId])}`;
  return {
    read(scope: string, noteId: string): RecoveredNoteDraft | undefined {
      const key = keyFor(scope, noteId);
      if (drafts.has(key)) return drafts.get(key);
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return undefined;
        const value = JSON.parse(raw);
        if (typeof value.markdown !== 'string' || typeof value.baseMarkdown !== 'string'
          || (value.baseUpdatedAt !== undefined && typeof value.baseUpdatedAt !== 'string')
          || (value.conflict !== undefined && typeof value.conflict !== 'string')) return undefined;
        drafts.set(key, value);
        return value;
      } catch { return undefined; }
    },
    write(scope: string, noteId: string, draft: RecoveredNoteDraft) {
      const key = keyFor(scope, noteId);
      drafts.set(key, draft);
      try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* 路由切换仍可从内存恢复。 */ }
    },
    remove(scope: string, noteId: string, expected: RecoveredNoteDraft) {
      const key = keyFor(scope, noteId);
      if (drafts.get(key) !== expected) return;
      drafts.set(key, undefined);
      try { sessionStorage.removeItem(key); } catch { /* 保留内存状态。 */ }
    }
  };
}

export const noteDraftRecovery = createNoteDraftRecovery();
