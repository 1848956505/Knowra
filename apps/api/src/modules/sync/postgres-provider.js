import { createBatchSyncService } from './batch-service.js';
import { applyPostgresState } from './postgres-batch.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as maps from '../knowledge/infrastructure/postgres/mappers.js';
import { appendChanges, createJournal, loadJournal, syncError } from './journal.js';
import { createSyncService } from './service.js';
import { applyNoteOperation } from './local-provider.js';

const collections = {
  spaces: ['knowledgeSpace', 'mapSpace'], folders: ['folder', 'mapFolder'],
  tags: ['tag', 'mapTag'], tagGroups: ['tagGroup', 'mapTagGroup'], notes: ['note', 'mapNote'],
  noteVersions: ['noteVersion', 'mapNoteVersion'], attachments: ['attachment', 'mapAttachment'],
  contentAnnotations: ['contentAnnotation', 'mapAnnotation'], knowledgeItems: ['knowledgeItem', 'mapKnowledgeItem'],
  knowledgeEvidence: ['knowledgeEvidence', 'mapKnowledgeEvidence'], learningObjectives: ['learningObjective', 'mapLearningObjective'],
  examProfiles: ['examProfile', 'mapExamProfile'], examFocuses: ['examFocus', 'mapExamFocus'],
  questions: ['question', 'mapQuestion'], questionObjectives: ['questionObjective', 'mapQuestionObjective'],
  questionSources: ['questionSource', 'mapQuestionSource'], annotationExclusions: ['annotationExclusion'],
  annotationRevisions: ['annotationRevision'], analysisScopeSnapshots: ['analysisScopeSnapshot']
};

async function snapshot(db) {
  const result = {};
  for (const [collection, [model, mapper]] of Object.entries(collections)) {
    const rows = await db[model].findMany({ orderBy: { id: 'asc' }, ...(model === 'note' ? { include: { noteTags: { orderBy: { tagId: 'asc' } } } } : {}) });
    result[collection] = rows.map(row => mapper ? maps[mapper](row) : JSON.parse(JSON.stringify(row)));
  }
  return result;
}

// 所有 repository 共用当前事务连接；业务、派生来源和同步日志一次提交。
export function createPostgresSyncRuntime(client, ownerId) {
  const scope = new AsyncLocalStorage();
  const modelNames = new Set([...Object.values(collections).map(([model]) => model), 'noteTag', 'user']);
  const mutations = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
  async function transaction(operation) {
    if (scope.getStore()) return operation(proxy);
    return client.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(1266775634, 32)::text');
      const before = await snapshot(tx);
      const row = await tx.syncJournal.findUnique({ where: { ownerId } });
      const context = { tx, before, journal: loadJournal(row?.payload, before) };
      return scope.run(context, async () => {
        const result = await operation(proxy);
        const after = await snapshot(tx);
        // 整库导入删除日志行；用新世代重新建立基线。
        const exists = row ? await tx.syncJournal.findUnique({ where: { ownerId } }) : null;
        const journal = row && !exists ? createJournal(after) : appendChanges(context.journal, before, after);
        await tx.syncJournal.upsert({ where: { ownerId }, create: { ownerId, payload: journal }, update: { payload: journal } });
        return result;
      });
    }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 60000 });
  }
  const delegates = new Map();
  const proxy = new Proxy(client, {
    get(_target, key) {
      if (key === '$transaction') return operation => {
        if (typeof operation !== 'function') throw new TypeError('同步持久化需要交互式事务。');
        return transaction(operation);
      };
      if (modelNames.has(key)) {
        if (!delegates.has(key)) delegates.set(key, new Proxy({}, { get: (_model, method) => (...args) => {
          const invoke = () => (scope.getStore()?.tx ?? client)[key][method](...args);
          return mutations.has(method) && !scope.getStore() ? transaction(invoke) : invoke();
        } }));
        return delegates.get(key);
      }
      const target = scope.getStore()?.tx ?? client;
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  return {
    client: proxy,
    service(noteService, transfer) {
      const access = callback => transaction(async () => callback(scope.getStore().before, scope.getStore().journal));
      const read = async callback => {
        const row = await client.syncJournal.findUnique({ where: { ownerId } });
        return row ? callback(null, loadJournal(row.payload, {})) : access(callback);
      };
      const provider = {
        read, mutate: access,
        snapshotPage: async ({ snapshotId, start, size }) => {
          const [row] = await client.$queryRawUnsafe(`SELECT
            payload ->> 'epoch' AS epoch,
            payload -> 'snapshots' -> $2 ->> 'cursor' AS cursor,
            payload -> 'snapshots' -> $2 ->> 'expiresAt' AS expires,
            jsonb_array_length(payload -> 'snapshots' -> $2 -> 'entries') AS count,
            jsonb_path_query_array(payload -> 'snapshots' -> $2, $3::jsonpath) AS entries
            FROM "SyncJournal" WHERE "ownerId" = $1`, ownerId, String(snapshotId), `$.entries[${start} to ${start + size - 1}]`);
          if (!row?.expires || Number(row.expires) < Date.now()) throw syncError('CURSOR_EXPIRED', '初始化快照已过期。');
          if (start > row.count) throw syncError('CURSOR_INVALID', '快照分页无效。', 422);
          return { entries: row.entries, nextOffset: start + size < row.count ? start + size : null, cursor: row.cursor, datasetEpoch: row.epoch };
        },
        preview: async () => {
          const context = scope.getStore();
          const state = await snapshot(context.tx);
          return { state, journal: appendChanges(structuredClone(context.journal), context.before, state) };
        },
        applyNote: (operation, current) => applyNoteOperation(noteService, operation, current),
        applyState: async next => applyPostgresState(scope.getStore().tx, await snapshot(scope.getStore().tx), next)
      };
      return { ...createSyncService(provider, ownerId), ...createBatchSyncService(provider, ownerId, transfer) };
    }
  };
}
