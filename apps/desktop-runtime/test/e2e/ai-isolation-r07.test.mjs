import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureR07CoreHttp, isolationAdapter } from '../fixtures/ai-r07-core-probe.mjs';
import { CORE_HTTP_SAMPLE_COUNT, p95 } from '../../../api/test/fixtures/http-latency-samples.mjs';

test('R07 挂起进程仍受原 3 秒墙钟预算限制', { timeout: 10000 }, async () => {
  await assert.rejects(isolationAdapter().complete({ mode: 'hang' }), error => error.code === 'AI_PROCESS_TIMEOUT');
});

for (const driver of ['json', 'sqlite', ...(process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? ['postgres'] : [])]) {
  test(`R07 ${driver} 子进程故障及 AI 私有存储故障不阻塞核心 HTTP`, { timeout: 60000 }, async () => {
    const off = await measureR07CoreHttp(driver, 'off');
    const idle = await measureR07CoreHttp(driver, 'idle');
    const threshold = Math.max(250, p95(idle) * 3);
    for (const phase of ['process-fault', 'storage-fault']) {
      const samples = await measureR07CoreHttp(driver, phase);
      assert.equal(samples.length, CORE_HTTP_SAMPLE_COUNT);
      console.log(`R07 ${driver} ${phase} 核心三操作每组 ${CORE_HTTP_SAMPLE_COUNT} 次：关闭p95=${p95(off).toFixed(1)}ms；空闲p95=${p95(idle).toFixed(1)}ms；故障p95=${p95(samples).toFixed(1)}ms；最大=${Math.max(...samples).toFixed(1)}ms`);
      assert(p95(samples) < threshold, `${driver} ${phase} p95=${p95(samples)}ms，门槛=${threshold}ms`);
      assert(Math.max(...samples) < 1000, `${driver} ${phase} 最大值=${Math.max(...samples)}ms`);
    }
  });
}
