import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExtraRevenueCashTo,
  OnlineCodeStatus,
  Prisma,
  RentalStatus,
  RoleCode,
  SessionPayMethod,
  SessionPayStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';
import {
  splitExtraRevenue,
  teacherPercentFromCenter,
} from '../ops/session-split';

function receipt(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

function genCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

function personName(t?: { firstName?: string; lastName?: string } | null) {
  if (!t?.firstName) return '';
  const last = t.lastName && t.lastName !== '-' ? t.lastName : '';
  return `${t.firstName} ${last}`.trim();
}

function cashToForRole(
  role?: string,
  kind: 'hold' | 'drawer' = 'hold',
) {
  if (role === RoleCode.SUPER_ADMIN || role === RoleCode.CENTER_MANAGER) {
    return ExtraRevenueCashTo.OWNER;
  }
  if (kind === 'drawer') return ExtraRevenueCashTo.DRAWER;
  return ExtraRevenueCashTo.TEACHER_HOLD;
}

function storedCenter(row: {
  price: unknown;
  teacherPercent: unknown;
  centerAmount?: unknown;
}) {
  if (row.centerAmount != null && row.centerAmount !== '') {
    const n = Number(row.centerAmount);
    if (Number.isFinite(n)) return n;
  }
  const price = Number(row.price) || 0;
  const pct = Number(row.teacherPercent) || 0;
  return Math.round(price * (1 - pct / 100) * 100) / 100;
}

const MAX_OFFER_CODES = 5000;

@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  // —— Online offers / codes ——
  async listOffers() {
    const offers = await this.prisma.onlineOffer.findMany({
      include: {
        teacher: true,
        subject: true,
        _count: { select: { codes: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const availableRows = await this.prisma.onlineAccessCode.groupBy({
      by: ['offerId'],
      where: { status: OnlineCodeStatus.AVAILABLE },
      _count: true,
    });
    const availableByOffer = new Map(
      availableRows.map((r) => [r.offerId, r._count]),
    );
    return offers.map((o) => ({
      ...o,
      availableCodes: availableByOffer.get(o.id) || 0,
    }));
  }

  private resolveOfferShare(price: number, data: {
    teacherPercent?: number;
    centerAmount?: number;
  }) {
    if (price < 0) throw new BadRequestException('السعر غير صالح');
    const center =
      data.centerAmount != null && !Number.isNaN(Number(data.centerAmount))
        ? Number(data.centerAmount)
        : data.teacherPercent != null
          ? Math.round(
              price * (1 - Number(data.teacherPercent) / 100) * 100,
            ) / 100
          : 0;
    if (center < 0) {
      throw new BadRequestException('مبلغ السنتر غير صالح');
    }
    return {
      center,
      teacherPercent: teacherPercentFromCenter(price, center),
    };
  }

  async createOffer(data: {
    teacherId: string;
    subjectId?: string;
    title: string;
    price: number;
    teacherPercent?: number;
    centerAmount?: number;
    notes?: string;
    codesCount?: number;
  }) {
    const { teacherPercent, center } = this.resolveOfferShare(data.price, data);
    const count = Math.min(
      Math.max(data.codesCount ?? 20, 1),
      MAX_OFFER_CODES,
    );
    const offer = await this.prisma.onlineOffer.create({
      data: {
        teacherId: data.teacherId,
        subjectId: data.subjectId || null,
        title: data.title.trim(),
        price: data.price,
        teacherPercent,
        centerAmount: center,
        notes: data.notes,
      },
    });
    await this.prisma.onlineAccessCode.createMany({
      data: Array.from({ length: count }, () => ({
        offerId: offer.id,
        code: `ON-${genCode()}`,
      })),
    });
    return this.prisma.onlineOffer.findUniqueOrThrow({
      where: { id: offer.id },
      include: {
        teacher: true,
        subject: true,
        codes: { where: { status: OnlineCodeStatus.AVAILABLE }, take: 5 },
        _count: { select: { codes: true } },
      },
    });
  }

  async updateOffer(
    id: string,
    data: {
      teacherId?: string;
      subjectId?: string | null;
      title?: string;
      price?: number;
      teacherPercent?: number;
      centerAmount?: number;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    const offer = await this.prisma.onlineOffer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException('العرض غير موجود');

    const price =
      data.price != null && !Number.isNaN(Number(data.price))
        ? Number(data.price)
        : Number(offer.price);
    const hasShare =
      data.centerAmount != null || data.teacherPercent != null || data.price != null;
    const share = hasShare
      ? this.resolveOfferShare(price, {
          centerAmount:
            data.centerAmount != null
              ? Number(data.centerAmount)
              : data.teacherPercent != null
                ? undefined
                : offer.centerAmount != null
                  ? Number(offer.centerAmount)
                  : Math.round(
                      Number(offer.price) *
                        (1 - Number(offer.teacherPercent) / 100) *
                        100,
                    ) / 100,
          teacherPercent: data.teacherPercent,
        })
      : {
          teacherPercent: Number(offer.teacherPercent),
          center:
            offer.centerAmount != null
              ? Number(offer.centerAmount)
              : Math.round(
                  Number(offer.price) *
                    (1 - Number(offer.teacherPercent) / 100) *
                    100,
                ) / 100,
        };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.onlineOffer.update({
        where: { id },
        data: {
          ...(data.teacherId ? { teacherId: data.teacherId } : {}),
          ...(data.subjectId !== undefined
            ? { subjectId: data.subjectId || null }
            : {}),
          ...(data.title != null ? { title: data.title.trim() } : {}),
          price,
          teacherPercent: share.teacherPercent,
          centerAmount: share.center,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
      const { teacherShare, centerShare } = splitExtraRevenue(
        price,
        share.center,
      );
      const sales = await tx.onlineCodeSale.updateMany({
        where: { offerId: id },
        data: {
          amount: price,
          teacherShare,
          centerShare,
        },
      });
      const offer = await tx.onlineOffer.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          teacher: true,
          subject: true,
          _count: { select: { codes: true, sales: true } },
        },
      });
      return { ...offer, updatedSales: sales.count };
    });
  }

  async addCodes(offerId: string, count = 10) {
    const offer = await this.prisma.onlineOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer) throw new NotFoundException('العرض غير موجود');
    const n = Math.min(Math.max(count, 1), MAX_OFFER_CODES);
    await this.prisma.onlineAccessCode.createMany({
      data: Array.from({ length: n }, () => ({
        offerId,
        code: `ON-${genCode()}`,
      })),
    });
    return this.prisma.onlineAccessCode.findMany({
      where: { offerId, status: OnlineCodeStatus.AVAILABLE },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  listOfferCodes(offerId: string) {
    return this.prisma.onlineAccessCode.findMany({
      where: { offerId },
      include: { sale: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: MAX_OFFER_CODES,
    });
  }

  async sellOnlineCode(
    offerId: string,
    data: {
      method: SessionPayMethod;
      vodafoneTxn?: string;
      studentId?: string;
      buyerPhone?: string;
      buyerName?: string;
      note?: string;
      qty?: number;
    },
    userId?: string,
    role?: string,
  ) {
    const offer = await this.prisma.onlineOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer || !offer.isActive) {
      throw new BadRequestException('العرض غير متاح');
    }
    if (data.method === SessionPayMethod.VODAFONE_CASH && !data.vodafoneTxn?.trim()) {
      throw new BadRequestException('رقم عملية فودافون مطلوب');
    }

    const qty = Math.min(
      Math.max(Math.floor(Number(data.qty) || 1), 1),
      MAX_OFFER_CODES,
    );
    const available = await this.prisma.onlineAccessCode.findMany({
      where: { offerId, status: OnlineCodeStatus.AVAILABLE },
      orderBy: { createdAt: 'asc' },
      take: qty,
    });
    if (!available.length) throw new BadRequestException('لا توجد أكواد متاحة');
    if (available.length < qty) {
      throw new BadRequestException(
        `المتاح ${available.length} كود بس. اختَر كمية أقل`,
      );
    }

    const unit = Number(offer.price);
    const centerAmt = storedCenter(offer);
    const { teacherShare, centerShare } = splitExtraRevenue(
      unit,
      centerAmt,
    );
    const isCash = data.method === SessionPayMethod.CASH;
    const cashTo = cashToForRole(role);
    const buyerPhone = data.buyerPhone
      ? normalizePhone(data.buyerPhone)
      : null;

    const sales = await this.prisma.$transaction(async (tx) => {
      const created: any[] = [];
      for (const code of available) {
        await tx.onlineAccessCode.update({
          where: { id: code.id },
          data: { status: OnlineCodeStatus.SOLD },
        });
        created.push(
          await tx.onlineCodeSale.create({
            data: {
              offerId,
              codeId: code.id,
              studentId: data.studentId || null,
              buyerPhone,
              buyerName: data.buyerName,
              amount: unit,
              teacherShare,
              centerShare,
              method: data.method,
              vodafoneTxn: data.vodafoneTxn?.trim() || null,
              payStatus: isCash
                ? SessionPayStatus.CONFIRMED
                : SessionPayStatus.PENDING_CONFIRM,
              receiptNumber: receipt('ON'),
              confirmedAt: isCash ? new Date() : null,
              confirmedByUserId: isCash ? userId : null,
              soldByUserId: userId,
              cashTo,
              note: data.note,
            },
            include: {
              code: true,
              offer: { include: { teacher: true } },
              student: true,
            },
          }),
        );
      }
      return created;
    });

    return {
      count: sales.length,
      totalAmount: unit * sales.length,
      totalCenterShare: centerShare * sales.length,
      totalTeacherShare: teacherShare * sales.length,
      cashTo,
      codes: sales.map((s) => s.code.code),
      sales,
      ...sales[0],
    };
  }

  /** Reception returns unsold codes to the teacher — AVAILABLE count decreases. */
  async returnOnlineCodesToTeacher(
    offerId: string,
    data: { qty?: number; note?: string },
  ) {
    const offer = await this.prisma.onlineOffer.findUnique({
      where: { id: offerId },
      include: { teacher: true },
    });
    if (!offer) throw new NotFoundException('العرض غير موجود');

    const qty = Math.min(
      Math.max(Math.floor(Number(data.qty) || 1), 1),
      MAX_OFFER_CODES,
    );
    const available = await this.prisma.onlineAccessCode.findMany({
      where: { offerId, status: OnlineCodeStatus.AVAILABLE },
      orderBy: { createdAt: 'asc' },
      take: qty,
    });
    if (!available.length) {
      throw new BadRequestException('مفيش أكواد متاحة للإرجاع');
    }
    if (available.length < qty) {
      throw new BadRequestException(
        `المتاح للإرجاع ${available.length} كود بس`,
      );
    }

    await this.prisma.onlineAccessCode.updateMany({
      where: { id: { in: available.map((c) => c.id) } },
      data: { status: OnlineCodeStatus.REVOKED },
    });

    const remaining = await this.prisma.onlineAccessCode.count({
      where: { offerId, status: OnlineCodeStatus.AVAILABLE },
    });

    return {
      ok: true,
      returned: available.length,
      remaining,
      offerId,
      title: offer.title,
      teacherName: personName(offer.teacher),
      note: (data.note || '').trim() || null,
      codes: available.map((c) => c.code),
    };
  }

  async confirmOnlineSale(id: string, userId?: string) {
    const sale = await this.prisma.onlineCodeSale.findUnique({
      where: { id },
    });
    if (!sale) throw new NotFoundException('البيع غير موجود');
    if (sale.payStatus === SessionPayStatus.CONFIRMED) return sale;
    return this.prisma.onlineCodeSale.update({
      where: { id },
      data: {
        payStatus: SessionPayStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedByUserId: userId,
      },
      include: { code: true, offer: true },
    });
  }

  listOnlineSales() {
    return this.prisma.onlineCodeSale.findMany({
      include: {
        code: true,
        offer: { include: { teacher: true } },
        student: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  private async unwindOnlineSale(
    tx: Prisma.TransactionClient,
    sale: {
      id: string;
      codeId: string;
      amount: unknown;
      teacherShare: unknown;
      centerShare: unknown;
      settlementId: string | null;
    },
    restoreCode: boolean,
  ) {
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
        if (onlineCount === 0 && st.handoutCount === 0) {
          await tx.onlineCodeSale.delete({ where: { id: sale.id } });
          await tx.extraTeacherSettlement.delete({ where: { id: st.id } });
        } else {
          await tx.onlineCodeSale.delete({ where: { id: sale.id } });
          await tx.extraTeacherSettlement.update({
            where: { id: st.id },
            data: { teacherPaid, centerToSafe, grossAmount, onlineCount },
          });
        }
      } else {
        await tx.onlineCodeSale.delete({ where: { id: sale.id } });
      }
    } else {
      await tx.onlineCodeSale.delete({ where: { id: sale.id } });
    }
    if (restoreCode) {
      await tx.onlineAccessCode.update({
        where: { id: sale.codeId },
        data: { status: OnlineCodeStatus.AVAILABLE },
      });
    }
  }

  async deleteOnlineSale(id: string) {
    const sale = await this.prisma.onlineCodeSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('البيع غير موجود');
    await this.prisma.$transaction((tx) =>
      this.unwindOnlineSale(tx, sale, true),
    );
    return { ok: true, deletedId: id };
  }

  async deleteOffer(id: string) {
    const offer = await this.prisma.onlineOffer.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!offer) throw new NotFoundException('العرض غير موجود');
    await this.prisma.$transaction(async (tx) => {
      const sales = await tx.onlineCodeSale.findMany({
        where: { offerId: id },
        select: {
          id: true,
          codeId: true,
          amount: true,
          teacherShare: true,
          centerShare: true,
          settlementId: true,
        },
      });
      for (const sale of sales) {
        await this.unwindOnlineSale(tx, sale, false);
      }
      await tx.onlineOffer.delete({ where: { id } });
    });
    return { ok: true, deletedId: id, title: offer.title };
  }

  // —— Handouts ——
  listHandouts() {
    return this.prisma.handoutProduct.findMany({
      include: { teacher: true, _count: { select: { sales: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createHandout(data: {
    title: string;
    price: number;
    teacherPercent?: number;
    centerAmount?: number;
    teacherId?: string;
    stock?: number;
  }) {
    if (data.price < 0) throw new BadRequestException('السعر غير صالح');
    const center =
      data.centerAmount != null && !Number.isNaN(Number(data.centerAmount))
        ? Number(data.centerAmount)
        : data.teacherPercent != null
          ? Math.round(
              data.price * (1 - Number(data.teacherPercent) / 100) * 100,
            ) / 100
          : 0;
    if (center < 0) {
      throw new BadRequestException('مبلغ السنتر غير صالح');
    }
    const teacherPercent = teacherPercentFromCenter(data.price, center);
    return this.prisma.handoutProduct.create({
      data: {
        title: data.title.trim(),
        price: data.price,
        teacherPercent,
        centerAmount: center,
        teacherId: data.teacherId || null,
        stock: data.stock ?? 0,
      },
      include: { teacher: true },
    });
  }

  async updateHandout(
    id: string,
    data: {
      title?: string;
      price?: number;
      teacherPercent?: number;
      centerAmount?: number;
      teacherId?: string | null;
      stock?: number;
      isActive?: boolean;
    },
  ) {
    const product = await this.prisma.handoutProduct.findUnique({
      where: { id },
    });
    if (!product) throw new NotFoundException('الملزمة غير موجودة');

    const price =
      data.price != null && !Number.isNaN(Number(data.price))
        ? Number(data.price)
        : Number(product.price);
    if (price < 0) throw new BadRequestException('السعر غير صالح');

    const hasShare =
      data.centerAmount != null ||
      data.teacherPercent != null ||
      data.price != null;
    let center = storedCenter(product);
    let teacherPercent = Number(product.teacherPercent);
    if (hasShare) {
      center =
        data.centerAmount != null && !Number.isNaN(Number(data.centerAmount))
          ? Number(data.centerAmount)
          : data.teacherPercent != null
            ? Math.round(
                price * (1 - Number(data.teacherPercent) / 100) * 100,
              ) / 100
            : storedCenter({ ...product, price });
      if (center < 0) {
        throw new BadRequestException('مبلغ السنتر غير صالح');
      }
      teacherPercent = teacherPercentFromCenter(price, center);
    }

    if (data.stock != null && (Number.isNaN(Number(data.stock)) || data.stock < 0)) {
      throw new BadRequestException('المخزون غير صالح');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.handoutProduct.update({
        where: { id },
        data: {
          ...(data.title != null ? { title: data.title.trim() } : {}),
          price,
          teacherPercent,
          centerAmount: center,
          ...(data.teacherId !== undefined
            ? { teacherId: data.teacherId || null }
            : {}),
          ...(data.stock != null ? { stock: Math.floor(Number(data.stock)) } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });

      let updatedSales = 0;
      if (hasShare) {
        const sales = await tx.handoutSale.findMany({
          where: { productId: id },
          select: { id: true, qty: true },
        });
        for (const sale of sales) {
          const { teacherShare, centerShare } = splitExtraRevenue(
            price,
            center,
            sale.qty,
          );
          await tx.handoutSale.update({
            where: { id: sale.id },
            data: {
              unitPrice: price,
              amount: price * sale.qty,
              teacherShare,
              centerShare,
            },
          });
          updatedSales += 1;
        }
      }

      const full = await tx.handoutProduct.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          teacher: true,
          _count: { select: { sales: true } },
        },
      });
      return { ...full, updatedSales };
    });
  }

  private async unwindHandoutSale(
    tx: Prisma.TransactionClient,
    sale: {
      id: string;
      productId: string;
      qty: number;
      amount: unknown;
      teacherShare: unknown;
      centerShare: unknown;
      settlementId: string | null;
    },
    restoreStock: boolean,
  ) {
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
        const handoutCount = Math.max(0, st.handoutCount - 1);
        if (st.onlineCount === 0 && handoutCount === 0) {
          await tx.handoutSale.delete({ where: { id: sale.id } });
          await tx.extraTeacherSettlement.delete({ where: { id: st.id } });
        } else {
          await tx.handoutSale.delete({ where: { id: sale.id } });
          await tx.extraTeacherSettlement.update({
            where: { id: st.id },
            data: { teacherPaid, centerToSafe, grossAmount, handoutCount },
          });
        }
      } else {
        await tx.handoutSale.delete({ where: { id: sale.id } });
      }
    } else {
      await tx.handoutSale.delete({ where: { id: sale.id } });
    }
    if (restoreStock) {
      await tx.handoutProduct.update({
        where: { id: sale.productId },
        data: { stock: { increment: sale.qty } },
      });
    }
  }

  async deleteHandout(id: string) {
    const product = await this.prisma.handoutProduct.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!product) throw new NotFoundException('الملزمة غير موجودة');
    await this.prisma.$transaction(async (tx) => {
      const sales = await tx.handoutSale.findMany({
        where: { productId: id },
        select: {
          id: true,
          productId: true,
          qty: true,
          amount: true,
          teacherShare: true,
          centerShare: true,
          settlementId: true,
        },
      });
      for (const sale of sales) {
        await this.unwindHandoutSale(tx, sale, false);
      }
      await tx.handoutProduct.delete({ where: { id } });
    });
    return { ok: true, deletedId: id, title: product.title };
  }

  async updateHandoutSale(
    id: string,
    data: {
      qty?: number;
      method?: SessionPayMethod;
      vodafoneTxn?: string | null;
      buyerPhone?: string | null;
      note?: string | null;
    },
  ) {
    const sale = await this.prisma.handoutSale.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!sale) throw new NotFoundException('البيع غير موجود');
    if (sale.settlementId) {
      throw new BadRequestException(
        'البيع اتتصفى مع المدرس — مفيش تعديل بعد التصفية',
      );
    }

    const qty =
      data.qty != null ? Math.max(1, Math.floor(Number(data.qty))) : sale.qty;
    if (!Number.isFinite(qty) || qty < 1) {
      throw new BadRequestException('الكمية غير صالحة');
    }

    const method = data.method ?? sale.method;
    const vodafoneTxn =
      data.vodafoneTxn !== undefined
        ? data.vodafoneTxn?.trim() || null
        : sale.vodafoneTxn;
    if (method === SessionPayMethod.VODAFONE_CASH && !vodafoneTxn) {
      throw new BadRequestException('رقم عملية فودافون مطلوب');
    }

    const unitPrice = Number(sale.product.price);
    const { teacherShare, centerShare } = splitExtraRevenue(
      unitPrice,
      storedCenter(sale.product),
      qty,
    );
    const qtyDelta = qty - sale.qty;

    return this.prisma.$transaction(async (tx) => {
      if (qtyDelta !== 0) {
        const product = await tx.handoutProduct.findUnique({
          where: { id: sale.productId },
        });
        if (!product) throw new NotFoundException('الملزمة غير موجودة');
        if (qtyDelta > 0 && product.stock < qtyDelta) {
          throw new BadRequestException('المخزون غير كافٍ');
        }
        await tx.handoutProduct.update({
          where: { id: sale.productId },
          data: { stock: { decrement: qtyDelta } },
        });
      }

      const isCash = method === SessionPayMethod.CASH;
      return tx.handoutSale.update({
        where: { id },
        data: {
          qty,
          unitPrice,
          amount: unitPrice * qty,
          teacherShare,
          centerShare,
          method,
          vodafoneTxn,
          ...(data.buyerPhone !== undefined
            ? {
                buyerPhone: data.buyerPhone
                  ? normalizePhone(data.buyerPhone)
                  : null,
              }
            : {}),
          ...(data.note !== undefined ? { note: data.note } : {}),
          ...(isCash && sale.payStatus === SessionPayStatus.PENDING_CONFIRM
            ? {
                payStatus: SessionPayStatus.CONFIRMED,
                confirmedAt: new Date(),
              }
            : !isCash && sale.payStatus === SessionPayStatus.CONFIRMED
              ? {
                  payStatus: SessionPayStatus.PENDING_CONFIRM,
                  confirmedAt: null,
                }
              : {}),
        },
        include: { product: true, student: true, session: true },
      });
    });
  }

  async deleteHandoutSale(id: string) {
    const sale = await this.prisma.handoutSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('البيع غير موجود');
    await this.prisma.$transaction((tx) =>
      this.unwindHandoutSale(tx, sale, true),
    );
    return { ok: true, deletedId: id };
  }

  async sellHandout(
    productId: string,
    data: {
      qty?: number;
      method: SessionPayMethod;
      vodafoneTxn?: string;
      studentId?: string;
      sessionId?: string;
      buyerPhone?: string;
      note?: string;
    },
    userId?: string,
    role?: string,
  ) {
    const product = await this.prisma.handoutProduct.findUnique({
      where: { id: productId },
    });
    if (!product || !product.isActive) {
      throw new BadRequestException('الملزمة غير متاحة');
    }
    const qty = Math.max(data.qty ?? 1, 1);
    if (product.stock < qty) {
      throw new BadRequestException('المخزون غير كافٍ');
    }
    if (data.method === SessionPayMethod.VODAFONE_CASH && !data.vodafoneTxn?.trim()) {
      throw new BadRequestException('رقم عملية فودافون مطلوب');
    }

    const unitPrice = Number(product.price);
    const amount = unitPrice * qty;
    const { teacherShare, centerShare } = splitExtraRevenue(
      unitPrice,
      storedCenter(product),
      qty,
    );
    const isCash = data.method === SessionPayMethod.CASH;

    return this.prisma.$transaction(async (tx) => {
      await tx.handoutProduct.update({
        where: { id: productId },
        data: { stock: { decrement: qty } },
      });
      return tx.handoutSale.create({
        data: {
          productId,
          studentId: data.studentId || null,
          sessionId: data.sessionId || null,
          qty,
          unitPrice,
          amount,
          teacherShare,
          centerShare,
          method: data.method,
          vodafoneTxn: data.vodafoneTxn?.trim() || null,
          payStatus: isCash
            ? SessionPayStatus.CONFIRMED
            : SessionPayStatus.PENDING_CONFIRM,
          receiptNumber: receipt('HN'),
          confirmedAt: isCash ? new Date() : null,
          confirmedByUserId: isCash ? userId : null,
          soldByUserId: userId,
          cashTo: cashToForRole(role),
          buyerPhone: data.buyerPhone
            ? normalizePhone(data.buyerPhone)
            : null,
          note: data.note,
        },
        include: { product: true, student: true, session: true },
      });
    });
  }

  /** Reception returns unsold handout copies to the teacher — stock decreases. */
  async returnHandoutToTeacher(
    productId: string,
    data: { qty?: number; note?: string },
  ) {
    const product = await this.prisma.handoutProduct.findUnique({
      where: { id: productId },
      include: { teacher: true },
    });
    if (!product) throw new NotFoundException('الملزمة غير موجودة');

    const qty = Math.max(Math.floor(Number(data.qty) || 1), 1);
    if (product.stock < qty) {
      throw new BadRequestException(
        product.stock <= 0
          ? 'مفيش مخزون متاح للإرجاع'
          : `المخزون ${product.stock} بس — اختَر كمية أقل`,
      );
    }

    const updated = await this.prisma.handoutProduct.update({
      where: { id: productId },
      data: { stock: { decrement: qty } },
      include: { teacher: true },
    });

    return {
      ok: true,
      returned: qty,
      remaining: updated.stock,
      productId,
      title: product.title,
      teacherName: personName(product.teacher),
      note: (data.note || '').trim() || null,
    };
  }

  async confirmHandoutSale(id: string, userId?: string) {
    const sale = await this.prisma.handoutSale.findUnique({ where: { id } });
    if (!sale) throw new NotFoundException('البيع غير موجود');
    if (sale.payStatus === SessionPayStatus.CONFIRMED) return sale;
    return this.prisma.handoutSale.update({
      where: { id },
      data: {
        payStatus: SessionPayStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedByUserId: userId,
      },
      include: { product: true },
    });
  }

  listHandoutSales() {
    return this.prisma.handoutSale.findMany({
      include: { product: true, student: true, session: true },
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
  }

  // —— Room rentals ——
  listRentals() {
    return this.prisma.roomRental.findMany({
      include: { classroom: true },
      orderBy: { startsAt: 'desc' },
      take: 150,
    });
  }

  async createRental(
    data: {
      classroomId: string;
      renterName: string;
      renterPhone?: string;
      title?: string;
      startsAt: string;
      endsAt: string;
      amount: number;
      method?: SessionPayMethod;
      vodafoneTxn?: string;
      notes?: string;
    },
    userId?: string,
    role?: string,
  ) {
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (!(endsAt > startsAt)) {
      throw new BadRequestException('وقت النهاية لازم بعد البداية');
    }
    if (data.amount < 0) throw new BadRequestException('المبلغ غير صالح');

    const method = data.method || SessionPayMethod.CASH;
    if (method === SessionPayMethod.VODAFONE_CASH && !data.vodafoneTxn?.trim()) {
      throw new BadRequestException('رقم عملية فودافون مطلوب');
    }

    const overlap = await this.prisma.roomRental.findFirst({
      where: {
        classroomId: data.classroomId,
        status: { in: [RentalStatus.BOOKED, RentalStatus.PAID] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (overlap) {
      throw new BadRequestException('القاعة محجوزة في هذا الوقت');
    }

    const isCash = method === SessionPayMethod.CASH;
    return this.prisma.roomRental.create({
      data: {
        classroomId: data.classroomId,
        renterName: data.renterName.trim(),
        renterPhone: data.renterPhone
          ? normalizePhone(data.renterPhone)
          : null,
        title: data.title,
        startsAt,
        endsAt,
        amount: data.amount,
        method,
        vodafoneTxn: data.vodafoneTxn?.trim() || null,
        payStatus: isCash
          ? SessionPayStatus.CONFIRMED
          : SessionPayStatus.PENDING_CONFIRM,
        status: isCash ? RentalStatus.PAID : RentalStatus.BOOKED,
        receiptNumber: isCash ? receipt('RM') : null,
        confirmedAt: isCash ? new Date() : null,
        confirmedByUserId: isCash ? userId : null,
        createdByUserId: userId,
        cashTo: cashToForRole(role, 'drawer'),
        notes: data.notes,
      },
      include: { classroom: true },
    });
  }

  async confirmRental(id: string, userId?: string) {
    const rental = await this.prisma.roomRental.findUnique({ where: { id } });
    if (!rental) throw new NotFoundException('الحجز غير موجود');
    if (rental.status === RentalStatus.CANCELLED) {
      throw new BadRequestException('الحجز ملغي');
    }
    return this.prisma.roomRental.update({
      where: { id },
      data: {
        payStatus: SessionPayStatus.CONFIRMED,
        status: RentalStatus.PAID,
        confirmedAt: new Date(),
        confirmedByUserId: userId,
        receiptNumber: rental.receiptNumber || receipt('RM'),
      },
      include: { classroom: true },
    });
  }

  async cancelRental(id: string) {
    return this.prisma.roomRental.update({
      where: { id },
      data: { status: RentalStatus.CANCELLED },
      include: { classroom: true },
    });
  }

  /** Inventory snapshot: codes & handouts per teacher (totals + per offer/product). */
  async inventoryByTeacher() {
    const [offers, handouts, codeGroups, handoutSold] = await Promise.all([
      this.prisma.onlineOffer.findMany({
        include: { teacher: true },
        orderBy: [{ teacher: { firstName: 'asc' } }, { title: 'asc' }],
      }),
      this.prisma.handoutProduct.findMany({
        include: { teacher: true },
        orderBy: [{ title: 'asc' }],
      }),
      this.prisma.onlineAccessCode.groupBy({
        by: ['offerId', 'status'],
        _count: true,
      }),
      this.prisma.handoutSale.groupBy({
        by: ['productId'],
        _sum: { qty: true },
        _count: true,
      }),
    ]);

    const codeByOffer = new Map<
      string,
      { total: number; sold: number; available: number }
    >();
    for (const row of codeGroups) {
      const cur = codeByOffer.get(row.offerId) || {
        total: 0,
        sold: 0,
        available: 0,
      };
      const n = row._count;
      cur.total += n;
      if (row.status === OnlineCodeStatus.SOLD) cur.sold += n;
      if (row.status === OnlineCodeStatus.AVAILABLE) cur.available += n;
      codeByOffer.set(row.offerId, cur);
    }

    const soldQtyByProduct = new Map(
      handoutSold.map((r) => [r.productId, Number(r._sum.qty || 0)]),
    );

    type OnlineTeacherRow = {
      teacherId: string;
      name: string;
      offersCount: number;
      totalCodes: number;
      sold: number;
      remaining: number;
      offers: Array<{
        id: string;
        title: string;
        price: number;
        isActive: boolean;
        totalCodes: number;
        sold: number;
        remaining: number;
      }>;
    };

    const onlineMap = new Map<string, OnlineTeacherRow>();
    for (const o of offers) {
      const stats = codeByOffer.get(o.id) || {
        total: 0,
        sold: 0,
        available: 0,
      };
      const teacherId = o.teacherId;
      const name = personName(o.teacher) || '—';
      const row = onlineMap.get(teacherId) || {
        teacherId,
        name,
        offersCount: 0,
        totalCodes: 0,
        sold: 0,
        remaining: 0,
        offers: [],
      };
      row.offersCount += 1;
      row.totalCodes += stats.total;
      row.sold += stats.sold;
      row.remaining += stats.available;
      row.offers.push({
        id: o.id,
        title: o.title,
        price: Number(o.price),
        isActive: o.isActive,
        totalCodes: stats.total,
        sold: stats.sold,
        remaining: stats.available,
      });
      onlineMap.set(teacherId, row);
    }

    type HandoutTeacherRow = {
      teacherId: string;
      name: string;
      productsCount: number;
      totalCopies: number;
      sold: number;
      remaining: number;
      products: Array<{
        id: string;
        title: string;
        price: number;
        isActive: boolean;
        stock: number;
        sold: number;
        totalCopies: number;
      }>;
    };

    const handoutMap = new Map<string, HandoutTeacherRow>();
    for (const h of handouts) {
      const sold = soldQtyByProduct.get(h.id) || 0;
      const remaining = h.stock;
      const totalCopies = remaining + sold;
      const teacherId = h.teacherId || 'none';
      const name = h.teacher ? personName(h.teacher) : 'بدون مدرس';
      const row = handoutMap.get(teacherId) || {
        teacherId,
        name,
        productsCount: 0,
        totalCopies: 0,
        sold: 0,
        remaining: 0,
        products: [],
      };
      row.productsCount += 1;
      row.totalCopies += totalCopies;
      row.sold += sold;
      row.remaining += remaining;
      row.products.push({
        id: h.id,
        title: h.title,
        price: Number(h.price),
        isActive: h.isActive,
        stock: remaining,
        sold,
        totalCopies,
      });
      handoutMap.set(teacherId, row);
    }

    const onlineByTeacher = [...onlineMap.values()].sort(
      (a, b) => b.totalCodes - a.totalCodes || a.name.localeCompare(b.name, 'ar'),
    );
    const handoutsByTeacher = [...handoutMap.values()].sort(
      (a, b) => b.totalCopies - a.totalCopies || a.name.localeCompare(b.name, 'ar'),
    );

    return {
      onlineByTeacher,
      handoutsByTeacher,
      summary: {
        onlineTeachers: onlineByTeacher.length,
        onlineCodes: onlineByTeacher.reduce((n, t) => n + t.totalCodes, 0),
        onlineSold: onlineByTeacher.reduce((n, t) => n + t.sold, 0),
        onlineRemaining: onlineByTeacher.reduce((n, t) => n + t.remaining, 0),
        handoutTeachers: handoutsByTeacher.length,
        handoutCopies: handoutsByTeacher.reduce((n, t) => n + t.totalCopies, 0),
        handoutSold: handoutsByTeacher.reduce((n, t) => n + t.sold, 0),
        handoutRemaining: handoutsByTeacher.reduce((n, t) => n + t.remaining, 0),
      },
    };
  }
}
