const SOURCE_TYPES = new Set(['noteVersion', 'annotation', 'manual']);
const EVIDENCE_STATUSES = new Set(['valid', 'stale', 'invalid', 'insufficient']);
const RELATION_TYPES = new Set(['supports']);

export class KnowledgeEvidence {
  constructor({
    id,
    knowledgeItemId,
    sourceType = 'manual',
    sourceId = null,
    noteId = null,
    noteVersionId = null,
    annotationId = null,
    quoteText = '',
    headingPath = [],
    relationType = 'supports',
    status = 'valid',
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim() || !knowledgeItemId?.trim()) {
      throw new Error('KnowledgeEvidence identity is required');
    }
    if (!SOURCE_TYPES.has(sourceType) || !EVIDENCE_STATUSES.has(status) || !RELATION_TYPES.has(relationType)) {
      throw new Error('KnowledgeEvidence type or status is invalid');
    }
    if (!Array.isArray(headingPath)) {
      throw new Error('KnowledgeEvidence headingPath is invalid');
    }
    if (sourceType === 'noteVersion' && !noteVersionId) {
      throw new Error('NoteVersion evidence requires noteVersionId');
    }
    if (sourceType === 'annotation' && !annotationId) {
      throw new Error('Annotation evidence requires annotationId');
    }
    if (sourceType === 'manual' && (noteVersionId || annotationId)) {
      throw new Error('Manual evidence cannot reference an annotation or NoteVersion');
    }

    Object.assign(this, {
      id,
      knowledgeItemId,
      sourceType,
      sourceId,
      noteId,
      noteVersionId,
      annotationId,
      quoteText: String(quoteText ?? '').trim(),
      headingPath: headingPath.map((item) => String(item).trim()).filter(Boolean),
      relationType,
      status,
      createdAt,
      updatedAt
    });
  }
}

export const KNOWLEDGE_EVIDENCE_STATUSES = Object.freeze([...EVIDENCE_STATUSES]);
