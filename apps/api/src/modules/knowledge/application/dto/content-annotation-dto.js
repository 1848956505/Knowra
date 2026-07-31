import { validationError } from '../knowledge-errors.js';

const annotationKinds = new Set(['important']);
const sourceModes = new Set(['manual', 'ai']);

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
