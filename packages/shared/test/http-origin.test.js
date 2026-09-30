import assert from 'node:assert/strict';
import test from 'node:test';
import { writeOriginDecision } from '../src/http-origin.js';

test('代理信任必须同时显式开启与回环连接，转发 Host 永不用于来源判断', () => {
  const request = { headers: { host: 'public.example', origin: 'https://public.example', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.example' }, socket: { remoteAddress: '203.0.113.5' } };
  assert.equal(writeOriginDecision(request, { trustProxy: true }).allowed, false);
  request.socket.remoteAddress = '127.0.0.1';
  assert.equal(writeOriginDecision(request).allowed, false);
  assert.equal(writeOriginDecision(request, { trustProxy: true }).allowed, true);
  request.headers.origin = 'https://evil.example';
  assert.equal(writeOriginDecision(request, { trustProxy: true }).allowed, false);
});
