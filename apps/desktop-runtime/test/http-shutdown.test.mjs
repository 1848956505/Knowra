import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { createHttpShutdown } from '../src/http-shutdown.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }

test('部分 HTTP 头已收到时不当作空预连接销毁，重复 close 共用排空', async () => {
  const received = deferred();
  const server = http.createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk; });
    request.on('end', () => response.end(`saved:${body}`));
  });
  server.on('connection', socket => socket.once('data', received.resolve));
  const close = createHttpShutdown(server);
  const port = await listen(server);
  const socket = net.connect(port, '127.0.0.1');
  let text = ''; socket.on('data', chunk => { text += chunk; });
  try {
    await once(socket, 'connect');
    socket.write(`POST / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`);
    await received.promise;
    const closing = close();
    assert.equal(close(), closing);
    let done = false; void closing.then(() => { done = true; });
    await delay(30);
    assert.equal(done, false); assert.equal(socket.destroyed, false);
    socket.end('Connection: close\r\nContent-Length: 4\r\n\r\nsave');
    await once(socket, 'close'); await closing;
    assert.match(text, /saved:save/);
  } finally { socket.destroy(); await close(); }
});

test('handler 已返回但响应仍在输出时等待完整响应，不强断连接', async () => {
  const started = deferred(), release = deferred();
  const expected = '完整响应'.repeat(10000);
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Length': Buffer.byteLength(expected) });
    response.write(expected.slice(0, 10)); started.resolve();
    void release.promise.then(() => response.end(expected.slice(10)));
  });
  const close = createHttpShutdown(server);
  const port = await listen(server);
  let request;
  try {
    const body = new Promise((resolve, reject) => {
      request = http.get(`http://127.0.0.1:${port}`, response => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject); response.on('end', () => resolve(Buffer.concat(chunks).toString()));
      }); request.on('error', reject);
    });
    await started.promise;
    let done = false; const closing = close().then(() => { done = true; });
    await delay(30); assert.equal(done, false);
    release.resolve();
    assert.equal(await body, expected); await closing;
  } finally { release.resolve(); request?.destroy(); await close(); }
});

test('客户端早断开后仍等待异步写任务，不把网络关闭当成持久化完成', async () => {
  const entered = deferred(), release = deferred(), handlers = new Set();
  let committed = false;
  const server = http.createServer(async (_request, response) => {
    const done = deferred(); handlers.add(done.promise); entered.resolve();
    try { await release.promise; committed = true; response.end('saved'); }
    finally { handlers.delete(done.promise); done.resolve(); }
  });
  const close = createHttpShutdown(server, handlers);
  const port = await listen(server);
  const socket = net.connect(port, '127.0.0.1');
  try {
    await once(socket, 'connect'); socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
    await entered.promise;
    socket.destroy();
    let done = false; const closing = close().then(() => { done = true; });
    await delay(30); assert.equal(done, false); assert.equal(committed, false);
    release.resolve(); await closing; assert.equal(committed, true);
  } finally { release.resolve(); socket.destroy(); await close(); }
});
