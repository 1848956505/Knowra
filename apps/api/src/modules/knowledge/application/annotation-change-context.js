import { calculateContentHash, identityFromEditorState, updateStructure, validIdentityTable, verifiedSourceEdits } from '@study-accelerator/content-anchor';
import { createAppError } from '../../../errors/app-error.js';

export function prepareAnnotationChange(current, markdown, mapping) {
  if (mapping && (mapping.baseContentHash !== calculateContentHash(current.rawMarkdown)
    || (mapping.baseStructureRevision !== undefined && mapping.baseStructureRevision !== (current.annotationStructure?.revision ?? 0)))) {
    throw createAppError('NOTE_UPDATE_CONFLICT', '标注映射基线已变化，请保留草稿并重新加载', 409);
  }
  const edits = verifiedSourceEdits(current.rawMarkdown, markdown, mapping);
  const structure = updateStructure(current.rawMarkdown, markdown, current.annotationStructure, edits);
  const identity = blockIdentityForSave(current, markdown, mapping?.editorState);
  return { before: current.rawMarkdown, previousStructure: current.annotationStructure, edits, invalidMapping: Boolean(mapping && !edits),
    // 影子比对用的编辑器身份快照；由 compareIdentityShadow 校验，不参与旧链路。
    editorState: mapping?.editorState ?? null,
    structure: identity ? { ...structure, identity } : structure };
}

/**
 * 块身份表（S2b）：编辑器快照与本次正文对齐时以编辑器 ID 为准；正文未变时沿用原表；
 * 其他情况（源码面板、导入、AI 写回等外部改写）暂不推断，表随之失效，编辑器下次打开时重新分配。
 */
function blockIdentityForSave(current, markdown, editorState) {
  const fromEditor = identityFromEditorState(markdown, editorState);
  if (fromEditor) return fromEditor;
  const previous = current.annotationStructure?.identity;
  return validIdentityTable(markdown, previous) ? previous : null;
}
