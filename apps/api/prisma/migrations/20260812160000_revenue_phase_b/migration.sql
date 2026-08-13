CREATE TYPE "OnlineCodeStatus" AS ENUM ('AVAILABLE', 'SOLD', 'REVOKED');
CREATE TYPE "RentalStatus" AS ENUM ('BOOKED', 'PAID', 'CANCELLED', 'COMPLETED');

CREATE TABLE "OnlineOffer" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "teacherPercent" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnlineOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnlineAccessCode" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "OnlineCodeStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnlineAccessCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnlineCodeSale" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "studentId" TEXT,
    "buyerPhone" TEXT,
    "buyerName" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "teacherShare" DECIMAL(12,2) NOT NULL,
    "centerShare" DECIMAL(12,2) NOT NULL,
    "method" "SessionPayMethod" NOT NULL,
    "vodafoneTxn" TEXT,
    "payStatus" "SessionPayStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "receiptNumber" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "soldByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnlineCodeSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HandoutProduct" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT,
    "title" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "teacherPercent" DECIMAL(5,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HandoutProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HandoutSale" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "studentId" TEXT,
    "sessionId" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "teacherShare" DECIMAL(12,2) NOT NULL,
    "centerShare" DECIMAL(12,2) NOT NULL,
    "method" "SessionPayMethod" NOT NULL,
    "vodafoneTxn" TEXT,
    "payStatus" "SessionPayStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "receiptNumber" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "soldByUserId" TEXT,
    "buyerPhone" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HandoutSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomRental" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "renterName" TEXT NOT NULL,
    "renterPhone" TEXT,
    "title" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "SessionPayMethod" NOT NULL DEFAULT 'CASH',
    "vodafoneTxn" TEXT,
    "payStatus" "SessionPayStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "status" "RentalStatus" NOT NULL DEFAULT 'BOOKED',
    "receiptNumber" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomRental_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnlineAccessCode_code_key" ON "OnlineAccessCode"("code");
CREATE UNIQUE INDEX "OnlineCodeSale_codeId_key" ON "OnlineCodeSale"("codeId");
CREATE UNIQUE INDEX "OnlineCodeSale_receiptNumber_key" ON "OnlineCodeSale"("receiptNumber");
CREATE UNIQUE INDEX "HandoutSale_receiptNumber_key" ON "HandoutSale"("receiptNumber");
CREATE UNIQUE INDEX "RoomRental_receiptNumber_key" ON "RoomRental"("receiptNumber");
CREATE INDEX "OnlineAccessCode_offerId_status_idx" ON "OnlineAccessCode"("offerId", "status");
CREATE INDEX "OnlineCodeSale_offerId_createdAt_idx" ON "OnlineCodeSale"("offerId", "createdAt");
CREATE INDEX "HandoutSale_productId_createdAt_idx" ON "HandoutSale"("productId", "createdAt");
CREATE INDEX "RoomRental_classroomId_startsAt_idx" ON "RoomRental"("classroomId", "startsAt");
CREATE INDEX "RoomRental_status_startsAt_idx" ON "RoomRental"("status", "startsAt");

ALTER TABLE "OnlineOffer" ADD CONSTRAINT "OnlineOffer_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnlineOffer" ADD CONSTRAINT "OnlineOffer_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnlineAccessCode" ADD CONSTRAINT "OnlineAccessCode_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "OnlineOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnlineCodeSale" ADD CONSTRAINT "OnlineCodeSale_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "OnlineOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnlineCodeSale" ADD CONSTRAINT "OnlineCodeSale_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "OnlineAccessCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnlineCodeSale" ADD CONSTRAINT "OnlineCodeSale_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HandoutProduct" ADD CONSTRAINT "HandoutProduct_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HandoutSale" ADD CONSTRAINT "HandoutSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "HandoutProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HandoutSale" ADD CONSTRAINT "HandoutSale_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HandoutSale" ADD CONSTRAINT "HandoutSale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomRental" ADD CONSTRAINT "RoomRental_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
