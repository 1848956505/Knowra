import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { connectMcpRuntime, readPairingFile } from '../src/mcp/client.mjs';
import { createAuditLog } from '../src/mcp/audit-log.mjs';
import { temporaryDirectory } from './helpers.mjs';

const SECRET_BODY = '这是只允许授权范围内读取的合成正文，用来验证外发出口。';

/** 测试专用工具：按偏移返回正文片段；M2 的真实工具走同一个出口。 */
function testTools(extra = {}) {
  return {
    read_slice: { metaKeys: ['total'], run: async ({ input, grantId, access }) => {
      const { note, version } = await access.verifyRead({ grantId, noteId: input.noteId, tool: 'notes_read' });
      const end = input.end ?? version.content.length;
      return { fragments: [{ noteId: note.id, title: note.title, start: input.start ?? 0, end, text: version.content.slice(input.start ?? 0, end) }], meta: { total: version.content.length } };
    } },
    // 绕过授权校验直接读仓库的恶意/有缺陷工具：必须被出口拦住。
    raw: { metaKeys: ['count'], run: async ({ input }) => input.result },
    ...extra
  };
}

async function setup(t, { tools = testTools(), limits, now, dataDirectory } = {}) {
  const root = temporaryDirectory(t), distRoot = path.join(root, 'dist');
  fs.mkdirSync(distRoot); fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head><body>Knowra</body></html>');
  const data = dataDirectory ?? path.join(root, 'data');
  const runtime = await startLocalRuntime({ dataDirectory: data, distRoot, syncOptions: { autoSync: false }, mcpTools: tools, mcpLimits: limits, mcpNow: now });
  let closed = false;
  t.after(() => closed ? undefined : runtime.close());
  const cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  const call = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(`${runtime.origin}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json',
      'X-Knowra-Dataset': runtime.store.getStatus().datasetId, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  const space = (await call('/api/knowledge/spaces/default', 'POST', {})).data;
  const note = async (title, extra = {}) => (await call('/api/knowledge/notes', 'POST', { spaceId: space.id, title, rawMarkdown: SECRET_BODY, ...extra })).data;
  const pair = async (body = {}) => call('/api/local-runtime/mcp/pairings', 'POST',
    { label: '测试客户端', spaceId: space.id, scope: { kind: 'library' }, egressConfirmed: true, ...body }, { 'X-Knowra-MCP-Pairing': '1' });
  const socketPath = fs.readdirSync(path.join(data, 'mcp')).includes('runtime.sock') ? path.join(data, 'mcp', 'runtime.sock') : null;
  return { runtime, call, space, note, pair, data, root, socketPath, async stop() { closed = true; await runtime.close(); } };
}
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code, error.message); return true; });
const withEnv = async (name, value, run) => {
  const previous = process.env[name];
  process.env[name] = value;
  try { return await run(); } finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
};

test('配对：必须确认外发；响应与记录不含令牌，配对文件与目录权限收紧', async t => {
  const env = await setup(t);
  assert.equal((await env.pair({ egressConfirmed: undefined })).error.code, 'MCP_EGRESS_UNCONFIRMED');
  assert.equal((await env.pair({ egressConfirmed: false })).error.code, 'MCP_EGRESS_UNCONFIRMED');
  assert.equal((await env.call('/api/local-runtime/mcp/pairings', 'POST', { label: 'x', spaceId: env.space.id, scope: { kind: 'library' }, egressConfirmed: true })).status, 403, '缺少请求头');
  const created = await env.pair();
  assert.equal(created.status, 201);
  const file = created.data.pairingFile;
  const pairing = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(env.data, 'mcp')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert(!JSON.stringify(created).includes(pairing.token), '响应不含令牌');
  const records = fs.readFileSync(path.join(env.data, 'mcp', 'pairings.json'), 'utf8');
  assert(!records.includes(pairing.token), '记录只存哈希');
  assert.match(records, /"verifier":"[0-9a-f]{64}"/);
  assert.deepEqual(pairing.socketPath, path.join(env.data, 'mcp', 'runtime.sock').length <= 100 ? path.join(env.data, 'mcp', 'runtime.sock') : pairing.socketPath);
  assert.equal(created.data.status, 'active');
  assert.equal((await env.call('/api/local-runtime/mcp/pairings')).data.items.length, 1);
  assert(!JSON.stringify((await env.call('/api/local-runtime/mcp/pairings')).data).includes(pairing.token));
  assert.equal(fs.statSync(pairing.socketPath).mode & 0o777, 0o600, 'socket 权限 0600');
});

test('读取经统一外发出口：返回逐字正文与片段清单，审计无正文/标题/令牌', async t => {
  const env = await setup(t);
  const target = await env.note('合成标题');
  const created = (await env.pair()).data;
  const client = connectMcpRuntime({ pairingFile: created.pairingFile });
  const result = await client.call('read_slice', { noteId: target.id, start: 0, end: 10 });
  assert.equal(result.fragments[0].text, SECRET_BODY.slice(0, 10));
  assert.deepEqual(result.meta, { total: SECRET_BODY.length });
  assert.equal(result.fragments[0].title, '合成标题');
  const audit = (await env.call('/api/local-runtime/mcp/audit')).data.items;
  const entry = audit.find(item => item.event === 'call');
  assert.equal(entry.status, 'ok'); assert.equal(entry.tool, 'read_slice'); assert.equal(entry.fragments, 1);
  assert.equal(entry.manifest[0].bytes, Buffer.byteLength(SECRET_BODY.slice(0, 10)));
  assert.deepEqual(Object.keys(entry.manifest[0]).sort(), ['bytes', 'end', 'noteId', 'noteVersionId', 'start']);
  const rawAudit = fs.readFileSync(path.join(env.data, 'mcp', 'audit.jsonl'), 'utf8');
  const token = JSON.parse(fs.readFileSync(created.pairingFile, 'utf8')).token;
  for (const forbidden of [SECRET_BODY.slice(0, 6), '合成标题', token]) assert(!rawAudit.includes(forbidden));
  assert.equal(fs.statSync(path.join(env.data, 'mcp', 'audit.jsonl')).mode & 0o777, 0o600);
  assert.equal((await env.call('/api/local-runtime/mcp/pairings')).data.items[0].calls, 1);
  await rejects(client.call('missing_tool', {}), 'MCP_TOOL_UNKNOWN');
  await rejects(client.call('read_slice', []), 'MCP_REQUEST_INVALID');
});

test('越权与伪造：范围外、被排除、私密、正文不一致、版本漂移都被出口拦截且不返回正文', async t => {
  const env = await setup(t);
  const inside = await env.note('范围内'), outside = await env.note('范围外'), excluded = await env.note('排除'), secret = await env.note('私密', { aiVisibility: 'private' });
  const created = (await env.pair({ scope: { kind: 'fixed', noteIds: [inside.id, excluded.id, secret.id] }, excludedNoteIds: [excluded.id] })).data;
  const client = connectMcpRuntime({ pairingFile: created.pairingFile });
  assert.equal((await client.call('read_slice', { noteId: inside.id, start: 0, end: 4 })).fragments.length, 1);
  for (const target of [outside, excluded, secret]) await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_ACCESS_REVOKED');
  const fragment = text => ({ result: { fragments: [{ noteId: inside.id, title: '范围内', start: 0, end: 4, text }] } });
  await rejects(client.call('raw', fragment('伪造的正文')), 'MCP_RESULT_INVALID');
  await rejects(client.call('raw', { result: { fragments: [{ noteId: inside.id, title: '被改的标题', start: 0, end: 4, text: SECRET_BODY.slice(0, 4) }] } }), 'MCP_RESULT_INVALID');
  await rejects(client.call('raw', { result: { fragments: [{ noteId: outside.id, title: '范围外', start: 0, end: 4, text: SECRET_BODY.slice(0, 4) }] } }), 'MCP_ACCESS_REVOKED');
  await rejects(client.call('raw', { result: { fragments: [{ noteId: inside.id, title: '范围内', start: 0, end: 9999, text: SECRET_BODY }] } }), 'MCP_RESULT_INVALID');
  await rejects(client.call('raw', { result: { fragments: [], meta: { leak: SECRET_BODY } } }), 'MCP_RESULT_INVALID');
  // 未声明的键即使值是布尔值也不放行：它会绕开片段清单。
  await rejects(client.call('raw', { result: { fragments: [], meta: { 未授权正文: true } } }), 'MCP_RESULT_INVALID');
  await rejects(client.call('raw', { result: { fragments: [], meta: { count: '1' } } }), 'MCP_RESULT_INVALID');
  assert.deepEqual((await client.call('raw', { result: { fragments: [], meta: { count: 2 } } })).meta, { count: 2 });
  await rejects(client.call('raw', { result: 'plain text' }), 'MCP_RESULT_INVALID');
  // 笔记在授权后改为私密：下一次调用即被拒。
  assert.equal((await env.call(`/api/knowledge/notes/${inside.id}`, 'PATCH', { aiVisibility: 'private' })).status, 200);
  await rejects(client.call('read_slice', { noteId: inside.id }), 'MCP_ACCESS_REVOKED');
  // 客户端传入 owner/授权/策略等字段不会改变授权：出口只认配对绑定的策略。
  await rejects(client.call('read_slice', { noteId: outside.id, ownerId: 'someone', policyId: created.policyId, grantId: 'x', status: 'confirmed' }), 'MCP_ACCESS_REVOKED');
});

test('AI 开关与紧急外发开关逐调用生效；两者互不替代', async t => {
  const env = await setup(t);
  const target = await env.note('开关');
  const client = connectMcpRuntime({ pairingFile: (await env.pair()).data.pairingFile });
  assert.equal((await client.call('read_slice', { noteId: target.id })).fragments.length, 1);
  await withEnv('KNOWRA_AI_EGRESS_ENABLED', '0', () => rejects(client.call('read_slice', { noteId: target.id }), 'MCP_EGRESS_DISABLED'));
  await withEnv('KNOWRA_AI_ENABLED', '0', () => rejects(client.call('read_slice', { noteId: target.id }), 'MCP_AI_DISABLED'));
  // “AI 提炼知识点”开关与只读无关：关闭时仍可读（默认即关闭）。
  assert.equal((await env.call('/api/ai/features', 'GET')).data.knowledgeProposals, false);
  assert.equal((await client.call('read_slice', { noteId: target.id })).fragments.length, 1);
  assert.equal((await env.call('/api/local-runtime/mcp/audit')).data.items.filter(item => item.code === 'MCP_EGRESS_DISABLED').length, 1);
});

test('撤销与过期：立即拒绝，进行中的调用在校验点终止且不返回正文', async t => {
  let current = Date.now();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const env = await setup(t, { now: () => new Date(current), tools: testTools({
    slow: async ({ input, grantId, access }) => { await gate; return testTools().read_slice.run({ input, grantId, access }); } }) });
  const target = await env.note('撤销');
  const first = (await env.pair()).data;
  const saved = JSON.parse(fs.readFileSync(first.pairingFile, 'utf8'));
  const client = connectMcpRuntime({ pairingFile: first.pairingFile });
  const inflight = client.call('slow', { noteId: target.id }).then(() => 'returned', error => error.code);
  await new Promise(resolve => setTimeout(resolve, 150));
  const revoked = await env.call(`/api/local-runtime/mcp/pairings/${first.pairingId}/revoke`, 'POST', {}, { 'X-Knowra-MCP-Pairing': '1' });
  assert.equal(revoked.data.status, 'revoked');
  release();
  assert.equal(await inflight, 'MCP_PAIRING_REVOKED');
  assert.equal(fs.existsSync(first.pairingFile), false, '撤销删除配对文件');
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_PAIRING_FILE_MISSING');
  // 用泄露的旧令牌直接调用仍被拒（不依赖配对文件）。
  const raw = await new Promise(resolve => {
    const body = JSON.stringify({ tool: 'read_slice', input: { noteId: target.id } });
    const req = http.request({ socketPath: saved.socketPath, path: '/mcp/v1/call', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saved.token}` } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.end(body);
  });
  assert.equal(raw.status, 401); assert.equal(raw.body.error.code, 'MCP_PAIRING_REVOKED');
  assert.equal((await env.pair().then(r => r.data.status)), 'active');
  const expiring = (await env.pair({ expiresInDays: 1 })).data;
  const expClient = connectMcpRuntime({ pairingFile: expiring.pairingFile });
  assert.equal((await expClient.call('read_slice', { noteId: target.id })).fragments.length, 1);
  current += 2 * 86_400_000;
  await rejects(expClient.call('read_slice', { noteId: target.id }), 'MCP_PAIRING_EXPIRED');
  assert.equal(fs.existsSync(expiring.pairingFile), false, '过期后删除含原始令牌的配对文件');
  assert.equal((await env.call('/api/local-runtime/mcp/pairings')).data.items.find(item => item.pairingId === expiring.pairingId).status, 'expired');
});

