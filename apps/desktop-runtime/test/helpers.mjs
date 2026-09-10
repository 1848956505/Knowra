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
