import assert from 'node:assert/strict';
import test from 'node:test';

import {
  migrateTransformerHttpImages
} from '../migrate-transformer-http-images.mjs';

const noteId = 'note-transformer-1781768288411';
const sourceUrls = [
  'http://www.uml.org.cn/ai/images/2024102241.png',
  'http://www.uml.org.cn/ai/images/2024102242.png',
  'http://www.uml.org.cn/ai/images/2024102243.png',
  'http://www.uml.org.cn/ai/images/2024102245.png',
  'http://www.uml.org.cn/ai/images/20241022411.png',
  'http://www.uml.org.cn/ai/images/20241022412.png',
  'http://www.uml.org.cn/ai/images/20241022413.png'
];
const originalMarkdown = sourceUrls
  .map((sourceUrl, index) => `![diagram ${index + 1}](${sourceUrl})`)
  .join('\n\n');

test('migration defaults to a read-only preview', async () => {
  const calls = [];
  const result = await withFetchStub(async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    return jsonResponse({
      data: {
        id: noteId,
        title: 'Transformer',
        rawMarkdown: originalMarkdown
      }
    });
  }, () => migrateTransformerHttpImages({
    apiOrigin: 'http://api.test:3001',
    log: () => {}
  }));

  assert.equal(result.status, 'dry-run');
  assert.deepEqual(calls, [{
    url: `http://api.test:3001/api/knowledge/notes/${noteId}`,
    method: 'GET'
  }]);
});

test('migration preview accepts repeated references to the same source image', async () => {
  const logs = [];
  const repeatedMarkdown = `${originalMarkdown}\n\n![diagram repeated](${sourceUrls[0]})`;
  const result = await withFetchStub(async () => jsonResponse({
    data: {
      id: noteId,
      title: 'Transformer',
      rawMarkdown: repeatedMarkdown
    }
  }), () => migrateTransformerHttpImages({
    apiOrigin: 'http://api.test:3001',
    log: (message) => logs.push(JSON.parse(message))
  }));

  assert.equal(result.status, 'dry-run');
  assert.equal(logs[0].externalImageCount, sourceUrls.length + 1);
});

test('migration uploads all images before replacing note references', async () => {
  const calls = [];
  const attachments = sourceUrls.map((_, index) => ({
    id: `attachment-${index + 1}`,
    fileName: `transformer-architecture-0${index + 1}.png`,
    size: 8
  }));
  let uploadIndex = 0;
  let migratedMarkdown = '';
  let noteReadCount = 0;

  const result = await withFetchStub(async (url, options = {}) => {
    const requestUrl = new URL(url);
    const method = options.method || 'GET';
    calls.push({ url: requestUrl.href, method });

    if (sourceUrls.includes(requestUrl.href)) {
      return imageResponse();
    }

    if (
      requestUrl.pathname === `/api/knowledge/notes/${noteId}`
      && method === 'GET'
    ) {
      noteReadCount += 1;
      return jsonResponse({
        data: {
          id: noteId,
          title: 'Transformer',
          rawMarkdown: noteReadCount === 1 ? originalMarkdown : migratedMarkdown
        }
      });
    }

    if (requestUrl.pathname === '/api/storage/attachments' && method === 'POST') {
      const body = JSON.parse(options.body);
      assert.equal(body.noteId, noteId);
      assert.equal(Buffer.from(body.contentBase64, 'base64').byteLength, 8);
      return jsonResponse({ data: attachments[uploadIndex++] }, 201);
    }

    if (
      requestUrl.pathname === `/api/knowledge/notes/${noteId}`
      && method === 'PATCH'
    ) {
      migratedMarkdown = JSON.parse(options.body).rawMarkdown;
      return jsonResponse({
        data: { id: noteId, title: 'Transformer', rawMarkdown: migratedMarkdown }
      });
    }

    if (
      requestUrl.pathname.startsWith('/api/storage/attachments/')
      && requestUrl.pathname.endsWith('/content')
    ) {
      return imageResponse();
    }

    throw new Error(`Unexpected request: ${method} ${requestUrl.href}`);
  }, () => migrateTransformerHttpImages({
    apiOrigin: 'http://api.test:3001',
    apply: true,
    log: () => {}
  }));

  assert.equal(result.status, 'migrated');
  assert.equal(result.attachments.length, 7);
  assert.equal(uploadIndex, 7);
  sourceUrls.forEach((sourceUrl) => {
    assert.equal(migratedMarkdown.includes(sourceUrl), false);
  });
  attachments.forEach(({ id }) => {
    assert.match(
      migratedMarkdown,
      new RegExp(`/api/storage/attachments/${id}/content#attachment=${id}`)
    );
  });

  const patchIndex = calls.findIndex(({ method }) => method === 'PATCH');
  const lastUploadIndex = calls
    .map(({ method }, index) => (method === 'POST' ? index : -1))
    .filter((index) => index >= 0)
    .at(-1);
  assert.ok(patchIndex > lastUploadIndex);
});

