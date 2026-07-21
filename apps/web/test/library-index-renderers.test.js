import assert from 'node:assert/strict';
import {
  renderEditorDocumentHead,
  renderLibraryIndexInspector
} from '../lib/library-index/renderers.js';

const html = renderEditorDocumentHead({
  note: {
    id: 'note-a',
    title: 'Saved title',
    folderId: null,
    status: 'draft',
    tagIds: [],
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T11:00:00.000Z'
  },
  state: {
    draftTitle: 'Editable title',
    tags: [],
    foldersById: {},
    allNotes: [{ id: 'note-a', deleted: false, updatedAt: '2026-07-17T11:00:00.000Z' }]
  }
});

assert.match(html, /data-document-title-input/);
assert.match(html, /value="Editable title"/);
assert.doesNotMatch(html, /<h1>Saved title<\/h1>/);

const inspectorHtml = renderLibraryIndexInspector({
  note: {
    id: 'note-a',
    title: 'Current title',
    folderId: null,
    status: 'draft',
    tagIds: [],
    internalLinks: [],
    rawMarkdown: '# Current title',
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T11:00:00.000Z',
    deleted: false,
    favorite: false
  },
  state: {
    libraryIndex: { inspectorOpen: true },
    tags: [],
    foldersById: {},
    allNotes: [{ id: 'note-a', deleted: false, updatedAt: '2026-07-17T11:00:00.000Z' }],
    selectedNoteId: 'note-a',
    attachments: []
  }
});

assert.match(inspectorHtml, /class="inspector-heading"/);
assert.match(inspectorHtml, /class="inspector-open-button"[^>]*data-index-open="note-a"/);
assert.match(inspectorHtml, /class="inspector-open-icon"/);
assert.doesNotMatch(inspectorHtml, /primary-button inspector-action/);
assert.doesNotMatch(inspectorHtml, /MARKDOWN DOCUMENT/);

console.log('ok - editor document head and inspector render their separated title entry points');
