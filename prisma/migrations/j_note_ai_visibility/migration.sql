ALTER TABLE "Note" ADD COLUMN "aiVisibility" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Note" ADD CONSTRAINT "Note_aiVisibility_check" CHECK ("aiVisibility" IN ('normal', 'private'));
