import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  list(q?: string) {
    return this.prisma.teacher.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        subjects: { include: { subject: true } },
        gradeLevels: { include: { gradeLevel: true } },
        groups: {
          where: { isActive: true },
          include: { subject: true, gradeLevel: true },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async get(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: {
        subjects: { include: { subject: true } },
        gradeLevels: { include: { gradeLevel: true } },
        groups: {
          include: {
            subject: true,
            gradeLevel: true,
            classroom: true,
            scheduleSlots: true,
            _count: { select: { enrollments: true } },
          },
        },
        attendance: {
          take: 50,
          orderBy: { markedAt: 'desc' },
          include: { session: true },
        },
        payouts: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const sessionsCount = await this.prisma.attendanceRecord.count({
      where: { teacherId: id, status: 'PRESENT' },
    });

    return { ...teacher, sessionsTaught: sessionsCount };
  }

  async create(data: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    hourlyRate?: number;
    subjectIds?: string[];
    gradeLevelIds?: string[];
  }) {
    return this.prisma.teacher.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email || null,
        hourlyRate: data.hourlyRate ?? 0,
        subjects: data.subjectIds?.length
          ? {
              create: data.subjectIds.map((subjectId) => ({ subjectId })),
            }
          : undefined,
        gradeLevels: data.gradeLevelIds?.length
          ? {
              create: data.gradeLevelIds.map((gradeLevelId) => ({
                gradeLevelId,
              })),
            }
          : undefined,
      },
      include: {
        subjects: { include: { subject: true } },
        gradeLevels: { include: { gradeLevel: true } },
      },
    });
  }

  async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      hourlyRate?: number;
      isActive?: boolean;
      subjectIds?: string[];
      gradeLevelIds?: string[];
    },
  ) {
    await this.get(id);
    const { subjectIds, gradeLevelIds, ...rest } = data;
    if (subjectIds) {
      await this.prisma.teacherSubject.deleteMany({ where: { teacherId: id } });
      await this.prisma.teacherSubject.createMany({
        data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })),
      });
    }
    if (gradeLevelIds) {
      await this.prisma.teacherGradeLevel.deleteMany({
        where: { teacherId: id },
      });
      await this.prisma.teacherGradeLevel.createMany({
        data: gradeLevelIds.map((gradeLevelId) => ({
          teacherId: id,
          gradeLevelId,
        })),
      });
    }
    return this.prisma.teacher.update({
      where: { id },
      data: rest,
      include: {
        subjects: { include: { subject: true } },
        gradeLevels: { include: { gradeLevel: true } },
      },
    });
  }

  /** Soft-delete: hide from lists; keeps related sessions/payouts intact. */
  async remove(id: string) {
    await this.get(id);
    return this.prisma.teacher.update({
      where: { id },
      data: { isActive: false },
      include: {
        subjects: { include: { subject: true } },
        gradeLevels: { include: { gradeLevel: true } },
      },
    });
  }

  async performance(id: string) {
    const teacher = await this.get(id);
    const presentSessions = await this.prisma.attendanceRecord.count({
      where: { teacherId: id, status: 'PRESENT' },
    });
    const groupIds = teacher.groups.map((g) => g.id);
    const studentAttendance = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        studentId: { not: null },
        session: { groupId: { in: groupIds } },
      },
      _count: true,
    });
    return {
      teacherId: id,
      groupsCount: teacher.groups.length,
      sessionsTaught: presentSessions,
      studentAttendance,
      payouts: teacher.payouts,
    };
  }
}
