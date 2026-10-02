#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { readTestDatabaseUrl } from '../deploy/isolated-test/connection.mjs';
import { validateInstance, verifyDatabaseForMigration, repositoryRoot } from '../deploy/isolated-test/config.mjs';
try {
  const databaseUrl = readTestDatabaseUrl();
  const config = validateInstance({ instanceId: process.env.KNOWRA_TEST_INSTANCE,
    dataRoot: process.env.KNOWRA_TEST_DATA_ROOT || '/var/lib/knowra-test', databaseUrl });
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try { await client.$connect(); await verifyDatabaseForMigration(client, config); }
  finally { await client.$disconnect(); }
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: repositoryRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe', timeout: 120000
  });
  if (result.status !== 0) throw new Error('测试数据库迁移失败。');
  console.log('专用测试数据库迁移完成。');
} catch {
  console.error('专用测试迁移失败：请检查实例ID、只读密码文件、独立数据库和镜像。未输出连接或凭据。');
  process.exitCode = 1;
}