test('工具执行期间外发被紧急关闭：返回前复核，不返回正文', async t => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const env = await setup(t, { tools: testTools({ slow: async args => { await hold; return testTools().read_slice.run(args); } }) });
  const target = await env.note('执行中关闭外发');
  const client = connectMcpRuntime({ pairingFile: (await env.pair()).data.pairingFile });
  await withEnv('KNOWRA_AI_EGRESS_ENABLED', '1', async () => {
    const inflight = client.call('slow', { noteId: target.id }).then(() => 'returned', error => error.code);
    await new Promise(resolve => setTimeout(resolve, 150));
    process.env.KNOWRA_AI_EGRESS_ENABLED = '0';
    release();
    assert.equal(await inflight, 'MCP_EGRESS_DISABLED');
  });
});

test('限流与大小：超限返回稳定错误与重试时间，不静默截断，且不进入 AI 预算账本', async t => {
  let current = Date.parse('2026-10-06T10:00:00Z');
  const env = await setup(t, { limits: { perMinute: 3, perDay: 5, concurrent: 1, maxResultBytes: 700 }, now: () => new Date(current) });
  const target = await env.note('限流', { rawMarkdown: '限'.repeat(400) });
  const ledger = () => env.runtime.store.readSync(db => ['ai_usage_records', 'ai_jobs', 'ai_job_attempts'].map(table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n));
  const ledgerBefore = ledger();
  const client = connectMcpRuntime({ pairingFile: (await env.pair()).data.pairingFile });
  for (let index = 0; index < 3; index += 1) assert.equal((await client.call('read_slice', { noteId: target.id, start: 0, end: 3 })).fragments.length, 1);
  const limited = await client.call('read_slice', { noteId: target.id, start: 0, end: 3 }).catch(error => error);
  assert.equal(limited.code, 'MCP_RATE_LIMITED'); assert(limited.retryAfterSeconds >= 1 && limited.retryAfterSeconds <= 60);
  current += 61_000;
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_RESULT_TOO_LARGE');
  assert.equal((await client.call('read_slice', { noteId: target.id, start: 0, end: 3 })).fragments.length, 1);
  current += 61_000;
  const day = await client.call('read_slice', { noteId: target.id, start: 0, end: 3 }).catch(error => error);
  assert.equal(day.code, 'MCP_RATE_LIMITED'); assert(day.retryAfterSeconds > 60, '每日上限的重试时间指向次日');
  assert.deepEqual(ledger(), ledgerBefore, '外部调用不产生用量/任务记录');
});

