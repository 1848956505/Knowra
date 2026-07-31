import { createAppError } from '../../../errors/app-error.js';

export function createInMemoryKnowledgeEvidenceRepository(options = {}) {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);
  function updateStatus(predicate, status) {
    const changed = [];
    for (const record of records) {
      if (!predicate(record) || record.status === status) continue;
      if (status === 'stale' && record.status === 'invalid') continue;
      record.status = status;
      record.updatedAt = new Date().toISOString();
      changed.push(record);
    }
    if (changed.length) persist();
    return changed;
  }
  return {
    create(evidence) {
      if (records.some((record) => record.id === evidence.id)) {
        throw createAppError(
          'KNOWLEDGE_EVIDENCE_ID_CONFLICT',
          'KnowledgeEvidence with the same id already exists',
          409
        );
      }
      records.push(evidence);
      persist();
      return evidence;
    },
    save(evidence) {
      const index = records.findIndex((record) => record.id === evidence.id);
      if (index < 0) records.push(evidence);
      else records[index] = evidence;
      persist();
      return evidence;
    },
    findById(id) {
      return records.find((item) => item.id === id) ?? null;
    },
    list({ knowledgeItemId, noteId, noteVersionId, annotationId } = {}) {
      return records.filter((item) => (
        (!knowledgeItemId || item.knowledgeItemId === knowledgeItemId)
        && (!noteId || item.noteId === noteId)
        && (!noteVersionId || item.noteVersionId === noteVersionId)
        && (!annotationId || item.annotationId === annotationId)
      ));
    },
    markByNoteId(noteId, status) {
      return updateStatus((item) => item.noteId === noteId, status);
    },
    markByAnnotationId(annotationId, status) {
      return updateStatus((item) => item.annotationId === annotationId, status);
    },
    markByNoteVersionId(noteVersionId, status) {
      return updateStatus((item) => item.noteVersionId === noteVersionId, status);
    }
  };
}
