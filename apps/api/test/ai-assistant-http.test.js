import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPersistentAppContext } from '../src/app.factory.js';
import { createServer } from '../src/server.js';
import { createAiWorker } from '../src/modules/ai/worker.js';

const priceProfile = { version: 'synthetic', expiresAt: '2030-01-01T00:00:00.000Z',
  inputMicrounitsPerMillion: 2_000_000, outputMicrounitsPerMillion: 8_000_000 };

async function withServer(context, run) {
  const server = createServer({ appContext: context, logger: { warn() {}, error() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function call(origin, route, body, header = '1') {
  const response = await fetch(`${origin}/api/ai/assistant${route}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Knowra-AI-Assistant': header },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
}

export const aiAssistantHttpTests = [
  { name: '助手 HTTP 预览、确认、回答持久恢复与来源回读', async run() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ai-assistant-'));
    try {
      const context = createPersistentAppContext({ storageRootDir: directory, ownerId: 'demo' });
      const space = context.http.knowledge.createDefaultKnowledgeSpace({});
      const note = context.http.knowledge.createNote({ id: 'assistant-note', title: '测试笔记',
        rawMarkdown: 'alpha 正文', spaceId: space.id });
      let source;
      context.ai.credentialReference = async () => ({ provider: 'deepseek', modelId: 'deepseek-flash', credentialRef: 'synthetic-ref' });
      context.ai.generationAvailable = true;
      context.ai.worker = createAiWorker({ repository: context.ai.repository, budget: context.ai.budgetAuthority,
        gateway: { capabilities: () => ({ provider: 'mock' }), complete: async () => ({ content: '合成回答',
          json: { answer: 'alpha', citations: [{ sourceId: source.sourceId, start: 0, end: 5, quote: 'alpha' }] },
          usage: { inputTokens: 10, outputTokens: 5, unknown: false } }) }, priceProfile,
        verifySources: (job, request) => context.ai.readContext.verifyJobSources(job, request),
        validateResult: (job, result) => context.ai.readContext.validateAnswer({ jobId: job.jobId, result }) });
      let jobId;
      await withServer(context, async origin => {
        const status = await call(origin, '/status');
        assert.equal(status.payload.data.generationAvailable, true);
        assert.equal(status.payload.data.executionLocation, 'server');
        const preview = await call(origin, '/preview', { spaceId: space.id, scope: { kind: 'note', noteId: note.id }, question: 'alpha 是什么？' });
        assert.equal(preview.status, 200);
        assert.deepEqual(preview.payload.data.sources.map(item => item.text), ['alpha 正文']);
        source = preview.payload.data.sources[0];
        assert.equal(context.ai.repository.list('aiJob').length, 0);
        assert.equal((await call(origin, '/jobs', { previewId: preview.payload.data.previewId }, '0')).status, 403);
        const stale = await call(origin, '/jobs', { previewId: preview.payload.data.previewId,
          scopeHash: preview.payload.data.scopeHash, payloadHash: '0', idempotencyKey: 'synthetic-01' });
        assert.equal(stale.status, 409);
        const created = await call(origin, '/jobs', { previewId: preview.payload.data.previewId,
          scopeHash: preview.payload.data.scopeHash, payloadHash: preview.payload.data.payloadHash,
          idempotencyKey: 'synthetic-01' });
        assert.equal(created.status, 202);
        jobId = created.payload.data.jobId;
        for (let i = 0; i < 30; i++) {
          const task = await call(origin, `/jobs/${jobId}`);
          if (task.payload.data.status === 'succeeded') {
            assert.equal(task.payload.data.result.answer, 'alpha');
            assert.equal(task.payload.data.result.citations[0].noteId, note.id);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
          if (i === 29) assert.fail('任务未完成');
        }
      });
      const reopened = createPersistentAppContext({ storageRootDir: directory, ownerId: 'demo' });
      reopened.ai.credentialReference = async () => null;
      await withServer(reopened, async origin => {
        const list = await call(origin, `/jobs?spaceId=${encodeURIComponent(space.id)}`);
        assert.equal(list.payload.data[0].jobId, jobId);
        const task = await call(origin, `/jobs/${jobId}`);
        assert.equal(task.payload.data.question, 'alpha 是什么？');
        assert.equal(task.payload.data.result.answer, 'alpha');
        assert.equal(task.payload.data.sources[0].noteVersionId, source.noteVersionId);
      });
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  } },
  { name: '助手在外发门禁关闭时只允许预览，开放合成执行后可通过 HTTP 取消', async run() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ai-assistant-gate-'));
    try {
      const context = createPersistentAppContext({ storageRootDir: directory, ownerId: 'demo' });
      context.aiLocation = 'local';
      const space = context.http.knowledge.createDefaultKnowledgeSpace({});
      const note = context.http.knowledge.createNote({ id: 'gated-note', title: '门禁', rawMarkdown: '正文', spaceId: space.id });
      context.ai.credentialReference = async () => ({ provider: 'deepseek', modelId: 'deepseek-flash', credentialRef: 'synthetic-ref' });
      await withServer(context, async origin => {
        assert.equal((await call(origin, '/status')).payload.data.executionLocation, 'local');
        const preview = await call(origin, '/preview', { spaceId: space.id, scope: { kind: 'note', noteId: note.id }, question: '内容？' });
        assert.equal(preview.status, 200);
        const created = await call(origin, '/jobs', { previewId: preview.payload.data.previewId,
          scopeHash: preview.payload.data.scopeHash, payloadHash: preview.payload.data.payloadHash,
          idempotencyKey: 'gated-test-1' });
        assert.equal(created.status, 409);
        assert.equal(created.payload.error.code, 'AI_GENERATION_UNAVAILABLE');
        assert.equal(context.ai.repository.list('aiJob').length, 0);
        let entered;
        const sent = new Promise(resolve => { entered = resolve; });
        context.ai.generationAvailable = true;
        context.ai.worker = createAiWorker({ repository: context.ai.repository, budget: context.ai.budgetAuthority,
          gateway: { capabilities: () => ({ provider: 'mock' }), complete: ({ signal }) => new Promise((resolve, reject) => {
            entered();
            signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'AI_CANCELLED' })));
          }) }, priceProfile,
          verifySources: (job, request) => context.ai.readContext.verifyJobSources(job, request),
          validateResult: (job, result) => context.ai.readContext.validateAnswer({ jobId: job.jobId, result }) });
        const accepted = await call(origin, '/jobs', { previewId: preview.payload.data.previewId,
          scopeHash: preview.payload.data.scopeHash, payloadHash: preview.payload.data.payloadHash,
          idempotencyKey: 'gated-test-1' });
        assert.equal(accepted.status, 202);
        await sent;
        assert.equal((await call(origin, `/jobs/${accepted.payload.data.jobId}/cancel`, {})).status, 200);
        for (let i = 0; i < 20; i++) {
          if ((await call(origin, `/jobs/${accepted.payload.data.jobId}`)).payload.data.status === 'cancelled') break;
          await new Promise(resolve => setTimeout(resolve, 10));
          if (i === 19) assert.fail('取消未进入终态');
        }
      });
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  } }
];