test('配对记录损坏：停用配对能力并保留原文件，不误删有效令牌文件；记录恢复后自动恢复', async t => {
  const first = await setup(t);
  const target = await first.note('记录损坏');
  const created = (await first.pair()).data;
  const records = path.join(first.data, 'mcp', 'pairings.json');
  const good = fs.readFileSync(records, 'utf8');
  await first.stop();
  for (const broken of ['{ 不是 json', '{}', '[{"pairingId":1}]']) {
    fs.writeFileSync(records, broken);
    const second = await setup(t, { dataDirectory: first.data });
    assert.equal(fs.existsSync(created.pairingFile), true, `损坏记录（${broken}）时不清扫有效配对文件`);
    assert.equal((await second.call('/api/local-runtime/mcp/pairings')).error.code, 'MCP_STORE_UNAVAILABLE');
    assert.equal((await second.pair()).error.code, 'MCP_STORE_UNAVAILABLE');
    await rejects(connectMcpRuntime({ pairingFile: created.pairingFile }).call('read_slice', { noteId: target.id }), 'MCP_STORE_UNAVAILABLE');
    assert.equal(fs.readFileSync(records, 'utf8'), broken, '损坏的记录没有被覆盖');
    const saved = await second.call('/api/knowledge/notes', 'POST', { spaceId: second.space.id, title: `核心仍可保存 ${broken.length}`, rawMarkdown: '正文' });
    assert.equal(saved.status, 201, JSON.stringify(saved));
    // 修复记录后无需重启即可恢复。
    fs.writeFileSync(records, good);
    const restored = (await second.call('/api/local-runtime/mcp/pairings')).data.items;
    assert.equal(restored.find(item => item.pairingId === created.pairingId).status, 'active');
    assert.equal(fs.existsSync(created.pairingFile), true);
    assert.equal((await connectMcpRuntime({ pairingFile: created.pairingFile }).call('read_slice', { noteId: target.id })).fragments.length, 1);
    await second.stop();
  }
  // 记录文件不存在是首次使用：空列表，孤儿文件才会被清扫。
  fs.rmSync(records);
  const third = await setup(t, { dataDirectory: first.data });
  assert.deepEqual((await third.call('/api/local-runtime/mcp/pairings')).data.items, []);
  assert.equal(fs.existsSync(created.pairingFile), false, '记录确实不存在时，无记录的文件按孤儿清理');
});

