CREATE TABLE "ai_conversation_records" (
  "kind" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "dataset_id" TEXT NOT NULL,
  "dataset_epoch" TEXT NOT NULL,
  "space_id" TEXT NOT NULL,
  "record_hash" TEXT NOT NULL,
  "record_json" TEXT NOT NULL,
  CONSTRAINT "ai_conversation_records_pkey" PRIMARY KEY ("kind", "record_id")
);
CREATE INDEX "ai_conversation_scope" ON "ai_conversation_records"("owner_id", "dataset_id", "dataset_epoch", "space_id", "kind");
