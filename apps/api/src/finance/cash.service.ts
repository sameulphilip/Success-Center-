import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashExpenseFrom, Prisma, SessionPayStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const EXPENSE_CATEGORIES = [
  'كهربا',
  'مية',
  'إيجار',
  'صيانة',
  'مستلزمات',
  'نظافة',
  'مشروبات',
  'انتقالات',
  'حصة مدرس',
  'أخرى',
] as const;

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

function money(n: Prisma.Decimal | number | null | undefined) {
  return Number(n || 0);
}

function isVodafone(method?: string | null) {
  const m = String(method || 'CASH')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return m.includes('VODAFONE');
}

type MoneyRow = { amount: unknown; method?: string | null };

function splitMoney(rows: MoneyRow[]) {
  let cash = 0;
  let vodafone = 0;
  for (const row of rows) {
    const amt = money(row.amount as Prisma.Decimal);
    if (isVodafone(row.method)) vodafone += amt;
    else cash += amt;
  }
  return { cash, vodafone, total: cash + vodafone };
}

function bucket(key: string, label: string, rows: MoneyRow[]) {
  return { key, label, ...splitMoney(rows) };
}

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  private async dayCollections(ymd: string) {
    const { start, end } = cairoBounds(ymd);
    const range = { gte: start, lte: end };
    const confirmed = SessionPayStatus.CONFIRMED;

    const [payments, sessions, online, handouts, rentals] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paidAt: range },
        select: {
          amount: true,
          method: true,
          receiptNumber: true,
          note: true,
          invoice: { select: { note: true, groupId: true } },
        },
      }),
      this.prisma.sessionEntry.findMany({
        where: { payStatus: confirmed, confirmedAt: range },
        select: { amount: true, method: true },
      }),
      this.prisma.onlineCodeSale.findMany({
        where: { payStatus: confirmed, confirmedAt: range },
        select: { amount: true, method: true },
      }),
      this.prisma.handoutSale.findMany({
        where: { payStatus: confirmed, confirmedAt: range },
        select: { amount: true, method: true },
      }),
      this.prisma.roomRental.findMany({
        where: { payStatus: confirmed, confirmedAt: range },
        select: { amount: true, method: true },
      }),
    ]);

    const bookings: MoneyRow[] = [];
    const subscriptions: MoneyRow[] = [];
    const otherReceipts: MoneyRow[] = [];
    for (const p of payments) {
      const blob = `${p.receiptNumber || ''} ${p.note || ''} ${p.invoice?.note || ''}`.toLowerCase();
      if (
        (p.receiptNumber || '').startsWith('BK-') ||
        blob.includes('حجز')
      ) {
        bookings.push(p);
      } else if (p.invoice?.groupId) {
        subscriptions.push(p);
      } else {
        otherReceipts.push(p);
      }
    }

    const totals = splitMoney([
      ...payments,
      ...sessions,
      ...online,
      ...handouts,
      ...rentals,
    ]);
    const breakdown = [
      bucket('booking', 'استمارات حجز', bookings),
      bucket('groups', 'اشتراكات مجموعات', subscriptions),
      bucket('receipts', 'إيصالات أخرى', otherReceipts),
      bucket('sessions', 'حصص اليوم', sessions),
      bucket('online', 'أكواد أونلاين', online),
      bucket('handouts', 'مذكرات', handouts),
      bucket('rentals', 'تأجير قاعات', rentals),
    ].filter((b) => b.total > 0);

    return { ...totals, breakdown };
  }

  private async balances() {
    const [closes, safeExp, ownerExp, handovers] = await Promise.all([
      this.prisma.cashDayClose.aggregate({ _sum: { transferredToSafe: true } }),
      this.prisma.cashExpense.aggregate({
        where: { paidFrom: CashExpenseFrom.SAFE },
        _sum: { amount: true },
      }),
      this.prisma.cashExpense.aggregate({
        where: { paidFrom: CashExpenseFrom.OWNER },
        _sum: { amount: true },
      }),
      this.prisma.cashHandover.aggregate({ _sum: { amount: true } }),
    ]);
    const intoSafe = money(closes._sum.transferredToSafe);
    const outSafeExp = money(safeExp._sum.amount);
    const handed = money(handovers._sum.amount);
    const ownerSpent = money(ownerExp._sum.amount);
    return {
      safeBalance: intoSafe - outSafeExp - handed,
      ownerBalance: handed - ownerSpent,
      totalHandedToOwner: handed,
      ownerSpent,
    };
  }

  async snapshot(ymd = cairoYmd(), viewer?: { userId: string; role?: string }) {
    const isReception = viewer?.role === 'RECEPTION';
    const expenseWhere: Prisma.CashExpenseWhereInput = isReception
      ? {
          createdByUserId: viewer!.userId,
          paidFrom: { in: [CashExpenseFrom.DRAWER, CashExpenseFrom.SAFE] },
        }
      : {};
    const businessDate = dateOnly(ymd);
    const drawerTodayWhere: Prisma.CashExpenseWhereInput = {
      paidFrom: CashExpenseFrom.DRAWER,
      businessDate,
    };
    const [collected, drawerExpAgg, drawerToday, close, balances, expenses, handovers, closes] =
      await Promise.all([
        this.dayCollections(ymd),
        this.prisma.cashExpense.aggregate({
          where: drawerTodayWhere,
          _sum: { amount: true },
        }),
        this.prisma.cashExpense.findMany({
          where: drawerTodayWhere,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.cashDayClose.findUnique({ where: { businessDate } }),
        this.balances(),
        this.prisma.cashExpense.findMany({
          where: expenseWhere,
          orderBy: { createdAt: 'desc' },
          take: 80,
        }),
        this.prisma.cashHandover.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.cashDayClose.findMany({
          orderBy: { businessDate: 'desc' },
          take: 14,
        }),
      ]);

    const drawerExpenses = money(drawerExpAgg._sum.amount);
    const expectedInDrawer = Math.max(0, collected.total - drawerExpenses);
    const userIds = [
      ...expenses.map((e) => e.createdByUserId),
      ...handovers.map((h) => h.createdByUserId),
      ...closes.map((c) => c.closedByUserId),
      close?.closedByUserId,
    ].filter(Boolean) as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: [...new Set(userIds)] } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      businessDate: ymd,
      closed: !!close,
      close: close
        ? {
            ...close,
            closedByName: close.closedByUserId
              ? names.get(close.closedByUserId) || null
              : null,
          }
        : null,
      collectedCash: collected.cash,
      collectedVodafone: collected.vodafone,
      collectedTotal: collected.total,
      collectedBreakdown: collected.breakdown,
      drawerExpenses,
      drawerExpenseLines: drawerToday.map((e) => ({
        id: e.id,
        amount: money(e.amount),
        category: e.category,
        note: e.note,
      })),
      expectedInDrawer,
      ...balances,
      ownerBalance: isReception ? undefined : balances.ownerBalance,
      ownerSpent: isReception ? undefined : balances.ownerSpent,
      totalHandedToOwner: isReception
        ? undefined
        : balances.totalHandedToOwner,
      viewerScope: isReception ? 'reception' : 'owner',
      canOwnerExpense: !isReception,
      categories: EXPENSE_CATEGORIES,
      expenses: expenses.map((e) => ({
        ...e,
        createdByName: e.createdByUserId
          ? names.get(e.createdByUserId) || null
          : null,
      })),
      handovers: handovers.map((h) => ({
        ...h,
        createdByName: h.createdByUserId
          ? names.get(h.createdByUserId) || null
          : null,
      })),
      closes: closes.map((c) => ({
        ...c,
        closedByName: c.closedByUserId
          ? names.get(c.closedByUserId) || null
          : null,
      })),
    };
  }

  async addExpense(
    userId: string,
    body: {
      amount: number;
      category: string;
      paidFrom: CashExpenseFrom | string;
      note?: string;
    },
    role?: string,
  ) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('المبلغ غير صالح');
    }
    const paidFrom = String(body.paidFrom || '').toUpperCase() as CashExpenseFrom;
    if (!Object.values(CashExpenseFrom).includes(paidFrom)) {
      throw new BadRequestException('مصدر الصرف غير صالح');
    }
    if (role === 'RECEPTION' && paidFrom === CashExpenseFrom.OWNER) {
      throw new BadRequestException(
        'مصروف صاحب السنتر بعد التسليم يسجّله المدير فقط',
      );
    }
    if (role === 'RECEPTION' && paidFrom !== CashExpenseFrom.DRAWER && paidFrom !== CashExpenseFrom.SAFE) {
      throw new BadRequestException('الاستقبال يصرف من الدرج أو الخزنة فقط');
    }
    const category = (body.category || 'أخرى').trim() || 'أخرى';
    const ymd = cairoYmd();
    const businessDate = dateOnly(ymd);
    const balances = await this.balances();

    if (paidFrom === CashExpenseFrom.DRAWER) {
      const existing = await this.prisma.cashDayClose.findUnique({
        where: { businessDate },
      });
      if (existing) {
        throw new BadRequestException(
          role === 'RECEPTION'
            ? 'اليوم مقفول. سجّل المصروف من الخزنة.'
            : 'اليوم مقفول. سجّل المصروف من الخزنة أو من فلوس صاحب السنتر.',
        );
      }
      const collected = await this.dayCollections(ymd);
      const drawerExp = await this.prisma.cashExpense.aggregate({
        where: { paidFrom: CashExpenseFrom.DRAWER, businessDate },
        _sum: { amount: true },
      });
      const left = collected.total - money(drawerExp._sum.amount);
      if (amount > left + 0.009) {
        throw new BadRequestException(
          `مفيش كفاية في الدرج. المتاح ${Math.round(left)} ج.م`,
        );
      }
    }

    if (paidFrom === CashExpenseFrom.SAFE && amount > balances.safeBalance + 0.009) {
      throw new BadRequestException(
        `رصيد الخزنة غير كافٍ. المتاح ${Math.round(balances.safeBalance)} ج.م`,
      );
    }

    if (paidFrom === CashExpenseFrom.OWNER && amount > balances.ownerBalance + 0.009) {
      throw new BadRequestException(
        `رصيد صاحب السنتر غير كافٍ. المتاح ${Math.round(balances.ownerBalance)} ج.م`,
      );
    }

    return this.prisma.cashExpense.create({
      data: {
        amount,
        category,
        paidFrom,
        note: body.note?.trim() || null,
        businessDate,
        createdByUserId: userId,
      },
    });
  }

  /** Pay a teacher's session share from the drawer (center share stays in till). */
  async payFromDrawer(
    userId: string,
    body: { amount: number; category: string; note?: string },
  ) {
    return this.addExpense(
      userId,
      {
        amount: body.amount,
        category: body.category,
        paidFrom: CashExpenseFrom.DRAWER,
        note: body.note,
      },
      'CENTER_MANAGER',
    );
  }

  async deleteExpense(id: string) {
    const expense = await this.prisma.cashExpense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    await this.prisma.cashExpense.delete({ where: { id } });
    return { ok: true, deletedId: id };
  }

  async closeDay(
    userId: string,
    body: { countedAmount: number; note?: string },
  ) {
    const ymd = cairoYmd();
    const businessDate = dateOnly(ymd);
    const existing = await this.prisma.cashDayClose.findUnique({
      where: { businessDate },
    });
    if (existing) {
      throw new BadRequestException('اليوم مقفول بالفعل');
    }
    const counted = Number(body.countedAmount);
    if (!Number.isFinite(counted) || counted < 0) {
      throw new BadRequestException('مبلغ العدّ غير صالح');
    }

    const collected = await this.dayCollections(ymd);
    const drawerExp = await this.prisma.cashExpense.aggregate({
      where: { paidFrom: CashExpenseFrom.DRAWER, businessDate },
      _sum: { amount: true },
    });
    const drawerExpenses = money(drawerExp._sum.amount);
    const expectedAmount = collected.total - drawerExpenses;
    if (expectedAmount < -0.009) {
      throw new BadRequestException('مصروفات الدرج أكبر من التحصيل');
    }
    const difference = counted - expectedAmount;

    return this.prisma.cashDayClose.create({
      data: {
        businessDate,
        cashCollected: collected.cash,
        vodafoneCollected: collected.vodafone,
        drawerExpenses,
        expectedAmount,
        countedAmount: counted,
        difference,
        transferredToSafe: counted,
        note: body.note?.trim() || null,
        closedByUserId: userId,
      },
    });
  }

  async handover(userId: string, body: { amount: number; note?: string }) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('المبلغ غير صالح');
    }
    const { safeBalance } = await this.balances();
    if (amount > safeBalance + 0.009) {
      throw new BadRequestException(
        `رصيد الخزنة غير كافٍ. المتاح ${Math.round(safeBalance)} ج.م`,
      );
    }
    return this.prisma.cashHandover.create({
      data: {
        amount,
        note: body.note?.trim() || null,
        createdByUserId: userId,
      },
    });
  }
}
