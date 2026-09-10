import assert from 'node:assert/strict';
import { anchorForSection, anchorFromProjectedRange, calculateContentHash, projectMarkdown } from '@study-accelerator/content-anchor';
import { createKnowledgeModule } from '../src/modules/knowledge/index.js';
import { createInMemoryContentAnnotationRepository } from '../src/modules/knowledge/infrastructure/content-annotation-repository.js';
import { createContentAnnotationService } from '../src/modules/knowledge/application/content-annotation-service.js';

function createFixture() {
  const knowledge = createKnowledgeModule();
  const markdown = '## 范围\n\nA 段\n\nB 段\n\nC 段\n\n## 下一节\n\nD 段';
  const note = knowledge.noteService.createNote({ id: 'scope-note', spaceId: 'scope-space', title: '范围', rawMarkdown: markdown });
  const version = knowledge.noteVersionService.listVersions({ noteId: note.id })[0];
  const projection = projectMarkdown(markdown);
  const sectionAnchor = anchorForSection(projection, 0);
  const annotation = knowledge.contentAnnotationService.createAnnotation({
    spaceId: note.spaceId, noteId: note.id, schemaVersion: 2, scopeType: 'section',
    kind: 'important', sourceMode: 'manual', quoteText: sectionAnchor.quoteText,
    fromPosition: sectionAnchor.sourceStart, toPosition: sectionAnchor.sourceEnd,
    prefixText: sectionAnchor.prefixText, suffixText: sectionAnchor.suffixText,
    headingPath: [], anchor: sectionAnchor, anchorFingerprint: 'client-only',
    noteContentHash: version.contentHash, idempotencyKey: 'scope-section'
  });
  return { knowledge, note, version, projection, annotation };
}

export const annotationScopeServiceTests = [
  {
    name: 'section annotation exclusions are persisted and removed from unified analysis scope',
    async run() {
      const { knowledge, note, projection, annotation } = createFixture();
      const start = projection.text.indexOf('B 段');
      const exclusionAnchor = anchorFromProjectedRange(projection, start, start + 'B 段'.length);
      const created = knowledge.annotationScopeService.createExclusion(annotation.id, {
        expectedRevision: annotation.revision,
        noteContentHash: calculateContentHash(note.rawMarkdown),
        anchor: exclusionAnchor
      });
      assert.equal(created.annotation.revision, 2);

      const repeated = knowledge.annotationScopeService.createExclusion(annotation.id, {
        expectedRevision: annotation.revision,
        noteContentHash: calculateContentHash(note.rawMarkdown),
        anchor: exclusionAnchor
      });
      assert.equal(repeated.exclusion.id, created.exclusion.id);
      assert.equal(repeated.annotation.revision, 2);
      assert.equal(knowledge.repositories.annotationExclusionRepository.list({ parentAnnotationId: annotation.id }).length, 1);

      const preview = knowledge.annotationScopeService.previewAnalysisScope({
        spaceId: note.spaceId,
        mode: 'marked',
        annotationIds: [annotation.id]
      });
      assert.equal(preview.ai.available, false);
      assert.match(preview.segments.map((segment) => segment.markdown).join(''), /A 段/);
      assert.doesNotMatch(preview.segments.map((segment) => segment.markdown).join(''), /B 段/);
      assert.match(preview.segments.map((segment) => segment.markdown).join(''), /C 段/);
    }
  },
  {
    name: 'analysis scope snapshots are immutable and reject stale previews',
    async run() {
      const { knowledge, note, annotation } = createFixture();
      const input = { spaceId: note.spaceId, mode: 'marked', annotationIds: [annotation.id] };
      const preview = knowledge.annotationScopeService.previewAnalysisScope(input);
      const snapshot = knowledge.annotationScopeService.createAnalysisScope({ ...input, previewHash: preview.previewHash, idempotencyKey: 'snapshot-1' });
      knowledge.noteService.updateNote(note.id, { rawMarkdown: `${note.rawMarkdown}\n新增` });
      const stored = knowledge.annotationScopeService.getAnalysisScope(snapshot.id, note.spaceId);
      assert.deepEqual(stored.segments, snapshot.segments);
      assert.equal(stored.inputHash, preview.previewHash);
      assert.throws(
        () => knowledge.annotationScopeService.createAnalysisScope({ ...input, previewHash: preview.previewHash, idempotencyKey: 'snapshot-2' }),
        (error) => error.code === 'ANNOTATION_CONTENT_CONFLICT'
      );
    }
  },
  {
    name: 'section annotations follow ordinary additions but stop on boundary changes',
    async run() {
      const { knowledge, note, annotation } = createFixture();
      knowledge.noteService.updateNote(note.id, {
        rawMarkdown: note.rawMarkdown.replace('\n\n## 下一节', '\n\n新增段落\n\n## 下一节')
      });
      const followed = knowledge.contentAnnotationService.getAnnotation(annotation.id);
      assert.equal(followed.anchorStatus, 'resolved');
      assert.match(followed.quoteText, /新增段落/);

      const current = knowledge.noteService.getNote(note.id);
      knowledge.noteService.updateNote(note.id, {
        rawMarkdown: current.rawMarkdown.replace('## 下一节', '# 下一节')
      });
      const changed = knowledge.contentAnnotationService.getAnnotation(annotation.id);
      assert.equal(changed.anchorStatus, 'needsReview');
      assert.equal(changed.anchorReason, 'boundaryChanged');
    }
  },
  {
    name: 'annotation and revision writes roll back together when revision persistence fails',
    async run() {
      const records = [];
      const note = { id: 'rollback-note', spaceId: 'rollback-space', rawMarkdown: '正文', deleted: false };
      const version = { id: 'rollback-version', noteId: note.id, content: note.rawMarkdown, contentHash: calculateContentHash(note.rawMarkdown) };
      const repository = createInMemoryContentAnnotationRepository({ records });
      const runTransaction = (operation) => {
        const before = structuredClone(records);
        try { return operation(); } catch (error) { records.splice(0, records.length, ...before); throw error; }
      };
      const service = createContentAnnotationService({
        repository,
        noteRepository: { findById: () => note },
        noteVersionRepository: { findByNoteIdAndContentHash: () => version },
        revisionRepository: { save() { throw new Error('fault after annotation save'); } }
      });
      const projection = projectMarkdown(note.rawMarkdown);
      const anchor = anchorFromProjectedRange(projection, 0, projection.text.length);
      assert.throws(() => runTransaction(() => service.createAnnotation({
        spaceId: note.spaceId, noteId: note.id, schemaVersion: 2, scopeType: 'selection',
        kind: 'important', sourceMode: 'manual', quoteText: anchor.quoteText,
        fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
        prefixText: '', suffixText: '', headingPath: [], anchor,
        anchorFingerprint: 'client', noteContentHash: version.contentHash,
        idempotencyKey: 'rollback'
      })), /fault after annotation save/);
      assert.equal(records.length, 0);
    }
  }
];
