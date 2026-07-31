-- Phase 2.0 knowledge source and knowledge item foundation.
-- This migration is additive: existing notes, annotations and attachments remain
-- readable, while new formal knowledge evidence is kept independent from them.

ALTER TABLE "ContentAnnotation"
  ADD COLUMN "noteVersionId" TEXT;

CREATE TABLE "NoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "canonicalStatement" TEXT NOT NULL,
    "userExplanation" TEXT NOT NULL DEFAULT '',
    "knowledgeType" TEXT NOT NULL DEFAULT 'concept',
    "importance" INTEGER,
    "reviewStatus" TEXT NOT NULL DEFAULT 'candidate',
    "sourceMode" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeEvidence" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "noteId" TEXT,
    "noteVersionId" TEXT,
    "annotationId" TEXT,
    "quoteText" TEXT NOT NULL DEFAULT '',
    "headingPath" JSONB NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'supports',
    "status" TEXT NOT NULL DEFAULT 'valid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteVersion_noteId_contentHash_key"
  ON "NoteVersion"("noteId", "contentHash");
CREATE INDEX "NoteVersion_noteId_createdAt_idx"
  ON "NoteVersion"("noteId", "createdAt");
CREATE INDEX "KnowledgeItem_reviewStatus_updatedAt_idx"
  ON "KnowledgeItem"("reviewStatus", "updatedAt");
CREATE INDEX "KnowledgeEvidence_knowledgeItemId_status_createdAt_idx"
  ON "KnowledgeEvidence"("knowledgeItemId", "status", "createdAt");
CREATE INDEX "KnowledgeEvidence_noteId_status_idx"
  ON "KnowledgeEvidence"("noteId", "status");
CREATE INDEX "KnowledgeEvidence_noteVersionId_status_idx"
  ON "KnowledgeEvidence"("noteVersionId", "status");
CREATE INDEX "KnowledgeEvidence_annotationId_status_idx"
  ON "KnowledgeEvidence"("annotationId", "status");
CREATE INDEX "ContentAnnotation_noteVersionId_status_idx"
  ON "ContentAnnotation"("noteVersionId", "status");

ALTER TABLE "NoteVersion"
  ADD CONSTRAINT "NoteVersion_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentAnnotation"
  ADD CONSTRAINT "ContentAnnotation_noteVersionId_fkey"
  FOREIGN KEY ("noteVersionId") REFERENCES "NoteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEvidence"
  ADD CONSTRAINT "KnowledgeEvidence_knowledgeItemId_fkey"
  FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEvidence"
  ADD CONSTRAINT "KnowledgeEvidence_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEvidence"
  ADD CONSTRAINT "KnowledgeEvidence_noteVersionId_fkey"
  FOREIGN KEY ("noteVersionId") REFERENCES "NoteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEvidence"
  ADD CONSTRAINT "KnowledgeEvidence_annotationId_fkey"
  FOREIGN KEY ("annotationId") REFERENCES "ContentAnnotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
