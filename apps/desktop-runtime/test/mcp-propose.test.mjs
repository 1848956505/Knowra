import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { connectMcpRuntime } from '../src/mcp/client.mjs';
import { temporaryDirectory } from './helpers.mjs';

const P1 = '线粒体是细胞的能量工厂，通过有氧呼吸产生大部分ATP。';
const P2 = '线粒体拥有自己的DNA，可以半自主复制。';
const P3 = '叶绿体负责光合作用，不属于动物细胞。';
const BODY = `${P1}\n\n${P2}\n\n${P3}`;
const HEADERS = { 'X-Knowra-MCP-Pairing': '1' };

async function setup(t, { limits, dataDirectory, proposals = true } = {}) {
  const root = temporaryDirectory(t), distRoot = path.join(root, 'dist');
  fs.mkdirSync(distRoot, { recursive: true }); fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head></html>');
  const data = dataDirectory ?? path.join(root, 'data');
  const start = () => startLocalRuntime({ dataDirectory: data, distRoot, syncOptions: { autoSync: false }, mcpLimits: limits, logger: { warn() {}, error() {} } });
  let runtime = await start();
  t.after(() => runtime?.close());
  const env = { data, root };
  const login = async () => { env.cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0]; };
  await login();
  env.call = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(`${runtime.origin}${route}`, { method, headers: { Cookie: env.cookie, 'Content-Type': 'application/json',
      'X-Knowra-Dataset': runtime.store.getStatus().datasetId, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  env.space = (await env.call('/api/knowledge/spaces/default', 'POST', {})).data;
  env.setProposals = async enabled => env.call('/api/ai/features', 'PUT', { knowledgeProposals: enabled }, { 'X-Knowra-AI-Features': '1' });
  if (proposals) await env.setProposals(true);
  env.note = async (title, extra = {}) => (await env.call('/api/knowledge/notes', 'POST', { spaceId: env.space.id, title, rawMarkdown: BODY, ...extra })).data;
  env.pair = async (body = {}) => (await env.call('/api/local-runtime/mcp/pairings', 'POST', { label: '提议测试', spaceId: env.space.id, scope: { kind: 'library' },
    egressConfirmed: true, allowPropose: true, proposeConfirmed: true, ...body }, HEADERS));
  env.client = pairing => connectMcpRuntime({ pairingFile: pairing.pairingFile });
  env.items = async () => (await env.call('/api/knowledge/items')).data;
  env.restart = async () => { await runtime.close(); runtime = await start(); await login(); };
  env.stop = async () => { await runtime.close(); runtime = null; };
  return env;
}
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code, error.message); return true; });
const propose = (client, noteId, quote, extra = {}) => client.call('knowledge_propose', { candidates: [{ title: `知识：${quote.slice(0, 6)}`, canonicalStatement: `依据原文整理：${quote}`,
  knowledgeType: 'concept', citations: [{ noteId, quote }] }], ...extra });
const readAll = (client, noteId) => client.call('notes_read', { noteId, start: 0, end: BODY.length });

test('提交候选：读取后提交成功，只成为待审核候选；来源摘要是 mcp 模式且不含对话内容', async t => {
  const env = await setup(t);
  const note = await env.note('细胞器');
  const pairing = (await env.pair()).data;
  assert.equal(pairing.allowPropose, true);
  const client = env.client(pairing);
  await readAll(client, note.id);
  const result = await propose(client, note.id, P1);
  assert.deepEqual(result.meta, { saved: true, candidates: 1, reused: false });
  assert.deepEqual(result.fragments, []);
  const items = await env.items();
  assert.equal(items.length, 1);
  assert.equal(items[0].reviewStatus, 'candidate'); assert.equal(items[0].sourceMode, 'ai');
  const provenance = (await env.call(`/api/knowledge/items/${items[0].id}/provenance`)).data;
  const record = provenance.record;
  assert.equal(record.executionMode, 'mcp'); assert.equal(record.provider, 'external-client'); assert.equal(record.modelId, 'unreported');
  assert.deepEqual(Object.keys(record.origin).sort(), ['callId', 'pairingId', 'receiptHash', 'requestId', 'spaceId']);
  assert.equal(record.origin.pairingId, pairing.pairingId);
  assert.equal(record.sources[0].quoteText, P1); assert.equal(record.sources[0].noteId, note.id);
  assert(!JSON.stringify(record).includes('对话'));
  // 审计：只有工具名与结果，没有候选内容。
  const audit = (await env.call('/api/local-runtime/mcp/audit')).data.items.find(item => item.tool === 'knowledge_propose');
  assert.equal(audit.status, 'ok'); assert(!JSON.stringify(audit).includes('依据原文整理'));
  // 外部客户端无法确认：调用结果与可用工具里都没有确认能力，候选保持 candidate。
  const tools = (await client.listTools()).map(tool => tool.name).sort();
  assert.deepEqual(tools, ['annotations_list', 'knowledge_propose', 'notes_read', 'notes_search']);
  await rejects(propose(client, note.id, P1, { reviewStatus: 'confirmed' }), 'MCP_REQUEST_INVALID');
  await rejects(client.call('knowledge_propose', { candidates: [{ title: 't', canonicalStatement: '陈述', knowledgeType: 'concept', reviewStatus: 'confirmed', citations: [{ noteId: note.id, quote: P1 }] }] }), 'MCP_REQUEST_INVALID');
  assert.equal((await env.items())[0].reviewStatus, 'candidate');
});

