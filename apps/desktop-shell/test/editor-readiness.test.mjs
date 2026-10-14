import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PACKAGED_STARTUP_TIMEOUT_MS, waitForPackagedNoteEditor } from './editor-readiness.mjs';

test('等待精确笔记路由和可见ready编辑器，helper内两个阶段共享20秒预算', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const calls = [];
  const page = {
    async waitForURL(matches, options) {
      assert(matches(new URL('http://localhost/#/materials/notes/target')));
      assert(!matches(new URL('http://localhost/#/materials/notes/other')));
      calls.push(options.timeout);
      now += 7000;
    },
    locator(selector) {
      assert.equal(selector, '[data-editor-ready="true"] .ProseMirror');
      return { async waitFor(options) { assert.equal(options.state, 'visible'); calls.push(options.timeout); } };
    }
  };
  await waitForPackagedNoteEditor(page, 'target');
  assert.deepEqual(calls, [PACKAGED_STARTUP_TIMEOUT_MS, PACKAGED_STARTUP_TIMEOUT_MS - 7000]);
});

for (const phase of ['note-navigation', 'editor-ready']) {
  test(`失败保留原异常并报告${phase}、路由和ready状态`, async () => {
    const failure = new Error('synthetic readiness failure');
    const diagnostics = [];
    const page = {
      async waitForURL() { if (phase === 'note-navigation') throw failure; },
      url: () => 'http://localhost/#/materials/notes/observed',
      locator: () => ({
        async waitFor() { throw failure; },
        async getAttribute(name, options) { assert.equal(name, 'data-editor-ready'); assert.equal(options.timeout, 1000); return 'false'; }
      })
    };
    await assert.rejects(waitForPackagedNoteEditor(page, 'target', { diagnostic: value => diagnostics.push(value) }), error => error === failure);
    assert.equal(diagnostics.length, 1);
    const snapshot = JSON.parse(diagnostics[0].split('：')[1]);
    assert.equal(snapshot.phase, phase);
    assert.equal(snapshot.expectedHash, '#/materials/notes/target');
    assert.equal(snapshot.hash, '#/materials/notes/observed');
    assert.equal(snapshot.ready, 'false');
  });
}
