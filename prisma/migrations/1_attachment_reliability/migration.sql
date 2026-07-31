-- Phase 1 attachment reliability metadata.
-- Existing rows remain readable and are initially treated as ready. The
-- attachment integrity check can then classify missing or corrupt files.

ALTER TABLE "Attachment"
  ADD COLUMN "sha256" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE INDEX "Attachment_status_verifiedAt_idx"
  ON "Attachment"("status", "verifiedAt");
