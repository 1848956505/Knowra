import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { _electron as electron, expect } from '@playwright/test';

const executablePath = fileURLToPath(new URL('../../../dist/mac/知境·Knowra-darwin-arm64/知境·Knowra.app/Contents/MacOS/Knowra', import.meta.url));
const expectedVersion = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version;

function readRestoredNote(directory, noteId) {
  const root = path.join(directory, 'offline');
  const pointer = JSON.parse(fs.readFileSync(path.join(root, 'active-dataset.json'), 'utf8'));
  assert.match(pointer.directory, /^restored\/[a-f0-9-]+$/);
  const database = new DatabaseSync(path.join(root, pointer.directory, 'local.sqlite'), { readOnly: true });
  try {
    const row = database.prepare("SELECT payload FROM entities WHERE collection = 'notes' AND id = ?").get(noteId);
    assert(row, '恢复后活动 SQLite 必须包含该笔记');
    return JSON.parse(row.payload);
  } finally { database.close(); }
}

test('打包应用备份恢复隔离原生旧草稿，退出及重启均不会覆盖恢复正文', { timeout: 90000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-packaged-backup-'));
  const recoveryPath = path.join(directory, 'offline/recovery-drafts.json');
  let app;
  t.after(async () => { if (app) await app.close().catch(() => {}); fs.rmSync(directory, { recursive: true, force: true }); });
  const launch = () => electron.launch({ executablePath, env: { ...process.env, KNOWRA_DESKTOP_SMOKE_DIR: directory }, timeout: 20000 });
  const quit = async () => {
    const closed = app.waitForEvent('close');
    await app.evaluate(({ app: nativeApp }) => nativeApp.quit());
    await closed;
    app = null;
  };
  app = await launch();
  assert.equal(await app.evaluate(({ app: nativeApp }) => nativeApp.getVersion()), expectedVersion);
  let page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const note = await page.evaluate(async () => {
    const post = async (url, body) => {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`建立备份测试资料失败：${response.status}`);
      return (await response.json()).data;
    };
    const space = await post('/api/knowledge/spaces/default', {});
    return post('/api/knowledge/notes', { spaceId: space.id, title: '打包备份隔离检查', rawMarkdown: '备份中的正文\n' });
  });
  await page.reload();
  await page.getByRole('button', { name: '连接云端', exact: true }).click();
  await page.getByRole('button', { name: '本机备份与恢复', exact: true }).click();
  await page.getByRole('button', { name: '创建本机备份', exact: true }).click();
  await expect(page.getByText(/备份已保存：/)).toBeVisible();
  const backupId = await page.getByRole('combobox', { name: '选择备份' }).inputValue();
  assert(backupId);
  const draftKey = `knowra:note-draft:v1:${JSON.stringify([note.spaceId, note.id])}`;
  // 使用真正的 contextBridge / IPC 草稿写入，基线故意与备份正文相同。
  // 若恢复后仍沿用旧 scope，这份草稿会被认为可安全自动保存。
  await page.evaluate(async ({ note, draftKey }) => {
    await window.knowraDesktop.writeRecoveryDraft(draftKey, {
      markdown: '恢复前原生草稿不应自动回写', baseMarkdown: note.rawMarkdown, baseUpdatedAt: note.updatedAt
    });
    const response = await fetch(`/api/knowledge/notes/${note.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawMarkdown: '备份之后的正文', expectedUpdatedAt: note.updatedAt, baseMarkdown: note.rawMarkdown })
    });
    if (!response.ok) throw new Error(`建立恢复前状态失败：${response.status}`);
  }, { note, draftKey });
  assert.equal(JSON.parse(fs.readFileSync(recoveryPath, 'utf8')).drafts[draftKey].markdown, '恢复前原生草稿不应自动回写');
  await page.getByRole('button', { name: '检查所选备份', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完整性检查通过' })).toBeVisible();
  await page.getByRole('checkbox', { name: '我确认使用所选备份恢复整个本机资料库' }).check();
  await page.getByRole('button', { name: '确认恢复所选备份', exact: true }).click();
  await expect(page.getByText(/备份已恢复。重新加载后使用恢复的资料/)).toBeVisible();
  await page.getByRole('button', { name: '重新加载已恢复资料', exact: true }).click();

  async function verifyOldDraftCannotRecover() {
    const notice = page.getByRole('dialog', { name: '恢复草稿', exact: true });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('仅可导出');
    await expect(notice.getByRole('button', { name: '恢复：打包备份隔离检查', exact: true })).toBeDisabled();
    await expect(notice.getByRole('button', { name: '导出草稿', exact: true })).toBeEnabled();
    const runtime = await page.evaluate(() => globalThis.knowraRuntime);
    assert.equal(runtime.legacyDraftsAllowed, false);
    assert(runtime.datasetId);
    await notice.getByRole('button', { name: '收起提示', exact: true }).click();
    await page.goto(`${new URL(page.url()).origin}/#/materials/notes/${note.id}`);
    await expect(page.locator('.ProseMirror')).toHaveText('备份中的正文');
    // 超过自动保存防抖窗口，防止只验证到了旧草稿尚未回写的瞬间。
    await page.waitForTimeout(1000);
    const saved = await page.evaluate(async id => (await (await fetch(`/api/knowledge/notes/${id}`)).json()).data, note.id);
    assert.equal(saved.rawMarkdown, note.rawMarkdown);
    assert.equal(await page.evaluate(key => window.knowraDesktop.readRecoveryDrafts()[key].markdown, draftKey), '恢复前原生草稿不应自动回写');
    return runtime.datasetId;
  }

  const datasetId = await verifyOldDraftCannotRecover();
  await quit();
  assert.equal(readRestoredNote(directory, note.id).rawMarkdown, note.rawMarkdown);
  assert.equal(JSON.parse(fs.readFileSync(recoveryPath, 'utf8')).drafts[draftKey].markdown, '恢复前原生草稿不应自动回写');
  app = await launch();
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  assert.equal(await verifyOldDraftCannotRecover(), datasetId);
  await quit();
  assert.equal(readRestoredNote(directory, note.id).rawMarkdown, note.rawMarkdown);
});
