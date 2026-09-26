import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPostgresAiRepository } from '../src/modules/ai/postgres-record-repository.js';
import { createPostgresBudgetAuthority } from '../src/modules/ai/postgres-budget-authority.js';
import { createAiWorker } from '../src/modules/ai/worker.js';
import { aiRecords } from './ai-record-fixtures.js';

export const aiPostgresRepositoryTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [{
  name: 'AI PostgreSQL repository 在隔离库验证迁移、并发幂等、用量与 epoch 失效',
  async run() {
    const db = new PrismaClient({
      datasources: { db: { url: process.env.KNOWRA_SYNC_TEST_DATABASE_URL } },
      log: []
    });
    try {
      await db.$connect();
      const ownerId = `ai-test-${randomUUID()}`;
      const first = createPostgresAiRepository({ client: db, ownerId });
      const second = createPostgresAiRepository({ client: db, ownerId });
      const records = aiRecords(await first.identity(), randomUUID(), ownerId);
      await first.insert('scopeSnapshot', records.scope);
      assert.deepEqual(await first.identity(), await second.identity());
      assert.equal((await first.get('scopeSnapshot', records.scope.scopeSnapshotId)).scopeHash, records.scope.scopeHash);
      const anotherOwner = createPostgresAiRepository({ client: db, ownerId: `other-${randomUUID()}` });
      assert.equal(await anotherOwner.get('scopeSnapshot', records.scope.scopeSnapshotId), null);
      assert.deepEqual(await anotherOwner.list('scopeSnapshot'), []);
      await first.insert('contextManifest', records.manifest);
      await first.insert('aiGrant', records.grant);
      const [left, right] = await Promise.all([
        first.insert('aiJob', records.job),
        second.insert('aiJob', records.job)
      ]);
      assert.equal(left.jobId, right.jobId);
      assert.equal((await first.list('aiJob', { ownerId })).length, 1);
      await assert.rejects(
        first.insert('aiJob', { ...records.job, jobId: `other-${randomUUID()}`, requestId: `other-${randomUUID()}`, inputHash: '0'.repeat(64) }),
        { code: 'AI_IDEMPOTENCY_CONFLICT' }
      );
      await first.insert('aiJobAttempt', records.attempt);
      await first.insert('aiUsageRecord', records.usage);
      await first.appendEvent(records.event);
      assert.equal((await second.get('aiUsageRecord', records.usage.usageId)).usageUnknown, true);
      assert.equal((await second.listEvents(records.job.jobId)).length, 1);
      const oldEpoch = (await first.identity()).datasetEpoch;
      await first.rotateEpoch();
      assert.notEqual((await second.identity()).datasetEpoch, oldEpoch);
      await assert.rejects(
        first.insert('aiJobAttempt', { ...records.attempt, attemptId: `late-${randomUUID()}`, ordinal: 2, leaseGeneration: 2 }),
        { code: 'AI_REFERENCE_INVALID' }
      );
    } finally { await db.$disconnect(); }
  }
}] : [];

export const aiPostgresBudgetTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [{
  name: 'AI PostgreSQL 预算按计费账户串行化，并发设备共用 10 元日额度',
  async run() {
    const db = new PrismaClient({ datasources: { db: { url: process.env.KNOWRA_SYNC_TEST_DATABASE_URL } }, log: [] });
    try {
      await db.$connect();
      const budget = createPostgresBudgetAuthority(db);
      const accountRef = `budget-${randomUUID()}`;
      const requests = Array.from({ length: 6 }, (_, index) => budget.reserve({ accountRef,
        jobId: `job-${index}`, attemptId: `attempt-${index}`, priceVersion: 'test-price', reservedMicrounits: 2_000_000 }));
      const settled = await Promise.allSettled(requests);
      assert.equal(settled.filter(item => item.status === 'fulfilled').length, 5);
      assert.equal(settled.filter(item => item.status === 'rejected' && item.reason.code === 'AI_DAILY_BUDGET_EXCEEDED').length, 1,
        settled.filter(item => item.status === 'rejected').map(item => `${item.reason.code}: ${item.reason.message}`).join('; '));
      const status = await budget.status(accountRef);
      assert.equal(status.heldMicrounits, 10_000_000);
      const first = settled.find(item => item.status === 'fulfilled').value;
      await budget.settle({ accountRef, attemptId: first.attemptId, disposition: 'unknown' });
      assert.equal((await budget.status(accountRef)).availableMicrounits, 0);
      assert.equal((await budget.reserve({ accountRef, jobId: first.jobId, attemptId: first.attemptId,
        priceVersion: 'test-price', reservedMicrounits: 2_000_000 })).reservationId, first.reservationId);
    } finally { await db.$disconnect(); }
  }
}, {
  name: 'AI PostgreSQL 并发 Worker 只有一个领取任务并执行模型调用',
  async run() {
    const db = new PrismaClient({ datasources: { db: { url: process.env.KNOWRA_SYNC_TEST_DATABASE_URL } }, log: [] });
    try {
      await db.$connect();
      const ownerId = `worker-${randomUUID()}`;
      const accountRef = `account-${randomUUID()}`;
      const repository = createPostgresAiRepository({ client: db, ownerId });
      const records = aiRecords(await repository.identity(), randomUUID(), ownerId);
      for (const [kind, record] of [['scopeSnapshot', records.scope], ['contextManifest', records.manifest],
        ['aiGrant', records.grant], ['aiJob', records.job]]) await repository.insert(kind, record);
      let calls = 0;
      const gateway = { capabilities: () => ({ provider: 'mock' }), async complete() {
        calls++;
        return { content: '合成回答', requestId: 'pg-result', usage: { inputTokens: 1, outputTokens: 1, unknown: false } };
      } };
      const common = { repository, budget: createPostgresBudgetAuthority(db), gateway, accountRef,
        priceProfile: { version: 'test', expiresAt: '2030-01-01T00:00:00.000Z',
          inputMicrounitsPerMillion: 2_000_000, outputMicrounitsPerMillion: 8_000_000 } };
      const request = { credentialRef: records.job.credentialRef, modelId: records.job.modelId,
        messages: [{ role: 'user', content: 'synthetic' }], maxTokens: 64, tools: [] };
      const results = await Promise.allSettled([
        createAiWorker(common).run(records.job.jobId, request),
        createAiWorker(common).run(records.job.jobId, request)
      ]);
      assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
      assert.equal(calls, 1);
      assert.equal((await repository.list('aiJobAttempt', { jobId: records.job.jobId })).length, 1);
    } finally { await db.$disconnect(); }
  }
}] : [];
