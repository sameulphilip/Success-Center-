-- CreateEnum
CREATE TYPE "CashExpenseFrom" AS ENUM ('DRAWER', 'SAFE', 'OWNER');

-- CreateTable
CREATE TABLE "CashDayClose" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "cashCollected" DECIMAL(12,2) NOT NULL,
    "vodafoneCollected" DECIMAL(12,2) NOT NULL,
    "drawerExpenses" DECIMAL(12,2) NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "countedAmount" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "transferredToSafe" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashExpense" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,
    "paidFrom" "CashExpenseFrom" NOT NULL,
    "note" TEXT,
    "businessDate" DATE NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashHandover" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashDayClose_businessDate_key" ON "CashDayClose"("businessDate");

-- CreateIndex
CREATE INDEX "CashDayClose_closedAt_idx" ON "CashDayClose"("closedAt");

-- CreateIndex
CREATE INDEX "CashExpense_businessDate_paidFrom_idx" ON "CashExpense"("businessDate", "paidFrom");

-- CreateIndex
CREATE INDEX "CashExpense_createdAt_idx" ON "CashExpense"("createdAt");

-- CreateIndex
CREATE INDEX "CashHandover_createdAt_idx" ON "CashHandover"("createdAt");
