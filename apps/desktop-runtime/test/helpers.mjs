import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { createAppContext } from '../../api/src/app.factory.js';

export function temporaryDirectory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-local-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

export function openWorkspace(root, options) {
  const store = createSqliteDataStore(path.join(root, 'local.sqlite'), options);
  const context = createAppContext({ dataStore: store, uploadsDir: path.join(root, 'uploads'), storageRootDir: root, ownerId: 'demo' });
  const knowledge = context.modules.knowledge;
  const space = knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  return { store, knowledge, space };
}

export function createNote(workspace, rawMarkdown = '初始正文') {
  return workspace.knowledge.noteService.createNote({ title: '离线笔记', rawMarkdown, spaceId: workspace.space.id });
}

/** 把当前测试库还原成真正没有 AI 私有表的旧版形状，用于迁移回归。 */
export function removeAiTablesForLegacyFixture(db) {
  db.exec(`PRAGMA foreign_keys = OFF;
    DROP TABLE ai_job_events;
    DROP TABLE ai_usage_records;
    DROP TABLE ai_actions;
    DROP TABLE ai_job_attempts;
    DROP TABLE ai_jobs;
    DROP TABLE ai_grants;
    DROP TABLE ai_context_manifests;
    DROP TABLE ai_scope_snapshots;
    DELETE FROM metadata WHERE key = 'aiRuntimeEpoch';`);
}
