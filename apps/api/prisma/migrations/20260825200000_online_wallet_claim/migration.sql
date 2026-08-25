-- CreateTable
CREATE TABLE "OnlineWalletClaim" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlineWalletClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnlineWalletClaim_createdAt_idx" ON "OnlineWalletClaim"("createdAt");
