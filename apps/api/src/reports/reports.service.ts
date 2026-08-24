import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { splitSessionNet } from '../ops/session-split';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async finance(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const [payments, invoices, payouts] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paidAt: { gte: fromDate, lte: toDate } },
        include: { student: true, invoice: { include: { group: true } } },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        include: { student: true, group: true },
      }),
      this.prisma.teacherPayout.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        include: { teacher: true },
      }),
    ]);

    const collected = payments.reduce((s, p) => s + Number(p.amount), 0);
    const invoiced = invoices.reduce(
      (s, i) => s + Number(i.feeAmount) - Number(i.discount) + Number(i.extras),
      0,
    );
    const teacherPay = payouts.reduce(
      (s, p) => s + Number(p.grossAmount) - Number(p.deductions),
      0,
    );

    return {
      from: fromDate,
      to: toDate,
      summary: {
        collected,
        invoiced,
        paymentsCount: payments.length,
        teacherPayables: teacherPay,
        netEstimate: collected - teacherPay,
      },
      payments,
      payouts,
    };
  }

  async bookings(from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const [created, paid] = await Promise.all([
      this.prisma.bookingSubmission.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        include: {
          form: { select: { id: true, title: true, gradeLabel: true, slug: true } },
          selections: {
            include: {
              offering: {
                select: { teacherName: true, subjectName: true, isOnline: true },
              },
            },
          },
        },
        orderBy: [{ formSerial: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.bookingSubmission.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: fromDate, lte: toDate },
        },
        include: {
          form: { select: { id: true, title: true, gradeLabel: true, slug: true } },
          selections: {
            include: {
              offering: {
                select: { teacherName: true, subjectName: true, isOnline: true },
              },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
      }),
    ]);

    const submitted = created.filter((s) => s.status !== 'CANCELLED');
    const pending = created.filter((s) => s.status === 'SUBMITTED').length;
    const cancelled = created.filter((s) => s.status === 'CANCELLED').length;
    const paidAmount = paid.reduce((s, r) => s + Number(r.totalAmount), 0);

    type FormAgg = {
      formId: string;
      label: string;
      gradeLabel: string;
      submitted: number;
      paid: number;
      amount: number;
      pending: number;
    };
    const byFormMap = new Map<string, FormAgg>();
    for (const s of created) {
      const formId = s.formId;
      const row = byFormMap.get(formId) || {
        formId,
        label: s.form?.title || s.formId,
        gradeLabel: s.form?.gradeLabel || '',
        submitted: 0,
        paid: 0,
        amount: 0,
        pending: 0,
      };
      if (s.status !== 'CANCELLED') row.submitted += 1;
      if (s.status === 'SUBMITTED') row.pending += 1;
      byFormMap.set(formId, row);
    }
    for (const s of paid) {
      const row = byFormMap.get(s.formId) || {
        formId: s.formId,
        label: s.form?.title || s.formId,
        gradeLabel: s.form?.gradeLabel || '',
        submitted: 0,
        paid: 0,
        amount: 0,
        pending: 0,
      };
      row.paid += 1;
      row.amount += Number(s.totalAmount);
      byFormMap.set(s.formId, row);
    }

    const byMethodMap = new Map<string, { method: string; count: number; amount: number }>();
    const byChannelMap = new Map<string, { channel: string; count: number; amount: number }>();
    for (const s of paid) {
      const method = s.paymentMethod || 'OTHER';
      const m = byMethodMap.get(method) || { method, count: 0, amount: 0 };
      m.count += 1;
      m.amount += Number(s.totalAmount);
      byMethodMap.set(method, m);

      const channel = s.payChannel || 'center';
      const c = byChannelMap.get(channel) || { channel, count: 0, amount: 0 };
      c.count += 1;
      c.amount += Number(s.totalAmount);
      byChannelMap.set(channel, c);
    }

    return {
      from: fromDate,
      to: toDate,
      summary: {
        submitted: submitted.length,
        paid: paid.length,
        paidAmount,
        pending,
        cancelled,
      },
      byForm: Array.from(byFormMap.values()).sort((a, b) => b.amount - a.amount),
      byMethod: Array.from(byMethodMap.values()).sort((a, b) => b.amount - a.amount),
      byChannel: Array.from(byChannelMap.values()).sort((a, b) => b.amount - a.amount),
      paid,
      recent: created.slice(0, 80),
    };
  }

  async attendance(from?: string, to?: string, groupId?: string) {
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId: { not: null },
        markedAt: { gte: fromDate, lte: toDate },
        ...(groupId ? { session: { groupId } } : {}),
      },
      include: {
        student: true,
        session: { include: { group: { include: { subject: true, teacher: true } } } },
      },
      orderBy: { markedAt: 'desc' },
    });

    const byStatus = records.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const byStudentMap = new Map<
      string,
      { student: any; present: number; absent: number; late: number; excused: number }
    >();

    for (const r of records) {
      if (!r.studentId || !r.student) continue;
      const row = byStudentMap.get(r.studentId) || {
        student: r.student,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };
      if (r.status === 'PRESENT') row.present += 1;
      if (r.status === 'ABSENT') row.absent += 1;
      if (r.status === 'LATE') row.late += 1;
      if (r.status === 'EXCUSED') row.excused += 1;
      byStudentMap.set(r.studentId, row);
    }

    const byStudent = Array.from(byStudentMap.values()).sort(
      (a, b) => b.absent - a.absent,
    );

    const absentees = records.filter((r) => r.status === 'ABSENT');

    return {
      from: fromDate,
      to: toDate,
      summary: {
        totalRecords: records.length,
        present: byStatus.PRESENT || 0,
        absent: byStatus.ABSENT || 0,
        late: byStatus.LATE || 0,
        excused: byStatus.EXCUSED || 0,
        uniqueStudents: byStudentMap.size,
      },
      byStatus,
      byStudent,
      absentees,
      recent: records.slice(0, 100),
    };
  }

  /** Phase C: profit split across ops + revenue streams */
  async profit(from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const paid = { payStatus: 'CONFIRMED' as const };

    const [sessions, onlineSales, handoutSales, rentals] = await Promise.all([
      this.prisma.classSession.findMany({
        where: {
          status: 'CLOSED',
          OR: [
            { closedAt: { gte: fromDate, lte: toDate } },
            {
              closedAt: null,
              sessionDate: { gte: fromDate, lte: toDate },
            },
          ],
        },
        include: {
          teacher: true,
          subject: true,
          entries: { where: paid },
          refunds: true,
        },
        orderBy: { sessionDate: 'desc' },
      }),
      this.prisma.onlineCodeSale.findMany({
        where: {
          ...paid,
          OR: [
            { confirmedAt: { gte: fromDate, lte: toDate } },
            {
              confirmedAt: null,
              createdAt: { gte: fromDate, lte: toDate },
            },
          ],
        },
        include: {
          offer: { include: { teacher: true, subject: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.handoutSale.findMany({
        where: {
          ...paid,
          OR: [
            { confirmedAt: { gte: fromDate, lte: toDate } },
            {
              confirmedAt: null,
              createdAt: { gte: fromDate, lte: toDate },
            },
          ],
        },
        include: {
          product: { include: { teacher: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.roomRental.findMany({
        where: {
          status: { not: 'CANCELLED' },
          ...paid,
          OR: [
            { confirmedAt: { gte: fromDate, lte: toDate } },
            {
              confirmedAt: null,
              startsAt: { gte: fromDate, lte: toDate },
            },
          ],
        },
        include: { classroom: true },
        orderBy: { startsAt: 'desc' },
      }),
    ]);

    type Agg = {
      key: string;
      label: string;
      gross: number;
      teacherShare: number;
      centerShare: number;
      refunds: number;
      count: number;
    };

    const bump = (
      map: Map<string, Agg>,
      key: string,
      label: string,
      amounts: {
        gross?: number;
        teacherShare?: number;
        centerShare?: number;
        refunds?: number;
      },
    ) => {
      const row = map.get(key) || {
        key,
        label,
        gross: 0,
        teacherShare: 0,
        centerShare: 0,
        refunds: 0,
        count: 0,
      };
      row.gross += amounts.gross || 0;
      row.teacherShare += amounts.teacherShare || 0;
      row.centerShare += amounts.centerShare || 0;
      row.refunds += amounts.refunds || 0;
      row.count += 1;
      map.set(key, row);
    };

    const byTeacher = new Map<string, Agg>();
    const bySubject = new Map<string, Agg>();
    const byRoom = new Map<string, Agg>();
    const byStream = new Map<string, Agg>();

    let sessionsGross = 0;
    let sessionsTeacher = 0;
    let sessionsCenter = 0;
    let sessionsRefunds = 0;

    for (const s of sessions) {
      const entryGross = s.entries.reduce(
        (sum, e) => sum + Number(e.amount) - Number(e.refundedAmount),
        0,
      );
      const refunds = s.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
      const { teacherShare, centerShare } = splitSessionNet({
        net: entryGross,
        feeAmount: Number(s.feeAmount),
        teacherPercent: s.teacherPercent,
        centerAmount: s.centerAmount,
        settledTeacherAmount: s.settledTeacherAmount,
        settledCenterAmount: s.settledCenterAmount,
      });
      const gross = entryGross;
      sessionsGross += gross;
      sessionsTeacher += teacherShare;
      sessionsCenter += centerShare;
      sessionsRefunds += refunds;

      const tLabel = `${s.teacher.firstName} ${s.teacher.lastName}`;
      bump(byTeacher, s.teacherId, tLabel, {
        gross,
        teacherShare,
        centerShare,
        refunds,
      });
      bump(byStream, 'sessions', 'حصص (تشغيل)', {
        gross,
        teacherShare,
        centerShare,
        refunds,
      });
      if (s.subjectId && s.subject) {
        bump(bySubject, s.subjectId, s.subject.nameAr || s.subject.nameEn, {
          gross,
          teacherShare,
          centerShare,
          refunds,
        });
      }
    }

    let onlineGross = 0;
    let onlineTeacher = 0;
    let onlineCenter = 0;
    for (const sale of onlineSales) {
      const gross = Number(sale.amount);
      const teacherShare = Number(sale.teacherShare);
      const centerShare = Number(sale.centerShare);
      onlineGross += gross;
      onlineTeacher += teacherShare;
      onlineCenter += centerShare;
      const t = sale.offer.teacher;
      bump(byTeacher, sale.offer.teacherId, `${t.firstName} ${t.lastName}`, {
        gross,
        teacherShare,
        centerShare,
      });
      bump(byStream, 'online', 'أونلاين بالكود', {
        gross,
        teacherShare,
        centerShare,
      });
      if (sale.offer.subjectId && sale.offer.subject) {
        bump(
          bySubject,
          sale.offer.subjectId,
          sale.offer.subject.nameAr || sale.offer.subject.nameEn,
          { gross, teacherShare, centerShare },
        );
      }
    }

    let handoutGross = 0;
    let handoutTeacher = 0;
    let handoutCenter = 0;
    for (const sale of handoutSales) {
      const gross = Number(sale.amount);
      const teacherShare = Number(sale.teacherShare);
      const centerShare = Number(sale.centerShare);
      handoutGross += gross;
      handoutTeacher += teacherShare;
      handoutCenter += centerShare;
      bump(byStream, 'handouts', 'ملازم', {
        gross,
        teacherShare,
        centerShare,
      });
      const tid = sale.product.teacherId;
      if (tid && sale.product.teacher) {
        const t = sale.product.teacher;
        bump(byTeacher, tid, `${t.firstName} ${t.lastName}`, {
          gross,
          teacherShare,
          centerShare,
        });
      } else {
        bump(byTeacher, 'center-only', 'السنتر (بدون مدرس)', {
          gross,
          teacherShare: 0,
          centerShare: gross,
        });
      }
    }

    let rentalGross = 0;
    for (const r of rentals) {
      const gross = Number(r.amount);
      rentalGross += gross;
      bump(byStream, 'rentals', 'تأجير قاعات', {
        gross,
        teacherShare: 0,
        centerShare: gross,
      });
      bump(byRoom, r.classroomId, r.classroom.name, {
        gross,
        teacherShare: 0,
        centerShare: gross,
      });
    }

    const sortAgg = (map: Map<string, Agg>) =>
      Array.from(map.values()).sort((a, b) => b.gross - a.gross);

    const totalGross =
      sessionsGross + onlineGross + handoutGross + rentalGross;
    const totalTeacher =
      sessionsTeacher + onlineTeacher + handoutTeacher;
    const totalCenter =
      sessionsCenter + onlineCenter + handoutCenter + rentalGross;

    return {
      from: fromDate,
      to: toDate,
      summary: {
        totalGross,
        totalTeacher,
        totalCenter,
        totalRefunds: sessionsRefunds,
        netCenter: totalCenter,
        streams: {
          sessions: {
            gross: sessionsGross,
            teacherShare: sessionsTeacher,
            centerShare: sessionsCenter,
            refunds: sessionsRefunds,
            count: sessions.length,
          },
          online: {
            gross: onlineGross,
            teacherShare: onlineTeacher,
            centerShare: onlineCenter,
            count: onlineSales.length,
          },
          handouts: {
            gross: handoutGross,
            teacherShare: handoutTeacher,
            centerShare: handoutCenter,
            count: handoutSales.length,
          },
          rentals: {
            gross: rentalGross,
            teacherShare: 0,
            centerShare: rentalGross,
            count: rentals.length,
          },
        },
      },
      byTeacher: sortAgg(byTeacher),
      bySubject: sortAgg(bySubject),
      byRoom: sortAgg(byRoom),
      byStream: sortAgg(byStream),
      recentSessions: sessions.slice(0, 30).map((s) => ({
        id: s.id,
        title: s.title,
        sessionDate: s.sessionDate,
        teacher: s.teacher,
        subject: s.subject,
        feeAmount: s.feeAmount,
        teacherPercent: s.teacherPercent,
        settledTeacherAmount: s.settledTeacherAmount,
        settledCenterAmount: s.settledCenterAmount,
        entriesCount: s.entries.length,
      })),
    };
  }
}
