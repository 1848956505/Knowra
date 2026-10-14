import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { temporaryDirectory } from './helpers.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('实际 AI 关闭失败保留资料库与目录锁，不假装退出或创建第二个 owner', async t => {
  const root = temporaryDirectory(t);
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./fixtures/runtime-close-failure.mjs', import.meta.url)), root], { timeout: 5000 });
  assert.deepEqual(JSON.parse(stdout), { rejected: true, sameClose: true, secondBlocked: true,
    storeOpen: true, lockExists: true, stages: ['mcp', 'http', 'sync', 'ai'] });
});
async function setup(t) {
  const root = temporaryDirectory(t), distRoot = path.join(root, 'dist');
  fs.mkdirSync(distRoot); fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head></html>');
  const stages = [];
  const options = { dataDirectory: path.join(root, 'data'), distRoot, syncOptions: { autoSync: false } };
  const runtime = await startLocalRuntime({ ...options, onCloseStage: stage => stages.push(stage) });
  return { runtime, stages, options };
}

test('退出关闭未发送 HTTP 的预连接，不等待浏览器主动断开', async t => {
  const { runtime } = await setup(t);
  const socket = net.connect(Number(new URL(runtime.origin).port), '127.0.0.1');
  await once(socket, 'connect');
  await delay(20);
  let closing;
  try {
    closing = runtime.close();
    assert.equal(await Promise.race([closing.then(() => true), delay(500).then(() => false)]), true);
  } finally { socket.destroy(); await closing; }
});

test('退出等待已接纳保存的完整请求和响应，随后才关闭资料库', async t => {
  const { runtime, stages, options } = await setup(t);
  const session = await fetch(runtime.launchUrl, { redirect: 'manual' });
  await session.arrayBuffer();
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${runtime.origin}/api/knowledge/spaces/default`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}'
  });
  const space = (await response.json()).data;
  const markdown = '退出期间必须完整保存。'.repeat(3000);
  const body = JSON.stringify({ id: 'shutdown-note', spaceId: space.id, title: '退出保存', rawMarkdown: markdown });
  let request, closing;
  try {
    let resolveResponse, rejectResponse;
    const saved = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
    request = http.request(`${runtime.origin}/api/knowledge/notes`, { method: 'POST', headers: {
      Cookie: cookie, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Expect: '100-continue'
    } }, reply => {
      const chunks = [];
      reply.on('data', chunk => chunks.push(chunk));
      reply.on('error', rejectResponse);
      reply.on('end', () => resolveResponse({ status: reply.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    request.on('error', rejectResponse);
    request.flushHeaders();
    await once(request, 'continue');
    request.write(body.slice(0, 20));
    let done = false;
    closing = runtime.close().then(() => { done = true; });
    await delay(50);
    assert.equal(done, false, '不能中断仍在读取正文的保存');
    request.end(body.slice(20));
    const result = await saved;
    assert.equal(result.status, 201);
    assert.equal(result.body.data.id, 'shutdown-note');
    assert.equal(result.body.data.rawMarkdown, markdown, '响应正文不能被断连接截断');
    await closing;
    assert.deepEqual(stages, ['mcp', 'http', 'sync', 'ai', 'store', 'released']);
    const reopened = await startLocalRuntime(options);
    try {
      const session = await fetch(reopened.launchUrl, { redirect: 'manual' });
      await session.arrayBuffer();
      const read = await fetch(`${reopened.origin}/api/knowledge/notes/shutdown-note`, {
        headers: { Cookie: session.headers.get('set-cookie').split(';')[0] }
      });
      assert.equal((await read.json()).data.rawMarkdown, markdown, '退出后重开仍有完整持久化正文');
    } finally { await reopened.close(); }
  } finally { request?.destroy(); await (closing ?? runtime.close()); }
});
