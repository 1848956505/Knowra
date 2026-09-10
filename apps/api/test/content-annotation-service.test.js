import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { AppError } from '../src/errors/app-error.js';
import { createContentAnnotationService } from '../src/modules/knowledge/application/content-annotation-service.js';
import { createInMemoryContentAnnotationRepository } from '../src/modules/knowledge/infrastructure/content-annotation-repository.js';
import { anchorFromProjectedRange, projectMarkdown } from '@study-accelerator/content-anchor';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const note = { id: 'note-1', spaceId: 'space-1', rawMarkdown: 'alpha important beta', deleted: false };
const input = (key = 'request-1') => ({ spaceId: 'space-1', noteId: 'note-1', quoteText: 'important', fromPosition: 6, toPosition: 15, prefixText: 'alpha ', suffixText: ' beta', headingPath: [], anchorFingerprint: 'fingerprint', noteContentHash: hash(note.rawMarkdown), idempotencyKey: key });
const version = { id: 'version-1', noteId: note.id, content: note.rawMarkdown, contentHash: hash(note.rawMarkdown) };

function versionedInput(markdown = note.rawMarkdown, key = 'versioned-request') {
  const projection = projectMarkdown(markdown);
  const start = projection.text.indexOf('important');
  const anchor = anchorFromProjectedRange(projection, start, start + 'important'.length);
  return {
    spaceId: note.spaceId,
    noteId: note.id,
    schemaVersion: 2,
    scopeType: 'selection',
    kind: 'important',
    sourceMode: 'manual',
    quoteText: anchor.quoteText,
    fromPosition: anchor.sourceStart,
    toPosition: anchor.sourceEnd,
    prefixText: anchor.prefixText,
    suffixText: anchor.suffixText,
    headingPath: [],
    anchor,
    anchorFingerprint: 'client-assertion-only',
    noteContentHash: hash(markdown),
    idempotencyKey: key
  };
}

export const contentAnnotationServiceTests = [
  {
    name: 'content annotation service persists idempotently and archives annotations',
    async run() {
      const service = createContentAnnotationService({
        noteRepository: { findById: () => note }
      });
      const created = service.createAnnotation(input());
      assert.equal(service.createAnnotation(input()).id, created.id);
      assert.equal(
        service.listAnnotationsByNote({ noteId: note.id }).length,
        1
      );
      assert.equal(service.archiveAnnotation(created.id).status, 'archived');
      assert.equal(
        service.listAnnotationsByNote({ noteId: note.id }).length,
        0
      );
      assert.equal(service.restoreAnnotation(created.id).status, 'active');
    }
  },
  {
    name: 'content annotation service uses the shared AppError contract',
    async run() {
      const service = createContentAnnotationService({
        noteRepository: { findById: () => null }
      });

      assert.throws(
        () => service.createAnnotation(input('missing-note')),
        (error) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, 'ANNOTATION_NOTE_NOT_FOUND');
          assert.equal(error.statusCode, 404);
          return true;
        }
      );
    }
  },
  {
    name: 'schema v2 annotation validates the quote against the saved NoteVersion projection',
    async run() {
      const service = createContentAnnotationService({
        noteRepository: { findById: () => note },
        noteVersionRepository: { findByNoteIdAndContentHash: () => version }
      });
      const created = service.createAnnotation(versionedInput());
      assert.equal(created.schemaVersion, 2);
      assert.equal(created.noteVersionId, version.id);
      assert.equal(created.originSnapshot.quoteText, 'important');
      assert.equal(created.anchor.noteVersionId, version.id);

      assert.throws(
        () => service.createAnnotation({ ...versionedInput(note.rawMarkdown, 'forged'), quoteText: 'forged quote' }),
        (error) => error.code === 'ANNOTATION_QUOTE_MISMATCH'
      );
    }
  },
  {
    name: 'annotation revisions protect metadata writes and idempotency keys',
    async run() {
      const repository = createInMemoryContentAnnotationRepository();
      const service = createContentAnnotationService({
        repository,
        noteRepository: { findById: () => note },
        noteVersionRepository: { findByNoteIdAndContentHash: () => version }
      });
      const request = versionedInput(note.rawMarkdown, 'revision-request');
      const created = service.createAnnotation(request);
      const updated = service.updateAnnotation(created.id, {
        expectedRevision: created.revision,
        kind: 'question',
        comment: '待核对',
        importance: 'core'
      });
      assert.equal(updated.revision, 2);
      assert.equal(updated.kind, 'question');
      assert.throws(
        () => service.updateAnnotation(created.id, { expectedRevision: 1, comment: '覆盖' }),
        (error) => error.code === 'ANNOTATION_REVISION_CONFLICT'
      );
      assert.throws(
        () => service.createAnnotation({ ...request, quoteText: 'different' }),
        (error) => error.code === 'ANNOTATION_IDEMPOTENCY_CONFLICT'
      );
    }
  },
  {
    name: 'archiving a reading mark does not invalidate historical evidence',
    async run() {
      let archivedCallbackCount = 0;
      const service = createContentAnnotationService({
        noteRepository: { findById: () => note },
        onAnnotationArchived: () => { archivedCallbackCount += 1; }
      });
      const created = service.createAnnotation(input('archive-health'));
      const archived = service.archiveAnnotation(created.id, { expectedRevision: 1 });
      assert.equal(archived.lifecycleStatus, 'archived');
      assert.equal(archivedCallbackCount, 0);
    }
  }
];
