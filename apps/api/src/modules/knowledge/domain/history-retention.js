import { createNoteVersionReferenceIndex } from './note-version-references.js';
import { calculateContentHash } from './note-version.js';
import { NOTE_VERSION_RETENTION, selectVersionsToPrune } from './note-version-retention.js';

const DAY = 24 * 60 * 60 * 1000;
export const ANNOTATION_REVISION_RETENTION = Object.freeze({
  maxPerAnnotation: 10, maxAgeMs: 7 * DAY, sampleMs: 10 * 60 * 1000, maxBytesPerAnnotation: 128 * 1024
});
const references = ['contentAnnotations', 'annotationExclusions', 'knowledgeEvidence',
  'knowledgeArtifactProvenance', 'questionSources', 'analysisScopeSnapshots'];
const pair = (id, revision) => JSON.stringify([id, revision]);
const size = record => Buffer.byteLength(JSON.stringify(record));
const newestFirst = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);

/** 来源凭证、分析范围和私有任务中的确切修订引用；过程历史自身不是保留根。 */
export function referencedAnnotationRevisions(state, externalReferences = []) {
  const ids = new Set(), pairs = new Set();
  const mentioned = createNoteVersionReferenceIndex({ external: externalReferences });
  function visit(value) {
    if (typeof value === 'string') {
      if (value.startsWith('annotation-revision-')) ids.add(value);
      // 私有任务的 JSON 载荷也可能以字符串存放。
      if (/^\s*[\[{]/.test(value)) { try { visit(JSON.parse(value)); } catch { /* 普通正文不是 JSON。 */ } }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.annotationRevisionId === 'string') ids.add(value.annotationRevisionId);
    if (typeof value.annotationId === 'string' && Number.isSafeInteger(value.revision)) pairs.add(pair(value.annotationId, value.revision));
    for (const child of Object.values(value)) visit(child);
  }
  for (const name of references) visit(state[name] ?? []);
  visit(externalReferences);
  for (const annotation of state.contentAnnotations ?? []) pairs.add(pair(annotation.id, annotation.revision));
  // 旧 Evidence 可能只记录标注、版本和摘录。保留足以证明它的一个修订，而非该标注的全部过程历史。
  const annotations = new Map((state.contentAnnotations ?? []).map(item => [item.id, item]));
  const witnesses = new Map();
  for (const revision of state.annotationRevisions ?? []) {
    const key = JSON.stringify([revision.annotationId, revision.newAnchor?.noteVersionId, String(revision.rangeSummary?.quoteText ?? '').trim()]);
    const previous = witnesses.get(key);
    if (!previous || revision.revision > previous.revision) witnesses.set(key, revision);
  }
  for (const evidence of state.knowledgeEvidence ?? []) {
    if (evidence.sourceType !== 'annotation') continue;
    const annotation = annotations.get(evidence.annotationId);
    const quote = String(evidence.quoteText ?? '').trim();
    if ([annotation, annotation?.originSnapshot].some(item => item?.noteVersionId === evidence.noteVersionId && String(item.quoteText ?? '').trim() === quote)) continue;
    const witness = witnesses.get(JSON.stringify([evidence.annotationId, evidence.noteVersionId, quote]));
    if (witness) ids.add(witness.id);
  }
  return revision => ids.has(revision.id) || pairs.has(pair(revision.annotationId, revision.revision)) || mentioned(revision);
}

export function selectAnnotationRevisionsToPrune({ revisions, protectedIds = new Set(), now = Date.now(), policy = ANNOTATION_REVISION_RETENTION }) {
  const buckets = new Set(), removed = [];
  let kept = 0, bytes = 0;
  for (const record of [...revisions].sort((a, b) => b.revision - a.revision || newestFirst(a, b))) {
    if (protectedIds.has(record.id)) continue;
    const time = Date.parse(record.createdAt);
    // 无法确定年龄的旧记录不作自动删除。
    if (!Number.isFinite(time)) continue;
    const bucket = Math.floor(time / policy.sampleMs);
    const automatic = record.operation === 'sourceReconciled';
    const length = size(record);
    if (now - time > policy.maxAgeMs || kept >= policy.maxPerAnnotation || bytes + length > policy.maxBytesPerAnnotation
      || (automatic && buckets.has(bucket))) { removed.push(record.id); continue; }
    kept++; bytes += length;
    if (automatic) buckets.add(bucket);
  }
  return removed;
}

/** 只规划，不改写输入；先裁剪标注过程历史，再释放它们独占的正文版本。 */
export function planHistoryRetention(state, { now = Date.now(), noteIds = null, externalReferences = [],
  protectedVersionIds = new Set(), protectedRevisionIds = new Set(), canDiscard = () => true,
  notePolicy = NOTE_VERSION_RETENTION, annotationPolicy = ANNOTATION_REVISION_RETENTION } = {}) {
  const notes = new Map((state.notes ?? []).map(note => [note.id, note]));
  const annotations = new Map((state.contentAnnotations ?? []).map(annotation => [annotation.id, annotation]));
  const selected = id => !noteIds || noteIds.has(id);
  const isRevisionReferenced = referencedAnnotationRevisions(state, externalReferences);
  const revisionGroups = new Map();
  for (const record of state.annotationRevisions ?? []) {
    if (!selected(annotations.get(record.annotationId)?.noteId)) continue;
    if (!revisionGroups.has(record.annotationId)) revisionGroups.set(record.annotationId, []);
    revisionGroups.get(record.annotationId).push(record);
  }
  const removedRevisions = new Set();
  for (const records of revisionGroups.values()) {
    const protectedIds = new Set(records.filter(record => protectedRevisionIds.has(record.id) || isRevisionReferenced(record)
      || !canDiscard('annotationRevisions', record)).map(record => record.id));
    for (const id of selectAnnotationRevisionsToPrune({ revisions: records, protectedIds, now, policy: annotationPolicy })) removedRevisions.add(id);
  }
  const retainedRevisions = (state.annotationRevisions ?? []).filter(record => !removedRevisions.has(record.id));
  const isVersionReferenced = createNoteVersionReferenceIndex({
    ...Object.fromEntries(references.map(name => [name, state[name] ?? []])), annotationRevisions: retainedRevisions,
    external: externalReferences
  });
  const versionGroups = new Map();
  for (const version of state.noteVersions ?? []) {
    if (!selected(version.noteId)) continue;
    if (!versionGroups.has(version.noteId)) versionGroups.set(version.noteId, []);
    versionGroups.get(version.noteId).push(version);
  }
  const removedVersions = new Set();
  for (const [noteId, versions] of versionGroups) {
    const note = notes.get(noteId);
    if (!note) continue;
    const currentHash = calculateContentHash(note.rawMarkdown);
    const baselineId = versions.find(version => version.createdAt === note.createdAt)?.id;
    const protectedIds = new Set(versions.filter(version => protectedVersionIds.has(version.id) || version.contentHash === currentHash
      || version.id === baselineId || isVersionReferenced(version) || !canDiscard('noteVersions', version)).map(version => version.id));
    for (const id of selectVersionsToPrune({ versions, now, protectedIds, policy: notePolicy })) removedVersions.add(id);
  }
  const summary = {};
  for (const [collection, removed] of [['annotationRevisions', removedRevisions], ['noteVersions', removedVersions]]) {
    const records = state[collection] ?? [];
    summary[collection] = { before: records.length, after: records.length - removed.size, removed: removed.size,
      removedBytes: records.reduce((total, record) => total + (removed.has(record.id) ? size(record) : 0), 0) };
  }
  return { removedRevisions, removedVersions, summary };
}

export function applyHistoryRetentionPlan(state, plan) {
  return { ...state,
    annotationRevisions: state.annotationRevisions.filter(record => !plan.removedRevisions.has(record.id)),
    noteVersions: state.noteVersions.filter(record => !plan.removedVersions.has(record.id)) };
}

/** 普通保存只处理被修改的笔记/标注，避免读取或 AI 状态写入触发整库清理。 */
export function changedHistoryNoteIds(before, after) {
  const notes = new Map((before.notes ?? []).map(note => [note.id, note]));
  const annotations = new Map((before.contentAnnotations ?? []).map(item => [item.id, item]));
  const touched = new Set();
  for (const note of after.notes ?? []) {
    const previous = notes.get(note.id);
    if (!previous || previous.updatedAt !== note.updatedAt
      || (previous.historyContentHash ?? calculateContentHash(previous.rawMarkdown)) !== calculateContentHash(note.rawMarkdown)) touched.add(note.id);
  }
  for (const item of after.contentAnnotations ?? []) if (annotations.get(item.id)?.revision !== item.revision) touched.add(item.noteId);
  return touched;
}

export function historyRetentionBasis(state) {
  return { notes: state.notes.map(({ id, updatedAt, rawMarkdown }) => ({ id, updatedAt, historyContentHash: calculateContentHash(rawMarkdown) })),
    contentAnnotations: state.contentAnnotations.map(({ id, noteId, revision }) => ({ id, noteId, revision })) };
}
