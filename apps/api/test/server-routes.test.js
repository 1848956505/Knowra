import assert from 'node:assert/strict';

function requestJson({ port, method, path, body }) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (response) => ({
    status: response.status,
    payload: await response.json()
  }));
}

function requestRaw({ port, method, path, headers }) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers
  });
}

export const serverRouteTests = [
  {
    name: 'root route returns API service information',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const result = await requestJson({
          port,
          method: 'GET',
          path: '/'
        });

        assert.equal(result.status, 200);
        assert.equal(result.payload.data.name, 'Study Accelerator API');
        assert.equal(result.payload.data.health, '/api/health');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'configured CORS origin is reflected on API responses',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({
        appContext,
        cors: {
          allowedOrigins: ['http://localhost:3000']
        }
      });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const response = await requestRaw({
          port,
          method: 'GET',
          path: '/api/health',
          headers: {
            Origin: 'http://localhost:3000'
          }
        });

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
        assert.equal(response.headers.get('vary'), 'Origin');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'configured CORS origin can pass preflight requests',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({
        appContext,
        cors: {
          allowedOrigins: ['http://localhost:3000']
        }
      });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const response = await requestRaw({
          port,
          method: 'OPTIONS',
          path: '/api/knowledge/notes',
          headers: {
            Origin: 'http://localhost:3000',
            'Access-Control-Request-Method': 'POST'
          }
        });

        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
        assert.match(response.headers.get('access-control-allow-methods'), /POST/);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'knowledge point routes create list update source and soft delete',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const created = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/knowledge-points',
          body: {
            id: 'route-kp-1',
            spaceId: 'space-kp',
            noteId: 'note-kp',
            title: 'Route knowledge point',
            sources: [{ id: 'route-source-1', noteId: 'note-kp', sourceText: 'route source' }]
          }
        });
        const listed = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/knowledge-points?spaceId=space-kp&noteId=note-kp'
        });
        const updated = await requestJson({
          port,
          method: 'PATCH',
          path: '/api/knowledge/knowledge-points/route-kp-1',
          body: {
            title: 'Updated route point',
            tagIds: ['tag-route']
          }
        });
        const withSource = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/knowledge-points/route-kp-1/sources',
          body: {
            id: 'route-source-2',
            noteId: 'note-kp',
            sourceText: 'second route source'
          }
        });
        const removedSource = await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/knowledge-point-sources/route-source-2'
        });
        const deleted = await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/knowledge-points/route-kp-1'
        });
        const active = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/knowledge-points?spaceId=space-kp'
        });
        const all = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/knowledge-points?spaceId=space-kp&includeDeleted=true'
        });

        assert.equal(created.status, 201);
        assert.equal(created.payload.data.id, 'route-kp-1');
        assert.equal(listed.status, 200);
        assert.equal(listed.payload.data.length, 1);
        assert.equal(updated.payload.data.title, 'Updated route point');
        assert.deepEqual(updated.payload.data.tagIds, ['tag-route']);
        assert.equal(withSource.payload.data.sources.length, 2);
        assert.equal(removedSource.payload.data.sources.length, 1);
        assert.ok(deleted.payload.data.deletedAt);
        assert.equal(active.payload.data.length, 0);
        assert.equal(all.payload.data.length, 1);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'knowledge point tag group route returns built-in groups',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const result = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/knowledge-point-tag-groups?spaceId=space-route-tags'
        });

        assert.equal(result.status, 200);
        assert.deepEqual(result.payload.data.map((group) => group.code), ['ordinary', 'mastery', 'importance', 'purpose']);
        assert.equal(result.payload.data.find((group) => group.code === 'mastery').tags.length, 3);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'DELETE note tag route removes tag without deleting note',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-1',
            spaceId: 'space-1',
            folderId: 'folder-1',
            title: 'Server note',
            rawMarkdown: 'content'
          }
        });

        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes/server-note-1/tags',
          body: {
            tagId: 'tag-remove'
          }
        });

        const removeResult = await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/notes/server-note-1/tags/tag-remove'
        });

        const noteResult = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes/server-note-1'
        });

        assert.equal(removeResult.status, 200);
        assert.deepEqual(removeResult.payload.data.tagIds, []);
        assert.equal(noteResult.status, 200);
        assert.equal(noteResult.payload.data.deleted, false);
        assert.deepEqual(noteResult.payload.data.tagIds, []);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'PUT note tags route replaces note tags in one request',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-2',
            spaceId: 'space-1',
            folderId: 'folder-1',
            title: 'Server note 2',
            rawMarkdown: 'content'
          }
        });

        const result = await requestJson({
          port,
          method: 'PUT',
          path: '/api/knowledge/notes/server-note-2/tags',
          body: {
            tagIds: ['tag-a', 'tag-b']
          }
        });

        assert.equal(result.status, 200);
        assert.deepEqual(result.payload.data.tagIds, ['tag-a', 'tag-b']);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'GET notes route supports sort query parameters',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-b',
            spaceId: 'space-sort',
            folderId: 'folder-1',
            title: 'Beta',
            rawMarkdown: 'content'
          }
        });

        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-a',
            spaceId: 'space-sort',
            folderId: 'folder-1',
            title: 'Alpha',
            rawMarkdown: 'content'
          }
        });

        const result = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-sort&sortBy=title&order=asc'
        });

        assert.equal(result.status, 200);
        assert.deepEqual(result.payload.data.map((note) => note.title), ['Alpha', 'Beta']);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'favorite note route updates favorite status and favorite-only listing',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-favorite-note',
            spaceId: 'space-favorite',
            folderId: 'folder-1',
            title: 'Favorite route note',
            rawMarkdown: 'favorite body'
          }
        });

        const favorite = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes/server-favorite-note/favorite',
          body: {
            favorite: true
          }
        });
        const favorites = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-favorite&favoriteOnly=true'
        });

        assert.equal(favorite.status, 200);
        assert.equal(favorite.payload.data.favorite, true);
        assert.equal(favorites.payload.data.length, 1);
        assert.equal(favorites.payload.data[0].id, 'server-favorite-note');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'batch note routes delete notes and append tags across selected notes',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-batch-note-a',
            spaceId: 'space-batch-actions',
            folderId: 'folder-1',
            title: 'Batch Note A',
            rawMarkdown: 'content a'
          }
        });
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-batch-note-b',
            spaceId: 'space-batch-actions',
            folderId: 'folder-1',
            title: 'Batch Note B',
            rawMarkdown: 'content b'
          }
        });

        const tagged = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes/batch/tags',
          body: {
            noteIds: ['server-batch-note-a', 'server-batch-note-b'],
            tagId: 'tag-batch'
          }
        });
        const deleted = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes/batch/delete',
          body: {
            noteIds: ['server-batch-note-a', 'server-batch-note-b']
          }
        });
        const deletedList = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-batch-actions&deletedOnly=true&includeDeleted=true'
        });

        assert.equal(tagged.status, 200);
        assert.deepEqual(tagged.payload.data[0].tagIds, ['tag-batch']);
        assert.equal(deleted.status, 200);
        assert.equal(deleted.payload.data.length, 2);
        assert.equal(deletedList.payload.data.length, 2);
        assert.equal(deletedList.payload.data[0].deleted, true);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'GET note detail route returns full markdown for detail panel',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-detail',
            spaceId: 'space-detail',
            folderId: 'folder-1',
            title: 'Detail note',
            rawMarkdown: '# Detail title\n\nDetail body'
          }
        });

        const result = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes/server-note-detail'
        });

        assert.equal(result.status, 200);
        assert.equal(result.payload.data.title, 'Detail note');
        assert.equal(result.payload.data.rawMarkdown, '# Detail title\n\nDetail body');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'deleted note routes support recycle bin listing, detail lookup, and restore',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-restore',
            spaceId: 'space-restore',
            folderId: 'folder-1',
            title: 'Restore route note',
            rawMarkdown: 'restore me'
          }
        });

        await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/notes/server-note-restore'
        });

        const deletedList = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-restore&deletedOnly=true&includeDeleted=true'
        });
        const deletedDetail = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes/server-note-restore?includeDeleted=true'
        });
        const restored = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes/server-note-restore/restore'
        });
        const activeList = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-restore'
        });

        assert.equal(deletedList.status, 200);
        assert.equal(deletedList.payload.data.length, 1);
        assert.equal(deletedList.payload.data[0].deleted, true);
        assert.equal(deletedDetail.status, 200);
        assert.equal(deletedDetail.payload.data.deleted, true);
        assert.equal(restored.status, 200);
        assert.equal(restored.payload.data.deleted, false);
        assert.equal(activeList.payload.data.length, 1);
        assert.equal(activeList.payload.data[0].deleted, false);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'deleted note routes support permanent delete and empty recycle bin',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-permanent-a',
            spaceId: 'space-recycle-clear',
            folderId: 'folder-1',
            title: 'Permanent A',
            rawMarkdown: 'remove me forever'
          }
        });
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'server-note-permanent-b',
            spaceId: 'space-recycle-clear',
            folderId: 'folder-1',
            title: 'Permanent B',
            rawMarkdown: 'clear me too'
          }
        });

        await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/notes/server-note-permanent-a'
        });
        await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/notes/server-note-permanent-b'
        });

        const permanentlyDeleted = await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/notes/server-note-permanent-a/permanent'
        });
        const clearRecycle = await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/notes/recycle-bin?spaceId=space-recycle-clear'
        });
        const deletedList = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-recycle-clear&deletedOnly=true&includeDeleted=true'
        });
        const deletedDetail = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes/server-note-permanent-a?includeDeleted=true'
        });

        assert.equal(permanentlyDeleted.status, 200);
        assert.equal(permanentlyDeleted.payload.data.id, 'server-note-permanent-a');
        assert.equal(clearRecycle.status, 200);
        assert.equal(clearRecycle.payload.data.deletedCount, 1);
        assert.equal(deletedList.payload.data.length, 0);
        assert.equal(deletedDetail.status, 400);
        assert.match(deletedDetail.payload.error.message, /note not found/i);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'GET linked notes route returns referenced notes for detail panel',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'linked-target-route',
            spaceId: 'space-links',
            folderId: 'folder-1',
            title: 'Linked target',
            rawMarkdown: 'target body'
          }
        });

        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'linked-source-route',
            spaceId: 'space-links',
            folderId: 'folder-1',
            title: 'Linked source',
            rawMarkdown: 'See [[linked-target-route]].'
          }
        });

        const result = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes/linked-source-route/links'
        });

        assert.equal(result.status, 200);
        assert.equal(result.payload.data.length, 1);
        assert.equal(result.payload.data[0].id, 'linked-target-route');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'attachment routes upload, list, and stream attachment content',
    async run() {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');
      const { createFileDataStore } = await import('../src/infrastructure/file-data-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attach-route-'));
      const dataFilePath = path.join(tempDir, 'knowledge-base.json');
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = createFileDataStore(dataFilePath);
      const appContext = createAppContext({ dataStore, uploadsDir });
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'attachment-note',
            spaceId: 'space-attach',
            folderId: 'folder-1',
            title: 'Attachment Note',
            rawMarkdown: 'body'
          }
        });

        const upload = await requestJson({
          port,
          method: 'POST',
          path: '/api/storage/attachments',
          body: {
            noteId: 'attachment-note',
            fileName: 'hello.txt',
            mimeType: 'text/plain',
            contentBase64: Buffer.from('hello file').toString('base64')
          }
        });

        const list = await requestJson({
          port,
          method: 'GET',
          path: '/api/storage/attachments?noteId=attachment-note'
        });

        const contentResponse = await fetch(`http://127.0.0.1:${port}/api/storage/attachments/${upload.payload.data.id}/content`);
        const content = await contentResponse.text();

        assert.equal(upload.status, 201);
        assert.equal(list.payload.data.length, 1);
        assert.equal(list.payload.data[0].fileName, 'hello.txt');
        assert.equal(contentResponse.status, 200);
        assert.equal(content, 'hello file');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'attachment delete route removes attachment from list and content endpoint',
    async run() {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');
      const { createFileDataStore } = await import('../src/infrastructure/file-data-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attach-delete-route-'));
      const dataFilePath = path.join(tempDir, 'knowledge-base.json');
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = createFileDataStore(dataFilePath);
      const appContext = createAppContext({ dataStore, uploadsDir });
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'attachment-delete-note',
            spaceId: 'space-attach-delete',
            folderId: 'folder-1',
            title: 'Attachment Delete Note',
            rawMarkdown: 'body'
          }
        });

        const upload = await requestJson({
          port,
          method: 'POST',
          path: '/api/storage/attachments',
          body: {
            noteId: 'attachment-delete-note',
            fileName: 'remove.txt',
            mimeType: 'text/plain',
            contentBase64: Buffer.from('remove file').toString('base64')
          }
        });

        const deleted = await requestJson({
          port,
          method: 'DELETE',
          path: `/api/storage/attachments/${upload.payload.data.id}`
        });
        const list = await requestJson({
          port,
          method: 'GET',
          path: '/api/storage/attachments?noteId=attachment-delete-note'
        });
        const contentResponse = await fetch(`http://127.0.0.1:${port}/api/storage/attachments/${upload.payload.data.id}/content`);
        const contentPayload = await contentResponse.json();

        assert.equal(deleted.status, 200);
        assert.equal(deleted.payload.data.id, upload.payload.data.id);
        assert.equal(list.payload.data.length, 0);
        assert.equal(contentResponse.status, 404, 'deleted attachments must surface as 404, not a generic 400');
        assert.match(contentPayload.error.message, /attachment not found/i);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'attachment patch route renames attachment metadata and content filename header',
    async run() {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');
      const { createFileDataStore } = await import('../src/infrastructure/file-data-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attach-patch-route-'));
      const dataFilePath = path.join(tempDir, 'knowledge-base.json');
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = createFileDataStore(dataFilePath);
      const appContext = createAppContext({ dataStore, uploadsDir });
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'attachment-rename-note',
            spaceId: 'space-attach-rename',
            folderId: 'folder-1',
            title: 'Attachment Rename Note',
            rawMarkdown: 'body'
          }
        });

        const upload = await requestJson({
          port,
          method: 'POST',
          path: '/api/storage/attachments',
          body: {
            noteId: 'attachment-rename-note',
            fileName: 'before.png',
            mimeType: 'image/png',
            contentBase64: Buffer.from('rename file').toString('base64')
          }
        });

        const renamed = await requestJson({
          port,
          method: 'PATCH',
          path: `/api/storage/attachments/${upload.payload.data.id}`,
          body: {
            fileName: 'after name.png'
          }
        });
        const contentResponse = await fetch(`http://127.0.0.1:${port}/api/storage/attachments/${upload.payload.data.id}/content`);

        assert.equal(renamed.status, 200);
        assert.equal(renamed.payload.data.fileName, 'after name.png');
        assert.match(contentResponse.headers.get('content-disposition') ?? '', /after(?: |%20)name\.png/);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'attachment post rename route aliases patch rename behavior',
    async run() {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');
      const { createFileDataStore } = await import('../src/infrastructure/file-data-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-attach-post-rename-route-'));
      const dataFilePath = path.join(tempDir, 'knowledge-base.json');
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = createFileDataStore(dataFilePath);
      const appContext = createAppContext({ dataStore, uploadsDir });
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'attachment-post-rename-note',
            spaceId: 'space-attach-post-rename',
            folderId: 'folder-1',
            title: 'Attachment Post Rename Note',
            rawMarkdown: 'body'
          }
        });

        const upload = await requestJson({
          port,
          method: 'POST',
          path: '/api/storage/attachments',
          body: {
            noteId: 'attachment-post-rename-note',
            fileName: 'before.png',
            mimeType: 'image/png',
            contentBase64: Buffer.from('rename file').toString('base64')
          }
        });

        const renamed = await requestJson({
          port,
          method: 'POST',
          path: `/api/storage/attachments/${upload.payload.data.id}/rename`,
          body: {
            fileName: 'after name.png'
          }
        });

        assert.equal(renamed.status, 200);
        assert.equal(renamed.payload.data.fileName, 'after name.png');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'GET folder tree route returns nested folder data and deleting parent clears child note refs',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/folders',
          body: {
            id: 'folder-root-route',
            spaceId: 'space-tree',
            name: 'Root'
          }
        });

        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/folders',
          body: {
            id: 'folder-child-route',
            spaceId: 'space-tree',
            parentId: 'folder-root-route',
            name: 'Child'
          }
        });

        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'note-child-folder',
            spaceId: 'space-tree',
            folderId: 'folder-child-route',
            title: 'Child Folder Note',
            rawMarkdown: 'content'
          }
        });

        const tree = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/folders/tree?spaceId=space-tree'
        });

        await requestJson({
          port,
          method: 'DELETE',
          path: '/api/knowledge/folders/folder-root-route'
        });

        const note = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes/note-child-folder'
        });

        assert.equal(tree.status, 200);
        assert.equal(tree.payload.data[0].children[0].id, 'folder-child-route');
        assert.equal(note.payload.data.folderId, null);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'storage export and import routes round-trip knowledge base data with attachments',
    async run() {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');
      const { createFileDataStore } = await import('../src/infrastructure/file-data-store.js');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-export-route-'));
      const dataFilePath = path.join(tempDir, 'knowledge-base.json');
      const uploadsDir = path.join(tempDir, 'uploads');
      const dataStore = createFileDataStore(dataFilePath);

      const appContext = createAppContext({ dataStore, uploadsDir });
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes',
          body: {
            id: 'note-export',
            spaceId: 'space-export',
            folderId: 'folder-1',
            title: 'Exported note',
            rawMarkdown: '# Exported'
          }
        });
        await requestJson({
          port,
          method: 'POST',
          path: '/api/storage/attachments',
          body: {
            noteId: 'note-export',
            fileName: 'exported.txt',
            mimeType: 'text/plain',
            contentBase64: Buffer.from('attachment export body').toString('base64')
          }
        });

        const exported = await requestJson({
          port,
          method: 'GET',
          path: '/api/storage/export'
        });

        const imported = await requestJson({
          port,
          method: 'POST',
          path: '/api/storage/import',
          body: {
            data: {
              spaces: [{ id: 'space-import', userId: 'user-import', name: 'Import Space' }],
              folders: [],
              tags: [],
              notes: [{ id: 'note-import', title: 'Imported note', rawMarkdown: '# Imported' }],
              attachments: [{ id: 'attachment-import', noteId: 'note-import', fileName: 'imported.txt', mimeType: 'text/plain' }]
            },
            attachmentFiles: [
              {
                id: 'attachment-import',
                noteId: 'note-import',
                fileName: 'imported.txt',
                mimeType: 'text/plain',
                contentBase64: Buffer.from('attachment import body').toString('base64')
              }
            ]
          }
        });
        const importedAttachmentContent = await fetch(`http://127.0.0.1:${port}/api/storage/attachments/attachment-import/content`);
        const importedAttachmentText = await importedAttachmentContent.text();

        assert.equal(exported.status, 200);
        assert.equal(exported.payload.data.data.notes[0].id, 'note-export');
        assert.equal(exported.payload.data.attachmentFiles.length, 1);
        assert.equal(exported.payload.data.attachmentFiles[0].fileName, 'exported.txt');
        assert.equal(imported.status, 200);
        assert.equal(imported.payload.data.data.notes[0].id, 'note-import');
        assert.equal(imported.payload.data.data.attachments[0].id, 'attachment-import');
        assert.equal(imported.payload.data.attachmentFiles[0].id, 'attachment-import');
        assert.equal(importedAttachmentText, 'attachment import body');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'POST markdown import route creates a note without requiring manual id',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const imported = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes/import-markdown',
          body: {
            rawMarkdown: '# Imported Route Note\n\nroute content',
            spaceId: 'space-import-route',
            folderId: 'folder-1',
            tagIds: ['tag-route']
          }
        });

        const notes = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-import-route'
        });

        assert.equal(imported.status, 201);
        assert.equal(imported.payload.data.title, 'Imported Route Note');
        assert.equal(imported.payload.data.sourceType, 'markdown-import');
        assert.match(imported.payload.data.id, /^note-imported-route-note-/);
        assert.equal(notes.payload.data.length, 1);
        assert.deepEqual(notes.payload.data[0].tagIds, ['tag-route']);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  },
  {
    name: 'POST markdown batch import route and GET notes route support paging',
    async run() {
      const { createAppContext } = await import('../src/app.factory.js');
      const { createServer } = await import('../src/server.js');

      const appContext = createAppContext();
      const server = createServer({ appContext });

      await new Promise((resolve) => server.listen(0, resolve));
      const port = server.address().port;

      try {
        const imported = await requestJson({
          port,
          method: 'POST',
          path: '/api/knowledge/notes/import-markdown-batch',
          body: {
            items: [
              {
                rawMarkdown: '# Page Batch A\n\ncontent',
                spaceId: 'space-page-batch',
                folderId: 'folder-1'
              },
              {
                rawMarkdown: '# Page Batch B\n\ncontent',
                spaceId: 'space-page-batch',
                folderId: 'folder-1'
              },
              {
                rawMarkdown: '# Page Batch C\n\ncontent',
                spaceId: 'space-page-batch',
                folderId: 'folder-1'
              }
            ]
          }
        });

        const paged = await requestJson({
          port,
          method: 'GET',
          path: '/api/knowledge/notes?spaceId=space-page-batch&sortBy=title&order=asc&limit=1&offset=1'
        });

        assert.equal(imported.status, 201);
        assert.equal(imported.payload.data.length, 3);
        assert.equal(paged.status, 200);
        assert.equal(paged.payload.data.length, 1);
        assert.equal(paged.payload.data[0].title, 'Page Batch B');
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  }
];
