import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPostgresAiRepository } from '../src/modules/ai/postgres-record-repository.js';
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
