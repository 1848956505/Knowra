import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createR07Fixture } from './fixtures/ai-r07-runtime.mjs';
import { createR07PostgresDatabase } from './fixtures/ai-r07-postgres.mjs';
import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';

test('R07 独立测试库拒绝远端、非合成库、host 覆盖及未授权写入', async () => {
  for (const databaseUrl of [
    'postgresql://example.com/knowra_r07_test', 'postgresql://127.0.0.1/production',
    'postgresql://127.0.0.1/knowra_r07_test?host=example.com',
    'postgresql://127.0.0.1/knowra_r07_test?%68ost=example.com',
    'postgresql://127.0.0.1/knowra_r07_test?host=127.0.0.1&host=example.com'
  ]) await assert.rejects(createR07PostgresDatabase({ isolated: true, databaseUrl, allowWrites: '1' }), /回环 Knowra 测试数据库/);
  await assert.rejects(createR07PostgresDatabase({ isolated: true,
    databaseUrl: 'postgresql://127.0.0.1/knowra_r07_test', allowWrites: '0' }), /回环 Knowra 测试数据库/);
});

test('R07 性能 fixture 在其他 schema 持核心协调锁时仍能保存、回读与查询同步', {
  skip: !process.env.KNOWRA_SYNC_TEST_DATABASE_URL, timeout: 60000
}, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const peerDatabase = await createPostgresTestDatabase();
  const peer = new PrismaClient({ datasources: { db: { url: peerDatabase.databaseUrl } }, log: [] });
  let fixture, transaction, release;
  try {
    fixture = await createR07Fixture('postgres', { isolatePostgres: true });
    const call = (route, method = 'GET', body) => fetch(`${fixture.origin}${route}`, {
      method, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(1000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const space = (await (await call('/api/knowledge/spaces/default', 'POST', {})).json()).data;
    let acquired;
    const ready = new Promise(resolve => { acquired = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    transaction = peer.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(1266775634,32)::text');
      acquired();
      await held;
    }, { timeout: 10000 });
    // 失败立即转给 ready，避免等待未取得的锁和未处理的拒绝。
    const failed = transaction.then(() => { throw new Error('对照锁提前释放'); }, error => { throw error; });
    await Promise.race([ready, failed]);
    fixture.runtime.repository.identity = async () => { throw new Error('synthetic AI private storage fault'); };
    assert.equal((await (await call('/api/ai/assistant/status')).json()).data.generationAvailable, false);
    const id = randomUUID(), start = performance.now();
    assert.equal((await call('/api/knowledge/notes', 'POST', { id, spaceId: space.id,
      title: `独立库合成笔记 ${id}`, rawMarkdown: '合成隔离验证' })).status, 201);
    const read = await call(`/api/knowledge/notes/${id}`);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).data.rawMarkdown, '合成隔离验证');
    assert.equal((await call('/api/sync/status')).status, 200);
    assert(performance.now() - start < 1000);
  } finally {
    release?.();
    try { await transaction; } finally {
      try { await fixture?.close(); } finally {
        try { await peer.$disconnect(); } finally { await peerDatabase.close(); }
      }
    }
  }
});

test('R07 独立数据库清理可重复调用且不会留下合成库', {
  skip: !process.env.KNOWRA_SYNC_TEST_DATABASE_URL, timeout: 60000
}, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const fixture = await createR07PostgresDatabase({ isolated: true });
  const name = new URL(fixture.databaseUrl).pathname.slice(1);
  const admin = new PrismaClient({ datasources: { db: { url: process.env.KNOWRA_SYNC_TEST_DATABASE_URL } }, log: [] });
  try {
    await fixture.close();
    await fixture.close();
    assert.deepEqual(await admin.$queryRawUnsafe('SELECT datname FROM pg_database WHERE datname=$1', name), []);
  } finally { try { await fixture.close(); } finally { await admin.$disconnect(); } }
});
