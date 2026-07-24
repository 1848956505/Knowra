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

console.log('ok - note command mutations share API and local post-processing');