test('大小上限按最终序列化响应计：JSON 转义、标题与偏移都算在内', async t => {
  const env = await setup(t);
  const quotes = await env.note('转义', { rawMarkdown: '"'.repeat(40_000) });
  const client = connectMcpRuntime({ pairingFile: (await env.pair()).data.pairingFile });
  // 正文只有 40,000 字节，但转义后的响应超过 64 KiB。
  await rejects(client.call('read_slice', { noteId: quotes.id }), 'MCP_RESULT_TOO_LARGE');
  assert.equal((await client.call('read_slice', { noteId: quotes.id, start: 0, end: 10_000 })).fragments[0].text.length, 10_000);
});

test('过期配对重启后清理：原始令牌文件与孤儿文件都被删除', async t => {
  let current = Date.now();
  const first = await setup(t, { now: () => new Date(current) });
  const created = (await first.pair({ expiresInDays: 1 })).data;
  const keep = (await first.pair({ expiresInDays: 30 })).data;
  const orphan = path.join(path.dirname(created.pairingFile), `${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.json`);
  fs.writeFileSync(orphan, '{}', { mode: 0o600 });
  await first.stop();
  assert.equal(fs.existsSync(created.pairingFile), true, '重启前文件仍在（尚未过期）');
  current += 2 * 86_400_000;
  const second = await setup(t, { now: () => new Date(current), dataDirectory: first.data });
  assert.equal(fs.existsSync(created.pairingFile), false, '启动即清理过期配对的令牌文件');
  assert.equal(fs.existsSync(orphan), false, '孤儿文件被清理');
  assert.equal(fs.existsSync(keep.pairingFile), true, '有效配对不受影响');
  assert.equal((await second.call('/api/local-runtime/mcp/pairings')).data.items.find(item => item.pairingId === created.pairingId).status, 'expired');
});

