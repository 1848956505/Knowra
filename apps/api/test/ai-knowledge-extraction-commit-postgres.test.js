import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPostgresAppContext } from '../src/postgres-app.factory.js';
import { createPostgresAiRepository } from '../src/modules/ai/postgres-record-repository.js';
import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';
import { createKnowledgeExtractionJobFixture } from './fixtures/knowledge-extraction-job.fixture.js';

async function withFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-extraction-pg-')); const apps = [];
  let database;
  try {
    database = await createPostgresTestDatabase(); const ownerId = `extraction-${randomUUID()}`;
    const start = async () => {
      const app = await createPostgresAppContext({ databaseUrl: database.databaseUrl, ownerId, storageRootDir: root, uploadsDir: path.join(root, 'uploads') });
      apps.push(app); return app;
    };
    const app = await start(), ai = createPostgresAiRepository({ client: app.prisma, ownerId });
    await run({ app, ai, start, ownerId, ...await createKnowledgeExtractionJobFixture(app, ai, ownerId) });
  } finally {
    try { for (const app of apps.reverse()) { try { await app.ai?.agent?.close?.(); await app.ai?.worker?.close?.(); } finally { await app.close(); } } }
    finally { try { await database?.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); } }
  }
}

export const aiKnowledgeExtractionCommitPostgresTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [
  { name: 'P3 PostgreSQL 提炼：两实例同结果竞争、断响应重启复用，业务/任务/provenance/outbox 同一提交', async run() {
    await withFixture(async f => {
      const other = await f.start();
      const receipts = await Promise.all([f.app, other].map(app => app.knowledgeExtractionCommit.commit(f.input)));
      assert.deepEqual(receipts[0], receipts[1]);
      assert.equal(await f.app.prisma.knowledgeItem.count(), 1); assert.equal(await f.app.prisma.knowledgeEvidence.count(), 1);
      const [{ count }] = await f.app.prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM knowledge_extraction_commits');
      assert.equal(count, 1); assert.equal((await f.ai.get('aiJob', f.input.jobId)).status, 'succeeded');
      assert.equal((await f.ai.get('aiJobAttempt', f.input.attemptId)).status, 'validated');
      const receipt = receipts[0], item = await f.app.repositories.knowledgeItemRepository.findById(receipt.candidates[0].candidateInput.id);
      assert.equal(item.reviewStatus, 'candidate');
      await f.app.http.knowledge.updateKnowledgeItem({ id: item.id }, { title: '用户合成修订', expectedUpdatedAt: item.updatedAt });
      const restarted = await f.start(); assert.deepEqual(await restarted.knowledgeExtractionCommit.commit(f.input), receipt);
      assert.equal((await restarted.repositories.knowledgeItemRepository.findById(item.id)).title, '用户合成修订');
      const journal = await f.app.prisma.syncJournal.findUnique({ where: { ownerId: f.ownerId } });
      assert(JSON.stringify(journal.payload).includes(item.id)); assert.equal(JSON.stringify(journal.payload).includes(f.input.jobId), false);
      const changed = structuredClone(f.output); changed.candidates[0].title = '另一模拟结果';
      await assert.rejects(f.app.knowledgeExtractionCommit.commit({ ...f.input, result: await f.respond(changed) }), { code: 'KNOWLEDGE_EXTRACTION_OUTPUT_CONFLICT' });
    });
  } },
  { name: 'P3 PostgreSQL 提炼：两实例不同结果竞争只采纳首份正文，绝不混合两批候选或来源', async run() {
    await withFixture(async f => {
      const other = await f.start(), changed = structuredClone(f.output); changed.candidates[0].title = '第二个完整结果';
      const outcomes = await Promise.allSettled([f.app.knowledgeExtractionCommit.commit(f.input),
        other.knowledgeExtractionCommit.commit({ ...f.input, result: await f.respond(changed) })]);
      assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
      const failure = outcomes.find(value => value.status === 'rejected'); assert.equal(failure.reason.code, 'KNOWLEDGE_EXTRACTION_OUTPUT_CONFLICT');
      const accepted = outcomes.find(value => value.status === 'fulfilled').value;
      const item = await f.app.repositories.knowledgeItemRepository.findById(accepted.candidates[0].candidateInput.id);
      assert.equal(item.title, accepted.result.candidates[0].title); assert.equal(await f.app.prisma.knowledgeItem.count(), 1);
      assert.equal(await f.app.prisma.knowledgeEvidence.count(), 1);
    });
  } },
  { name: 'P3 PostgreSQL 提炼：提交记录及最后任务更新 SQL 故障都回滚所有业务和同步记录', async run() {
    for (const table of ['knowledge_extraction_commits', 'ai_jobs']) await withFixture(async f => {
      const before = await f.app.prisma.syncJournal.findUnique({ where: { ownerId: f.ownerId } });
      await f.app.prisma.$executeRawUnsafe(`CREATE FUNCTION fail_extraction_commit() RETURNS trigger LANGUAGE plpgsql AS
        'BEGIN RAISE EXCEPTION ''injected extraction sql failure''; END;'`);
      await f.app.prisma.$executeRawUnsafe(`CREATE TRIGGER fail_extraction_commit BEFORE ${table === 'ai_jobs' ? 'UPDATE' : 'INSERT'} ON ${table}
        FOR EACH ROW EXECUTE FUNCTION fail_extraction_commit()`);
      try { await assert.rejects(f.app.knowledgeExtractionCommit.commit(f.input), /injected extraction sql failure/); }
      finally { await f.app.prisma.$executeRawUnsafe(`DROP TRIGGER fail_extraction_commit ON ${table}`); }
      assert.equal(await f.app.prisma.knowledgeItem.count(), 0); assert.equal(await f.app.prisma.knowledgeEvidence.count(), 0);
      assert.equal((await f.ai.get('aiJob', f.input.jobId)).status, 'running');
      assert.equal((await f.ai.get('aiJobAttempt', f.input.attemptId)).status, 'sent');
      const [{ count }] = await f.app.prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM knowledge_extraction_commits'); assert.equal(count, 0);
      assert.deepEqual(await f.app.prisma.syncJournal.findUnique({ where: { ownerId: f.ownerId } }), before);
      const accepted = await f.app.knowledgeExtractionCommit.commit(f.input); assert.equal(accepted.candidates.length, 1);
    });
  } },
  { name: 'P3 PostgreSQL 提炼：核心源删除/旧 epoch 拒绝，嵌套接纳不绕过事务边界', async run() {
    await withFixture(async f => {
      let ran = false;
      await f.app.prisma.$transaction(async () => {
        await assert.rejects(async () => { await f.app.knowledgeExtractionCommit.commit(f.input); ran = true; }, /最外层/);
      });
      assert.equal(ran, false); assert.equal(await f.app.prisma.knowledgeItem.count(), 0);
      await f.app.http.knowledge.deleteNote({ id: f.note.id });
      await assert.rejects(f.app.knowledgeExtractionCommit.commit(f.input), { code: 'KNOWLEDGE_EXTRACTION_SOURCE_UNAVAILABLE' });
      assert.equal(await f.app.prisma.knowledgeItem.count(), 0);
      await f.ai.rotateEpoch();
      await assert.rejects(f.app.knowledgeExtractionCommit.commit(f.input), { code: 'KNOWLEDGE_EXTRACTION_JOB_INVALID' });
    });
  } }
] : [];
