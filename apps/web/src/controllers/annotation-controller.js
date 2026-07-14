import { buildAnnotationInputFromSelection } from '../../lib/annotations/selection.js';
import { insertAnnotation, replaceAnnotation } from '../../lib/annotations/state.js';

export function createAnnotationController({ state, editorRuntime, knowledgeApi, getCurrentNote, renderSidebar, flashStatus }) {
  const syncAnnotationMarkers = () => void editorRuntime.currentEditorHost?.setAnnotations(state.annotations);
  async function createAnnotationFromCurrentSelection(note) {
    const host = editorRuntime.currentEditorHost;
    if (!host) return flashStatus('编辑器尚未就绪');
    const selection = await host.getSelectionSnapshot();
    if (!selection) return flashStatus('请先选中正文片段');
    try {
      const currentNote = note ?? getCurrentNote();
      const input = await buildAnnotationInputFromSelection({ note: currentNote, selection, markdown: state.draftMarkdown || currentNote.rawMarkdown });
      const annotation = await knowledgeApi.createAnnotation(input);
      state.annotations = insertAnnotation(state.annotations, annotation); state.focusedAnnotationId = annotation.id; state.asideTab = 'concepts'; state.expandedAnnotationIds = { ...state.expandedAnnotationIds, [annotation.id]: true };
      syncAnnotationMarkers(); renderSidebar(getCurrentNote()); flashStatus('已标记为重要内容');
    } catch (error) { flashStatus(error.message || '标记失败'); }
  }
  async function deleteAnnotation(id) { try { const annotation = await knowledgeApi.deleteAnnotation(id); state.annotations = replaceAnnotation(state.annotations, annotation); syncAnnotationMarkers(); renderSidebar(getCurrentNote()); } catch (error) { flashStatus(error.message || '删除标注失败'); } }
  async function selectAnnotation(id) { state.focusedAnnotationId = id; const selected = await editorRuntime.currentEditorHost?.selectAnnotation(id); if (!selected) flashStatus('原文位置已变化'); renderSidebar(getCurrentNote()); }
  function focusAnnotationFromMarker({ annotationId }) { state.focusedAnnotationId = annotationId; state.asideTab = 'concepts'; renderSidebar(getCurrentNote()); }
  return { createAnnotationFromCurrentSelection, deleteAnnotation, selectAnnotation, focusAnnotationFromMarker, syncAnnotationMarkers };
}
