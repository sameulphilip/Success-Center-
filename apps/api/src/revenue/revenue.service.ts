import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExtraRevenueCashTo,
  OnlineCodeStatus,
  RentalStatus,
  RoleCode,
  SessionPayMethod,
  SessionPayStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';
import {
  splitSessionNet,
  teacherPercentFromCenter,
} from '../ops/session-split';

function receipt(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

function genCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

function cashToForRole(role?: string) {
  if (role === RoleCode.SUPER_ADMIN || role === RoleCode.CENTER_MANAGER) {
    return ExtraRevenueCashTo.OWNER;
  }
  return ExtraRevenueCashTo.DRAWER;
}

@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  // —— Online offers / codes ——
  listOffers() {
    return this.prisma.onlineOffer.findMany({
      include: {
        teacher: true,
        subject: true,
        _count: { select: { codes: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    const count = Math.min(Math.max(data.codesCount ?? 20, 1), 200);
    const codes = Array.from({ length: count }, () => ({
      code: `ON-${genCode()}`,
    }));

    return this.prisma.onlineOffer.create({
      data: {
        teacherId: data.teacherId,
        subjectId: data.subjectId || null,
        title: data.title.trim(),
        price: data.price,
        teacherPercent,
        notes: data.notes,
        codes: { create: codes },
      },
      include: {
        teacher: true,
        subject: true,
        codes: { where: { status: OnlineCodeStatus.AVAILABLE }, take: 5 },
        _count: { select: { codes: true } },
      },
    });
  }

  async addCodes(offerId: string, count = 10) {
    const offer = await this.prisma.onlineOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer) throw new NotFoundException('العرض غير موجود');
    const n = Math.min(Math.max(count, 1), 200);
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
      take: 300,
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

    const qty = Math.min(Math.max(Math.floor(Number(data.qty) || 1), 1), 50);
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
    const centerAmt =
      Math.round(
        unit * (1 - Number(offer.teacherPercent) / 100) * 100,
      ) / 100;
    const { teacherShare, centerShare } = splitSessionNet({
      net: unit,
      feeAmount: unit,
      centerAmount: centerAmt,
      teacherPercent: offer.teacherPercent,
    });
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
      cashTo,
      codes: sales.map((s) => s.code.code),
      sales,
      ...sales[0],
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
        teacherId: data.teacherId || null,
        stock: data.stock ?? 0,
      },
      include: { teacher: true },
    });
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
    const centerAmt =
      Math.round(
        unitPrice * (1 - Number(product.teacherPercent) / 100) * 100,
      ) / 100;
    const { teacherShare, centerShare } = splitSessionNet({
      net: amount,
      feeAmount: unitPrice,
      centerAmount: centerAmt,
      teacherPercent: product.teacherPercent,
    });
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
        cashTo: cashToForRole(role),
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
}
