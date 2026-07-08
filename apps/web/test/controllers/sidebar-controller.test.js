import assert from 'node:assert/strict';
import { createSidebarController } from '../../src/controllers/sidebar-controller.js';

function createDeps(overrides = {}) {
  const state = {
    dataMode: 'api',
    selectedNoteId: 'note-1',
    currentSpaceId: 'space-1',
    allNotes: [{
      id: 'note-1',
      title: 'Test',
      folderId: 'folder-1',
      rawMarkdown: '![diagram](/api/storage/attachments/attachment-1/content)'
    }],
    foldersById: {},
    noteTagComposer: { draft: '', isExpanded: false },
    tags: [],
    linkedNotes: [],
    attachments: [
      { id: 'attachment-1', noteId: 'note-1', fileName: 'diagram.png', mimeType: 'image/png' },
      { id: 'attachment-2', noteId: 'note-1', fileName: 'draft.md', mimeType: 'text/markdown' }
    ],
    knowledgePoints: [],
    allKnowledgePoints: [],
    knowledgePointTagGroups: [],
    knowledgePointFilters: { query: '', tagIds: [], isOpen: false },
    knowledgePointAttachComposer: { query: '', isOpen: false },
    expandedKnowledgePointIds: {},
    knowledgePointEditing: null,
    outlineCollapsedHeadingIdsByNote: {},
    asideTab: 'info',
    draftMarkdown: '![diagram](/api/storage/attachments/attachment-1/content)'
  };

  const flashes = [];
  const deletedIds = [];
  const deps = {
    state,
    elements: {},
    knowledgeApi: {
      deleteAttachment: async (attachmentId) => {
        deletedIds.push(attachmentId);
      },
      loadNoteSideData: async () => ({})
    },
    getCurrentNote: () => state.allNotes[0],
    syncKnowledgePointMarkers: () => {},
    flashStatus: (message) => {
      flashes.push(message);
    },
    formatDate: (value) => value,
    ...overrides
  };

  return { state, flashes, deletedIds, deps };
}

{
  const { state, flashes, deletedIds, deps } = createDeps();
  const controller = createSidebarController(deps);
  const result = await controller.deleteAttachment('attachment-1');

  assert.equal(result, false);
  assert.deepEqual(deletedIds, []);
  assert.equal(state.attachments.length, 2);
  assert.equal(flashes.at(-1), '当前附件仍在正文中被引用，请先删除正文引用');
}

{
  const { state, flashes, deletedIds, deps } = createDeps({
    getCurrentNote: () => ({
      id: 'note-1',
      title: 'Test',
      folderId: 'folder-1',
      rawMarkdown: ''
    })
  });
  state.draftMarkdown = '';
  const controller = createSidebarController(deps);
  const result = await controller.deleteAttachment('attachment-2');

  assert.equal(result, true);
  assert.deepEqual(deletedIds, ['attachment-2']);
  assert.deepEqual(state.attachments.map((attachment) => attachment.id), ['attachment-1']);
  assert.equal(flashes.at(-1), '附件已删除');
}

console.log('sidebar-controller attachment deletion safeguards passed');
