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

export function createEditorHostController(deps, getController) {
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
    createKnowledgePointFromCurrentSelection,
    syncKnowledgePointMarkers,
    getCurrentKnowledgePointSources,
    flashStatus,
    escapeHtml,
    escapeAttribute
  } = deps;

async function teardownEditorHost() {
  editorRuntime.pendingEditorNoteId = null;
  editorRuntime.currentEditorNoteId = null;
  editorRuntime.editorMountToken += 1;

  if (!editorRuntime.currentEditorHost) {
    return;
  }

  const host = editorRuntime.currentEditorHost;
  editorRuntime.currentEditorHost = null;
  await host.destroy();
}

function mountEditorHost(noteId, markdown) {
  const root = document.getElementById('milkdown-editor');
  if (!root) {
    return;
  }

  if (editorRuntime.pendingEditorNoteId === noteId) {
    return;
  }

  const token = ++editorRuntime.editorMountToken;
  editorRuntime.pendingEditorNoteId = noteId;
  const previousHost = editorRuntime.currentEditorHost;
  editorRuntime.currentEditorHost = null;
  editorRuntime.currentEditorNoteId = null;

  void (async () => {
    if (previousHost) {
      await previousHost.destroy();
    }

    const host = createMilkdownHost({
      root,
      markdown,
      noteId,
      onChange: handleEditorMarkdownChange
    });

    await host.ready;

    if (token !== editorRuntime.editorMountToken || state.selectedNoteId !== noteId) {
      await host.destroy();
      return;
    }

    editorRuntime.currentEditorHost = host;
    editorRuntime.currentEditorNoteId = noteId;
    editorRuntime.pendingEditorNoteId = null;
    syncKnowledgePointMarkers();
    getController().renderEditorSaveIndicator();
    renderStatus();

    // 恢复之前保存的滚动位置
    restoreEditorScrollPosition(noteId);
  })().catch((error) => {
    editorRuntime.pendingEditorNoteId = null;
    flashStatus(error.message || '编辑器加载失败');
  });
}

function handleEditorMarkdownChange(markdown) {
  if (!editorRuntime.currentEditorNoteId || editorRuntime.currentEditorNoteId !== state.selectedNoteId) {
    return;
  }

  state.draftMarkdown = markdown;
  getController().scheduleAutosave();
}

  return {
    teardownEditorHost,
    mountEditorHost,
    handleEditorMarkdownChange
  };
}
