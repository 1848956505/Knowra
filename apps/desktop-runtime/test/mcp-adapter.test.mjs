import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { anchorForBlock, projectMarkdown, calculateContentHash } from '@study-accelerator/content-anchor';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { temporaryDirectory } from './helpers.mjs';

const ADAPTER = fileURLToPath(new URL('../src/mcp/adapter.mjs', import.meta.url));
const BODY = '线粒体是细胞的能量工厂，负责有氧呼吸。\n\n细胞核储存遗传信息，指导蛋白质合成。\n\n核糖体在细胞质中合成蛋白质。';

async function setup(t, { dataDirectory } = {}) {
  const root = temporaryDirectory(t), distRoot = path.join(root, 'dist');
  fs.mkdirSync(distRoot, { recursive: true }); fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head><body>Knowra</body></html>');
  const data = dataDirectory ?? path.join(root, 'data');
  let runtime = await startLocalRuntime({ dataDirectory: data, distRoot, syncOptions: { autoSync: false }, logger: { warn() {}, error() {} } });
  t.after(() => runtime?.close());
  const env = { data, distRoot, root, get runtime() { return runtime; } };
  const login = async () => { env.cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0]; };
  await login();
  env.call = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(`${runtime.origin}${route}`, { method, headers: { Cookie: env.cookie, 'Content-Type': 'application/json',
      'X-Knowra-Dataset': runtime.store.getStatus().datasetId, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  env.space = (await env.call('/api/knowledge/spaces/default', 'POST', {})).data;
  env.note = async (title, extra = {}) => (await env.call('/api/knowledge/notes', 'POST', { spaceId: env.space.id, title, rawMarkdown: BODY, ...extra })).data;
  env.pair = async (body = {}) => (await env.call('/api/local-runtime/mcp/pairings', 'POST', { label: '适配器测试', spaceId: env.space.id,
    scope: { kind: 'library' }, egressConfirmed: true, ...body }, { 'X-Knowra-MCP-Pairing': '1' })).data;
  env.annotate = async (note, index, importance) => {
    const anchor = anchorForBlock(projectMarkdown(note.rawMarkdown), index);
    const created = await env.call('/api/knowledge/annotations', 'POST', { noteId: note.id, spaceId: note.spaceId, schemaVersion: 2, scopeType: 'blocks', anchor,
      quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, noteContentHash: calculateContentHash(note.rawMarkdown),
      anchorFingerprint: `a${index}`, idempotencyKey: `a${index}-${note.id}`, importance });
    assert.equal(created.status, 201, JSON.stringify(created));
    return created.data;
  };
  env.restart = async () => { await runtime?.close(); runtime = await startLocalRuntime({ dataDirectory: data, distRoot, syncOptions: { autoSync: false }, logger: { warn() {}, error() {} } }); await login(); };
  env.stop = async () => { await runtime.close(); runtime = null; };
  return env;
}

async function connect(t, pairingFile) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [ADAPTER, '--pairing-file', pairingFile], stderr: 'pipe' });
  const stderr = []; transport.stderr?.on('data', chunk => stderr.push(chunk));
  const client = new Client({ name: 'acceptance', version: '0.0.0' });
  await client.connect(transport);
  t.after(() => client.close());
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...result, text: result.content?.[0]?.text ?? '', stderr: () => Buffer.concat(stderr).toString() };
  };
  return { client, call, stderr: () => Buffer.concat(stderr).toString() };
}
const errorCode = result => { assert.equal(result.isError, true, result.text); return result.text.split('：')[0]; };

