import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { startLocalRuntime } from '../../src/runtime-server.mjs';
import { withPageFailureDiagnostics } from '../fixtures/page-failure-diagnostics.mjs';

test('真实生产页面 CmdK：SQLite 长中文正文的有界命中、排除回收站/其他空间并 Enter 打开', { timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-command-search-e2e-'));
  const distRoot = fileURLToPath(new URL('../../../web-v4/dist/', import.meta.url));
  const evidenceRoot = fileURLToPath(new URL('../../../../dist/command-search-evidence/production/', import.meta.url));
  let runtime, browser;
  t.after(async () => {
    try { await browser?.close(); }
    finally { try { await runtime?.close(); } finally { fs.rmSync(directory, { recursive: true, force: true }); } }
  });
  runtime = await startLocalRuntime({ dataDirectory: directory, distRoot });
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  await withPageFailureDiagnostics(page, async () => {
    const browserProblems = [];
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) browserProblems.push(`${message.type()}: ${message.text()}`); });
    page.on('pageerror', error => browserProblems.push(error.message));
    await page.goto(runtime.launchUrl);
    const post = async (pathname, data) => {
      const response = await page.request.post(`${runtime.origin}${pathname}`, { data });
      assert.equal(response.ok(), true, `合成夹具 HTTP ${response.status()}：${pathname}`);
      return (await response.json()).data;
    };
    const space = await post('/api/knowledge/spaces/default', {});
    const folder = await post('/api/knowledge/folders', { spaceId: space.id, name: '合成命令目录' });
    const query = '中文深处的合成命中';
    const note = await post('/api/knowledge/notes', { id: 'command-synthetic-body', spaceId: space.id, folderId: folder.id,
      title: '命令搜索合成长正文', rawMarkdown: `开头合成哨兵${'前文内容。'.repeat(160)}\n\n${query}\n\n${'后文内容。'.repeat(160)}末尾合成哨兵` });
    const deleted = await post('/api/knowledge/notes', { spaceId: space.id, title: '删除的合成资料', rawMarkdown: query });
    const deleteResponse = await page.request.delete(`${runtime.origin}/api/knowledge/notes/${deleted.id}`);
    assert.equal(deleteResponse.ok(), true);
    // 桌面不开放创建空间操作，仅在此临时夹具事务中注入另一个同 owner 空间。
    const otherSpace = { ...space, id: 'command-other-space', name: '其他合成空间', defaultFlag: false };
    runtime.store.runTransaction(() => { runtime.store.state.spaces.push(otherSpace); runtime.store.flush(); });
    const other = await post('/api/knowledge/notes', { spaceId: otherSpace.id, title: '其他空间资料', rawMarkdown: query });

    const summaryResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/knowledge/notes' && url.searchParams.get('summaryOnly') === 'true';
    });
    await page.reload();
    await expect(page).toHaveURL(`${runtime.origin}/`);
    await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
    await expect(page.getByRole('button', { name: note.title, exact: true })).toBeVisible();
    const summaries = (await (await summaryResponse).json()).data;
    const summary = summaries.find(item => item.id === note.id);
    assert.equal(summary.summary.length, 240);
    assert.equal(summary.summary.includes(query), false);
    assert.equal('rawMarkdown' in summary || 'plainText' in summary, false);
    const scripts = await page.locator('script[src]').evaluateAll(elements => elements.map(element => element.getAttribute('src')));
    assert(scripts.some(src => /^\/assets\/.*\.js$/.test(src)));
    assert.equal(scripts.some(src => src.includes('@vite')), false);

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('combobox');
    await expect(input).toBeFocused();
    const commandResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/knowledge/search/notes' && url.searchParams.get('result') === 'command'
        && url.searchParams.get('query') === query;
    });
    await input.fill(query);
    const response = await commandResponse;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.equal(payload.data.length, 1);
    const hit = payload.data[0];
    assert.deepEqual(Object.keys(hit).sort(), ['folderId', 'id', 'snippet', 'title']);
    assert.equal(hit.id, note.id);
    assert(hit.snippet.includes(query));
    assert(hit.snippet.length <= 220);
    assert.equal(JSON.stringify(payload).includes('开头合成哨兵') || JSON.stringify(payload).includes('末尾合成哨兵'), false);
    assert.equal(payload.data.some(item => item.id === deleted.id || item.id === other.id), false);
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('option')).toContainText(note.title);
    await expect(dialog.getByRole('option')).toContainText(query);
    fs.mkdirSync(evidenceRoot, { recursive: true });
    await dialog.screenshot({ path: path.join(evidenceRoot, 'command-results.png') });
    fs.writeFileSync(path.join(evidenceRoot, 'command-http.json'), `${JSON.stringify(payload, null, 2)}\n`);

    await input.press('Enter');
    await expect(dialog).toBeHidden();
    const editorUrl = `${runtime.origin}/#/materials/notes/${encodeURIComponent(note.id)}`;
    await expect(page).toHaveURL(editorUrl);
    await expect(page.getByRole('heading', { name: note.title, exact: true })).toBeVisible();
    await expect(page.locator('.ProseMirror')).toContainText(query);
    await expect(page.getByRole('contentinfo', { name: '状态栏' })).toContainText(note.title);
    assert.deepEqual(browserProblems, []);
    fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify({ driver: 'real-sqlite', browser: 'chromium',
      api: 'real-local-runtime-http', productionBuild: JSON.parse(fs.readFileSync(path.join(distRoot, 'build-info.json'), 'utf8')),
      spaceId: space.id, noteId: note.id, query, responseStatus: response.status(), route: new URL(editorUrl).hash,
      excludedNoteIds: [deleted.id, other.id], browserProblems, completedAt: new Date().toISOString() }, null, 2)}\n`);
  });
});
