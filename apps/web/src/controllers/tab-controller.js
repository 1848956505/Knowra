import {
  buildNoteTabPath,
  closeOtherTabs,
  closeTab
} from '../../lib/editor/tab-workspace.js';
import {
  renderEmptyNoteTabs,
  renderNoteTabs as renderNoteTabsMarkup
} from '../../lib/editor/tab-renderers.js';
import { renderNoteTabMenuItems } from '../../lib/editor/tab-menu-renderers.js';
import { writeClipboardText } from '../../lib/browser/clipboard.js';

export function createTabController(deps) {
  const {
    state,
    elements,
    closeContextMenu,
    closeSectionMenu,
    flashStatus,
    persistBackendCache,
    persistDraft,
    renderAll,
    selectNote
  } = deps;

function renderTabs() {
  if (!elements.noteTabs) {
    return;
  }

  const openNotes = state.openNoteTabs
    .map((noteId) => state.allNotes.find((note) => note.id === noteId))
    .filter(Boolean);

  if (openNotes.length === 0) {
    elements.noteTabs.innerHTML = renderEmptyNoteTabs();
    renderTabMenu();
    return;
  }

  elements.noteTabs.innerHTML = renderNoteTabsMarkup({
    notes: openNotes,
    selectedNoteId: state.selectedNoteId,
    saveState: state.saveState,
    tabDragState: state.tabDragState,
    foldersById: state.foldersById,
    buildNoteTabPath
  });

  renderTabMenu();
  syncTabDragIndicators();
  persistBackendCache();
}

function renderTabMenu() {
  if (!elements.noteTabMenu) {
    return;
  }

  if (!state.tabMenu.open || !state.tabMenu.noteId) {
    elements.noteTabMenu.hidden = true;
    elements.noteTabMenu.innerHTML = '';
    return;
  }

  elements.noteTabMenu.hidden = false;
  elements.noteTabMenu.style.left = `${state.tabMenu.x}px`;
  elements.noteTabMenu.style.top = `${state.tabMenu.y}px`;
  elements.noteTabMenu.innerHTML = renderNoteTabMenuItems();
}

function openTabMenu({ x, y, noteId }) {
  closeContextMenu();
  closeSectionMenu();
  state.tabMenu = {
    open: true,
    x,
    y,
    noteId
  };
  renderTabMenu();
}

function closeTabMenu() {
  if (!state.tabMenu.open) {
    return;
  }

  state.tabMenu = {
    open: false,
    x: 0,
    y: 0,
    noteId: null
  };
  renderTabMenu();
}

async function handleTabMenuAction(action) {
  const noteId = state.tabMenu.noteId;
  closeTabMenu();

  if (!noteId) {
    return;
  }

  if (action === 'close') {
    await handleTabClose(noteId);
    return;
  }

  if (action === 'close-others') {
    state.openNoteTabs = closeOtherTabs(state.openNoteTabs, noteId).openTabs;
    if (state.selectedNoteId !== noteId) {
      await selectNote(noteId, { syncFolder: true, ensureTab: true });
      return;
    }
    renderTabs();
    return;
  }

  if (action === 'copy-path') {
    const note = state.allNotes.find((item) => item.id === noteId);
    const notePath = buildNoteTabPath(note, state.foldersById);
    if (!notePath) {
      flashStatus('未找到笔记路径');
      return;
    }

    const copied = await writeClipboardText(notePath);
    if (copied) {
      flashStatus('已复制笔记路径');
      return;
    }

    flashStatus('无法写入剪贴板，请检查浏览器权限');
  }
}

async function handleTabClose(noteId) {
  const { openTabs, nextActiveId } = closeTab(state.openNoteTabs, noteId, state.selectedNoteId);
  state.openNoteTabs = openTabs;

  if (state.selectedNoteId !== noteId) {
    renderTabs();
    return;
  }

  if (!nextActiveId) {
    await persistDraft({ immediate: true });
    state.selectedNoteId = null;
    state.draftMarkdown = '';
    state.linkedNotes = [];
    state.attachments = [];
    renderAll();
    return;
  }

  await selectNote(nextActiveId, { syncFolder: true, ensureTab: false });
}

function resetTabDragState({ rerender = true } = {}) {
  if (!state.tabDragState.activeId && !state.tabDragState.overId) {
    return;
  }

  state.tabDragState = {
    activeId: null,
    overId: null
  };

  if (rerender) {
    renderTabs();
    return;
  }

  syncTabDragIndicators();
}

function syncTabDragIndicators() {
  if (!elements.noteTabs) {
    return;
  }

  elements.noteTabs.querySelectorAll('[data-tab-note-id]').forEach((node) => {
    const noteId = node.dataset.tabNoteId;
    node.dataset.dragging = String(state.tabDragState.activeId === noteId);
    node.dataset.dropTarget = String(state.tabDragState.overId === noteId);
  });
}

  return {
    renderTabs,
    renderTabMenu,
    openTabMenu,
    closeTabMenu,
    handleTabMenuAction,
    handleTabClose,
    resetTabDragState,
    syncTabDragIndicators
  };
}
