-- AlterTable
ALTER TABLE "BookingSubmission" ADD COLUMN "formSerial" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "BookingSubmission_formId_formSerial_key" ON "BookingSubmission"("formId", "formSerial");
