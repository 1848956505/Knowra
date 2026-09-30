import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPostgresAppContext } from '../src/postgres-app.factory.js';
import { projectMarkdown, anchorFromProjectedRange, anchorForSection, calculateContentHash, sourceEdit } from '@study-accelerator/content-anchor';
export const annotationDynamicPostgresTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [{
  name:'真实 PostgreSQL：章节跟随、范围确认、持久排除与事务回滚',
  async run(){
    const root=mkdtempSync(path.join(tmpdir(),'knowra-annotation-pg-'));
    let database, app;
    try {
      database = await createPostgresTestDatabase();
      app=await createPostgresAppContext({databaseUrl:database.databaseUrl,storageRootDir:root});
      const k=app.modules.knowledge;const space=await k.knowledgeSpaceService.createDefaultKnowledgeSpace({userId:'demo'});
      const before='# A\n\n原内容\n\n# B\n\n尾部';
      const note=await k.noteService.createNote({id:randomUUID(),spaceId:space.id,title:randomUUID(),rawMarkdown:before});
      const anchor=anchorForSection(projectMarkdown(before),0);
      const annotation=await k.contentAnnotationService.createAnnotation({spaceId:space.id,noteId:note.id,schemaVersion:2,scopeType:'section',anchor,quoteText:anchor.quoteText,fromPosition:anchor.sourceStart,toPosition:anchor.sourceEnd,anchorFingerprint:'pg',noteContentHash:calculateContentHash(before),idempotencyKey:randomUUID()});
      const after=before.replace('原内容','新增内容');
      const saved=await k.noteService.updateNote(note.id,{rawMarkdown:after,expectedUpdatedAt:note.updatedAt,annotationMapping:{formatVersion:1,operationId:randomUUID(),baseContentHash:calculateContentHash(before),targetContentHash:calculateContentHash(after),edits:[sourceEdit(before,after)]}});
      const updated=await k.contentAnnotationService.getAnnotation(annotation.id);
      assert.equal(updated.anchorStatus,'resolved');assert.match(updated.quoteText,/新增内容/);
      assert.equal((await app.repositories.noteRepository.findById(note.id)).annotationStructure.contentHash,calculateContentHash(after));
      const boundary=after.replace('# B','## B');
      const changed=await k.noteService.updateNote(note.id,{rawMarkdown:boundary,expectedUpdatedAt:saved.updatedAt});
      const preview=await k.annotationScopeService.previewAnnotation(annotation.id);assert.ok(preview.pendingRange);
      await assert.rejects(k.contentAnnotationService.confirmAnnotationRange(annotation.id,{expectedRevision:1,noteContentHash:preview.currentContentHash,candidateHash:preview.pendingRange.candidateHash}),{code:'ANNOTATION_CONTENT_CONFLICT'});
      const confirmed=await k.contentAnnotationService.confirmAnnotationRange(annotation.id,{expectedRevision:preview.annotation.revision,noteContentHash:preview.currentContentHash,candidateHash:preview.pendingRange.candidateHash});
      assert.match(confirmed.quoteText,/尾部/);assert.equal(confirmed.anchorStatus,'resolved');
      const projection=projectMarkdown(boundary);const start=projection.text.indexOf('新增');
      await k.annotationScopeService.createExclusion(annotation.id,{expectedRevision:confirmed.revision,noteContentHash:calculateContentHash(boundary),anchor:anchorFromProjectedRange(projection,start,start+2)});
      // A database trigger fails the annotation revision after the note update: the entire transaction must roll back.
      await app.prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_annotation_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected annotation revision failure'; END $$`);
      await app.prisma.$executeRawUnsafe(`CREATE TRIGGER annotation_revision_failure BEFORE INSERT ON "AnnotationRevision" FOR EACH ROW EXECUTE FUNCTION fail_annotation_revision()`);
      try {
        await assert.rejects(k.noteService.updateNote(note.id,{rawMarkdown:boundary+'\n\n回滚',expectedUpdatedAt:changed.updatedAt}));
        assert.equal((await k.noteService.getNote(note.id)).rawMarkdown,boundary);
        assert.equal((await k.contentAnnotationService.getAnnotation(annotation.id)).revision,confirmed.revision+1);
      } finally { await app.prisma.$executeRawUnsafe('DROP TRIGGER annotation_revision_failure ON "AnnotationRevision"');await app.prisma.$executeRawUnsafe('DROP FUNCTION fail_annotation_revision()'); }
      await k.noteService.updateNote(note.id,{rawMarkdown:boundary.replace('新增',''),expectedUpdatedAt:changed.updatedAt});
      await assert.rejects(k.annotationScopeService.previewAnalysisScope({spaceId:space.id,mode:'marked',annotationIds:[annotation.id]}),{code:'ANNOTATION_EXCLUSION_CONFLICT'});
    } finally {
      try { await app?.close(); } finally {
        try { await database?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
      }
    }
  }
}] : [];
