const ANNOTATION_KINDS = new Set(['important', 'question', 'supplement', 'pitfall', 'temporary']);
const SOURCE_MODES = new Set(['manual', 'ai']);
const ANNOTATION_STATUSES = new Set(['active', 'stale', 'archived']);
const SCOPE_TYPES = new Set(['selection', 'blocks', 'section']);
const IMPORTANCE_LEVELS = new Set([null, 'normal', 'important', 'core']);
const LIFECYCLE_STATUSES = new Set(['active', 'archived']);
const ANCHOR_STATUSES = new Set(['resolved', 'needsReview', 'missing']);

export function projectLegacyAnnotationStatus({ lifecycleStatus, anchorStatus }) {
  if (lifecycleStatus === 'archived') return 'archived';
  return anchorStatus === 'resolved' ? 'active' : 'stale';
}

export class ContentAnnotation {
  constructor({
    id,
    spaceId,
    noteId,
    noteVersionId = null,
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
    schemaVersion = 1,
    scopeType = 'selection',
    importance = null,
    comment = '',
    lifecycleStatus = status === 'archived' ? 'archived' : 'active',
    anchorStatus = status === 'stale' ? 'needsReview' : 'resolved',
    anchorReason = null,
    revision = 1,
    anchor = null,
    originSnapshot = null,
    resolvedContentHash = null,
    boundaryFingerprint = null,
    requestHash = null,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    deletedAt = null
  }) {
    if (!id?.trim() || !spaceId?.trim() || !noteId?.trim()) throw new Error('Annotation identity is required');
    if (!ANNOTATION_KINDS.has(kind) || !SOURCE_MODES.has(sourceMode)) throw new Error('Annotation kind or sourceMode is invalid');
    if (!SCOPE_TYPES.has(scopeType) || !IMPORTANCE_LEVELS.has(importance)) throw new Error('Annotation scope or importance is invalid');
    if (!LIFECYCLE_STATUSES.has(lifecycleStatus) || !ANCHOR_STATUSES.has(anchorStatus)) throw new Error('Annotation lifecycle or anchor status is invalid');
    if (![1, 2].includes(schemaVersion) || !Number.isInteger(revision) || revision < 1) throw new Error('Annotation schema or revision is invalid');
    if (typeof comment !== 'string' || comment.length > 2000) throw new Error('Annotation comment is invalid');
    if (typeof quoteText !== 'string' || !quoteText.trim() || !anchorFingerprint?.trim() || !noteContentHash?.trim() || !idempotencyKey?.trim()) throw new Error('Annotation content is required');
    if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition) || fromPosition < 0 || fromPosition >= toPosition) throw new Error('Annotation range is invalid');
    if (!ANNOTATION_STATUSES.has(status)) throw new Error('Annotation status is invalid');
    if (schemaVersion === 2 && (!anchor || !originSnapshot)) throw new Error('Versioned annotation anchor is required');

    Object.assign(this, {
      id, spaceId, noteId, noteVersionId, kind, sourceMode,
      quoteText: schemaVersion === 1 ? quoteText.trim() : quoteText,
      headingPath: [...headingPath], fromPosition, toPosition, prefixText, suffixText,
      anchorFingerprint, noteContentHash, idempotencyKey,
      schemaVersion, scopeType, importance, comment, lifecycleStatus, anchorStatus,
      anchorReason, revision, anchor: anchor ? structuredClone(anchor) : null,
      originSnapshot: originSnapshot ? structuredClone(originSnapshot) : null,
      resolvedContentHash, boundaryFingerprint, requestHash,
      status: projectLegacyAnnotationStatus({ lifecycleStatus, anchorStatus }),
      createdAt, updatedAt, deletedAt
    });
  }
}
