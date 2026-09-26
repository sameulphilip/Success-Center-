-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "SessionEntry_payStatus_confirmedAt_idx" ON "SessionEntry"("payStatus", "confirmedAt");
