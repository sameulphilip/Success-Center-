-- CreateEnum
CREATE TYPE "OwnerAdvanceKind" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "OwnerAdvance" (
    "id" TEXT NOT NULL,
    "kind" "OwnerAdvanceKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerAdvance_createdAt_idx" ON "OwnerAdvance"("createdAt");

-- CreateIndex
CREATE INDEX "OwnerAdvance_kind_createdAt_idx" ON "OwnerAdvance"("kind", "createdAt");
