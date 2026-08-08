import {
  renderStatusFeature,
  renderStatusGlobal
} from '../../lib/status/renderers.js';
import { renderFunctionNavigation } from '../../lib/shell/rail-renderers.js';
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
import { renderHomeLoading, renderHomeWorkspace } from '../../lib/home/renderers.js';

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
  const activeKey = activeDomain === 'materials' && state.view?.screen === 'home'
    ? 'home'
    : activeDomain ?? railItems.find((item) => item.active)?.key ?? 'materials';
  elements.moduleRail.innerHTML = renderFunctionNavigation(activeKey);
}

function renderAll() {
  const currentNote = getCurrentNote();
  safeRenderStep('function-navigation', renderRail);
  safeRenderStep('search', renderSearchShell);
  safeRenderStep('workspace-view', renderWorkspaceViewState);
  safeRenderStep('home', renderHome);
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
  const isHome = isMaterials && state.view.screen === 'home';
  const isIndex = isMaterials && state.view.screen === 'index';
  // The left rail contains the global work-domain switcher and must remain
  // reachable outside the Materials domain. Only the Materials index/editor
  // decides whether the contextual library sidebar itself is shown.
  const showFunctionNavigation = !isMaterials || isHome || isIndex || effectiveView.showLeftSidebar;
  const showLibraryDirectory = isMaterials && !isHome && (isIndex
    ? state.libraryIndex?.directoryOpen !== false
    : effectiveView.showLeftSidebar);
  if (elements.workspaceShell) {
    elements.workspaceShell.dataset.screen = !isMaterials ? 'domain' : isHome ? 'home' : isIndex ? 'index' : 'editor';
    elements.workspaceShell.dataset.leftHidden = String(!showFunctionNavigation);
    elements.workspaceShell.dataset.functionNavigationHidden = String(!showFunctionNavigation);
    elements.workspaceShell.dataset.directoryHidden = String(!showLibraryDirectory);
  }
  elements.workspace.dataset.leftHidden = String(!effectiveView.showLeftSidebar);
  elements.workspace.dataset.rightHidden = String(!effectiveView.showRightSidebar);
  elements.workspace.dataset.viewMode = effectiveView.mode;

  if (elements.libraryIndexView) {
    elements.libraryIndexView.hidden = !isMaterials || !isIndex;
  }
  if (elements.homeWorkspaceView) {
    elements.homeWorkspaceView.hidden = !isHome;
  }
  if (elements.editorWorkspaceView) {
    elements.editorWorkspaceView.hidden = !isMaterials || isHome || isIndex;
  }
  if (elements.workDomainView) {
    elements.workDomainView.hidden = isMaterials;
    elements.workDomainView.dataset.domain = state.navigation?.activeWorkDomain ?? 'materials';
  }

  if (elements.moduleRail) {
    elements.moduleRail.hidden = !showFunctionNavigation;
  }
  if (elements.sidebar) {
    elements.sidebar.hidden = !showLibraryDirectory;
  }
  if (elements.libraryIndexDirectoryToggle) {
    elements.libraryIndexDirectoryToggle.hidden = !isIndex;
    elements.libraryIndexDirectoryToggle.setAttribute('aria-expanded', String(showLibraryDirectory));
    elements.libraryIndexDirectoryToggle.setAttribute('aria-label', showLibraryDirectory ? '折叠目录栏' : '展开目录栏');
    elements.libraryIndexDirectoryToggle.setAttribute('title', showLibraryDirectory ? '折叠目录栏' : '展开目录栏');
  }
  if (elements.libraryIndexDirectoryReopen) {
    elements.libraryIndexDirectoryReopen.hidden = !isIndex || showLibraryDirectory;
    elements.libraryIndexDirectoryReopen.setAttribute('aria-expanded', String(showLibraryDirectory));
  }

  if (elements.aside) {
    elements.aside.hidden = isHome || isIndex || !effectiveView.showRightSidebar;
    if (!isMaterials) elements.aside.hidden = true;
  }
  if (elements.editorAsideReopen) {
    elements.editorAsideReopen.hidden = !isMaterials || isHome || isIndex || effectiveView.showRightSidebar;
  }
}

function renderHome() {
  if (!elements.homeWorkspaceContent) {
    return;
  }

  elements.homeWorkspaceContent.innerHTML = state.dataMode === 'loading' && !state.allNotes.length
    ? renderHomeLoading()
    : renderHomeWorkspace(state);
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
    elements.libraryIndexTabs.setAttribute?.('role', 'tablist');
    elements.libraryIndexTabs.innerHTML = renderLibraryIndexTabs({ state });
  }
  if (elements.libraryIndexFilters) {
    elements.libraryIndexFilters.innerHTML = renderLibraryIndexFilters({ state });
  }
  elements.libraryIndexContent.setAttribute?.('role', 'tabpanel');
  elements.libraryIndexContent.setAttribute?.('aria-labelledby', `library-index-tab-${state.libraryIndex.tab}`);
  elements.libraryIndexContent.setAttribute?.('tabindex', '0');
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
  const isEditor = state.navigation?.activeWorkDomain === 'materials' && state.view.screen === 'editor';

  if (elements.statusIndicators) {
    elements.statusIndicators.innerHTML = renderStatusFeature({
      statusMessage: state.statusMessage,
      saveState: state.saveState,
      markdown,
      view: effectiveView,
      showEditorControls: isEditor
    });
  }

  if (elements.statusMeta) {
    elements.statusMeta.innerHTML = renderStatusGlobal({ dataMode: state.dataMode });
  }
}

  return {
    renderRail,
    renderAll,
    safeRenderStep,
    getEffectiveViewState,
    renderWorkspaceViewState,
    renderHome,
    renderWorkDomain,
    renderLibraryIndex,
    renderDocumentHead,
    renderStatus
  };
}
