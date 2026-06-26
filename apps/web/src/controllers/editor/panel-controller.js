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

export function createEditorPanelController(deps, getController) {
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

function openEditorPanel(mode) {
  state.editorPanel = createOpenedEditorPanelState(state.editorPanel, mode);
  getController().closeEditorMenuBar();
  renderEditorPanel();
}

function closeEditorPanel() {
  if (!state.editorPanel.open) {
    return;
  }

  state.editorPanel.open = false;
  void editorRuntime.currentEditorHost?.clearSearchHighlights();
  renderEditorPanel();
}

async function handleEditorPanelAction(action) {
  const note = getCurrentNote();
  if (!note) {
    closeEditorPanel();
    flashStatus('请先选择一篇笔记');
    return;
  }

  if (action === 'close') {
    closeEditorPanel();
    return;
  }

  const query = state.editorPanel.query.trim();
  if (!query) {
    flashStatus('请输入查找内容');
    return;
  }

  const editorHost = editorRuntime.currentEditorHost;

  if (action === 'submit' || action === 'submit-previous') {
    if (state.editorPanel.mode === 'find') {
      const direction = action === 'submit-previous' ? 'previous' : 'next';
      const result = await editorHost?.findAndSelect(query, state.editorPanel.matchIndex, direction);
      if (!result) {
        flashStatus('当前编辑器未就绪');
        return;
      }

      state.editorPanel = applyEditorPanelMatchResult(state.editorPanel, result);
      renderEditorPanel();

      if (!result.found) {
        flashStatus(`未找到：${query}`);
        return;
      }
      flashStatus(`已查找 ${result.index + 1}/${result.count}：${query}`);
      return;
    }

    if (state.editorPanel.mode === 'replace') {
      const replacement = state.editorPanel.replacement;
      const nextMarkdown = state.draftMarkdown.replace(query, replacement);
      if (nextMarkdown === state.draftMarkdown) {
        flashStatus(`未找到：${query}`);
        return;
      }

      state.draftMarkdown = nextMarkdown;
      if (editorHost) {
        await editorHost.setMarkdown(nextMarkdown);
        await editorHost.focus();
      }
      getController().scheduleAutosave();
      flashStatus(`宸叉浛鎹細${query}`);
      renderEditorPanel();
      return;
    }
  }

  if (action === 'replace-all' && state.editorPanel.mode === 'replace') {
    const replacement = state.editorPanel.replacement;
    if (!state.draftMarkdown.includes(query)) {
      flashStatus(`未找到：${query}`);
      return;
    }

    const nextMarkdown = state.draftMarkdown.split(query).join(replacement);
    state.draftMarkdown = nextMarkdown;
    if (editorHost) {
      await editorHost.setMarkdown(nextMarkdown);
      await editorHost.focus();
    }
    getController().scheduleAutosave();
    flashStatus(`宸插叏閮ㄦ浛鎹細${query}`);
    renderEditorPanel();
  }
}

function renderEditorPanel() {
  const panel = document.getElementById('editor-utility-panel');
  if (!panel) {
    return;
  }

  const note = getCurrentNote();
  if (!state.editorPanel.open || !note) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.dataset.mode = state.editorPanel.mode;
  panel.innerHTML = renderEditorPanelMarkup(state.editorPanel);

  if (state.editorPanel.autoFocusInput) {
    window.requestAnimationFrame(() => {
      const input = panel.querySelector('[data-panel-field="query"]');
      input?.focus();
      input?.select();
      state.editorPanel.autoFocusInput = false;
    });
  }
}

function openTableInsertDialog({ rows = '4', cols = '3' } = {}) {
  state.editorTableDialog.open = true;
  state.editorTableDialog.rows = String(rows);
  state.editorTableDialog.cols = String(cols);
  state.editorTableDialog.autoFocusInput = true;
  getController().closeEditorMenuBar();
  getController().closeEditorContextMenu();
  renderTableInsertDialog();
}

function closeTableInsertDialog() {
  if (!state.editorTableDialog.open) {
    return;
  }

  state.editorTableDialog.open = false;
  state.editorTableDialog.autoFocusInput = false;
  renderTableInsertDialog();
}

async function submitTableInsertDialog() {
  if (!editorRuntime.currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  const row = normalizeTableDialogValue(state.editorTableDialog.rows, 4);
  const col = normalizeTableDialogValue(state.editorTableDialog.cols, 3);
  state.editorTableDialog.rows = String(row);
  state.editorTableDialog.cols = String(col);

  await editorRuntime.currentEditorHost.run('table', { row, col });
  closeTableInsertDialog();
  await editorRuntime.currentEditorHost.focus();
}

function renderTableInsertDialog() {
  const dialog = document.getElementById('editor-table-dialog');
  if (!dialog) {
    return;
  }

  const note = getCurrentNote();
  if (!state.editorTableDialog.open || !note || state.view.showSourceEditor) {
    dialog.hidden = true;
    dialog.innerHTML = '';
    return;
  }

  dialog.hidden = false;
  dialog.innerHTML = renderTableInsertDialogMarkup(state.editorTableDialog);

  if (state.editorTableDialog.autoFocusInput) {
    window.requestAnimationFrame(() => {
      const input = dialog.querySelector('[data-table-dialog-field="cols"]');
      input?.focus();
      input?.select();
      state.editorTableDialog.autoFocusInput = false;
    });
  }
}

  return {
    openEditorPanel,
    closeEditorPanel,
    handleEditorPanelAction,
    renderEditorPanel,
    openTableInsertDialog,
    closeTableInsertDialog,
    submitTableInsertDialog,
    renderTableInsertDialog
  };
}
