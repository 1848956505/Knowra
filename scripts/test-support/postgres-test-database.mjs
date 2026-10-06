// 仅供真实 PostgreSQL 测试使用：每个测试拥有独立 schema，多个服务实例共享同一 fixture。
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function createPostgresTestDatabase({
  databaseUrl = process.env.KNOWRA_SYNC_TEST_DATABASE_URL,
  allowWrites = process.env.KNOWRA_SYNC_TEST_ALLOW_WRITES,
  createClient = async url => {
    const { PrismaClient } = await import('@prisma/client');
    return new PrismaClient({ datasources: { db: { url } }, log: [] });
  },
  migrate = async url => {
    await run(process.execPath, [fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url)),
      'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
      cwd: repositoryRoot, env: { ...process.env, DATABASE_URL: url }, timeout: 60000
    });
  }
} = {}) {
  const url = new URL(databaseUrl);
  // Prisma 的 host 查询参数会覆盖 URI hostname；拒绝全部覆盖（包括重复／编码参数）。
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.searchParams.has('host')
      || !/^\/knowra_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname)
      || allowWrites !== '1') {
    throw new Error('只能显式允许写入回环 Knowra 测试数据库（KNOWRA_SYNC_TEST_ALLOW_WRITES=1）。');
  }
  // 测试中始终校验：批量写入后像按 ID 重建的结果必须与全表读取一致。
  process.env.KNOWRA_SYNC_VERIFY_SCOPED_AFTER ??= '1';
  const schema = `knowra_test_${randomUUID().replaceAll('-', '')}`;
  const admin = await createClient(url.toString());
  let created = false;
  let closed = false;
  const close = async () => {
    if (closed) return;
    const failures = [];
    try {
      if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } catch (error) { failures.push(error); }
    try { await admin.$disconnect(); } catch (error) { failures.push(error); }
    closed = true;
    if (failures.length) throw new AggregateError(failures, `测试 schema ${schema} 清理失败`);
  };
  try {
    await admin.$connect();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    await migrate(url.toString());
    return { databaseUrl: url.toString(), schema, close };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], '测试数据库初始化和清理失败');
    }
    throw error;
  }
}
