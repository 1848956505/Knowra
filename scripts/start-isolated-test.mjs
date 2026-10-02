#!/usr/bin/env node
import fs from 'node:fs';
import { startIsolatedInstance } from '../deploy/isolated-test/runtime.mjs';
import { readTestDatabaseUrl } from '../deploy/isolated-test/connection.mjs';

// 不接受生产DATABASE_URL。连接仅来自明确测试参数，不能把秘密打印到日志。
const { KNOWRA_TEST_INSTANCE: instanceId, KNOWRA_TEST_DATA_ROOT: dataRoot } = process.env;
try {
  const databaseUrl = readTestDatabaseUrl();
  const container = process.env.KNOWRA_TEST_CONTAINER === '1';
  if (container && !fs.existsSync('/.dockerenv')) throw new Error('容器监听仅允许在Docker内使用。');
  const instance = await startIsolatedInstance({ instanceId, dataRoot, databaseUrl,
    port: Number(process.env.KNOWRA_TEST_PORT || 43100), host: container ? '0.0.0.0' : '127.0.0.1',
    publicOrigin: process.env.KNOWRA_TEST_PUBLIC_ORIGIN || '' });
  console.log(`Knowra合成测试实例 ${instanceId} 已启动；仅合成资料，AI外部调用关闭。`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await instance.close(); process.exit(0); });
} catch {
  console.error('独立测试实例启动失败：请检查测试ID、专用数据库/迁移、数据标识、只读密码文件及端口；未输出连接或凭据。');
  process.exitCode = 1;
}
