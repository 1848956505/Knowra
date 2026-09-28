import { followAnchorChanges, calculateContentHash, headingPathForSourceOffset } from '@study-accelerator/content-anchor';

export function reconcileAnnotationSource(annotation, note, oldVersion, context) {
  if (annotation.anchor?.tracking?.empty && context?.edits?.some(edit => edit.deletedEmptyAnnotationIds?.includes(annotation.id))) return { status: 'missing', reason: 'sourceDeleted' };
  if (annotation.anchorReason === 'ambiguousMatch') return { status: 'needsReview', reason: 'ambiguousMatch' };
  if (context?.invalidMapping) return { status: 'needsReview', reason: 'mappingMismatch' };
  const before = oldVersion?.content;
  // A missing anchor stays missing unless explicitly rebound. Merely typing the same text must not revive it.
  if (annotation.anchorStatus === 'missing' && !annotation.anchor?.tracking?.cut && !context?.edits?.at(-1)?.history) return { status: 'missing', reason: annotation.anchorReason ?? 'sourceDeleted' };
  if (typeof before !== 'string') return { status: 'needsReview', reason: 'sourceVersionMissing' };
  if (annotation.anchor?.tracking?.cut && context?.before && context.edits) return followAnchorChanges(context.before, note.rawMarkdown, annotation.anchor, context.edits);
  return followAnchorChanges(before, note.rawMarkdown, annotation.anchor,
    before === context?.before ? context.edits : null);
}
export function reconciledAnnotationFields(annotation, note, version, result) {
  if (result.status !== 'resolved') {
    return { noteContentHash: calculateContentHash(note.rawMarkdown), anchorStatus: result.status, anchorReason: result.reason,
      anchor: { ...(result.status === 'missing' && result.anchor?.tracking?.cut ? result.anchor : annotation.anchor), pending: result.status === 'needsReview' && result.anchor ? {
        anchor: result.anchor, contentHash: calculateContentHash(note.rawMarkdown), reason: result.reason
      } : null } };
  }
  const anchor = result.anchor ?? annotation.anchor;
  const identities = note.annotationStructure?.nodes?.filter(node => node.sourceEnd > anchor.sourceStart && node.sourceStart < anchor.sourceEnd).map(node => node.id) ?? [];
  return { noteVersionId: version?.id ?? annotation.noteVersionId, noteContentHash: calculateContentHash(note.rawMarkdown),
    anchor: { ...anchor, pending: null, noteVersionId: version?.id ?? annotation.noteVersionId,
      tracking: { ...anchor.tracking, formatVersion: 1, structureRevision: note.annotationStructure?.revision ?? 0, memberIds: identities } },
    scopeType: anchor.scopeType, quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
    headingPath: headingPathForSourceOffset(result.projection, anchor.sourceStart + 1),
    prefixText: anchor.prefixText, suffixText: anchor.suffixText,
    resolvedContentHash: calculateContentHash(anchor.quoteText), boundaryFingerprint: anchor.section?.memberFingerprint ?? null,
    anchorStatus: result.status, anchorReason: result.reason };
}
