CREATE TABLE "KnowledgeArtifactProvenance" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "provenanceHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "KnowledgeArtifactProvenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeArtifactProvenance_version_check" CHECK ("schemaVersion" = 1),
  CONSTRAINT "KnowledgeArtifactProvenance_state_check" CHECK ("state" IN ('recorded', 'legacy-unavailable')),
  CONSTRAINT "KnowledgeArtifactProvenance_hash_check" CHECK ("provenanceHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "KnowledgeArtifactProvenance_artifactId_fkey" FOREIGN KEY ("artifactId")
    REFERENCES "KnowledgeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeArtifactProvenance_artifactId_key" ON "KnowledgeArtifactProvenance"("artifactId");

-- Backfill runs under the existing core advisory transaction and records completion atomically.
CREATE TABLE knowledge_artifact_provenance_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
