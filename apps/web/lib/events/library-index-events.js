import { closestFromEventTarget } from '../dom/event-target.js';

export function bindLibraryIndexEvents({ state, elements, deps }) {
  let rowSelectionTimer = null;
  const openNote = async (noteId) => {
    if (!noteId) return;
    await deps.selectNote(noteId, { syncFolder: true, ensureTab: true });
  };

  elements.libraryIndexView?.addEventListener('click', (event) => {
    const filterOption = closestFromEventTarget(event.target, '[data-index-filter-option]');
    if (filterOption?.dataset.filterKind && filterOption?.dataset.filterValue) {
      const { filterKind, filterValue } = filterOption.dataset;
      state.libraryIndex.filters[filterKind] = filterValue;
      state.libraryIndex.filterMenu = null;
      state.libraryIndex.selectedNoteId = null;
      state.libraryIndex.page = 1;
      deps.renderLibraryIndex();
      return;
    }

    const filterButton = closestFromEventTarget(event.target, '[data-index-filter]');
    if (filterButton?.dataset.indexFilter) {
      const nextMenu = filterButton.dataset.indexFilter;
      state.libraryIndex.filterMenu = state.libraryIndex.filterMenu === nextMenu ? null : nextMenu;
      deps.renderLibraryIndex();
      return;
    }

    const closedFilterMenu = Boolean(
      state.libraryIndex.filterMenu
      && !closestFromEventTarget(event.target, '[data-index-filter-shell]')
    );
    if (closedFilterMenu) {
      state.libraryIndex.filterMenu = null;
    }

    const restoreButton = closestFromEventTarget(event.target, '[data-index-restore]');
    if (restoreButton?.dataset.indexRestore) {
      event.stopPropagation();
      void deps.restoreNote(restoreButton.dataset.indexRestore).then(() => deps.renderAll());
      return;
    }

    const pageSizeButton = closestFromEventTarget(event.target, '[data-index-page-size]');
    if (pageSizeButton?.dataset.indexPageSize) {
      state.libraryIndex.pageSize = Number(pageSizeButton.dataset.indexPageSize);
      state.libraryIndex.page = 1;
      state.libraryIndex.selectedNoteId = null;
      deps.renderLibraryIndex();
      return;
    }

    const pageButton = closestFromEventTarget(event.target, '[data-index-page]');
    if (pageButton?.dataset.indexPage) {
      state.libraryIndex.page = Number(pageButton.dataset.indexPage);
      state.libraryIndex.selectedNoteId = null;
      deps.renderLibraryIndex();
      return;
    }

    const openButton = closestFromEventTarget(event.target, '[data-index-open]');
    if (openButton?.dataset.indexOpen) {
      event.stopPropagation();
      void openNote(openButton.dataset.indexOpen);
      return;
    }

    const tabButton = closestFromEventTarget(event.target, '[data-index-tab]');
    if (tabButton?.dataset.indexTab) {
      state.libraryIndex.tab = tabButton.dataset.indexTab;
      state.libraryIndex.filterMenu = null;
      state.libraryIndex.selectedNoteId = null;
      state.libraryIndex.page = 1;
      state.selectedFolderId = null;
      deps.renderAll();
      return;
    }

    if (closestFromEventTarget(event.target, '[data-index-clear]')) {
      state.libraryIndex.tab = 'all';
      state.libraryIndex.filterMenu = null;
      state.libraryIndex.page = 1;
      state.libraryIndex.filters = {
        type: 'all',
        status: 'all',
        time: 'updated-desc'
      };
      state.selectedFolderId = null;
      deps.clearSearchFilters();
      return;
    }

    if (closestFromEventTarget(event.target, '[data-index-new-note]')) {
      void deps.handleFileMenuAction('new-note');
      return;
    }

    if (closestFromEventTarget(event.target, '[data-index-inspector-close]')) {
      state.libraryIndex.inspectorOpen = false;
      deps.renderLibraryIndex();
      return;
    }

    if (closestFromEventTarget(event.target, '[data-index-inspector-open]')) {
      state.libraryIndex.inspectorOpen = true;
      deps.renderLibraryIndex();
      return;
    }

    const row = closestFromEventTarget(event.target, '[data-index-note-select]');
    if (row?.dataset.indexNoteSelect) {
      globalThis.clearTimeout(rowSelectionTimer);
      rowSelectionTimer = globalThis.setTimeout(() => {
        state.libraryIndex.selectedNoteId = row.dataset.indexNoteSelect;
        state.libraryIndex.inspectorOpen = true;
        deps.renderLibraryIndex();
      }, 180);
      return;
    }

    if (closedFilterMenu) deps.renderLibraryIndex();
  });

  elements.libraryIndexView?.addEventListener('dblclick', (event) => {
    if (closestFromEventTarget(event.target, 'button, input, textarea')) return;
    const row = closestFromEventTarget(event.target, '[data-index-note-select]');
    if (row?.dataset.indexNoteSelect) {
      globalThis.clearTimeout(rowSelectionTimer);
      rowSelectionTimer = null;
      event.preventDefault();
      void openNote(row.dataset.indexNoteSelect);
    }
  });

  elements.libraryIndexView?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.libraryIndex.filterMenu) {
      state.libraryIndex.filterMenu = null;
      deps.renderLibraryIndex();
      return;
    }
    if (event.key !== 'Enter') return;
    const row = closestFromEventTarget(event.target, '[data-index-note-select]');
    if (row?.dataset.indexNoteSelect) {
      event.preventDefault();
      void openNote(row.dataset.indexNoteSelect);
    }
  });

  elements.workspaceShell?.addEventListener('click', (event) => {
    const homeButton = closestFromEventTarget(event.target, '[data-library-home]');
    if (homeButton) {
      void deps.persistDraft({ immediate: true }).finally(() => {
        state.view.screen = 'index';
        if (homeButton.dataset.libraryHome === 'global') {
          state.selectedFolderId = null;
          state.libraryIndex.tab = 'all';
          state.search.keyword = '';
          state.search.selectedTagIds = [];
          state.search.isOpen = false;
        }
        deps.renderAll();
      });
      return;
    }

    if (closestFromEventTarget(event.target, '[data-editor-aside-toggle]')) {
      state.view.showRightSidebar = !state.view.showRightSidebar;
      deps.renderAll();
      return;
    }

    const moduleButton = closestFromEventTarget(event.target, '[data-module-key]');
    if (!moduleButton?.dataset.moduleKey) return;
    if (moduleButton.dataset.moduleKey === 'knowledge') {
      state.view.screen = 'index';
      deps.renderAll();
      return;
    }
    deps.flashStatus('该模块将在后续版本接入，当前保留入口');
  });
}
