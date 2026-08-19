import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  ClassSessionStatus,
  SessionPayStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function cairoYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function cairoBounds(ymd: string) {
  const start = new Date(`${ymd}T00:00:00+03:00`);
  const end = new Date(`${ymd}T23:59:59.999+03:00`);
  return { start, end };
}

function dateOnly(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysYmd(ymd: string, delta: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function dayKeyCairo(d: Date) {
  return cairoYmd(d);
}

function isElectronic(method?: string | null) {
  const m = String(method || '').toUpperCase();
  return m.includes('VODAFONE') || m.includes('INSTAPAY');
}

function sessionCenterCut(s: {
  feeAmount: unknown;
  centerAmount?: unknown;
  teacherPercent?: unknown;
}) {
  if (s.centerAmount != null && s.centerAmount !== '') {
    return Number(s.centerAmount);
  }
  const fee = Number(s.feeAmount || 0);
  const pct = Number(s.teacherPercent || 0);
  return Math.round(fee * (1 - pct / 100) * 100) / 100;
}

function n(v: unknown) {
  return Number(v || 0);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const ymd = cairoYmd();
    const { start, end } = cairoBounds(ymd);
    const day = new Date(`${ymd}T12:00:00+03:00`).getDay();
    const monthStartYmd = `${ymd.slice(0, 7)}-01`;
    const monthStart = cairoBounds(monthStartYmd).start;
    const trendFromYmd = addDaysYmd(ymd, -13);
    const trendFrom = cairoBounds(trendFromYmd).start;
    const sessionDay = dateOnly(ymd);

    const [
      totalStudents,
      totalTeachers,
      totalGroups,
      activeEnrollments,
      classesToday,
      studentsPresent,
      studentsAbsent,
      studentsLate,
      checkInsToday,
      paymentsTodayAgg,
      paymentsMonthAgg,
      newStudentsMonth,
      outstandingInvoices,
      attendanceByStatus,
      attendanceBySource,
      recentPayments,
      todaySlots,
    ] = await Promise.all([
      this.prisma.student.count({ where: { isActive: true } }),
      this.prisma.teacher.count({ where: { isActive: true } }),
      this.prisma.group.count({ where: { isActive: true } }),
      this.prisma.enrollment.count({ where: { isActive: true } }),
      this.prisma.scheduleSlot.count({ where: { dayOfWeek: day } }),
      this.prisma.attendanceRecord.count({
        where: {
          status: 'PRESENT',
          studentId: { not: null },
          markedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          status: 'ABSENT',
          studentId: { not: null },
          markedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          status: 'LATE',
          studentId: { not: null },
          markedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          studentId: { not: null },
          markedAt: { gte: start, lte: end },
          source: { in: ['QR_STUDENT', 'QR_GATE', 'NFC_CARD'] },
        },
      }),
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: monthStart, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.student.count({
        where: { createdAt: { gte: monthStart } },
      }),
      this.prisma.invoice.findMany({
        where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        include: {
          student: true,
          group: { include: { subject: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { markedAt: { gte: start, lte: end }, studentId: { not: null } },
        _count: true,
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['source'],
        where: { markedAt: { gte: start, lte: end }, studentId: { not: null } },
        _count: true,
      }),
      this.prisma.payment.findMany({
        take: 10,
        orderBy: { paidAt: 'desc' },
        include: { student: true, invoice: { include: { group: true } } },
      }),
      this.prisma.scheduleSlot.findMany({
        where: { dayOfWeek: day },
        include: {
          group: {
            include: {
              subject: true,
              teacher: true,
              classroom: true,
              _count: { select: { enrollments: true } },
            },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const outstandingAmount = outstandingInvoices.reduce((sum, inv) => {
      const due =
        Number(inv.feeAmount) -
        Number(inv.discount) +
        Number(inv.extras) -
        Number(inv.paidAmount);
      return sum + Math.max(due, 0);
    }, 0);

    const outstandingStudents = new Set(
      outstandingInvoices.map((i) => i.studentId),
    ).size;

    // 14-day collection + attendance trend
    const [paymentsTrend, attendanceTrendRows] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paidAt: { gte: trendFrom, lte: end } },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          markedAt: { gte: trendFrom, lte: end },
          studentId: { not: null },
        },
        select: { status: true, markedAt: true },
      }),
    ]);

    const collectionByDay = new Map<string, number>();
    const attendanceByDay = new Map<
      string,
      { present: number; absent: number; late: number; excused: number; total: number }
    >();

    for (let i = 0; i < 14; i++) {
      const key = addDaysYmd(trendFromYmd, i);
      collectionByDay.set(key, 0);
      attendanceByDay.set(key, {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        total: 0,
      });
    }

    for (const p of paymentsTrend) {
      const key = dayKeyCairo(p.paidAt);
      if (collectionByDay.has(key)) {
        collectionByDay.set(key, (collectionByDay.get(key) || 0) + Number(p.amount));
      }
    }

    for (const r of attendanceTrendRows) {
      const key = dayKeyCairo(r.markedAt);
      const row = attendanceByDay.get(key);
      if (!row) continue;
      row.total += 1;
      if (r.status === 'PRESENT') row.present += 1;
      if (r.status === 'ABSENT') row.absent += 1;
      if (r.status === 'LATE') row.late += 1;
      if (r.status === 'EXCUSED') row.excused += 1;
    }

    const collectionTrend = Array.from(collectionByDay.entries()).map(
      ([date, amount]) => ({ date, amount }),
    );

    const attendanceTrend = Array.from(attendanceByDay.entries()).map(
      ([date, row]) => ({
        date,
        ...row,
        rate:
          row.total > 0
            ? Math.round(((row.present + row.late) / row.total) * 100)
            : 0,
      }),
    );

    // Top absentees this month
    const monthAttendance = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId: { not: null },
        markedAt: { gte: monthStart, lte: end },
        status: { in: ['ABSENT', 'PRESENT', 'LATE', 'EXCUSED'] },
      },
      include: { student: true },
    });

    const absenteeMap = new Map<
      string,
      {
        studentId: string;
        name: string;
        studentUid: string;
        absent: number;
        present: number;
        late: number;
      }
    >();

    for (const r of monthAttendance) {
      if (!r.studentId || !r.student) continue;
      const row = absenteeMap.get(r.studentId) || {
        studentId: r.studentId,
        name: `${r.student.firstName} ${r.student.lastName}`,
        studentUid: r.student.studentUid,
        absent: 0,
        present: 0,
        late: 0,
      };
      if (r.status === 'ABSENT') row.absent += 1;
      if (r.status === 'PRESENT') row.present += 1;
      if (r.status === 'LATE') row.late += 1;
      absenteeMap.set(r.studentId, row);
    }

    const topAbsentees = Array.from(absenteeMap.values())
      .filter((r) => r.absent > 0)
      .sort((a, b) => b.absent - a.absent)
      .slice(0, 8);

    const markedToday =
      studentsPresent + studentsAbsent + studentsLate +
      (attendanceByStatus.find((a) => a.status === 'EXCUSED')?._count || 0);

    const attendanceRateToday =
      markedToday > 0
        ? Math.round(((studentsPresent + studentsLate) / markedToday) * 100)
        : 0;

    const weekSlice = attendanceTrend.slice(-7);
    const weekMarked = weekSlice.reduce((s, d) => s + d.total, 0);
    const weekPresent = weekSlice.reduce((s, d) => s + d.present + d.late, 0);
    const attendanceRateWeek =
      weekMarked > 0 ? Math.round((weekPresent / weekMarked) * 100) : 0;

    const topOutstanding = outstandingInvoices
      .map((inv) => {
        const due =
          Number(inv.feeAmount) -
          Number(inv.discount) +
          Number(inv.extras) -
          Number(inv.paidAmount);
        return {
          id: inv.id,
          status: inv.status,
          due: Math.max(due, 0),
          dueDate: inv.dueDate,
          student: {
            id: inv.student.id,
            firstName: inv.student.firstName,
            lastName: inv.student.lastName,
          },
          groupName: inv.group?.name || '—',
          subject: inv.group?.subject?.nameEn || inv.group?.subject?.nameAr || '',
        };
      })
      .filter((r) => r.due > 0)
      .sort((a, b) => b.due - a.due)
      .slice(0, 8);

    const invoiceStatusBreakdown = outstandingInvoices.reduce<
      Record<string, number>
    >((acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1;
      return acc;
    }, {});

    const confirmed = SessionPayStatus.CONFIRMED;
    const [
      paymentsTodayRows,
      sessionEntriesToday,
      openSessions,
      closedSessionsToday,
      unpaidTeacherSessions,
      pendingSessionEntries,
      extraCodesToday,
      extraHandoutsToday,
      extraRentalsToday,
      extraCodesMonth,
      extraHandoutsMonth,
      extraRentalsMonth,
      bookingsPending,
      bookingsPaidToday,
      bookingsOnline,
      expensesTodayAgg,
      dayClose,
      trendSessionEntries,
      trendCodes,
      trendHandouts,
      trendRentals,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paidAt: { gte: start, lte: end } },
        select: { amount: true, method: true },
      }),
      this.prisma.sessionEntry.findMany({
        where: { payStatus: confirmed, confirmedAt: { gte: start, lte: end } },
        include: {
          session: {
            include: { teacher: true, subject: true },
          },
        },
      }),
      this.prisma.classSession.findMany({
        where: { status: ClassSessionStatus.OPEN, sessionDate: sessionDay },
        include: {
          teacher: true,
          subject: true,
          _count: { select: { entries: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      this.prisma.classSession.count({
        where: { status: ClassSessionStatus.CLOSED, sessionDate: sessionDay },
      }),
      this.prisma.classSession.count({
        where: { status: ClassSessionStatus.CLOSED, teacherPaidAt: null },
      }),
      this.prisma.sessionEntry.count({
        where: { payStatus: SessionPayStatus.PENDING_CONFIRM },
      }),
      this.prisma.onlineCodeSale.aggregate({
        where: { payStatus: confirmed, confirmedAt: { gte: start, lte: end } },
        _sum: { centerShare: true, amount: true },
        _count: true,
      }),
      this.prisma.handoutSale.aggregate({
        where: { payStatus: confirmed, confirmedAt: { gte: start, lte: end } },
        _sum: { centerShare: true, amount: true },
        _count: true,
      }),
      this.prisma.roomRental.aggregate({
        where: { payStatus: confirmed, confirmedAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.onlineCodeSale.aggregate({
        where: { payStatus: confirmed, confirmedAt: { gte: monthStart, lte: end } },
        _sum: { centerShare: true },
        _count: true,
      }),
      this.prisma.handoutSale.aggregate({
        where: { payStatus: confirmed, confirmedAt: { gte: monthStart, lte: end } },
        _sum: { centerShare: true },
        _count: true,
      }),
      this.prisma.roomRental.aggregate({
        where: { payStatus: confirmed, confirmedAt: { gte: monthStart, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.bookingSubmission.count({
        where: { status: BookingStatus.SUBMITTED },
      }),
      this.prisma.bookingSubmission.aggregate({
        where: { status: BookingStatus.PAID, paidAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.bookingSubmission.groupBy({
        by: ['status'],
        where: { payChannel: 'online', status: { in: [BookingStatus.PAID, BookingStatus.SUBMITTED] } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.cashExpense.aggregate({
        where: { businessDate: sessionDay },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.cashDayClose.findUnique({
        where: { businessDate: sessionDay },
        select: { countedAmount: true, expectedAmount: true, difference: true },
      }),
      this.prisma.sessionEntry.findMany({
        where: { payStatus: confirmed, confirmedAt: { gte: trendFrom, lte: end } },
        select: { amount: true, confirmedAt: true },
      }),
      this.prisma.onlineCodeSale.findMany({
        where: { payStatus: confirmed, confirmedAt: { gte: trendFrom, lte: end } },
        select: { centerShare: true, confirmedAt: true },
      }),
      this.prisma.handoutSale.findMany({
        where: { payStatus: confirmed, confirmedAt: { gte: trendFrom, lte: end } },
        select: { centerShare: true, confirmedAt: true },
      }),
      this.prisma.roomRental.findMany({
        where: { payStatus: confirmed, confirmedAt: { gte: trendFrom, lte: end } },
        select: { amount: true, confirmedAt: true },
      }),
    ]);

    const splitPay = (rows: { amount: unknown; method?: string | null }[]) => {
      let cash = 0;
      let electronic = 0;
      for (const r of rows) {
        const amt = n(r.amount);
        if (isElectronic(r.method)) electronic += amt;
        else cash += amt;
      }
      return { cash, electronic, total: cash + electronic, count: rows.length };
    };

    const receiptsToday = splitPay(paymentsTodayRows);
    let sessionsCash = 0;
    let sessionsElectronic = 0;
    let sessionsCenter = 0;
    let sessionsCheckedIn = 0;
    const teacherMap = new Map<
      string,
      { teacherId: string; name: string; students: number; amount: number; centerCut: number }
    >();
    for (const e of sessionEntriesToday) {
      const amt = n(e.amount);
      if (isElectronic(e.method)) sessionsElectronic += amt;
      else sessionsCash += amt;
      const cut = sessionCenterCut(e.session);
      sessionsCenter += cut;
      if (e.checkedInAt) sessionsCheckedIn += 1;
      const t = e.session.teacher;
      const name = `${t.firstName} ${t.lastName === '-' ? '' : t.lastName}`.trim();
      const cur = teacherMap.get(e.session.teacherId) || {
        teacherId: e.session.teacherId,
        name,
        students: 0,
        amount: 0,
        centerCut: 0,
      };
      cur.students += 1;
      cur.amount += amt;
      cur.centerCut += cut;
      teacherMap.set(e.session.teacherId, cur);
    }

    const extraToday =
      n(extraCodesToday._sum.centerShare) +
      n(extraHandoutsToday._sum.centerShare) +
      n(extraRentalsToday._sum.amount);
    const extraMonth =
      n(extraCodesMonth._sum.centerShare) +
      n(extraHandoutsMonth._sum.centerShare) +
      n(extraRentalsMonth._sum.amount);

    const onlineWallet = { confirmedAmount: 0, pendingAmount: 0, confirmedCount: 0, pendingCount: 0 };
    for (const g of bookingsOnline) {
      if (g.status === BookingStatus.PAID) {
        onlineWallet.confirmedAmount = n(g._sum.totalAmount);
        onlineWallet.confirmedCount = g._count;
      }
      if (g.status === BookingStatus.SUBMITTED) {
        onlineWallet.pendingAmount = n(g._sum.totalAmount);
        onlineWallet.pendingCount = g._count;
      }
    }

    const intakeByDay = new Map<
      string,
      { date: string; receipts: number; sessions: number; extra: number; total: number }
    >();
    const opsByDay = new Map<string, { date: string; students: number; amount: number }>();
    for (let i = 0; i < 14; i++) {
      const key = addDaysYmd(trendFromYmd, i);
      intakeByDay.set(key, { date: key, receipts: 0, sessions: 0, extra: 0, total: 0 });
      opsByDay.set(key, { date: key, students: 0, amount: 0 });
    }
    const bump = (
      map: Map<string, { date: string; receipts: number; sessions: number; extra: number; total: number }>,
      at: Date | null,
      field: 'receipts' | 'sessions' | 'extra',
      amount: number,
    ) => {
      if (!at) return;
      const key = dayKeyCairo(at);
      const row = map.get(key);
      if (!row) return;
      row[field] += amount;
      row.total += amount;
    };
    for (const p of paymentsTrend) bump(intakeByDay, p.paidAt, 'receipts', n(p.amount));
    for (const e of trendSessionEntries) {
      bump(intakeByDay, e.confirmedAt, 'sessions', n(e.amount));
      if (!e.confirmedAt) continue;
      const key = dayKeyCairo(e.confirmedAt);
      const row = opsByDay.get(key);
      if (row) {
        row.students += 1;
        row.amount += n(e.amount);
      }
    }
    for (const s of trendCodes) bump(intakeByDay, s.confirmedAt, 'extra', n(s.centerShare));
    for (const s of trendHandouts) bump(intakeByDay, s.confirmedAt, 'extra', n(s.centerShare));
    for (const s of trendRentals) bump(intakeByDay, s.confirmedAt, 'extra', n(s.amount));

    const financeMixToday = {
      receipts: receiptsToday.total,
      sessions: sessionsCash + sessionsElectronic,
      extra: extraToday,
      bookings: n(bookingsPaidToday._sum.totalAmount),
    };
    const financeMixTotal =
      financeMixToday.receipts +
      financeMixToday.sessions +
      financeMixToday.extra;

    return {
      generatedAt: new Date().toISOString(),
      // legacy/simple KPIs
      totalStudents,
      totalTeachers,
      classesToday,
      studentsPresent,
      collectedToday: Number(paymentsTodayAgg._sum.amount || 0),
      outstandingStudents,
      recentPayments,
      attendanceByStatus,

      // richer analytics
      kpis: {
        totalStudents,
        totalTeachers,
        totalGroups,
        activeEnrollments,
        classesToday,
        studentsPresent,
        studentsAbsent,
        studentsLate,
        checkInsToday,
        attendanceRateToday,
        attendanceRateWeek,
        collectedToday: Number(paymentsTodayAgg._sum.amount || 0),
        paymentsTodayCount: paymentsTodayAgg._count,
        collectedMonth: Number(paymentsMonthAgg._sum.amount || 0),
        paymentsMonthCount: paymentsMonthAgg._count,
        outstandingStudents,
        outstandingAmount,
        newStudentsMonth,
        markedToday,
        intakeToday: financeMixTotal,
        sessionsTodayAmount: sessionsCash + sessionsElectronic,
        extraToday,
        openSessions: openSessions.length,
        pendingSessionPay: pendingSessionEntries,
      },
      collectionTrend,
      intakeTrend: Array.from(intakeByDay.values()),
      opsTrend: Array.from(opsByDay.values()),
      attendanceTrend,
      attendanceBySource,
      topAbsentees,
      topOutstanding,
      invoiceStatusBreakdown,
      todaySchedule: todaySlots.map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        groupName: s.group.name,
        subject:
          s.group.subject?.nameAr || s.group.subject?.nameEn || 'مادة',
        teacher: `${s.group.teacher?.firstName || ''} ${s.group.teacher?.lastName || ''}`.trim(),
        classroom: s.group.classroom?.name || '—',
        enrolled: s.group._count.enrollments,
      })),
      finance: {
        receiptsToday,
        sessionsToday: {
          cash: sessionsCash,
          electronic: sessionsElectronic,
          total: sessionsCash + sessionsElectronic,
          count: sessionEntriesToday.length,
          centerCut: sessionsCenter,
          checkedIn: sessionsCheckedIn,
        },
        extraToday: {
          codes: n(extraCodesToday._sum.centerShare),
          codesCount: extraCodesToday._count,
          handouts: n(extraHandoutsToday._sum.centerShare),
          handoutsCount: extraHandoutsToday._count,
          rentals: n(extraRentalsToday._sum.amount),
          rentalsCount: extraRentalsToday._count,
          total: extraToday,
        },
        extraMonth,
        mixToday: financeMixToday,
        intakeToday: financeMixTotal,
        expensesToday: n(expensesTodayAgg._sum.amount),
        expensesCount: expensesTodayAgg._count,
        dayClosed: !!dayClose,
        closeDiff: dayClose ? n(dayClose.difference) : null,
        bookings: {
          pending: bookingsPending,
          paidToday: n(bookingsPaidToday._sum.totalAmount),
          paidTodayCount: bookingsPaidToday._count,
        },
        onlineWallet,
      },
      ops: {
        openCount: openSessions.length,
        closedToday: closedSessionsToday,
        pendingPay: pendingSessionEntries,
        unpaidTeachers: unpaidTeacherSessions,
        entriesToday: sessionEntriesToday.length,
        checkedInToday: sessionsCheckedIn,
        amountToday: sessionsCash + sessionsElectronic,
        centerCutToday: sessionsCenter,
        teacherCutToday:
          sessionsCash + sessionsElectronic - sessionsCenter,
        cashToday: sessionsCash,
        electronicToday: sessionsElectronic,
        openSessions: openSessions.map((s) => ({
          id: s.id,
          title: s.title,
          teacher: `${s.teacher.firstName} ${s.teacher.lastName === '-' ? '' : s.teacher.lastName}`.trim(),
          subject: s.subject?.nameAr || 'حصة',
          fee: n(s.feeAmount),
          entries: s._count.entries,
        })),
        topTeachers: Array.from(teacherMap.values())
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 8),
      },
    };
  }
}
