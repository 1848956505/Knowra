import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { createSystemNotifications } = createRequire(import.meta.url)('../src/system-notifications.cjs');

function fakeNotification({ supported = true, throws = false } = {}) {
  const shown = [];
  class FakeNotification {
    static isSupported() { return supported; }
    constructor(options) { this.options = options; }
    show() { if (throws) throw new Error('boom'); shown.push(this.options); }
  }
  return { FakeNotification, shown };
}

test('主进程系统通知：支持时交给系统并返回 true；不支持或抛错时返回 false，不抛出', () => {
  const ok = fakeNotification();
  assert.equal(createSystemNotifications({ Notification: ok.FakeNotification }).notify({ title: '知境 AI 用量已达今日上限的 80%', body: '今日已用 ¥16.00 / ¥20.00。' }), true);
  assert.deepEqual(ok.shown, [{ title: '知境 AI 用量已达今日上限的 80%', body: '今日已用 ¥16.00 / ¥20.00。', silent: false }]);
  const unsupported = fakeNotification({ supported: false });
  assert.equal(createSystemNotifications({ Notification: unsupported.FakeNotification }).notify({ title: 't', body: 'b' }), false);
  assert.deepEqual(unsupported.shown, []);
  assert.equal(createSystemNotifications({ Notification: fakeNotification({ throws: true }).FakeNotification }).notify({ title: 't', body: 'b' }), false);
});

test('主进程系统通知只接受短的纯文本标题与正文', () => {
  const { FakeNotification, shown } = fakeNotification();
  const notifications = createSystemNotifications({ Notification: FakeNotification });
  for (const bad of [undefined, null, {}, { title: 't' }, { title: '', body: 'b' }, { title: '   ', body: 'b' }, { title: 't', body: 5 },
    { title: 'x'.repeat(81), body: 'b' }, { title: 't', body: 'x'.repeat(241) }, { title: 't\u0000', body: 'b' }]) {
    assert.equal(notifications.notify(bad), false, JSON.stringify(bad)?.slice(0, 40));
  }
  assert.deepEqual(shown, []);
});
