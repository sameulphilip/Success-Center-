import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  CashExpenseFrom,
  ExtraRevenueCashTo,
  OnlineCodeStatus,
  Prisma,
  SessionPayStatus,
} from '@prisma/client';
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

function ymdFromDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const OPEN_DAY_LOOKBACK = 21;

export type OpenDayFigures = {
  date: string;
  collectedCash: number;
  collectedVodafone: number;
  collectedTotal: number;
  drawerExpenses: number;
  expected: number;
};

function money(n: Prisma.Decimal | number | null | undefined) {
  return Number(n || 0);
}

function personName(p?: { firstName?: string | null; lastName?: string | null } | null) {
  if (!p) return '';
  return [p.firstName, p.lastName && p.lastName !== '-' ? p.lastName : '']
    .filter(Boolean)
    .join(' ')
    .trim();
}

function methodAr(method?: string | null) {
  return isVodafone(method) ? 'فودافون' : 'كاش';
}

function formatNumRanges(nums: number[], prefix = '') {
  const u = [...new Set(nums.filter((n) => Number.isFinite(n)))].sort(
    (a, b) => a - b,
  );
  if (!u.length) return '—';
  const parts: string[] = [];
  let start = u[0];
  let prev = u[0];
  const flush = () => {
    if (start === prev) parts.push(`${prefix}${start}`);
    else parts.push(`من ${prefix}${start} إلى ${prefix}${prev}`);
  };
  for (let i = 1; i < u.length; i++) {
    if (u[i] === prev + 1) {
      prev = u[i];
      continue;
    }
    flush();
    start = prev = u[i];
  }
  flush();
  return parts.join(' · ');
}

function formatStrRange(values: string[]) {
  const sorted = [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true }),
  );
  if (!sorted.length) return '—';
  if (sorted.length === 1) return sorted[0];
  return `من ${sorted[0]} إلى ${sorted[sorted.length - 1]}`;
}

