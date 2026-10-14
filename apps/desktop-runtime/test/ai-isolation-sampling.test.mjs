import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureR07CoreHttp } from './fixtures/ai-r07-core-probe.mjs';
import { p95 } from '../../api/test/fixtures/http-latency-samples.mjs';

test('40 个乱序样本按 nearest-rank 计算 p95，保留原采样顺序', () => {
  const samples = Array.from({ length: 40 }, (_, index) => 40 - index);
  assert.equal(p95(samples), 38); assert.equal(samples[0], 40);
  assert.throws(() => p95(samples.slice(0, 39)), /40/);
});

function probe(t, { failFirstFault = false } = {}) {
  const events = [], bodies = new Map();
  let fault = false, closes = 0, hangCloses = 0, assertions = 0;
  const fixture = { origin: 'http://synthetic.invalid', launchUrl: 'http://synthetic.invalid/',
    adapter: { calls: [] }, close: async () => { closes++; events.push('fixture-close'); } };
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const route = new URL(url).pathname;
    if (route === '/') return { headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
    if (route.endsWith('/spaces/default')) return { status: 201, json: async () => ({ data: { id: 'space' } }) };
    const create = route === '/api/knowledge/notes';
    let body;
    if (create) { body = JSON.parse(options.body); bodies.set(body.id, body); events.push(`create:${fault}`); }
    return { status: create ? 201 : 200, json: async () => {
      if (create && fault && bodies.size === 4) {
        events.push('first-fault-body-start');
        await new Promise(resolve => setTimeout(resolve, 25));
        if (failFirstFault) throw new Error('synthetic body failure');
        events.push('first-fault-body-end');
      }
      events.push(`body:${route}`);
      return { data: create ? body : bodies.get(route.split('/').at(-1)) ?? {} };
    } };
  });
  return { events, dependencies: {
    createFixture: async () => fixture,
    startHang: async () => {
      assert.equal(bodies.size, 3, '故障只能在三次完整常规热身之后注入');
      fault = true; events.push('ready');
      return { assertActive() { assertions++; }, async close() { hangCloses++; events.push('hang-close'); return { error: { code: 'AI_CANCELLED' } }; } };
    }
  }, counts: () => ({ closes, hangCloses, assertions, notes: bodies.size }) };
}

test('故障首样计入正式40次，完整body耗时入样本，结束后清理', async t => {
  const f = probe(t);
  const samples = await measureR07CoreHttp('json', 'process-fault', f.dependencies);
  assert.equal(samples.length, 40);
  assert(samples[0] >= 20, '故障第一条响应体延迟必须计入首样');
  assert(f.events.indexOf('first-fault-body-end') < f.events.indexOf('body:/api/knowledge/notes/00000000-0000-4000-8000-000000000003'));
  assert.deepEqual(f.counts(), { closes: 1, hangCloses: 1, assertions: 80, notes: 43 });
  assert(f.events.indexOf('hang-close') < f.events.indexOf('fixture-close'));
});

test('响应体读取失败仍终止挂起进程并关闭独立fixture', async t => {
  const f = probe(t, { failFirstFault: true });
  await assert.rejects(measureR07CoreHttp('json', 'process-fault', f.dependencies), /synthetic body failure/);
  assert.deepEqual(f.counts(), { closes: 1, hangCloses: 1, assertions: 1, notes: 4 });
});
