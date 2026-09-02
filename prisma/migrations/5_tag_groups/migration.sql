CREATE TABLE "TagGroup" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "selectionMode" TEXT NOT NULL DEFAULT 'multiple',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TagGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TagGroup_spaceId_name_key" ON "TagGroup"("spaceId", "name");
CREATE UNIQUE INDEX "TagGroup_spaceId_code_key" ON "TagGroup"("spaceId", "code");
CREATE INDEX "TagGroup_spaceId_sortOrder_idx" ON "TagGroup"("spaceId", "sortOrder");

ALTER TABLE "TagGroup" ADD CONSTRAINT "TagGroup_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "KnowledgeSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TagGroup" ("id", "spaceId", "code", "name", "selectionMode", "isSystem", "sortOrder", "updatedAt")
SELECT 'tag-group-' || "id" || '-ordinary', "id", 'ordinary', '普通标签', 'multiple', true, 1, CURRENT_TIMESTAMP FROM "KnowledgeSpace";
INSERT INTO "TagGroup" ("id", "spaceId", "code", "name", "selectionMode", "isSystem", "sortOrder", "updatedAt")
SELECT 'tag-group-' || "id" || '-mastery', "id", 'mastery', '掌握程度', 'single', true, 2, CURRENT_TIMESTAMP FROM "KnowledgeSpace";
INSERT INTO "TagGroup" ("id", "spaceId", "code", "name", "selectionMode", "isSystem", "sortOrder", "updatedAt")
SELECT 'tag-group-' || "id" || '-importance', "id", 'importance', '重要程度', 'single', true, 3, CURRENT_TIMESTAMP FROM "KnowledgeSpace";
INSERT INTO "TagGroup" ("id", "spaceId", "code", "name", "selectionMode", "isSystem", "sortOrder", "updatedAt")
SELECT 'tag-group-' || "id" || '-purpose', "id", 'purpose', '用途', 'multiple', true, 4, CURRENT_TIMESTAMP FROM "KnowledgeSpace";

UPDATE "Tag" SET "groupId" = 'tag-group-' || "spaceId" || '-ordinary' WHERE "groupId" IS NULL;
UPDATE "Tag" SET "color" = CASE
  WHEN lower("color") IN ('slate') THEN 'neutral'
  WHEN lower("color") IN ('cyan', 'purpose') THEN 'blue'
  WHEN lower("color") IN ('mastery') THEN 'green'
  WHEN lower("color") IN ('amber', 'importance') THEN 'orange'
  ELSE "color"
END;

ALTER TABLE "Tag" ALTER COLUMN "color" SET DEFAULT 'neutral';
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "TagGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
