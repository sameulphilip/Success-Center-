-- Teacher ↔ GradeLevel (which grades a teacher teaches)
CREATE TABLE IF NOT EXISTS "TeacherGradeLevel" (
    "teacherId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    CONSTRAINT "TeacherGradeLevel_pkey" PRIMARY KEY ("teacherId", "gradeLevelId")
);

ALTER TABLE "TeacherGradeLevel"
  DROP CONSTRAINT IF EXISTS "TeacherGradeLevel_teacherId_fkey";
ALTER TABLE "TeacherGradeLevel"
  DROP CONSTRAINT IF EXISTS "TeacherGradeLevel_gradeLevelId_fkey";

ALTER TABLE "TeacherGradeLevel"
  ADD CONSTRAINT "TeacherGradeLevel_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherGradeLevel"
  ADD CONSTRAINT "TeacherGradeLevel_gradeLevelId_fkey"
  FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
