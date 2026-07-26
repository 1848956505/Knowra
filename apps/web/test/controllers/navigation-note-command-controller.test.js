import assert from 'node:assert/strict';
import { createNavigationNoteCommandController } from '../../src/controllers/navigation/note-command-controller.js';

function createState(dataMode) {
  return {
    dataMode,
    currentSpaceId: 'space-1',
    allNotes: [{
      id: 'note-1',
      title: 'Test note',
      rawMarkdown: '',
      folderId: null,
      favorite: false,
      deleted: false
    }],
    selectedNoteId: 'note-1',
    selectedFolderId: null,
    openNoteTabs: [],
    foldersById: {},
    libraryIndex: {
      selectedNoteId: 'note-1',
      tab: 'all'
    },
    view: { screen: 'editor' },
    noteTagComposer: { draft: '' },
    draftMarkdown: '',
    draftTitle: '',
    saveState: 'saved',
    lastSavedAt: null
  };
}

{
  const state = createState('local');
  const calls = [];
  const controller = createNavigationNoteCommandController({
    state,
    knowledgeApi: {},
    getNoteById: (noteId) => (
      state.allNotes.find((note) => note.id === noteId) ?? null
    ),
    renderAll: () => calls.push('render'),
    refreshKnowledgeData: async () => calls.push('refresh'),
    loadCurrentNoteSideData: async () => calls.push('side-data'),
    syncLocalWorkspace: () => calls.push('local-sync')
  }, () => ({ openFolderBranch() {} }));

  await controller.setNoteFavorite('note-1', true);

  assert.equal(state.allNotes[0].favorite, true);
  assert.deepEqual(calls, ['local-sync']);
}

{
  const state = createState('api');
  const calls = [];
  const controller = createNavigationNoteCommandController({
    state,
    knowledgeApi: {
      setNoteFavorite: async () => calls.push('api-mutation')
    },
    getNoteById: (noteId) => (
      state.allNotes.find((note) => note.id === noteId) ?? null
    ),
    renderAll: () => calls.push('render'),
    refreshKnowledgeData: async () => calls.push('refresh'),
    loadCurrentNoteSideData: async () => calls.push('side-data'),
    syncLocalWorkspace: () => calls.push('local-sync')
  }, () => ({ openFolderBranch() {} }));

  await controller.setNoteFavorite('note-1', true);

  assert.deepEqual(calls, [
    'api-mutation',
    'refresh',
    'side-data',
    'render'
  ]);
}

{
  const state = createState('api');
  state.allNotes[0] = {
    ...state.allNotes[0],
    rawMarkdown: '',
    summary: 'Compact summary',
    contentLoaded: false
  };
  state.view.screen = 'index';
  const calls = [];
  const controller = createNavigationNoteCommandController({
    state,
    knowledgeApi: {
      getNote: async (noteId) => {
        calls.push(`detail:${noteId}`);
        return {
          ...state.allNotes[0],
          rawMarkdown: '# Full body',
          contentLoaded: true
        };
      }
    },
    getNoteById: (noteId) => (
      state.allNotes.find((note) => note.id === noteId) ?? null
    ),
    persistDraft: async () => calls.push('persist'),
    renderAll: () => calls.push('render'),
    loadCurrentNoteSideData: async () => calls.push('side-data'),
    saveCurrentEditorScrollPosition: () => calls.push('scroll'),
    flashStatus: (message) => calls.push(`flash:${message}`)
  }, () => ({ openFolderBranch() {} }));

  await controller.selectNote('note-1');

  assert.equal(state.allNotes[0].rawMarkdown, '# Full body');
  assert.equal(state.allNotes[0].contentLoaded, true);
  assert.equal(state.draftMarkdown, '# Full body');
  assert.equal(state.view.screen, 'editor');
  assert.deepEqual(calls, [
    'persist',
    'detail:note-1',
    'side-data',
    'scroll',
    'render',
    'flash:已切换到：Test note'
  ]);
}

console.log('ok - note commands share mutation flow and lazy-load full note details');
