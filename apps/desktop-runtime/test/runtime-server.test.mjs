import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { temporaryDirectory } from './helpers.mjs';
import { anchorForListItem, projectMarkdown, calculateContentHash } from '@study-accelerator/content-anchor';

async function localRequests(t) {
  const root = temporaryDirectory(t), distRoot = path.join(root, 'dist');
  fs.mkdirSync(distRoot); fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head><body>Knowra</body></html>');
  const runtime = await startLocalRuntime({ dataDirectory: path.join(root, 'data'), distRoot, syncOptions: { autoSync: false } });
  t.after(() => runtime.close());
  const cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  async function call(route, method = 'GET', body, headers = {}) {
    const response = await fetch(`${runtime.origin}${route}`, { method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Knowra-Dataset': runtime.store.getStatus().datasetId, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  }
  const space = (await call('/api/knowledge/spaces/default', 'POST', {})).data;
  return { runtime, call, space };
}

test('真实本地入口开放会话与授权写入，仍限制永久删除和试题', async t => {
  const { call, space } = await localRequests(t);
  const headers = { 'X-Knowra-AI-Conversation': '1' };
  const created = await call('/api/ai/conversations', 'POST', { spaceId: space.id }, headers);
  assert.equal(created.status, 201, JSON.stringify(created));
  const id = created.data.conversationId;
  const submitted = await call(`/api/ai/conversations/${id}/messages`, 'POST', { content: '合成消息', idempotencyKey: 'local-01' }, headers);
  assert.equal(submitted.status, 202, JSON.stringify(submitted));
  const turnId = submitted.data.turnId;
  const retry = await call(`/api/ai/conversations/${id}/turns/${turnId}/retry`, 'POST', undefined, headers);
  assert.notEqual(retry.error?.code, 'LOCAL_FEATURE_UNAVAILABLE');
  assert([202, 422].includes(retry.status), JSON.stringify(retry));
  const cancelled = await call(`/api/ai/conversations/${id}/turns/${turnId}/cancel`, 'POST', undefined, headers);
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled));
  const policy = await call('/api/ai/access-policies', 'POST', { spaceId: space.id, scope: { kind: 'library' },
    excludedNoteIds: [], includeAttachments: false, read: true, egress: false, recipients: [],
    expiresAt: new Date(Date.now() + 86400000).toISOString() }, { 'X-Knowra-AI-Access': '1' });
  assert.equal(policy.status, 201, JSON.stringify(policy));
  const revoked = await call(`/api/ai/access-policies/${policy.data.policyId}`, 'PATCH',
    { revision: policy.data.revision, revoke: true }, { 'X-Knowra-AI-Access': '1' });
  assert.equal(revoked.status, 200, JSON.stringify(revoked));
  for (const route of ['/api/ai/conversations/unknown/delete', '/api/knowledge/notes/unknown/permanent', '/api/questions']) {
    assert.equal((await call(route, route.endsWith('permanent') ? 'DELETE' : 'POST', {})).error.code, 'LOCAL_FEATURE_UNAVAILABLE');
  }
});

test('真实本地入口确认列表重点范围，保留 revision 并发保护', async t => {
  const { call, space } = await localRequests(t);
  const rawMarkdown = '- 父项\n- 相邻';
  const note = (await call('/api/knowledge/notes', 'POST', { spaceId: space.id, title: '列表确认', rawMarkdown })).data;
  const anchor = anchorForListItem(projectMarkdown(rawMarkdown), '0.0');
  const created = await call('/api/knowledge/annotations', 'POST', { spaceId: space.id, noteId: note.id,
    schemaVersion: 2, scopeType: 'list', anchor, quoteText: anchor.quoteText, fromPosition: anchor.sourceStart,
    toPosition: anchor.sourceEnd, noteContentHash: calculateContentHash(rawMarkdown), anchorFingerprint: 'local', idempotencyKey: 'local-list' });
  assert.equal(created.status, 201, JSON.stringify(created));
  await call(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '- 父项\n  - 相邻', expectedUpdatedAt: note.updatedAt });
  const preview = (await call(`/api/knowledge/annotations/${created.data.id}/preview`)).data;
  assert(preview.pendingRange, JSON.stringify(preview));
  const body = { expectedRevision: preview.annotation.revision, noteContentHash: preview.currentContentHash,
    candidateHash: preview.pendingRange.candidateHash };
  const confirmed = await call(`/api/knowledge/annotations/${created.data.id}/confirm-range`, 'POST', body);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed));
  assert.match(confirmed.data.quoteText, /相邻/);
  assert.equal((await call(`/api/knowledge/annotations/${created.data.id}/confirm-range`, 'POST', body)).status, 409);
});

