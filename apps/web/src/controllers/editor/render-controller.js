import { createMilkdownHost } from '../../../lib/editor/milkdown-bundle.js';
import { ensureOpenTab } from '../../../lib/editor/tab-workspace.js';
import {
  buildMarkdownImportItems,
  buildNoteExportHtml,
  buildExportFileName,
  createDuplicateTitle,
  createLocalDuplicateNoteInput,
  createUntitledName,
  deriveNoteTitleFromMarkdown,
  getSiblingNamesForFolder,
  getMarkdownImportStatusMessage
} from '../../../lib/editor/file-menu.js';
import {
  applyEditorPanelMatchResult,
  createOpenedEditorPanelState
} from '../../../lib/editor/editor-panel-state.js';
import {
  createLocalDraftNote,
  resolveDraftSaveState
} from '../../../lib/editor/draft-state.js';
import { renderEditorPanelMarkup } from '../../../lib/editor/editor-panel-renderers.js';
import { extractMarkdownHeadings, renderMarkdownPreview } from '../../../lib/markdown.js';
import { replaceNoteInCollection } from '../../../lib/workspace-normalization.js';
import { insertNote as insertLocalNote } from '../../../lib/tree-workspace.js';
import { createLocalImportedNoteInput } from '../../../lib/notes/state.js';
import { getEditorShortcutLabel } from '../../../lib/editor/shortcut-actions.js';
import { EDITOR_CONTEXT_PRIMARY_ACTIONS } from '../../../lib/editor/context-menu-model.js';
import { renderEditorContextMenuMarkup } from '../../../lib/editor/context-menu-renderers.js';
import { renderEditorMenuBarMarkup } from '../../../lib/editor/menu-renderers.js';
import { getSaveStateLabel } from '../../../lib/editor/save-indicator.js';
import {
  renderPreviewPane as renderPreviewPaneMarkup,
  renderSourceEditorPane as renderSourceEditorPaneMarkup,
  renderSourceEditorView as renderSourceEditorViewMarkup
} from '../../../lib/editor/preview-renderers.js';
import { renderRichEditorHost } from '../../../lib/editor/view-renderers.js';
import { resolveEditorRenderState } from '../../../lib/editor/view-state.js';
import {
  normalizeTableDialogValue,
  renderTableInsertDialogMarkup
} from '../../../lib/editor/table-dialog-renderers.js';

export function createEditorRenderController(deps, getController) {
  const {
    state,
    elements,
    editorRuntime,
    knowledgeApi,
    autosaveDelayMs,
    getCurrentNote,
    getEffectiveViewState,
    renderAll,
    renderTabs,
    renderFolders,
    renderSidebar,
    renderStatus,
    persistBackendCache,
    refreshKnowledgeData,
    loadCurrentNoteSideData,
    syncLocalWorkspace,
    openFolderBranch,
    closeContextMenu,
    closeSectionMenu,
    closeTabMenu,
    createAnnotationFromCurrentSelection,
    syncAnnotationMarkers,
    flashStatus,
    escapeHtml,
    escapeAttribute
  } = deps;

function renderEditorMenuBar() {
  if (!elements.editorMenuBar) {
    return;
  }

  const note = getCurrentNote();
  const effectiveView = getEffectiveViewState();
  elements.editorMenuBar.innerHTML = renderEditorMenuBarMarkup({
    note,
    effectiveView,
    openMenu: state.editorMenuOpen,
    getShortcutLabel: getEditorShortcutLabel
  });
}

function renderPreviewPane(markdown) {
  const headings = extractMarkdownHeadings(markdown);
  const previewHtml = renderMarkdownPreview(markdown);
  return renderPreviewPaneMarkup({ headings, previewHtml });
}

function renderSourceEditorPane() {
  return renderSourceEditorPaneMarkup({ markdown: state.draftMarkdown });
}

function renderSourceEditorView() {
  return renderSourceEditorViewMarkup({ markdown: state.draftMarkdown });
}

function renderEditor(note) {
  if (!elements.editorContent) {
    return;
  }

  const effectiveView = getEffectiveViewState();
  const renderState = resolveEditorRenderState({
    note,
    effectiveView,
    currentEditorNoteId: editorRuntime.currentEditorNoteId,
    hasCurrentEditorHost: Boolean(editorRuntime.currentEditorHost)
  });

  if (renderState.shouldTeardownHost) {
    void getController().teardownEditorHost();
  }
  if (renderState.shouldCloseTableDialog) {
    state.editorTableDialog.open = false;
  }

  elements.editorContent.dataset.sourceOpen = String(renderState.sourceOpen);
  elements.editorContent.dataset.viewMode = renderState.viewMode;

  if (renderState.kind === 'empty') {
    elements.editorContent.innerHTML = renderPreviewPane('');
    return;
  }

  if (renderState.kind === 'recycle') {
    elements.editorContent.innerHTML = renderPreviewPane(note.rawMarkdown || '');
    return;
  }

  if (renderState.kind === 'reuse-rich-editor') {
    renderEditorSaveIndicator();
    getController().renderEditorPanel();
    getController().renderTableInsertDialog();
    return;
  }

  const markdown = state.draftMarkdown || note.rawMarkdown || '';

  if (renderState.kind === 'source-preview' || renderState.kind === 'preview') {
    elements.editorContent.innerHTML = renderState.kind === 'source-preview'
      ? `${renderSourceEditorView()}${renderPreviewPane(markdown)}`
      : renderPreviewPane(markdown);
    renderEditorSaveIndicator();
    return;
  }

  elements.editorContent.innerHTML = renderRichEditorHost();

  renderEditorSaveIndicator();
  getController().renderEditorPanel();
  getController().renderTableInsertDialog();
  getController().mountEditorHost(note.id, state.draftMarkdown);
}

function syncSourcePreview() {
  if (!elements.editorContent || !state.view.showSourceEditor) {
    return;
  }

  const previewContent = elements.editorContent.querySelector('[data-preview-content]');
  const previewToc = elements.editorContent.querySelector('[data-preview-toc]');
  if (!previewContent) {
    return;
  }

  const markdown = state.draftMarkdown;
  previewContent.innerHTML = renderMarkdownPreview(markdown);

  if (previewToc) {
    const headings = extractMarkdownHeadings(markdown);
    previewToc.innerHTML = headings
      .map((heading) => `<a class="toc-item" data-level="${heading.level}" href="#${escapeAttribute(heading.id)}">${escapeHtml(heading.title)}</a>`)
      .join('');
    previewToc.hidden = headings.length === 0;
  }
}

function renderEditorSaveIndicator() {
  const indicator = document.getElementById('editor-save-indicator');
  if (!indicator) {
    return;
  }

  indicator.dataset.saveState = state.saveState;
  indicator.textContent = getSaveStateLabel({
    saveState: state.saveState,
    lastSavedAt: state.lastSavedAt,
    formatDate
  });
}

  return {
    renderEditorMenuBar,
    renderPreviewPane,
    renderSourceEditorPane,
    renderSourceEditorView,
    renderEditor,
    syncSourcePreview,
    renderEditorSaveIndicator
  };
}