function isVodafone(method?: string | null) {
  const m = String(method || 'CASH')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return m.includes('VODAFONE') || m.includes('INSTAPAY');
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

  async collectionsForDay(ymd: string) {
    const { start, end } = cairoBounds(ymd);
    const range = { gte: start, lte: end };
    const confirmed = SessionPayStatus.CONFIRMED;

    const drawerRev = {
      payStatus: confirmed,
      confirmedAt: range,
      cashTo: ExtraRevenueCashTo.DRAWER,
    };
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
        where: drawerRev,
        select: { centerShare: true, method: true },
      }),
      this.prisma.handoutSale.findMany({
        where: drawerRev,
        select: { centerShare: true, method: true },
      }),
      this.prisma.roomRental.findMany({
        where: drawerRev,
        select: { amount: true, method: true },
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

    const vodafoneBookingReceipts = payments
      .filter((p) => isBookingPay(p) && isVodafone(p.method))
      .map((p) => p.receiptNumber)
      .filter((r): r is string => !!r);

    const onlineWalletReceipts = new Set<string>();
    if (vodafoneBookingReceipts.length) {
      const onlineSubs = await this.prisma.bookingSubmission.findMany({
        where: {
          receiptNumber: { in: vodafoneBookingReceipts },
          payChannel: 'online',
        },
        select: { receiptNumber: true },
      });
      for (const s of onlineSubs) {
        if (s.receiptNumber) onlineWalletReceipts.add(s.receiptNumber);
      }
    }

    const drawerPayments = payments.filter(
      (p) =>
        !(
          isBookingPay(p) &&
          isVodafone(p.method) &&
          onlineWalletReceipts.has(p.receiptNumber || '')
        ),
    );

    const bookings: MoneyRow[] = [];
    const subscriptions: MoneyRow[] = [];
    const otherReceipts: MoneyRow[] = [];
    for (const p of drawerPayments) {
      if (isBookingPay(p)) {
        bookings.push(p);
      } else if (p.invoice?.groupId) {
        subscriptions.push(p);
      } else {
        otherReceipts.push(p);
      }
    }

    const onlineRows: MoneyRow[] = online.map((s) => ({
      amount: s.centerShare,
      method: s.method,
    }));
    const handoutRows: MoneyRow[] = handouts.map((s) => ({
      amount: s.centerShare,
      method: s.method,
    }));
    const totals = splitMoney([
      ...drawerPayments,
      ...sessions,
      ...onlineRows,
      ...handoutRows,
      ...rentals,
    ]);
    const breakdown = [
      bucket('booking', 'استمارات حجز', bookings),
      bucket('groups', 'اشتراكات مجموعات', subscriptions),
      bucket('receipts', 'إيصالات أخرى', otherReceipts),
      bucket('sessions', 'حصص اليوم', sessions),
      bucket('online', 'أكواد أونلاين', onlineRows),
      bucket('handouts', 'مذكرات', handoutRows),
      bucket('rentals', 'تأجير قاعات', rentals),
    ].filter((b) => b.total > 0);

    return { ...totals, breakdown };
  }

  private async dayCollections(ymd: string) {
    return this.collectionsForDay(ymd);
  }

  private async dayFigures(ymd: string): Promise<OpenDayFigures> {
    const collected = await this.dayCollections(ymd);
    const drawerExp = await this.prisma.cashExpense.aggregate({
      where: {
        paidFrom: CashExpenseFrom.DRAWER,
        businessDate: dateOnly(ymd),
      },
      _sum: { amount: true },
    });
    const drawerExpenses = money(drawerExp._sum.amount);
    return {
      date: ymd,
      collectedCash: collected.cash,
      collectedVodafone: collected.vodafone,
      collectedTotal: collected.total,
      drawerExpenses,
      expected: collected.total - drawerExpenses,
    };
  }

  /** Unclosed business days before today that still have drawer activity. */
  private async unclosedPrevious(today = cairoYmd()): Promise<OpenDayFigures[]> {
    const start = addDays(today, -OPEN_DAY_LOOKBACK);
    const yesterday = addDays(today, -1);
    if (yesterday < start) return [];

    const closes = await this.prisma.cashDayClose.findMany({
      where: {
        businessDate: { gte: dateOnly(start), lte: dateOnly(yesterday) },
      },
      select: { businessDate: true },
    });
    const closed = new Set(closes.map((c) => ymdFromDate(c.businessDate)));
    const candidates: string[] = [];
    for (let d = start; d <= yesterday; d = addDays(d, 1)) {
      if (!closed.has(d)) candidates.push(d);
    }
    if (!candidates.length) return [];

    const figures = await Promise.all(candidates.map((ymd) => this.dayFigures(ymd)));
    return figures.filter(
      (f) => f.collectedTotal > 0.009 || f.drawerExpenses > 0.009,
    );
  }

  private async balances() {
    const ownerRev = {
      payStatus: SessionPayStatus.CONFIRMED,
      cashTo: ExtraRevenueCashTo.OWNER,
    };
    const [closes, safeExp, ownerExp, handovers, onlineOwner, handoutOwner, rentalOwner, settledCenter, walletClaims] =
      await Promise.all([
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
        this.prisma.onlineCodeSale.aggregate({
          where: ownerRev,
          _sum: { centerShare: true },
        }),
        this.prisma.handoutSale.aggregate({
          where: ownerRev,
          _sum: { centerShare: true },
        }),
        this.prisma.roomRental.aggregate({
          where: ownerRev,
          _sum: { amount: true },
        }),
        this.prisma.extraTeacherSettlement.aggregate({
          _sum: { centerToSafe: true },
        }),
        this.prisma.onlineWalletClaim.aggregate({ _sum: { amount: true } }),
      ]);
    const intoSafe =
      money(closes._sum.transferredToSafe) + money(settledCenter._sum.centerToSafe);
    const outSafeExp = money(safeExp._sum.amount);
    const handed = money(handovers._sum.amount);
    const ownerSpent = money(ownerExp._sum.amount);
    const walletClaimed = money(walletClaims._sum.amount);
    const ownerExtraRevenue =
      money(onlineOwner._sum.centerShare) +
      money(handoutOwner._sum.centerShare) +
      money(rentalOwner._sum.amount) +
      walletClaimed;
    return {
      safeBalance: intoSafe - outSafeExp - handed,
      ownerBalance: handed - ownerSpent + ownerExtraRevenue,
      totalHandedToOwner: handed,
      ownerSpent,
      ownerExtraRevenue,
      onlineWalletClaimed: walletClaimed,
    };
  }

  private async extraRevenueSales(forReception: boolean) {
    const confirmed = SessionPayStatus.CONFIRMED;
    const where = forReception
      ? {
          payStatus: confirmed,
          cashTo: {
            in: [
              ExtraRevenueCashTo.DRAWER,
              ExtraRevenueCashTo.TEACHER_HOLD,
              ExtraRevenueCashTo.SAFE,
            ],
          },
        }
      : { payStatus: confirmed };
    const [online, handouts, rentals] = await Promise.all([
      this.prisma.onlineCodeSale.findMany({
        where,
        select: {
          id: true,
          amount: true,
          teacherShare: true,
          centerShare: true,
          method: true,
          cashTo: true,
          confirmedAt: true,
          createdAt: true,
          soldByUserId: true,
          receiptNumber: true,
          buyerName: true,
          buyerPhone: true,
          offer: {
            select: {
              title: true,
              teacher: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { confirmedAt: 'desc' },
        take: 80,
      }),
      this.prisma.handoutSale.findMany({
        where,
        select: {
          id: true,
          amount: true,
          teacherShare: true,
          centerShare: true,
          method: true,
          cashTo: true,
          confirmedAt: true,
          createdAt: true,
          soldByUserId: true,
          receiptNumber: true,
          qty: true,
          product: {
            select: {
              title: true,
              teacher: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { confirmedAt: 'desc' },
        take: 80,
      }),
      this.prisma.roomRental.findMany({
        where,
        select: {
          id: true,
          amount: true,
          method: true,
          cashTo: true,
          confirmedAt: true,
          createdAt: true,
          createdByUserId: true,
          receiptNumber: true,
          renterName: true,
          title: true,
          classroom: { select: { name: true } },
        },
        orderBy: { confirmedAt: 'desc' },
        take: 80,
      }),
    ]);

    const rows = [
      ...online.map((s) => ({
        id: s.id,
        kind: 'online' as const,
        kindLabel: 'أونلاين',
        title: s.offer.title,
        detail: [
          [s.offer.teacher.firstName, s.offer.teacher.lastName]
            .filter((p) => p && p !== '-')
            .join(' '),
          s.buyerName || s.receiptNumber,
        ]
          .filter(Boolean)
          .join(' · '),
        amount: money(s.centerShare),
        teacherShare: money(s.teacherShare),
        grossAmount: money(s.amount),
        method: s.method,
        cashTo: s.cashTo,
        at: s.confirmedAt || s.createdAt,
        soldByUserId: s.soldByUserId,
        receiptNumber: s.receiptNumber,
      })),
      ...handouts.map((s) => ({
        id: s.id,
        kind: 'handout' as const,
        kindLabel: 'مذكرة',
        title: s.product.title,
        detail: [
          [s.product.teacher?.firstName, s.product.teacher?.lastName]
            .filter((p) => p && p !== '-')
            .join(' '),
          `×${s.qty} · ${s.receiptNumber}`,
        ]
          .filter(Boolean)
          .join(' · '),
        amount: money(s.centerShare),
        teacherShare: money(s.teacherShare),
        grossAmount: money(s.amount),
        method: s.method,
        cashTo: s.cashTo,
        at: s.confirmedAt || s.createdAt,
        soldByUserId: s.soldByUserId,
        receiptNumber: s.receiptNumber,
      })),
      ...rentals.map((s) => ({
        id: s.id,
        kind: 'rental' as const,
        kindLabel: 'قاعة',
        title: s.title || s.classroom.name,
        detail: s.renterName,
        amount: money(s.amount),
        teacherShare: 0,
        grossAmount: money(s.amount),
        method: s.method,
        cashTo: s.cashTo,
        at: s.confirmedAt || s.createdAt,
        soldByUserId: s.createdByUserId,
        receiptNumber: s.receiptNumber,
      })),
    ]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 80);

    const userIds = rows.map((r) => r.soldByUserId).filter(Boolean) as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: [...new Set(userIds)] } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      kindLabel: r.kindLabel,
      title: r.title,
      detail: r.detail,
      amount: r.amount,
      teacherShare: r.teacherShare,
      grossAmount: r.grossAmount,
      method: r.method,
      cashTo: r.cashTo,
      at: r.at,
      receiptNumber: r.receiptNumber,
      soldByName: r.soldByUserId ? names.get(r.soldByUserId) || null : null,
    }));
  }

  private holdTeacherId(raw?: string | null) {
    const id = String(raw || '').trim();
    if (!id || id === 'none') return null;
    return id;
  }

  private async teacherHolds() {
    const where = {
      payStatus: SessionPayStatus.CONFIRMED,
      cashTo: ExtraRevenueCashTo.TEACHER_HOLD,
      settlementId: null,
    };
    const [online, handouts] = await Promise.all([
      this.prisma.onlineCodeSale.findMany({
        where,
        select: {
          amount: true,
          teacherShare: true,
          centerShare: true,
          offer: {
            select: {
              teacherId: true,
              teacher: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.handoutSale.findMany({
        where,
        select: {
          amount: true,
          teacherShare: true,
          centerShare: true,
          product: {
            select: {
              teacherId: true,
              teacher: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    type Hold = {
      teacherId: string;
      teacherName: string;
      onlineCount: number;
      handoutCount: number;
      gross: number;
      teacherShare: number;
      centerShare: number;
    };
    const map = new Map<string, Hold>();
    const bump = (
      teacherId: string | null,
      teacher: { firstName: string; lastName: string } | null | undefined,
      kind: 'online' | 'handout',
      row: { amount: Prisma.Decimal | number; teacherShare: Prisma.Decimal | number; centerShare: Prisma.Decimal | number },
    ) => {
      const key = teacherId || 'none';
      const curr = map.get(key) || {
        teacherId: key,
        teacherName: teacher
          ? [teacher.firstName, teacher.lastName !== '-' ? teacher.lastName : '']
              .filter(Boolean)
              .join(' ')
              .trim() || 'بدون مدرس'
          : 'بدون مدرس',
        onlineCount: 0,
        handoutCount: 0,
        gross: 0,
        teacherShare: 0,
        centerShare: 0,
      };
      if (kind === 'online') curr.onlineCount += 1;
      else curr.handoutCount += 1;
      curr.gross += money(row.amount);
      curr.teacherShare += money(row.teacherShare);
      curr.centerShare += money(row.centerShare);
      map.set(key, curr);
    };

    for (const s of online) {
      bump(s.offer.teacherId, s.offer.teacher, 'online', s);
    }
    for (const s of handouts) {
      bump(s.product.teacherId, s.product.teacher, 'handout', s);
    }

    return [...map.values()]
      .map((h) => ({
        ...h,
        gross: Math.round(h.gross * 100) / 100,
        teacherShare: Math.round(h.teacherShare * 100) / 100,
        centerShare: Math.round(h.centerShare * 100) / 100,
      }))
      .sort((a, b) => b.gross - a.gross);
  }

  private async extraSettlements() {
    const rows = await this.prisma.extraTeacherSettlement.findMany({
      include: {
        teacher: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const userIds = rows.map((r) => r.settledByUserId).filter(Boolean) as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: [...new Set(userIds)] } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({
      id: r.id,
      teacherId: r.teacherId,
      teacherName: r.teacher
        ? [r.teacher.firstName, r.teacher.lastName !== '-' ? r.teacher.lastName : '']
            .filter(Boolean)
            .join(' ')
            .trim() || 'بدون مدرس'
        : 'بدون مدرس',
      teacherPaid: money(r.teacherPaid),
      centerToSafe: money(r.centerToSafe),
      grossAmount: money(r.grossAmount),
      onlineCount: r.onlineCount,
      handoutCount: r.handoutCount,
      createdAt: r.createdAt,
      settledByName: r.settledByUserId
        ? names.get(r.settledByUserId) || null
        : null,
    }));
  }

  async settleTeacherHold(userId: string, teacherIdRaw?: string | null) {
    const teacherId = this.holdTeacherId(teacherIdRaw);
    if (teacherId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { id: true },
      });
      if (!teacher) throw new NotFoundException('المدرس غير موجود');
    }

    const holdWhere = {
      payStatus: SessionPayStatus.CONFIRMED,
      cashTo: ExtraRevenueCashTo.TEACHER_HOLD,
      settlementId: null,
    };

    return this.prisma.$transaction(async (tx) => {
      const [online, handouts] = await Promise.all([
        teacherId
          ? tx.onlineCodeSale.findMany({
              where: { ...holdWhere, offer: { teacherId } },
              select: {
                id: true,
                amount: true,
                teacherShare: true,
                centerShare: true,
              },
            })
          : Promise.resolve([] as Array<{
              id: string;
              amount: Prisma.Decimal;
              teacherShare: Prisma.Decimal;
              centerShare: Prisma.Decimal;
            }>),
        tx.handoutSale.findMany({
          where: { ...holdWhere, product: { teacherId } },
          select: {
            id: true,
            amount: true,
            teacherShare: true,
            centerShare: true,
          },
        }),
      ]);
      if (!online.length && !handouts.length) {
        throw new BadRequestException('لا يوجد حساب مفتوح لهذا المدرس');
      }

      const teacherPaid = [...online, ...handouts].reduce(
        (n, s) => n + money(s.teacherShare),
        0,
      );
      const centerToSafe = [...online, ...handouts].reduce(
        (n, s) => n + money(s.centerShare),
        0,
      );
      const grossAmount = [...online, ...handouts].reduce(
        (n, s) => n + money(s.amount),
        0,
      );

      const settlement = await tx.extraTeacherSettlement.create({
        data: {
          teacherId,
          teacherPaid: Math.round(teacherPaid * 100) / 100,
          centerToSafe: Math.round(centerToSafe * 100) / 100,
          grossAmount: Math.round(grossAmount * 100) / 100,
          onlineCount: online.length,
          handoutCount: handouts.length,
          settledByUserId: userId,
        },
      });

      if (online.length) {
        await tx.onlineCodeSale.updateMany({
          where: { id: { in: online.map((s) => s.id) } },
          data: {
            cashTo: ExtraRevenueCashTo.SAFE,
            settlementId: settlement.id,
          },
        });
      }
      if (handouts.length) {
        await tx.handoutSale.updateMany({
          where: { id: { in: handouts.map((s) => s.id) } },
          data: {
            cashTo: ExtraRevenueCashTo.SAFE,
            settlementId: settlement.id,
          },
        });
      }

      return {
        ...settlement,
        teacherPaid: money(settlement.teacherPaid),
        centerToSafe: money(settlement.centerToSafe),
        grossAmount: money(settlement.grossAmount),
      };
    }    );
  }

  private async onlineFormWallet() {
    const [confirmed, pending, claimed] = await Promise.all([
      this.prisma.bookingSubmission.aggregate({
        where: { payChannel: 'online', status: BookingStatus.PAID },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.bookingSubmission.aggregate({
        where: { payChannel: 'online', status: BookingStatus.SUBMITTED },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.onlineWalletClaim.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const confirmedAmount = money(confirmed._sum.totalAmount);
    const claimedAmount = money(claimed._sum.amount);
    return {
      confirmedAmount,
      pendingAmount: money(pending._sum.totalAmount),
      claimedAmount,
      availableAmount: Math.max(0, confirmedAmount - claimedAmount),
      confirmedCount: confirmed._count,
      pendingCount: pending._count,
      claimedCount: claimed._count,
    };
  }

  /** Paid online booking forms for a business day — not in drawer count. */
  private async onlineFormsForDay(ymd: string) {
    const { start, end } = cairoBounds(ymd);
    const subs = await this.prisma.bookingSubmission.findMany({
      where: {
        payChannel: 'online',
        status: BookingStatus.PAID,
        paidAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        formId: true,
        formSerial: true,
        totalAmount: true,
        studentName: true,
        receiptNumber: true,
        form: { select: { title: true, gradeLabel: true } },
      },
      orderBy: [{ formSerial: 'asc' }, { paidAt: 'asc' }],
    });

    type FormRow = {
      formId: string;
      label: string;
      count: number;
      amount: number;
      serials: number[];
    };
    const byForm = new Map<string, FormRow>();
    for (const s of subs) {
      const cur = byForm.get(s.formId) || {
        formId: s.formId,
        label: `${s.form.title}${s.form.gradeLabel ? ` · ${s.form.gradeLabel}` : ''}`,
        count: 0,
        amount: 0,
        serials: [] as number[],
      };
      cur.count += 1;
      cur.amount += money(s.totalAmount);
      if (s.formSerial != null) cur.serials.push(s.formSerial);
      byForm.set(s.formId, cur);
    }

    return {
      count: subs.length,
      amount: subs.reduce((n, s) => n + money(s.totalAmount), 0),
      byForm: [...byForm.values()],
      items: subs.map((s) => ({
        id: s.id,
        formSerial: s.formSerial,
        studentName: s.studentName,
        receiptNumber: s.receiptNumber,
        amount: money(s.totalAmount),
        label: `${s.form.title}${s.form.gradeLabel ? ` · ${s.form.gradeLabel}` : ''}`,
      })),
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
    const [collected, drawerExpAgg, drawerToday, close, balances, expenses, handovers, closes, unclosedPrevious, extraRevenueSales, teacherHolds, extraSettlements, onlineFormWallet, onlineFormsToday] =
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
          orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
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
        this.unclosedPrevious(ymd),
        this.extraRevenueSales(isReception),
        this.teacherHolds(),
        this.extraSettlements(),
        this.onlineFormWallet(),
        this.onlineFormsForDay(ymd),
      ]);

    const drawerExpenses = money(drawerExpAgg._sum.amount);
    const carriedForward = unclosedPrevious.reduce((s, d) => s + d.expected, 0);
    const todayExpected = close ? 0 : collected.total - drawerExpenses;
    const expectedInDrawer = Math.max(0, todayExpected + carriedForward);
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
      unclosedPrevious,
      carriedForward,
      todayExpected,
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
      ownerExtraRevenue: isReception ? undefined : balances.ownerExtraRevenue,
      extraRevenueSales,
      teacherHolds,
      teacherHoldTotal: teacherHolds.reduce((n, h) => n + h.gross, 0),
      extraSettlements,
      onlineFormWallet,
      onlineFormsToday,
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
      businessDate?: string;
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
    const today = cairoYmd();
    const ymd = String(body.businessDate || '').trim() || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      throw new BadRequestException('التاريخ غير صالح');
    }
    if (ymd > today) {
      throw new BadRequestException('لا يمكن تسجيل مصروف بتاريخ مستقبلي');
    }
    const businessDate = dateOnly(ymd);
    const balances = await this.balances();

    if (paidFrom === CashExpenseFrom.DRAWER) {
      const existing = await this.prisma.cashDayClose.findUnique({
        where: { businessDate },
      });
      if (existing) {
        throw new BadRequestException(
          role === 'RECEPTION'
            ? 'اليوم ده مقفول. سجّل المصروف من الخزنة.'
            : 'اليوم ده مقفول. سجّل المصروف من الخزنة أو من فلوس صاحب السنتر.',
        );
      }
      const [collected, drawerExp, previous] = await Promise.all([
        this.dayCollections(ymd),
        this.prisma.cashExpense.aggregate({
          where: { paidFrom: CashExpenseFrom.DRAWER, businessDate },
          _sum: { amount: true },
        }),
        this.unclosedPrevious(ymd),
      ]);
      const carried = previous.reduce((s, d) => s + d.expected, 0);
      const left = collected.total - money(drawerExp._sum.amount) + carried;
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

  async deleteExtraRevenue(kind: string, id: string) {
    const type = String(kind || '').toLowerCase();
    if (type === 'online') {
      const sale = await this.prisma.onlineCodeSale.findUnique({
        where: { id },
      });
      if (!sale) throw new NotFoundException('البيع غير موجود');
      await this.prisma.$transaction(async (tx) => {
        if (sale.settlementId) {
          const st = await tx.extraTeacherSettlement.findUnique({
            where: { id: sale.settlementId },
          });
          if (st) {
            const teacherPaid = Math.max(
              0,
              Number(st.teacherPaid) - Number(sale.teacherShare || 0),
            );
            const centerToSafe = Math.max(
              0,
              Number(st.centerToSafe) - Number(sale.centerShare || 0),
            );
            const grossAmount = Math.max(
              0,
              Number(st.grossAmount) - Number(sale.amount || 0),
            );
            const onlineCount = Math.max(0, st.onlineCount - 1);
            await tx.onlineCodeSale.delete({ where: { id } });
            if (onlineCount === 0 && st.handoutCount === 0) {
              await tx.extraTeacherSettlement.delete({ where: { id: st.id } });
            } else {
              await tx.extraTeacherSettlement.update({
                where: { id: st.id },
                data: { teacherPaid, centerToSafe, grossAmount, onlineCount },
              });
            }
          } else {
            await tx.onlineCodeSale.delete({ where: { id } });
          }
        } else {
          await tx.onlineCodeSale.delete({ where: { id } });
        }
        await tx.onlineAccessCode.update({
          where: { id: sale.codeId },
          data: { status: OnlineCodeStatus.AVAILABLE },
        });
      });
      return { ok: true, deletedId: id, kind: 'online' };
    }
    if (type === 'handout') {
      const sale = await this.prisma.handoutSale.findUnique({ where: { id } });
      if (!sale) throw new NotFoundException('البيع غير موجود');
      if (sale.settlementId) {
        throw new BadRequestException('البيع اتصفّى مع المدرس ومش هيتشال');
      }
      await this.prisma.$transaction([
        this.prisma.handoutProduct.update({
          where: { id: sale.productId },
          data: { stock: { increment: sale.qty } },
        }),
        this.prisma.handoutSale.delete({ where: { id } }),
      ]);
      return { ok: true, deletedId: id, kind: 'handout' };
    }
    if (type === 'rental') {
      const rental = await this.prisma.roomRental.findUnique({ where: { id } });
      if (!rental) throw new NotFoundException('الحجز غير موجود');
      await this.prisma.roomRental.delete({ where: { id } });
      return { ok: true, deletedId: id, kind: 'rental' };
    }
    throw new BadRequestException('نوع البيع غير صالح');
  }

  async closeDay(
    userId: string,
    body: { countedAmount: number; note?: string; businessDate?: string },
  ) {
    const today = cairoYmd();
    const raw = (body.businessDate || '').trim();
    const ymd = raw || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      throw new BadRequestException('تاريخ غير صالح');
    }
    if (ymd > today) {
      throw new BadRequestException('لا يمكن قفل يوم لسه مجاش');
    }
    const earliest = addDays(today, -OPEN_DAY_LOOKBACK);
    if (ymd < earliest) {
      throw new BadRequestException('اليوم ده قديم أوي على القفل من هنا');
    }

    const businessDate = dateOnly(ymd);
    const existing = await this.prisma.cashDayClose.findUnique({
      where: { businessDate },
    });
    if (existing) {
      throw new BadRequestException(
        ymd === today ? 'اليوم مقفول بالفعل' : 'اليوم ده مقفول بالفعل',
      );
    }
    const counted = Number(body.countedAmount);
    if (!Number.isFinite(counted) || counted < 0) {
      throw new BadRequestException('مبلغ العدّ غير صالح');
    }

    const fig = await this.dayFigures(ymd);
    if (
      ymd !== today &&
      fig.collectedTotal < 0.009 &&
      fig.drawerExpenses < 0.009
    ) {
      throw new BadRequestException('مفيش تحصيل أو مصروف في اليوم ده');
    }
    if (fig.expected < -0.009) {
      throw new BadRequestException('مصروفات الدرج أكبر من التحصيل');
    }

    return this.prisma.cashDayClose.create({
      data: {
        businessDate,
        cashCollected: fig.collectedCash,
        vodafoneCollected: fig.collectedVodafone,
        drawerExpenses: fig.drawerExpenses,
        expectedAmount: fig.expected,
        countedAmount: counted,
        difference: counted - fig.expected,
        transferredToSafe: counted,
        note: body.note?.trim() || null,
        closedByUserId: userId,
      },
    });
  }

  /** Printable reception day sheet: drawer collections, expenses, close, teacher-hold sales. */
  async daySheet(rawDate?: string) {
    const today = cairoYmd();
    const ymd = String(rawDate || '').trim() || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      throw new BadRequestException('تاريخ غير صالح');
    }
    const { start, end } = cairoBounds(ymd);
    const range = { gte: start, lte: end };
    const confirmed = SessionPayStatus.CONFIRMED;
    const businessDate = dateOnly(ymd);

    const [payments, sessions, online, handouts, rentals, expenses, close] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: { paidAt: range },
          include: {
            student: { select: { firstName: true, lastName: true } },
            invoice: {
              select: {
                note: true,
                groupId: true,
                group: {
                  select: {
                    name: true,
                    subject: { select: { nameAr: true, nameEn: true } },
                  },
                },
              },
            },
          },
          orderBy: { paidAt: 'asc' },
        }),
        this.prisma.sessionEntry.findMany({
          where: { payStatus: confirmed, confirmedAt: range },
          include: {
            student: { select: { firstName: true, lastName: true } },
            session: {
              select: {
                title: true,
                teacher: { select: { firstName: true, lastName: true } },
                subject: { select: { nameAr: true, nameEn: true } },
              },
            },
          },
          orderBy: { confirmedAt: 'asc' },
        }),
        this.prisma.onlineCodeSale.findMany({
          where: { payStatus: confirmed, confirmedAt: range },
          include: {
            code: { select: { code: true } },
            offer: {
              select: {
                id: true,
                title: true,
                teacher: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { confirmedAt: 'asc' },
        }),
        this.prisma.handoutSale.findMany({
          where: { payStatus: confirmed, confirmedAt: range },
          include: {
            product: {
              select: {
                id: true,
                title: true,
                teacher: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { confirmedAt: 'asc' },
        }),
        this.prisma.roomRental.findMany({
          where: { payStatus: confirmed, confirmedAt: range },
          include: { classroom: { select: { name: true } } },
          orderBy: { confirmedAt: 'asc' },
        }),
        this.prisma.cashExpense.findMany({
          where: { paidFrom: CashExpenseFrom.DRAWER, businessDate },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.cashDayClose.findUnique({ where: { businessDate } }),
      ]);

    const bkReceipts = payments
      .map((p) => p.receiptNumber)
      .filter((r) => r.startsWith('BK-'));
    const bookings = await this.prisma.bookingSubmission.findMany({
      where: {
        status: BookingStatus.PAID,
        OR: [
          { paidAt: range },
          ...(bkReceipts.length
            ? [{ receiptNumber: { in: bkReceipts } }]
            : []),
        ],
      },
      select: {
        formId: true,
        formSerial: true,
        totalAmount: true,
        receiptNumber: true,
        payChannel: true,
        studentName: true,
        form: { select: { title: true, gradeLabel: true } },
      },
    });

    type TallyRow = {
      key: string;
      kind: string;
      label: string;
      count: number;
      unit: string;
      amount: number;
      serials: string;
      note?: string;
    };

    const bookingByForm = new Map<
      string,
      {
        label: string;
        count: number;
        amount: number;
        serials: number[];
      }
    >();
    const onlineBookingByForm = new Map<
      string,
      {
        label: string;
        count: number;
        amount: number;
        serials: number[];
      }
    >();
    for (const b of bookings) {
      const target =
        b.payChannel === 'online' ? onlineBookingByForm : bookingByForm;
      const cur = target.get(b.formId) || {
        label: `${b.form.title}${b.form.gradeLabel ? ` · ${b.form.gradeLabel}` : ''}`,
        count: 0,
        amount: 0,
        serials: [] as number[],
      };
      cur.count += 1;
      cur.amount += money(b.totalAmount);
      if (b.formSerial != null) cur.serials.push(b.formSerial);
      target.set(b.formId, cur);
    }

    const codeByOffer = new Map<
      string,
      {
        label: string;
        count: number;
        amount: number;
        codes: string[];
        hold: boolean;
      }
    >();
    for (const s of online) {
      const cur = codeByOffer.get(s.offer.id) || {
        label: [s.offer.title, personName(s.offer.teacher)]
          .filter(Boolean)
          .join(' · '),
        count: 0,
        amount: 0,
        codes: [] as string[],
        hold: false,
      };
      cur.count += 1;
      cur.amount += money(s.amount);
      if (s.code?.code) cur.codes.push(s.code.code);
      if (s.cashTo === ExtraRevenueCashTo.TEACHER_HOLD) cur.hold = true;
      codeByOffer.set(s.offer.id, cur);
    }

    const handByProduct = new Map<
      string,
      {
        label: string;
        count: number;
        amount: number;
        receipts: string[];
        hold: boolean;
      }
    >();
    for (const s of handouts) {
      const cur = handByProduct.get(s.product.id) || {
        label: [s.product.title, personName(s.product.teacher)]
          .filter(Boolean)
          .join(' · '),
        count: 0,
        amount: 0,
        receipts: [] as string[],
        hold: false,
      };
      cur.count += s.qty;
      cur.amount += money(s.amount);
      if (s.receiptNumber) cur.receipts.push(s.receiptNumber);
      if (s.cashTo === ExtraRevenueCashTo.TEACHER_HOLD) cur.hold = true;
      handByProduct.set(s.product.id, cur);
    }

    const groupPays = payments.filter((p) => p.invoice?.groupId);
    const sessionReceipts = sessions.map((e) => e.receiptNumber).filter(Boolean);
    const rentalRows = rentals.filter(
      (s) => s.cashTo === ExtraRevenueCashTo.DRAWER,
    );

    const tallies: TallyRow[] = [
      ...[...bookingByForm.entries()].map(([id, r]) => ({
        key: `bk-${id}`,
        kind: 'booking',
        label: r.label,
        count: r.count,
        unit: 'استمارة',
        amount: r.amount,
        serials: formatNumRanges(r.serials, 'م '),
      })),
      ...[...onlineBookingByForm.entries()].map(([id, r]) => ({
        key: `bk-on-${id}`,
        kind: 'online-form',
        label: r.label,
        count: r.count,
        unit: 'استمارة',
        amount: r.amount,
        serials: formatNumRanges(r.serials, 'م '),
        note: 'أونلاين — مش في عدّ الدرج (محفظة أونلاين)',
      })),
      ...[...codeByOffer.entries()].map(([id, r]) => ({
        key: `on-${id}`,
        kind: 'online',
        label: r.label,
        count: r.count,
        unit: 'كود',
        amount: r.amount,
        serials: formatStrRange(r.codes),
        note: r.hold
          ? 'على حساب المدرس — مش في عدّ الدرج'
          : undefined,
      })),
      ...[...handByProduct.entries()].map(([id, r]) => ({
        key: `hn-${id}`,
        kind: 'handout',
        label: r.label,
        count: r.count,
        unit: 'ملزمة',
        amount: r.amount,
        serials:
          r.receipts.length > 1
            ? formatStrRange(r.receipts)
            : r.receipts[0] || '—',
        note: r.hold
          ? 'على حساب المدرس — مش في عدّ الدرج'
          : undefined,
      })),
    ];

    if (sessions.length) {
      tallies.push({
        key: 'sessions',
        kind: 'session',
        label: 'حصص اليوم',
        count: sessions.length,
        unit: 'طالب',
        amount: sessions.reduce((n, e) => n + money(e.amount), 0),
        serials: formatStrRange(sessionReceipts),
      });
    }
    if (groupPays.length) {
      tallies.push({
        key: 'groups',
        kind: 'group',
        label: 'اشتراكات مجموعات',
        count: groupPays.length,
        unit: 'إيصال',
        amount: groupPays.reduce((n, p) => n + money(p.amount), 0),
        serials: formatStrRange(groupPays.map((p) => p.receiptNumber)),
      });
    }
    if (rentalRows.length) {
      tallies.push({
        key: 'rentals',
        kind: 'rental',
        label: 'تأجير قاعات',
        count: rentalRows.length,
        unit: 'حجز',
        amount: rentalRows.reduce((n, s) => n + money(s.amount), 0),
        serials: formatStrRange(
          rentalRows.map((s) => s.receiptNumber || '').filter(Boolean),
        ),
      });
    }

    const collected = await this.dayCollections(ymd);
    const drawerExpenses = expenses.reduce((n, e) => n + money(e.amount), 0);
    const userIds = [
      ...expenses.map((e) => e.createdByUserId),
      close?.closedByUserId,
    ].filter(Boolean) as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: [...new Set(userIds)] } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));

    const dateLabel = new Date(`${ymd}T12:00:00+03:00`).toLocaleDateString(
      'ar-EG',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    );

    const holdOnline = online.filter(
      (s) => s.cashTo === ExtraRevenueCashTo.TEACHER_HOLD,
    );
    const holdHand = handouts.filter(
      (s) => s.cashTo === ExtraRevenueCashTo.TEACHER_HOLD,
    );

    return {
      generatedAt: new Date().toISOString(),
      businessDate: ymd,
      dateLabel,
      closed: !!close,
      close: close
        ? {
            cashCollected: money(close.cashCollected),
            vodafoneCollected: money(close.vodafoneCollected),
            drawerExpenses: money(close.drawerExpenses),
            expectedAmount: money(close.expectedAmount),
            countedAmount: money(close.countedAmount),
            difference: money(close.difference),
            transferredToSafe: money(close.transferredToSafe),
            note: close.note,
            closedAt: close.closedAt.toISOString(),
            closedByName: close.closedByUserId
              ? names.get(close.closedByUserId) || null
              : null,
          }
        : null,
      collectedCash: collected.cash,
      collectedVodafone: collected.vodafone,
      collectedTotal: collected.total,
      drawerExpenses,
      expected: collected.total - drawerExpenses,
      breakdown: collected.breakdown,
      tallies,
      summaryCounts: {
        forms: [...bookingByForm.values()].reduce((n, r) => n + r.count, 0),
        formsAmount: [...bookingByForm.values()].reduce((n, r) => n + r.amount, 0),
        formsOnline: [...onlineBookingByForm.values()].reduce(
          (n, r) => n + r.count,
          0,
        ),
        formsOnlineAmount: [...onlineBookingByForm.values()].reduce(
          (n, r) => n + r.amount,
          0,
        ),
        codes: online.length,
        codesAmount: online.reduce((n, s) => n + money(s.amount), 0),
        handouts: handouts.reduce((n, s) => n + s.qty, 0),
        handoutsAmount: handouts.reduce((n, s) => n + money(s.amount), 0),
        sessions: sessions.length,
      },
      expenses: expenses.map((e) => ({
        id: e.id,
        amount: money(e.amount),
        category: e.category,
        note: e.note,
        createdByName: e.createdByUserId
          ? names.get(e.createdByUserId) || null
          : null,
      })),
      holdGross:
        holdOnline.reduce((n, s) => n + money(s.amount), 0) +
        holdHand.reduce((n, s) => n + money(s.amount), 0),
      holdTeacher:
        holdOnline.reduce((n, s) => n + money(s.teacherShare), 0) +
        holdHand.reduce((n, s) => n + money(s.teacherShare), 0),
      holdCenter:
        holdOnline.reduce((n, s) => n + money(s.centerShare), 0) +
        holdHand.reduce((n, s) => n + money(s.centerShare), 0),
    };
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

  async claimOnlineWallet(
    userId: string,
    body: { amount?: number; note?: string },
  ) {
    const wallet = await this.onlineFormWallet();
    const available = wallet.availableAmount;
    if (available <= 0.009) {
      throw new BadRequestException('مفيش رصيد متاح في المحفظة الإلكترونية');
    }
    const amount =
      body.amount != null && !Number.isNaN(Number(body.amount))
        ? Number(body.amount)
        : available;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('المبلغ غير صالح');
    }
    if (amount > available + 0.009) {
      throw new BadRequestException(
        `الرصيد المتاح في المحفظة ${Math.round(available)} ج.م`,
      );
    }
    const claim = await this.prisma.onlineWalletClaim.create({
      data: {
        amount,
        note: body.note?.trim() || null,
        createdByUserId: userId,
      },
    });
    const balances = await this.balances();
    return {
      claim,
      availableAfter: Math.max(0, available - amount),
      ownerBalance: balances.ownerBalance,
    };
  }

  listOnlineWalletClaims(take = 30) {
    return this.prisma.onlineWalletClaim.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
