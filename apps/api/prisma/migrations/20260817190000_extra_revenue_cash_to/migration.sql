-- CreateEnum
CREATE TYPE "ExtraRevenueCashTo" AS ENUM ('DRAWER', 'OWNER');

-- AlterTable
ALTER TABLE "OnlineCodeSale" ADD COLUMN "cashTo" "ExtraRevenueCashTo" NOT NULL DEFAULT 'DRAWER';

-- AlterTable
ALTER TABLE "HandoutSale" ADD COLUMN "cashTo" "ExtraRevenueCashTo" NOT NULL DEFAULT 'DRAWER';

-- AlterTable
ALTER TABLE "RoomRental" ADD COLUMN "cashTo" "ExtraRevenueCashTo" NOT NULL DEFAULT 'DRAWER';
