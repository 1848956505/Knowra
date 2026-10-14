import test from 'node:test';
import assert from 'node:assert/strict';
import { openEditorToolbarMenu } from '../test-support/editor-menu.mjs';

function fixture({ connected = true } = {}) {
  const events = new Map();
  const calls = [];
  let measurements = 0;
  const parent = { parentElement: null, scrollTop: 0, scrollLeft: 0 };
  const doc = {
    defaultView: { requestAnimationFrame: callback => setImmediate(callback), cancelAnimationFrame: clearImmediate, setTimeout, clearTimeout },
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: name => events.delete(name)
  };
  const element = {
    parentElement: parent, ownerDocument: doc, isConnected: connected,
    getBoundingClientRect() {
      measurements++;
      // 首两帧模拟 sticky 工具栏的滚动/位置变更，然后稳定。
      parent.scrollTop = Math.min(measurements, 2);
      if (measurements <= 2) events.get('scroll')?.({ target: parent });
      return { x: parent.scrollTop, y: 0, width: 44, height: 44 };
    }
  };
  const trigger = {
    scrollIntoViewIfNeeded: async () => { calls.push('scroll'); },
    evaluate: callback => { calls.push('settle'); return callback(element); },
    click: async () => { calls.push('click'); }
  };
  const page = { getByRole: (role, options) => {
    assert.equal(role, 'toolbar');
    assert.equal(options.name, '笔记格式工具栏');
    return { getByRole: (role, options) => {
      assert.equal(role, 'button');
      assert.deepEqual(options, { name: '文件', exact: true });
      return trigger;
    } };
  } };
  return { page, calls, events, measurements: () => measurements };
}

test('编辑器菜单准备在实际按钮稳定后只点击一次，并清理scroll监听', async () => {
  const f = fixture();
  await openEditorToolbarMenu(f.page, '文件');
  assert.deepEqual(f.calls, ['scroll', 'settle', 'click']);
  assert.ok(f.measurements() >= 5);
  assert.equal(f.events.size, 0);
});

test('准备期间按钮失效会明确失败，不重试点击且清理监听', async () => {
  const f = fixture({ connected: false });
  await assert.rejects(openEditorToolbarMenu(f.page, '文件'), /按钮在准备期间被移除/);
  assert.deepEqual(f.calls, ['scroll', 'settle']);
  assert.equal(f.events.size, 0);
});
