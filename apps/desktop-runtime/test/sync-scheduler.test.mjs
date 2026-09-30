import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSyncScheduler } from '../src/sync-scheduler.mjs';

function fixture(t, run) {
  let now = 0; let id = 0; let calls = 0;
  const timers = new Map();
  const state = { stopped: false, retryAt: 0, changed: false, more: false };
  const clock = { now: () => now, setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; }, clearTimeout(key) { timers.delete(key); } };
  const scheduler = createSyncScheduler({ clock, policy: () => state, run: async () => { calls++; await run?.(); } });
  t.after(() => scheduler.close());
  async function tick(ms) {
    now += ms;
    for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); }
    await scheduler.wait();
  }
  return { scheduler, state, tick, timers, calls: () => calls, due: () => [...timers.values()][0]?.at - now };
}

test('空闲按 15、30、60 秒退避，有变化后恢复 15 秒', async t => {
  const f = fixture(t);
  f.scheduler.start(); await f.tick(0); assert.equal(f.due(), 15000);
  await f.tick(15000); assert.equal(f.due(), 30000);
  await f.tick(30000); assert.equal(f.due(), 60000);
  await f.tick(60000); assert.equal(f.due(), 60000);
  f.state.changed = true;
  await f.tick(60000); assert.equal(f.due(), 15000);
  assert.equal(f.timers.size, 1);
});

test('本地提交 500ms 防抖，连续输入最多等待 2 秒', async t => {
  const f = fixture(t);
  f.scheduler.wake(); await f.tick(400);
  for (let n = 0; n < 4; n++) { f.scheduler.wake(); await f.tick(400); }
  assert.equal(f.calls(), 1);
  f.scheduler.wake(); await f.tick(499); assert.equal(f.calls(), 1);
  await f.tick(1); assert.equal(f.calls(), 2);
});

test('运行中唤醒只安排一个后继轮次，剩余批次立即续传', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const f = fixture(t, () => { if (first) { first = false; return gate; } });
  const running = f.scheduler.sync();
  await Promise.resolve();
  f.scheduler.wake(); f.scheduler.wake('focus');
  assert.equal(f.scheduler.sync(), running);
  release(); await running;
  assert.equal(f.calls(), 1); assert.equal(f.due(), 500);
  f.state.more = true;
  await f.tick(500); assert.equal(f.calls(), 2); assert.equal(f.due(), 500);
});

test('自动唤醒遵守退避，网络恢复只额外探测一次，手动可立即重试', async t => {
  const f = fixture(t);
  f.state.retryAt = 90000;
  f.scheduler.wake(); assert.equal(f.due(), 90000);
  f.scheduler.wake('focus'); assert.equal(f.due(), 90000);
  await f.tick(1000); f.scheduler.wake('online'); await f.tick(0);
  assert.equal(f.calls(), 1);
  await f.tick(1000); f.scheduler.wake('online'); assert.equal(f.due(), 88000);
  await f.scheduler.sync(); assert.equal(f.calls(), 2);
});

test('暂停、认证/协议阻断与关闭均停止自动唤醒', async t => {
  const f = fixture(t);
  f.scheduler.start(); f.state.stopped = true; f.scheduler.pause();
  f.scheduler.wake(); f.scheduler.wake('online'); await f.tick(60000);
  assert.equal(f.calls(), 0); assert.equal(f.timers.size, 0);
  f.state.stopped = false;
  f.scheduler.wake('focus'); await f.scheduler.close(); await f.tick(60000);
  assert.equal(f.calls(), 0);
});
