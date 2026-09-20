import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createRuntimeBackup, readBackupDrafts, restoreRuntimeBackup } from '../src/backup.mjs';
import { prepareRestoredDirectory, activateRestoredDirectory } from '../src/restore-directory.mjs';
import { exportLocalRecovery } from '../src/recovery-export.mjs';
import { createNote, openWorkspace, temporaryDirectory } from './helpers.mjs';

test('救援导出跟随恢复后的活动资料集，并保留根目录恢复草稿', async t => {
  const root = temporaryDirectory(t);
  const data = path.join(root, 'data');
  let workspace = openWorkspace(data);
  const note = createNote(workspace, '原资料正文');
  const backup = createRuntimeBackup(workspace.store, data);
  workspace.store.close();
  const active = prepareRestoredDirectory(data, backup);
  workspace = openWorkspace(active);
  workspace.knowledge.noteService.updateNote(note.id, { rawMarkdown: '恢复后继续编辑的正文' });
  workspace.store.close();
  activateRestoredDirectory(data, active, {});
  const draft = JSON.stringify({ version: 1, drafts: { retained: { markdown: '恢复前尚未保存的内容' } } });
  fs.writeFileSync(path.join(data, 'recovery-drafts.json'), draft);
  fs.writeFileSync(path.join(active, 'uploads', 'recovered.txt'), '恢复的附件');
  const destination = path.join(root, 'rescue');
  await exportLocalRecovery(data, destination);
  const recovered = JSON.parse(fs.readFileSync(path.join(destination, 'recovery.json'), 'utf8'));
  const row = recovered.tables.entities.find(row => row.collection === 'notes' && row.id === note.id);
  assert.equal(JSON.parse(row.payload).rawMarkdown, '恢复后继续编辑的正文');
  assert.equal(fs.readFileSync(path.join(destination, 'uploads', 'recovered.txt'), 'utf8'), '恢复的附件');
  assert.equal(fs.readFileSync(path.join(destination, 'recovery-drafts.json'), 'utf8'), draft);
  workspace = openWorkspace(data);
  assert.equal(workspace.store.state.notes[0].rawMarkdown, '原资料正文');
  workspace.store.close();
});

test('救援导出保留恢复来源和根目录同键草稿，复制后仍能导出两份内容', async t => {
  const root = temporaryDirectory(t);
  const data = path.join(root, 'data');
  const workspace = openWorkspace(data);
  createNote(workspace, '已保存正文');
  const key = 'knowra:note-draft:v1:["space","note"]';
  const source = { version: 1, drafts: { [key]: { markdown: '来源草稿', baseMarkdown: '' } } };
  const current = { version: 1, drafts: { [key]: { markdown: '当前草稿', baseMarkdown: '' } } };
  fs.writeFileSync(path.join(data, 'recovery-drafts.json'), JSON.stringify(source));
  const backup = createRuntimeBackup(workspace.store, data);
  workspace.store.close();
  const active = prepareRestoredDirectory(data, backup);
  activateRestoredDirectory(data, active, {});
  fs.writeFileSync(path.join(data, 'recovery-drafts.json'), JSON.stringify(current));
  const destination = path.join(root, 'rescue');
  await exportLocalRecovery(data, destination);
  const copied = path.join(root, 'copied');
  restoreRuntimeBackup(destination, copied);
  const drafts = readBackupDrafts(copied);
  assert.deepEqual(drafts.drafts, current.drafts);
  assert.equal(drafts.archivedDrafts.length, 1);
  assert.deepEqual(drafts.archivedDrafts[0].drafts, source.drafts);

  // 救援包需要保留无法解析的原文件，不能因草稿损坏而阻止抢救数据库。
  fs.writeFileSync(path.join(data, 'recovery-drafts.json'), '原文件损坏，也应保留');
  const damagedRescue = path.join(root, 'damaged-rescue');
  await exportLocalRecovery(data, damagedRescue);
  assert.equal(fs.readFileSync(path.join(damagedRescue, 'recovery-drafts.json'), 'utf8'), '原文件损坏，也应保留');
  assert.equal(fs.readdirSync(path.join(damagedRescue, 'recovery-draft-archives')).length, 1);
});