test('真实 stdio 子进程：initialize、列工具、检索、读取、重点列表，结果带偏移与片段', async t => {
  const env = await setup(t);
  const note = await env.note('细胞器');
  await env.annotate(note, 0, 'core'); await env.annotate(note, 1, 'important');
  const pairing = await env.pair();
  const { client, call } = await connect(t, pairing.pairingFile);
  assert.equal(client.getServerVersion().name, 'knowra');
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['annotations_list', 'notes_read', 'notes_search']);
  for (const tool of tools) { assert(tool.description.length > 10); assert.equal(tool.inputSchema.type, 'object'); assert.equal(tool.inputSchema.additionalProperties, false); }

  const found = await call('notes_search', { query: '线粒体' });
  assert.equal(found.isError, undefined, found.text);
  assert.equal(found.structuredContent.fragments[0].noteId, note.id);
  assert.match(found.structuredContent.fragments[0].text, /线粒体/);
  const hit = found.structuredContent.fragments[0];
  assert.equal(BODY.slice(hit.start, hit.end), hit.text);

  const read = await call('notes_read', { noteId: note.id, start: 0, end: 12 });
  assert.equal(read.structuredContent.fragments[0].text, BODY.slice(0, 12));
  assert.deepEqual(read.structuredContent.meta, { length: BODY.length, hasMore: true });
  const more = await call('notes_read', { noteId: note.id, start: 12 });
  assert.equal(more.structuredContent.fragments[0].end, BODY.length);
  assert.equal(more.structuredContent.meta.hasMore, false);

  const annotations = await call('annotations_list', { noteId: note.id });
  assert.equal(annotations.structuredContent.fragments.length, 2);
  assert.equal(annotations.structuredContent.fragments[0].attrs.importance, 'core');
  assert.match(annotations.structuredContent.fragments[0].text, /线粒体/);
  assert.equal(annotations.structuredContent.meta.total, 2);
  const important = await call('annotations_list', { noteId: note.id, minImportance: 'core' });
  assert.equal(important.structuredContent.fragments.length, 1);
  const paged = await call('annotations_list', { noteId: note.id, limit: 1, offset: 1 });
  assert.equal(paged.structuredContent.fragments.length, 1); assert.equal(paged.structuredContent.meta.hasMore, false);

  const token = JSON.parse(fs.readFileSync(pairing.pairingFile, 'utf8')).token;
  assert(!found.stderr().includes(token) && !JSON.stringify(found).includes(token), '令牌不出现在输出里');
  const audit = (await env.call('/api/local-runtime/mcp/audit')).data.items;
  assert(audit.filter(item => item.event === 'call' && item.status === 'ok').length >= 6);
  assert(!JSON.stringify(audit).includes('线粒体'));
});

test('越权、私密、被排除、非法与伪造参数：工具错误且不返回正文', async t => {
  const env = await setup(t);
  const inside = await env.note('范围内'), outside = await env.note('范围外'), excluded = await env.note('被排除'), secret = await env.note('私密', { aiVisibility: 'private' });
  const pairing = await env.pair({ scope: { kind: 'fixed', noteIds: [inside.id, excluded.id, secret.id] }, excludedNoteIds: [excluded.id] });
  const { call } = await connect(t, pairing.pairingFile);
  assert.equal((await call('notes_read', { noteId: inside.id, start: 0, end: 5 })).isError, undefined);
  for (const target of [outside, excluded, secret]) {
    for (const tool of ['notes_read', 'annotations_list']) {
      const result = await call(tool, { noteId: target.id });
      assert.equal(errorCode(result), 'MCP_ACCESS_REVOKED'); assert(!result.text.includes('线粒体'));
    }
  }
  const search = await call('notes_search', { query: '线粒体' });
  assert.deepEqual(search.structuredContent.fragments.map(item => item.noteId), [inside.id], '检索只返回授权范围内的笔记');
  // 参数：多余字段（owner/授权/审核状态）、类型错误、越界。
  for (const [tool, args] of [['notes_read', { noteId: inside.id, ownerId: 'x' }], ['notes_read', { noteId: inside.id, start: -1 }], ['notes_read', { noteId: inside.id, start: 99999 }],
    ['notes_read', { noteId: 5 }], ['notes_search', { query: '' }], ['notes_search', { query: '线粒体', limit: 99 }], ['notes_search', { query: '线粒体', limit: 6 }], ['notes_search', { query: '线粒体', policyId: 'p' }],
    ['annotations_list', { noteId: inside.id, minImportance: 'x' }], ['annotations_list', { noteId: inside.id, grantId: 'g', status: 'confirmed' }]]) {
    assert.equal(errorCode(await call(tool, args)), 'MCP_REQUEST_INVALID', `${tool} ${JSON.stringify(args)}`);
  }
  assert.equal(errorCode(await call('notes_write', { noteId: inside.id })), 'MCP_TOOL_UNKNOWN');
  assert.equal(errorCode(await call('knowledge_propose', {})), 'MCP_TOOL_UNKNOWN');
  // 笔记在授权后改为私密：立即不可读。
  assert.equal((await env.call(`/api/knowledge/notes/${inside.id}`, 'PATCH', { aiVisibility: 'private' })).status, 200);
  assert.equal(errorCode(await call('notes_read', { noteId: inside.id })), 'MCP_ACCESS_REVOKED');
});

