#!/usr/bin/env node
// 管理员恢复旧备份后，停写状态下显式重建同步世代。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createFileDataStore } from '../apps/api/src/infrastructure/file-data-store.js';
import { resetJournalKeepingTombstones } from '../apps/api/src/modules/sync/journal.js';
import { loadPostgresSyncIdentityState } from '../apps/api/src/modules/sync/postgres-provider.js';
import { createPrismaRuntime } from '../apps/api/src/infrastructure/prisma-client.js';

const { values } = parseArgs({ options: { driver: { type: 'string' }, 'data-file': { type: 'string' } } });
if (values.driver === 'local-json') {
  if (!values['data-file'] || !path.isAbsolute(values['data-file']) || !fs.existsSync(values['data-file'])) throw new Error('请提供已恢复的 JSON 文件绝对路径 --data-file。');
  const backup = `${values['data-file']}.before-sync-reset-${Date.now()}.bak`;
  fs.copyFileSync(values['data-file'], backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, 0o600);
  const store = createFileDataStore(values['data-file']);
  const persisted = JSON.parse(fs.readFileSync(values['data-file'], 'utf8'));
  const journal = resetJournalKeepingTombstones(persisted.sync, store.state);
  store.runSyncTransaction(() => Object.assign(store.getSyncJournal(), journal));
  console.log(JSON.stringify({ datasetEpoch: store.getSyncJournal().epoch, retainedTombstones: Object.keys(journal.tombstones).length, backup }));
} else if (values.driver === 'postgres') {
  const databaseUrl = process.env.KNOWRA_SYNC_RESET_DATABASE_URL;
  if (!databaseUrl) throw new Error('请显式设置 KNOWRA_SYNC_RESET_DATABASE_URL，避免误用其他数据库配置。');
  const runtime = await createPrismaRuntime({ databaseUrl });
  try {
    const client = await runtime.connect();
    const result = await client.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(1266775634, 32)::text');
      const state = await loadPostgresSyncIdentityState(tx);
      const rows = await tx.syncJournal.findMany();
      let retainedTombstones = 0;
      for (const row of rows) {
        const journal = resetJournalKeepingTombstones(row.payload, state);
        retainedTombstones += Object.keys(journal.tombstones).length;
        await tx.syncJournal.update({ where: { ownerId: row.ownerId }, data: { payload: journal } });
      }
      return { resetJournals: rows.length, retainedTombstones };
    });
    console.log(JSON.stringify({ ...result, message: '同步世代已重建，已知删除事实保留；无日志时服务下次访问创建新世代。' }));
  } finally { await runtime.disconnect(); }
} else throw new Error('必须指定 --driver local-json 或 --driver postgres；执行前停止业务写入并完成备份。');
