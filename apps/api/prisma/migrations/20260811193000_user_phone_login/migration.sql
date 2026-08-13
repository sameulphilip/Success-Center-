-- AlterTable
ALTER TABLE "User" ADD COLUMN "mustSetPassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
