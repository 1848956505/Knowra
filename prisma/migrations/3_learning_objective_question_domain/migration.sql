-- Phase 3.0 learning objective and basic question foundation.
-- This migration is additive and intentionally excludes exams, attempts, grading
-- and mastery state. Existing Phase 0-2 entities remain independent.

CREATE TABLE "LearningObjective" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "actionVerb" TEXT NOT NULL,
    "cognitiveLevel" TEXT NOT NULL,
    "difficultyHint" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'candidate',
    "reviewNote" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scope" JSONB NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "commonQuestionTypes" JSONB NOT NULL,
    "difficultyProfile" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamFocus" (
    "id" TEXT NOT NULL,
    "examProfileId" TEXT NOT NULL,
    "learningObjectiveId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "difficultyHint" TEXT,
    "questionTypeSuggestions" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'candidate',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamFocus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "options" JSONB,
    "referenceAnswer" JSONB,
    "rubric" JSONB,
    "explanation" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "sourceMode" TEXT NOT NULL DEFAULT 'manual',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionObjective" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "learningObjectiveId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionObjective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionSource" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "quote" TEXT NOT NULL DEFAULT '',
    "locator" JSONB,
    "contentHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamFocus_examProfileId_learningObjectiveId_key"
  ON "ExamFocus"("examProfileId", "learningObjectiveId");
CREATE INDEX "LearningObjective_knowledgeItemId_reviewStatus_order_idx"
  ON "LearningObjective"("knowledgeItemId", "reviewStatus", "order");
CREATE INDEX "LearningObjective_reviewStatus_updatedAt_idx"
  ON "LearningObjective"("reviewStatus", "updatedAt");
CREATE INDEX "ExamProfile_archivedAt_updatedAt_idx"
  ON "ExamProfile"("archivedAt", "updatedAt");
CREATE INDEX "ExamFocus_examProfileId_reviewStatus_priority_idx"
  ON "ExamFocus"("examProfileId", "reviewStatus", "priority");
CREATE INDEX "ExamFocus_learningObjectiveId_reviewStatus_idx"
  ON "ExamFocus"("learningObjectiveId", "reviewStatus");
CREATE INDEX "Question_reviewStatus_updatedAt_idx"
  ON "Question"("reviewStatus", "updatedAt");
CREATE UNIQUE INDEX "QuestionObjective_questionId_learningObjectiveId_key"
  ON "QuestionObjective"("questionId", "learningObjectiveId");
CREATE INDEX "QuestionObjective_learningObjectiveId_questionId_idx"
  ON "QuestionObjective"("learningObjectiveId", "questionId");
CREATE INDEX "QuestionSource_questionId_createdAt_idx"
  ON "QuestionSource"("questionId", "createdAt");
CREATE INDEX "QuestionSource_sourceType_sourceId_status_idx"
  ON "QuestionSource"("sourceType", "sourceId", "status");

ALTER TABLE "LearningObjective"
  ADD CONSTRAINT "LearningObjective_knowledgeItemId_fkey"
  FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamFocus"
  ADD CONSTRAINT "ExamFocus_examProfileId_fkey"
  FOREIGN KEY ("examProfileId") REFERENCES "ExamProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamFocus"
  ADD CONSTRAINT "ExamFocus_learningObjectiveId_fkey"
  FOREIGN KEY ("learningObjectiveId") REFERENCES "LearningObjective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionObjective"
  ADD CONSTRAINT "QuestionObjective_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionObjective"
  ADD CONSTRAINT "QuestionObjective_learningObjectiveId_fkey"
  FOREIGN KEY ("learningObjectiveId") REFERENCES "LearningObjective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionSource"
  ADD CONSTRAINT "QuestionSource_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
