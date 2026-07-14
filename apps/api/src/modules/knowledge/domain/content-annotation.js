const ANNOTATION_KINDS = new Set(['important']);
const SOURCE_MODES = new Set(['manual', 'ai']);
const ANNOTATION_STATUSES = new Set(['active', 'stale', 'archived']);

export class ContentAnnotation {
  constructor({
    id,
    spaceId,
    noteId,
    kind = 'important',
    sourceMode = 'manual',
    quoteText,
    headingPath = [],
    fromPosition,
    toPosition,
    prefixText = '',
    suffixText = '',
    anchorFingerprint,
    noteContentHash,
    idempotencyKey,
    status = 'active',
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    deletedAt = null
  }) {
    if (!id?.trim() || !spaceId?.trim() || !noteId?.trim()) throw new Error('Annotation identity is required');
    if (!ANNOTATION_KINDS.has(kind) || !SOURCE_MODES.has(sourceMode)) throw new Error('Annotation kind or sourceMode is invalid');
    if (!quoteText?.trim() || !anchorFingerprint?.trim() || !noteContentHash?.trim() || !idempotencyKey?.trim()) throw new Error('Annotation content is required');
    if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition) || fromPosition < 0 || fromPosition >= toPosition) throw new Error('Annotation range is invalid');
    if (!ANNOTATION_STATUSES.has(status)) throw new Error('Annotation status is invalid');

    Object.assign(this, { id, spaceId, noteId, kind, sourceMode, quoteText: quoteText.trim(), headingPath: [...headingPath], fromPosition, toPosition, prefixText, suffixText, anchorFingerprint, noteContentHash, idempotencyKey, status, createdAt, updatedAt, deletedAt });
  }
}
