import { calculateContentHash } from '../knowledge/domain/note-version.js';
import { selectVersionsToPrune } from '../knowledge/domain/note-version-retention.js';
import { createNoteVersionReferenceIndex } from '../knowledge/domain/note-version-references.js';

/**
 * 云端在处理同步批次时，顺带稀疏化本批触及笔记的旧版本。
 * 删除与批次同属一个事务，日志里自然产生墓碑，设备经普通拉取收到。
 * 本批提交的版本、当前正文版本和任何被引用的版本都不会删除。
 */
export function pruneTouchedNoteVersions(state, changes, now = Date.now(), aliases = {}) {
  const touchedNotes = new Set();
  for (const entry of changes) {
    const value = entry.value;
    if (entry.collection === 'notes' && value) touchedNotes.add(entry.id);
    if (entry.collection === 'noteVersions' && value) touchedNotes.add(value.noteId);
  }
  if (!touchedNotes.size) return state;
  // prepareBatchState 已去重；保护后像中的规范 ID，而非设备提交的别名。
  const submitted = new Set(changes.filter(entry => entry.collection === 'noteVersions').map(entry => aliases[entry.id] ?? entry.id));
  let isReferenced = null;
  const removed = new Set();
  for (const noteId of touchedNotes) {
    const note = state.notes.find(item => item.id === noteId);
    const versions = state.noteVersions.filter(item => item.noteId === noteId);
    if (!note || versions.length < 2) continue;
    isReferenced ??= createNoteVersionReferenceIndex({
      contentAnnotations: state.contentAnnotations, annotationRevisions: state.annotationRevisions, annotationExclusions: state.annotationExclusions,
      knowledgeEvidence: state.knowledgeEvidence, knowledgeArtifactProvenance: state.knowledgeArtifactProvenance,
      questionSources: state.questionSources, analysisScopeSnapshots: state.analysisScopeSnapshots
    });
    const currentHash = calculateContentHash(note.rawMarkdown);
    const protectedIds = new Set(versions.filter(version => submitted.has(version.id) || version.contentHash === currentHash || isReferenced(version)).map(version => version.id));
    for (const id of selectVersionsToPrune({ versions, now, protectedIds })) removed.add(id);
  }
  if (!removed.size) return state;
  return { ...state, noteVersions: state.noteVersions.filter(version => !removed.has(version.id)) };
}
