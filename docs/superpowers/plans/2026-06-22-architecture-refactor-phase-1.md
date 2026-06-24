# Architecture Refactor Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the frontend HTTP/API boundary from `apps/web/src/client.js` into focused service modules without changing user-visible behavior.

**Architecture:** Keep the current vanilla JS app shell, but move request/response normalization into `apps/web/src/services/api-client.js` and knowledge-specific endpoint helpers into `apps/web/src/services/knowledge-api.js`. `client.js` remains the orchestrator for now and calls service functions instead of owning low-level fetch details.

**Tech Stack:** Node.js ES modules, vanilla browser `fetch`, custom test runner style with `node:assert/strict`.

---

### Task 1: Add API Client Contract Tests

**Files:**
- Create: `apps/web/test/api-client.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { createApiClient } from '../src/services/api-client.js';

export const tests = [
  {
    name: 'api client returns data from legacy data envelope',
    async run() {
      const client = createApiClient({
        fetchImpl: async (url, options) => ({
          ok: true,
          status: 200,
          async json() {
            return { data: { url, method: options.method } };
          }
        })
      });

      const payload = await client.requestJson('/api/knowledge/spaces', { method: 'POST' });

      assert.deepEqual(payload, { data: { url: '/api/knowledge/spaces', method: 'POST' } });
    }
  },
  {
    name: 'api client returns data from success envelope',
    async run() {
      const client = createApiClient({
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          async json() {
            return { success: true, data: [{ id: 'space-1' }] };
          }
        })
      });

      const payload = await client.requestJson('/api/knowledge/spaces');

      assert.deepEqual(payload, { data: [{ id: 'space-1' }] });
    }
  },
  {
    name: 'api client throws friendly message from error envelope',
    async run() {
      const client = createApiClient({
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          async json() {
            return { success: false, error: { code: 'RESOURCE_NOT_FOUND', message: '笔记不存在' } };
          }
        })
      });

      await assert.rejects(
        () => client.requestJson('/api/knowledge/notes/missing'),
        /笔记不存在/
      );
    }
  }
];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node apps/web/test/api-client.test.js`

Expected: FAIL because `../src/services/api-client.js` does not exist.

- [ ] **Step 3: Implement minimal API client**

Create `apps/web/src/services/api-client.js`:

```js
function normalizeSuccessPayload(payload) {
  if (payload?.success === true && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return { data: payload.data };
  }

  return payload ?? {};
}

function resolveErrorMessage(payload, status) {
  if (payload?.error && typeof payload.error === 'object') {
    return payload.error.message || payload.error.code || `Request failed: ${status}`;
  }

  return payload?.error || payload?.message || `Request failed: ${status}`;
}

export function createApiClient({ fetchImpl = globalThis.fetch } = {}) {
  async function requestJson(url, options = {}) {
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      },
      body: options.body
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(resolveErrorMessage(payload, response.status));
    }

    return normalizeSuccessPayload(payload);
  }

  return { requestJson };
}

export const apiClient = createApiClient();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node apps/web/test/api-client.test.js`

Expected: PASS for the new API client tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/api-client.test.js apps/web/src/services/api-client.js
git commit -m "refactor: extract frontend api client"
```

### Task 2: Add Knowledge API Wrapper Tests

**Files:**
- Create: `apps/web/test/knowledge-api.test.js`
- Create: `apps/web/src/services/knowledge-api.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { createKnowledgeApi } from '../src/services/knowledge-api.js';

export const tests = [
  {
    name: 'knowledge api loads workspace resources for a space',
    async run() {
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
    }
  }
];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node apps/web/test/knowledge-api.test.js`

Expected: FAIL because `createKnowledgeApi` is not implemented.

- [ ] **Step 3: Implement minimal knowledge API wrapper**

Create `apps/web/src/services/knowledge-api.js`:

```js
import { apiClient } from './api-client.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createKnowledgeApi({ requestJson = apiClient.requestJson } = {}) {
  async function loadWorkspaceResources(spaceId) {
    const encodedSpaceId = encodeURIComponent(spaceId ?? '');
    const [folderTreePayload, notesPayload, tagsPayload] = await Promise.all([
      requestJson(`/api/knowledge/folders/tree?spaceId=${encodedSpaceId}`),
      requestJson(`/api/knowledge/notes?spaceId=${encodedSpaceId}&includeDeleted=true`),
      requestJson(`/api/knowledge/tags?spaceId=${encodedSpaceId}`)
    ]);

    return {
      folderTree: asArray(folderTreePayload.data),
      notes: asArray(notesPayload.data),
      tags: asArray(tagsPayload.data)
    };
  }

  return { loadWorkspaceResources };
}

export const knowledgeApi = createKnowledgeApi();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node apps/web/test/knowledge-api.test.js`

Expected: PASS for API wrapper tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/knowledge-api.test.js apps/web/src/services/knowledge-api.js
git commit -m "refactor: add frontend knowledge api service"
```

### Task 3: Route Client Workspace Loading Through Service

**Files:**
- Modify: `apps/web/src/client.js`
- Test: existing `apps/web/test/workspace-loading.test.js`, `apps/web/test/editor-panel-state.test.js`, and full `npm test`

- [ ] **Step 1: Update imports and call site**

In `client.js`, import:

```js
import { apiClient } from './services/api-client.js';
import { knowledgeApi } from './services/knowledge-api.js';
```

Replace the low-level `refreshKnowledgeData` fetch calls with:

```js
const resources = await knowledgeApi.loadWorkspaceResources(spaceId);
state.folderTree = normalizeFolderTree(resources.folderTree);
state.foldersById = flattenFolderTree(state.folderTree);
state.tags = resources.tags;
state.allNotes = normalizeNotes(resources.notes);
```

Change `fetchJson` to delegate:

```js
async function fetchJson(url, options = {}) {
  return apiClient.requestJson(url, options);
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/client.js
git commit -m "refactor: route workspace loading through api service"
```
