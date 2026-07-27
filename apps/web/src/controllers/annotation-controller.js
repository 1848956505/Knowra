import { buildAnnotationInputFromSelection } from '../../lib/annotations/selection.js';
import { insertAnnotation, replaceAnnotation } from '../../lib/annotations/state.js';
import { guardWorkspaceWrite } from '../../lib/workspace-write-guard.js';

export function createAnnotationController({
  state,
  editorRuntime,
  knowledgeApi,
  getCurrentNote,
  persistDraft,
  renderSidebar,
  flashStatus
}) {
  const syncAnnotationMarkers = () => void editorRuntime.currentEditorHost?.setAnnotations(state.annotations);

  async function createAnnotationFromCurrentSelection(note) {
    if (!guardWorkspaceWrite({ dataMode: state.dataMode, flashStatus })) {
      return false;
    }
    const host = editorRuntime.currentEditorHost;
    if (!host) {
      flashStatus('编辑器尚未就绪');
      return false;
    }
    const selection = await host.getSelectionSnapshot();
    if (!selection) {
      flashStatus('请先选中正文片段');
      return false;
    }

    try {
      const saveResult = await persistDraft();
      if (!saveResult?.ok) {
        return false;
      }
      const currentNote = note ?? getCurrentNote();
      const input = await buildAnnotationInputFromSelection({ note: currentNote, selection, markdown: state.draftMarkdown || currentNote.rawMarkdown });
      const annotation = await knowledgeApi.createAnnotation(input);
      state.annotations = insertAnnotation(state.annotations, annotation);
      state.focusedAnnotationId = annotation.id;
      state.asideTab = 'concepts';
      state.expandedAnnotationIds = {
        ...state.expandedAnnotationIds,
        [annotation.id]: true
      };
      syncAnnotationMarkers();
      renderSidebar(getCurrentNote());
      flashStatus('已标记为重要内容');
      return true;
    } catch (error) {
      flashStatus(error.message || '标记失败');
      return false;
    }
  }

  async function deleteAnnotation(id) {
    if (!guardWorkspaceWrite({ dataMode: state.dataMode, flashStatus })) {
      return false;
    }
    try {
      const annotation = await knowledgeApi.deleteAnnotation(id);
      state.annotations = replaceAnnotation(state.annotations, annotation);
      syncAnnotationMarkers();
      renderSidebar(getCurrentNote());
      return true;
    } catch (error) {
      flashStatus(error.message || '删除标注失败');
      return false;
    }
  }

  async function selectAnnotation(id) {
    state.focusedAnnotationId = id;
    const selected = await editorRuntime.currentEditorHost?.selectAnnotation(id);
    if (!selected) {
      flashStatus('原文位置已变化');
    }
    renderSidebar(getCurrentNote());
  }

  function focusAnnotationFromMarker({ annotationId }) {
    state.focusedAnnotationId = annotationId;
    state.asideTab = 'concepts';
    renderSidebar(getCurrentNote());
  }

  return {
    createAnnotationFromCurrentSelection,
    deleteAnnotation,
    selectAnnotation,
    focusAnnotationFromMarker,
    syncAnnotationMarkers
  };
}
