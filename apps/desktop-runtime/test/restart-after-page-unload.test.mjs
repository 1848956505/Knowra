import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restartAfterPageUnload } from './fixtures/restart-after-page-unload.mjs';

function controlledLifecycle() {
  const unloaded = Promise.withResolvers();
  const oldOrigin = 'http://127.0.0.1:42579';
  let oldPageActive = true;
  const external = [];
  const events = [];
  const fixture = {
    origin: oldOrigin,
    async restart() {
      events.push('restart');
      this.origin = 'http://127.0.0.1:34557';
      // 确定性触发端口切换窗口内的旧页面轮询，保持原有外域判定。
      if (oldPageActive) {
        const request = `${oldOrigin}/api/local-runtime/sync`;
        if (new URL(request).origin !== this.origin) external.push(request);
      }
      return `${this.origin}/local-session/synthetic-session`;
    }
  };
  const page = {
    async goto(url) {
      assert.equal(url, 'about:blank');
      events.push('unload-start');
      await unloaded.promise;
      oldPageActive = false;
      events.push('unload-complete');
    }
  };
  return { page, fixture, unloaded, external, events, oldOrigin };
}

test('R07 重启等待旧页面卸载完成后才切换 origin，不产生旧端口轮询', async () => {
  const state = controlledLifecycle();
  const restarting = restartAfterPageUnload(state.page, state.fixture);
  assert.deepEqual(state.events, ['unload-start']);
  assert.equal(state.fixture.origin, state.oldOrigin);
  state.unloaded.resolve();
  const launch = await restarting;
  assert.deepEqual(state.events, ['unload-start', 'unload-complete', 'restart']);
  assert.equal(new URL(launch).origin, state.fixture.origin);
  assert.notEqual(state.fixture.origin, state.oldOrigin);
  assert.deepEqual(state.external, []);
});

test('R07 回归对照：未卸载的旧页面在重启窗口被判为外域请求', async () => {
  const state = controlledLifecycle();
  await state.fixture.restart();
  assert.deepEqual(state.external, [`${state.oldOrigin}/api/local-runtime/sync`]);
});

test('R07 页面卸载失败时保留原错误且不得重启 fixture', async () => {
  const failure = new Error('synthetic navigation failed');
  const state = controlledLifecycle();
  const restarting = restartAfterPageUnload(state.page, state.fixture);
  state.unloaded.reject(failure);
  await assert.rejects(restarting, error => error === failure);
  assert.deepEqual(state.events, ['unload-start']);
  assert.equal(state.fixture.origin, state.oldOrigin);
});
