import assert from 'node:assert/strict';
import { bindLibraryIndexEvents } from '../../lib/events/library-index-events.js';
import { createRecorderElement } from '../_support/recorder-elements.js';

function makeClosest(entries) {
  const map = new Map(entries);
  return (selector) => map.get(selector) ?? null;
}

function createHarness() {
  const elements = {
    libraryIndexView: createRecorderElement(),
    workspaceShell: createRecorderElement()
  };
  const state = {
    selectedFolderId: 'folder-1',
    search: { keyword: 'query', selectedTagIds: ['tag-1'], isOpen: true },
    libraryIndex: {
      tab: 'recent',
      page: 2,
      pageSize: 10,
      selectedNoteId: 'note-old',
      inspectorOpen: true,
      filterMenu: 'type',
      filters: { type: 'markdown-import', status: 'draft', time: 'created-asc' }
    },
    view: { screen: 'index', showRightSidebar: true }
  };
  const calls = { renderedIndex: 0, renderedAll: 0, cleared: 0, opened: [] };
  const deps = {
    selectNote: async (id, options) => { calls.opened.push({ id, options }); },
    renderLibraryIndex: () => { calls.renderedIndex += 1; },
    renderAll: () => { calls.renderedAll += 1; },
    clearSearchFilters: () => { calls.cleared += 1; },
    restoreNote: async () => {},
    handleFileMenuAction: () => {},
    persistDraft: async () => {},
    flashStatus: () => {}
  };
  bindLibraryIndexEvents({ state, elements, deps });
  return { elements, state, calls };
}

{
  const { elements, state, calls } = createHarness();
  const option = { dataset: { filterKind: 'type', filterValue: 'manual' } };
  option.closest = makeClosest([['[data-index-filter-option]', option]]);

  elements.libraryIndexView.dispatch('click', option);

  assert.equal(state.libraryIndex.filters.type, 'manual');
  assert.equal(state.libraryIndex.filterMenu, null);
  assert.equal(state.libraryIndex.selectedNoteId, null);
  assert.equal(state.libraryIndex.page, 1);
  assert.equal(calls.renderedIndex, 1);
}

{
  const { elements, state, calls } = createHarness();
  const pageSizeButton = { dataset: { indexPageSize: '5' } };
  pageSizeButton.closest = makeClosest([['[data-index-page-size]', pageSizeButton]]);

  elements.libraryIndexView.dispatch('click', pageSizeButton);

  assert.equal(state.libraryIndex.pageSize, 5);
  assert.equal(state.libraryIndex.page, 1);
  assert.equal(calls.renderedIndex, 1);
}

{
  const { elements, state, calls } = createHarness();
  const pageButton = { dataset: { indexPage: '3' } };
  pageButton.closest = makeClosest([['[data-index-page]', pageButton]]);

  elements.libraryIndexView.dispatch('click', pageButton);

  assert.equal(state.libraryIndex.page, 3);
  assert.equal(calls.renderedIndex, 1);
}

{
  const { elements, state, calls } = createHarness();
  const clearButton = { dataset: {} };
  clearButton.closest = makeClosest([['[data-index-clear]', clearButton]]);

  elements.libraryIndexView.dispatch('click', clearButton);

  assert.equal(state.libraryIndex.tab, 'all');
  assert.equal(state.selectedFolderId, null);
  assert.deepEqual(state.libraryIndex.filters, {
    type: 'all',
    status: 'all',
    time: 'updated-desc'
  });
  assert.equal(calls.cleared, 1);
}

{
  const { elements, calls } = createHarness();
  const row = { dataset: { indexNoteSelect: 'note-42' } };
  row.closest = makeClosest([['[data-index-note-select]', row]]);
  let prevented = false;

  elements.libraryIndexView.dispatch('dblclick', row, {
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.deepEqual(calls.opened, [{
    id: 'note-42',
    options: { syncFolder: true, ensureTab: true }
  }]);
}

console.log('ok - library index events apply filters, clear state and open on double click');
