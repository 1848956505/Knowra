import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { createRuntimeBackup, inspectRuntimeBackup } from '../src/backup.mjs';
import { temporaryDirectory } from './helpers.mjs';

test('SQLite v6→v7 会话表升级保留旧记录，消息不进入业务同步且备份可验证', async t => {
  const root = temporaryDirectory(t), file = path.join(root, 'local.sqlite');
  let data = createSqliteDataStore(file);
  const identity = data.aiRepository.identity();
  data.close();
  const raw = new DatabaseSync(file);
  raw.exec('DROP TABLE ai_conversation_records; PRAGMA user_version = 6');
  raw.close();
  data = createSqliteDataStore(file);
  assert(fs.readdirSync(root).some(name => name.startsWith('local.sqlite.before-v7-')));
  assert.deepEqual(data.aiRepository.identity(), identity);
  const outbox = data.readOutbox();
  const conversation = await data.aiConversationStore.createConversation({ ownerId: 'demo', actorId: 'demo', spaceId: 'space-1' });
  const turn = await data.aiConversationStore.submitTurn({ ownerId: 'demo', conversationId: conversation.conversationId,
    content: '保存私有会话', idempotencyKey: 'request-sqlite-1' });
  assert.deepEqual(data.readOutbox(), outbox);
  assert.equal(JSON.stringify(data.exportSnapshot()).includes('保存私有会话'), false);
  const backup = createRuntimeBackup(data, root);
  assert.equal(inspectRuntimeBackup(backup).valid, true);
  data.close();
  data = createSqliteDataStore(file);
  assert.equal((await data.aiConversationStore.getTurn(turn.turnId)).status, 'staged');
  assert.equal((await data.aiConversationStore.listMessages(conversation.conversationId))[0].content, '保存私有会话');
  data.close();
});

test('SQLite 会话正文损坏只关闭 AI，核心存储和备份保护继续有效', async t => {
  const root = temporaryDirectory(t), file = path.join(root, 'local.sqlite');
  let data = createSqliteDataStore(file);
  const conversation = await data.aiConversationStore.createConversation({ ownerId: 'demo', actorId: 'demo', spaceId: 'space-1' });
  data.close();
  const raw = new DatabaseSync(file);
  raw.prepare('UPDATE ai_conversation_records SET record_json = ? WHERE record_id = ?').run('{"broken":true}', conversation.conversationId);
  raw.close();
  data = createSqliteDataStore(file);
  assert(data.aiRuntimeError);
  assert.equal(data.aiConversationStore, null);
  const backup = createRuntimeBackup(data, root);
  assert.throws(() => inspectRuntimeBackup(backup), /会话记录无效|AI 私有/);
  data.close();
});

test('SQLite R04 模型逐次尝试与引用消息可重启回读并进入完整备份校验', async t => {
  const root = temporaryDirectory(t), file = path.join(root, 'local.sqlite');
  let data = createSqliteDataStore(file);
  const conversation = await data.aiConversationStore.createConversation({ ownerId: 'demo', actorId: 'demo', spaceId: 'space-1' });
  const turn = await data.aiConversationStore.submitTurn({ ownerId: 'demo', conversationId: conversation.conversationId,
    content: '合成提问', idempotencyKey: 'request-sqlite-r04' });
  const running = await data.aiConversationStore.claimTurn(turn.turnId);
  await data.aiConversationStore.createModelAttempt(turn.turnId, running.leaseGeneration, {
    attemptId: 'attempt-sqlite-r04', modelId: 'deepseek-flash', payloadHash: 'a'.repeat(64),
    reservedMicrounits: 1000 });
  await data.aiConversationStore.advanceModelAttempt('attempt-sqlite-r04', 'reserved', { generation: running.leaseGeneration });
  await data.aiConversationStore.advanceModelAttempt('attempt-sqlite-r04', 'sent', { generation: running.leaseGeneration });
  await data.aiConversationStore.advanceModelAttempt('attempt-sqlite-r04', 'settled', { actualMicrounits: 100 });
  await data.aiConversationStore.completeTurn(turn.turnId, running.leaseGeneration, {
    content: '合成回答', sourceFree: true });
  const backup = createRuntimeBackup(data, root);
  assert.equal(inspectRuntimeBackup(backup).valid, true);
  data.close();
  data = createSqliteDataStore(file);
  assert.equal((await data.aiConversationStore.getTurn(turn.turnId)).status, 'succeeded');
  assert.equal((await data.aiConversationStore.listModelAttempts(turn.turnId))[0].actualMicrounits, 100);
  data.close();
});