test('幂等：相同内容或相同幂等键重试返回同一结果，不重复创建', async t => {
  const env = await setup(t);
  const note = await env.note('幂等');
  const client = env.client((await env.pair()).data);
  await readAll(client, note.id);
  assert.equal((await propose(client, note.id, P1)).meta.reused, false);
  assert.deepEqual((await propose(client, note.id, P1)).meta, { saved: true, candidates: 1, reused: true });
  assert.equal((await env.items()).length, 1);
  const keyed = await propose(client, note.id, P2, { idempotencyKey: 'retry-key-0001' });
  assert.equal(keyed.meta.reused, false);
  assert.equal((await propose(client, note.id, P2, { idempotencyKey: 'retry-key-0001' })).meta.reused, true);
  assert.equal((await env.items()).length, 2);
});

test('三层开关：没有开启的配对看不到也调不了；全局“AI 提炼知识点”关闭、AI 或外发关闭时一律拒绝且不保存', async t => {
  const env = await setup(t);
  const note = await env.note('开关');
  const readOnly = (await env.pair({ allowPropose: false, proposeConfirmed: undefined })).data;
  assert.equal(readOnly.allowPropose, false);
  const readClient = env.client(readOnly);
  assert.deepEqual((await readClient.listTools()).map(tool => tool.name).sort(), ['annotations_list', 'notes_read', 'notes_search']);
  await rejects(propose(readClient, note.id, P1), 'MCP_PROPOSE_NOT_ALLOWED');
  // 开启提交必须单独确认。
  assert.equal((await env.pair({ proposeConfirmed: undefined })).error.code, 'MCP_PROPOSE_UNCONFIRMED');
  assert.equal((await env.pair({ proposeConfirmed: false })).error.code, 'MCP_PROPOSE_UNCONFIRMED');
  const client = env.client((await env.pair()).data);
  await readAll(client, note.id);
  await env.setProposals(false);
  await rejects(propose(client, note.id, P1), 'MCP_PROPOSALS_DISABLED');
  assert.equal((await readAll(client, note.id)).fragments.length, 1, '关闭提议开关不影响只读');
  await env.setProposals(true);
  for (const [name, code] of [['KNOWRA_AI_EGRESS_ENABLED', 'MCP_EGRESS_DISABLED'], ['KNOWRA_AI_ENABLED', 'MCP_AI_DISABLED']]) {
    const previous = process.env[name]; process.env[name] = '0';
    try { await rejects(propose(client, note.id, P1), code); } finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
  }
  assert.equal((await env.items()).length, 0);
  assert.equal((await propose(client, note.id, P1)).meta.saved, true);
});

test('已读约束：未读、读过之外的原文、别的配对读过的原文、重启后都不能引用', async t => {
  const env = await setup(t);
  const note = await env.note('已读约束');
  const a = env.client((await env.pair({ label: 'A' })).data), b = env.client((await env.pair({ label: 'B' })).data);
  await rejects(propose(a, note.id, P1), 'MCP_PROPOSAL_NOT_READ');
  await a.call('notes_read', { noteId: note.id, start: 0, end: P1.length });
  await rejects(propose(a, note.id, P3), 'MCP_PROPOSAL_INVALID');
  await rejects(propose(a, note.id, P1.slice(0, 5) + '被篡改的引文'), 'MCP_PROPOSAL_INVALID');
  await rejects(propose(b, note.id, P1), 'MCP_PROPOSAL_NOT_READ');
  await rejects(propose(a, 'no-such-note', P1), 'MCP_PROPOSAL_INVALID');
  assert.equal((await env.items()).length, 0);
  assert.equal((await propose(a, note.id, P1)).meta.saved, true);
  await env.restart();
  await rejects(propose(a, note.id, P2, { idempotencyKey: 'after-restart-1' }), 'MCP_PROPOSAL_NOT_READ');
  await a.call('notes_read', { noteId: note.id, start: 0, end: BODY.length });
  assert.equal((await propose(a, note.id, P2, { idempotencyKey: 'after-restart-1' })).meta.saved, true);
});

