import { Injectable } from '@nestjs/common';
import { BookingStatus, OnlineCodeStatus } from '@prisma/client';
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

  async attendance(from?: string, to?: string, _groupId?: string) {
    return this.teachers(from, to);
  }

  async teachers(from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const sessions = await this.prisma.classSession.findMany({
      where: {
        sessionDate: { gte: fromDate, lte: toDate },
      },
      include: {
        teacher: true,
        subject: true,
        entries: {
          select: {
            id: true,
            payStatus: true,
            checkedInAt: true,
            amount: true,
            listedFee: true,
            refundedAmount: true,
            discountReason: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
    });

    const isActivePay = (status: string) =>
      status === 'CONFIRMED' || status === 'PARTIALLY_REFUNDED';

    type SessionRow = {
      id: string;
      sessionDate: string;
      title: string | null;
      subject: string;
      status: string;
      feeAmount: number;
      registered: number;
      present: number;
      collected: number;
      attendees: Array<{
        name: string;
        amount: number;
        discounted: boolean;
        present: boolean;
        reason?: string | null;
      }>;
    };

    type TeacherRow = {
      teacherId: string;
      name: string;
      sessionsCount: number;
      presentCount: number;
      registeredCount: number;
      collected: number;
      sessions: SessionRow[];
    };

    const byTeacher = new Map<string, TeacherRow>();
    let totalPresent = 0;
    let totalRegistered = 0;
    let totalCollected = 0;

    for (const s of sessions) {
      const active = s.entries.filter((e) => isActivePay(e.payStatus));
      const present = active.filter((e) => e.checkedInAt).length;
      const registered = active.length;
      const collected = active.reduce(
        (sum, e) => sum + Number(e.amount) - Number(e.refundedAmount || 0),
        0,
      );
      const attendees = active.map((e) => {
        const name =
          `${e.student.firstName} ${e.student.lastName === '-' ? '' : e.student.lastName}`.trim();
        const amount = Number(e.amount);
        const listed =
          e.listedFee != null ? Number(e.listedFee) : Number(s.feeAmount);
        return {
          name,
          amount,
          discounted: listed > amount + 0.001,
          present: Boolean(e.checkedInAt),
          reason: e.discountReason || null,
        };
      });
      totalPresent += present;
      totalRegistered += registered;
      totalCollected += collected;

      const teacherId = s.teacherId;
      const name = `${s.teacher.firstName} ${s.teacher.lastName === '-' ? '' : s.teacher.lastName}`.trim();
      const row = byTeacher.get(teacherId) || {
        teacherId,
        name,
        sessionsCount: 0,
        presentCount: 0,
        registeredCount: 0,
        collected: 0,
        sessions: [],
      };
      row.sessionsCount += 1;
      row.presentCount += present;
      row.registeredCount += registered;
      row.collected += collected;
      row.sessions.push({
        id: s.id,
        sessionDate: String(s.sessionDate).slice(0, 10),
        title: s.title,
        subject: s.subject?.nameAr || s.subject?.nameEn || s.title || 'حصة',
        status: s.status,
        feeAmount: Number(s.feeAmount),
        registered,
        present,
        collected,
        attendees,
      });
      byTeacher.set(teacherId, row);
    }

    const teachers = Array.from(byTeacher.values()).sort(
      (a, b) => b.sessionsCount - a.sessionsCount || b.presentCount - a.presentCount,
    );

    return {
      from: fromDate,
      to: toDate,
      summary: {
        teachers: teachers.length,
        sessions: sessions.length,
        present: totalPresent,
        registered: totalRegistered,
        collected: totalCollected,
      },
      byTeacher: teachers,
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

    const [sessions, onlineSales, handoutSales, rentals, centerBookings, walletClaims] =
      await Promise.all([
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
      this.prisma.bookingSubmission.findMany({
        where: {
          status: BookingStatus.PAID,
          payChannel: 'center',
          OR: [
            { paidAt: { gte: fromDate, lte: toDate } },
            {
              paidAt: null,
              updatedAt: { gte: fromDate, lte: toDate },
            },
          ],
        },
        select: {
          id: true,
          totalAmount: true,
          paidAt: true,
          receiptNumber: true,
          studentName: true,
          form: { select: { title: true, gradeLabel: true } },
        },
      }),
      this.prisma.onlineWalletClaim.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        select: { id: true, amount: true, createdAt: true, note: true },
      }),
    ]);

    const ymdOf = (d?: Date | string | null) => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return '';
      return dt.toISOString().slice(0, 10);
    };

    type RevenueLine = {
      id: string;
      date: string;
      stream: string;
      streamLabel: string;
      label: string;
      detail: string | null;
      gross: number;
      teacherShare: number;
      centerShare: number;
    };
    const revenueLines: RevenueLine[] = [];

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
      revenueLines.push({
        id: `sess-${s.id}`,
        date: ymdOf(s.closedAt || s.sessionDate),
        stream: 'sessions',
        streamLabel: 'حصص',
        label: s.title || tLabel,
        detail: [
          tLabel,
          s.subject?.nameAr || s.subject?.nameEn || null,
          `${s.entries.length} طالب`,
        ]
          .filter(Boolean)
          .join(' · '),
        gross,
        teacherShare,
        centerShare,
      });
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
      const tLabel = `${t.firstName} ${t.lastName}`;
      revenueLines.push({
        id: `on-${sale.id}`,
        date: ymdOf(sale.confirmedAt || sale.createdAt),
        stream: 'online',
        streamLabel: 'أونلاين',
        label: sale.offer.title,
        detail: [tLabel, (sale as { receiptNumber?: string | null }).receiptNumber]
          .filter(Boolean)
          .join(' · '),
        gross,
        teacherShare,
        centerShare,
      });
      bump(byTeacher, sale.offer.teacherId, tLabel, {
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
      const tid = sale.product.teacherId;
      const tLabel = sale.product.teacher
        ? `${sale.product.teacher.firstName} ${sale.product.teacher.lastName}`
        : 'السنتر (بدون مدرس)';
      revenueLines.push({
        id: `hn-${sale.id}`,
        date: ymdOf(sale.confirmedAt || sale.createdAt),
        stream: 'handouts',
        streamLabel: 'ملازم',
        label: sale.product.title,
        detail: [
          tLabel,
          sale.qty > 1 ? `${sale.qty} نسخة` : null,
          (sale as { receiptNumber?: string | null }).receiptNumber,
        ]
          .filter(Boolean)
          .join(' · '),
        gross,
        teacherShare,
        centerShare,
      });
      bump(byStream, 'handouts', 'ملازم', {
        gross,
        teacherShare,
        centerShare,
      });
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
      revenueLines.push({
        id: `rt-${r.id}`,
        date: ymdOf(r.confirmedAt || r.startsAt),
        stream: 'rentals',
        streamLabel: 'قاعات',
        label: r.classroom.name,
        detail: [r.renterName, r.title, r.receiptNumber]
          .filter(Boolean)
          .join(' · '),
        gross,
        teacherShare: 0,
        centerShare: gross,
      });
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

    let bookingFormsGross = 0;
    for (const b of centerBookings) {
      const gross = Number(b.totalAmount);
      bookingFormsGross += gross;
      revenueLines.push({
        id: `bk-${b.id}`,
        date: ymdOf(b.paidAt),
        stream: 'bookingForms',
        streamLabel: 'استمارات حجز',
        label: b.form?.title || 'استمارة حجز',
        detail: [
          b.studentName,
          b.form?.gradeLabel || null,
          b.receiptNumber || null,
        ]
          .filter(Boolean)
          .join(' · '),
        gross,
        teacherShare: 0,
        centerShare: gross,
      });
      bump(byStream, 'bookingForms', 'استمارات حجز (سنتر)', {
        gross,
        teacherShare: 0,
        centerShare: gross,
      });
    }

    let walletClaimsGross = 0;
    for (const c of walletClaims) {
      const gross = Number(c.amount);
      walletClaimsGross += gross;
      revenueLines.push({
        id: `wc-${c.id}`,
        date: ymdOf(c.createdAt),
        stream: 'walletClaims',
        streamLabel: 'محفظة أونلاين',
        label: 'تحويل من المحفظة',
        detail: c.note || null,
        gross,
        teacherShare: 0,
        centerShare: gross,
      });
      bump(byStream, 'walletClaims', 'محفظة أونلاين (تحويلات)', {
        gross,
        teacherShare: 0,
        centerShare: gross,
      });
    }

    const sortAgg = (map: Map<string, Agg>) =>
      Array.from(map.values()).sort((a, b) => b.gross - a.gross);

    const totalGross =
      sessionsGross +
      onlineGross +
      handoutGross +
      rentalGross +
      bookingFormsGross +
      walletClaimsGross;
    const totalTeacher =
      sessionsTeacher + onlineTeacher + handoutTeacher;
    const totalCenter =
      sessionsCenter +
      onlineCenter +
      handoutCenter +
      rentalGross +
      bookingFormsGross +
      walletClaimsGross;

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
          bookingForms: {
            gross: bookingFormsGross,
            teacherShare: 0,
            centerShare: bookingFormsGross,
            count: centerBookings.length,
          },
          walletClaims: {
            gross: walletClaimsGross,
            teacherShare: 0,
            centerShare: walletClaimsGross,
            count: walletClaims.length,
          },
        },
      },
      byTeacher: sortAgg(byTeacher),
      bySubject: sortAgg(bySubject),
      byRoom: sortAgg(byRoom),
      byStream: sortAgg(byStream),
      revenueLines: revenueLines.sort((a, b) =>
        a.date === b.date
          ? b.gross - a.gross
          : a.date < b.date
            ? 1
            : -1,
      ),
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

  /** Center P&L: profit streams + cash expenses for a date range */
  async pnl(from?: string, to?: string) {
    const profit = await this.profit(from, to);
    const fromYmd = (from || new Date(profit.from).toISOString().slice(0, 10)).slice(
      0,
      10,
    );
    const toYmd = (to || new Date(profit.to).toISOString().slice(0, 10)).slice(
      0,
      10,
    );
    const dateOnly = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    };

    const expenses = await this.prisma.cashExpense.findMany({
      where: {
        businessDate: {
          gte: dateOnly(fromYmd),
          lte: dateOnly(toYmd),
        },
      },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });

    const creatorIds = [
      ...new Set(
        expenses
          .map((e) => e.createdByUserId)
          .filter((id): id is string => !!id),
      ),
    ];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const creatorName = new Map(creators.map((u) => [u.id, u.fullName]));

    type ExpAgg = {
      key: string;
      label: string;
      amount: number;
      count: number;
    };
    const byCategory = new Map<string, ExpAgg>();
    const bySource = new Map<string, ExpAgg>();
    const sourceLabel: Record<string, string> = {
      DRAWER: 'الدرج',
      SAFE: 'الخزنة',
      OWNER: 'صاحب السنتر',
    };

    let totalExpenses = 0;
    let drawerExpenses = 0;
    let safeExpenses = 0;
    let ownerExpenses = 0;

    for (const e of expenses) {
      const amount = Number(e.amount);
      totalExpenses += amount;
      if (e.paidFrom === 'DRAWER') drawerExpenses += amount;
      else if (e.paidFrom === 'SAFE') safeExpenses += amount;
      else if (e.paidFrom === 'OWNER') ownerExpenses += amount;

      const catKey = (e.category || 'أخرى').trim() || 'أخرى';
      const cat = byCategory.get(catKey) || {
        key: catKey,
        label: catKey,
        amount: 0,
        count: 0,
      };
      cat.amount += amount;
      cat.count += 1;
      byCategory.set(catKey, cat);

      const srcKey = e.paidFrom;
      const src = bySource.get(srcKey) || {
        key: srcKey,
        label: sourceLabel[srcKey] || srcKey,
        amount: 0,
        count: 0,
      };
      src.amount += amount;
      src.count += 1;
      bySource.set(srcKey, src);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    totalExpenses = round2(totalExpenses);
    drawerExpenses = round2(drawerExpenses);
    safeExpenses = round2(safeExpenses);
    ownerExpenses = round2(ownerExpenses);

    const centerShare = round2(Number(profit.summary.totalCenter || 0));
    const teacherShare = round2(Number(profit.summary.totalTeacher || 0));
    const gross = round2(Number(profit.summary.totalGross || 0));
    const netProfit = round2(centerShare - totalExpenses);

    return {
      from: profit.from,
      to: profit.to,
      summary: {
        gross,
        teacherShare,
        centerShare,
        totalExpenses,
        drawerExpenses,
        safeExpenses,
        ownerExpenses,
        netProfit,
        expensesCount: expenses.length,
        streams: profit.summary.streams,
      },
      byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      bySource: [...bySource.values()].sort((a, b) => b.amount - a.amount),
      expenses: expenses.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        category: e.category,
        paidFrom: e.paidFrom,
        paidFromLabel: sourceLabel[e.paidFrom] || e.paidFrom,
        note: e.note,
        businessDate: e.businessDate,
        createdAt: e.createdAt,
        createdByName: e.createdByUserId
          ? creatorName.get(e.createdByUserId) || null
          : null,
      })),
      revenueLines: profit.revenueLines || [],
      profitStreams: [
        {
          key: 'sessions',
          label: 'حصص',
          ...profit.summary.streams.sessions,
        },
        {
          key: 'online',
          label: 'أونلاين',
          ...profit.summary.streams.online,
        },
        {
          key: 'handouts',
          label: 'ملازم',
          ...profit.summary.streams.handouts,
        },
        {
          key: 'rentals',
          label: 'قاعات',
          ...profit.summary.streams.rentals,
        },
        {
          key: 'bookingForms',
          label: 'استمارات حجز',
          ...profit.summary.streams.bookingForms,
        },
        {
          key: 'walletClaims',
          label: 'محفظة أونلاين',
          ...profit.summary.streams.walletClaims,
        },
      ],
    };
  }

  /** Detailed online codes + handouts sales report for a date range. */
  async codesHandouts(from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);
    const paid = { payStatus: 'CONFIRMED' as const };
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const ymdOf = (d?: Date | string | null) => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return '';
      return dt.toISOString().slice(0, 10);
    };
    const person = (t?: { firstName?: string | null; lastName?: string | null } | null) => {
      if (!t?.firstName) return 'بدون مدرس';
      const last = t.lastName && t.lastName !== '-' ? t.lastName : '';
      return `${t.firstName} ${last}`.trim();
    };
    const cashToLabel: Record<string, string> = {
      DRAWER: 'الدرج',
      OWNER: 'صاحب السنتر',
      TEACHER_HOLD: 'حساب المدرس',
      SAFE: 'الخزنة',
    };
    const methodLabel: Record<string, string> = {
      CASH: 'كاش',
      VODAFONE_CASH: 'فودافون',
    };

    const [onlineSales, handoutSales, offers, handouts, codeGroups, handoutSoldAll, dayCloses] =
      await Promise.all([
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
          code: { select: { code: true } },
          offer: {
            select: {
              id: true,
              title: true,
              teacherId: true,
              teacher: { select: { firstName: true, lastName: true } },
              subject: { select: { nameAr: true, nameEn: true } },
            },
          },
          student: { select: { firstName: true, lastName: true, phone: true } },
        },
        orderBy: { confirmedAt: 'desc' },
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
          product: {
            select: {
              id: true,
              title: true,
              teacherId: true,
              teacher: { select: { firstName: true, lastName: true } },
            },
          },
          student: { select: { firstName: true, lastName: true, phone: true } },
        },
        orderBy: { confirmedAt: 'desc' },
      }),
      this.prisma.onlineOffer.findMany({
        include: {
          teacher: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ title: 'asc' }],
      }),
      this.prisma.handoutProduct.findMany({
        include: {
          teacher: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ title: 'asc' }],
      }),
      this.prisma.onlineAccessCode.groupBy({
        by: ['offerId', 'status'],
        _count: true,
      }),
      this.prisma.handoutSale.groupBy({
        by: ['productId'],
        _sum: { qty: true },
      }),
      this.prisma.cashDayClose.findMany({
        where: {
          OR: [
            { businessDate: { gte: fromDate, lte: toDate } },
            { closedAt: { gte: fromDate, lte: toDate } },
          ],
        },
        orderBy: { closedAt: 'desc' },
      }),
    ]);

    type Agg = {
      key: string;
      label: string;
      count: number;
      qty: number;
      codesSold: number;
      handoutsSold: number;
      gross: number;
      teacherShare: number;
      centerShare: number;
    };
    const bump = (
      map: Map<string, Agg>,
      key: string,
      label: string,
      amounts: {
        count?: number;
        qty?: number;
        codesSold?: number;
        handoutsSold?: number;
        gross?: number;
        teacherShare?: number;
        centerShare?: number;
      },
    ) => {
      const row = map.get(key) || {
        key,
        label,
        count: 0,
        qty: 0,
        codesSold: 0,
        handoutsSold: 0,
        gross: 0,
        teacherShare: 0,
        centerShare: 0,
      };
      row.count += amounts.count || 0;
      row.qty += amounts.qty || 0;
      row.codesSold += amounts.codesSold || 0;
      row.handoutsSold += amounts.handoutsSold || 0;
      row.gross += amounts.gross || 0;
      row.teacherShare += amounts.teacherShare || 0;
      row.centerShare += amounts.centerShare || 0;
      map.set(key, row);
    };

    const byTeacher = new Map<string, Agg>();
    const byOffer = new Map<string, Agg>();
    const byProduct = new Map<string, Agg>();
    const byCashTo = new Map<string, Agg>();
    const byMethod = new Map<string, Agg>();

    let onlineGross = 0;
    let onlineTeacher = 0;
    let onlineCenter = 0;
    let onlineHold = 0;
    let handoutGross = 0;
    let handoutTeacher = 0;
    let handoutCenter = 0;
    let handoutHold = 0;
    let handoutQty = 0;

    const onlineLines = onlineSales.map((s) => {
      const gross = Number(s.amount);
      const teacherShare = Number(s.teacherShare);
      const centerShare = Number(s.centerShare);
      onlineGross += gross;
      onlineTeacher += teacherShare;
      onlineCenter += centerShare;
      if (s.cashTo === 'TEACHER_HOLD') onlineHold += 1;
      const teacherName = person(s.offer.teacher);
      const teacherId = s.offer.teacherId || 'none';
      bump(byTeacher, `t-${teacherId}`, teacherName, {
        count: 1,
        qty: 1,
        codesSold: 1,
        gross,
        teacherShare,
        centerShare,
      });
      bump(byOffer, s.offer.id, s.offer.title, {
        count: 1,
        qty: 1,
        codesSold: 1,
        gross,
        teacherShare,
        centerShare,
      });
      bump(byCashTo, s.cashTo, cashToLabel[s.cashTo] || s.cashTo, {
        count: 1,
        qty: 1,
        codesSold: 1,
        gross,
        teacherShare,
        centerShare,
      });
      bump(byMethod, s.method, methodLabel[s.method] || s.method, {
        count: 1,
        qty: 1,
        codesSold: 1,
        gross,
        teacherShare,
        centerShare,
      });
      const studentName = s.student
        ? `${s.student.firstName} ${s.student.lastName === '-' ? '' : s.student.lastName}`.trim()
        : s.buyerName || null;
      const atRaw = s.confirmedAt || s.createdAt;
      return {
        id: s.id,
        kind: 'online' as const,
        date: ymdOf(atRaw),
        at: atRaw ? new Date(atRaw).toISOString() : null,
        teacherName,
        title: s.offer.title,
        subject: s.offer.subject?.nameAr || s.offer.subject?.nameEn || null,
        code: s.code?.code || null,
        qty: 1,
        gross: round2(gross),
        teacherShare: round2(teacherShare),
        centerShare: round2(centerShare),
        method: s.method,
        methodLabel: methodLabel[s.method] || s.method,
        cashTo: s.cashTo,
        cashToLabel: cashToLabel[s.cashTo] || s.cashTo,
        receiptNumber: s.receiptNumber,
        studentName,
        phone: s.student?.phone || s.buyerPhone || null,
        settled: !!s.settlementId,
        vodafoneTxn: s.vodafoneTxn || null,
      };
    });

    const handoutLines = handoutSales.map((s) => {
      const gross = Number(s.amount);
      const teacherShare = Number(s.teacherShare);
      const centerShare = Number(s.centerShare);
      const qty = s.qty || 1;
      handoutGross += gross;
      handoutTeacher += teacherShare;
      handoutCenter += centerShare;
      handoutQty += qty;
      if (s.cashTo === 'TEACHER_HOLD') handoutHold += 1;
      const teacherName = person(s.product.teacher);
      const teacherId = s.product.teacherId || 'center-only';
      bump(byTeacher, `t-${teacherId}`, teacherName, {
        count: qty,
        qty,
        handoutsSold: qty,
        gross,
        teacherShare,
        centerShare,
      });
      bump(byProduct, s.product.id, s.product.title, {
        count: qty,
        qty,
        handoutsSold: qty,
        gross,
        teacherShare,
        centerShare,
      });
      bump(byCashTo, s.cashTo, cashToLabel[s.cashTo] || s.cashTo, {
        count: qty,
        qty,
        handoutsSold: qty,
        gross,
        teacherShare,
        centerShare,
      });
      bump(byMethod, s.method, methodLabel[s.method] || s.method, {
        count: qty,
        qty,
        handoutsSold: qty,
        gross,
        teacherShare,
        centerShare,
      });
      const studentName = s.student
        ? `${s.student.firstName} ${s.student.lastName === '-' ? '' : s.student.lastName}`.trim()
        : null;
      const atRaw = s.confirmedAt || s.createdAt;
      return {
        id: s.id,
        kind: 'handout' as const,
        date: ymdOf(atRaw),
        at: atRaw ? new Date(atRaw).toISOString() : null,
        teacherName,
        title: s.product.title,
        subject: null as string | null,
        code: null as string | null,
        qty,
        gross: round2(gross),
        teacherShare: round2(teacherShare),
        centerShare: round2(centerShare),
        method: s.method,
        methodLabel: methodLabel[s.method] || s.method,
        cashTo: s.cashTo,
        cashToLabel: cashToLabel[s.cashTo] || s.cashTo,
        receiptNumber: s.receiptNumber,
        studentName,
        phone: s.student?.phone || s.buyerPhone || null,
        settled: !!s.settlementId,
        vodafoneTxn: s.vodafoneTxn || null,
      };
    });

    const sortAgg = (map: Map<string, Agg>) =>
      [...map.values()]
        .map((r) => ({
          ...r,
          gross: round2(r.gross),
          teacherShare: round2(r.teacherShare),
          centerShare: round2(r.centerShare),
        }))
        .sort((a, b) => b.gross - a.gross);

    const codeByOffer = new Map<
      string,
      { total: number; sold: number; remaining: number }
    >();
    for (const row of codeGroups) {
      const cur = codeByOffer.get(row.offerId) || {
        total: 0,
        sold: 0,
        remaining: 0,
      };
      const n = row._count;
      cur.total += n;
      if (row.status === OnlineCodeStatus.SOLD) cur.sold += n;
      if (row.status === OnlineCodeStatus.AVAILABLE) cur.remaining += n;
      codeByOffer.set(row.offerId, cur);
    }
    const soldQtyByProduct = new Map(
      handoutSoldAll.map((r) => [r.productId, Number(r._sum.qty || 0)]),
    );

    const stockOffers = offers.map((o) => {
      const stats = codeByOffer.get(o.id) || {
        total: 0,
        sold: 0,
        remaining: 0,
      };
      return {
        id: o.id,
        title: o.title,
        teacherId: o.teacherId,
        teacherName: person(o.teacher),
        isActive: o.isActive,
        price: Number(o.price),
        total: stats.total,
        sold: stats.sold,
        remaining: stats.remaining,
      };
    }).sort((a, b) => b.remaining - a.remaining || a.title.localeCompare(b.title, 'ar'));

    const stockHandouts = handouts.map((h) => {
      const sold = soldQtyByProduct.get(h.id) || 0;
      const remaining = h.stock;
      return {
        id: h.id,
        title: h.title,
        teacherId: h.teacherId || null,
        teacherName: h.teacher ? person(h.teacher) : 'بدون مدرس',
        isActive: h.isActive,
        price: Number(h.price),
        total: remaining + sold,
        sold,
        remaining,
      };
    }).sort((a, b) => b.remaining - a.remaining || a.title.localeCompare(b.title, 'ar'));

    const remainingByTeacher = new Map<
      string,
      { teacherId: string; teacherName: string; codesRemaining: number; handoutsRemaining: number }
    >();
    for (const o of stockOffers) {
      const row = remainingByTeacher.get(o.teacherId) || {
        teacherId: o.teacherId,
        teacherName: o.teacherName,
        codesRemaining: 0,
        handoutsRemaining: 0,
      };
      row.codesRemaining += o.remaining;
      remainingByTeacher.set(o.teacherId, row);
    }
    for (const h of stockHandouts) {
      const tid = h.teacherId || 'center-only';
      const row = remainingByTeacher.get(tid) || {
        teacherId: tid,
        teacherName: h.teacherName,
        codesRemaining: 0,
        handoutsRemaining: 0,
      };
      row.handoutsRemaining += h.remaining;
      remainingByTeacher.set(tid, row);
    }

    const byOfferOut = sortAgg(byOffer).map((r) => {
      const stock = codeByOffer.get(r.key);
      return {
        ...r,
        remaining: stock?.remaining ?? 0,
        soldAll: stock?.sold ?? 0,
        totalAll: stock?.total ?? 0,
      };
    });
    const byProductOut = sortAgg(byProduct).map((r) => {
      const stock = stockHandouts.find((h) => h.id === r.key);
      return {
        ...r,
        remaining: stock?.remaining ?? 0,
        soldAll: stock?.sold ?? 0,
        totalAll: stock?.total ?? 0,
      };
    });
    const byTeacherOut = sortAgg(byTeacher).map((r) => {
      const tid = r.key.startsWith('t-') ? r.key.slice(2) : r.key;
      const rem = remainingByTeacher.get(tid);
      return {
        ...r,
        codesSold: r.codesSold || 0,
        handoutsSold: r.handoutsSold || 0,
        codesRemaining: rem?.codesRemaining ?? 0,
        handoutsRemaining: rem?.handoutsRemaining ?? 0,
        remaining: (rem?.codesRemaining ?? 0) + (rem?.handoutsRemaining ?? 0),
      };
    });

    const onlineRemaining = stockOffers.reduce((n, o) => n + o.remaining, 0);
    const onlineSoldAll = stockOffers.reduce((n, o) => n + o.sold, 0);
    const onlineTotalAll = stockOffers.reduce((n, o) => n + o.total, 0);
    const handoutRemaining = stockHandouts.reduce((n, h) => n + h.remaining, 0);
    const handoutSoldAllQty = stockHandouts.reduce((n, h) => n + h.sold, 0);
    const handoutTotalAll = stockHandouts.reduce((n, h) => n + h.total, 0);

    const fmtAt = (d?: Date | string | null) => {
      if (!d) return null;
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return dt.toISOString();
    };

    const safeFromSales = [
      ...onlineLines
        .filter((r) => r.cashTo === 'SAFE')
        .map((r) => ({
          id: `online-${r.id}`,
          source: 'sale' as const,
          kind: 'online' as const,
          kindLabel: 'كود',
          businessDate: r.date,
          at: r.at,
          amount: r.centerShare,
          gross: r.gross,
          title: r.title,
          teacherName: r.teacherName,
          receiptNumber: r.receiptNumber,
          note: 'حصة السنتر دخلت الخزنة مباشرة مع تأكيد البيع',
        })),
      ...handoutLines
        .filter((r) => r.cashTo === 'SAFE')
        .map((r) => ({
          id: `handout-${r.id}`,
          source: 'sale' as const,
          kind: 'handout' as const,
          kindLabel: 'ملزمة',
          businessDate: r.date,
          at: r.at,
          amount: r.centerShare,
          gross: r.gross,
          title: r.title,
          teacherName: r.teacherName,
          receiptNumber: r.receiptNumber,
          note: 'حصة السنتر دخلت الخزنة مباشرة مع تأكيد البيع',
        })),
    ];

    const safeFromCloses = dayCloses.map((c) => ({
      id: `close-${c.id}`,
      source: 'day-close' as const,
      kind: 'day-close' as const,
      kindLabel: 'قفل يوم',
      businessDate: ymdOf(c.businessDate),
      at: fmtAt(c.closedAt),
      amount: round2(Number(c.transferredToSafe)),
      gross: round2(Number(c.transferredToSafe)),
      title: `قفل يوم ${ymdOf(c.businessDate)}`,
      teacherName: null as string | null,
      receiptNumber: null as string | null,
      note: c.note || 'تحويل عدّ الدرج إلى الخزنة عند قفل اليوم',
    }));

    const safeEntries = [...safeFromCloses, ...safeFromSales].sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return tb - ta;
    });
    const safeEnteredTotal = round2(
      safeEntries.reduce((n, r) => n + Number(r.amount || 0), 0),
    );

    return {
      from: fromDate,
      to: toDate,
      summary: {
        onlineCount: onlineSales.length,
        onlineGross: round2(onlineGross),
        onlineTeacher: round2(onlineTeacher),
        onlineCenter: round2(onlineCenter),
        onlineHold,
        handoutSalesCount: handoutSales.length,
        handoutCount: handoutQty,
        handoutQty,
        handoutGross: round2(handoutGross),
        handoutTeacher: round2(handoutTeacher),
        handoutCenter: round2(handoutCenter),
        handoutHold,
        totalCount: onlineSales.length + handoutQty,
        totalGross: round2(onlineGross + handoutGross),
        totalTeacher: round2(onlineTeacher + handoutTeacher),
        totalCenter: round2(onlineCenter + handoutCenter),
        onlineRemaining,
        onlineSoldAll,
        onlineTotalAll,
        handoutRemaining,
        handoutSoldAll: handoutSoldAllQty,
        handoutTotalAll,
        safeEnteredTotal,
        safeEntriesCount: safeEntries.length,
      },
      byTeacher: byTeacherOut,
      byOffer: byOfferOut,
      byProduct: byProductOut,
      byCashTo: sortAgg(byCashTo),
      byMethod: sortAgg(byMethod),
      stockOffers,
      stockHandouts,
      safeEntries,
      onlineSales: onlineLines,
      handoutSales: handoutLines,
    };
  }
}
