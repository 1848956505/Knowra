import assert from 'node:assert/strict';
import { createKnowledgeApi } from '../src/services/knowledge-api.js';

async function runTest(name, callback) {
  try {
    await callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await runTest('knowledge api loads workspace resources for a space', async () => {
  const calls = [];
  const api = createKnowledgeApi({
    requestJson: async (url) => {
      calls.push(url);
      if (url.startsWith('/api/knowledge/folders/tree')) return { data: [{ id: 'folder-1' }] };
      if (url.startsWith('/api/knowledge/notes')) return { data: [{ id: 'note-1' }] };
      if (url.startsWith('/api/knowledge/tags')) return { data: [{ id: 'tag-1' }] };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  const result = await api.loadWorkspaceResources('space 1');

  assert.deepEqual(result.folderTree, [{ id: 'folder-1' }]);
  assert.deepEqual(result.notes, [{ id: 'note-1' }]);
  assert.deepEqual(result.tags, [{ id: 'tag-1' }]);
  assert.deepEqual(calls, [
    '/api/knowledge/folders/tree?spaceId=space%201',
    '/api/knowledge/notes?spaceId=space%201&includeDeleted=true',
    '/api/knowledge/tags?spaceId=space%201'
  ]);
});

await runTest('knowledge api loads note side data for a note and space', async () => {
  const calls = [];
  const api = createKnowledgeApi({
    requestJson: async (url) => {
      calls.push(url);
      if (url.endsWith('/links')) return { data: [{ id: 'linked-note' }] };
      if (url.startsWith('/api/storage/attachments')) return { data: [{ id: 'attachment-1' }] };
      if (url.includes('noteId=')) return { data: [{ id: 'current-point' }] };
      if (url.startsWith('/api/knowledge/knowledge-point-tag-groups')) return { data: [{ id: 'group-1' }] };
      if (url.startsWith('/api/knowledge/knowledge-points')) return { data: [{ id: 'point-1' }] };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  const result = await api.loadNoteSideData({
    noteId: 'note 1',
    spaceId: 'space 1'
  });

  assert.deepEqual(result.linkedNotes, [{ id: 'linked-note' }]);
  assert.deepEqual(result.attachments, [{ id: 'attachment-1' }]);
  assert.deepEqual(result.knowledgePoints, [{ id: 'current-point' }]);
  assert.deepEqual(result.allKnowledgePoints, [{ id: 'point-1' }]);
  assert.deepEqual(result.knowledgePointTagGroups, [{ id: 'group-1' }]);
  assert.deepEqual(calls, [
    '/api/knowledge/notes/note%201/links',
    '/api/storage/attachments?noteId=note%201',
    '/api/knowledge/knowledge-points?spaceId=space%201&noteId=note%201',
    '/api/knowledge/knowledge-points?spaceId=space%201',
    '/api/knowledge/knowledge-point-tag-groups?spaceId=space%201'
  ]);
});

await runTest('knowledge api sends knowledge point mutations through stable endpoints', async () => {
  const calls = [];
  const api = createKnowledgeApi({
    requestJson: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method ?? 'GET',
        body: options.body ? JSON.parse(options.body) : null
      });
      return { data: { id: 'response-point' } };
    }
  });

  await api.createKnowledgePoint({ id: 'point 1', title: 'Point' });
  await api.addSourceToKnowledgePoint('point 1', { id: 'source 1' });
  await api.deleteKnowledgePointSource('source 1');
  await api.deleteKnowledgePoint('point 1');
  await api.updateKnowledgePoint('point 1', { title: 'Updated' });

  assert.deepEqual(calls, [
    {
      url: '/api/knowledge/knowledge-points',
      method: 'POST',
      body: { id: 'point 1', title: 'Point' }
    },
    {
      url: '/api/knowledge/knowledge-points/point%201/sources',
      method: 'POST',
      body: { id: 'source 1' }
    },
    {
      url: '/api/knowledge/knowledge-point-sources/source%201',
      method: 'DELETE',
      body: null
    },
    {
      url: '/api/knowledge/knowledge-points/point%201',
      method: 'DELETE',
      body: null
    },
    {
      url: '/api/knowledge/knowledge-points/point%201',
      method: 'PATCH',
      body: { title: 'Updated' }
    }
  ]);
});

await runTest('knowledge api sends workspace folder note and tag mutations through stable endpoints', async () => {
  const calls = [];
  const api = createKnowledgeApi({
    requestJson: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method ?? 'GET',
        body: options.body ? JSON.parse(options.body) : null
      });
      return { data: { id: 'response-item' } };
    }
  });

  await api.listKnowledgeSpaces();
  await api.createDefaultKnowledgeSpace({ userId: 'demo' });
  await api.createFolder({ spaceId: 'space 1', parentId: null, name: 'Folder' });
  await api.updateFolder('folder 1', { name: 'Renamed', parentId: null });
  await api.deleteFolder('folder 1');
  await api.createNote({ title: 'Note', spaceId: 'space 1' });
  await api.updateNote('note 1', { title: 'Renamed' });
  await api.deleteNote('note 1');
  await api.permanentlyDeleteNote('note 1');
  await api.restoreNote('note 1');
  await api.emptyRecycleBin('space 1');
  await api.setNoteFavorite('note 1', true);
  await api.setNoteTags('note 1', ['tag 1']);
  await api.removeTagFromNote('note 1', 'tag 1');
  await api.createTag({ id: 'tag 1', name: 'Tag' });
  await api.deleteTag('tag 1');

  assert.deepEqual(calls, [
    { url: '/api/knowledge/spaces', method: 'GET', body: null },
    { url: '/api/knowledge/spaces/default', method: 'POST', body: { userId: 'demo' } },
    {
      url: '/api/knowledge/folders',
      method: 'POST',
      body: { spaceId: 'space 1', parentId: null, name: 'Folder' }
    },
    {
      url: '/api/knowledge/folders/folder%201',
      method: 'PATCH',
      body: { name: 'Renamed', parentId: null }
    },
    { url: '/api/knowledge/folders/folder%201', method: 'DELETE', body: null },
    { url: '/api/knowledge/notes', method: 'POST', body: { title: 'Note', spaceId: 'space 1' } },
    { url: '/api/knowledge/notes/note%201', method: 'PATCH', body: { title: 'Renamed' } },
    { url: '/api/knowledge/notes/note%201', method: 'DELETE', body: null },
    { url: '/api/knowledge/notes/note%201/permanent', method: 'DELETE', body: null },
    { url: '/api/knowledge/notes/note%201/restore', method: 'POST', body: null },
    { url: '/api/knowledge/notes/recycle-bin?spaceId=space%201', method: 'DELETE', body: null },
    { url: '/api/knowledge/notes/note%201/favorite', method: 'POST', body: { favorite: true } },
    { url: '/api/knowledge/notes/note%201/tags', method: 'PUT', body: { tagIds: ['tag 1'] } },
    { url: '/api/knowledge/notes/note%201/tags/tag%201', method: 'DELETE', body: null },
    { url: '/api/knowledge/tags', method: 'POST', body: { id: 'tag 1', name: 'Tag' } },
    { url: '/api/knowledge/tags/tag%201', method: 'DELETE', body: null }
  ]);
});

await runTest('knowledge api uploads image attachments through storage endpoint', async () => {
  const calls = [];
  const api = createKnowledgeApi({
    requestJson: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method ?? 'GET',
        body: options.body ? JSON.parse(options.body) : null
      });
      return { data: { id: 'attachment 1' } };
    }
  });

  const uploaded = await api.uploadAttachmentImage({
    noteId: 'note 1',
    fileName: 'image.png',
    mimeType: 'image/png',
    contentBase64: 'ZmFrZQ=='
  });

  assert.deepEqual(uploaded, {
    attachment: { id: 'attachment 1' },
    contentUrl: '/api/storage/attachments/attachment%201/content'
  });
  assert.deepEqual(calls, [
    {
      url: '/api/storage/attachments',
      method: 'POST',
      body: {
        noteId: 'note 1',
        fileName: 'image.png',
        mimeType: 'image/png',
        contentBase64: 'ZmFrZQ=='
      }
    }
  ]);
});

