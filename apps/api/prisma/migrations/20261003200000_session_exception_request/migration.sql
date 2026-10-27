CREATE TYPE "SessionExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SessionExceptionRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SessionExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "SessionPayMethod" NOT NULL DEFAULT 'CASH',
    "vodafoneTxn" TEXT,
    "discountReason" TEXT,
    "centerKeepsAll" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "requestedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionExceptionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionExceptionRequest_sessionId_studentId_key" ON "SessionExceptionRequest"("sessionId", "studentId");
CREATE INDEX "SessionExceptionRequest_sessionId_status_idx" ON "SessionExceptionRequest"("sessionId", "status");

ALTER TABLE "SessionExceptionRequest" ADD CONSTRAINT "SessionExceptionRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionExceptionRequest" ADD CONSTRAINT "SessionExceptionRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