test('migration removes uploaded attachments when a download fails before patch', async () => {
  const deletedAttachmentIds = [];
  let downloadCount = 0;

  await assert.rejects(
    withFetchStub(async (url, options = {}) => {
      const requestUrl = new URL(url);
      const method = options.method || 'GET';

      if (
        requestUrl.pathname === `/api/knowledge/notes/${noteId}`
        && method === 'GET'
      ) {
        return jsonResponse({
          data: { id: noteId, title: 'Transformer', rawMarkdown: originalMarkdown }
        });
      }

      if (sourceUrls.includes(requestUrl.href)) {
        downloadCount += 1;
        return downloadCount === 1
          ? imageResponse()
          : new Response('upstream error', { status: 502 });
      }

      if (requestUrl.pathname === '/api/storage/attachments' && method === 'POST') {
        return jsonResponse({
          data: {
            id: 'attachment-cleanup',
            fileName: 'transformer-architecture-01.png',
            size: 8
          }
        }, 201);
      }

      if (
        requestUrl.pathname === '/api/storage/attachments/attachment-cleanup'
        && method === 'DELETE'
      ) {
        deletedAttachmentIds.push('attachment-cleanup');
        return jsonResponse({ data: { id: 'attachment-cleanup' } });
      }

      throw new Error(`Unexpected request: ${method} ${requestUrl.href}`);
    }, () => migrateTransformerHttpImages({
      apiOrigin: 'http://api.test:3001',
      apply: true,
      log: () => {}
    })),
    /Image download failed \(502\)/
  );

  assert.deepEqual(deletedAttachmentIds, ['attachment-cleanup']);
});

test('migration removes all uploaded attachments when note patch is rejected', async () => {
  const deletedAttachmentIds = [];
  let uploadIndex = 0;

  await assert.rejects(
    withFetchStub(async (url, options = {}) => {
      const requestUrl = new URL(url);
      const method = options.method || 'GET';

      if (
        requestUrl.pathname === `/api/knowledge/notes/${noteId}`
        && method === 'GET'
      ) {
        return jsonResponse({
          data: { id: noteId, title: 'Transformer', rawMarkdown: originalMarkdown }
        });
      }

      if (sourceUrls.includes(requestUrl.href)) {
        return imageResponse();
      }

      if (requestUrl.pathname === '/api/storage/attachments' && method === 'POST') {
        uploadIndex += 1;
        return jsonResponse({
          data: {
            id: `attachment-cleanup-${uploadIndex}`,
            fileName: `transformer-architecture-${uploadIndex}.png`,
            size: 8
          }
        }, 201);
      }

      if (
        requestUrl.pathname === `/api/knowledge/notes/${noteId}`
        && method === 'PATCH'
      ) {
        return jsonResponse({
          error: { code: 'VALIDATION_ERROR', message: 'patch rejected' }
        }, 422);
      }

      if (
        requestUrl.pathname.startsWith('/api/storage/attachments/attachment-cleanup-')
        && method === 'DELETE'
      ) {
        deletedAttachmentIds.push(requestUrl.pathname.split('/').at(-1));
        return jsonResponse({ data: { id: requestUrl.pathname.split('/').at(-1) } });
      }

      throw new Error(`Unexpected request: ${method} ${requestUrl.href}`);
    }, () => migrateTransformerHttpImages({
      apiOrigin: 'http://api.test:3001',
      apply: true,
      log: () => {}
    })),
    /patch rejected/
  );

  assert.deepEqual(
    deletedAttachmentIds,
    sourceUrls.map((_, index) => `attachment-cleanup-${sourceUrls.length - index}`)
  );
});

async function withFetchStub(fetchStub, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function imageResponse() {
  return new Response(Buffer.from('89504e470d0a1a0a', 'hex'), {
    status: 200,
    headers: { 'Content-Type': 'image/png' }
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
