import assert from 'node:assert/strict';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { startMcpSocketServer } from '../src/mcp/socket-server.mjs';
import { temporaryDirectory } from './helpers.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('MCP 退出回收空预连接，重复关闭共用同一排空', async t => {
  const socketPath = path.join(temporaryDirectory(t), 'mcp', 'runtime.sock');
  const runtime = await startMcpSocketServer({ socketPath, pairings: {}, gate: {} });
  const socket = net.connect(socketPath);
  let closing;
  try {
    await once(socket, 'connect'); await delay(20);
    closing = runtime.close(); assert.equal(runtime.close(), closing);
    assert.equal(await Promise.race([closing.then(() => true), delay(500).then(() => false)]), true);
  } finally { socket.destroy(); await (closing ?? runtime.close()); }
});

test('MCP 工具执行中客户端断开仍等待工具完成才结束 close', async t => {
  const socketPath = path.join(temporaryDirectory(t), 'mcp', 'runtime.sock');
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  let committed = false;
  const runtime = await startMcpSocketServer({ socketPath, pairings: {}, gate: {
    async call() { entered.resolve(); await release.promise; committed = true; return { saved: true }; }
  } });
  let request, closing;
  try {
    request = http.request({ socketPath, path: '/mcp/v1/call', method: 'POST', headers: { 'Content-Type': 'application/json' } });
    request.on('error', () => {}); request.end(JSON.stringify({ tool: 'synthetic' }));
    await entered.promise;
    request.destroy();
    let done = false; closing = runtime.close().then(() => { done = true; });
    await delay(30); assert.equal(done, false); assert.equal(committed, false);
    release.resolve(); await closing; assert.equal(committed, true);
  } finally { release.resolve(); request?.destroy(); await (closing ?? runtime.close()); }
});
