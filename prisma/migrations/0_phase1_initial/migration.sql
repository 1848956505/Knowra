-- Phase 1.0 initial PostgreSQL schema for the active knowledge module.
-- Keep this migration reviewed and immutable after it is applied anywhere.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "nickname" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeSpace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultFlag" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeSpace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pathCache" TEXT NOT NULL DEFAULT '/',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "groupId" TEXT,
    "code" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "rawMarkdown" TEXT NOT NULL,
    "plainText" TEXT NOT NULL,
    "internalLinks" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NoteTag" (
    "noteId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "NoteTag_pkey" PRIMARY KEY ("noteId", "tagId")
);

CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentAnnotation" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceMode" TEXT NOT NULL,
    "quoteText" TEXT NOT NULL,
    "headingPath" JSONB NOT NULL,
    "fromPosition" INTEGER NOT NULL,
    "toPosition" INTEGER NOT NULL,
    "prefixText" TEXT NOT NULL,
    "suffixText" TEXT NOT NULL,
    "anchorFingerprint" TEXT NOT NULL,
    "noteContentHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ContentAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "KnowledgeSpace_userId_updatedAt_idx" ON "KnowledgeSpace"("userId", "updatedAt");
CREATE INDEX "Folder_spaceId_parentId_sortOrder_idx" ON "Folder"("spaceId", "parentId", "sortOrder");
CREATE INDEX "Tag_spaceId_isSystem_sortOrder_idx" ON "Tag"("spaceId", "isSystem", "sortOrder");
CREATE UNIQUE INDEX "Tag_spaceId_name_key" ON "Tag"("spaceId", "name");
CREATE INDEX "Note_spaceId_deletedAt_updatedAt_idx" ON "Note"("spaceId", "deletedAt", "updatedAt");
CREATE INDEX "Note_spaceId_folderId_deletedAt_updatedAt_idx" ON "Note"("spaceId", "folderId", "deletedAt", "updatedAt");
CREATE INDEX "NoteTag_tagId_noteId_idx" ON "NoteTag"("tagId", "noteId");
CREATE INDEX "Attachment_noteId_createdAt_idx" ON "Attachment"("noteId", "createdAt");
CREATE INDEX "ContentAnnotation_noteId_status_updatedAt_idx" ON "ContentAnnotation"("noteId", "status", "updatedAt");
CREATE UNIQUE INDEX "ContentAnnotation_noteId_idempotencyKey_key" ON "ContentAnnotation"("noteId", "idempotencyKey");

-- Prisma's ordinary composite unique index treats NULL parent IDs as distinct.
-- These partial indexes preserve the current sibling-name invariant for both
-- root folders and nested folders.
CREATE UNIQUE INDEX "Folder_root_spaceId_name_key"
  ON "Folder"("spaceId", "name")
  WHERE "parentId" IS NULL;
CREATE UNIQUE INDEX "Folder_child_spaceId_parentId_name_key"
  ON "Folder"("spaceId", "parentId", "name")
  WHERE "parentId" IS NOT NULL;

ALTER TABLE "KnowledgeSpace"
  ADD CONSTRAINT "KnowledgeSpace_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Folder"
  ADD CONSTRAINT "Folder_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "KnowledgeSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder"
  ADD CONSTRAINT "Folder_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tag"
  ADD CONSTRAINT "Tag_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "KnowledgeSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note"
  ADD CONSTRAINT "Note_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "KnowledgeSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note"
  ADD CONSTRAINT "Note_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoteTag"
  ADD CONSTRAINT "NoteTag_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteTag"
  ADD CONSTRAINT "NoteTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentAnnotation"
  ADD CONSTRAINT "ContentAnnotation_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "KnowledgeSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentAnnotation"
  ADD CONSTRAINT "ContentAnnotation_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
