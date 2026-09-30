import { createAppError } from '../errors/app-error.js';
import { createAsyncCoreOperationStore } from './core-operation-store.js';

export function createPostgresCoreOperationStore({ client, ownerId }) {
  const assertOwner = input => {
    if (input.ownerId !== ownerId) throw createAppError('CORE_OPERATION_FORBIDDEN', '操作不属于当前用户。', 403);
  };
  return createAsyncCoreOperationStore({
    transaction: operation => client.$transaction(async tx => {
      // 与核心笔记/同步事务共用锁；不存在回执行也必须串行，不能只锁已有行。
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(1266775634, 32)::text');
      return operation(tx);
    }, { maxWait: 10000, timeout: 60000 }),
    async get(input, tx = client) {
      assertOwner(input);
      const rows = await tx.$queryRawUnsafe(`SELECT receipt_json FROM core_operation_receipts
        WHERE owner_id = $1 AND dataset_id = $2 AND operation_id = $3`, input.ownerId, input.datasetId, input.operationId);
      return rows[0]?.receipt_json ?? null;
    },
    async insert(receipt, tx) {
      await tx.$executeRawUnsafe(`INSERT INTO core_operation_receipts
        (owner_id, dataset_id, operation_id, plan_hash, receipt_hash, receipt_json)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, receipt.ownerId, receipt.datasetId,
      receipt.operationId, receipt.planHash, receipt.receiptHash, JSON.stringify(receipt));
    }
  });
}
