function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function positions(input) {
  const fromPosition = Number(input.fromPosition);
  const toPosition = Number(input.toPosition);
  if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition) || fromPosition < 0 || fromPosition >= toPosition) throw new Error('Annotation range is invalid');
  return { fromPosition, toPosition };
}

export function buildCreateContentAnnotationDto(input = {}) {
  const dto = {
    spaceId: text(input.spaceId), noteId: text(input.noteId), quoteText: text(input.quoteText),
    headingPath: Array.isArray(input.headingPath) ? input.headingPath.map(text).filter(Boolean) : [],
    prefixText: text(input.prefixText), suffixText: text(input.suffixText),
    anchorFingerprint: text(input.anchorFingerprint), noteContentHash: text(input.noteContentHash),
    idempotencyKey: text(input.idempotencyKey), kind: input.kind ?? 'important', sourceMode: input.sourceMode ?? 'manual',
    ...positions(input)
  };
  if (!dto.spaceId || !dto.noteId || !dto.quoteText || !dto.anchorFingerprint || !dto.noteContentHash || !dto.idempotencyKey) throw new Error('Annotation creation fields are required');
  return dto;
}

export function buildUpdateAnnotationAnchorDto(input = {}) {
  const dto = { quoteText: text(input.quoteText), prefixText: text(input.prefixText), suffixText: text(input.suffixText), anchorFingerprint: text(input.anchorFingerprint), noteContentHash: text(input.noteContentHash), headingPath: Array.isArray(input.headingPath) ? input.headingPath.map(text).filter(Boolean) : [], ...positions(input) };
  if (!dto.quoteText || !dto.anchorFingerprint || !dto.noteContentHash) throw new Error('Annotation anchor fields are required');
  return dto;
}
