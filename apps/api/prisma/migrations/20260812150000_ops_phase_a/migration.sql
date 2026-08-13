-- CreateEnum
CREATE TYPE "ClassSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "SessionPayMethod" AS ENUM ('CASH', 'VODAFONE_CASH');
CREATE TYPE "SessionPayStatus" AS ENUM ('PENDING_CONFIRM', 'CONFIRMED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "RefundReason" AS ENUM ('EXPULSION', 'LATE', 'CANCELLED', 'OTHER');
CREATE TYPE "BlockScope" AS ENUM ('CENTER', 'TEACHER');
CREATE TYPE "OpsCheckInSource" AS ENUM ('QR', 'NFC', 'PHONE', 'MANUAL');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "phoneCheckInUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT,
    "title" TEXT,
    "sessionDate" DATE NOT NULL,
    "status" "ClassSessionStatus" NOT NULL DEFAULT 'OPEN',
    "feeAmount" DECIMAL(12,2) NOT NULL,
    "teacherPercent" DECIMAL(5,2) NOT NULL,
    "settledTeacherAmount" DECIMAL(12,2),
    "settledCenterAmount" DECIMAL(12,2),
    "openedByUserId" TEXT,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "SessionPayMethod" NOT NULL,
    "payStatus" "SessionPayStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "vodafoneTxn" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkInSource" "OpsCheckInSource",
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionRefund" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "note" TEXT,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionRefund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentBlock" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "scope" "BlockScope" NOT NULL,
    "teacherId" TEXT,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionEntry_receiptNumber_key" ON "SessionEntry"("receiptNumber");
CREATE UNIQUE INDEX "SessionEntry_sessionId_studentId_key" ON "SessionEntry"("sessionId", "studentId");
CREATE INDEX "ClassSession_status_sessionDate_idx" ON "ClassSession"("status", "sessionDate");
CREATE INDEX "ClassSession_teacherId_sessionDate_idx" ON "ClassSession"("teacherId", "sessionDate");
CREATE INDEX "SessionEntry_studentId_payStatus_idx" ON "SessionEntry"("studentId", "payStatus");
CREATE INDEX "SessionRefund_sessionId_idx" ON "SessionRefund"("sessionId");
CREATE INDEX "StudentBlock_studentId_isActive_idx" ON "StudentBlock"("studentId", "isActive");

ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionEntry" ADD CONSTRAINT "SessionEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionEntry" ADD CONSTRAINT "SessionEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionRefund" ADD CONSTRAINT "SessionRefund_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionRefund" ADD CONSTRAINT "SessionRefund_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "SessionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentBlock" ADD CONSTRAINT "StudentBlock_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentBlock" ADD CONSTRAINT "StudentBlock_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
