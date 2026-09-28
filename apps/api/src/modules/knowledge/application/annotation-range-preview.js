import { calculateContentHash, resolveAnchor } from '@study-accelerator/content-anchor';
import { createAppError } from '../../../errors/app-error.js';
export function pendingRange(annotation, note) {
  const pending = annotation.anchor?.pending;
  const hash = calculateContentHash(note.rawMarkdown);
  if (!pending || pending.contentHash !== hash || resolveAnchor(note.rawMarkdown, pending.anchor).status !== 'resolved') return null;
  return { anchor: pending.anchor, reason: pending.reason,
    candidateHash: calculateContentHash(JSON.stringify([annotation.id, annotation.revision, hash, pending.anchor])) };
}
export function assertRangeConfirmation(annotation, note, input) {
  const pending = pendingRange(annotation, note);
  if (annotation.lifecycleStatus !== 'active' || !pending || input.expectedRevision !== annotation.revision
    || input.noteContentHash !== calculateContentHash(note.rawMarkdown) || input.candidateHash !== pending.candidateHash) {
    throw createAppError('ANNOTATION_CONTENT_CONFLICT', '范围预览已过期，请重新查看后确认', 409);
  }
  return pending.anchor;
}
