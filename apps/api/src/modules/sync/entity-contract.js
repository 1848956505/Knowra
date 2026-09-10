import { noteContent } from './journal.js';

// 第一版可离线修改的领域。知识、试题等只接收服务端变化。
export const WRITABLE_COLLECTIONS = Object.freeze([
  'spaces', 'folders', 'tagGroups', 'tags', 'notes', 'noteVersions',
  'attachments', 'contentAnnotations', 'annotationExclusions', 'annotationRevisions'
]);
export const IMMUTABLE_COLLECTIONS = new Set(['noteVersions', 'annotationRevisions']);
export function entityContent(collection, value) {
  if (!value) return null;
  if (collection === 'notes') return noteContent(value);
  const ignored = new Set(['createdAt', 'updatedAt']);
  if (collection === 'attachments') for (const key of ['verifiedAt', 'storagePath']) ignored.add(key);
  if (collection === 'folders') ignored.add('pathCache');
  return canonical(Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.has(key))));
}
export const sameEntity = (collection, left, right) => JSON.stringify(entityContent(collection, left)) === JSON.stringify(entityContent(collection, right));

export function referencesFor(collection, value) {
  if (!value) return [];
  const fields = { spaceId: 'spaces', folderId: 'folders', groupId: 'tagGroups', noteId: 'notes', noteVersionId: 'noteVersions', annotationId: 'contentAnnotations', parentAnnotationId: 'contentAnnotations' };
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
