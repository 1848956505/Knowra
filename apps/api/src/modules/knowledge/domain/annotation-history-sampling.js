import { ANNOTATION_REVISION_RETENTION } from './history-retention.js';

/** 当前标注始终保存并推进 revision；这里只决定是否另存一份恢复历史。 */
export function shouldRecordAnnotationRevision({ operation, annotation, previous, revisions, now = Date.now() }) {
  if (operation !== 'sourceReconciled') return true;
  if (!previous || previous.anchorStatus !== annotation.anchorStatus || previous.anchorReason !== annotation.anchorReason
    || Boolean(previous.anchor?.tracking?.empty) !== Boolean(annotation.anchor?.tracking?.empty)) return true;
  let latest = null;
  for (const record of revisions) {
    if (record.operation !== 'sourceReconciled') continue;
    if (!latest || record.revision > latest.revision) latest = record;
  }
  if (!latest) return true;
  const time = Date.parse(latest.createdAt);
  return !Number.isFinite(time) || now - time >= ANNOTATION_REVISION_RETENTION.sampleMs;
}
