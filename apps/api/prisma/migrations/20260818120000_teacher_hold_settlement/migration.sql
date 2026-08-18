ALTER TYPE "ExtraRevenueCashTo" ADD VALUE IF NOT EXISTS 'TEACHER_HOLD';
ALTER TYPE "ExtraRevenueCashTo" ADD VALUE IF NOT EXISTS 'SAFE';

CREATE TABLE IF NOT EXISTS "ExtraTeacherSettlement" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT,
  "teacherPaid" DECIMAL(12,2) NOT NULL,
  "centerToSafe" DECIMAL(12,2) NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "onlineCount" INTEGER NOT NULL DEFAULT 0,
  "handoutCount" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "settledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExtraTeacherSettlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExtraTeacherSettlement_teacherId_createdAt_idx"
  ON "ExtraTeacherSettlement"("teacherId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ExtraTeacherSettlement"
    ADD CONSTRAINT "ExtraTeacherSettlement_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OnlineCodeSale" ADD COLUMN IF NOT EXISTS "settlementId" TEXT;
ALTER TABLE "HandoutSale" ADD COLUMN IF NOT EXISTS "settlementId" TEXT;

CREATE INDEX IF NOT EXISTS "OnlineCodeSale_cashTo_settlementId_idx"
  ON "OnlineCodeSale"("cashTo", "settlementId");
CREATE INDEX IF NOT EXISTS "HandoutSale_cashTo_settlementId_idx"
  ON "HandoutSale"("cashTo", "settlementId");

DO $$ BEGIN
  ALTER TABLE "OnlineCodeSale"
    ADD CONSTRAINT "OnlineCodeSale_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "ExtraTeacherSettlement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "HandoutSale"
    ADD CONSTRAINT "HandoutSale_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "ExtraTeacherSettlement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
