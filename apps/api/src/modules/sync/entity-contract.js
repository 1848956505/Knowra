import { noteContent } from './journal.js';

// 兼容实体 v2：知识写入通过独立 capability 协商，试题仍只接收云端变化。
export const KNOWLEDGE_SYNC_CAPABILITY = 'knowledge-items-v1';
export const KNOWLEDGE_COLLECTIONS = Object.freeze(['knowledgeItems', 'knowledgeEvidence']);
export const WRITABLE_COLLECTIONS = Object.freeze([
  'spaces', 'folders', 'tagGroups', 'tags', 'notes', 'noteVersions',
  'attachments', 'contentAnnotations', 'annotationExclusions', 'annotationRevisions', ...KNOWLEDGE_COLLECTIONS
]);
export const IMMUTABLE_COLLECTIONS = new Set(['noteVersions', 'annotationRevisions', 'knowledgeEvidence']);
export function entityContent(collection, value) {
  if (!value) return null;
  if (collection === 'notes') return noteContent(value);
  const ignored = new Set(['createdAt', 'updatedAt']);
  if (collection === 'attachments') for (const key of ['verifiedAt', 'storagePath']) ignored.add(key);
  if (collection === 'folders') ignored.add('pathCache');
  if (collection === 'knowledgeEvidence') ignored.add('status'); // 来源健康由当前领域状态推导。
  return canonical(Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.has(key))));
}
export const sameEntity = (collection, left, right) => JSON.stringify(entityContent(collection, left)) === JSON.stringify(entityContent(collection, right));

export function referencesFor(collection, value) {
  if (!value) return [];
  const fields = { spaceId: 'spaces', folderId: 'folders', groupId: 'tagGroups', noteId: 'notes', noteVersionId: 'noteVersions', annotationId: 'contentAnnotations', parentAnnotationId: 'contentAnnotations', knowledgeItemId: 'knowledgeItems' };
  const refs = Object.entries(fields).filter(([field]) => value[field]).map(([field, target]) => ({ collection: target, id: value[field] }));
  if (collection === 'folders' && value.parentId) refs.push({ collection: 'folders', id: value.parentId });
  for (const id of value.tagIds ?? []) refs.push({ collection: 'tags', id });
  if (collection === 'notes') for (const match of value.rawMarkdown.matchAll(/\/api\/storage\/attachments\/([^/\s)]+)\/content/g)) {
    try { refs.push({ collection: 'attachments', id: decodeURIComponent(match[1]) }); } catch { throw new Error('正文中的附件引用无效。'); }
  }
  return refs;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

export function syncReferencesFor(collection, value, state) {
  const refs = referencesFor(collection, value);
  if (collection === 'knowledgeItems' && value) for (const evidence of state.knowledgeEvidence.filter(item => item.knowledgeItemId === value.id)) {
    refs.push({ collection: 'knowledgeEvidence', id: evidence.id }, ...referencesFor('knowledgeEvidence', evidence));
  }
  return [...new Map(refs.map(ref => [JSON.stringify([ref.collection, ref.id]), ref])).values()];
}
