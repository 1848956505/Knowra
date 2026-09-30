import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createR07Fixture } from '../fixtures/ai-r07-runtime.mjs';
import { AI_PROCESS_LIMITS, createIsolatedDeepSeekAdapter } from '../../../api/src/modules/ai/isolated-provider.js';

for (const driver of ['json', 'sqlite', ...(process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? ['postgres'] : [])]) {
  test(`R07 ${driver} 子进程故障及 AI 私有存储故障不阻塞核心 HTTP`, { timeout: 60000 }, async t => {
    let fixture = await createR07Fixture(driver, { aiEnabled: false });
    t.after(() => fixture.close());
    const requests = async () => {
    const launch = await fetch(fixture.launchUrl, { redirect: 'manual' });
    const cookie = launch.headers.get('set-cookie')?.split(';')[0];
    const headers = { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
      ...(driver === 'sqlite' ? { 'X-Knowra-Dataset': (await fixture.store.identity()).datasetId } : {}) };
    return (route, method = 'GET', body) => fetch(`${fixture.origin}${route}`, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    };
    let call = await requests();
    let space = (await (await call('/api/knowledge/spaces/default', 'POST', {})).json()).data;
    const syncRoute = driver === 'sqlite' ? '/api/local-runtime/sync' : '/api/sync/status';
    const exercise = async () => {
      const samples = [];
      for (let i = 0; i < 8; i++) {
        const id = randomUUID(), start = performance.now();
        assert.equal((await call('/api/knowledge/notes', 'POST', { id, spaceId: space.id,
          title: `隔离合成笔记 ${id}`, rawMarkdown: '子进程故障期间核心保存。' })).status, 201);
        const read = await call(`/api/knowledge/notes/${id}`);
        assert.equal(read.status, 200);
        assert.equal((await read.json()).data.rawMarkdown, '子进程故障期间核心保存。');
        assert.equal((await call(syncRoute)).status, 200);
        samples.push(performance.now() - start);
      }
      return samples.sort((a, b) => a - b);
    };
    const off = await exercise();
    assert.equal((await (await call('/api/ai/assistant/status')).json()).data.generationAvailable, false);
    assert.equal(fixture.adapter.calls.length, 0);
    await fixture.close();
    fixture = await createR07Fixture(driver);
    call = await requests();
    space = (await (await call('/api/knowledge/spaces/default', 'POST', {})).json()).data;
    const idle = await exercise();
    const childUrl = new URL('../../../api/test/fixtures/ai-process-fixture.mjs', import.meta.url);
    const isolated = createIsolatedDeepSeekAdapter({ childUrl, limits: { ...AI_PROCESS_LIMITS, wallMs: 3000 } });
    const stuck = isolated.complete({ mode: 'hang' });
    // 立即附加拒绝处理，避免较慢环境在采样结束前超时产生未处理拒绝。
    const outcome = stuck.then(() => null, error => error);
    const fault = await exercise();
    assert.equal((await outcome).code, 'AI_PROCESS_TIMEOUT');
    const p95 = values => values[Math.ceil(values.length * .95) - 1];
    console.log(`R07 ${driver} 核心三操作每组 8 次：关闭=${JSON.stringify(off.map(x => +x.toFixed(1)))}ms；空闲=${JSON.stringify(idle.map(x => +x.toFixed(1)))}ms；卡死=${JSON.stringify(fault.map(x => +x.toFixed(1)))}ms；p95=${p95(fault).toFixed(1)}ms；最大=${fault.at(-1).toFixed(1)}ms`);
    assert(p95(fault) < Math.max(250, p95(idle) * 3));
    assert(fault.at(-1) < 1000);
    for (const [mode, code] of [['crash', 'AI_PROCESS_FAILED'], ['limit', 'AI_PROCESS_LIMIT']]) {
      await assert.rejects(isolated.complete({ mode }), error => error.code === code);
      assert.equal((await call(syncRoute)).status, 200);
    }
    const identity = fixture.runtime.repository.identity;
    fixture.runtime.repository.identity = async () => { throw new Error('synthetic AI private storage fault'); };
    try {
      const status = (await (await call('/api/ai/assistant/status')).json()).data;
      assert.equal(status.generationAvailable, false);
      assert.match(status.unavailableReason, /私有存储不可用/);
      assert.equal((await call(`/api/ai/assistant/jobs?spaceId=${encodeURIComponent(space.id)}`)).status, 503);
      const storageFault = await exercise();
      assert(p95(storageFault) < Math.max(250, p95(idle) * 3));
      assert(storageFault.at(-1) < 1000);
    } finally { fixture.runtime.repository.identity = identity; }
    assert.equal((await call('/api/ai/assistant/status')).status, 200);
  });
}
