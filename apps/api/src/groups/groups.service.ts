import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return as < be && bs < ae;
}

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.group.findMany({
      where: { isActive: true },
      include: {
        subject: true,
        gradeLevel: true,
        teacher: true,
        classroom: true,
        scheduleSlots: true,
        _count: { select: { enrollments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        subject: true,
        gradeLevel: true,
        teacher: true,
        classroom: true,
        scheduleSlots: true,
        enrollments: {
          where: { isActive: true },
          include: { student: true },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  private async assertNoConflicts(
    teacherId: string,
    classroomId: string | undefined,
    slots: { dayOfWeek: number; startTime: string; endTime: string }[],
    excludeGroupId?: string,
  ) {
    for (const slot of slots) {
      const existing = await this.prisma.scheduleSlot.findMany({
        where: {
          dayOfWeek: slot.dayOfWeek,
          ...(excludeGroupId ? { groupId: { not: excludeGroupId } } : {}),
          OR: [
            { group: { teacherId } },
            ...(classroomId ? [{ classroomId }] : []),
          ],
        },
        include: { group: true },
      });

      for (const ex of existing) {
        if (overlaps(slot.startTime, slot.endTime, ex.startTime, ex.endTime)) {
          const reason =
            ex.group.teacherId === teacherId
              ? 'Teacher is busy at this time'
              : 'Classroom is busy at this time';
          throw new BadRequestException(
            `${reason}: ${ex.group.name} (${ex.startTime}-${ex.endTime})`,
          );
        }
      }
    }
  }

  async create(data: {
    name: string;
    subjectId: string;
    gradeLevelId: string;
    teacherId: string;
    classroomId?: string;
    feeAmount: number;
    capacity?: number;
    scheduleSlots?: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }[];
  }) {
    if (data.scheduleSlots?.length) {
      await this.assertNoConflicts(
        data.teacherId,
        data.classroomId,
        data.scheduleSlots,
      );
    }

    return this.prisma.group.create({
      data: {
        name: data.name,
        subjectId: data.subjectId,
        gradeLevelId: data.gradeLevelId,
        teacherId: data.teacherId,
        classroomId: data.classroomId,
        feeAmount: data.feeAmount,
        capacity: data.capacity ?? 30,
        scheduleSlots: data.scheduleSlots?.length
          ? {
              create: data.scheduleSlots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                classroomId: data.classroomId,
              })),
            }
          : undefined,
      },
      include: {
        subject: true,
        gradeLevel: true,
        teacher: true,
        classroom: true,
        scheduleSlots: true,
      },
    });
  }

  async enroll(groupId: string, studentId: string) {
    const group = await this.get(groupId);
    const activeCount = group.enrollments.length;
    if (activeCount >= group.capacity) {
      throw new BadRequestException('Group is at full capacity');
    }

    const enrollment = await this.prisma.enrollment.upsert({
      where: { studentId_groupId: { studentId, groupId } },
      create: { studentId, groupId, isActive: true },
      update: { isActive: true, leftAt: null },
    });

    await this.prisma.invoice.create({
      data: {
        studentId,
        enrollmentId: enrollment.id,
        groupId,
        feeAmount: group.feeAmount,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return enrollment;
  }

  calendar(from?: string, to?: string) {
    return this.prisma.scheduleSlot.findMany({
      include: {
        group: {
          include: {
            teacher: true,
            subject: true,
            gradeLevel: true,
            classroom: true,
            _count: { select: { enrollments: true } },
          },
        },
        classroom: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }
}
