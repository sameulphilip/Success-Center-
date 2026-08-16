import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentStatus, PayoutStatus } from '@prisma/client';
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

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** KPIs aligned with dashboard collection / outstanding math. */
  async summary() {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      paymentsTodayAgg,
      paymentsMonthAgg,
      paymentsAllAgg,
      outstandingInvoices,
      invoiceCount,
      paymentCount,
    ] = await Promise.all([
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
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.invoice.findMany({
        where: {
          status: {
            in: [
              PaymentStatus.PENDING,
              PaymentStatus.PARTIAL,
              PaymentStatus.OVERDUE,
            ],
          },
        },
        select: {
          studentId: true,
          feeAmount: true,
          discount: true,
          extras: true,
          paidAmount: true,
        },
      }),
      this.prisma.invoice.count(),
      this.prisma.payment.count(),
    ]);

    const outstandingAmount = outstandingInvoices.reduce((sum, inv) => {
      const due =
        Number(inv.feeAmount) -
        Number(inv.discount) +
        Number(inv.extras) -
        Number(inv.paidAmount);
      return sum + Math.max(due, 0);
    }, 0);

    return {
      collectedToday: Number(paymentsTodayAgg._sum.amount || 0),
      collectedMonth: Number(paymentsMonthAgg._sum.amount || 0),
      collectedAll: Number(paymentsAllAgg._sum.amount || 0),
      paymentsTodayCount: paymentsTodayAgg._count,
      paymentsMonthCount: paymentsMonthAgg._count,
      paymentCount,
      invoiceCount,
      outstandingAmount,
      outstandingStudents: new Set(outstandingInvoices.map((i) => i.studentId))
        .size,
    };
  }

  listInvoices(status?: PaymentStatus) {
    return this.prisma.invoice.findMany({
      where: status ? { status } : undefined,
      include: {
        student: true,
        group: { include: { subject: true } },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  outstanding() {
    return this.prisma.invoice.findMany({
      where: { status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.OVERDUE] } },
      include: { student: true, group: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async recordPayment(data: {
    studentId: string;
    invoiceId?: string;
    amount: number;
    discount?: number;
    extras?: number;
    method?: string;
    note?: string;
  }) {
    const receiptNumber = `R-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return this.prisma.$transaction(async (tx) => {
      let invoiceId = data.invoiceId;
      if (invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new NotFoundException('Invoice not found');

        const discount = data.discount ?? Number(invoice.discount);
        const extras = data.extras ?? Number(invoice.extras);
        const paidAmount = Number(invoice.paidAmount) + data.amount;
        const totalDue = Number(invoice.feeAmount) - discount + extras;
        let status: PaymentStatus = PaymentStatus.PARTIAL;
        if (paidAmount <= 0) status = PaymentStatus.PENDING;
        else if (paidAmount >= totalDue) status = PaymentStatus.PAID;
        else status = PaymentStatus.PARTIAL;

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            discount,
            extras,
            paidAmount,
            status,
          },
        });
      }

      return tx.payment.create({
        data: {
          studentId: data.studentId,
          invoiceId,
          amount: data.amount,
          method: data.method ?? 'CASH',
          receiptNumber,
          note: data.note,
        },
        include: { student: true, invoice: true },
      });
    });
  }

  /**
   * Unified receipts ledger with Arabic reason labels
   * (booking forms, class attendance, general collection).
   */
  async listPayments() {
    const [payments, sessions] = await Promise.all([
      this.prisma.payment.findMany({
        include: {
          student: true,
          invoice: { include: { group: { include: { subject: true } } } },
        },
        orderBy: { paidAt: 'desc' },
        take: 2000,
      }),
      this.prisma.sessionEntry.findMany({
        where: { payStatus: 'CONFIRMED' },
        include: {
          student: true,
          session: {
            include: {
              teacher: true,
              subject: true,
            },
          },
        },
        orderBy: { confirmedAt: 'desc' },
        take: 1000,
      }),
    ]);

    const bkReceipts = payments
      .map((p) => p.receiptNumber)
      .filter((r) => r.startsWith('BK-'));
    const bookings = bkReceipts.length
      ? await this.prisma.bookingSubmission.findMany({
          where: { receiptNumber: { in: bkReceipts } },
          select: {
            receiptNumber: true,
            form: { select: { title: true, gradeLabel: true, slug: true } },
          },
        })
      : [];
    const bookingByReceipt = new Map(
      bookings
        .filter((b) => b.receiptNumber)
        .map((b) => [b.receiptNumber as string, b]),
    );

    const paymentRows = payments.map((p) => {
      const booking = bookingByReceipt.get(p.receiptNumber);
      const { reason, reasonDetail } = this.describePaymentReason(
        p,
        booking?.form,
      );
      return {
        id: p.id,
        source: 'PAYMENT' as const,
        student: p.student,
        receiptNumber: p.receiptNumber,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt,
        note: p.note,
        reason,
        reasonDetail,
      };
    });

    const sessionRows = sessions.map((e) => {
      const teacherName = e.session.teacher
        ? `${e.session.teacher.firstName} ${
            e.session.teacher.lastName === '-'
              ? ''
              : e.session.teacher.lastName
          }`.trim()
        : '';
      const subject =
        e.session.subject?.nameAr ||
        e.session.subject?.nameEn ||
        e.session.title ||
        'حصة';
      const detail = [subject, teacherName].filter(Boolean).join(' · ');
      return {
        id: e.id,
        source: 'SESSION' as const,
        student: e.student,
        receiptNumber: e.receiptNumber,
        amount: e.amount,
        method: e.method,
        paidAt: e.confirmedAt || e.createdAt,
        note: e.note,
        reason: 'حضور حصة',
        reasonDetail: detail || e.note || '—',
      };
    });

    return [...paymentRows, ...sessionRows]
      .sort(
        (a, b) =>
          new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
      );
  }

  private describePaymentReason(
    p: {
      receiptNumber: string;
      note: string | null;
      invoice?: {
        note: string | null;
        group?: {
          name: string;
          subject?: { nameAr: string; nameEn: string } | null;
        } | null;
      } | null;
    },
    form?: { title: string; gradeLabel: string; slug: string } | null,
  ): { reason: string; reasonDetail: string } {
    const receipt = p.receiptNumber || '';
    const invNote = p.invoice?.note || '';
    const note = p.note || '';
    const blob = `${receipt} ${invNote} ${note}`.toLowerCase();

    if (form || receipt.startsWith('BK-') || blob.includes('حجز')) {
      const detail = form
        ? `${form.title}${form.gradeLabel ? ` · ${form.gradeLabel}` : ''}`
        : invNote
            .replace(/^استمارة حجز\s*·\s*/i, '')
            .replace(/^حجز استمارة\s*/i, '')
            .replace(/\s*·\s*كاش\s*$/i, '')
            .trim() ||
          note ||
          'استمارة';
      return { reason: 'استمارة حجز', reasonDetail: detail };
    }

    if (p.invoice?.group) {
      const subject =
        p.invoice.group.subject?.nameAr ||
        p.invoice.group.subject?.nameEn ||
        '';
      return {
        reason: 'اشتراك مجموعة',
        reasonDetail: [p.invoice.group.name, subject]
          .filter(Boolean)
          .join(' · '),
      };
    }

    if (receipt.startsWith('ON-') || blob.includes('online')) {
      return { reason: 'كود أونلاين', reasonDetail: note || invNote || '—' };
    }
    if (receipt.startsWith('HN-') || blob.includes('مذكرة')) {
      return { reason: 'مذكرة / ملزمة', reasonDetail: note || invNote || '—' };
    }
    if (receipt.startsWith('RM-') || blob.includes('قاعة')) {
      return { reason: 'إيجار قاعة', reasonDetail: note || invNote || '—' };
    }

    return {
      reason: 'تحصيل',
      reasonDetail: note || invNote || 'تحصيل عام',
    };
  }

  async computeTeacherPayout(
    teacherId: string,
    periodStart: string,
    periodEnd: string,
    deductions = 0,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const sessionsCount = await this.prisma.attendanceRecord.count({
      where: {
        teacherId,
        status: 'PRESENT',
        markedAt: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd),
        },
      },
    });

    const rate = Number(teacher.hourlyRate);
    const grossAmount = sessionsCount * rate;

    return this.prisma.teacherPayout.create({
      data: {
        teacherId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        sessionsCount,
        rate,
        grossAmount,
        deductions,
        status: PayoutStatus.PENDING,
      },
      include: { teacher: true },
    });
  }

  async computeTeacherPayoutFromProfit(
    teacherId: string,
    periodStart: string,
    periodEnd: string,
    deductions = 0,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const fromDate = new Date(periodStart);
    const toDate = new Date(periodEnd);
    toDate.setHours(23, 59, 59, 999);
    const paid = { payStatus: 'CONFIRMED' as const };

    const [sessions, onlineSales, handoutSales] = await Promise.all([
      this.prisma.classSession.findMany({
        where: {
          teacherId,
          status: 'CLOSED',
          OR: [
            { closedAt: { gte: fromDate, lte: toDate } },
            { closedAt: null, sessionDate: { gte: fromDate, lte: toDate } },
          ],
        },
        include: {
          entries: { where: paid },
        },
      }),
      this.prisma.onlineCodeSale.findMany({
        where: {
          ...paid,
          offer: { teacherId },
          OR: [
            { confirmedAt: { gte: fromDate, lte: toDate } },
            {
              confirmedAt: null,
              createdAt: { gte: fromDate, lte: toDate },
            },
          ],
        },
      }),
      this.prisma.handoutSale.findMany({
        where: {
          ...paid,
          product: { teacherId },
          OR: [
            { confirmedAt: { gte: fromDate, lte: toDate } },
            {
              confirmedAt: null,
              createdAt: { gte: fromDate, lte: toDate },
            },
          ],
        },
      }),
    ]);

    let teacherShare = 0;
    let sessionsCount = 0;

    for (const s of sessions) {
      const entryGross = s.entries.reduce(
        (sum, e) => sum + Number(e.amount) - Number(e.refundedAmount),
        0,
      );
      const share = Number(
        s.settledTeacherAmount ??
          (entryGross * Number(s.teacherPercent)) / 100,
      );
      teacherShare += share;
      sessionsCount += 1;
    }
    for (const sale of onlineSales) {
      teacherShare += Number(sale.teacherShare);
      sessionsCount += 1;
    }
    for (const sale of handoutSales) {
      teacherShare += Number(sale.teacherShare);
      sessionsCount += 1;
    }

    teacherShare = Math.round(teacherShare * 100) / 100;
    if (teacherShare <= 0) {
      throw new BadRequestException(
        'لا توجد حصة ربحية للمدرس في الفترة المحددة',
      );
    }

    return this.prisma.teacherPayout.create({
      data: {
        teacherId,
        periodStart: fromDate,
        periodEnd: toDate,
        sessionsCount,
        rate: 0,
        grossAmount: teacherShare,
        deductions,
        status: PayoutStatus.PENDING,
      },
      include: { teacher: true },
    });
  }

  async payTeacherPayout(id: string, amount: number) {
    const payout = await this.prisma.teacherPayout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    const paidAmount = Number(payout.paidAmount) + amount;
    const net = Number(payout.grossAmount) - Number(payout.deductions);
    const status =
      paidAmount >= net ? PayoutStatus.PAID : PayoutStatus.PARTIAL;
    return this.prisma.teacherPayout.update({
      where: { id },
      data: { paidAmount, status },
      include: { teacher: true },
    });
  }

  listPayouts() {
    return this.prisma.teacherPayout.findMany({
      include: { teacher: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin-only: remove a ledger receipt (payment or session entry). */
  async deleteReceipt(id: string, source: 'PAYMENT' | 'SESSION') {
    if (source === 'SESSION') {
      const entry = await this.prisma.sessionEntry.findUnique({
        where: { id },
      });
      if (!entry) throw new NotFoundException('إيصال الحصة غير موجود');
      await this.prisma.sessionEntry.delete({ where: { id } });
      return { ok: true, deletedId: id, source };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { invoice: true },
    });
    if (!payment) throw new NotFoundException('الإيصال غير موجود');

    await this.prisma.$transaction(async (tx) => {
      if (payment.invoiceId && payment.invoice) {
        const invoice = payment.invoice;
        const paidAmount = Math.max(
          0,
          Number(invoice.paidAmount) - Number(payment.amount),
        );
        const totalDue =
          Number(invoice.feeAmount) -
          Number(invoice.discount) +
          Number(invoice.extras);
        let status: PaymentStatus = PaymentStatus.PENDING;
        if (paidAmount <= 0) status = PaymentStatus.PENDING;
        else if (paidAmount >= totalDue) status = PaymentStatus.PAID;
        else status = PaymentStatus.PARTIAL;

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: { paidAmount, status },
        });
      }

      if (payment.receiptNumber?.startsWith('BK-')) {
        await tx.bookingSubmission.updateMany({
          where: { receiptNumber: payment.receiptNumber },
          data: {
            receiptNumber: null,
            paidAt: null,
            paymentMethod: null,
            vodafoneTxn: null,
            status: BookingStatus.SUBMITTED,
          },
        });
      }

      await tx.payment.delete({ where: { id } });
    });

    return { ok: true, deletedId: id, source: 'PAYMENT' as const };
  }
}
