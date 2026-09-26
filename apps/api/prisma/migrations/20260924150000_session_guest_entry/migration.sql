-- AlterTable
ALTER TABLE "SessionEntry" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "SessionEntry" ADD COLUMN "guestName" TEXT;
ALTER TABLE "SessionEntry" ADD COLUMN "guestPhone" TEXT;

-- CreateIndex
CREATE INDEX "SessionEntry_sessionId_guestPhone_idx" ON "SessionEntry"("sessionId", "guestPhone");
