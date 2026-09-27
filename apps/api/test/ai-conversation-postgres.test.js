import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPostgresAiRepository } from '../src/modules/ai/postgres-record-repository.js';
import { createPostgresAiConversationStore } from '../src/modules/ai/postgres-conversation-store.js';

export const aiConversationPostgresTests = process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? [{
  name: 'R03 PostgreSQL 会话并发幂等、owner 隔离与 epoch 失效',
  async run() {
    const db = new PrismaClient({ datasources: { db: { url: process.env.KNOWRA_SYNC_TEST_DATABASE_URL } }, log: [] });
    try {
      await db.$connect();
      const ownerId = `conversation-${randomUUID()}`;
      const repository = createPostgresAiRepository({ client: db, ownerId });
      const first = createPostgresAiConversationStore({ client: db, repository, ownerId });
      const second = createPostgresAiConversationStore({ client: db, repository, ownerId });
      const conversation = await first.createConversation({ ownerId, actorId: ownerId,
        spaceId: randomUUID(), conversationId: randomUUID() });
      const input = { ownerId, conversationId: conversation.conversationId,
        content: '并发问答', idempotencyKey: `request-${randomUUID()}` };
      const results = await Promise.all([first.submitTurn(input), second.submitTurn(input)]);
      assert.equal(results[0].turnId, results[1].turnId);
      assert.equal((await first.listMessages(conversation.conversationId)).length, 1);
      const otherOwner = `other-${randomUUID()}`;
      const otherRepo = createPostgresAiRepository({ client: db, ownerId: otherOwner });
      const isolated = createPostgresAiConversationStore({ client: db, repository: otherRepo, ownerId: otherOwner });
      assert.equal(await isolated.getConversation(conversation.conversationId), null);
      await assert.rejects(isolated.createConversation({ ownerId: otherOwner, actorId: otherOwner,
        spaceId: conversation.spaceId, conversationId: conversation.conversationId }),
      { code: 'AI_IDEMPOTENCY_CONFLICT' });
      await repository.rotateEpoch();
      await assert.rejects(first.submitTurn({ ...input, idempotencyKey: `request-${randomUUID()}` }),
      { code: 'AI_DATASET_STALE' });
      assert.equal((await first.getConversation(conversation.conversationId)).conversationId, conversation.conversationId);
    } finally { await db.$disconnect(); }
  }
}] : [];
