-- Phase 3.2 backend integrity and concurrency hardening.
-- These partial indexes preserve the active sibling-name invariant under
-- concurrent PostgreSQL requests, including root-level notes.

CREATE UNIQUE INDEX "Note_active_root_spaceId_title_key"
  ON "Note"("spaceId", "title")
  WHERE "folderId" IS NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Note_active_folder_spaceId_folderId_title_key"
  ON "Note"("spaceId", "folderId", "title")
  WHERE "folderId" IS NOT NULL AND "deletedAt" IS NULL;
