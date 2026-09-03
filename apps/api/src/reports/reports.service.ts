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
      ],
    };
  }
}
