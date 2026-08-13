-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('SUBMITTED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "BookingForm" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "academicYear" TEXT NOT NULL,
    "gradeLabel" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "defaultFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingOffering" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "feeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "teacherId" TEXT,
    "subjectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "parentPhone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'SUBMITTED',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receiptNumber" TEXT,
    "paidAt" TIMESTAMP(3),
    "studentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSelection" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "feeAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "BookingSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingForm_slug_key" ON "BookingForm"("slug");

-- CreateIndex
CREATE INDEX "BookingOffering_formId_subjectName_idx" ON "BookingOffering"("formId", "subjectName");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSubmission_receiptNumber_key" ON "BookingSubmission"("receiptNumber");

-- CreateIndex
CREATE INDEX "BookingSubmission_formId_status_idx" ON "BookingSubmission"("formId", "status");

-- CreateIndex
CREATE INDEX "BookingSubmission_studentPhone_idx" ON "BookingSubmission"("studentPhone");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSelection_submissionId_offeringId_key" ON "BookingSelection"("submissionId", "offeringId");

-- AddForeignKey
ALTER TABLE "BookingOffering" ADD CONSTRAINT "BookingOffering_formId_fkey" FOREIGN KEY ("formId") REFERENCES "BookingForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSubmission" ADD CONSTRAINT "BookingSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "BookingForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSelection" ADD CONSTRAINT "BookingSelection_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BookingSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSelection" ADD CONSTRAINT "BookingSelection_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "BookingOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
