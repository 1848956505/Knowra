import assert from 'node:assert/strict';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';
import { anchorForBlock, projectMarkdown, calculateContentHash } from '@study-accelerator/content-anchor';

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
  }}
];
