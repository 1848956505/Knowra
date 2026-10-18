import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { normalizeTaskWorkspaceGrants, assertTaskGrantConfirmation, createTaskMcpAccess, authorizeTaskMcpContext } from '../src/mcp/task-access.mjs';
import { createTaskMcpExecutor } from '../src/mcp/task-executor.mjs';
import { createTaskMcpTools } from '../src/mcp/task-tools.mjs';
import { taskImageResult, taskTextResult } from '../src/mcp/task-output.mjs';
const grant = { workspaceId: 'w', read: true, writeDocuments: true, executeTasks: true, includeImages: true };
function fixture(service = {}) {
  const row = { pairingId: 'pair', taskWorkspaceDatasetId: 'dataset', taskWorkspaceDatasetEpoch: 1, expiresAt: '2099-01-01', taskWorkspaceGrants: [grant] };
  const identity = { datasetId: 'dataset', datasetEpoch: 1 };
  let enabled = true;
  const pairings = { get: id => id === row.pairingId ? row : null, assertActive(r) { if (r.revokedAt) throw Object.assign(new Error(), { code: 'MCP_REVOKED' }); } };
  const opts = { pairings, getIdentity: () => identity, assertFlags() { if (!enabled) throw Object.assign(new Error(), { code: 'MCP_DISABLED' }); } };
  return { row, identity, access: createTaskMcpAccess(opts), executor: createTaskMcpExecutor({ ...opts, getService: () => service }), opts, disable() { enabled = false; } };
}
const denied = error => error.code === 'MCP_TASK_ACCESS_REVOKED';
test('旧配对默认无权限，知识权限不升级任务权限，授权显式确认', () => {
  assert.deepEqual(normalizeTaskWorkspaceGrants(), []);
  const f = fixture(); delete f.row.taskWorkspaceGrants; f.row.allowPropose = true; f.row.allowKnowledgeRead = true;
  assert.deepEqual(f.executor.describe(f.row), []);
  assert.throws(() => f.access.capture(f.row, 'read', 'w'), denied);
  assert.throws(() => assertTaskGrantConfirmation({ taskWorkspaceGrants: [grant] }), { code: 'MCP_TASK_EGRESS_UNCONFIRMED' });
  assert.throws(() => assertTaskGrantConfirmation({ taskWorkspaceGrants: [grant], taskWorkspaceConfirmed: true }), { code: 'MCP_TASK_IMAGES_UNCONFIRMED' });
  assert.deepEqual(assertTaskGrantConfirmation({ taskWorkspaceGrants: [grant], taskWorkspaceConfirmed: true, taskImagesConfirmed: true }), [grant]);
});
test('权限分离、没有 Agent 发布验收取消工具、未知能力拒绝', () => {
  const f = fixture(); f.row.taskWorkspaceGrants = [{ workspaceId: 'w', read: true }];
  const names = f.executor.describe(f.row).map(t => t.name);
  assert(names.includes('task_documents_read')); assert(!names.includes('tasks_claim')); assert(!names.includes('task_images_read'));
  for (const name of ['tasks_publish', 'tasks_review', 'tasks_cancel', 'task_workspaces_create']) assert(!Object.hasOwn(createTaskMcpTools(), name));
  assert.equal(f.access.allows(f.row, 'allowPropose', 'w'), false);
});
test('actor只能来自pair，scope/epoch/授权变更实时拒绝，伪造ctx拒绝', () => {
  const f = fixture(), captured = f.access.capture(f.row, 'read', 'w');
  assert.deepEqual(captured.ctx.actor, { kind: 'mcp', id: 'pair' });
  assert.equal(authorizeTaskMcpContext(captured.ctx, { action: 'getDocument', workspaceId: 'private' }), false);
  assert.equal(authorizeTaskMcpContext({ ...captured.ctx }, { action: 'getDocument', workspaceId: 'w' }), false);
  assert.equal(authorizeTaskMcpContext(captured.ctx, { action: 'reviewSubmission', workspaceId: 'w' }), false);
  f.identity.datasetEpoch++; assert.throws(captured.guard, denied);
  f.identity.datasetEpoch--; f.row.taskWorkspaceGrantRevision = 1; assert.throws(captured.guard, denied);
});
test('工具参数不允许伪造actor；UTF8字节预算独立于字符长度', async () => {
  const f = fixture({ createDocument() { assert.fail('不应执行'); } });
  await assert.rejects(f.executor.call(f.row, 'task_documents_create', { operationId: 'a'.repeat(36), workspaceId: 'w', title: 'x', markdown: '', actorId: 'user' }), { code: 'MCP_REQUEST_INVALID' });
  await assert.rejects(f.executor.call(f.row, 'task_documents_create', { operationId: 'a'.repeat(36), workspaceId: 'w', title: 'x', markdown: '中'.repeat(100000) }), { code: 'MCP_REQUEST_INVALID' });
});
test('撤销后异步迟到结果不外发；超时后guard阻止迟到提交', async () => {
  let landed = false, guard;
  const f = fixture({ async listTasks(ctx) { f.row.revokedAt = 'now'; return { items: [], nextCursor: null }; } });
  await assert.rejects(f.executor.call(f.row, 'tasks_list', { workspaceId: 'w' }), { code: 'MCP_REVOKED' });
  f.row.revokedAt = null;
  const slow = { async claimTask(ctx) { guard = ctx.guard; await new Promise(resolve => setTimeout(resolve, 30)); try { ctx.guard(); landed = true; } catch {} return {}; } };
  const executor = createTaskMcpExecutor({ ...f.opts, getService: () => slow, timeoutMs: 5 });
  await assert.rejects(executor.call(f.row, 'tasks_claim', { operationId: 'a'.repeat(36), workspaceId: 'w', taskId: 't', expectedRevision: 1 }), { code: 'MCP_TIMEOUT' });
  assert.throws(guard, { code: 'MCP_TIMEOUT' }); await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(landed, false);
});
test('文档分页不切代理对，过滤存储路径/内部版本', () => {
  const source = { id: 'd', workspaceId: 'w', title: 'x', revision: 1, currentVersionId: 'v', markdown: `${'a'.repeat(16383)}😀z`, version: { id: 'v', contentHash: 'hash' }, storageKey: '/secret', versions: ['private'], attachments: [{ id: 'a', storageKey: '/private' }] };
  const dto = JSON.parse(taskTextResult('getDocument', source).content[0].text);
  assert.equal(dto.end, 16383); assert.equal(dto.hasMore, true); assert.equal(dto.storageKey, undefined); assert.equal(dto.attachments[0].storageKey, undefined);
  assert.throws(() => taskTextResult('getDocument', source, { start: 16384 }), { code: 'MCP_REQUEST_INVALID' });
  assert.equal(JSON.parse(taskTextResult('getDocument', source, { start: source.markdown.length }).content[0].text).hasMore, false);
});
test('标准 MCP image，不返回路径URL，sha/版本/尺寸复核，不套文本预算', () => {
  const bytes = Buffer.alloc(150000, 1), input = { workspaceId: 'w', documentId: 'd', versionId: 'v', attachmentId: 'a' };
  const value = { ...input, bytes, versionContentHash: 'a'.repeat(64), mimeType: 'image/png', width: 500, height: 100, storageKey: '/private', attachment: { id: 'a', documentId: 'd', status: 'ready', mimeType: 'image/png', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } };
  const result = taskImageResult(value, input);
  assert(CallToolResultSchema.safeParse(result).success); assert.equal(result.content[0].type, 'image'); assert(Buffer.from(result.content[0].data, 'base64').equals(bytes));
  assert(!JSON.stringify(result).includes('/private'));
  assert.throws(() => taskImageResult({ ...value, versionId: 'foreign' }, input), { code: 'MCP_RESULT_INVALID' });
  assert.throws(() => taskImageResult({ ...value, width: 1000000 }, input), { code: 'MCP_RESULT_INVALID' });
  assert.throws(() => taskImageResult({ ...value, bytes: Buffer.from('bad') }, input), { code: 'MCP_RESULT_INVALID' });
});

