import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { anchorFromProjectedRange, calculateContentHash, projectMarkdown } from '@study-accelerator/content-anchor';
import { createFileDataStore } from '../../api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { temporaryDirectory } from './helpers.mjs';

export function mark(knowledge, note) {
  const projection = projectMarkdown(note.rawMarkdown);
  const start = projection.text.indexOf('重点内容');
  const anchor = anchorFromProjectedRange(projection, start, start + 4);
  return knowledge.contentAnnotationService.createAnnotation({
    spaceId: note.spaceId, noteId: note.id, schemaVersion: 2, scopeType: anchor.scopeType,
    kind: 'important', sourceMode: 'manual', quoteText: anchor.quoteText,
    fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, prefixText: anchor.prefixText,
    suffixText: anchor.suffixText, headingPath: [], anchor, anchorFingerprint: 'client',
    noteContentHash: calculateContentHash(note.rawMarkdown), idempotencyKey: `mark-${note.id}`
  });
}

for (const sqlite of [false, true]) test(`${sqlite ? 'SQLite 离线' : 'JSON 在线'}：连续编辑不堆积自动修订，当前位置与人工修改正常保存`, t => {
  const root = temporaryDirectory(t);
  const store = sqlite ? createSqliteDataStore(path.join(root, 'local.sqlite')) : createFileDataStore(path.join(root, 'cloud.json'));
  t.after(() => store.close?.());
  const knowledge = createAppContext({ dataStore: store, storageRootDir: root }).modules.knowledge;
  const space = knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const markdown = '# 标题\n\n重点内容\n\n其它 0';
  const note = knowledge.noteService.createNote({ spaceId: space.id, title: '长时间编辑', rawMarkdown: markdown });
  const annotation = mark(knowledge, note), start = Date.parse(note.updatedAt);
  for (let i = 1; i <= 100; i++) knowledge.noteService.updateNote(note.id, {
    rawMarkdown: markdown.replace('其它 0', `其它 ${i}`), updatedAt: new Date(start + i * 1000).toISOString()
  });
  const current = knowledge.contentAnnotationService.getAnnotation(annotation.id);
  assert.equal(current.revision, 101, '并发控制仍逐次推进，不能用降低修订号假装压缩');
  assert.equal(current.anchorStatus, 'resolved');
  assert.equal(current.quoteText, '重点内容');
  assert.equal(knowledge.noteVersionService.getVersion(current.noteVersionId).content, markdown.replace('其它 0', '其它 100'));
  assert.equal(store.state.annotationRevisions.filter(record => record.operation === 'sourceReconciled').length, 1);
  assert.ok(store.state.noteVersions.length <= 6, `连续编辑只保留少量恢复点和必要锚点：${store.state.noteVersions.length}`);
  knowledge.noteService.updateNote(note.id, { rawMarkdown: markdown, updatedAt: new Date(start + 101000).toISOString() });
  assert.equal(knowledge.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'resolved');
  for (let i = 0; i < 30; i++) {
    const previous = knowledge.contentAnnotationService.getAnnotation(annotation.id);
    knowledge.contentAnnotationService.updateAnnotation(annotation.id, { expectedRevision: previous.revision, comment: `批注 ${i}` });
  }
  assert.equal(knowledge.contentAnnotationService.getAnnotation(annotation.id).comment, '批注 29');
  assert.ok(store.state.annotationRevisions.length <= 11, '十条普通恢复点加当前修订，不无限保留人工过程');
});
