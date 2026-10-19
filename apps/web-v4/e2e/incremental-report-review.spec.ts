import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { test } from './fixtures/syntheticTest';
import { mockShellServices } from './fixtures/shellServices';

const baseReport = JSON.parse(await readFile(new URL('../../../packages/shared/test/fixtures/incremental-review.json', import.meta.url), 'utf8'));
// 合法长字段用于窄屏溢出回归，不含用户资料。
const row = baseReport.rows[0];
row.note.id = 'S' + '0'.repeat(80); row.rowId = 'retrieval:' + row.note.id; row.requestId = 'concept-link-r2-' + row.note.id;
row.proposals[0].proposalId = baseReport.reportId + '/' + row.rowId + '#0';
row.providerResult.parsed.requestId = row.requestId; row.providerResult.rawText = JSON.stringify(row.providerResult.parsed);
row.candidateConcepts.push({ id: 'C' + '0'.repeat(110), name: '合成'.repeat(40), sense: '长字段布局回归' });
const reportFile = (report = baseReport) => ({ name: 'synthetic-review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(report)) });
const graph = { state: { concepts: [{ id: 'C1', name: '合成原图', sense: '用于隔离检查' }], items: [] }, results: [] };

for (const width of [1440, 390]) {
  test(`离线报告审阅与草稿隔离 ${width}px`, async ({ page }, info) => {
    await mockShellServices(page);
    await page.route('**/api/knowledge/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET' || !['/api/knowledge/spaces', '/api/knowledge/folders/tree', '/api/knowledge/tag-groups', '/api/knowledge/notes', '/api/knowledge/tags'].includes(pathname)) return route.fallback();
      await route.fulfill({ json: { data: pathname.endsWith('/spaces') ? [{ id: 'synthetic-space', name: '合成空间', defaultFlag: true }] : [] } });
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/#/knowledge/graph');
    await page.getByLabel('选择实验结果文件').setInputFiles({ name: 'synthetic-graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) });
    await page.getByRole('button', { name: /^合成原图，/ }).click();
    const originalGraph = await page.getByRole('group', { name: '概念图', exact: true }).innerHTML();
    const originalDetails = await page.getByRole('region', { name: '详情', exact: true }).textContent();
    const storage = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]);
    const requests: string[] = []; page.on('request', request => requests.push(request.url()));
    await page.evaluate(() => {
      const calls: string[] = []; Object.assign(window, { reviewPersistenceCalls: calls });
      for (const method of ['setItem', 'removeItem', 'clear'] as const) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, { value: function (...args: string[]) { calls.push(method); return Reflect.apply(original, this, args); } });
      }
      const original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args: Parameters<IDBFactory['open']>) => { calls.push('indexedDB.open'); return original(...args); };
    });
    const launch = page.getByRole('button', { name: '离线报告审阅（实验）', exact: true });
    await launch.click();
    const dialog = page.getByRole('dialog', { name: '离线报告审阅（实验）', exact: true });
    const upload = page.getByLabel('选择离线审阅报告文件');
    const summary = dialog.getByLabel('报告审阅统计');
    await upload.setInputFiles(reportFile());
    await expect(summary).toContainText('未决定 1');
    await expect(dialog).toContainText('不认证文件来源');
    await expect(dialog.getByRole('region', { name: '报告笔记原文' })).toContainText('合成甲属于示例。');
    const capture = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await dialog.evaluate(node => Array.from(node.querySelectorAll<HTMLElement>('*')).filter(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowX)).every(element => element.scrollWidth <= element.clientWidth))).toBe(true);
      expect(await dialog.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })).toBe(true);
      const path = info.outputPath(`${name}.png`); await page.screenshot({ path, animations: 'disabled' }); await info.attach(name, { path, contentType: 'image/png' });
    };
    await dialog.getByRole('region', { name: '模型提案' }).scrollIntoViewIfNeeded(); await capture('01-proposal');
    await dialog.getByRole('region', { name: '候选概念与旧条目' }).scrollIntoViewIfNeeded(); await capture('02-candidates');
    await dialog.getByRole('button', { name: '归到 合成概念（C1）' }).focus(); await page.keyboard.press('Enter');
    await expect(dialog.getByRole('status')).toBeFocused(); await expect(summary).toContainText('已选择 1');
    await dialog.getByRole('button', { name: '下载未授权草稿' }).click();
    await expect(page.getByRole('dialog', { name: '下载包含原文的草稿？' })).toContainText('不是正式提交');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '确认下载（含原文）' }).click()]);
    expect(download.suggestedFilename()).toBe('knowra-unapproved-review-draft.json');
    const draft = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(draft.approval).toBe('not-granted'); expect(draft.report).toEqual(baseReport); expect(draft.counts.selected).toBe(1);
    await expect(summary).toContainText('已选择 1');
    await upload.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await expect(dialog.getByRole('alert')).toContainText('已保留'); await expect(summary).toContainText('已选择 1');
    await upload.setInputFiles(reportFile()); await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(summary).toContainText('已选择 1');
    await upload.setInputFiles(reportFile()); await page.getByRole('button', { name: '替换并清空选择' }).click();
    await expect(summary).toContainText('未决定 1');
    await dialog.getByRole('button', { name: '另建概念' }).click();
    await expect(dialog.getByLabel('新概念名称')).toBeFocused();
    await expect(dialog.getByRole('button', { name: '确认另建（仅草稿）' })).toBeDisabled();
    await dialog.getByRole('button', { name: '取消另建' }).click(); await expect(dialog.getByRole('status')).toBeFocused();
    await dialog.getByRole('button', { name: '另建概念' }).click();
    await dialog.getByLabel('新概念名称').fill('合成新概念'); await dialog.getByLabel('语境说明').fill('独立合成语境');
    await dialog.getByRole('button', { name: '确认另建（仅草稿）' }).click(); await expect(summary).toContainText('已选择 1');
    await dialog.getByRole('status').scrollIntoViewIfNeeded(); await capture('03-created');
    await dialog.getByRole('button', { name: '撤销本条选择' }).click(); await dialog.getByRole('button', { name: '暂不决定' }).click();
    await expect(summary).toContainText('待定 1'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '取消', exact: true }).click(); await expect(summary).toContainText('待定 1');
    await dialog.getByRole('button', { name: '关闭审阅' }).click(); await page.getByRole('button', { name: '关闭并清空选择' }).click();
    await expect(dialog).toHaveCount(0); await expect(launch).toBeFocused();
    expect(await page.getByRole('group', { name: '概念图', exact: true }).innerHTML()).toBe(originalGraph);
    expect(await page.getByRole('region', { name: '详情', exact: true }).textContent()).toBe(originalDetails);
    await launch.click(); await expect(summary).toContainText('尚未导入报告');
    expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)])).toEqual(storage);
    expect(await page.evaluate(() => (window as Window & { reviewPersistenceCalls?: string[] }).reviewPersistenceCalls)).toEqual([]);
    expect(requests).toEqual([]); expect(errors).toEqual([]);
  });
}
