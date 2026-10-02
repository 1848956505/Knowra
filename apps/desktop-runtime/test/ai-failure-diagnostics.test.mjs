import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createR07Fixture, inspectR07FixtureState } from './fixtures/ai-r07-runtime.mjs';

for (const driver of ['json', 'sqlite', 'postgres']) {
  test(`失败现场读取不初始化真实 ${driver} 动作账本`, {
    timeout: 60000, skip: driver === 'postgres' && !process.env.KNOWRA_SYNC_TEST_DATABASE_URL
  }, async t => {
    const fixture = await createR07Fixture(driver);
    t.after(() => fixture.close());
    // 等待 API 的异步会话恢复完成；不打开页面或访问动作账本。
    if (driver !== 'sqlite') {
      const ready = await fetch(`${fixture.origin}/api/ai/assistant/status`);
      assert.equal(ready.status, 200);
    }
    const before = await fixture.readActionSnapshot();
    const businessRead = fixture.runtime.actionStore.read;
    fixture.runtime.actionStore.read = () => { throw new Error('诊断禁止调用会初始化的业务读取'); };
    const write = fs.writeFileSync, rename = fs.renameSync;
    let writes = 0;
    fs.writeFileSync = (...args) => { writes++; return write(...args); };
    fs.renameSync = (...args) => { writes++; return rename(...args); };
    try {
      const state = await inspectR07FixtureState(fixture);
      assert.deepEqual(state.actions, []);
      assert.deepEqual(state.turns, []);
      assert.deepEqual(await fixture.readActionSnapshot(), before);
      assert.equal(writes, 0, '诊断不写文件或发布替换文件');
    } finally {
      fs.writeFileSync = write; fs.renameSync = rename;
      fixture.runtime.actionStore.read = businessRead;
    }
  });
}
