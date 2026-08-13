import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

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

  listPayments() {
    return this.prisma.payment.findMany({
      include: { student: true, invoice: true },
      orderBy: { paidAt: 'desc' },
      take: 200,
    });
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
}