test('来源变化与越权：读取后正文被修改、笔记超出范围/被排除/变私密，都不能保存', async t => {
  const env = await setup(t);
  const inside = await env.note('范围内'), outside = await env.note('范围外'), excluded = await env.note('被排除'), secret = await env.note('私密', { aiVisibility: 'private' });
  const client = env.client((await env.pair({ scope: { kind: 'fixed', noteIds: [inside.id, excluded.id, secret.id] }, excludedNoteIds: [excluded.id] })).data);
  await readAll(client, inside.id);
  for (const target of [outside, excluded, secret]) {
    // 别的笔记读过原文不等于这篇读过：引文必须落在“这篇笔记”已读的片段里。
    await rejects(propose(client, target.id, P1), 'MCP_PROPOSAL_INVALID');
    await rejects(readAll(client, target.id), 'MCP_ACCESS_REVOKED');
  }
  const fresh = (await env.call(`/api/knowledge/notes/${inside.id}`)).data;
  assert.equal((await env.call(`/api/knowledge/notes/${inside.id}`, 'PATCH', { rawMarkdown: `${BODY}\n\n新增段落`, expectedUpdatedAt: fresh.updatedAt })).status, 200);
  await rejects(propose(client, inside.id, P1), 'MCP_SOURCE_CHANGED');
  await readAll(client, inside.id);
  assert.equal((await propose(client, inside.id, P1)).meta.saved, true);
  assert.equal((await env.call(`/api/knowledge/notes/${inside.id}`, 'PATCH', { aiVisibility: 'private' })).status, 200);
  await rejects(propose(client, inside.id, P2, { idempotencyKey: 'after-private-1' }), 'MCP_ACCESS_REVOKED');
  assert.equal((await env.items()).length, 1);
});

test('原子与去重：任一候选与已有知识重复，整批不保存', async t => {
  const env = await setup(t);
  const note = await env.note('去重');
  const client = env.client((await env.pair()).data);
  await readAll(client, note.id);
  await propose(client, note.id, P1);
  const duplicateOf = `依据原文整理：${P1}`;
  const candidate = (quote, statement) => ({ title: statement.slice(0, 6), canonicalStatement: statement, knowledgeType: 'concept', citations: [{ noteId: note.id, quote }] });
  await rejects(client.call('knowledge_propose', { candidates: [candidate(P2, '线粒体拥有自己的DNA。'), candidate(P1, duplicateOf)] }), 'MCP_PROPOSAL_DUPLICATE');
  assert.equal((await env.items()).length, 1, '整批回滚，第二条重复时第一条也没有保存');
});

test('数量上限：每个配对每天提交的候选条数有上限，超限返回稳定错误与重试时间', async t => {
  const env = await setup(t, { limits: { maxCandidatesPerDay: 2 } });
  const note = await env.note('配额');
  const client = env.client((await env.pair()).data);
  await readAll(client, note.id);
  const candidate = (quote, title) => ({ title, canonicalStatement: `${title}的陈述`, knowledgeType: 'concept', citations: [{ noteId: note.id, quote }] });
  assert.equal((await client.call('knowledge_propose', { candidates: [candidate(P1, '一'), candidate(P2, '二')] })).meta.candidates, 2);
  const limited = await client.call('knowledge_propose', { candidates: [candidate(P3, '三')] }).catch(error => error);
  assert.equal(limited.code, 'MCP_RATE_LIMITED'); assert(limited.retryAfterSeconds >= 1);
  assert.equal((await env.items()).length, 2);
});

test('撤销后不能再提交，已提交的候选保留且仍是待审核', async t => {
  const env = await setup(t);
  const note = await env.note('撤销');
  const pairing = (await env.pair()).data;
  const client = env.client(pairing);
  await readAll(client, note.id);
  await propose(client, note.id, P1);
  await env.call(`/api/local-runtime/mcp/pairings/${pairing.pairingId}/revoke`, 'POST', {}, HEADERS);
  await rejects(propose(client, note.id, P2), 'MCP_PAIRING_FILE_MISSING');
  const items = await env.items();
  assert.equal(items.length, 1); assert.equal(items[0].reviewStatus, 'candidate');
});

test('一篇笔记读后被改动，不影响引用另一篇仍然有效的已读原文', async t => {
  const env = await setup(t);
  const changed = await env.note('会被改动'), stable = await env.note('保持不变');
  const client = env.client((await env.pair()).data);
  await readAll(client, changed.id); await readAll(client, stable.id);
  const fresh = (await env.call(`/api/knowledge/notes/${changed.id}`)).data;
  assert.equal((await env.call(`/api/knowledge/notes/${changed.id}`, 'PATCH', { rawMarkdown: `${BODY}\n\n新增`, expectedUpdatedAt: fresh.updatedAt })).status, 200);
  assert.equal((await propose(client, stable.id, P1)).meta.saved, true, '被改动那篇的旧已读记录不能拖累其他笔记的提议');
  await rejects(propose(client, changed.id, P2), 'MCP_PROPOSAL_INVALID');
});
