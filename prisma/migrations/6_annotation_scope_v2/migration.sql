ALTER TABLE "ContentAnnotation"
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "scopeType" TEXT NOT NULL DEFAULT 'selection',
  ADD COLUMN "importance" TEXT,
  ADD COLUMN "comment" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "anchorStatus" TEXT NOT NULL DEFAULT 'resolved',
  ADD COLUMN "anchorReason" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "anchor" JSONB,
  ADD COLUMN "originSnapshot" JSONB,
  ADD COLUMN "resolvedContentHash" TEXT,
  ADD COLUMN "boundaryFingerprint" TEXT,
  ADD COLUMN "requestHash" TEXT;

UPDATE "ContentAnnotation"
SET
  "lifecycleStatus" = CASE WHEN "status" = 'archived' THEN 'archived' ELSE 'active' END,
  "anchorStatus" = CASE WHEN "status" = 'stale' THEN 'needsReview' ELSE 'resolved' END;

DROP INDEX IF EXISTS "ContentAnnotation_noteId_status_updatedAt_idx";
CREATE INDEX "ContentAnnotation_noteId_lifecycleStatus_updatedAt_idx"
  ON "ContentAnnotation"("noteId", "lifecycleStatus", "updatedAt");

CREATE TABLE "AnnotationExclusion" (
  "id" TEXT NOT NULL,
  "parentAnnotationId" TEXT NOT NULL,
  "noteVersionId" TEXT,
  "anchor" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnnotationExclusion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnotationRevision" (
  "id" TEXT NOT NULL,
  "annotationId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "oldAnchor" JSONB,
  "newAnchor" JSONB,
  "rangeSummary" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnotationRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalysisScopeSnapshot" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "noteVersions" JSONB NOT NULL,
  "selections" JSONB NOT NULL,
  "segments" JSONB NOT NULL,
  "contextSegments" JSONB NOT NULL,
  "exclusions" JSONB NOT NULL,
  "omittedItems" JSONB NOT NULL,
  "annotationRevisions" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalysisScopeSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnnotationExclusion_parentAnnotationId_status_idx"
  ON "AnnotationExclusion"("parentAnnotationId", "status");
CREATE UNIQUE INDEX "AnnotationRevision_annotationId_revision_key"
  ON "AnnotationRevision"("annotationId", "revision");
CREATE INDEX "AnnotationRevision_annotationId_revision_idx"
  ON "AnnotationRevision"("annotationId", "revision");
CREATE UNIQUE INDEX "AnalysisScopeSnapshot_spaceId_idempotencyKey_key"
  ON "AnalysisScopeSnapshot"("spaceId", "idempotencyKey");
CREATE INDEX "AnalysisScopeSnapshot_spaceId_createdAt_idx"
  ON "AnalysisScopeSnapshot"("spaceId", "createdAt");

ALTER TABLE "AnnotationExclusion"
  ADD CONSTRAINT "AnnotationExclusion_parentAnnotationId_fkey"
  FOREIGN KEY ("parentAnnotationId") REFERENCES "ContentAnnotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnotationExclusion"
  ADD CONSTRAINT "AnnotationExclusion_noteVersionId_fkey"
  FOREIGN KEY ("noteVersionId") REFERENCES "NoteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnotationRevision"
  ADD CONSTRAINT "AnnotationRevision_annotationId_fkey"
  FOREIGN KEY ("annotationId") REFERENCES "ContentAnnotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisScopeSnapshot"
  ADD CONSTRAINT "AnalysisScopeSnapshot_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "KnowledgeSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
