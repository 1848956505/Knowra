ALTER TABLE "KnowledgeEvidence" ADD COLUMN "applicabilityStatus" TEXT NOT NULL DEFAULT 'active';

-- Legacy `invalid` conflated technical failure with a user withdrawal. Require review
-- before an old record can be used again; do not silently infer user intent.
UPDATE "KnowledgeEvidence"
SET "applicabilityStatus" = 'needsReview'
WHERE "status" = 'invalid';

ALTER TABLE "AnalysisScopeSnapshot" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AnalysisScopeSnapshot" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "AnalysisScopeSnapshot" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'marked';
UPDATE "AnalysisScopeSnapshot" SET "updatedAt" = "createdAt";

ALTER TABLE "Folder" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Folder" ADD COLUMN "deletionPackage" JSONB;
ALTER TABLE "Note" ADD COLUMN "folderDeletionPackageId" TEXT;
ALTER TABLE "Note" ADD COLUMN "deletionPackage" JSONB;
