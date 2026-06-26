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

export function createEditorFileController(deps, getController) {
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

async function handleFileMenuAction(action) {
  getController().closeEditorMenuBar();

  const note = getCurrentNote();
  const folderId = getMenuTargetFolderId();

  switch (action) {
    case 'new-note': {
      const title = createUntitledName(getSiblingNames(folderId), 'Untitled Note');
      await createNote(folderId, title);
      flashStatus(`已创建笔记：${title}`);
      return;
    }
    case 'new-folder': {
      const title = createUntitledName(getSiblingNames(folderId), 'Untitled Folder');
      startTreeEditor({ mode: 'create-folder', parentId: folderId, value: title });
      return;
    }
    case 'import-markdown':
      elements.markdownImportInput?.click();
      return;
    case 'favorite-note':
      if (note && !note.deleted) {
        const nextFavorite = !note.favorite;
        await setNoteFavorite(note.id, nextFavorite);
        flashStatus(nextFavorite ? '已收藏笔记' : '已取消收藏');
      }
      return;
    case 'delete-note':
      if (note && !note.deleted) {
        await deleteNote(note.id);
        flashStatus('笔记已删除');
      }
      return;
    case 'restore-note':
      if (note?.deleted) {
        await restoreNote(note.id);
        flashStatus('笔记已恢复');
      }
      return;
    case 'save':
      await getController().persistDraft({ immediate: true });
      return;
    case 'save-as':
      await duplicateCurrentNote(note);
      return;
    case 'rename':
      if (note) {
        startTreeEditor({ mode: 'rename-note', targetId: note.id, value: note.title });
      }
      return;
    case 'export-markdown':
      exportCurrentNoteAsMarkdown(note);
      return;
    case 'export-pdf':
      exportCurrentNoteAsPdfStable(note);
      return;
    default:
      return;
  }
}

async function importMarkdownFiles(files) {
  const folderId = getMenuTargetFolderId();
  const importedItems = await buildMarkdownImportItems(files);

  if (state.dataMode === 'api') {
    const importedResponseItems = await knowledgeApi.importMarkdownNotes(importedItems.map((item) => ({
      title: item.title,
      rawMarkdown: item.rawMarkdown,
      folderId,
      spaceId: state.currentSpaceId,
      sourceType: item.sourceType
    })));
    const firstImported = importedResponseItems.find((item) => item?.id) ?? null;

    if (firstImported?.id) {
      state.selectedNoteId = firstImported.id;
      state.selectedFolderId = firstImported.folderId ?? folderId ?? null;
      state.openNoteTabs = ensureOpenTab(state.openNoteTabs, firstImported.id);
      if (state.selectedFolderId) {
        openFolderBranch(state.selectedFolderId);
      }
    }

    await refreshKnowledgeData();

    if (firstImported?.id) {
      await loadCurrentNoteSideData();
      renderAll();
    } else {
      await loadCurrentNoteSideData();
      renderAll();
    }

    flashStatus(getMarkdownImportStatusMessage(importedItems, firstImported));
    return;
  }

  state.allNotes = importedItems.reduce((notes, item) => insertLocalNote(notes, createLocalImportedNoteInput({
    item,
    folderId,
    spaceId: state.currentSpaceId
  })), state.allNotes);
  state.selectedNoteId = importedItems[0]?.id ?? state.selectedNoteId;
  state.selectedFolderId = folderId ?? null;
  state.openNoteTabs = importedItems.reduce(
    (tabs, item) => ensureOpenTab(tabs, item.id),
    state.openNoteTabs
  );
  if (state.selectedFolderId) {
    openFolderBranch(state.selectedFolderId);
  }
  syncLocalWorkspace();

  flashStatus(getMarkdownImportStatusMessage(importedItems));
}

function getMenuTargetFolderId() {
  if (state.selectedFolderId) {
    return state.selectedFolderId;
  }

  return getCurrentNote()?.folderId ?? null;
}

function getSiblingNames(folderId) {
  return getSiblingNamesForFolder({
    folderId,
    foldersById: state.foldersById,
    folderTree: state.folderTree,
    notes: state.allNotes
  });
}

async function duplicateCurrentNote(note) {
  if (!note) {
    return;
  }

  await getController().persistDraft({ immediate: true });
  const refreshedNote = getCurrentNote() ?? note;
  const nextTitle = createDuplicateTitle(getSiblingNames(refreshedNote.folderId ?? null), refreshedNote.title);

  if (state.dataMode === 'api') {
    const created = await knowledgeApi.createNote({
      title: nextTitle,
      rawMarkdown: state.draftMarkdown || refreshedNote.rawMarkdown,
      folderId: refreshedNote.folderId ?? null,
      spaceId: state.currentSpaceId,
      sourceType: refreshedNote.sourceType ?? 'manual',
      status: refreshedNote.status ?? 'draft'
    });

    state.selectedNoteId = created.id;
    state.openNoteTabs = ensureOpenTab(state.openNoteTabs, created.id);
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    flashStatus(`已另存为：${nextTitle}`);
    return;
  }

  const nextNote = createLocalDuplicateNoteInput({
    note: refreshedNote,
    title: nextTitle,
    markdown: state.draftMarkdown || refreshedNote.rawMarkdown
  });

  state.allNotes = insertLocalNote(state.allNotes, nextNote);
  state.selectedNoteId = nextNote.id;
  state.openNoteTabs = ensureOpenTab(state.openNoteTabs, nextNote.id);
  syncLocalWorkspace();
  flashStatus(`已另存为：${nextTitle}`);
}

function exportCurrentNoteAsMarkdown(note) {
  if (!note) {
    return;
  }

  const fileName = buildExportFileName(note.title, 'md');
  triggerFileDownload(fileName, state.draftMarkdown || note.rawMarkdown, 'text/markdown;charset=utf-8');
  flashStatus(`宸插鍑猴細${fileName}`);
}

function exportCurrentNoteAsPdf(note) {
  if (!note) {
    return;
  }

  const editorBody = document.querySelector('#milkdown-editor .ProseMirror');
  const previewHtml = editorBody?.innerHTML ?? `<pre>${escapeHtml(state.draftMarkdown || note.rawMarkdown)}</pre>`;
  const previewFileName = buildExportFileName(note.title, 'pdf');
  const printableHtml = buildNoteExportHtml({
    title: previewFileName,
    previewHtml,
    print: true,
    delayedPrint: true
  });
  const exportBlob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
  const exportUrl = URL.createObjectURL(exportBlob);
  const exportWindow = window.open(exportUrl, '_blank');

  if (!exportWindow) {
    flashStatus('导出 PDF 失败：浏览器拦截了弹窗');
    return;
  }

  const fileName = buildExportFileName(note.title, 'pdf');
  exportWindow.document.write(buildNoteExportHtml({
    title: fileName,
    previewHtml,
    print: true
  }));
  exportWindow.document.close();
  flashStatus(`已准备导出：${fileName}`);
}

function exportCurrentNoteAsPdfStable(note) {
  if (!note) {
    return;
  }

  const editorBody = document.querySelector('#milkdown-editor .ProseMirror');
  const previewHtml = editorBody?.innerHTML ?? `<pre>${escapeHtml(state.draftMarkdown || note.rawMarkdown)}</pre>`;
  const exportName = buildExportFileName(note.title, 'html');
  const styledHtml = buildNoteExportHtml({
    title: exportName,
    previewHtml,
    rich: true
  });
  triggerFileDownload(exportName, styledHtml, 'text/html;charset=utf-8');
  flashStatus(`已导出：${exportName}`);
}

function triggerFileDownload(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

  return {
    handleFileMenuAction,
    importMarkdownFiles,
    getMenuTargetFolderId,
    getSiblingNames,
    duplicateCurrentNote,
    exportCurrentNoteAsMarkdown,
    exportCurrentNoteAsPdf,
    exportCurrentNoteAsPdfStable,
    triggerFileDownload
  };
}
