import assert from 'node:assert/strict';
import { renderEditorDocumentHead } from '../lib/editor/document-head-renderer.js';
import {
  renderLibraryIndexContent,
  renderLibraryIndexInspector,
  renderLibraryIndexScope
} from '../lib/library-index/renderers.js';

const scopeHtml = renderLibraryIndexScope({
  notes: [
    { updatedAt: '2026-07-17T11:00:00' },
    { updatedAt: '2026-07-16T10:00:00' }
  ],
  state: {
    selectedFolderId: 'folder-test',
    foldersById: {
      'folder-test': { id: 'folder-test', name: '研究方法', parentId: null },
      'folder-child': { id: 'folder-child', name: '阅读', parentId: 'folder-test' }
    },
    libraryIndex: { tab: 'all' }
  }
});

assert.match(scopeHtml, /<span>浏览范围<\/span>/);
assert.match(scopeHtml, /<strong title="研究方法">研究方法<\/strong>/);
assert.match(scopeHtml, /<b>资料 2<\/b><b>文件夹 2<\/b>/);
assert.match(scopeHtml, /最近更新 2026\.07\.17 11:00/);

const html = renderEditorDocumentHead({
  note: {
    id: 'note-a',
    title: 'Saved title',
    folderId: 'folder-test',
    status: 'draft',
    tagIds: [],
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T11:00:00.000Z'
  },
  state: {
    draftTitle: 'Editable title',
    tags: [],
    foldersById: {
      'folder-test': { id: 'folder-test', name: 'test', parentId: null }
    },
    allNotes: [{ id: 'note-a', deleted: false, updatedAt: '2026-07-17T11:00:00.000Z' }]
  }
});

assert.match(html, /data-document-title-input/);
assert.match(html, /value="Editable title"/);
assert.doesNotMatch(html, /<h1>Saved title<\/h1>/);
assert.match(html, /class="breadcrumb">资料库　\/　test　\/　Editable title<\/span>/);
assert.doesNotMatch(html, /资料库　\/　资料/);
assert.doesNotMatch(html, /class="document-id"|>001</);
assert.match(html, /class="document-title-row">[\s\S]*class="document-title-input"/);

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
assert.match(inspectorHtml, /class="inspector-heading-copy"/);
assert.match(inspectorHtml, /class="inspector-heading-icon" src="\/styles\/icons\/phosphor-book-open-text-duotone\.svg"/);
assert.match(inspectorHtml, /<small>资料预览<\/small>/);
assert.match(inspectorHtml, /class="inspector-heading-title"[^>]*>Current title<\/strong>/);
assert.match(inspectorHtml, /class="inspector-open-button"[^>]*data-index-open="note-a"/);
assert.match(inspectorHtml, /class="inspector-open-icon" src="\/styles\/icons\/phosphor-arrow-square-out-bold\.svg"/);
assert.match(inspectorHtml, /<span>打开<\/span>/);
assert.doesNotMatch(inspectorHtml, /<svg class="inspector-open-icon"/);
assert.doesNotMatch(inspectorHtml, /primary-button inspector-action/);
assert.doesNotMatch(inspectorHtml, /MARKDOWN DOCUMENT/);
assert.doesNotMatch(inspectorHtml, /<dt>标题<\/dt>/);

const indexHtml = renderLibraryIndexContent({
  notes: [{
    id: 'note-a',
    title: 'Current title',
    status: 'draft',
    sourceType: 'manual',
    tagIds: ['tag-a'],
    rawMarkdown: '# Current title',
    updatedAt: '2026-07-17T11:00:00.000Z',
    deleted: false
  }],
  pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, startIndex: 0 },
  state: {
    libraryIndex: { selectedNoteId: 'note-a' },
    tags: [{ id: 'tag-a', name: '方法' }]
  }
});

assert.match(indexHtml, /class="entry-archive" role="img" aria-label="书籍封面"/);
assert.match(indexHtml, /class="entry-book-cover" src="\/styles\/icons\/phosphor-book-bookmark-duotone\.svg"/);
assert.doesNotMatch(indexHtml, /ARCHIVE|entry-archive-number/);
assert.match(indexHtml, /data-selected="true"/);
assert.match(indexHtml, /<div class="tag-row"><span>方法<\/span><\/div>/);
assert.match(indexHtml, /aria-label="打开资料：Current title"/);
assert.match(indexHtml, /class="entry-action-icon" src="\/styles\/icons\/phosphor-arrow-square-out-bold\.svg"/);

console.log('ok - editor document head and inspector render their separated title entry points');