test('知境未运行、重启重连、撤销：适配器不读数据库，错误清晰', async t => {
  const env = await setup(t);
  const note = await env.note('重连');
  const pairing = await env.pair();
  const { call } = await connect(t, pairing.pairingFile);
  assert.equal((await call('notes_read', { noteId: note.id, start: 0, end: 4 })).isError, undefined);
  await env.restart();
  assert.equal((await call('notes_read', { noteId: note.id, start: 0, end: 4 })).isError, undefined, '运行端重启后无需重启适配器');
  await env.stop();
  assert.equal(errorCode(await call('notes_read', { noteId: note.id })), 'MCP_RUNTIME_UNAVAILABLE');
  // 适配器只依赖本机通道：不包含任何数据库、存储或 API 业务模块。
  for (const name of ['adapter.mjs', 'stdio-server.mjs', 'adapter-core.mjs', 'client.mjs']) {
    const source = fs.readFileSync(path.join(path.dirname(ADAPTER), name), 'utf8');
    assert(!/sqlite|data-store|api\/src|node:sqlite|prisma/i.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${name} 不应依赖数据库或业务模块`);
  }
  await env.restart();
  const revoked = await env.call(`/api/local-runtime/mcp/pairings/${pairing.pairingId}/revoke`, 'POST', {}, { 'X-Knowra-MCP-Pairing': '1' });
  assert.equal(revoked.data.status, 'revoked');
  assert.equal(errorCode(await call('notes_read', { noteId: note.id })), 'MCP_PAIRING_FILE_MISSING');
});

test('协议健壮性：非法行、未知方法不使进程崩溃，stdout 只含 JSON-RPC，缺少参数时退出', async t => {
  const env = await setup(t);
  const pairing = await env.pair();
  const missing = await new Promise(resolve => { const child = spawn(process.execPath, [ADAPTER]); let out = ''; child.stdout.on('data', c => { out += c; });
    child.on('exit', code => resolve({ code, out })); });
  assert.equal(missing.code, 2); assert.equal(missing.out, '');

  const child = spawn(process.execPath, [ADAPTER, '--pairing-file', pairing.pairingFile]);
  t.after(() => child.kill());
  const lines = []; let buffer = '';
  child.stdout.on('data', chunk => { buffer += chunk; let index; while ((index = buffer.indexOf('\n')) >= 0) { lines.push(buffer.slice(0, index)); buffer = buffer.slice(index + 1); } });
  const waitFor = async predicate => { for (let i = 0; i < 100; i += 1) { const found = lines.map(line => { try { return JSON.parse(line); } catch { return null; } }).find(item => item && predicate(item)); if (found) return found; await new Promise(r => setTimeout(r, 30)); } throw new Error(`no response: ${lines}`); };
  const send = message => child.stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
  send('{ 这不是 json');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } });
  const init = await waitFor(item => item.id === 1);
  assert.equal(init.result.serverInfo.name, 'knowra'); assert.deepEqual(Object.keys(init.result.capabilities), ['tools']);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
  assert((await waitFor(item => item.id === 2)).error, '未知方法返回协议错误');
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope', arguments: {} } });
  assert.match((await waitFor(item => item.id === 3)).result.content[0].text, /MCP_TOOL_UNKNOWN/);
  send({ jsonrpc: '2.0', id: 4, method: 'tools/list' });
  assert.equal((await waitFor(item => item.id === 4)).result.tools.length, 3);
  assert(lines.every(line => { try { JSON.parse(line); return true; } catch { return false; } }), `stdout 出现非 JSON-RPC 内容：${lines}`);
  assert.equal(child.exitCode, null, '进程仍在运行');
});
