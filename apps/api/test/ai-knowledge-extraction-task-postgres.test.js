import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPostgresAppContext } from '../src/postgres-app.factory.js';
import { createPostgresAiRepository } from '../src/modules/ai/postgres-record-repository.js';
import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';
import { createExtractionTaskSources, extractionTaskGateway, deferredTaskResponse, quietTaskLogger } from './fixtures/knowledge-extraction-task.fixture.js';

async function fixture(run, onCall) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-extraction-task-pg-')), apps = [];
  const mock = extractionTaskGateway(onCall), ownerId = `extraction-task-${randomUUID()}`;
  let database, now = new Date('2026-10-02T12:00:00.000Z');
  try {
    database = await createPostgresTestDatabase();
    const open = async () => {
      const app = await createPostgresAppContext({ databaseUrl: database.databaseUrl, ownerId, storageRootDir: root, uploadsDir: path.join(root, 'uploads'),
        knowledgeExtractionMock: { gateway: mock.gateway, clock: () => now, schedule() {}, logger: quietTaskLogger } });
      apps.push(app); return app;
    };
    const app = await open(), ai = createPostgresAiRepository({ client: app.prisma, ownerId });
    await run({ app, ai, mock, open, ownerId, advance: ms => { now = new Date(now.getTime() + ms); }, ...await createExtractionTaskSources(app) });
  } finally {
    try { for (const app of apps.reverse()) {
      try { await app.knowledgeExtractionTasks?.close(); await app.ai?.agent?.close?.(); await app.ai?.worker?.close?.(); }
      finally { await app.close(); }
    } } finally { try { await database?.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); } }
  }
}

async function failTrigger(db, table, event, condition = '') {
  await db.$executeRawUnsafe("CREATE FUNCTION fail_extraction_task() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''injected extraction task SQL''; END;'");
  await db.$executeRawUnsafe(`CREATE TRIGGER fail_extraction_task BEFORE ${event} ON ${table} FOR EACH ROW ${condition} EXECUTE FUNCTION fail_extraction_task()`);
  return async () => { await db.$executeRawUnsafe(`DROP TRIGGER fail_extraction_task ON ${table}`); await db.$executeRawUnsafe('DROP FUNCTION fail_extraction_task()'); };
}

export const aiKnowledgeExtractionTaskPostgresTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [
  { name: '02B PostgreSQL 两实例start同键只创建一束，领取只执行一次；重启保留回执与用户修订', async run() {
    const deferred = deferredTaskResponse();
    await fixture(async f => {
      const other = await f.open(), a = f.app.knowledgeExtractionTasks, b = other.knowledgeExtractionTasks;
      const [one, two] = await Promise.all([a.start(f.input), b.start(f.input)]); assert.deepEqual(one, two);
      for (const kind of ['scopeSnapshot', 'contextManifest', 'aiGrant', 'aiJob']) assert.equal((await f.ai.list(kind)).length, 1);
      const running = Promise.allSettled([a.run(one.jobId), b.run(one.jobId)]);
      await deferred.called; deferred.release(); const results = await running;
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(f.mock.calls.length, 1); assert.equal((await f.ai.list('aiJobAttempt')).length, 1);
      const completed = await a.get(one.jobId); assert.equal(completed.status, 'succeeded');
      const item = await f.app.repositories.knowledgeItemRepository.findById(completed.candidateIds[0]);
      await f.app.http.knowledge.updateKnowledgeItem({ id: item.id }, { title: '用户PG修订', expectedUpdatedAt: item.updatedAt });
      const restarted = await f.open(); assert.deepEqual(await restarted.knowledgeExtractionTasks.start(f.input), completed);
      assert.equal((await restarted.repositories.knowledgeItemRepository.findById(item.id)).title, '用户PG修订');
      const journal = await f.app.prisma.syncJournal.findUnique({ where: { ownerId: f.ownerId } });
      assert.equal(JSON.stringify(journal.payload).includes(one.jobId), false);
      const [{ count }] = await f.app.prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM ai_knowledge_extraction_tasks');
      assert.equal(count, 1);
    }, deferred.onCall);
  } },
  { name: '02B PostgreSQL 创建依赖/描述/末尾事件SQL失败整束回滚，领取SQL失败无孤立running', async run() {
    for (const table of ['ai_grants', 'ai_knowledge_extraction_tasks', 'ai_job_events', 'ai_job_attempts']) await fixture(async f => {
      const service = f.app.knowledgeExtractionTasks;
      const job = table === 'ai_job_attempts' ? await service.start(f.input) : null;
      const before = await f.app.prisma.syncJournal.findUnique({ where: { ownerId: f.ownerId } });
      const remove = await failTrigger(f.app.prisma, table, 'INSERT');
      try { await assert.rejects(job ? service.run(job.jobId) : service.start(f.input), /injected extraction task SQL/); }
      finally { await remove(); }
      assert.equal((await f.ai.list('aiJobAttempt')).length, 0);
      if (job) assert.equal((await service.get(job.jobId)).status, 'failed');
      else {
        for (const kind of ['scopeSnapshot', 'contextManifest', 'aiGrant', 'aiJob']) assert.equal((await f.ai.list(kind)).length, 0);
        const [{ count }] = await f.app.prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM ai_knowledge_extraction_tasks'); assert.equal(count, 0);
      }
      assert.equal(await f.app.prisma.knowledgeItem.count(), 0); assert.equal(f.mock.calls.length, 0);
      assert.deepEqual(await f.app.prisma.syncJournal.findUnique({ where: { ownerId: f.ownerId } }), before);
    });
  } },
  { name: '02B PostgreSQL 取消最终SQL故障回滚job和attempt；跨实例持久取消阻断迟到结果', async run() {
    const deferred = deferredTaskResponse();
    await fixture(async f => {
      const a = f.app.knowledgeExtractionTasks, b = (await f.open()).knowledgeExtractionTasks, job = await a.start(f.input);
      const running = a.run(job.jobId), failed = assert.rejects(running); await deferred.called;
      const remove = await failTrigger(f.app.prisma, 'ai_jobs', 'UPDATE', "WHEN (NEW.status = 'cancelled')");
      try { await assert.rejects(b.cancel(job.jobId), /injected/); } finally { await remove(); }
      assert.equal((await a.get(job.jobId)).status, 'running'); assert.equal((await f.ai.list('aiJobAttempt'))[0].status, 'sent');
      assert.equal((await b.cancel(job.jobId)).status, 'cancelled'); deferred.release(); await failed;
      assert.equal(await f.app.prisma.knowledgeItem.count(), 0); assert.equal(await f.app.prisma.knowledgeEvidence.count(), 0);
      assert.equal((await f.ai.list('aiJobAttempt'))[0].status, 'cancelled');
    }, deferred.onCall);
  } },
  { name: '02B PostgreSQL 恢复末尾失败回滚、活租约不抢占，过期恢复不自动重发', async run() {
    const deferred = deferredTaskResponse();
    await fixture(async f => {
      const service = f.app.knowledgeExtractionTasks, recovery = (await f.open()).knowledgeExtractionTasks, job = await service.start(f.input);
      const running = service.run(job.jobId), failed = assert.rejects(running); await deferred.called;
      assert.equal(await recovery.recover(), 0); f.advance(120001);
      const remove = await failTrigger(f.app.prisma, 'ai_jobs', 'UPDATE', "WHEN (NEW.status = 'failed')");
      try { await assert.rejects(recovery.recover(), /injected/); } finally { await remove(); }
      assert.equal((await service.get(job.jobId)).status, 'running'); assert.equal((await f.ai.list('aiJobAttempt'))[0].status, 'sent');
      assert.equal(await recovery.recover(), 1); assert.equal((await f.ai.list('aiJobAttempt'))[0].status, 'timedOut');
      deferred.release(); await failed; assert.equal(f.mock.calls.length, 1);
      assert.equal(await f.app.prisma.knowledgeItem.count(), 0);
    }, deferred.onCall);
  } },
  { name: '02B PostgreSQL pending重启需显式retry，来源删除/旧epoch拒绝，损坏描述不妨碍核心编辑', async run() {
    await fixture(async f => {
      const job = await f.app.knowledgeExtractionTasks.start(f.input), restarted = await f.open();
      assert.equal(await restarted.knowledgeExtractionTasks.recover(), 1); assert.equal(f.mock.calls.length, 0);
      await restarted.knowledgeExtractionTasks.retry(job.jobId); await restarted.knowledgeExtractionTasks.idle();
      assert.equal((await restarted.knowledgeExtractionTasks.get(job.jobId)).status, 'succeeded');
      const source = await createExtractionTaskSources(restarted, '-next');
      const next = await restarted.knowledgeExtractionTasks.start(source.input);
      await restarted.http.knowledge.deleteNote({ id: source.note.id });
      await assert.rejects(restarted.knowledgeExtractionTasks.run(next.jobId), { code: 'KNOWLEDGE_EXTRACTION_SOURCE_UNAVAILABLE' });
      await f.ai.rotateEpoch();
      await assert.rejects(restarted.knowledgeExtractionTasks.get(next.jobId), { code: 'KNOWLEDGE_EXTRACTION_TASK_STALE' });
      assert.equal(await restarted.knowledgeExtractionTasks.recover(), 0);
      await restarted.prisma.$executeRawUnsafe("UPDATE ai_knowledge_extraction_tasks SET descriptor_json = 'null'");
      await assert.rejects(restarted.knowledgeExtractionTasks.get(job.jobId), { code: 'KNOWLEDGE_EXTRACTION_TASK_INVALID' });
      await restarted.http.knowledge.updateNote({ id: f.note.id }, { rawMarkdown: '损坏描述旁正常编辑' });
      assert.equal((await restarted.repositories.noteRepository.findById(f.note.id)).rawMarkdown, '损坏描述旁正常编辑');
    });
  } }
] : [];
