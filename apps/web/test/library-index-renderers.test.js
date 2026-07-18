import assert from 'node:assert/strict';
import { renderEditorDocumentHead } from '../lib/library-index/renderers.js';

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

console.log('ok - editor document head renders the standalone editable title');
