import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPostgresAppContext } from '../src/postgres-app.factory.js';
import { projectMarkdown, anchorForListItem, anchorFromProjectedRange, calculateContentHash, sourceEdits } from '@study-accelerator/content-anchor';

export const annotationListPostgresTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [{
  name: '真实 PostgreSQL：列表跟随、确认、排除与正文/结构/修订原子回滚',
  async run() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-list-pg-test-'));
    let database, app;
    try {
      database = await createPostgresTestDatabase();
      app = await createPostgresAppContext({ databaseUrl: database.databaseUrl, storageRootDir: root });
      const k = app.modules.knowledge, space = await k.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
      let note = await k.noteService.createNote({ id: randomUUID(), spaceId: space.id, title: randomUUID(), rawMarkdown: '- 父项\n- 相邻' });
      const anchor = anchorForListItem(projectMarkdown(note.rawMarkdown), '0.0');
      const annotation = await k.contentAnnotationService.createAnnotation({ spaceId: space.id, noteId: note.id,
        schemaVersion: 2, scopeType: 'list', anchor, quoteText: anchor.quoteText, fromPosition: anchor.sourceStart,
        toPosition: anchor.sourceEnd, noteContentHash: calculateContentHash(note.rawMarkdown), anchorFingerprint: 'pg', idempotencyKey: randomUUID() });
      const save = rawMarkdown => k.noteService.updateNote(note.id, { rawMarkdown, expectedUpdatedAt: note.updatedAt,
        annotationMapping: { formatVersion: 1, operationId: randomUUID(), baseContentHash: calculateContentHash(note.rawMarkdown),
          targetContentHash: calculateContentHash(rawMarkdown), edits: sourceEdits(note.rawMarkdown, rawMarkdown) } });
      note = await save('- 父项补充\n- 相邻');
      assert.equal((await k.contentAnnotationService.getAnnotation(annotation.id)).anchorStatus, 'resolved');
      note = await save('- 父项补充\n  - 相邻');
      const preview = await k.annotationScopeService.previewAnnotation(annotation.id); assert.ok(preview.pendingRange, JSON.stringify(preview));
      const confirmed = await k.contentAnnotationService.confirmAnnotationRange(annotation.id, {
        expectedRevision: preview.annotation.revision, noteContentHash: preview.currentContentHash, candidateHash: preview.pendingRange.candidateHash
      });
      assert.equal(confirmed.anchorStatus, 'resolved'); assert.match(confirmed.quoteText, /相邻/);
      const projection = projectMarkdown(note.rawMarkdown), start = projection.text.indexOf('相邻');
      await k.annotationScopeService.createExclusion(annotation.id, { expectedRevision: confirmed.revision,
        noteContentHash: calculateContentHash(note.rawMarkdown), anchor: anchorFromProjectedRange(projection, start, start + 2) });
      const analyzed = await k.annotationScopeService.previewAnalysisScope({ spaceId: space.id, mode: 'marked', annotationIds: [annotation.id] });
      assert.equal(analyzed.segments.map(segment => segment.markdown).join(''), '父项补充');
      const baseline = await k.contentAnnotationService.getAnnotation(annotation.id);
      await app.prisma.$executeRawUnsafe(`CREATE FUNCTION fail_list_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected list revision failure'; END $$`);
      await app.prisma.$executeRawUnsafe(`CREATE TRIGGER list_revision_failure BEFORE INSERT ON "AnnotationRevision" FOR EACH ROW EXECUTE FUNCTION fail_list_revision()`);
      try {
        await assert.rejects(save('- 父项补充更新\n  - 相邻'));
        assert.equal((await k.noteService.getNote(note.id)).rawMarkdown, note.rawMarkdown);
        assert.deepEqual((await k.noteService.getNote(note.id)).annotationStructure, note.annotationStructure);
        assert.deepEqual(await k.contentAnnotationService.getAnnotation(annotation.id), baseline);
      } finally {
        await app.prisma.$executeRawUnsafe('DROP TRIGGER list_revision_failure ON "AnnotationRevision"');
        await app.prisma.$executeRawUnsafe('DROP FUNCTION fail_list_revision()');
      }
      const stored = await app.prisma.contentAnnotation.findUnique({ where: { id: annotation.id } });
      assert.equal(stored.scopeType, 'list'); assert.ok(stored.anchor.tracking.rootId);
    } finally {
      try { await app?.close(); } finally {
        try { await database?.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); }
      }
    }
  }
}] : [];