test('并发上限：第二个并发调用被限流', async t => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const env = await setup(t, { limits: { concurrent: 1 }, tools: testTools({ slow: async () => { await hold; return { fragments: [] }; } }) });
  const client = connectMcpRuntime({ pairingFile: (await env.pair()).data.pairingFile });
  const first = client.call('slow', {});
  await new Promise(resolve => setTimeout(resolve, 150));
  await rejects(client.call('slow', {}), 'MCP_RATE_LIMITED');
  release(); assert.deepEqual((await first).fragments, []);
});

test('身份隔离：浏览器会话与配对令牌互不通用，socket 不提供普通 API', async t => {
  const env = await setup(t);
  const created = (await env.pair()).data;
  const { token, socketPath } = JSON.parse(fs.readFileSync(created.pairingFile, 'utf8'));
  for (const headers of [{ Authorization: `Bearer ${token}` }, { Cookie: `knowra_local_x=${token}` }]) {
    const response = await fetch(`${env.runtime.origin}/api/knowledge/notes`, { headers });
    assert.equal(response.status, 401);
  }
  const viaSocket = (route, headers = {}, method = 'POST') => new Promise(resolve => {
    const req = http.request({ socketPath, path: route, method, headers: { 'Content-Type': 'application/json', ...headers } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }));
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    req.end(method === 'POST' ? '{"tool":"read_slice","input":{}}' : undefined);
  });
  assert.equal((await viaSocket('/mcp/v1/call', { Cookie: 'knowra_local_x=abc' })).body.error.code, 'MCP_TOKEN_INVALID');
  assert.equal((await viaSocket('/mcp/v1/call', { Authorization: 'Bearer knp1.not-a-token' })).body.error.code, 'MCP_TOKEN_INVALID');
  assert.equal((await viaSocket('/api/knowledge/notes', { Authorization: `Bearer ${token}` })).status, 404);
  assert.equal((await viaSocket('/mcp/v1/call', { Authorization: `Bearer ${token}` }, 'GET')).status, 400);
  // 末位必须换成不同的字符：原末位恰好是 0 时固定替换成 0 会得到原令牌，测试就会随机失败。
  const flipped = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
  assert.notEqual(flipped, token);
  assert.equal((await viaSocket('/mcp/v1/call', { Authorization: `Bearer ${flipped}` })).body.error.code, 'MCP_TOKEN_INVALID');
});

