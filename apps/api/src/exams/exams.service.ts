import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  list(groupId?: string) {
    return this.prisma.exam.findMany({
      where: groupId ? { groupId } : undefined,
      include: {
        group: true,
        subject: true,
        _count: { select: { grades: true } },
      },
      orderBy: { examDate: 'desc' },
    });
  }

  async get(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        group: {
          include: {
            enrollments: {
              where: { isActive: true },
              include: { student: true },
            },
          },
        },
        subject: true,
        grades: { include: { student: true }, orderBy: { score: 'desc' } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    const scores = exam.grades.map((g) => Number(g.score));
    const average =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

    const ranked = exam.grades.map((g, index) => ({
      rank: index + 1,
      studentId: g.studentId,
      student: g.student,
      score: g.score,
      note: g.note,
    }));

    return { ...exam, average, ranked };
  }

  create(data: {
    title: string;
    groupId: string;
    subjectId: string;
    maxScore: number;
    examDate: string;
  }) {
    return this.prisma.exam.create({
      data: {
        title: data.title,
        groupId: data.groupId,
        subjectId: data.subjectId,
        maxScore: data.maxScore,
        examDate: new Date(data.examDate),
      },
      include: { group: true, subject: true },
    });
  }

  async upsertGrades(
    examId: string,
    grades: { studentId: string; score: number; note?: string }[],
  ) {
    await this.get(examId);
    const ops = grades.map((g) =>
      this.prisma.grade.upsert({
        where: {
          examId_studentId: { examId, studentId: g.studentId },
        },
        create: {
          examId,
          studentId: g.studentId,
          score: g.score,
          note: g.note,
        },
        update: { score: g.score, note: g.note },
      }),
    );
    await this.prisma.$transaction(ops);
    return this.get(examId);
  }

  async studentReport(studentId: string) {
    const grades = await this.prisma.grade.findMany({
      where: { studentId },
      include: {
        exam: { include: { subject: true, group: true } },
      },
      orderBy: { exam: { examDate: 'desc' } },
    });
    return grades;
  }

  async compare(examIds: string[]) {
    const exams = await this.prisma.exam.findMany({
      where: { id: { in: examIds } },
      include: { grades: true, subject: true, group: true },
    });
    return exams.map((exam) => {
      const scores = exam.grades.map((g) => Number(g.score));
      const average =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
      return {
        examId: exam.id,
        title: exam.title,
        average,
        maxScore: exam.maxScore,
        count: scores.length,
        subject: exam.subject,
        group: exam.group,
      };
    });
  }
}
