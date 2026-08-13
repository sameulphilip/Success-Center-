import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceSource,
  AttendanceStatus,
  MessageChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
  ) {}

  async createSession(groupId: string, sessionDate: string, notes?: string) {
    return this.prisma.attendanceSession.upsert({
      where: {
        groupId_sessionDate: {
          groupId,
          sessionDate: new Date(sessionDate),
        },
      },
      create: {
        groupId,
        sessionDate: new Date(sessionDate),
        notes,
      },
      update: { notes },
      include: {
        group: { include: { subject: true, teacher: true } },
        records: true,
      },
    });
  }

  async getSession(id: string) {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id },
      include: {
        group: {
          include: {
            subject: true,
            teacher: true,
            enrollments: {
              where: { isActive: true },
              include: { student: true },
            },
          },
        },
        records: { include: { student: true, teacher: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private async notifyParents(opts: {
    studentId: string;
    sessionId: string;
    title: string;
    body: string;
    bodyAr: string;
  }) {
    const student = await this.prisma.student.findUnique({
      where: { id: opts.studentId },
      include: { parents: { include: { parent: true } } },
    });
    if (!student) return { notified: 0 };

    let notified = 0;
    for (const link of student.parents) {
      const parent = link.parent;
      if (parent.userId) {
        await this.notifications.create(
          parent.userId,
          opts.title,
          opts.bodyAr,
          {
            studentId: opts.studentId,
            sessionId: opts.sessionId,
            type: 'ATTENDANCE',
          },
        );
      }
      await this.messaging.enqueue({
        channel: MessageChannel.WHATSAPP,
        toPhone: parent.phone,
        title: opts.title,
        body: opts.bodyAr,
        meta: { studentId: opts.studentId, sessionId: opts.sessionId },
      });
      await this.messaging.enqueue({
        channel: MessageChannel.SMS,
        toPhone: parent.phone,
        body: opts.body,
        meta: { studentId: opts.studentId, sessionId: opts.sessionId },
      });
      notified += 1;
    }
    return { notified };
  }

  async mark(
    sessionId: string,
    records: {
      studentId?: string;
      teacherId?: string;
      status: AttendanceStatus;
      source?: AttendanceSource;
      note?: string;
    }[],
  ) {
    const session = await this.getSession(sessionId);
    const results = [];

    for (const record of records) {
      if (record.studentId) {
        const existing = await this.prisma.attendanceRecord.findFirst({
          where: { sessionId, studentId: record.studentId },
        });
        if (existing) {
          const updated = await this.prisma.attendanceRecord.update({
            where: { id: existing.id },
            data: {
              status: record.status,
              source: record.source ?? existing.source,
              note: record.note,
              markedAt: new Date(),
            },
            include: {
              student: { include: { parents: { include: { parent: true } } } },
            },
          });
          results.push(updated);
          if (record.status === AttendanceStatus.ABSENT && updated.student) {
            const studentName = `${updated.student.firstName} ${updated.student.lastName}`;
            const subjectName =
              session.group.subject.nameEn || session.group.subject.nameAr;
            await this.notifyParents({
              studentId: record.studentId,
              sessionId,
              title: 'إشعار غياب',
              body: `${studentName} was absent from ${subjectName} class today.`,
              bodyAr: `${studentName} تغيّب عن حصة ${subjectName} اليوم.`,
            });
          }
          continue;
        }
      }

      const created = await this.prisma.attendanceRecord.create({
        data: {
          sessionId,
          studentId: record.studentId,
          teacherId: record.teacherId,
          status: record.status,
          source: record.source ?? AttendanceSource.MANUAL,
          note: record.note,
        },
        include: {
          student: { include: { parents: { include: { parent: true } } } },
        },
      });
      results.push(created);

      if (
        record.studentId &&
        record.status === AttendanceStatus.ABSENT &&
        created.student
      ) {
        const studentName = `${created.student.firstName} ${created.student.lastName}`;
        const subjectName =
          session.group.subject.nameEn || session.group.subject.nameAr;
        await this.notifyParents({
          studentId: record.studentId,
          sessionId,
          title: 'إشعار غياب',
          body: `${studentName} was absent from ${subjectName} class today.`,
          bodyAr: `${studentName} تغيّب عن حصة ${subjectName} اليوم.`,
        });
      }
    }

    return results;
  }

  absenteesToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.attendanceRecord.findMany({
      where: {
        status: AttendanceStatus.ABSENT,
        studentId: { not: null },
        markedAt: { gte: start },
      },
      include: {
        student: {
          include: { parents: { include: { parent: true } } },
        },
        session: { include: { group: { include: { subject: true } } } },
      },
    });
  }

  listSessions(groupId?: string) {
    return this.prisma.attendanceSession.findMany({
      where: groupId ? { groupId } : undefined,
      include: {
        group: { include: { subject: true, teacher: true } },
        _count: { select: { records: true } },
      },
      orderBy: { sessionDate: 'desc' },
      take: 100,
    });
  }

  parseQrPayload(
    raw: string,
    preferredSource?: AttendanceSource,
  ): { studentUid: string; source: AttendanceSource } {
    const value = raw.trim();
    if (!value) throw new BadRequestException('Empty QR/NFC payload');

    // NFC compact format: SUCCESS:<studentUid>
    if (value.toUpperCase().startsWith('SUCCESS:')) {
      return {
        studentUid: value.slice('SUCCESS:'.length).trim(),
        source: preferredSource ?? AttendanceSource.NFC_CARD,
      };
    }

    try {
      const parsed = JSON.parse(value) as {
        type?: string;
        uid?: string;
        studentUid?: string;
      };
      if (parsed.type === 'gate') {
        throw new BadRequestException(
          'Gate QR detected. Use student card QR/NFC instead.',
        );
      }
      const uid = parsed.uid || parsed.studentUid;
      if (uid) {
        return {
          studentUid: uid,
          source: preferredSource ?? AttendanceSource.QR_STUDENT,
        };
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // not JSON — treat as raw uid
    }

    return {
      studentUid: value,
      source: preferredSource ?? AttendanceSource.QR_STUDENT,
    };
  }

  async markByQr(
    rawOrUid: string,
    groupId: string,
    source?: AttendanceSource,
  ) {
    const parsed = this.parseQrPayload(rawOrUid, source);
    const student = await this.prisma.student.findUnique({
      where: { studentUid: parsed.studentUid },
      include: { parents: { include: { parent: true } } },
    });
    if (!student) throw new NotFoundException('Student card not found');

    const enrolled = await this.prisma.enrollment.findFirst({
      where: { studentId: student.id, groupId, isActive: true },
    });
    if (!enrolled) {
      throw new BadRequestException('Student is not enrolled in this group');
    }

    const today = new Date();
    const session = await this.createSession(
      groupId,
      today.toISOString().slice(0, 10),
    );

    const records = await this.mark(session.id, [
      {
        studentId: student.id,
        status: AttendanceStatus.PRESENT,
        source: source ?? parsed.source,
      },
    ]);

    const subject = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { subject: true },
    });
    const studentName = `${student.firstName} ${student.lastName}`;
    const subjectName = subject?.subject.nameEn || subject?.subject.nameAr || '';

    // Notify parents that student arrived (QR check-in)
    await this.notifyParents({
      studentId: student.id,
      sessionId: session.id,
      title: 'تأكيد حضور',
      body: `${studentName} checked in to ${subjectName} class.`,
      bodyAr: `${studentName} سجّل حضوره في حصة ${subjectName}.`,
    });

    return {
      ok: true,
      student: {
        id: student.id,
        name: studentName,
        studentUid: student.studentUid,
      },
      sessionId: session.id,
      records,
      parentsNotified: student.parents.length,
    };
  }

  async resendAbsenceNotifications() {
    const absentees = await this.absenteesToday();
    let sent = 0;
    for (const a of absentees) {
      if (!a.studentId || !a.student) continue;
      const studentName = `${a.student.firstName} ${a.student.lastName}`;
      const subjectName =
        a.session.group.subject.nameEn || a.session.group.subject.nameAr;
      const result = await this.notifyParents({
        studentId: a.studentId,
        sessionId: a.sessionId,
        title: 'إشعار غياب',
        body: `${studentName} was absent from ${subjectName} class today.`,
        bodyAr: `${studentName} تغيّب عن حصة ${subjectName} اليوم.`,
      });
      sent += result.notified;
    }
    return { absentees: absentees.length, notificationsQueued: sent };
  }
}