test('socket任务结果转换保持标准image且普通知识工具不能借任务信封绕出口', async () => {
  const { taskAdapterResult } = await import('../src/mcp/task-adapter-result.mjs');
  const content = [{ type: 'image', data: Buffer.from('image').toString('base64'), mimeType: 'image/png' }, { type: 'text', text: '{}' }];
  assert.deepEqual(taskAdapterResult('task_images_read', { taskContent: content }), { content });
  assert.equal(taskAdapterResult('notes_read', { fragments: [] }), null);
  assert.throws(() => taskAdapterResult('notes_read', { taskContent: content }), { code: 'MCP_RESULT_INVALID' });
  assert.throws(() => taskAdapterResult('task_images_read', { taskContent: [{ ...content[0], data: 'file:///secret' }, content[1]] }), { code: 'MCP_RESULT_INVALID' });
  assert.throws(() => taskAdapterResult('tasks_list', { taskContent: content }), { code: 'MCP_RESULT_INVALID' });
});


test('恢复同workspace UUID不继承任务权限，缺少授权epoch的旧pair也默认关闭', () => {
  const f = fixture();
  assert(f.executor.describe(f.row).length);
  f.identity.datasetEpoch = 2;
  assert.deepEqual(f.executor.describe(f.row), []);
  assert.throws(() => f.access.capture(f.row, 'read', 'w'), denied);
  f.identity.datasetEpoch = 1; delete f.row.taskWorkspaceDatasetEpoch;
  assert.deepEqual(f.executor.describe(f.row), []);
});

test('同步授权port拒绝false和Promise，不把异步复核当作许可', () => {
  const f = fixture();
  assert.throws(() => f.access.capture(f.row, 'read', 'w', () => false), denied);
  assert.throws(() => f.access.capture(f.row, 'read', 'w', () => Promise.resolve(true)), denied);
  for (const bad of [false, Promise.resolve(true)]) {
    assert.throws(() => createTaskMcpAccess({ ...f.opts, assertFlags: () => bad }).capture(f.row, 'read', 'w'), denied);
    assert.throws(() => createTaskMcpAccess({ ...f.opts, pairings: { ...f.opts.pairings, assertActive: () => bad } }).capture(f.row, 'read', 'w'), denied);
  }
  const fakeIdentity = Object.assign(Promise.resolve(f.identity), f.identity);
  assert.equal(createTaskMcpAccess({ ...f.opts, getIdentity: () => fakeIdentity }).allows(f.row, 'read', 'w'), false);
  assert.throws(() => createTaskMcpAccess({ ...f.opts, getIdentity: () => fakeIdentity }).capture(f.row, 'read', 'w'), denied);
});
