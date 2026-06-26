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

export function createEditorDraftController(deps, getController) {
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

function scheduleAutosave() {
  if (!getCurrentNote()) {
    return;
  }

  state.saveState = 'pending';
  getController().renderEditorSaveIndicator();
  renderStatus();

  if (editorRuntime.autosaveTimer) {
    clearTimeout(editorRuntime.autosaveTimer);
  }

  editorRuntime.autosaveTimer = setTimeout(() => {
    editorRuntime.autosaveTimer = null;
    void persistDraft();
  }, autosaveDelayMs);
}

async function persistDraft({ immediate = false } = {}) {
  const note = getCurrentNote();
  if (!note) {
    return;
  }

  if (editorRuntime.autosaveTimer) {
    clearTimeout(editorRuntime.autosaveTimer);
    editorRuntime.autosaveTimer = null;
  }

  const draftSave = resolveDraftSaveState({
    note,
    markdown: state.draftMarkdown,
    deriveTitle: deriveNoteTitleFromMarkdown
  });
  if (!draftSave.changed) {
    state.saveState = 'saved';
    getController().renderEditorSaveIndicator();
    renderStatus();
    return;
  }

  state.saveState = 'saving';
  getController().renderEditorSaveIndicator();
  renderStatus();

  try {
    let updatedNote;

    if (state.dataMode === 'api') {
      updatedNote = await knowledgeApi.updateNote(note.id, {
        title: draftSave.nextTitle,
        rawMarkdown: draftSave.nextMarkdown
      });
    } else {
      updatedNote = createLocalDraftNote({
        note,
        title: draftSave.nextTitle,
        markdown: draftSave.nextMarkdown
      });
    }

    state.allNotes = replaceNoteInCollection(state.allNotes, updatedNote, {
      title: draftSave.nextTitle,
      rawMarkdown: draftSave.nextMarkdown
    });
    state.saveState = 'saved';
    state.lastSavedAt = updatedNote.updatedAt ?? new Date().toISOString();

    renderFolders();
    renderSidebar(getCurrentNote());
    getController().renderEditorSaveIndicator();
    renderStatus();
    persistBackendCache();

    if (immediate) {
      flashStatus('已保存当前笔记');
    }
  } catch (error) {
    state.saveState = 'error';
    getController().renderEditorSaveIndicator();
    renderStatus();
    flashStatus(error.message || '保存失败');
  }
}

  return {
    scheduleAutosave,
    persistDraft
  };
}
