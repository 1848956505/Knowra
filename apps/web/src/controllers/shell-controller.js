import {
  renderStatusIndicators,
  renderStatusMeta
} from '../../lib/status/renderers.js';
import { renderModuleRail } from '../../lib/shell/rail-renderers.js';
import { getEffectiveViewState as selectEffectiveViewState } from '../../lib/shell/view-state.js';
import { renderEditorDocumentHead } from '../../lib/editor/document-head-renderer.js';
import {
  renderLibraryIndexContent,
  renderLibraryIndexInspector,
  renderLibraryIndexScope
} from '../../lib/library-index/renderers.js';
import {
  renderLibraryIndexFilters,
  renderLibraryIndexTabs
} from '../../lib/library-index/filter-renderers.js';
import {
  paginateLibraryIndexNotes,
  selectLibraryIndexNotes
} from '../../lib/library-index/model.js';

export function createShellController(deps) {
  const {
    state,
    elements,
    railItems,
    getCurrentNote,
    renderEditor,
    renderEditorContextMenu,
    renderEditorMenuBar,
    renderFolders,
    renderSearchShell,
    renderSidebar,
    renderTabs,
    reportRuntimeError,
    renderWorkDomain: renderWorkDomainView
  } = deps;

function renderRail() {
  if (!elements.moduleRail) {
    return;
  }

  const activeDomain = state.navigation?.activeWorkDomain;
  elements.moduleRail.innerHTML = renderModuleRail(railItems.map((item) => ({
    ...item,
    active: activeDomain ? item.key === activeDomain : item.active
  })));
}

function renderAll() {
  const currentNote = getCurrentNote();
  safeRenderStep('search', renderSearchShell);
  safeRenderStep('workspace-view', renderWorkspaceViewState);
  safeRenderStep('work-domain', renderWorkDomain);
  safeRenderStep('navigation', renderFolders);
  safeRenderStep('library-index', renderLibraryIndex);
  safeRenderStep('tabs', renderTabs);
  safeRenderStep('document-head', () => renderDocumentHead(currentNote));
  safeRenderStep('editor-menu', renderEditorMenuBar);
  safeRenderStep('editor', () => renderEditor(currentNote));
  safeRenderStep('sidebar', () => renderSidebar(currentNote));
  safeRenderStep('editor-context-menu', renderEditorContextMenu);
  safeRenderStep('status', renderStatus);
}

function safeRenderStep(name, renderStep) {
  try {
    renderStep();
  } catch (error) {
    reportRuntimeError(name, error);
  }
}

function getEffectiveViewState() {
  return selectEffectiveViewState(state.view);
}

function renderWorkspaceViewState() {
  if (!elements.workspace) {
    return;
  }

  const effectiveView = getEffectiveViewState();
  const isMaterials = (state.navigation?.activeWorkDomain ?? 'materials') === 'materials';
  const isIndex = isMaterials && state.view.screen === 'index';
  // The left rail contains the global work-domain switcher and must remain
  // reachable outside the Materials domain. Only the Materials index/editor
  // decides whether the contextual library sidebar itself is shown.
  const showLeftSidebar = !isMaterials || isIndex || effectiveView.showLeftSidebar;
  if (elements.workspaceShell) {
    elements.workspaceShell.dataset.screen = !isMaterials ? 'domain' : isIndex ? 'index' : 'editor';
    elements.workspaceShell.dataset.leftHidden = String(!showLeftSidebar);
  }
  elements.workspace.dataset.leftHidden = String(!effectiveView.showLeftSidebar);
  elements.workspace.dataset.rightHidden = String(!effectiveView.showRightSidebar);
  elements.workspace.dataset.viewMode = effectiveView.mode;

  if (elements.libraryIndexView) {
    elements.libraryIndexView.hidden = !isMaterials || !isIndex;
  }
  if (elements.editorWorkspaceView) {
    elements.editorWorkspaceView.hidden = !isMaterials || isIndex;
  }
  if (elements.workDomainView) {
    elements.workDomainView.hidden = isMaterials;
    elements.workDomainView.dataset.domain = state.navigation?.activeWorkDomain ?? 'materials';
  }

  if (elements.sidebar) {
    elements.sidebar.hidden = !showLeftSidebar;
  }

  if (elements.aside) {
    elements.aside.hidden = isIndex || !effectiveView.showRightSidebar;
    if (!isMaterials) elements.aside.hidden = true;
  }
  if (elements.editorAsideReopen) {
    elements.editorAsideReopen.hidden = !isMaterials || isIndex || effectiveView.showRightSidebar;
  }
}

function renderLibraryIndex() {
  if (!elements.libraryIndexContent || !elements.libraryIndexInspector) {
    return;
  }

  const allNotes = selectLibraryIndexNotes(state);
  const pagination = paginateLibraryIndexNotes(allNotes, state.libraryIndex);
  const notes = pagination.items;
  state.libraryIndex.page = pagination.page;
  state.libraryIndex.pageSize = pagination.pageSize;
  const selectedId = state.libraryIndex.selectedNoteId;
  const selectedIsVisible = notes.some((note) => note.id === selectedId);
  if (!selectedIsVisible) {
    state.libraryIndex.selectedNoteId = notes[0]?.id ?? null;
  }
  const selectedNote = notes.find((note) => note.id === state.libraryIndex.selectedNoteId) ?? null;

  if (elements.libraryIndexScope) {
    elements.libraryIndexScope.innerHTML = renderLibraryIndexScope({ notes: allNotes, state });
  }
  if (elements.libraryIndexTabs) {
    elements.libraryIndexTabs.innerHTML = renderLibraryIndexTabs({ state });
  }
  if (elements.libraryIndexFilters) {
    elements.libraryIndexFilters.innerHTML = renderLibraryIndexFilters({ state });
  }
  elements.libraryIndexContent.innerHTML = renderLibraryIndexContent({ notes, pagination, state });
  elements.libraryIndexInspector.innerHTML = renderLibraryIndexInspector({ note: selectedNote, state });
  elements.libraryIndexInspector.dataset.open = String(state.libraryIndex.inspectorOpen);
}

function renderWorkDomain() {
  renderWorkDomainView?.();
}

function renderDocumentHead(note) {
  if (!elements.editorDocumentHead) {
    return;
  }
  elements.editorDocumentHead.innerHTML = renderEditorDocumentHead({ note, state });
}

function renderStatus() {
  const currentNote = getCurrentNote();
  const effectiveView = getEffectiveViewState();
  const markdown = state.draftMarkdown || currentNote?.rawMarkdown || '';

  if (elements.statusIndicators) {
    elements.statusIndicators.innerHTML = renderStatusIndicators({
      statusMessage: state.statusMessage,
      saveState: state.saveState
    });
  }

  if (elements.statusMeta) {
    elements.statusMeta.innerHTML = renderStatusMeta({
      dataMode: state.dataMode,
      markdown,
      view: effectiveView
    });
  }
}

  return {
    renderRail,
    renderAll,
    safeRenderStep,
    getEffectiveViewState,
    renderWorkspaceViewState,
    renderWorkDomain,
    renderLibraryIndex,
    renderDocumentHead,
    renderStatus
  };
}
