-- CreateEnum
CREATE TYPE "RoomRentalBillingMode" AS ENUM ('FLAT', 'PER_STUDENT');

-- AlterTable
ALTER TABLE "RoomRental" ADD COLUMN "billingMode" "RoomRentalBillingMode" NOT NULL DEFAULT 'FLAT';
ALTER TABLE "RoomRental" ADD COLUMN "headcount" INTEGER;
ALTER TABLE "RoomRental" ADD COLUMN "centerPerStudent" DECIMAL(12,2);
