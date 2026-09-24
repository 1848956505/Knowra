ALTER TABLE "LearningObjective" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ExamProfile" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ExamFocus" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Question" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "LearningObjective_deletedAt_idx" ON "LearningObjective"("deletedAt");
CREATE INDEX "ExamProfile_deletedAt_idx" ON "ExamProfile"("deletedAt");
CREATE INDEX "ExamFocus_deletedAt_idx" ON "ExamFocus"("deletedAt");
CREATE INDEX "Question_deletedAt_idx" ON "Question"("deletedAt");
