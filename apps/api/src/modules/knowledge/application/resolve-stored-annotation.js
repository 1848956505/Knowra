import { followListAnchor, followSectionAnchor, relocateAnchor } from '@study-accelerator/content-anchor';

/** 旧来源范围不再有效是可恢复的标注状态；其他程序或存储错误继续上抛。 */
export function resolveStoredAnnotation(markdown, annotation) {
  if (annotation.anchor?.pending) return { status: 'needsReview', reason: annotation.anchor.pending.reason };
  try {
    if (annotation.scopeType === 'list') return followListAnchor(markdown, annotation.anchor);
    return annotation.scopeType === 'section'
      ? followSectionAnchor(markdown, annotation.anchor)
      : relocateAnchor(markdown, annotation.anchor);
  } catch (error) {
    if (!(error instanceof RangeError) || error.code !== 'ANNOTATION_RANGE_INVALID') throw error;
    return { status: 'needsReview', reason: 'invalidStoredAnchor' };
  }
}
