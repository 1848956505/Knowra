import assert from 'node:assert/strict';
import { anchorFromProjectedRange, projectMarkdown, calculateContentHash, sourceEdit } from '@study-accelerator/content-anchor';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';

function fixture(sink) {
  const module = createKnowledgeModule({ annotationShadowSink: sink });
  const note = module.noteService.createNote({ id: 'shadow-note', spaceId: 'space', title: '影子', rawMarkdown: '## A\n\n重要文字\n\n尾段' });
  const projection = projectMarkdown(note.rawMarkdown);
  const anchor = anchorFromProjectedRange(projection, 2, 6);
  const annotation = module.contentAnnotationService.createAnnotation({ noteId: note.id, spaceId: note.spaceId, schemaVersion: 2, scopeType: 'selection', anchor,
    quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, anchorFingerprint: 'fixture',
    noteContentHash: calculateContentHash(note.rawMarkdown), idempotencyKey: 'create' });
  return { module, note, annotation };
}
function editorState(markdown, annotations) {
  return { formatVersion: 2, targetContentHash: calculateContentHash(markdown),
    blocks: [{ id: 'h', type: 'heading', empty: false }, { id: 'p1', type: 'paragraph', empty: false }, { id: 'p2', type: 'paragraph', empty: false }], annotations };
}
function save(module, before, after, state) {
  return module.noteService.updateNote(before.id, { rawMarkdown: after, expectedUpdatedAt: before.updatedAt,
    annotationMapping: { formatVersion: 1, operationId: 'edit', baseContentHash: calculateContentHash(before.rawMarkdown), targetContentHash: calculateContentHash(after),
      edits: [sourceEdit(before.rawMarkdown, after)], ...(state === undefined ? {} : { editorState: state }) } });
}

export const annotationIdentityShadowTests = [
  { name: '身份影子：保存后比较编辑器身份与旧链路结果并记录结论', run() {
    const entries = [];
    const { module, note, annotation } = fixture(entry => entries.push(entry));
    const after = note.rawMarkdown.replace('重要文字', '重要的文字');
    save(module, note, after, editorState(after, [{ id: annotation.id, scopeType: 'selection', present: true, startBlockId: 'p1', endBlockId: 'p1', quoteText: '重要的文字' }]));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].noteId, note.id);
    assert.equal(entries[0].status, 'compared');
    assert.equal(entries[0].compared, 1);
    assert.deepEqual(entries[0].divergences, []);
    assert.equal(JSON.stringify(entries[0]).includes('重要'), false);
  } },
  { name: '身份影子：身份丢失与块不一致都被记录，旧链路结果不受影响', run() {
    const entries = [];
    const { module, note, annotation } = fixture(entry => entries.push(entry));
    const after = note.rawMarkdown.replace('尾段', '尾段补充');
    save(module, note, after, editorState(after, [{ id: annotation.id, scopeType: 'selection', present: true, startBlockId: 'p2', endBlockId: 'p2', quoteText: '重要文字' }]));
    assert.deepEqual(entries[0].divergences.map(item => item.kind), ['blockMismatch']);
    assert.equal(module.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'resolved');
  } },
  { name: '身份影子：没有快照、快照不合法或日志写入失败时保存照常完成', run() {
    const entries = [];
    const { module, note } = fixture(entry => entries.push(entry));
    const first = save(module, note, note.rawMarkdown + '\n\n追加');
    assert.equal(entries.length, 0);
    const second = save(module, first, first.rawMarkdown + '一', { formatVersion: 9 });
    assert.equal(entries.at(-1).status, 'invalidState');
    const failing = fixture(() => { throw new Error('磁盘已满'); });
    const after = failing.note.rawMarkdown + '二';
    const saved = save(failing.module, failing.note, after, editorState(after, []));
    assert.equal(saved.rawMarkdown, after);
    assert.ok(second.rawMarkdown.endsWith('一'));
  } }
];
