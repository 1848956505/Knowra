import { randomUUID } from 'node:crypto';
import { createPostgresTestDatabase } from '../../../../scripts/test-support/postgres-test-database.mjs';

/** 性能验收独占 database：schema 无法隔离数据库级 advisory lock。 */
export async function createR07PostgresDatabase({
  isolated = false,
  databaseUrl = process.env.KNOWRA_SYNC_TEST_DATABASE_URL,
  allowWrites = process.env.KNOWRA_SYNC_TEST_ALLOW_WRITES
} = {}) {
  if (!isolated) return createPostgresTestDatabase({ databaseUrl, allowWrites });
  const url = new URL(databaseUrl);
  // 与共享 helper 使用相同的回环、合成库及显式写入边界；拒绝 host 参数覆盖。
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.searchParams.has('host')
      || !/^\/knowra_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname)
      || allowWrites !== '1') {
    throw new Error('只能显式允许写入回环 Knowra 测试数据库（KNOWRA_SYNC_TEST_ALLOW_WRITES=1）。');
  }
  const { PrismaClient } = await import('@prisma/client');
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  const name = `knowra_r07_${randomUUID().replaceAll('-', '')}_test`;
  let fixture, created = false, closed = false, closing;
  const close = () => {
    if (closed) return Promise.resolve();
    if (closing) return closing;
    // 并发关闭共用同一次清理；失败后允许释放占用连接再重试。
    closing = (async () => {
      const failures = [];
      try { await fixture?.close(); } catch (error) { failures.push(error); }
      // 名称只来自 UUID；只删除本次创建的库，不终止其他测试的连接。
      try {
        if (created) {
          await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
          created = false;
        }
      } catch (error) { failures.push(error); }
      try { await admin.$disconnect(); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, 'R07 独立测试数据库清理失败');
      closed = true;
    })().finally(() => { closing = undefined; });
    return closing;
  };
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    url.searchParams.delete('schema');
    fixture = await createPostgresTestDatabase({ databaseUrl: url.toString(), allowWrites });
    return { ...fixture, close };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'R07 独立测试数据库初始化和清理失败');
    }
    throw error;
  }
}
