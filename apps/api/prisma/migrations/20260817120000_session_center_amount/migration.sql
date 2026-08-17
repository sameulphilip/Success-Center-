-- Center cut per student is stored as money (not a teacher %).
ALTER TABLE "ClassSession" ADD COLUMN "centerAmount" DECIMAL(12,2);