test('本地 HTTP 闭环：单实例、会话、跨源隔离、笔记保存及重启恢复', async t => {
  const root = temporaryDirectory(t);
  const distRoot = path.join(root, 'dist');
  fs.mkdirSync(distRoot);
  fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head><body>Knowra</body></html>');
  const options = { dataDirectory: path.join(root, 'data'), distRoot };
  let runtime = await startLocalRuntime(options);
  t.after(async () => { await runtime.close(); });
  await assert.rejects(startLocalRuntime(options), /已被使用/);
  assert.equal((await fetch(`${runtime.origin}/api/knowledge/notes`)).status, 401);
  const launch = await fetch(runtime.launchUrl, { redirect: 'manual' });
  let cookie = launch.headers.get('set-cookie').split(';')[0];
  const request = async (pathname, method = 'GET', body) => {
    const response = await fetch(`${runtime.origin}${pathname}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const html = await fetch(runtime.origin, { headers: { Cookie: cookie } }).then(r => r.text());
  assert.match(html, /knowraRuntime/);
  assert.equal((await fetch(`${runtime.origin}/api/knowledge/notes`, { headers: { Cookie: cookie, Origin: 'https://example.com' } })).status, 403);
  assert.equal((await request('/api/storage/import', 'POST', {})).status, 409);
  assert.equal((await request('/api/knowledge/analysis-scopes', 'POST', {})).status, 409);
  const space = (await request('/api/knowledge/spaces/default', 'POST', {})).body.data;
  const created = await request('/api/knowledge/notes', 'POST', { spaceId: space.id, title: '本地验证', rawMarkdown: '第一版' });
  assert.equal(created.status, 201);
  const note = created.body.data;
  const pendingBeforePreview = runtime.store.getStatus().pendingOperations;
  const analysisPreview = await request('/api/knowledge/analysis-scopes/preview', 'POST', { spaceId: space.id, noteIds: [note.id], mode: 'all' });
  assert.equal(analysisPreview.status, 200);
  assert.equal(analysisPreview.body.data.segments[0].markdown, '第一版');
  assert.equal(runtime.store.getStatus().pendingOperations, pendingBeforePreview);
  assert.equal(runtime.store.state.analysisScopeSnapshots.length, 0);
  const attachment = await request('/api/storage/attachments', 'POST', { noteId: note.id, fileName: '离线.txt', contentBase64: Buffer.from('已保存附件').toString('base64') });
  assert.equal(attachment.status, 201);
  const saved = await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '断网后保存', expectedUpdatedAt: note.updatedAt });
  assert.equal(saved.status, 200);
  assert.equal((await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '过期窗口', expectedUpdatedAt: note.updatedAt })).status, 409);
  assert.equal((await request(`/api/knowledge/notes/${note.id}/permanent`, 'DELETE')).status, 409);
  const status = (await request('/api/local-runtime/status')).body.data;
  assert.equal(status.cloudSync, 'not-configured');
  const assistantStatus = await fetch(`${runtime.origin}/api/ai/assistant/status`, { headers: {
    Cookie: cookie, 'X-Knowra-Dataset': status.datasetId } }).then(response => response.json());
  assert.equal(assistantStatus.data.configured, false);
  assert.equal(assistantStatus.data.generationAvailable, false);
  assert(status.pendingOperations > 0);
  assert.equal((await request('/api/local-runtime/backup', 'POST')).status, 201);
  await runtime.close();
  runtime = await startLocalRuntime(options);
  cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  assert.equal((await request(`/api/knowledge/notes/${note.id}`)).body.data.rawMarkdown, '断网后保存');
  assert.equal((await request('/api/local-runtime/status')).body.data.pendingOperations, status.pendingOperations, JSON.stringify(runtime.store.readOutbox().at(-1)));
});

test('桌面助手路由放行受信预览，预算离线时禁止生成且所有助手请求绑定资料集', async t => {
  const root = temporaryDirectory(t);
  const distRoot = path.join(root, 'dist');
  fs.mkdirSync(distRoot);
  fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head><body>Knowra</body></html>');
  const credentialSource = {
    credentialReference: async () => ({ provider: 'deepseek', modelId: 'deepseek-flash', credentialRef: 'synthetic-ref' }),
    resolveCredential: async () => { throw new Error('合成验收不得读取真实密钥'); }
  };
  const runtime = await startLocalRuntime({ dataDirectory: path.join(root, 'data'), distRoot,
    credentialSource, syncOptions: { autoSync: false } });
  t.after(async () => runtime.close());
  const cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  const dataset = runtime.store.getStatus().datasetId;
  async function call(route, method = 'GET', body, datasetHeader = dataset, extraHeaders = {}) {
    const response = await fetch(`${runtime.origin}${route}`, { method, headers: { Cookie: cookie,
      ...(datasetHeader ? { 'X-Knowra-Dataset': datasetHeader } : {}), 'Content-Type': 'application/json', ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, payload: await response.json() };
  }
  assert.equal((await call('/api/ai/assistant/status', 'GET', undefined, null)).payload.error.code, 'LOCAL_DATASET_CHANGED');
  assert.equal((await call('/api/ai/assistant/status', 'GET', undefined, 'other')).status, 409);
  const status = (await call('/api/ai/assistant/status')).payload.data;
  assert.equal(status.executionLocation, 'local');
  assert.equal(status.configured, true);
  assert.equal(status.generationAvailable, false);
  assert.deepEqual(status.capabilities.readScopes, ['note', 'folder']);
  assert.equal(status.capabilities.writeTools, false);
  const space = (await call('/api/knowledge/spaces/default', 'POST', {})).payload.data;
  const note = (await call('/api/knowledge/notes', 'POST', { spaceId: space.id,
    title: '合成笔记', rawMarkdown: 'alpha 正文' })).payload.data;
  const preview = await call('/api/ai/assistant/preview', 'POST', { spaceId: space.id,
    scope: { kind: 'note', noteId: note.id }, question: 'alpha 是什么？' }, dataset,
  { 'X-Knowra-AI-Assistant': '1' });
  assert.equal(preview.status, 200, JSON.stringify(preview.payload));
  assert.deepEqual(preview.payload.data.sources.map(source => source.text), ['alpha 正文']);
  assert.equal((await call('/api/ai/assistant/jobs', 'POST', { previewId: preview.payload.data.previewId,
    scopeHash: preview.payload.data.scopeHash, payloadHash: preview.payload.data.payloadHash,
    idempotencyKey: 'synthetic-01' }, dataset, { 'X-Knowra-AI-Assistant': '1' })).payload.error.code,
  'AI_GENERATION_UNAVAILABLE');
  assert.equal((await call('/api/ai/assistant/jobs', 'GET')).status, 422);
  assert.equal((await runtime.store.aiRepository.list('aiJob')).length, 0);
});