await runTest('knowledge api imports single and multiple markdown notes through matching endpoints', async () => {
  const calls = [];
  const api = createKnowledgeApi({
    requestJson: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method ?? 'GET',
        body: options.body ? JSON.parse(options.body) : null
      });
      return { data: url.endsWith('batch') ? [{ id: 'note-1' }, { id: 'note-2' }] : { id: 'note-1' } };
    }
  });

  const single = await api.importMarkdownNotes([
    { title: 'One', rawMarkdown: '# One', folderId: 'folder 1', spaceId: 'space 1', sourceType: 'markdown-import' }
  ]);
  const batch = await api.importMarkdownNotes([
    { title: 'One', rawMarkdown: '# One', folderId: 'folder 1', spaceId: 'space 1', sourceType: 'markdown-import' },
    { title: 'Two', rawMarkdown: '# Two', folderId: 'folder 1', spaceId: 'space 1', sourceType: 'markdown-import' }
  ]);

  assert.deepEqual(single, [{ id: 'note-1' }]);
  assert.deepEqual(batch, [{ id: 'note-1' }, { id: 'note-2' }]);
  assert.deepEqual(calls, [
    {
      url: '/api/knowledge/notes/import-markdown',
      method: 'POST',
      body: {
        title: 'One',
        rawMarkdown: '# One',
        folderId: 'folder 1',
        spaceId: 'space 1',
        sourceType: 'markdown-import'
      }
    },
    {
      url: '/api/knowledge/notes/import-markdown-batch',
      method: 'POST',
      body: {
        items: [
          { title: 'One', rawMarkdown: '# One', folderId: 'folder 1', spaceId: 'space 1', sourceType: 'markdown-import' },
          { title: 'Two', rawMarkdown: '# Two', folderId: 'folder 1', spaceId: 'space 1', sourceType: 'markdown-import' }
        ]
      }
    }
  ]);
});
