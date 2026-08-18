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
import { normalizePhone, isValidMobile } from '../common/phone.util';
import { CashService } from '../finance/cash.service';
import {
  splitSessionNet,
  teacherPercentFromCenter,
} from './session-split';

const PHONE_CHECKIN_LIMIT = 2;

function isPaidStatus(status?: SessionPayStatus | null) {
  return (
    status === SessionPayStatus.CONFIRMED ||
    status === SessionPayStatus.PARTIALLY_REFUNDED
  );
}

export function parseStudentQr(raw?: string | null): {
  id?: string;
  studentUid?: string;
} {
  const value = String(raw || '').trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      const id = parsed.id || parsed.studentId;
      const studentUid = parsed.uid || parsed.studentUid;
      return {
        ...(id ? { id: String(id) } : {}),
        ...(studentUid ? { studentUid: String(studentUid) } : {}),
      };
    }
  } catch {
    /* not json */
  }
  if (value.toUpperCase().startsWith('SUCCESS:')) {
    return { studentUid: value.slice(value.indexOf(':') + 1).trim() };
  }
  if (/^https?:\/\//i.test(value)) return {};
  return { studentUid: value };
}

function teacherLabel(teacher?: {
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!teacher) return 'المدرس';
  return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'المدرس';
}

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashService,
  ) {}

  private async actorTeacherId(userId?: string, role?: string) {
    if (role !== RoleCode.TEACHER || !userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teacher: { select: { id: true } } },
    });
    if (!user?.teacher?.id) {
      throw new ForbiddenException('حساب المدرس غير مربوط بمدرس');
    }
    return user.teacher.id;
  }

  async resolveTeacherId(userId: string) {
    return this.actorTeacherId(userId, RoleCode.TEACHER);
  }

  listOpenSessions(teacherId?: string) {
    return this.prisma.classSession.findMany({
      where: {
        status: ClassSessionStatus.OPEN,
        ...(teacherId ? { teacherId } : {}),
      },
      include: {
        teacher: true,
        subject: true,
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listSessions(status?: ClassSessionStatus, date?: string) {
    const where: { status?: ClassSessionStatus; sessionDate?: Date } = {};
    if (status) where.status = status;
    const ymd = String(date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      where.sessionDate = new Date(`${ymd}T00:00:00.000Z`);
    }
    return this.prisma.classSession.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        teacher: true,
        subject: true,
        _count: { select: { entries: true } },
      },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
      take: ymd ? 200 : 100,
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

  private resolveShare(feeAmount: number, centerAmount?: number, teacherPercent?: number) {
    if (feeAmount < 0) throw new BadRequestException('السعر غير صالح');
    const center =
      centerAmount != null && !Number.isNaN(Number(centerAmount))
        ? Number(centerAmount)
        : teacherPercent != null
          ? Math.round(feeAmount * (1 - Number(teacherPercent) / 100) * 100) /
            100
          : 0;
    if (center < 0) {
      throw new BadRequestException('مبلغ السنتر غير صالح');
    }
    return {
      centerAmount: center,
      teacherPercent: teacherPercentFromCenter(feeAmount, center),
    };
  }

  private foldPersonName(name: string) {
    return (name || '')
      .replace(/\s+/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase();
  }

  private splitPersonName(full: string) {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || full.trim();
    const lastName = parts.slice(1).join(' ') || '-';
    return { firstName, lastName };
  }

  private async ensureTeacherByName(rawName: string) {
    const full = (rawName || '').trim();
    if (full.length < 2) {
      throw new BadRequestException('اكتب اسم المدرس');
    }
    const { firstName, lastName } = this.splitPersonName(full);
    const all = await this.prisma.teacher.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    const target = this.foldPersonName(full);
    const hit = all.find((t) => {
      const name = this.foldPersonName(
        `${t.firstName} ${t.lastName === '-' ? '' : t.lastName}`.trim(),
      );
      return name === target;
    });
    if (hit) return hit.id;
    const created = await this.prisma.teacher.create({
      data: { firstName, lastName, hourlyRate: 0 },
    });
    return created.id;
  }

  private async resolveTeacherIdInput(data: {
    teacherId?: string;
    teacherName?: string;
  }) {
    const name = (data.teacherName || '').trim();
    if (name) return this.ensureTeacherByName(name);
    if (data.teacherId && data.teacherId !== '__other__') return data.teacherId;
    throw new BadRequestException('اختَر مدرس أو اكتب اسم مدرس مش في القائمة');
  }

  private async ensureWalkInStudent(phoneRaw: string, nameRaw: string) {
    const phoneTrim = (phoneRaw || '').trim();
    const phone = phoneTrim ? normalizePhone(phoneTrim) : '';
    if (phoneTrim && !isValidMobile(phone)) {
      throw new BadRequestException('موبايل الطالب غير صالح');
    }
    if (phone) {
      const existing = await this.findStudent({ phone });
      if (existing) return existing;
    }
    const full = (nameRaw || '').trim();
    if (full.length < 2) {
      throw new BadRequestException(
        phone
          ? 'الطالب مش متسجل — اكتب الاسم'
          : 'اكتب اسم الطالب',
      );
    }
    const { firstName, lastName } = this.splitPersonName(full);
    return this.prisma.student.create({
      data: {
        firstName,
        lastName,
        phone: phone || null,
        notes: 'تسجيل من جلسة استقبال',
      },
    });
  }

  async openSession(
    data: {
      teacherId?: string;
      teacherName?: string;
      subjectId?: string;
      title?: string;
      feeAmount: number;
      centerAmount?: number;
      teacherPercent?: number;
      notes?: string;
      sessionDate?: string;
    },
    userId?: string,
  ) {
    const { centerAmount, teacherPercent } = this.resolveShare(
      data.feeAmount,
      data.centerAmount,
      data.teacherPercent,
    );
    const teacherId = await this.resolveTeacherIdInput(data);
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher || !teacher.isActive) {
      throw new BadRequestException('المدرس غير متاح');
    }

    return this.prisma.classSession.create({
      data: {
        teacherId: teacherId,
        subjectId: data.subjectId || null,
        title: data.title?.trim() || null,
        feeAmount: data.feeAmount,
        centerAmount,
        teacherPercent,
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

  async updateOpenSession(
    sessionId: string,
    data: {
      teacherId?: string;
      teacherName?: string;
      subjectId?: string | null;
      title?: string | null;
      feeAmount?: number;
      centerAmount?: number;
      notes?: string | null;
    },
    role?: string,
  ) {
    if (role !== RoleCode.SUPER_ADMIN && role !== RoleCode.CENTER_MANAGER) {
      throw new ForbiddenException('تعديل الجلسة للمدير فقط');
    }
    const session = await this.getSession(sessionId);
    if (session.status !== ClassSessionStatus.OPEN) {
      throw new BadRequestException('الجلسة اتقفلت — التعديل وهو مفتوحة فقط');
    }

    const teacherId = data.teacherName?.trim()
      ? await this.ensureTeacherByName(data.teacherName)
      : data.teacherId && data.teacherId !== '__other__'
        ? data.teacherId
        : session.teacherId;
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher || !teacher.isActive) {
      throw new BadRequestException('المدرس غير متاح');
    }

    const feeAmount =
      data.feeAmount != null && !Number.isNaN(Number(data.feeAmount))
        ? Number(data.feeAmount)
        : Number(session.feeAmount);
    const centerInput =
      data.centerAmount != null && !Number.isNaN(Number(data.centerAmount))
        ? Number(data.centerAmount)
        : session.centerAmount != null
          ? Number(session.centerAmount)
          : undefined;
    const { centerAmount, teacherPercent } = this.resolveShare(
      feeAmount,
      centerInput,
      centerInput == null ? Number(session.teacherPercent) : undefined,
    );

    const subjectId =
      data.subjectId === undefined
        ? session.subjectId
        : data.subjectId || null;

    return this.prisma.classSession.update({
      where: { id: sessionId },
      data: {
        teacherId,
        subjectId,
        title:
          data.title === undefined
            ? session.title
            : data.title?.trim() || null,
        feeAmount,
        centerAmount,
        teacherPercent,
        notes: data.notes === undefined ? session.notes : data.notes,
      },
      include: {
        teacher: true,
        subject: true,
        entries: { include: { student: true, refunds: true } },
      },
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

  async findStudent(query: {
    phone?: string;
    studentUid?: string;
    id?: string;
  }) {
    if (query.id) {
      const byId = await this.prisma.student.findUnique({
        where: { id: query.id },
      });
      if (byId) return byId;
    }
    if (query.studentUid) {
      const uid = query.studentUid.trim();
      const byUid = await this.prisma.student.findFirst({
        where: {
          OR: [
            { studentUid: uid },
            { studentUid: { equals: uid, mode: 'insensitive' } },
          ],
        },
      });
      if (byUid) return byUid;
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
      studentName?: string;
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

    let student =
      (await this.findStudent({
        id: data.studentId,
        phone: data.phone,
        studentUid: data.studentUid,
      })) || null;
    if (!student) {
      student = await this.ensureWalkInStudent(
        data.phone || '',
        data.studentName || '',
      );
    }
    if (!student) throw new NotFoundException('اكتب اسم الطالب');
    if (!student.isActive) throw new BadRequestException('حساب الطالب غير نشط');

    await this.assertNotBlocked(student.id, session.teacherId);

    const existing = await this.prisma.sessionEntry.findUnique({
      where: {
        sessionId_studentId: { sessionId, studentId: student.id },
      },
    });
    if (existing && existing.payStatus !== SessionPayStatus.REFUNDED) {
      const name = `${student.firstName} ${student.lastName === '-' ? '' : student.lastName}`.trim();
      throw new BadRequestException(
        existing.checkedInAt
          ? `${name} داخل الجلسة بالفعل — مش هيتسجل تاني`
          : `${name} مسجّل في الجلسة بالفعل — مش هيتسجل تاني`,
      );
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
        checkedInAt: isCash ? new Date() : null,
        checkInSource: isCash ? OpsCheckInSource.MANUAL : null,
      },
      include: {
        student: true,
        session: { include: { teacher: true, subject: true } },
      },
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
        checkedInAt: entry.checkedInAt || new Date(),
        checkInSource: entry.checkInSource || OpsCheckInSource.MANUAL,
      },
      include: { student: true, session: { include: { teacher: true, subject: true } } },
    });
  }

  async checkIn(
    data: {
      sessionId?: string;
      studentId?: string;
      phone?: string;
      studentUid?: string;
      qrPayload?: string;
      teacherId?: string;
      source: OpsCheckInSource;
    },
    actor?: { userId?: string; role?: string },
  ) {
    let studentUid = data.studentUid;
    if (data.qrPayload) {
      const parsed = parseStudentQr(data.qrPayload);
      if (parsed.id) data.studentId = parsed.id;
      if (parsed.studentUid) studentUid = parsed.studentUid;
    }

    const student = await this.findStudent({
      id: data.studentId,
      phone: data.phone,
      studentUid,
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const actorTeacherId = await this.actorTeacherId(
      actor?.userId,
      actor?.role,
    );
    const teacherId = actorTeacherId || data.teacherId || undefined;

    const decorate = (
      s: {
        id: string;
        title: string | null;
        feeAmount: unknown;
        teacher: { firstName: string; lastName: string };
        subject: { nameAr?: string | null; nameEn?: string | null } | null;
      },
      entry?: {
        payStatus: SessionPayStatus;
        checkedInAt: Date | null;
        amount: unknown;
      } | null,
    ) => {
      const name = teacherLabel(s.teacher);
      const subjectName =
        s.subject?.nameAr || s.subject?.nameEn || s.title || 'حصة';
      const paid = isPaidStatus(entry?.payStatus);
      return {
        ...s,
        entry,
        teacherName: name,
        subjectName,
        paidLabel: paid ? `دفع حصة ${name}` : null,
        canCheckIn: paid,
        alreadyIn: Boolean(entry?.checkedInAt),
        needsPayment:
          !entry ||
          entry.payStatus === SessionPayStatus.PENDING_CONFIRM ||
          entry.payStatus === SessionPayStatus.REFUNDED,
        needsConfirm: entry?.payStatus === SessionPayStatus.PENDING_CONFIRM,
        paidAmount: paid ? Number(entry?.amount || 0) : 0,
      };
    };

    // If no session specified, list open sessions with paid check-in options
    if (!data.sessionId) {
      const open = await this.prisma.classSession.findMany({
        where: {
          status: ClassSessionStatus.OPEN,
          ...(teacherId ? { teacherId } : {}),
        },
        include: { teacher: true, subject: true },
        orderBy: { createdAt: 'desc' },
      });
      const entries = open.length
        ? await this.prisma.sessionEntry.findMany({
            where: {
              studentId: student.id,
              sessionId: { in: open.map((s) => s.id) },
            },
          })
        : [];
      const sessions = open.map((s) =>
        decorate(
          s,
          entries.find((e) => e.sessionId === s.id),
        ),
      );

      let otherPaid: ReturnType<typeof decorate>[] = [];
      if (teacherId) {
        const others = await this.prisma.sessionEntry.findMany({
          where: {
            studentId: student.id,
            payStatus: {
              in: [
                SessionPayStatus.CONFIRMED,
                SessionPayStatus.PARTIALLY_REFUNDED,
              ],
            },
            session: {
              status: ClassSessionStatus.OPEN,
              teacherId: { not: teacherId },
            },
          },
          include: {
            session: { include: { teacher: true, subject: true } },
          },
        });
        otherPaid = others.map((e) => decorate(e.session, e));
      }

      return {
        needsSessionChoice: true,
        student,
        sessions,
        otherPaidSessions: otherPaid,
      };
    }

    const session = await this.getSession(data.sessionId);
    if (session.status !== ClassSessionStatus.OPEN) {
      throw new BadRequestException('الجلسة مقفولة');
    }
    if (teacherId && session.teacherId !== teacherId) {
      throw new ForbiddenException('الحصة دي مش بتاعة المدرس الحالي');
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
    if (!entry || !isPaidStatus(entry.payStatus)) {
      throw new BadRequestException(
        'مفيش دفع مؤكد للحصة دي — حصّل من الاستقبال أولاً',
      );
    }
    if (entry.checkedInAt) {
      return {
        alreadyCheckedIn: true,
        entry,
        student,
        session,
        paidLabel: `دفع حصة ${teacherLabel(session.teacher)}`,
      };
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
      include: {
        student: true,
        session: { include: { teacher: true, subject: true } },
      },
    });

    return {
      ok: true,
      entry: updated,
      student: updated.student,
      session: updated.session,
      paidLabel: `دفع حصة ${teacherLabel(updated.session?.teacher)}`,
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
    const { teacherShare, centerShare } = splitSessionNet({
      net,
      feeAmount: Number(session.feeAmount),
      teacherPercent: session.teacherPercent,
      centerAmount: session.centerAmount,
    });

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

  async payTeacherShare(sessionId: string, userId?: string) {
    const session = await this.getSession(sessionId);
    if (session.status !== ClassSessionStatus.CLOSED) {
      throw new BadRequestException('اقفل الجلسة وسعّي الأول');
    }
    if (session.teacherPaidAt) {
      throw new BadRequestException('اتدفع للمدرس بالفعل على الجلسة دي');
    }
    const teacherShare = Number(session.settledTeacherAmount || 0);
    const teacherName = teacherLabel(session.teacher);
    if (teacherShare > 0.009) {
      await this.cash.payFromDrawer(userId || 'system', {
        amount: teacherShare,
        category: 'حصة مدرس',
        note: `تسوية ${teacherName}${session.subject?.nameAr ? ` · ${session.subject.nameAr}` : ''} · حصة ${String(session.sessionDate).slice(0, 10)}`,
      });
    }
    return this.prisma.classSession.update({
      where: { id: sessionId },
      data: {
        teacherPaidAt: new Date(),
        teacherPaidByUserId: userId || null,
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

    if (entry.session.status === ClassSessionStatus.CLOSED) {
      throw new BadRequestException(
        'الجلسة اتقفلت — مفيش استرجاع لأي طالب',
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
          isException: false,
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

  async deleteSession(sessionId: string, role?: string) {
    if (role !== RoleCode.SUPER_ADMIN && role !== RoleCode.CENTER_MANAGER) {
      throw new ForbiddenException('مسح الجلسة للمدير فقط');
    }
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');

    await this.prisma.$transaction([
      this.prisma.handoutSale.updateMany({
        where: { sessionId },
        data: { sessionId: null },
      }),
      this.prisma.classSession.delete({ where: { id: sessionId } }),
    ]);
    return { ok: true, deletedId: sessionId };
  }
}
