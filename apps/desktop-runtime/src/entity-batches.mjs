import { syncKey } from '../../api/src/modules/sync/journal.js';
import { referencesFor } from '../../api/src/modules/sync/entity-contract.js';

/** 按笔记及其来源、文件组成不可拆事务；目录和标签先于使用它们的新笔记提交。 */
export function selectEntityBatch(changes, state, base, { maxEntries = 1000, maxBytes = 12 * 1024 * 1024 } = {}) {
  const byKey = new Map(changes.map(entry => [syncKey(entry.collection, entry.id), entry]));
  const parents = new Map([...byKey.keys()].map(key => [key, key]));
  const root = key => { let cursor = key; while (parents.get(cursor) !== cursor) cursor = parents.get(cursor); return cursor; };
  const join = (a, b) => { if (parents.has(a) && parents.has(b)) parents.set(root(a), root(b)); };
  const annotationNotes = new Map(state.contentAnnotations.map(item => [item.id, item.noteId]));
  for (const entry of base.values()) if (entry.collection === 'contentAnnotations' && entry.value) annotationNotes.set(entry.id, entry.value.noteId);
  for (const entry of changes) {
    const value = entry.value ?? base.get(syncKey(entry.collection, entry.id))?.value;
    const noteId = value?.noteId ?? annotationNotes.get(value?.annotationId ?? value?.parentAnnotationId);
    if (noteId) join(syncKey(entry.collection, entry.id), syncKey('notes', noteId));
    // 标注独立修改时，没有正文变化也必须与修订、排除范围一起提交。
    const annotationId = value?.annotationId ?? value?.parentAnnotationId;
    if (annotationId) join(syncKey(entry.collection, entry.id), syncKey('contentAnnotations', annotationId));
  }
  const deleted = new Set(changes.filter(entry => !entry.value).map(entry => syncKey(entry.collection, entry.id)));
  for (const entry of changes) {
    const old = base.get(syncKey(entry.collection, entry.id))?.value;
    for (const ref of referencesFor(entry.collection, old)) if (deleted.has(syncKey(ref.collection, ref.id))) join(syncKey(entry.collection, entry.id), syncKey(ref.collection, ref.id));
  }
  const groups = new Map();
  for (const entry of changes) {
    const key = root(syncKey(entry.collection, entry.id));
    if (!groups.has(key)) groups.set(key, { entries: [], dependencies: new Set(), bytes: 0 });
    const group = groups.get(key); group.entries.push(entry); group.bytes += Buffer.byteLength(JSON.stringify(entry));
  }
  for (const [key, group] of groups) for (const entry of group.entries) for (const ref of referencesFor(entry.collection, entry.value)) {
    const refKey = syncKey(ref.collection, ref.id);
    if (byKey.has(refKey) && root(refKey) !== key) group.dependencies.add(root(refKey));
  }
  const selected = []; const completed = new Set(); let size = 0; let progress = true;
  while (progress) {
    progress = false;
    for (const [key, group] of groups) {
      if (completed.has(key) || [...group.dependencies].some(dependency => !completed.has(dependency))) continue;
      if (group.entries.length > maxEntries || group.bytes > maxBytes) {
        if (selected.length) return selected;
        throw new Error('单组关联修改超过同步容量，请先导出备份并减少单次批量操作。');
      }
      if (selected.length + group.entries.length > maxEntries || size + group.bytes > maxBytes) return selected;
      selected.push(...group.entries); size += group.bytes; completed.add(key); progress = true;
    }
  }
  if (!selected.length && changes.length) throw new Error('关联资料存在无法安全分批的依赖，请导出备份后核对。');
  return selected;
}
