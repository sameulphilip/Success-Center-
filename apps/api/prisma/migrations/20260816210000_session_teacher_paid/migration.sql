-- Track paying the teacher share after closing a walk-in session.
ALTER TABLE "ClassSession" ADD COLUMN "teacherPaidAt" TIMESTAMP(3);
ALTER TABLE "ClassSession" ADD COLUMN "teacherPaidByUserId" TEXT;
