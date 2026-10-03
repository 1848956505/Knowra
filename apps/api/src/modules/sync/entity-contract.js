import { resolveAnalysisScopeNoteVersion } from '../knowledge/domain/analysis-scope-version-alias.js';
import { attachmentIdsInText } from '@study-accelerator/shared/attachments';
import { noteContent } from './journal.js';

// schema7 完整实体契约；试题仍只接收云端变化。
export const KNOWLEDGE_SYNC_CAPABILITY = 'knowledge-items-v1';
export const KNOWLEDGE_COLLECTIONS = Object.freeze(['knowledgeItems', 'knowledgeEvidence', 'knowledgeArtifactProvenance']);
export const WRITABLE_COLLECTIONS = Object.freeze([
  'spaces', 'folders', 'tagGroups', 'tags', 'notes', 'noteVersions',
  'attachments', 'contentAnnotations', 'annotationExclusions', 'annotationRevisions', 'analysisScopeSnapshots', ...KNOWLEDGE_COLLECTIONS
]);
export const IMMUTABLE_COLLECTIONS = new Set(['noteVersions', 'annotationRevisions', 'analysisScopeSnapshots', 'knowledgeEvidence', 'knowledgeArtifactProvenance']);
export function entityContent(collection, value) {
  if (!value) return null;
  if (collection === 'notes') return noteContent(value);
  const ignored = new Set(['createdAt', 'updatedAt']);
  if (collection === 'attachments') for (const key of ['verifiedAt', 'storagePath', 'status']) ignored.add(key);
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
  if (collection === 'folders' && value.deletionPackage) for (const id of value.deletionPackage.noteIds ?? []) refs.push({ collection: 'notes', id });
  for (const id of value.tagIds ?? []) refs.push({ collection: 'tags', id });
  if (collection === 'notes') for (const id of attachmentIdsInText(value.rawMarkdown)) refs.push({ collection: 'attachments', id });
  if (collection === 'analysisScopeSnapshots') {
    for (const version of value.noteVersions ?? []) refs.push({ collection: 'noteVersions', id: version.noteVersionId });
    for (const revision of value.annotationRevisions ?? []) refs.push({ collection: 'contentAnnotations', id: revision.annotationId });
  }
  if (collection === 'knowledgeArtifactProvenance') {
    refs.push({ collection: 'knowledgeItems', id: value.artifactId });
    for (const source of value.sources ?? []) refs.push({ collection: 'knowledgeEvidence', id: source.evidenceId });
  }
  return refs;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

export function syncReferencesFor(collection, value, state) {
  const refs = referencesFor(collection, value).filter(ref => collection !== 'analysisScopeSnapshots' || ref.collection !== 'noteVersions');
  if (collection === 'analysisScopeSnapshots' && value) for (const binding of value.noteVersions ?? []) {
    refs.push({ collection: 'noteVersions', id: resolveAnalysisScopeNoteVersion(value, binding, state.noteVersions).id });
  }
  if (collection === 'knowledgeItems' && value) for (const evidence of state.knowledgeEvidence.filter(item => item.knowledgeItemId === value.id)) {
    refs.push({ collection: 'knowledgeEvidence', id: evidence.id }, ...referencesFor('knowledgeEvidence', evidence));
  }
  if (collection === 'knowledgeItems' && value) for (const record of state.knowledgeArtifactProvenance ?? []) {
    if (record.artifactId === value.id) refs.push({ collection: 'knowledgeArtifactProvenance', id: record.id });
  }
  if (collection === 'knowledgeArtifactProvenance' && value) for (const source of value.sources ?? []) {
    const evidence = state.knowledgeEvidence.find(item => item.id === source.evidenceId);
    if (evidence) refs.push(...referencesFor('knowledgeEvidence', evidence));
  }
  return [...new Map(refs.map(ref => [JSON.stringify([ref.collection, ref.id]), ref])).values()];
}
