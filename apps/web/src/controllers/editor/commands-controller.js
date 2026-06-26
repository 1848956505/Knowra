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

export function createEditorCommandsController(deps, getController) {
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

async function handleFormat(format) {
  if (!editorRuntime.currentEditorHost) {
    return;
  }

  if (format === 'table') {
    getController().openTableInsertDialog();
    return;
  }

  await editorRuntime.currentEditorHost.run(format);
  await editorRuntime.currentEditorHost.focus();
}

function shouldHandleEditorShortcut(event) {
  if (!editorRuntime.currentEditorHost || !getCurrentNote() || state.view.showSourceEditor) {
    return false;
  }

  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target?.closest) {
    return false;
  }

  if (target.closest('#editor-utility-panel') || target.closest('[data-source-editor-input]')) {
    return false;
  }

  return Boolean(target.closest('#editor-content'));
}

async function handleResolvedEditorShortcut(action) {
  if (!editorRuntime.currentEditorHost) {
    return;
  }

  await editorRuntime.currentEditorHost.run(action);
  await editorRuntime.currentEditorHost.focus();
}

async function handleParagraphMenuAction(action) {
  closeEditorMenuBar();

  const note = getCurrentNote();
  if (!note) {
    flashStatus('请先选择一篇笔记');
    return;
  }

  if (!editorRuntime.currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  await editorRuntime.currentEditorHost.run(action);
  await editorRuntime.currentEditorHost.focus();
}

async function handleFormatMenuAction(action) {
  closeEditorMenuBar();

  const note = getCurrentNote();
  if (!note) {
    flashStatus('请先选择一篇笔记');
    return;
  }

  if (!editorRuntime.currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  if (action === 'table') {
    getController().openTableInsertDialog();
    return;
  }

  await editorRuntime.currentEditorHost.run(action);
  await editorRuntime.currentEditorHost.focus();
}

async function handleViewMenuAction(action) {
  closeEditorMenuBar();

  switch (action) {
    case 'mode-read':
      state.view.mode = 'read';
      state.view.showSourceEditor = false;
      renderAll();
      return;
    case 'mode-edit':
      state.view.mode = 'edit';
      state.view.showSourceEditor = false;
      renderAll();
      return;
    case 'mode-focus':
      state.view.mode = 'focus';
      state.view.showSourceEditor = false;
      renderAll();
      return;
    case 'toggle-left-sidebar':
      state.view.showLeftSidebar = !state.view.showLeftSidebar;
      renderWorkspaceViewState();
      getController().renderEditorMenuBar();
      return;
    case 'toggle-right-sidebar':
      state.view.showRightSidebar = !state.view.showRightSidebar;
      renderWorkspaceViewState();
      getController().renderEditorMenuBar();
      return;
    case 'toggle-source-editor':
      if (!getCurrentNote()) {
        flashStatus('请先选择一篇笔记');
        return;
      }
      state.view.mode = 'edit';
      state.view.showSourceEditor = !state.view.showSourceEditor;
      getController().renderEditor(getCurrentNote());
      getController().renderEditorMenuBar();
      return;
    default:
      return;
  }
}

async function handleEditMenuAction(action) {
  closeEditorMenuBar();
  getController().closeEditorContextMenu();

  const note = getCurrentNote();
  if (!note) {
    flashStatus('请先选择一篇笔记');
    return;
  }

  const editorHost = editorRuntime.currentEditorHost;
  const focusEditor = async () => {
    if (editorHost) {
      await editorHost.focus();
    }
  };

  switch (action) {
    case 'cut':
    case 'copy':
    case 'delete':
    case 'select-all': {
      await focusEditor();
      const command = action === 'select-all' ? 'selectAll' : action;
      const success = document.execCommand(command);
      if (!success) {
        flashStatus('当前环境暂不支持该编辑操作');
      }
      return;
    }
    case 'undo':
    case 'redo': {
      if (!editorHost) {
        flashStatus('编辑器尚未就绪');
        return;
      }
      await editorHost.run(action);
      await focusEditor();
      return;
    }
    case 'paste': {
      await focusEditor();
      try {
        const text = await navigator.clipboard.readText();
        if (!text) {
          flashStatus('剪贴板为空');
          return;
        }

        const inserted = await editorRuntime.currentEditorHost?.pasteMarkdown(text);
        if (!inserted) {
          flashStatus('当前环境暂不支持粘贴');
        }
      } catch {
        flashStatus('无法读取剪贴板内容');
      }
      return;
    }
    case 'find': {
      getController().openEditorPanel('find');
      return;
    }
    case 'replace': {
      getController().openEditorPanel('replace');
      return;
    }
    default:
      return;
  }
}

function closeEditorMenuBar() {
  if (!state.editorMenuOpen) {
    return;
  }

  state.editorMenuOpen = null;
  getController().renderEditorMenuBar();
}

  return {
    handleFormat,
    shouldHandleEditorShortcut,
    handleResolvedEditorShortcut,
    handleParagraphMenuAction,
    handleFormatMenuAction,
    handleViewMenuAction,
    handleEditMenuAction,
    closeEditorMenuBar
  };
}
