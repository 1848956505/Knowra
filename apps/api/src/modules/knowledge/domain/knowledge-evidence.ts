export interface KnowledgeEvidenceConstructorInput {
  id: string;
  knowledgeItemId: string;
  sourceType?: string;
  sourceId?: string | null;
  noteId?: string | null;
  noteVersionId?: string | null;
  annotationId?: string | null;
  quoteText?: unknown;
  headingPath?: unknown[];
  relationType?: string;
  status?: string;
  applicabilityStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

const SOURCE_TYPES = new Set(['noteVersion', 'annotation', 'manual']);
const EVIDENCE_STATUSES = new Set(['valid', 'stale', 'invalid', 'insufficient']);
const RELATION_TYPES = new Set(['supports']);
const APPLICABILITY_STATUSES = new Set(['active', 'withdrawn', 'needsReview']);

export class KnowledgeEvidence {
  declare id: string;
  declare knowledgeItemId: string;
  declare sourceType: 'noteVersion' | 'annotation' | 'manual';
  declare sourceId: string | null;
  declare noteId: string | null;
  declare noteVersionId: string | null;
  declare annotationId: string | null;
  declare quoteText: string;
  declare headingPath: string[];
  declare relationType: 'supports';
  declare status: 'valid' | 'stale' | 'invalid' | 'insufficient';
  declare applicabilityStatus: 'active' | 'withdrawn' | 'needsReview';
  declare createdAt: string;
  declare updatedAt: string;

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
    applicabilityStatus = status === 'invalid' ? 'needsReview' : 'active',
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }: KnowledgeEvidenceConstructorInput) {
    if (!id?.trim() || !knowledgeItemId?.trim()) {
      throw new Error('KnowledgeEvidence identity is required');
    }
    if (
      !SOURCE_TYPES.has(sourceType) ||
      !EVIDENCE_STATUSES.has(status) ||
      !RELATION_TYPES.has(relationType) ||
      !APPLICABILITY_STATUSES.has(applicabilityStatus)
    ) {
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
      headingPath: headingPath.map(item => String(item).trim()).filter(Boolean),
      relationType,
      status,
      applicabilityStatus,
      createdAt,
      updatedAt
    });
  }
}

export const KNOWLEDGE_EVIDENCE_STATUSES = Object.freeze([...EVIDENCE_STATUSES]);