test('运行端身份：旧 socket、伪造 socket、权限异常时适配器不发送令牌', async t => {
  const env = await setup(t);
  const created = (await env.pair()).data;
  const pairing = JSON.parse(fs.readFileSync(created.pairingFile, 'utf8'));
  const client = connectMcpRuntime({ pairingFile: created.pairingFile });
  const target = await env.note('身份');
  assert.equal((await client.call('read_slice', { noteId: target.id })).fragments.length, 1);
  await env.stop();
  assert.equal(fs.existsSync(pairing.socketPath), false, '正常退出删除 socket');
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_RUNTIME_UNAVAILABLE');

  // 崩溃遗留：进程被杀，socket 文件还在但没有监听者。
  const crash = () => { try { execFileSync(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(pairing.socketPath)},()=>process.kill(process.pid,'SIGKILL'))`], { stdio: 'ignore' }); } catch { /* 预期被杀 */ } };
  crash();
  assert(fs.lstatSync(pairing.socketPath).isSocket(), '遗留了旧 socket');
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_RUNTIME_UNTRUSTED');
  fs.chmodSync(pairing.socketPath, 0o600);
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_RUNTIME_UNAVAILABLE');

  // 他人占用同一路径：伪造的对端既拿不到令牌，也过不了身份验证。
  fs.rmSync(pairing.socketPath);
  const seen = [];
  const impostor = http.createServer((request, response) => {
    seen.push({ url: request.url, authorization: request.headers.authorization ?? null });
    request.resume();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: { proof: 'f'.repeat(64) } }));
  });
  await new Promise(resolve => impostor.listen(pairing.socketPath, resolve));
  fs.chmodSync(pairing.socketPath, 0o600);
  t.after(() => impostor.close());
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_RUNTIME_UNTRUSTED');
  assert.deepEqual(seen.map(item => item.url), ['/mcp/v1/handshake'], '只发生握手');
  assert(seen.every(item => item.authorization === null), '令牌没有发给伪造对端');
  assert(!JSON.stringify(seen).includes(pairing.token));

  // 权限异常：socket 或其目录对他人开放时，连握手都不发起。
  seen.length = 0;
  fs.chmodSync(pairing.socketPath, 0o666);
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_RUNTIME_UNTRUSTED');
  fs.chmodSync(pairing.socketPath, 0o600);
  fs.chmodSync(path.dirname(pairing.socketPath), 0o755);
  await rejects(client.call('read_slice', { noteId: target.id }), 'MCP_RUNTIME_UNTRUSTED');
  fs.chmodSync(path.dirname(pairing.socketPath), 0o700);
  assert.equal(seen.length, 0, '权限异常时没有任何连接');

  // 配对文件被放宽权限：拒绝使用。
  fs.chmodSync(created.pairingFile, 0o644);
  assert.throws(() => readPairingFile(created.pairingFile), { code: 'MCP_PAIRING_FILE_UNSAFE' });
  fs.chmodSync(created.pairingFile, 0o600);

  // 崩溃后重启：同目录遗留的旧 socket 被清理，原配对继续有效。
  await new Promise(resolve => impostor.close(resolve));
  crash();
  const restarted = await setup(t, { dataDirectory: env.data });
  assert.equal((await client.call('read_slice', { noteId: target.id })).fragments.length, 1);
  assert.equal(fs.statSync(pairing.socketPath).mode & 0o777, 0o600);
  void restarted;
});

test('审计日志：只收白名单字段并按大小轮转', t => {
  const directory = path.join(temporaryDirectory(t), 'audit');
  const log = createAuditLog({ directory, maxBytes: 300 });
  for (let index = 0; index < 20; index += 1) log.append({ event: 'call', pairingId: 'p', tool: 't', status: 'ok', text: '正文不应写入', token: 'secret', input: { q: 1 } });
  const raw = fs.readdirSync(directory).map(name => fs.readFileSync(path.join(directory, name), 'utf8')).join('');
  assert(!raw.includes('正文不应写入') && !raw.includes('secret') && !raw.includes('"input"'));
  assert(fs.existsSync(path.join(directory, 'audit.1.jsonl')));
  assert(fs.statSync(path.join(directory, 'audit.jsonl')).size < 600);
  assert(log.recent({ limit: 5 }).length === 5);
});
