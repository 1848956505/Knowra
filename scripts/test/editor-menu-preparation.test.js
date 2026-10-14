import test from 'node:test';
import assert from 'node:assert/strict';
import { openEditorToolbarMenu } from '../test-support/editor-menu.mjs';

function fixture({ connected = true, visible = true, disabled = false, obscured = false, touch = false, moved = false, outside = false } = {}) {
  const events = new Map();
  const calls = [];
  let measurements = 0;
  const parent = { parentElement: null, scrollTop: 0, scrollLeft: 0 };
  const doc = {
    defaultView: { innerWidth: 1280, innerHeight: 800, navigator: { maxTouchPoints: touch ? 1 : 0 }, requestAnimationFrame: callback => setImmediate(callback), cancelAnimationFrame: clearImmediate, setTimeout, clearTimeout },
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: name => events.delete(name)
  };
  const element = {
    parentElement: parent, ownerDocument: doc, isConnected: connected,
    checkVisibility: () => visible,
    matches: () => disabled,
    closest: () => null,
    contains: node => node === element,
    getBoundingClientRect() {
      measurements++;
      // 首两帧模拟 sticky 工具栏的滚动/位置变更，然后稳定。
      parent.scrollTop = Math.min(measurements, 2);
      if (measurements <= 2) events.get('scroll')?.({ target: parent });
      return { x: parent.scrollTop + (moved && calls.includes('recheck') ? 1 : 0), y: outside ? 900 : 0, width: 44, height: 44 };
    }
  };
  doc.elementFromPoint = () => obscured ? null : element;
  const trigger = {
    scrollIntoViewIfNeeded: async () => { calls.push('scroll'); },
    evaluate: (callback, target) => { calls.push(target ? 'recheck' : 'settle'); return callback(element, target); }
  };
  const page = { mouse: { click: async () => calls.push('click') }, touchscreen: { tap: async () => calls.push('tap') }, getByRole: (role, options) => {
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
  assert.deepEqual(f.calls, ['scroll', 'settle', 'recheck', 'click']);
  assert.ok(f.measurements() >= 5);
  assert.equal(f.events.size, 0);
});

test('准备期间按钮失效会明确失败，不重试点击且清理监听', async () => {
  const f = fixture({ connected: false });
  await assert.rejects(openEditorToolbarMenu(f.page, '文件'), /按钮在准备期间被移除/);
  assert.deepEqual(f.calls, ['scroll', 'settle']);
  assert.equal(f.events.size, 0);
});

for (const [option, message] of [['visible', /不可见/], ['disabled', /已禁用/], ['obscured', /中心被遮挡/], ['moved', /点击前改变位置/], ['outside', /未完整处于视口内/]]) {
  test(`按钮 ${option} 条件不满足时不点击`, async () => {
    const f = fixture({ [option]: option !== 'visible' });
    await assert.rejects(openEditorToolbarMenu(f.page, '文件'), message);
    assert.ok(!f.calls.includes('click'));
    assert.equal(f.events.size, 0);
  });
}

test('触屏设备通过一次真实tap操作按钮', async () => {
  const f = fixture({ touch: true });
  await openEditorToolbarMenu(f.page, '文件');
  assert.deepEqual(f.calls, ['scroll', 'settle', 'recheck', 'tap']);
});
