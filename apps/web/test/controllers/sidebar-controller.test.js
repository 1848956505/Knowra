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

{
  const target = {
    getBoundingClientRect() {
      return { top: 410 };
    }
  };
  const root = {
    scrollTop: 20,
    scrollHeight: 1000,
    clientHeight: 400,
    getBoundingClientRect() {
      return { top: 100 };
    }
  };
  const cancelCalls = [];
  const { state, deps } = createDeps({
    elements: {
      editorContent: {
        querySelector: (selector) => selector === '#intro' ? target : null,
        querySelectorAll: () => ({ item: () => null })
      }
    },
    getEditorScrollRoot: () => root,
    cancelPendingEditorScrollRestore: (noteId) => cancelCalls.push(noteId)
  });
  const controller = createSidebarController(deps);

  assert.equal(controller.jumpToOutlineHeading('intro', 0), true);
  assert.equal(root.scrollTop, 330);
  assert.deepEqual(cancelCalls, ['note-1']);
  assert.equal(controller.jumpToOutlineHeading('missing', 0), false);
  assert.equal(deps.elements.editorContent.querySelectorAll('h1, h2, h3, h4').item(0), null);
}

{
  const target = {
    scrollIntoViewCalls: [],
    scrollIntoView(options) {
      this.scrollIntoViewCalls.push(options);
    }
  };
  const { state, deps } = createDeps({
    elements: {
      editorContent: {
        querySelector: () => null,
        querySelectorAll: () => ({ item: (index) => index === 1 ? target : null })
      },
      asideTabs: { innerHTML: '' },
      asideContent: { innerHTML: '' }
    }
  });
  state.asideTab = 'outline';
  state.draftMarkdown = '# Intro\n## Child\n# Sibling';
  const controller = createSidebarController(deps);

  assert.equal(controller.jumpToOutlineHeading('child', 1), true);
  assert.equal(target.scrollIntoViewCalls.length, 1);
  assert.equal(controller.toggleOutlineHeading('note-1', 'intro'), true);
  assert.deepEqual(state.outlineCollapsedHeadingIdsByNote, { 'note-1': { intro: true } });
  assert.doesNotMatch(deps.elements.asideContent.innerHTML, /data-outline-id="child"/);
  assert.equal(controller.toggleOutlineHeading('note-1', 'intro'), true);
  assert.deepEqual(state.outlineCollapsedHeadingIdsByNote, {});
}

console.log('sidebar-controller attachment deletion safeguards passed');
