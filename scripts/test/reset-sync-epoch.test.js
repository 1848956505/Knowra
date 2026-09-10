import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createFileDataStore } from '../../apps/api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../apps/api/src/app.factory.js';

test('手动恢复 JSON 后重建世代，保留业务数据并备份原日志', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-reset-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'cloud.json');
  const store = createFileDataStore(filePath);
  const context = createAppContext({ dataStore: store, storageRootDir: root, uploadsDir: path.join(root, 'uploads') });
  const space = context.modules.knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  context.modules.knowledge.noteService.createNote({ title: '恢复保留', rawMarkdown: '原始正文', spaceId: space.id });
  const before = JSON.stringify(store.state);
  const epoch = store.getSyncJournal().epoch;
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../reset-sync-epoch.mjs', import.meta.url)), '--driver', 'local-json', '--data-file', filePath], { encoding: 'utf8' });
  const result = JSON.parse(output);
  const restored = createFileDataStore(filePath);
  assert.notEqual(result.datasetEpoch, epoch);
  assert.equal(restored.getSyncJournal().epoch, result.datasetEpoch);
  assert.equal(JSON.stringify(restored.state), before);
  assert.equal(JSON.parse(fs.readFileSync(result.backup, 'utf8')).sync.epoch, epoch);
});
