-- 核心回执无 AI 私有表外键；业务、版本、必要同步日志同一事务提交。
CREATE TABLE "core_operation_receipts" (
  "owner_id" TEXT NOT NULL,
  "dataset_id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "plan_hash" TEXT NOT NULL,
  "receipt_hash" TEXT NOT NULL,
  "receipt_json" JSONB NOT NULL,
  PRIMARY KEY ("owner_id", "dataset_id", "operation_id")
);
