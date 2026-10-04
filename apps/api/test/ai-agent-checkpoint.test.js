import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileDataStore } from '../src/infrastructure/file-data-store.js';
import { emptyAgentCheckpoint } from '../src/modules/ai/agent-checkpoint.js';
import { createJsonAiConversationStore } from '../src/modules/ai/conversation-store.js';
import { createEmptyAiState } from '../src/modules/ai/record-state.js';

const result = { content: '', json: null, toolCalls: [{ id: 'read-1', name: 'notes_read', arguments: { noteId: 'note-1' } }],
  finishReason: 'tool_calls', truncated: false, refused: false, usage: { unknown: true, inputTokens: null, outputTokens: null } };

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-checkpoint-'));
  const file = path.join(root, 'data.json');
  try {
    const data = createFileDataStore(file);
    await run({ root, file, data, store: data.aiConversationStore,
      async advance() { await new Promise(resolve => setTimeout(resolve, 1100)); } });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function start(store, suffix) {
  const conversation = await store.createConversation({ ownerId: 'demo', actorId: 'demo', spaceId: 'space-1' });
  const turn = await store.submitTurn({ ownerId: 'demo', conversationId: conversation.conversationId,
    content: '合成检查点提问', idempotencyKey: `checkpoint-${suffix}` });
  return store.claimTurn(turn.turnId, 1000);
}

async function attempt(store, turn, id = 'checkpoint-attempt-1') {
  await store.createModelAttempt(turn.turnId, turn.leaseGeneration, { attemptId: id,
    modelId: 'deepseek-flash', payloadHash: 'a'.repeat(64), reservedMicrounits: 1000 });
  await store.advanceModelAttempt(id, 'reserved', { generation: turn.leaseGeneration });
  await store.advanceModelAttempt(id, 'sent', { generation: turn.leaseGeneration });
  return id;
}

export const aiAgentCheckpointTests = [
  { name: 'Agent 模型响应落盘失败时费用状态和响应一并回滚，未确认请求仍不可自动重发', async run() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-checkpoint-failure-'));
    try {
      let failing = false;
      const data = createFileDataStore(path.join(root, 'data.json'), { writeJson(file, state) {
        if (failing) throw new Error('synthetic durable response write failure');
        fs.writeFileSync(file, JSON.stringify(state));
      } });
      const store = data.aiConversationStore, turn = await start(store, 'disk-failure-1');
      const id = await attempt(store, turn);
      failing = true;
      await assert.rejects(store.advanceModelAttempt(id, 'settled', { generation: turn.leaseGeneration,
        actualMicrounits: 100, modelResult: result }), { code: 'STORAGE_WRITE_FAILED' });
      const saved = (await store.listModelAttempts(turn.turnId))[0];
      assert.equal(saved.status, 'sent');
      assert.equal(saved.modelResult, undefined);
      failing = false;
      await store.failTurn(turn.turnId, turn.leaseGeneration, 'AI_TASK_INTERRUPTED');
      await assert.rejects(store.claimTurn(turn.turnId), { code: 'AI_DELIVERY_UNCERTAIN' });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  } },
  { name: 'Agent 续跑保留六工具上限和首次领取的十分钟截止时间', async run() {
    let clock = new Date('2026-10-04T00:00:00.000Z');
    const state = createEmptyAiState();
    const store = createJsonAiConversationStore({ getState: () => state, runTransaction: operation => operation(), onChange() {} }, { now: () => clock });
    const turn = await start(store, 'limits-1');
    for (let index = 0; index < 6; index++) {
      await store.appendToolCall(turn.turnId, turn.leaseGeneration, { callId: `limit-tool-${index}`, toolName: 'notes_search', argumentsJson: { query: '合成' } });
      await store.settleToolCall(turn.turnId, turn.leaseGeneration, `limit-tool-${index}`, { resultJson: { hits: [] } });
    }
    await store.saveCheckpoint(turn.turnId, turn.leaseGeneration, { ...emptyAgentCheckpoint(), totalTools: 6, initialSearchDone: true });
    clock = new Date('2026-10-04T00:09:59.000Z');
    await store.recoverInterrupted();
    const resumed = await store.claimTurn(turn.turnId, 300000);
    assert.equal(resumed.executionStartedAt, '2026-10-04T00:00:00.000Z');
    assert.equal(resumed.leaseExpiresAt, '2026-10-04T00:10:00.000Z');
    await assert.rejects(store.appendToolCall(turn.turnId, resumed.leaseGeneration, { callId: 'limit-tool-7', toolName: 'notes_search', argumentsJson: { query: '合成' } }), { code: 'AI_AGENT_LIMIT' });
    clock = new Date('2026-10-04T00:10:00.000Z');
    await store.recoverInterrupted();
    await assert.rejects(store.claimTurn(turn.turnId, 300000, { mode: 'retry' }), { code: 'AI_RUN_LIMIT' });
    assert.equal((await store.listToolCalls(turn.turnId)).length, 6);
  } },
  { name: 'Agent 检查点跨重启保留轮次和工具计数，恢复拒绝计数重置及迟到写入', run: () => fixture(async ({ store, file, advance }) => {
    const turn = await start(store, 'persist-1');
    await store.appendToolCall(turn.turnId, turn.leaseGeneration, { callId: 'checkpoint-tool-1', toolName: 'notes_search', argumentsJson: { query: '合成' } });
    await store.settleToolCall(turn.turnId, turn.leaseGeneration, 'checkpoint-tool-1', { resultJson: { hits: [] } });
    const id = await attempt(store, turn);
    await store.advanceModelAttempt(id, 'unknown', { generation: turn.leaseGeneration, modelResult: result });
    const checkpoint = { ...emptyAgentCheckpoint(), nextRound: 1, totalTools: 1,
      initialSearchDone: true, handledAttemptOrdinal: 1 };
    await store.saveCheckpoint(turn.turnId, turn.leaseGeneration, checkpoint);
    const reopened = createFileDataStore(file).aiConversationStore;
    assert.deepEqual((await reopened.getTurn(turn.turnId)).checkpoint, checkpoint);
    assert.deepEqual((await reopened.listModelAttempts(turn.turnId))[0].modelResult, result);
    await advance(); await store.recoverInterrupted();
    const resumed = await store.claimTurn(turn.turnId);
    assert.equal(resumed.leaseGeneration, 2);
    await assert.rejects(store.saveCheckpoint(turn.turnId, turn.leaseGeneration, checkpoint), { code: 'AI_LEASE_STALE' });
    await assert.rejects(store.saveCheckpoint(turn.turnId, resumed.leaseGeneration,
      { ...checkpoint, nextRound: 0 }), { code: 'AI_CHECKPOINT_INVALID' });
    await assert.rejects(store.saveCheckpoint(turn.turnId, resumed.leaseGeneration,
      { ...checkpoint, totalTools: 0 }), { code: 'AI_CHECKPOINT_INVALID' });
    assert.equal((await store.listModelAttempts(turn.turnId)).length, 1);
  }) },
  { name: 'Agent 不确定发送不得自动续跑；只有显式重试可领取且旧预算尝试保留', run: () => fixture(async ({ store, advance }) => {
    const turn = await start(store, 'unknown-1');
    const id = await attempt(store, turn);
    await advance(); await store.recoverInterrupted();
    await assert.rejects(store.claimTurn(turn.turnId), { code: 'AI_DELIVERY_UNCERTAIN' });
    await store.advanceModelAttempt(id, 'unknown', { errorCode: 'AI_DELIVERY_UNCERTAIN' });
    await assert.rejects(store.claimTurn(turn.turnId), { code: 'AI_DELIVERY_UNCERTAIN' });
    const retried = await store.claimTurn(turn.turnId, 1000, { mode: 'retry' });
    assert.equal(retried.leaseGeneration, 2);
    assert.equal((await store.listModelAttempts(turn.turnId))[0].status, 'unknown');
  }) },
  { name: 'Agent 模型响应与结算原子持久，同一回执拒绝改写，费用未知但有响应可续跑', run: () => fixture(async ({ store, advance }) => {
    const turn = await start(store, 'response-1');
    const id = await attempt(store, turn);
    await store.advanceModelAttempt(id, 'unknown', { generation: turn.leaseGeneration, modelResult: result });
    await store.advanceModelAttempt(id, 'unknown', { generation: turn.leaseGeneration, modelResult: result });
    await assert.rejects(store.advanceModelAttempt(id, 'unknown', { generation: turn.leaseGeneration,
      modelResult: { ...result, content: '改写回执' } }), { code: 'AI_IDEMPOTENCY_CONFLICT' });
    await advance(); await store.recoverInterrupted();
    const resumed = await store.claimTurn(turn.turnId);
    assert.equal(resumed.leaseGeneration, 2);
    assert.equal((await store.listModelAttempts(turn.turnId)).length, 1);
  }) }
];
