import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const today = new Date();
    const day = today.getDay();
    const start = startOfDay(today);
    const end = endOfDay(today);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const trendFrom = startOfDay(addDays(today, -13)); // 14 days incl today

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
      const key = dayKey(addDays(trendFrom, i));
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
      const key = dayKey(p.paidAt);
      if (collectionByDay.has(key)) {
        collectionByDay.set(key, (collectionByDay.get(key) || 0) + Number(p.amount));
      }
    }

    for (const r of attendanceTrendRows) {
      const key = dayKey(r.markedAt);
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
      },
      collectionTrend,
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
    };
  }
}
