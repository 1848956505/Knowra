import { compareIdentityShadow } from '@study-accelerator/content-anchor';

/**
 * 稳定身份迁移 S2a：保存后把编辑器身份视角与旧链路的跟随结果比较，结论交给 sink 记录。
 * 只做诊断：任何异常都被吞掉，不能影响保存、版本或重点状态。
 */
export function createAnnotationIdentityShadow({ listAnnotations, sink = null, now = () => new Date().toISOString() }) {
  function record(note, annotations, editorState) {
    const result = compareIdentityShadow({ markdown: note.rawMarkdown, editorState, annotations });
    sink({ at: now(), noteId: note.id, ...result });
    return result;
  }
  return {
    observe(note, annotationChange) {
      if (!sink || !annotationChange?.editorState) return null;
      try {
        const annotations = listAnnotations(note.id);
        if (annotations && typeof annotations.then === 'function') {
          return annotations.then(list => record(note, list, annotationChange.editorState)).catch(() => null);
        }
        return record(note, annotations, annotationChange.editorState);
      } catch {
        return null;
      }
    }
  };
}
