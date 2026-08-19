-- AlterTable
ALTER TABLE "BookingForm" ADD COLUMN "onlinePayEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BookingForm" ADD COLUMN "vodafoneWallet" TEXT;
ALTER TABLE "BookingForm" ADD COLUMN "instapayHandle" TEXT;
