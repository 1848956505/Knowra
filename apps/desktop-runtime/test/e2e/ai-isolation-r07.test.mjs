import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createR07Fixture } from '../fixtures/ai-r07-runtime.mjs';
import { AI_PROCESS_LIMITS, createIsolatedDeepSeekAdapter } from '../../../api/src/modules/ai/isolated-provider.js';

for (const driver of ['json', 'sqlite', ...(process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? ['postgres'] : [])]) {
  test(`R07 ${driver} 子进程故障及 AI 私有存储故障不阻塞核心 HTTP`, { timeout: 60000 }, async t => {
    let fixture = await createR07Fixture(driver, { aiEnabled: false, isolatePostgres: true });
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
    const exercise = async phase => {
      const samples = [];
      const operations = [];
      const startedAt = new Date().toISOString();
      for (let i = 0; i < 8; i++) {
        const id = randomUUID(), start = performance.now();
        assert.equal((await call('/api/knowledge/notes', 'POST', { id, spaceId: space.id,
          title: `隔离合成笔记 ${id}`, rawMarkdown: '子进程故障期间核心保存。' })).status, 201);
        const savedAt = performance.now();
        const read = await call(`/api/knowledge/notes/${id}`);
        assert.equal(read.status, 200);
        assert.equal((await read.json()).data.rawMarkdown, '子进程故障期间核心保存。');
        const readAt = performance.now();
        assert.equal((await call(syncRoute)).status, 200);
        const end = performance.now();
        samples.push(end - start);
        operations.push([savedAt - start, readAt - savedAt, end - readAt]);
      }
      // 保留采样顺序和每个 HTTP 操作；故障断言失败前也能拿到完整数据。
      console.log(`R07 采样 ${JSON.stringify({ driver, phase, startedAt, endedAt: new Date().toISOString(),
        sampleMs: samples.map(x => +x.toFixed(1)),
        operationMs: operations.map(row => row.map(x => +x.toFixed(1))) })}`);
      return samples.sort((a, b) => a - b);
    };
    const off = await exercise('off');
    assert.equal((await (await call('/api/ai/assistant/status')).json()).data.generationAvailable, false);
    assert.equal(fixture.adapter.calls.length, 0);
    await fixture.close();
    fixture = await createR07Fixture(driver, { isolatePostgres: true });
    call = await requests();
    space = (await (await call('/api/knowledge/spaces/default', 'POST', {})).json()).data;
    const idle = await exercise('idle');
    const childUrl = new URL('../../../api/test/fixtures/ai-process-fixture.mjs', import.meta.url);
    const isolated = createIsolatedDeepSeekAdapter({ childUrl, limits: { ...AI_PROCESS_LIMITS, wallMs: 3000 } });
    const stuck = isolated.complete({ mode: 'hang' });
    // 立即附加拒绝处理，避免较慢环境在采样结束前超时产生未处理拒绝。
    const outcome = stuck.then(() => null, error => error);
    const fault = await exercise('process-fault');
    assert.equal((await outcome).code, 'AI_PROCESS_TIMEOUT');
    const p95 = values => values[Math.ceil(values.length * .95) - 1];
    const threshold = Math.max(250, p95(idle) * 3);
    console.log(`R07 ${driver} 核心三操作每组 8 次：关闭=${JSON.stringify(off.map(x => +x.toFixed(1)))}ms；空闲=${JSON.stringify(idle.map(x => +x.toFixed(1)))}ms；卡死=${JSON.stringify(fault.map(x => +x.toFixed(1)))}ms；p95=${p95(fault).toFixed(1)}ms；最大=${fault.at(-1).toFixed(1)}ms`);
    assert(p95(fault) < threshold, `${driver} process-fault p95=${p95(fault)}ms，门槛=${threshold}ms（8 样本 p95 等于最大值）`);
    assert(fault.at(-1) < 1000, `${driver} process-fault 最大值=${fault.at(-1)}ms`);
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
      const storageFault = await exercise('storage-fault');
      assert(p95(storageFault) < threshold, `${driver} storage-fault p95=${p95(storageFault)}ms，门槛=${threshold}ms（8 样本 p95 等于最大值）`);
      assert(storageFault.at(-1) < 1000, `${driver} storage-fault 最大值=${storageFault.at(-1)}ms`);
    } finally { fixture.runtime.repository.identity = identity; }
    assert.equal((await call('/api/ai/assistant/status')).status, 200);
  });
}
