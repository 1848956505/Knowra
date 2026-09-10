import { validationError } from '../knowledge-errors.js';

const annotationKinds = new Set(['important', 'question', 'supplement', 'pitfall', 'temporary']);
const sourceModes = new Set(['manual', 'ai']);
const scopeTypes = new Set(['selection', 'blocks', 'section']);
const importanceLevels = new Set([null, 'normal', 'important', 'core']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function positions(input) {
  const fromPosition = Number(input.fromPosition);
  const toPosition = Number(input.toPosition);
  if (
    !Number.isInteger(fromPosition)
    || !Number.isInteger(toPosition)
    || fromPosition < 0
    || fromPosition >= toPosition
  ) {
    throw validationError('ANNOTATION_RANGE_INVALID', 'Annotation range is invalid');
  }
  return { fromPosition, toPosition };
}

export function buildCreateContentAnnotationDto(input = {}) {
  const schemaVersion = Number(input.schemaVersion ?? (input.anchor ? 2 : 1));
  const dto = {
    spaceId: text(input.spaceId),
    noteId: text(input.noteId),
    noteVersionId: text(input.noteVersionId) || null,
    quoteText: text(input.quoteText),
    headingPath: Array.isArray(input.headingPath) ? input.headingPath.map(text).filter(Boolean) : [],
    prefixText: text(input.prefixText),
    suffixText: text(input.suffixText),
    anchorFingerprint: text(input.anchorFingerprint),
    noteContentHash: text(input.noteContentHash),
    idempotencyKey: text(input.idempotencyKey),
    kind: input.kind ?? 'important',
    sourceMode: input.sourceMode ?? 'manual',
    schemaVersion,
    scopeType: input.scopeType ?? input.anchor?.scopeType ?? 'selection',
    importance: input.importance ?? null,
    comment: typeof input.comment === 'string' ? input.comment : '',
    anchor: input.anchor && typeof input.anchor === 'object' && !Array.isArray(input.anchor)
      ? structuredClone(input.anchor)
      : null,
    ...positions(input)
  };
  if (
    !dto.spaceId
    || !dto.noteId
    || !dto.quoteText
    || !dto.anchorFingerprint
    || !dto.noteContentHash
    || !dto.idempotencyKey
  ) {
    throw validationError(
      'ANNOTATION_FIELDS_REQUIRED',
      'Annotation creation fields are required'
    );
  }
  if (!annotationKinds.has(dto.kind) || !sourceModes.has(dto.sourceMode)) {
    throw validationError(
      'ANNOTATION_TYPE_INVALID',
      'Annotation kind or sourceMode is invalid'
    );
  }
  if (![1, 2].includes(dto.schemaVersion) || !scopeTypes.has(dto.scopeType) || !importanceLevels.has(dto.importance)) {
    throw validationError('ANNOTATION_SCHEMA_INVALID', 'Annotation schema, scope or importance is invalid');
  }
  if (dto.comment.length > 2000) throw validationError('ANNOTATION_COMMENT_TOO_LONG', 'Annotation comment is too long');
  if (dto.schemaVersion === 2 && !dto.anchor) {
    throw validationError('ANNOTATION_ANCHOR_FIELDS_REQUIRED', 'Versioned annotation anchor is required');
  }
  return dto;
}

export function buildUpdateAnnotationAnchorDto(input = {}) {
  const dto = {
    quoteText: text(input.quoteText),
    prefixText: text(input.prefixText),
    suffixText: text(input.suffixText),
    anchorFingerprint: text(input.anchorFingerprint),
    noteContentHash: text(input.noteContentHash),
    headingPath: Array.isArray(input.headingPath)
      ? input.headingPath.map(text).filter(Boolean)
      : [],
    anchor: input.anchor && typeof input.anchor === 'object' && !Array.isArray(input.anchor)
      ? structuredClone(input.anchor)
      : null,
    expectedRevision: Number(input.expectedRevision),
    ...positions(input)
  };
  if (!dto.quoteText || !dto.anchorFingerprint || !dto.noteContentHash) {
    throw validationError(
      'ANNOTATION_ANCHOR_FIELDS_REQUIRED',
      'Annotation anchor fields are required'
    );
  }
  return dto;
}

export function buildUpdateContentAnnotationDto(input = {}) {
  const dto = {
    expectedRevision: Number(input.expectedRevision),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.importance !== undefined ? { importance: input.importance } : {}),
    ...(input.comment !== undefined ? { comment: String(input.comment) } : {})
  };
  if (!Number.isInteger(dto.expectedRevision) || dto.expectedRevision < 1) {
    throw validationError('ANNOTATION_REVISION_REQUIRED', 'Annotation revision is required');
  }
  if (dto.kind !== undefined && !annotationKinds.has(dto.kind)) throw validationError('ANNOTATION_TYPE_INVALID', 'Annotation kind is invalid');
  if (dto.importance !== undefined && !importanceLevels.has(dto.importance)) throw validationError('ANNOTATION_IMPORTANCE_INVALID', 'Annotation importance is invalid');
  if (dto.comment !== undefined && dto.comment.length > 2000) throw validationError('ANNOTATION_COMMENT_TOO_LONG', 'Annotation comment is too long');
  return dto;
}
