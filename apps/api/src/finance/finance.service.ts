import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, ExtraRevenueCashTo, PaymentStatus, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { splitSessionFromEntries } from '../ops/session-split';
import { CashService } from './cash.service';

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

function money(v: unknown) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashService,
  ) {}

  /** KPIs: receipts ledger (Cairo) + drawer total for the same day. */
  async summary() {
    const ymd = cairoYmd();
    const { start, end } = cairoBounds(ymd);
    const monthStart = cairoBounds(`${ymd.slice(0, 7)}-01`).start;

    const confirmed = { payStatus: 'CONFIRMED' as const };
    const [
      paymentsTodayAgg,
      paymentsMonthAgg,
      paymentsAllAgg,
      sessionsTodayAgg,
      sessionsMonthAgg,
      sessionsAllAgg,
      onlineMonthAgg,
      onlineAllAgg,
      handoutMonthAgg,
      handoutAllAgg,
      rentalMonthAgg,
      rentalAllAgg,
      outstandingInvoices,
      invoiceCount,
      paymentCount,
      drawer,
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
      this.prisma.sessionEntry.aggregate({
        where: {
          ...confirmed,
          confirmedAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.sessionEntry.aggregate({
        where: {
          ...confirmed,
          confirmedAt: { gte: monthStart, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.sessionEntry.aggregate({
        where: confirmed,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.onlineCodeSale.aggregate({
        where: {
          ...confirmed,
          confirmedAt: { gte: monthStart, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.onlineCodeSale.aggregate({
        where: confirmed,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.handoutSale.aggregate({
        where: {
          ...confirmed,
          confirmedAt: { gte: monthStart, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.handoutSale.aggregate({
        where: confirmed,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.roomRental.aggregate({
        where: {
          ...confirmed,
          confirmedAt: { gte: monthStart, lte: end },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.roomRental.aggregate({
        where: confirmed,
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
      this.cash.collectionsForDay(ymd),
    ]);

    const outstandingAmount = outstandingInvoices.reduce((sum, inv) => {
      const due =
        Number(inv.feeAmount) -
        Number(inv.discount) +
        Number(inv.extras) -
        Number(inv.paidAmount);
      return sum + Math.max(due, 0);
    }, 0);

    const extrasMonth =
      Number(onlineMonthAgg._sum.amount || 0) +
      Number(handoutMonthAgg._sum.amount || 0) +
      Number(rentalMonthAgg._sum.amount || 0);
    const extrasAll =
      Number(onlineAllAgg._sum.amount || 0) +
      Number(handoutAllAgg._sum.amount || 0) +
      Number(rentalAllAgg._sum.amount || 0);
    const extrasCountAll =
      onlineAllAgg._count + handoutAllAgg._count + rentalAllAgg._count;
    const extrasCountMonth =
      onlineMonthAgg._count +
      handoutMonthAgg._count +
      rentalMonthAgg._count;

    return {
      collectedToday: drawer.total,
      drawerCollectedToday: drawer.total,
      collectedMonth:
        Number(paymentsMonthAgg._sum.amount || 0) +
        Number(sessionsMonthAgg._sum.amount || 0) +
        extrasMonth,
      collectedAll:
        Number(paymentsAllAgg._sum.amount || 0) +
        Number(sessionsAllAgg._sum.amount || 0) +
        extrasAll,
      paymentsTodayCount: paymentsTodayAgg._count + sessionsTodayAgg._count,
      paymentsMonthCount:
        paymentsMonthAgg._count + sessionsMonthAgg._count + extrasCountMonth,
      paymentCount:
        paymentCount + sessionsAllAgg._count + extrasCountAll,
      invoiceCount,
      outstandingAmount,
      outstandingStudents: new Set(outstandingInvoices.map((i) => i.studentId))
        .size,
    };
  }

  /**
   * Breakdown of «إجمالي المتحصل»
   * (= payments + sessions + online codes + handouts + room rentals)
   * with estimated center share per bucket.
   */
  async collectedAllBreakdown() {
    const confirmed = { payStatus: 'CONFIRMED' as const };

    const [
      payments,
      sessions,
      sessionsAgg,
      onlineAgg,
      onlineCenterAgg,
      handoutAgg,
      handoutCenterAgg,
      rentalAgg,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        select: {
          amount: true,
          receiptNumber: true,
          note: true,
          invoice: { select: { note: true, groupId: true } },
        },
      }),
      this.prisma.classSession.findMany({
        where: { entries: { some: confirmed } },
        select: {
          feeAmount: true,
          centerAmount: true,
          teacherPercent: true,
          settledTeacherAmount: true,
          settledCenterAmount: true,
          entries: {
            where: confirmed,
            select: {
              amount: true,
              refundedAmount: true,
              centerKeepsAll: true,
            },
          },
        },
      }),
      this.prisma.sessionEntry.aggregate({
        where: confirmed,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.onlineCodeSale.aggregate({
        where: confirmed,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.onlineCodeSale.aggregate({
        where: confirmed,
        _sum: { centerShare: true },
      }),
      this.prisma.handoutSale.aggregate({
        where: confirmed,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.handoutSale.aggregate({
        where: confirmed,
        _sum: { centerShare: true },
      }),
      this.prisma.roomRental.aggregate({
        where: confirmed,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const isBookingPay = (p: {
      receiptNumber?: string | null;
      note?: string | null;
      invoice?: { note?: string | null } | null;
    }) => {
      const blob = `${p.receiptNumber || ''} ${p.note || ''} ${p.invoice?.note || ''}`.toLowerCase();
      return (p.receiptNumber || '').startsWith('BK-') || blob.includes('حجز');
    };

    let bookingGross = 0;
    let bookingCount = 0;
    let groupsGross = 0;
    let groupsCount = 0;
    let otherGross = 0;
    let otherCount = 0;
    for (const p of payments) {
      const amt = money(p.amount);
      if (isBookingPay(p)) {
        bookingGross += amt;
        bookingCount += 1;
      } else if (p.invoice?.groupId) {
        groupsGross += amt;
        groupsCount += 1;
      } else {
        otherGross += amt;
        otherCount += 1;
      }
    }

    const sessionsGross = money(sessionsAgg._sum.amount);
    const sessionsCount = sessionsAgg._count;

    let sessionsCenter = 0;
    for (const s of sessions) {
      const split = splitSessionFromEntries({
        entries: s.entries,
        feeAmount: s.feeAmount,
        centerAmount: s.centerAmount,
        teacherPercent: s.teacherPercent,
        settledTeacherAmount: s.settledTeacherAmount,
        settledCenterAmount: s.settledCenterAmount,
      });
      sessionsCenter += money(split.centerShare);
    }

    const onlineGross = money(onlineAgg._sum.amount);
    const onlineCount = onlineAgg._count;
    const onlineCenter = money(onlineCenterAgg._sum.centerShare);

    const handoutGross = money(handoutAgg._sum.amount);
    const handoutCount = handoutAgg._count;
    const handoutCenter = money(handoutCenterAgg._sum.centerShare);

    const rentalGross = money(rentalAgg._sum.amount);
    const rentalCount = rentalAgg._count;
    /** Room rentals are center revenue (no teacher split). */
    const rentalCenter = rentalGross;

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = [
      {
        key: 'booking',
        label: 'استمارات حجز',
        amount: round(bookingGross),
        centerShare: round(bookingGross),
        centerNote: '١٠٠٪ للسنتر',
        count: bookingCount,
      },
      {
        key: 'groups',
        label: 'اشتراكات مجموعات',
        amount: round(groupsGross),
        centerShare: round(groupsGross),
        centerNote: '١٠٠٪ للسنتر',
        count: groupsCount,
      },
      {
        key: 'sessions',
        label: 'حضور حصص',
        amount: round(sessionsGross),
        centerShare: round(sessionsCenter),
        centerNote: 'نصيب السنتر بعد القسمة مع المدرس',
        count: sessionsCount,
      },
      {
        key: 'online',
        label: 'أكواد أونلاين',
        amount: round(onlineGross),
        centerShare: round(onlineCenter),
        centerNote: 'نصيب السنتر من بيع الأكواد',
        count: onlineCount,
      },
      {
        key: 'handout',
        label: 'ملازم',
        amount: round(handoutGross),
        centerShare: round(handoutCenter),
        centerNote: 'نصيب السنتر من الملازم',
        count: handoutCount,
      },
      {
        key: 'rental',
        label: 'تأجير قاعات',
        amount: round(rentalGross),
        centerShare: round(rentalCenter),
        centerNote: '١٠٠٪ للسنتر',
        count: rentalCount,
      },
      {
        key: 'other',
        label: 'إيصالات أخرى',
        amount: round(otherGross),
        centerShare: round(otherGross),
        centerNote: '١٠٠٪ للسنتر',
        count: otherCount,
      },
    ].filter((r) => r.amount > 0.009 || r.count > 0);

    return {
      total: round(
        bookingGross +
          groupsGross +
          otherGross +
          sessionsGross +
          onlineGross +
          handoutGross +
          rentalGross,
      ),
      centerTotal: round(
        bookingGross +
          groupsGross +
          otherGross +
          sessionsCenter +
          onlineCenter +
          handoutCenter +
          rentalCenter,
      ),
      rows,
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
   * Optional Cairo `from`/`to` (YYYY-MM-DD). Omit both = all receipts.
   */
  async listPayments(opts?: { from?: string; to?: string }) {
    const from = String(opts?.from || '').trim();
    const to = String(opts?.to || '').trim();
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !ymdRe.test(from)) {
      throw new BadRequestException('تاريخ البداية غير صالح');
    }
    if (to && !ymdRe.test(to)) {
      throw new BadRequestException('تاريخ النهاية غير صالح');
    }
    if (from && to && from > to) {
      throw new BadRequestException('تاريخ البداية بعد النهاية');
    }

    const paidAt =
      from || to
        ? {
            ...(from ? { gte: cairoBounds(from).start } : {}),
            ...(to ? { lte: cairoBounds(to).end } : {}),
          }
        : undefined;
    const confirmedAt = paidAt;

    const [payments, sessions, onlineSales, handoutSales, rentals] =
      await Promise.all([
      this.prisma.payment.findMany({
        where: paidAt ? { paidAt } : undefined,
        include: {
          student: true,
          invoice: { include: { group: { include: { subject: true } } } },
        },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.sessionEntry.findMany({
        where: {
          payStatus: 'CONFIRMED',
          ...(confirmedAt ? { confirmedAt } : {}),
        },
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
      }),
      this.prisma.onlineCodeSale.findMany({
        where: {
          payStatus: 'CONFIRMED',
          ...(confirmedAt ? { confirmedAt } : {}),
        },
        include: {
          student: true,
          offer: { include: { teacher: true, subject: true } },
          code: { select: { code: true } },
        },
        orderBy: { confirmedAt: 'desc' },
      }),
      this.prisma.handoutSale.findMany({
        where: {
          payStatus: 'CONFIRMED',
          ...(confirmedAt ? { confirmedAt } : {}),
        },
        include: {
          student: true,
          product: { include: { teacher: true } },
        },
        orderBy: { confirmedAt: 'desc' },
      }),
      this.prisma.roomRental.findMany({
        where: {
          payStatus: 'CONFIRMED',
          ...(confirmedAt ? { confirmedAt } : {}),
        },
        include: {
          classroom: true,
        },
        orderBy: { confirmedAt: 'desc' },
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
        student: e.student
          ? e.student
          : e.guestName
            ? {
                id: null,
                firstName: e.guestName,
                lastName: '-',
                phone: e.guestPhone,
                studentUid: null,
              }
            : null,
        receiptNumber: e.receiptNumber,
        amount: e.amount,
        method: e.method,
        paidAt: e.confirmedAt || e.createdAt,
        note: e.note,
        reason: e.student ? 'حضور حصة' : 'حضور حصة (ضيف)',
        reasonDetail: detail || e.note || '—',
      };
    });

    const onlineRows = onlineSales.map((s) => {
      const teacher = s.offer.teacher
        ? `${s.offer.teacher.firstName} ${
            s.offer.teacher.lastName === '-' ? '' : s.offer.teacher.lastName
          }`.trim()
        : '';
      const subject =
        s.offer.subject?.nameAr || s.offer.subject?.nameEn || '';
      const detail = [s.offer.title, subject, teacher, s.code?.code]
        .filter(Boolean)
        .join(' · ');
      const name =
        s.student
          ? null
          : (s.buyerName || 'مشتري كود').trim();
      return {
        id: s.id,
        source: 'ONLINE' as const,
        student: s.student
          ? s.student
          : {
              id: null,
              firstName: name || 'مشتري كود',
              lastName: '-',
              phone: s.buyerPhone,
              studentUid: null,
            },
        receiptNumber: s.receiptNumber,
        amount: s.amount,
        method: s.method,
        paidAt: s.confirmedAt || s.createdAt,
        note: s.note,
        reason: 'كود أونلاين',
        reasonDetail: detail || s.note || '—',
      };
    });

    const handoutRows = handoutSales.map((s) => {
      const teacher = s.product.teacher
        ? `${s.product.teacher.firstName} ${
            s.product.teacher.lastName === '-'
              ? ''
              : s.product.teacher.lastName
          }`.trim()
        : '';
      const qty = Number(s.qty || 1);
      const detail = [
        s.product.title,
        teacher,
        qty > 1 ? `×${qty}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        id: s.id,
        source: 'HANDOUT' as const,
        student: s.student
          ? s.student
          : {
              id: null,
              firstName: 'مشتري ملزمة',
              lastName: '-',
              phone: s.buyerPhone,
              studentUid: null,
            },
        receiptNumber: s.receiptNumber,
        amount: s.amount,
        method: s.method,
        paidAt: s.confirmedAt || s.createdAt,
        note: s.note,
        reason: 'ملزمة',
        reasonDetail: detail || s.note || '—',
      };
    });

    const rentalRows = rentals.map((r) => {
      const room = r.classroom?.name || 'قاعة';
      const title = r.title?.trim();
      const head =
        r.billingMode === 'PER_STUDENT' && r.headcount
          ? `${r.headcount} طالب`
          : '';
      const detail = [room, title, head].filter(Boolean).join(' · ');
      return {
        id: r.id,
        source: 'RENTAL' as const,
        student: {
          id: null,
          firstName: r.renterName || 'مستأجر',
          lastName: '-',
          phone: r.renterPhone,
          studentUid: null,
        },
        receiptNumber: r.receiptNumber || `RR-${r.id.slice(-8)}`,
        amount: r.amount,
        method: r.method,
        paidAt: r.confirmedAt || r.createdAt,
        note: r.notes,
        reason: 'تأجير قاعة',
        reasonDetail: detail || r.notes || '—',
      };
    });

    return [
      ...paymentRows,
      ...sessionRows,
      ...onlineRows,
      ...handoutRows,
      ...rentalRows,
    ].sort(
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
          cashTo: { notIn: [ExtraRevenueCashTo.TEACHER_HOLD, ExtraRevenueCashTo.SAFE] },
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
          cashTo: { notIn: [ExtraRevenueCashTo.TEACHER_HOLD, ExtraRevenueCashTo.SAFE] },
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
      const share = splitSessionFromEntries({
        entries: s.entries,
        feeAmount: Number(s.feeAmount),
        teacherPercent: s.teacherPercent,
        centerAmount: s.centerAmount,
        settledTeacherAmount: s.settledTeacherAmount,
        settledCenterAmount: s.settledCenterAmount,
      }).teacherShare;
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
