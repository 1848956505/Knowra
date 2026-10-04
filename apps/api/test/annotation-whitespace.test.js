import assert from 'node:assert/strict';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';
import { anchorForBlock, projectMarkdown, calculateContentHash, sourceEdit } from '@study-accelerator/content-anchor';

export const annotationWhitespaceTests = [
  { name: '版本化代码重点保留首尾和内部空行，重复块按锚点区分', run() {
    for (const code of ['\n合成代码', '合成代码\n', '\n合成代码\n', '甲\n\n乙']) {
      const k = createKnowledgeModule();
      const markdown = ['前文', '```\n' + code + '\n```', '```\n' + code + '\n```'].join('\n\n');
      const note = k.noteService.createNote({ spaceId: 'space', title: '合成代码', rawMarkdown: markdown });
      const p = projectMarkdown(markdown);
      const indices = p.blocks.flatMap((block, i) => block.type === 'code' ? [i] : []);
      const create = (index, key) => {
        const anchor = anchorForBlock(p, index);
        return k.contentAnnotationService.createAnnotation({
          noteId: note.id, spaceId: note.spaceId, schemaVersion: 2, scopeType: 'blocks',
          anchor, quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
          noteContentHash: calculateContentHash(markdown), anchorFingerprint: 'synthetic', idempotencyKey: key
        });
      };
      const first = create(indices[0], 'first'), second = create(indices[1], 'second');
      assert.equal(first.quoteText, code); assert.equal(second.quoteText, code);
      assert.notEqual(first.fromPosition, second.fromPosition);
      const updated = k.contentAnnotationService.updateAnnotationAnchor(first.id, {
        ...first, expectedRevision: first.revision, anchor: second.anchor
      });
      assert.equal(updated.quoteText, code);
      assert.equal(updated.fromPosition, second.fromPosition);
      assert.throws(() => k.contentAnnotationService.createAnnotation({
        ...second, idempotencyKey: 'forged', quoteText: '伪造'
      }), { code: 'ANNOTATION_QUOTE_MISMATCH' });
      assert.throws(() => k.contentAnnotationService.createAnnotation({
        ...second, idempotencyKey: 'stale', noteContentHash: 'stale'
      }), { code: 'ANNOTATION_CONTENT_CONFLICT' });
    }
  }},
  { name: '代码增行保留标注和知识关联身份，历史依据只转待核对', run() {
    const k = createKnowledgeModule(), before = '## 合成章节\n\n```\n原始甲\n原始乙\n```\n\n尾段';
    const note = k.noteService.createNote({ spaceId: 'synthetic-space', title: '合成关联', rawMarkdown: before });
    const p = projectMarkdown(before), anchor = anchorForBlock(p, p.blocks.findIndex(block => block.type === 'code'));
    const annotation = k.contentAnnotationService.createAnnotation({
      spaceId: note.spaceId, noteId: note.id, schemaVersion: 2, scopeType: 'blocks', anchor,
      quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
      noteContentHash: calculateContentHash(before), anchorFingerprint: 'synthetic', idempotencyKey: 'synthetic',
      importance: 'core', comment: '合成备注'
    });
    const candidate = k.knowledgeItemService.createCandidate({
      title: '合成知识候选', canonicalStatement: '合成说明', sourceMode: 'annotation',
      evidence: [{ sourceType: 'annotation', annotationId: annotation.id, expectedAnnotationRevision: annotation.revision }]
    });
    const evidence = candidate.evidence[0], after = before.replace('原始乙\n```', '原始乙\n新增行\n```');
    k.noteService.updateNote(note.id, {
      rawMarkdown: after, expectedUpdatedAt: note.updatedAt,
      annotationMapping: { formatVersion: 1, operationId: 'synthetic-edit', baseContentHash: calculateContentHash(before),
        targetContentHash: calculateContentHash(after), edits: [sourceEdit(before, after)] }
    });
    const updated = k.contentAnnotationService.getAnnotation(annotation.id);
    const links = k.annotationScopeService.getKnowledgeLinks(annotation.id);
    assert.equal(updated.id, annotation.id); assert.equal(updated.comment, annotation.comment);
    assert.equal(updated.importance, annotation.importance); assert.match(updated.quoteText, /新增行/);
    assert.equal(links.candidates[0].knowledgeItem.id, candidate.item.id);
    assert.equal(links.candidates[0].evidence.id, evidence.id);
    assert.equal(links.candidates[0].evidence.annotationId, annotation.id);
    assert.equal(links.candidates[0].evidence.quoteText, evidence.quoteText);
    assert.equal(links.candidates[0].evidence.noteVersionId, evidence.noteVersionId);
    assert.equal(links.candidates[0].evidence.status, 'stale');
  }}
];
