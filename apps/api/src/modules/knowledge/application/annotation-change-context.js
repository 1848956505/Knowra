import { calculateContentHash, updateStructure, verifiedSourceEdits } from '@study-accelerator/content-anchor';
import { createAppError } from '../../../errors/app-error.js';

export function prepareAnnotationChange(current, markdown, mapping) {
  if (mapping && (mapping.baseContentHash !== calculateContentHash(current.rawMarkdown)
    || (mapping.baseStructureRevision !== undefined && mapping.baseStructureRevision !== (current.annotationStructure?.revision ?? 0)))) {
    throw createAppError('NOTE_UPDATE_CONFLICT', '标注映射基线已变化，请保留草稿并重新加载', 409);
  }
  const edits = verifiedSourceEdits(current.rawMarkdown, markdown, mapping);
  return { before: current.rawMarkdown, previousStructure: current.annotationStructure, edits, invalidMapping: Boolean(mapping && !edits),
    // 影子比对用的编辑器身份快照；由 compareIdentityShadow 校验，不参与旧链路。
    editorState: mapping?.editorState ?? null,
    structure: updateStructure(current.rawMarkdown, markdown, current.annotationStructure, edits) };
}
