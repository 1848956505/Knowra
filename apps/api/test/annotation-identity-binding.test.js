import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  anchorForSection, anchorFromProjectedRange, bindingSourceRange, calculateContentHash, parseIdentityBlocks, projectMarkdown, sourceEdit
} from '@study-accelerator/content-anchor';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';

const markdown = '## A\n\n前文重要文字后文\n\n尾段';
const blockIds = md => parseIdentityBlocks(md).map((block, index) => `${block.type}-${index}`);
const editorState = (md, annotations = []) => ({
  formatVersion: 2, targetContentHash: calculateContentHash(md),
  blocks: parseIdentityBlocks(md).map((block, index) => ({ id: blockIds(md)[index], type: block.type, empty: false })), annotations
});
const mapping = (before, after, state) => ({ formatVersion: 1, operationId: randomUUID(), baseContentHash: calculateContentHash(before), targetContentHash: calculateContentHash(after),
  edits: [sourceEdit(before, after)], ...(state ? { editorState: state } : {}) });
const createSelection = (service, note, text) => {
  const projection = projectMarkdown(note.rawMarkdown);
  const start = projection.text.indexOf(text);
  const anchor = anchorFromProjectedRange(projection, start, start + text.length);
  return service.createAnnotation({ noteId: note.id, spaceId: note.spaceId, schemaVersion: 2, scopeType: 'selection', anchor, quoteText: anchor.quoteText,
    fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, anchorFingerprint: 'fixture', noteContentHash: calculateContentHash(note.rawMarkdown), idempotencyKey: randomUUID() });
};

/** 建立带身份表的笔记：首次保存附带编辑器快照。 */
function noteWithIdentity(module) {
  const created = module.noteService.createNote({ id: `binding-${randomUUID()}`, spaceId: 'space', title: '绑定', rawMarkdown: markdown });
  const after = `${markdown}。`;
  return module.noteService.updateNote(created.id, { rawMarkdown: after, expectedUpdatedAt: created.updatedAt, annotationMapping: mapping(markdown, after, editorState(after)) });
}

export const annotationIdentityBindingTests = [
  { name: '重点绑定：笔记已有身份表时，新建重点即推出绑定且换算回原范围', run() {
    const module = createKnowledgeModule();
    const note = noteWithIdentity(module);
    const annotation = createSelection(module.contentAnnotationService, note, '重要文字');
    assert.equal(annotation.identityBinding.scopeType, 'selection');
    assert.equal(annotation.identityBinding.start.blockId, blockIds(note.rawMarkdown)[1]);
    assert.deepEqual(bindingSourceRange(note.rawMarkdown, note.annotationStructure.identity, annotation.identityBinding),
      { sourceStart: annotation.anchor.sourceStart, sourceEnd: annotation.anchor.sourceEnd });
  } },
  { name: '重点绑定：保存时采用编辑器上报的位置，旧链路状态与摘录不受影响', run() {
    const module = createKnowledgeModule();
    const note = noteWithIdentity(module);
    const annotation = createSelection(module.contentAnnotationService, note, '重要文字');
    const after = note.rawMarkdown.replace('前文', '前文新增');
    const id = blockIds(after)[1];
    module.noteService.updateNote(note.id, { rawMarkdown: after, expectedUpdatedAt: note.updatedAt,
      annotationMapping: mapping(note.rawMarkdown, after, editorState(after, [{ id: annotation.id, scopeType: 'selection', present: true, start: { blockId: id, offset: 4 }, end: { blockId: id, offset: 8 } }])) });
    const updated = module.contentAnnotationService.getAnnotation(annotation.id);
    assert.deepEqual([updated.identityBinding.start.offset, updated.identityBinding.end.offset], [4, 8]);
    assert.equal(updated.identityBinding.contentHash, calculateContentHash(after));
    assert.equal(updated.anchorStatus, 'resolved');
    assert.equal(updated.quoteText, '重要文字');
  } },
  { name: '重点绑定：没有编辑器上报时由已定位锚点推出；外部改写使身份表失效时保持原绑定', run() {
    const module = createKnowledgeModule();
    const note = noteWithIdentity(module);
    const annotation = createSelection(module.contentAnnotationService, note, '重要文字');
    const original = annotation.identityBinding;
    const same = module.noteService.updateNote(note.id, { rawMarkdown: note.rawMarkdown, expectedUpdatedAt: note.updatedAt });
    assert.deepEqual(module.contentAnnotationService.getAnnotation(annotation.id).identityBinding, original);
    const external = `${same.rawMarkdown}\n\n外部追加`;
    const saved = module.noteService.updateNote(note.id, { rawMarkdown: external, expectedUpdatedAt: same.updatedAt });
    assert.equal(saved.annotationStructure.identity, undefined);
    assert.deepEqual(module.contentAnnotationService.getAnnotation(annotation.id).identityBinding, original);
  } },
  { name: '重点绑定：原文被删除、编辑器也报告不存在时清空绑定', run() {
    const module = createKnowledgeModule();
    const note = noteWithIdentity(module);
    const annotation = createSelection(module.contentAnnotationService, note, '重要文字');
    const after = '## A\n\n尾段。';
    module.noteService.updateNote(note.id, { rawMarkdown: after, expectedUpdatedAt: note.updatedAt,
      annotationMapping: mapping(note.rawMarkdown, after, editorState(after, [{ id: annotation.id, scopeType: 'selection', present: false }])) });
    const updated = module.contentAnnotationService.getAnnotation(annotation.id);
    assert.equal(updated.anchorStatus, 'missing');
    assert.equal(updated.identityBinding, null);
  } }
];

export const annotationIdentityBindingPostgresTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [{
  name: '真实 PostgreSQL：块身份表与重点绑定随保存写入并可读回',
  async run() {
    const { createPostgresTestDatabase } = await import('../../../scripts/test-support/postgres-test-database.mjs');
    const { createPostgresAppContext } = await import('../src/postgres-app.factory.js');
    const root = mkdtempSync(path.join(tmpdir(), 'knowra-binding-pg-'));
    let database, app;
    try {
      database = await createPostgresTestDatabase();
      app = await createPostgresAppContext({ databaseUrl: database.databaseUrl, storageRootDir: root });
      const k = app.modules.knowledge;
      const space = await k.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
      const created = await k.noteService.createNote({ id: randomUUID(), spaceId: space.id, title: randomUUID(), rawMarkdown: markdown });
      const after = `${markdown}。`;
      const note = await k.noteService.updateNote(created.id, { rawMarkdown: after, expectedUpdatedAt: created.updatedAt, annotationMapping: mapping(markdown, after, editorState(after)) });
      assert.deepEqual(note.annotationStructure.identity.blocks.map(block => block.id), blockIds(after));
      const projection = projectMarkdown(after);
      const section = anchorForSection(projection, 0);
      const annotation = await k.contentAnnotationService.createAnnotation({ spaceId: space.id, noteId: note.id, schemaVersion: 2, scopeType: 'section', anchor: section,
        quoteText: section.quoteText, fromPosition: section.sourceStart, toPosition: section.sourceEnd, anchorFingerprint: 'fixture', noteContentHash: calculateContentHash(after), idempotencyKey: randomUUID() });
      assert.equal(annotation.identityBinding.rootBlockId, blockIds(after)[0]);
      const next = after.replace('尾段', '尾段补充');
      await k.noteService.updateNote(note.id, { rawMarkdown: next, expectedUpdatedAt: note.updatedAt,
        annotationMapping: mapping(after, next, editorState(next, [{ id: annotation.id, scopeType: 'section', present: true, rootBlockId: blockIds(next)[0] }])) });
      const reloaded = await k.contentAnnotationService.getAnnotation(annotation.id);
      assert.equal(reloaded.identityBinding.rootBlockId, blockIds(next)[0]);
      assert.equal(reloaded.identityBinding.contentHash, calculateContentHash(next));
    } finally {
      try { await app?.close(); } finally {
        try { await database?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
      }
    }
  }
}] : [];
