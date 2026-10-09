import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { parseRelease, compareVersions, fetchLatestRelease, createReleaseUpdates, RELEASES_URL, API_URL, ARCHIVE } = createRequire(import.meta.url)('../src/release-updates.cjs');
const fixture = () => ({ draft: false, prerelease: false, tag_name: 'v2.29.0', html_url: `${RELEASES_URL}/tag/v2.29.0`, body: '修复与改进', assets: [ARCHIVE, `${ARCHIVE}.build-info.json`].map(name => ({ name, state: 'uploaded', size: 50 })) });
const response = data => new Response(JSON.stringify(data));
test('只识别稳定版本、固定来源及完整 Mac 产物，不把 CI 当发布', () => {
  assert.equal(parseRelease(fixture(), '2.28.0').hasMacPackage, true);
  assert.equal(parseRelease({ ...fixture(), assets: [] }, '2.28.0').hasMacPackage, false);
  for (const invalid of [{ draft: true }, { prerelease: true }, { tag_name: 'v2.29.0-beta.1' }, { html_url: 'https://evil.example/download' }, { tag_name: '../../other' }]) assert.throws(() => parseRelease({ ...fixture(), ...invalid }, '2.28.0'));
  assert.equal(compareVersions('2.10.0', '2.9.0'), 1);
  assert.equal(compareVersions('2.28.0', '2.28.0'), 0);
  assert.equal(compareVersions('2.27.0', '2.28.0'), -1);
});
test('请求只访问固定 GitHub API，拒绝重定向、超大响应和服务错误', async () => {
  await fetchLatestRelease(async (url, options) => { assert.equal(url, API_URL); assert.equal(options.redirect, 'error'); assert.ok(options.signal); return response(fixture()); });
  assert.equal(await fetchLatestRelease(async () => new Response('', { status: 404 })), null);
  await assert.rejects(fetchLatestRelease(async () => new Response('', { status: 403 })));
  await assert.rejects(fetchLatestRelease(async () => new Response('x'.repeat(262145))));
  await assert.rejects(fetchLatestRelease(async () => new Response('not json')));
});
test('重复检查只发一次请求；取消不打开页面；相同版本不声称最新', async () => {
  let finish, requests = 0; const messages = [], opened = [];
  const updates = createReleaseUpdates({ getWindow: () => ({ isDestroyed: () => false }), buildInfo: { version: '2.29.0', commit: 'a'.repeat(40), state: 'clean' },
    fetchImpl: () => { requests++; return new Promise(resolve => { finish = resolve; }); },
    dialog: { showMessageBox: async (_window, options) => { messages.push(options); return { response: 0 }; } }, shell: { openExternal: async url => opened.push(url) } });
  const first = updates.check(); await updates.check(); assert.equal(requests, 1); finish(response(fixture())); await first;
  assert.equal(opened.length, 0); assert.match(messages[0].message, /版本号.*相同/); assert.match(messages[0].detail, /未确认二进制一致/);
  const again = updates.check(); assert.equal(requests, 2); finish(response(fixture())); await again;
});
test('用户确认仅打开固定发布页；失败可重试且不泄漏原始错误', async () => {
  const messages = [], opened = []; let fail = true;
  const updates = createReleaseUpdates({ getWindow: () => ({ isDestroyed: () => false }), buildInfo: { version: '2.28.0' },
    fetchImpl: async () => { if (fail) throw new Error('secret'); return response(fixture()); },
    dialog: { showMessageBox: async (_window, options) => { messages.push(options); return { response: 1 }; } }, shell: { openExternal: async url => opened.push(url) } });
  await updates.check(); assert.equal(opened.length, 0); assert.doesNotMatch(JSON.stringify(messages), /secret/);
  fail = false; await updates.check(); assert.deepEqual(opened, [`${RELEASES_URL}/tag/v2.29.0`]);
});

test('关闭中的应用、销毁窗口及晚到响应不弹框或打开链接', async () => {
  let closing = false, destroyed = false, finish, finishDialog; let requests = 0; const messages = [], opened = [];
  const updates = createReleaseUpdates({ getWindow: () => ({ isDestroyed: () => destroyed }), isClosing: () => closing, buildInfo: { version: '2.28.0' },
    fetchImpl: () => { requests++; return new Promise(resolve => { finish = resolve; }); },
    dialog: { showMessageBox: async (_window, options) => { messages.push(options); return new Promise(resolve => { finishDialog = resolve; }); } }, shell: { openExternal: async url => opened.push(url) } });
  closing = true; await updates.check(); assert.equal(requests, 0); closing = false;
  destroyed = true; await updates.check(); assert.equal(requests, 0); destroyed = false;
  const pending = updates.check(); closing = true; finish(response(fixture())); await pending; assert.equal(messages.length, 0);
  closing = false; const next = updates.check(); finish(response(fixture()));
  while (!finishDialog) await new Promise(resolve => setImmediate(resolve));
  destroyed = true; finishDialog({ response: 1 }); await next; assert.equal(opened.length, 0);
});
test('原生对话框失败不会造成未处理拒绝', async () => {
  const updates = createReleaseUpdates({ getWindow: () => ({ isDestroyed: () => false }), buildInfo: { version: '2.28.0' },
    fetchImpl: async () => response(fixture()), dialog: { showMessageBox: () => { throw new Error('window destroyed'); } }, shell: { openExternal: async () => assert.fail() } });
  await assert.doesNotReject(updates.check());
});
