-- AlterTable
ALTER TABLE "BookingSubmission" ADD COLUMN "payChannel" TEXT NOT NULL DEFAULT 'center';

-- Pending electronic transfers (and any with a screenshot) came from the online form
UPDATE "BookingSubmission"
SET "payChannel" = 'online'
WHERE "paymentMethod" IN ('VODAFONE_CASH', 'INSTAPAY')
  AND "vodafoneTxn" IS NOT NULL
  AND (
    "status" = 'SUBMITTED'
    OR "transferProofPath" IS NOT NULL
  );
