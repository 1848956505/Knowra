import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';
import { createKnowledgeHttpHandlers } from '../src/modules/knowledge/http/knowledge-handlers.js';

function createHttpFixture({ knowledgeHandlers, logger } = {}) {
  const knowledgeModule = createKnowledgeModule({ enforceReferences: true });
  knowledgeModule.knowledgeSpaceService.createDefaultKnowledgeSpace({
    userId: 'demo'
  });
  knowledgeModule.folderService.createFolder({
    id: 'folder-valid',
    spaceId: 'space-demo',
    name: 'Valid folder'
  });
  knowledgeModule.tagService.createTag({
    id: 'tag-valid',
    spaceId: 'space-demo',
    name: 'valid'
  });

  return createServer({
    appContext: {
      http: {
        knowledge: knowledgeHandlers
          ?? createKnowledgeHttpHandlers({ knowledgeModule }),
        storage: {}
      }
    },
    logger: logger ?? { error() {} }
  });
}

async function withServer(server, callback) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function readJson(response) {
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/json/
  );
  return response.json();
}

async function postJson(baseUrl, pathname, body) {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

export const serverHttpTests = [
  {
    name: 'createServer preserves the success envelope and rejects unsupported method or similar paths',
    async run() {
      await withServer(createHttpFixture(), async (baseUrl) => {
        const healthResponse = await fetch(`${baseUrl}/api/health`);
        const health = await readJson(healthResponse);
        assert.equal(healthResponse.status, 200);
        assert.deepEqual(health, { data: { status: 'ok' } });

        const methodResponse = await fetch(`${baseUrl}/api/knowledge/notes`, {
          method: 'PUT'
        });
        const methodError = await readJson(methodResponse);
        assert.equal(methodResponse.status, 404);
        assert.equal(methodError.error.code, 'ROUTE_NOT_FOUND');

        const similarPathResponse = await fetch(
          `${baseUrl}/api/knowledge/notes/missing/unexpected`
        );
        const similarPathError = await readJson(similarPathResponse);
        assert.equal(similarPathResponse.status, 404);
        assert.equal(similarPathError.error.code, 'ROUTE_NOT_FOUND');
      });
    }
  },
  {
    name: 'createServer returns 409 for a duplicate client-provided note id',
    async run() {
      await withServer(createHttpFixture(), async (baseUrl) => {
        const payload = {
          id: 'note-client-id',
          title: 'Unique note',
          rawMarkdown: 'body',
          spaceId: 'space-demo',
          folderId: 'folder-valid',
          tagIds: ['tag-valid']
        };
        const createdResponse = await postJson(
          baseUrl,
          '/api/knowledge/notes',
          payload
        );
        const created = await readJson(createdResponse);
        assert.equal(createdResponse.status, 201);
        assert.equal(created.data.id, 'note-client-id');

        const duplicateResponse = await postJson(
          baseUrl,
          '/api/knowledge/notes',
          {
            ...payload,
            title: 'Overwrite attempt'
          }
        );
        const duplicate = await readJson(duplicateResponse);
        assert.equal(duplicateResponse.status, 409);
        assert.equal(duplicate.error.code, 'NOTE_ID_CONFLICT');

        const storedResponse = await fetch(
          `${baseUrl}/api/knowledge/notes/note-client-id`
        );
        const stored = await readJson(storedResponse);
        assert.equal(stored.data.title, 'Unique note');
      });
    }
  },
  {
    name: 'createServer returns 422 for invalid note fields and references',
    async run() {
      await withServer(createHttpFixture(), async (baseUrl) => {
        const missingContentResponse = await postJson(
          baseUrl,
          '/api/knowledge/notes',
          {
            title: 'Missing content',
            spaceId: 'space-demo'
          }
        );
        const missingContent = await readJson(missingContentResponse);
        assert.equal(missingContentResponse.status, 422);
        assert.equal(missingContent.error.code, 'NOTE_CONTENT_REQUIRED');

        const missingFolderResponse = await postJson(
          baseUrl,
          '/api/knowledge/notes',
          {
            title: 'Missing folder',
            rawMarkdown: 'body',
            spaceId: 'space-demo',
            folderId: 'folder-missing'
          }
        );
        const missingFolder = await readJson(missingFolderResponse);
        assert.equal(missingFolderResponse.status, 422);
        assert.equal(missingFolder.error.code, 'NOTE_FOLDER_NOT_FOUND');
      });
    }
  },
  {
    name: 'createServer returns 404 for a missing note through the real HTTP entry',
    async run() {
      await withServer(createHttpFixture(), async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/api/knowledge/notes/note-missing`
        );
        const payload = await readJson(response);
        assert.equal(response.status, 404);
        assert.equal(payload.error.code, 'NOTE_NOT_FOUND');
      });
    }
  },
  {
    name: 'createServer masks unknown exceptions behind a stable 500 envelope',
    async run() {
      const logged = [];
      const handlers = {
        listNotes() {
          throw new Error('database password must not reach the response');
        }
      };
      const server = createHttpFixture({
        knowledgeHandlers: handlers,
        logger: {
          error(...args) {
            logged.push(args);
          }
        }
      });

      await withServer(server, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/knowledge/notes`);
        const payload = await readJson(response);
        assert.equal(response.status, 500);
        assert.deepEqual(payload, {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error'
          }
        });
        assert.equal(JSON.stringify(payload).includes('password'), false);
        assert.equal(logged.length, 1);
      });
    }
  }
];
