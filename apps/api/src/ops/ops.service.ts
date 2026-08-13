import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BlockScope,
  ClassSessionStatus,
  OpsCheckInSource,
  RefundReason,
  RoleCode,
  SessionPayMethod,
  SessionPayStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';

const PHONE_CHECKIN_LIMIT = 2;

@Injectable()
export class OpsService {
  constructor(private readonly prisma: PrismaService) {}

  listOpenSessions() {
    return this.prisma.classSession.findMany({
      where: { status: ClassSessionStatus.OPEN },
      include: {
        teacher: true,
        subject: true,
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listSessions(status?: ClassSessionStatus) {
    return this.prisma.classSession.findMany({
      where: status ? { status } : undefined,
      include: {
        teacher: true,
        subject: true,
        _count: { select: { entries: true } },
      },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async getSession(id: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id },
      include: {
        teacher: true,
        subject: true,
        entries: {
          include: { student: true, refunds: true },
          orderBy: { createdAt: 'desc' },
        },
        refunds: true,
      },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');
    return session;
  }

  async openSession(
    data: {
      teacherId: string;
      subjectId?: string;
      title?: string;
      feeAmount: number;
      teacherPercent: number;
      notes?: string;
      sessionDate?: string;
    },
    userId?: string,
  ) {
    if (data.feeAmount < 0) throw new BadRequestException('السعر غير صالح');
    if (data.teacherPercent < 0 || data.teacherPercent > 100) {
      throw new BadRequestException('نسبة المدرس من 0 إلى 100');
    }
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: data.teacherId },
    });
    if (!teacher || !teacher.isActive) {
      throw new BadRequestException('المدرس غير متاح');
    }

    return this.prisma.classSession.create({
      data: {
        teacherId: data.teacherId,
        subjectId: data.subjectId || null,
        title: data.title?.trim() || null,
        feeAmount: data.feeAmount,
        teacherPercent: data.teacherPercent,
        notes: data.notes,
        sessionDate: data.sessionDate
          ? new Date(data.sessionDate)
          : new Date(),
        openedByUserId: userId,
        status: ClassSessionStatus.OPEN,
      },
      include: { teacher: true, subject: true },
    });
  }

  private async assertNotBlocked(studentId: string, teacherId: string) {
    const blocks = await this.prisma.studentBlock.findMany({
      where: { studentId, isActive: true },
    });
    const center = blocks.find((b) => b.scope === BlockScope.CENTER);
    if (center) {
      throw new ForbiddenException(`محظور من السنتر: ${center.reason}`);
    }
    const teacherBlock = blocks.find(
      (b) => b.scope === BlockScope.TEACHER && b.teacherId === teacherId,
    );
    if (teacherBlock) {
      throw new ForbiddenException(
        `محظور عند هذا المدرس: ${teacherBlock.reason}`,
      );
    }
  }

  async findStudent(query: { phone?: string; studentUid?: string; id?: string }) {
    if (query.id) {
      return this.prisma.student.findUnique({ where: { id: query.id } });
    }
    if (query.studentUid) {
      return this.prisma.student.findUnique({
        where: { studentUid: query.studentUid },
      });
    }
    if (query.phone) {
      const phone = normalizePhone(query.phone);
      return this.prisma.student.findFirst({
        where: {
          OR: [{ phone }, { phone: query.phone.trim() }],
        },
      });
    }
    return null;
  }

  async collectPayment(
    sessionId: string,
    data: {
      studentId?: string;
      phone?: string;
      studentUid?: string;
      method: SessionPayMethod;
      vodafoneTxn?: string;
      amount?: number;
      note?: string;
    },
    userId?: string,
  ) {
    const session = await this.getSession(sessionId);
    if (session.status !== ClassSessionStatus.OPEN) {
      throw new BadRequestException('الجلسة مقفولة — لا يمكن التحصيل');
    }

    const student =
      (await this.findStudent({
        id: data.studentId,
        phone: data.phone,
        studentUid: data.studentUid,
      })) || null;
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (!student.isActive) throw new BadRequestException('حساب الطالب غير نشط');

    await this.assertNotBlocked(student.id, session.teacherId);

    const existing = await this.prisma.sessionEntry.findUnique({
      where: {
        sessionId_studentId: { sessionId, studentId: student.id },
      },
    });
    if (existing && existing.payStatus !== SessionPayStatus.REFUNDED) {
      throw new BadRequestException('الطالب مسجّل بالفعل في هذه الجلسة');
    }

    if (data.method === SessionPayMethod.VODAFONE_CASH && !data.vodafoneTxn?.trim()) {
      throw new BadRequestException('رقم عملية فودافون كاش مطلوب');
    }

    const amount = data.amount ?? Number(session.feeAmount);
    const isCash = data.method === SessionPayMethod.CASH;
    const receiptNumber = `SP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    return this.prisma.sessionEntry.create({
      data: {
        sessionId,
        studentId: student.id,
        amount,
        method: data.method,
        vodafoneTxn: data.vodafoneTxn?.trim() || null,
        receiptNumber,
        note: data.note,
        payStatus: isCash
          ? SessionPayStatus.CONFIRMED
          : SessionPayStatus.PENDING_CONFIRM,
        confirmedAt: isCash ? new Date() : null,
        confirmedByUserId: isCash ? userId : null,
      },
      include: { student: true, session: true },
    });
  }

  async confirmPayment(entryId: string, userId?: string) {
    const entry = await this.prisma.sessionEntry.findUnique({
      where: { id: entryId },
      include: { session: true },
    });
    if (!entry) throw new NotFoundException('الدفعة غير موجودة');
    if (entry.session.status !== ClassSessionStatus.OPEN) {
      throw new BadRequestException('الجلسة مقفولة');
    }
    if (entry.payStatus === SessionPayStatus.CONFIRMED) return entry;
    if (entry.payStatus !== SessionPayStatus.PENDING_CONFIRM) {
      throw new BadRequestException('لا يمكن تأكيد هذه الدفعة');
    }

    return this.prisma.sessionEntry.update({
      where: { id: entryId },
      data: {
        payStatus: SessionPayStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedByUserId: userId,
      },
      include: { student: true, session: true },
    });
  }

  async checkIn(
    data: {
      sessionId?: string;
      studentId?: string;
      phone?: string;
      studentUid?: string;
      qrPayload?: string;
      source: OpsCheckInSource;
    },
    _userId?: string,
  ) {
    let studentUid = data.studentUid;
    if (data.qrPayload) {
      try {
        const parsed = JSON.parse(data.qrPayload);
        if (parsed?.uid) studentUid = parsed.uid;
        else if (parsed?.id) data.studentId = parsed.id;
      } catch {
        if (data.qrPayload.startsWith('SUCCESS:')) {
          studentUid = data.qrPayload.replace(/^SUCCESS:/, '');
        } else {
          studentUid = data.qrPayload;
        }
      }
    }

    const student = await this.findStudent({
      id: data.studentId,
      phone: data.phone,
      studentUid,
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    // If no session specified, list open sessions with confirmed unpaid check-in options
    if (!data.sessionId) {
      const open = await this.prisma.classSession.findMany({
        where: { status: ClassSessionStatus.OPEN },
        include: { teacher: true, subject: true },
        orderBy: { createdAt: 'desc' },
      });
      const entries = await this.prisma.sessionEntry.findMany({
        where: {
          studentId: student.id,
          sessionId: { in: open.map((s) => s.id) },
        },
      });
      return {
        needsSessionChoice: true,
        student,
        sessions: open.map((s) => {
          const entry = entries.find((e) => e.sessionId === s.id);
          return {
            ...s,
            entry,
            canCheckIn: entry?.payStatus === SessionPayStatus.CONFIRMED && !entry.checkedInAt,
            needsPayment: !entry || entry.payStatus === SessionPayStatus.PENDING_CONFIRM || entry.payStatus === SessionPayStatus.REFUNDED,
            needsConfirm: entry?.payStatus === SessionPayStatus.PENDING_CONFIRM,
          };
        }),
      };
    }

    const session = await this.getSession(data.sessionId);
    if (session.status !== ClassSessionStatus.OPEN) {
      throw new BadRequestException('الجلسة مقفولة');
    }
    await this.assertNotBlocked(student.id, session.teacherId);

    const entry = await this.prisma.sessionEntry.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: student.id,
        },
      },
    });
    if (!entry || entry.payStatus !== SessionPayStatus.CONFIRMED) {
      throw new BadRequestException(
        'الدفع غير مؤكد — حصّل أو أكّد فودافون كاش قبل الدخول',
      );
    }
    if (entry.checkedInAt) {
      return { alreadyCheckedIn: true, entry, student, session };
    }

    if (data.source === OpsCheckInSource.PHONE) {
      if (student.phoneCheckInUsed >= PHONE_CHECKIN_LIMIT) {
        throw new BadRequestException(
          `تم استهلاك استثناء الحضور بالموبايل (${PHONE_CHECKIN_LIMIT} مرات)`,
        );
      }
      await this.prisma.student.update({
        where: { id: student.id },
        data: { phoneCheckInUsed: { increment: 1 } },
      });
    }

    const updated = await this.prisma.sessionEntry.update({
      where: { id: entry.id },
      data: {
        checkedInAt: new Date(),
        checkInSource: data.source,
      },
      include: { student: true, session: { include: { teacher: true } } },
    });

    return {
      ok: true,
      entry: updated,
      student: updated.student,
      phoneCheckInRemaining:
        data.source === OpsCheckInSource.PHONE
          ? Math.max(0, PHONE_CHECKIN_LIMIT - (student.phoneCheckInUsed + 1))
          : undefined,
    };
  }

  async closeSession(sessionId: string, userId?: string) {
    const session = await this.getSession(sessionId);
    if (session.status === ClassSessionStatus.CLOSED) return session;

    const confirmed = session.entries.filter(
      (e) =>
        e.payStatus === SessionPayStatus.CONFIRMED ||
        e.payStatus === SessionPayStatus.PARTIALLY_REFUNDED,
    );
    let net = 0;
    for (const e of confirmed) {
      net += Number(e.amount) - Number(e.refundedAmount);
    }
    const teacherPct = Number(session.teacherPercent) / 100;
    const teacherShare = Math.round(net * teacherPct * 100) / 100;
    const centerShare = Math.round((net - teacherShare) * 100) / 100;

    return this.prisma.classSession.update({
      where: { id: sessionId },
      data: {
        status: ClassSessionStatus.CLOSED,
        closedAt: new Date(),
        closedByUserId: userId,
        settledTeacherAmount: teacherShare,
        settledCenterAmount: centerShare,
      },
      include: { teacher: true, subject: true, entries: true },
    });
  }

  async refund(
    entryId: string,
    data: { amount?: number; reason: RefundReason; note?: string },
    actor: { userId: string; role: string },
  ) {
    const entry = await this.prisma.sessionEntry.findUnique({
      where: { id: entryId },
      include: { session: true },
    });
    if (!entry) throw new NotFoundException('القيد غير موجود');

    const sessionClosed = entry.session.status === ClassSessionStatus.CLOSED;
    const isManager =
      actor.role === RoleCode.SUPER_ADMIN ||
      actor.role === RoleCode.CENTER_MANAGER;

    if (sessionClosed && !isManager) {
      throw new ForbiddenException(
        'بعد قفل الحصة الاسترجاع للمدير فقط',
      );
    }
    if (
      entry.payStatus !== SessionPayStatus.CONFIRMED &&
      entry.payStatus !== SessionPayStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException('لا يوجد مبلغ مؤكد للاسترجاع');
    }

    const remaining =
      Number(entry.amount) - Number(entry.refundedAmount);
    const refundAmount =
      data.amount !== undefined ? Number(data.amount) : remaining;
    if (refundAmount <= 0 || refundAmount > remaining + 0.001) {
      throw new BadRequestException('مبلغ الاسترجاع غير صالح');
    }

    const newRefunded = Number(entry.refundedAmount) + refundAmount;
    const fully = newRefunded >= Number(entry.amount) - 0.001;

    return this.prisma.$transaction(async (tx) => {
      await tx.sessionRefund.create({
        data: {
          sessionId: entry.sessionId,
          entryId: entry.id,
          amount: refundAmount,
          reason: data.reason,
          note: data.note,
          isException: sessionClosed,
          createdByUserId: actor.userId,
        },
      });
      return tx.sessionEntry.update({
        where: { id: entry.id },
        data: {
          refundedAmount: newRefunded,
          payStatus: fully
            ? SessionPayStatus.REFUNDED
            : SessionPayStatus.PARTIALLY_REFUNDED,
          checkedInAt: fully ? null : entry.checkedInAt,
        },
        include: { student: true, session: true, refunds: true },
      });
    });
  }

  listBlocks() {
    return this.prisma.studentBlock.findMany({
      where: { isActive: true },
      include: { student: true, teacher: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBlock(
    data: {
      studentId: string;
      scope: BlockScope;
      teacherId?: string;
      reason: string;
    },
    userId?: string,
  ) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('سبب الحظر مطلوب');
    }
    if (data.scope === BlockScope.TEACHER && !data.teacherId) {
      throw new BadRequestException('اختر المدرس للحظر الجزئي');
    }
    return this.prisma.studentBlock.create({
      data: {
        studentId: data.studentId,
        scope: data.scope,
        teacherId:
          data.scope === BlockScope.TEACHER ? data.teacherId : null,
        reason: data.reason.trim(),
        createdByUserId: userId,
      },
      include: { student: true, teacher: true },
    });
  }

  async deactivateBlock(id: string) {
    return this.prisma.studentBlock.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
