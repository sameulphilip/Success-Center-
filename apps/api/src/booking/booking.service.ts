import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, MessageChannel, PaymentStatus, RoleCode } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import {
  G1_BOOKING_OFFERINGS,
  G2_BOOKING_OFFERINGS,
  G3_BOOKING_OFFERINGS,
} from './booking.defaults';
import { AuthService } from '../auth/auth.service';
import {
  isValidMobile,
  normalizePhone,
  phoneLookupVariants,
  phoneToLoginEmail,
} from '../common/phone.util';
import {
  decodeProofDataUrl,
  readBookingProof,
  saveBookingProof,
} from '../common/image-proof.util';
import { MessagingService } from '../messaging/messaging.service';
import { buildBookingPaymentConfirmMessage } from './booking-whatsapp.util';

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  /** Next Excel/paper serial «م» for a form (max + 1, or 1). */
  async nextFormSerial(formId: string, preferred?: number | null) {
    if (preferred != null && Number.isFinite(Number(preferred))) {
      const n = Math.floor(Number(preferred));
      if (n > 0) {
        const taken = await this.prisma.bookingSubmission.findFirst({
          where: { formId, formSerial: n },
          select: { id: true },
        });
        if (!taken) return n;
      }
    }
    const agg = await this.prisma.bookingSubmission.aggregate({
      where: { formId, formSerial: { not: null } },
      _max: { formSerial: true },
    });
    return (agg._max.formSerial || 0) + 1;
  }

  private async findActiveSubmission(formId: string, studentPhone: string) {
    const phones = phoneLookupVariants(studentPhone);
    if (!phones.length) return null;
    return this.prisma.bookingSubmission.findFirst({
      where: {
        formId,
        studentPhone: { in: phones },
        status: { in: [BookingStatus.SUBMITTED, BookingStatus.PAID] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Apply sheet serials by phone (normalized).
   * Skips conflicts; returns match stats.
   */
  async syncFormSerials(
    rows: Array<{
      studentPhone: string;
      formSlug?: string;
      grade?: string;
      formSerial: number;
    }>,
  ) {
    const results: Array<{
      phone: string;
      serial: number;
      ok: boolean;
      message: string;
    }> = [];

    for (const row of rows) {
      const phone = normalizePhone(String(row.studentPhone || ''));
      const serial = Math.floor(Number(row.formSerial));
      if (!phone || !serial || serial < 1) {
        results.push({
          phone: String(row.studentPhone || ''),
          serial,
          ok: false,
          message: 'بيانات ناقصة',
        });
        continue;
      }
      try {
        const slug = this.resolveFormSlug(row.formSlug || row.grade);
        const form = await this.prisma.bookingForm.findUnique({
          where: { slug },
        });
        if (!form) {
          results.push({
            phone,
            serial,
            ok: false,
            message: `استمارة غير موجودة: ${slug}`,
          });
          continue;
        }
        const sub = await this.prisma.bookingSubmission.findFirst({
          where: { formId: form.id, studentPhone: phone },
          orderBy: { createdAt: 'asc' },
        });
        if (!sub) {
          results.push({
            phone,
            serial,
            ok: false,
            message: 'لا يوجد حجز لهذا الموبايل',
          });
          continue;
        }
        if (sub.formSerial === serial) {
          results.push({
            phone,
            serial,
            ok: true,
            message: 'نفس الرقم موجود',
          });
          continue;
        }
        const clash = await this.prisma.bookingSubmission.findFirst({
          where: {
            formId: form.id,
            formSerial: serial,
            NOT: { id: sub.id },
          },
          select: { id: true },
        });
        if (clash) {
          results.push({
            phone,
            serial,
            ok: false,
            message: 'الرقم مستخدم لحجز آخر',
          });
          continue;
        }
        await this.prisma.bookingSubmission.update({
          where: { id: sub.id },
          data: { formSerial: serial },
        });
        results.push({ phone, serial, ok: true, message: 'تم الربط' });
      } catch (e) {
        results.push({
          phone,
          serial,
          ok: false,
          message: e instanceof Error ? e.message : 'فشل',
        });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    return { total: results.length, ok, failed: results.length - ok, results };
  }

  async listForms() {
    const [forms, statusGroups] = await Promise.all([
      this.prisma.bookingForm.findMany({
        include: {
          _count: { select: { offerings: true, submissions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bookingSubmission.groupBy({
        by: ['formId', 'status'],
        _count: { _all: true },
      }),
    ]);

    const byForm = new Map<
      string,
      { PAID: number; SUBMITTED: number; CANCELLED: number }
    >();
    for (const g of statusGroups) {
      const cur = byForm.get(g.formId) || {
        PAID: 0,
        SUBMITTED: 0,
        CANCELLED: 0,
      };
      cur[g.status] = g._count._all;
      byForm.set(g.formId, cur);
    }

    return forms.map((f) => ({
      ...f,
      statusCounts: byForm.get(f.id) || {
        PAID: 0,
        SUBMITTED: 0,
        CANCELLED: 0,
      },
    }));
  }

  async getFormAdmin(id: string) {
    const form = await this.prisma.bookingForm.findUnique({
      where: { id },
      include: {
        offerings: { orderBy: [{ pageNumber: 'asc' }, { sortOrder: 'asc' }] },
        submissions: {
          include: {
            selections: { include: { offering: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!form) throw new NotFoundException('Booking form not found');

    const [picked, paid] = await Promise.all([
      this.prisma.bookingSelection.groupBy({
        by: ['offeringId'],
        where: {
          offering: { formId: id },
          submission: { status: { not: 'CANCELLED' } },
        },
        _count: { _all: true },
      }),
      this.prisma.bookingSelection.groupBy({
        by: ['offeringId'],
        where: {
          offering: { formId: id },
          submission: { status: 'PAID' },
        },
        _count: { _all: true },
      }),
    ]);
    const pickedMap = new Map(picked.map((r) => [r.offeringId, r._count._all]));
    const paidMap = new Map(paid.map((r) => [r.offeringId, r._count._all]));

    return {
      ...form,
      offerings: form.offerings.map((o) => ({
        ...o,
        pickCount: pickedMap.get(o.id) || 0,
        paidCount: paidMap.get(o.id) || 0,
      })),
    };
  }

  /** Full public URL + QR for admin share / print poster */
  async getFormShare(id: string, baseUrl?: string) {
    const form = await this.prisma.bookingForm.findUnique({ where: { id } });
    if (!form) throw new NotFoundException('Booking form not found');

    const origin = (
      baseUrl ||
      process.env.PUBLIC_WEB_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const url = `${origin}/booking/${form.slug}`;
    const onlineUrl = `${origin}/booking/${form.slug}/online`;
    const qrOpts = {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'M' as const,
      color: { dark: '#0B2545', light: '#FFFFFF' },
    };
    const [qrDataUrl, onlineQrDataUrl] = await Promise.all([
      QRCode.toDataURL(url, qrOpts),
      form.onlinePayEnabled
        ? QRCode.toDataURL(onlineUrl, qrOpts)
        : Promise.resolve(null),
    ]);

    return {
      formId: form.id,
      slug: form.slug,
      title: form.title,
      subtitle: form.subtitle,
      academicYear: form.academicYear,
      gradeLabel: form.gradeLabel,
      isPublished: form.isPublished,
      formFee: Number(form.defaultFee),
      onlinePayEnabled: form.onlinePayEnabled,
      vodafoneWallet: form.vodafoneWallet,
      instapayHandle: form.instapayHandle,
      url,
      qrDataUrl,
      onlineUrl: form.onlinePayEnabled ? onlineUrl : null,
      onlineQrDataUrl,
    };
  }

  /** Students who booked a specific teacher offering — for roster PDF/print */
  async getOfferingRoster(offeringId: string, paidOnly = false) {
    const offering = await this.prisma.bookingOffering.findUnique({
      where: { id: offeringId },
      include: { form: true },
    });
    if (!offering) throw new NotFoundException('المدرس غير موجود في الاستمارة');

    const selections = await this.prisma.bookingSelection.findMany({
      where: {
        offeringId,
        submission: {
          status: paidOnly ? 'PAID' : { not: 'CANCELLED' },
        },
      },
      include: {
        submission: true,
      },
    });

    const students = selections
      .map((s) => ({
        id: s.submission.id,
        formSerial: s.submission.formSerial,
        studentName: s.submission.studentName,
        studentPhone: s.submission.studentPhone,
        parentPhone: s.submission.parentPhone,
        status: s.submission.status,
        receiptNumber: s.submission.receiptNumber,
        paidAt: s.submission.paidAt,
        createdAt: s.submission.createdAt,
      }))
      .sort((a, b) => {
        const sa = a.formSerial ?? 999999;
        const sb = b.formSerial ?? 999999;
        if (sa !== sb) return sa - sb;
        return a.studentName.localeCompare(b.studentName, 'ar');
      });

    const paid = students.filter((s) => s.status === 'PAID').length;

    return {
      generatedAt: new Date().toISOString(),
      paidOnly,
      offering: {
        id: offering.id,
        teacherName: offering.teacherName,
        subjectName: offering.subjectName,
        isOnline: offering.isOnline,
      },
      form: {
        id: offering.form.id,
        title: offering.form.title,
        gradeLabel: offering.form.gradeLabel,
        academicYear: offering.form.academicYear,
        subtitle: offering.form.subtitle,
      },
      totals: {
        all: students.length,
        paid,
        pending: students.length - paid,
      },
      students,
    };
  }

  /** Public published form by slug. channel=online requires onlinePayEnabled. */
  async getPublicForm(slug: string, channel?: string) {
    const online = channel === 'online';
    const form = await this.prisma.bookingForm.findFirst({
      where: { slug, isPublished: true },
      include: {
        offerings: {
          where: { isActive: true },
          orderBy: [{ pageNumber: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });
    if (!form) throw new NotFoundException('استمارة الحجز غير متاحة');
    if (online && !form.onlinePayEnabled) {
      throw new NotFoundException('استمارة الدفع أونلاين غير مفعّلة');
    }
    return {
      id: form.id,
      slug: form.slug,
      title: form.title,
      subtitle: form.subtitle,
      academicYear: form.academicYear,
      gradeLabel: form.gradeLabel,
      notes: form.notes,
      defaultFee: Number(form.defaultFee),
      formFee: Number(form.defaultFee),
      payChannel: online ? ('online' as const) : ('center' as const),
      onlinePayEnabled: form.onlinePayEnabled,
      vodafoneWallet: form.vodafoneWallet,
      instapayHandle: form.instapayHandle,
      offerings: form.offerings.map((o) => ({
        id: o.id,
        teacherName: o.teacherName,
        subjectName: o.subjectName,
        isOnline: o.isOnline,
        isWaitingList: o.isWaitingList,
        pageNumber: o.pageNumber,
      })),
    };
  }

  /** Sheet teachers for a form grade (G2 / G3). */
  private offeringsForGrade(gradeLabel: string) {
    const slug = this.resolveFormSlug(gradeLabel);
    if (slug.startsWith('g1')) return G1_BOOKING_OFFERINGS;
    if (slug.startsWith('g2')) return G2_BOOKING_OFFERINGS;
    if (slug.startsWith('g3')) return G3_BOOKING_OFFERINGS;
    return [] as typeof G3_BOOKING_OFFERINGS;
  }

  async createForm(data: {
    slug: string;
    title: string;
    subtitle?: string;
    academicYear: string;
    gradeLabel: string;
    defaultFee?: number;
    notes?: string;
    isPublished?: boolean;
    /** Fill teachers from the paper sheet for this form's grade */
    seedTeachers?: boolean;
    /** @deprecated use seedTeachers */
    seedG3?: boolean;
  }) {
    const existing = await this.prisma.bookingForm.findUnique({
      where: { slug: data.slug },
    });
    if (existing) throw new BadRequestException('Slug already used');

    const shouldSeed = data.seedTeachers ?? data.seedG3 ?? false;
    const sheetOfferings = shouldSeed
      ? this.offeringsForGrade(data.gradeLabel)
      : [];

    const form = await this.prisma.bookingForm.create({
      data: {
        slug: data.slug,
        title: data.title,
        subtitle: data.subtitle,
        academicYear: data.academicYear,
        gradeLabel: data.gradeLabel,
        defaultFee: data.defaultFee ?? 0,
        notes: data.notes,
        isPublished: data.isPublished ?? false,
        offerings: sheetOfferings.length
          ? {
              create: sheetOfferings.map((o) => ({
                teacherName: o.teacherName,
                subjectName: o.subjectName,
                isOnline: o.isOnline ?? false,
                pageNumber: o.pageNumber,
                sortOrder: o.sortOrder,
                feeAmount: data.defaultFee ?? 0,
              })),
            }
          : undefined,
      },
      include: { offerings: true },
    });

    if (sheetOfferings.length) {
      await this.linkTeachersToGrade(data.gradeLabel, sheetOfferings.map((o) => o.teacherName));
    }
    return form;
  }

  /** Ensure Teacher rows for names are linked to the form's grade level. */
  private async linkTeachersToGrade(gradeLabel: string, teacherNames: string[]) {
    const gradeLevelId = await this.resolveGradeLevelId(this.prisma, gradeLabel);
    if (!gradeLevelId) return;
    const unique = [...new Set(teacherNames.map((n) => n.trim()).filter(Boolean))];
    for (const full of unique) {
      const parts = full.split(/\s+/);
      const firstName = parts[0] || full;
      const lastName = parts.slice(1).join(' ') || '-';
      let teacher = await this.prisma.teacher.findFirst({
        where: {
          isActive: true,
          OR: [
            { firstName, lastName },
            { firstName: full, lastName: '-' },
          ],
        },
      });
      if (!teacher) {
        const all = await this.prisma.teacher.findMany({
          where: { isActive: true },
          select: { id: true, firstName: true, lastName: true },
        });
        const fold = (s: string) =>
          s
            .replace(/\s+/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي');
        const target = fold(full);
        const hit = all.find((t) => {
          const name = fold(
            `${t.firstName} ${t.lastName === '-' ? '' : t.lastName}`.trim(),
          );
          return name === target || name.includes(target) || target.includes(name);
        });
        if (hit) teacher = await this.prisma.teacher.findUnique({ where: { id: hit.id } });
      }
      if (!teacher) {
        teacher = await this.prisma.teacher.create({
          data: { firstName, lastName, hourlyRate: 0 },
        });
      }
      await this.prisma.teacherGradeLevel.upsert({
        where: {
          teacherId_gradeLevelId: {
            teacherId: teacher.id,
            gradeLevelId,
          },
        },
        create: { teacherId: teacher.id, gradeLevelId },
        update: {},
      });
    }
  }

  async updateForm(
    id: string,
    data: Partial<{
      title: string;
      subtitle: string | null;
      academicYear: string;
      gradeLabel: string;
      defaultFee: number;
      notes: string | null;
      isPublished: boolean;
      slug: string;
      onlinePayEnabled: boolean;
      vodafoneWallet: string | null;
      instapayHandle: string | null;
      whatsappGroupLink: string | null;
    }>,
    actorRole?: string,
  ) {
    await this.getFormAdmin(id);
    const payKeys = [
      'onlinePayEnabled',
      'vodafoneWallet',
      'instapayHandle',
    ] as const;
    const touchesPay = payKeys.some((k) => data[k] !== undefined);
    const canEditPay =
      actorRole === RoleCode.SUPER_ADMIN ||
      actorRole === RoleCode.CENTER_MANAGER;
    if (touchesPay && !canEditPay) {
      throw new ForbiddenException(
        'تعديل فودافون كاش و InstaPay للأدمن فقط',
      );
    }
    if (data.onlinePayEnabled) {
      const wallet = (data.vodafoneWallet ?? '').trim();
      const ipa = (data.instapayHandle ?? '').trim();
      const current = await this.prisma.bookingForm.findUnique({
        where: { id },
        select: { vodafoneWallet: true, instapayHandle: true },
      });
      const hasWallet = wallet || current?.vodafoneWallet;
      const hasIpa = ipa || current?.instapayHandle;
      if (!hasWallet && !hasIpa) {
        throw new BadRequestException(
          'فعّل فودافون كاش أو InstaPay برقم المحفظة / الحساب قبل نشر لينك الأونلاين',
        );
      }
    }
    if (data.whatsappGroupLink !== undefined) {
      data.whatsappGroupLink = data.whatsappGroupLink?.trim() || null;
    }
    return this.prisma.bookingForm.update({
      where: { id },
      data,
      include: {
        offerings: { orderBy: [{ pageNumber: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
  }

  private teacherDisplayName(t: {
    firstName: string;
    lastName: string;
  }): string {
    return `${t.firstName} ${t.lastName === '-' ? '' : t.lastName}`.trim();
  }

  /** Require an existing Teacher from the teachers list; link to form grade. */
  private async ensureTeacherForOffering(
    gradeLabel: string,
    teacherId?: string,
  ): Promise<{ teacherId: string; teacherName: string }> {
    if (!teacherId?.trim()) {
      throw new BadRequestException(
        'يجب اختيار مدرس من قائمة المدرسين. سجّل المدرس أولاً من صفحة المدرسين.',
      );
    }
    const existing = await this.prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
    });
    if (!existing) {
      throw new BadRequestException(
        'المدرس غير موجود في القائمة. سجّله أولاً من صفحة المدرسين.',
      );
    }

    const gradeLevelId = await this.resolveGradeLevelId(this.prisma, gradeLabel);
    if (gradeLevelId) {
      await this.prisma.teacherGradeLevel.upsert({
        where: {
          teacherId_gradeLevelId: {
            teacherId: existing.id,
            gradeLevelId,
          },
        },
        create: { teacherId: existing.id, gradeLevelId },
        update: {},
      });
    }

    return {
      teacherId: existing.id,
      teacherName: this.teacherDisplayName(existing),
    };
  }

  private async resolveSubjectIdByName(
    subjectName: string,
  ): Promise<string | null> {
    const name = subjectName.trim();
    if (!name) return null;
    const fold = (s: string) =>
      s
        .replace(/\s+/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase();
    const target = fold(name);
    const subjects = await this.prisma.subject.findMany({
      select: { id: true, nameAr: true, nameEn: true },
    });
    const hit = subjects.find(
      (s) => fold(s.nameAr) === target || fold(s.nameEn) === target,
    );
    return hit?.id ?? null;
  }

  async upsertOffering(
    formId: string,
    data: {
      id?: string;
      teacherId?: string;
      subjectId?: string;
      subjectName: string;
      isOnline?: boolean;
      isWaitingList?: boolean;
      feeAmount?: number;
      pageNumber?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const form = await this.getFormAdmin(formId);
    const subjectName = (data.subjectName || '').trim();
    if (!subjectName) {
      throw new BadRequestException('المادة مطلوبة');
    }

    if (data.id) {
      const existing = await this.prisma.bookingOffering.findFirst({
        where: { id: data.id, formId },
      });
      if (!existing) throw new NotFoundException('المدرس غير موجود في الاستمارة');

      let teacherId = existing.teacherId;
      let teacherName = existing.teacherName;
      if (data.teacherId?.trim()) {
        const resolved = await this.ensureTeacherForOffering(
          form.gradeLabel,
          data.teacherId,
        );
        teacherId = resolved.teacherId;
        teacherName = resolved.teacherName;
      }

      let subjectId = data.subjectId ?? existing.subjectId;
      if (!subjectId) {
        subjectId = await this.resolveSubjectIdByName(subjectName);
      }

      return this.prisma.bookingOffering.update({
        where: { id: data.id },
        data: {
          teacherName,
          subjectName,
          teacherId,
          subjectId,
          isOnline: data.isOnline ?? existing.isOnline,
          isWaitingList: data.isWaitingList ?? existing.isWaitingList,
          feeAmount: data.feeAmount ?? existing.feeAmount,
          pageNumber: data.pageNumber ?? existing.pageNumber,
          sortOrder: data.sortOrder ?? existing.sortOrder,
          isActive: data.isActive ?? existing.isActive,
        },
      });
    }

    const { teacherId, teacherName } = await this.ensureTeacherForOffering(
      form.gradeLabel,
      data.teacherId,
    );

    let subjectId = data.subjectId || null;
    if (!subjectId) {
      subjectId = await this.resolveSubjectIdByName(subjectName);
    }

    return this.prisma.bookingOffering.create({
      data: {
        formId,
        teacherName,
        subjectName,
        teacherId,
        subjectId,
        isOnline: data.isOnline ?? false,
        isWaitingList: data.isWaitingList ?? false,
        feeAmount: data.feeAmount ?? 0,
        pageNumber: data.pageNumber ?? 1,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async deleteOffering(offeringId: string) {
    await this.prisma.bookingOffering.delete({ where: { id: offeringId } });
    return { ok: true };
  }

  async listSubmissions(formId?: string, status?: BookingStatus, phone?: string) {
    const phoneQ = (phone || '').replace(/\D/g, '');
    const rows = await this.prisma.bookingSubmission.findMany({
      where: {
        ...(formId ? { formId } : {}),
        ...(status ? { status } : {}),
        ...(phoneQ
          ? {
              OR: [
                { studentPhone: { contains: phoneQ } },
                { parentPhone: { contains: phoneQ } },
              ],
            }
          : {}),
      },
      include: {
        form: true,
        selections: { include: { offering: true } },
      },
      orderBy: [{ formSerial: 'desc' }, { createdAt: 'desc' }],
      // When scoped to one form, return the full list; otherwise keep a safe cap.
      take: phoneQ ? 150 : formId ? 2000 : 500,
    });
    return rows.map(({ transferProofPath, ...row }) => ({
      ...row,
      hasTransferProof: !!transferProofPath,
    }));
  }

  async onlineWallet() {
    const [rows, claimsAgg, claims] = await Promise.all([
      this.prisma.bookingSubmission.findMany({
        where: { payChannel: 'online' },
        include: {
          form: { select: { id: true, title: true, gradeLabel: true, slug: true, whatsappGroupLink: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 2000,
      }),
      this.prisma.onlineWalletClaim.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.onlineWalletClaim.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    let confirmedAmount = 0;
    let pendingAmount = 0;
    let confirmedCount = 0;
    let pendingCount = 0;
    const transfers = rows.map(({ transferProofPath, ...row }) => {
      const amount = Number(row.totalAmount || 0);
      if (row.status === BookingStatus.PAID) {
        confirmedAmount += amount;
        confirmedCount += 1;
      } else if (row.status === BookingStatus.SUBMITTED) {
        pendingAmount += amount;
        pendingCount += 1;
      }
      return {
        ...row,
        amount,
        hasTransferProof: !!transferProofPath,
      };
    });
    const claimedAmount = Number(claimsAgg._sum.amount || 0);
    const availableAmount = Math.max(0, confirmedAmount - claimedAmount);
    return {
      totals: {
        confirmedAmount,
        pendingAmount,
        claimedAmount,
        availableAmount,
        totalAmount: confirmedAmount + pendingAmount,
        confirmedCount,
        pendingCount,
        claimedCount: claimsAgg._count,
        count: transfers.length,
      },
      transfers,
      claims,
    };
  }

  async getTransferProof(submissionId: string) {
    const row = await this.prisma.bookingSubmission.findUnique({
      where: { id: submissionId },
      select: { transferProofPath: true },
    });
    if (!row?.transferProofPath) {
      throw new NotFoundException('لا توجد صورة تحويل');
    }
    return readBookingProof(row.transferProofPath);
  }

  async submitPublic(input: {
    slug: string;
    studentName: string;
    studentPhone: string;
    parentPhone: string;
    offeringIds: string[];
    notes?: string;
    channel?: string;
    paymentMethod?: string;
    transferRef?: string;
    proofImage?: string;
  }) {
    const online = input.channel === 'online';
    const form = await this.prisma.bookingForm.findFirst({
      where: { slug: input.slug, isPublished: true },
      include: { offerings: { where: { isActive: true } } },
    });
    if (!form) throw new NotFoundException('استمارة الحجز غير متاحة');
    if (online && !form.onlinePayEnabled) {
      throw new BadRequestException('استمارة الدفع أونلاين غير مفعّلة');
    }

    const name = input.studentName.trim();
    const studentPhone = normalizePhone(input.studentPhone);
    const parentPhone = normalizePhone(input.parentPhone);
    if (!name || !studentPhone || !parentPhone) {
      throw new BadRequestException('الاسم ورقم الموبايل ورقم ولي الأمر مطلوبين');
    }
    if (!isValidMobile(studentPhone)) {
      throw new BadRequestException('موبايل الطالب غير صالح');
    }
    if (!input.offeringIds?.length) {
      throw new BadRequestException('اختَر مدرسًا واحدًا على الأقل');
    }

    const duplicate = await this.findActiveSubmission(form.id, studentPhone);
    if (duplicate) {
      if (duplicate.status === BookingStatus.PAID) {
        throw new BadRequestException(
          'الرقم ده مسجّل ومدفوع على الاستمارة دي بالفعل. لو في تعديل، كلّم السنتر.',
        );
      }
      throw new BadRequestException(
        'الرقم ده مسجّل على الاستمارة دي بالفعل. متسجلش تاني — روح السنتر تدفع أو استنى تأكيد التحويل.',
      );
    }

    const selected = form.offerings.filter((o) =>
      input.offeringIds.includes(o.id),
    );
    if (selected.length !== input.offeringIds.length) {
      throw new BadRequestException('بعض الاختيارات غير صالحة');
    }

    // السعر سعر الاستمارة بالكامل، مش لكل مدرس
    const totalAmount = Number(form.defaultFee ?? 0) || 0;
    const lines = selected.map((o) => ({
      offeringId: o.id,
      feeAmount: 0,
    }));

    const formSerial = await this.nextFormSerial(form.id);

    let paymentMethod: string | null = null;
    let transferRef: string | null = null;
    let proofBuf: Buffer | null = null;
    if (online) {
      const method = String(input.paymentMethod || '')
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
      if (method !== 'VODAFONE_CASH' && method !== 'INSTAPAY') {
        throw new BadRequestException('اختَر فودافون كاش أو InstaPay');
      }
      if (method === 'VODAFONE_CASH' && !form.vodafoneWallet?.trim()) {
        throw new BadRequestException('محفظة فودافون كاش غير مفعّلة على الاستمارة');
      }
      if (method === 'INSTAPAY' && !form.instapayHandle?.trim()) {
        throw new BadRequestException('حساب InstaPay غير مفعّل على الاستمارة');
      }
      transferRef = (input.transferRef || '').trim();
      if (!transferRef) {
        throw new BadRequestException('الرقم المرجعي للتحويل مطلوب');
      }
      paymentMethod = method;
      proofBuf = decodeProofDataUrl(input.proofImage);
    }

    const submission = await this.prisma.bookingSubmission.create({
      data: {
        formId: form.id,
        formSerial,
        studentName: name,
        studentPhone,
        parentPhone,
        notes: input.notes,
        totalAmount,
        status: BookingStatus.SUBMITTED,
        paymentMethod,
        vodafoneTxn: transferRef,
        payChannel: online ? 'online' : 'center',
        selections: {
          create: lines,
        },
      },
      include: {
        selections: { include: { offering: true } },
        form: true,
      },
    });

    if (proofBuf) {
      try {
        const saved = await saveBookingProof(submission.id, proofBuf);
        await this.prisma.bookingSubmission.update({
          where: { id: submission.id },
          data: { transferProofPath: saved.relativePath },
        });
      } catch {
        // keep the booking even if the screenshot could not be stored
      }
    }

    const methodLabel =
      paymentMethod === 'INSTAPAY'
        ? 'InstaPay'
        : paymentMethod === 'VODAFONE_CASH'
          ? 'فودافون كاش'
          : 'كاش';

    return {
      id: submission.id,
      formSerial: submission.formSerial,
      status: submission.status,
      totalAmount,
      studentPhone: studentPhone,
      payChannel: online ? 'online' : 'center',
      paymentMethod,
      message: online
        ? `تم تسجيل الحجز. الاستقبال هيأكد تحويل ${methodLabel} وبعدين يتفتح حسابك.`
        : 'تم تسجيل الحجز. برجاء التوجه للسنتر للدفع كاش واستلام الإيصال.',
      nextSteps: online
        ? [
            `حوّل ${totalAmount.toLocaleString('en-EG')} ج.م ${methodLabel} واحتفظ بالرقم المرجعي`,
            'الاستقبال هيأكد وصول التحويل من التطبيق (والصورة لو رفعتها)',
            'بعد التأكيد هيتفتح حسابك تلقائي برقم موبايلك',
            'أول دخول: طالب → رقم الموبايل → عيّن الرقم السري',
          ]
        : [
            'ادفع كاش في السنتر واستلم الإيصال',
            'بعد تأكيد الدفع هيتفتح حسابك تلقائي برقم موبايلك',
            'ادخل من صفحة تسجيل الدخول → طالب، وعيّن الرقم السري أول مرة',
          ],
      selections: submission.selections.map((s) => ({
        teacherName: s.offering.teacherName,
        subjectName: s.offering.subjectName,
        isOnline: s.offering.isOnline,
        isWaitingList: s.offering.isWaitingList,
      })),
    };
  }

  async markPaid(
    submissionId: string,
    opts?:
      | string
      | {
          note?: string;
          method?: 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY';
          vodafoneTxn?: string;
        },
  ) {
    const options =
      typeof opts === 'string'
        ? { note: opts, method: 'CASH' as const }
        : opts || {};
    const rawMethod = String(options.method || 'CASH')
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    const method =
      rawMethod === 'VODAFONE_CASH' || rawMethod === 'INSTAPAY'
        ? rawMethod
        : 'CASH';
    const vodafoneTxn = (options.vodafoneTxn || '').trim();
    if ((method === 'VODAFONE_CASH' || method === 'INSTAPAY') && !vodafoneTxn) {
      throw new BadRequestException('الرقم المرجعي للتحويل مطلوب');
    }
    const note = options.note;
    const methodLabel =
      method === 'INSTAPAY'
        ? 'InstaPay'
        : method === 'VODAFONE_CASH'
          ? 'فودافون كاش'
          : 'كاش';

    const submission = await this.prisma.bookingSubmission.findUnique({
      where: { id: submissionId },
      include: {
        form: true,
        selections: { include: { offering: true } },
      },
    });
    if (!submission) throw new NotFoundException('الحجز غير موجود');
    if (submission.status === BookingStatus.PAID) {
      return submission;
    }
    if (submission.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('لا يمكن تأكيد دفع حجز ملغي');
    }

    const parts = submission.studentName.trim().split(/\s+/);
    const firstName = parts[0] || submission.studentName;
    const lastName = parts.slice(1).join(' ') || '—';

    const receiptNumber = `BK-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    const result = await this.prisma.$transaction(async (tx) => {
      let parent = await tx.parent.findFirst({
        where: { phone: submission.parentPhone },
      });
      if (!parent) {
        parent = await tx.parent.create({
          data: {
            firstName: 'ولي أمر',
            lastName: firstName,
            phone: submission.parentPhone,
          },
        });
      }

      let student = submission.studentId
        ? await tx.student.findUnique({ where: { id: submission.studentId } })
        : null;

      if (!student) {
        student = await tx.student.findFirst({
          where: {
            OR: [
              { phone: submission.studentPhone },
              {
                firstName,
                lastName,
                parents: { some: { parentId: parent.id } },
              },
            ],
          },
        });
      }

      if (!student) {
        student = await tx.student.create({
          data: {
            firstName,
            lastName,
            phone: submission.studentPhone,
            notes: `حجز: ${submission.form.title} · ${submission.form.academicYear}`,
            gradeLevelId: await this.resolveGradeLevelId(
              tx,
              submission.form.gradeLabel,
            ),
            parents: {
              create: { parentId: parent.id, relation: 'guardian' },
            },
          },
        });
      } else {
        const link = await tx.studentParent.findUnique({
          where: {
            studentId_parentId: {
              studentId: student.id,
              parentId: parent.id,
            },
          },
        });
        if (!link) {
          await tx.studentParent.create({
            data: { studentId: student.id, parentId: parent.id },
          });
        }
        if (!student.gradeLevelId) {
          const gradeLevelId = await this.resolveGradeLevelId(
            tx,
            submission.form.gradeLabel,
          );
          if (gradeLevelId) {
            student = await tx.student.update({
              where: { id: student.id },
              data: { gradeLevelId },
            });
          }
        }
      }

      const amount = Number(submission.totalAmount);
      const bookingLabel = `استمارة حجز · ${submission.form.title}${
        submission.form.gradeLabel ? ` · ${submission.form.gradeLabel}` : ''
      }`;

      const invoice = await tx.invoice.create({
        data: {
          studentId: student.id,
          feeAmount: amount,
          paidAmount: amount,
          status: PaymentStatus.PAID,
          note: `${bookingLabel} · ${methodLabel}`,
        },
      });

      await tx.payment.create({
        data: {
          studentId: student.id,
          invoiceId: invoice.id,
          amount,
          method,
          receiptNumber,
          note:
            note?.trim() ||
            (method === 'CASH'
              ? bookingLabel
              : `${bookingLabel} · ${methodLabel} · ${vodafoneTxn}`),
        },
      });

      const phone = normalizePhone(submission.studentPhone);
      if (!student.phone || normalizePhone(student.phone) !== phone) {
        if (isValidMobile(phone)) {
          await tx.student.update({
            where: { id: student.id },
            data: { phone },
          });
          student = { ...student, phone };
        }
      }

      // Auto portal account: login by student phone, set PIN first time
      let portalAccount: {
        phone: string;
        mustSetPassword: boolean;
        created: boolean;
      } | null = null;

      if (!isValidMobile(phone)) {
        throw new BadRequestException(
          'رقم موبايل الطالب غير صالح — الحساب مش هيتفتح من غيره',
        );
      }

      const studentRole = await tx.role.findUnique({
        where: { code: RoleCode.STUDENT },
      });
      if (!studentRole) {
        throw new BadRequestException(
          'دور الطالب غير موجود في النظام. راجع الإعدادات.',
        );
      }

      let account =
        (await tx.user.findUnique({ where: { phone } })) ||
        (await tx.user.findUnique({
          where: { email: phoneToLoginEmail(phone) },
        })) ||
        (student.userId
          ? await tx.user.findUnique({ where: { id: student.userId } })
          : null);

      if (!account) {
        const email = phoneToLoginEmail(phone);
        const emailTaken = await tx.user.findUnique({ where: { email } });
        account = await tx.user.create({
          data: {
            email: emailTaken
              ? `${phone}.${Date.now()}@phone.success.local`
              : email,
            phone,
            fullName: submission.studentName.trim(),
            passwordHash: await AuthService.tempPasswordHash(),
            mustSetPassword: true,
            roleId: studentRole.id,
            isActive: true,
            student: { connect: { id: student.id } },
          },
        });
        portalAccount = { phone, mustSetPassword: true, created: true };
      } else {
        const patch: {
          phone?: string;
          mustSetPassword?: boolean;
        } = {};
        if (!account.phone) patch.phone = phone;
        if (
          account.mustSetPassword !== true &&
          !account.refreshToken &&
          account.roleId === studentRole.id
        ) {
          patch.mustSetPassword = true;
        }
        if (Object.keys(patch).length) {
          account = await tx.user.update({
            where: { id: account.id },
            data: patch,
          });
        }
        if (!student.userId) {
          await tx.student.update({
            where: { id: student.id },
            data: { userId: account.id },
          });
        }
        portalAccount = {
          phone: account.phone || phone,
          mustSetPassword: account.mustSetPassword,
          created: false,
        };
      }

      const updated = await tx.bookingSubmission.update({
        where: { id: submission.id },
        data: {
          status: BookingStatus.PAID,
          paidAt: new Date(),
          receiptNumber,
          studentId: student.id,
          paymentMethod: method,
          vodafoneTxn: method === 'CASH' ? null : vodafoneTxn,
          notes: note || submission.notes,
        },
        include: {
          form: true,
          selections: { include: { offering: true } },
        },
      });

      return { ...updated, portalAccount };
    });

    void this.queuePaymentWhatsApp(result).catch((err) => {
      console.error(
        'Booking WhatsApp enqueue failed:',
        err instanceof Error ? err.message : err,
      );
    });

    return result;
  }

  /** Auto WhatsApp after payment confirmation (OpenWA / Meta / Twilio). */
  private async queuePaymentWhatsApp(submission: {
    studentName: string;
    studentPhone: string;
    receiptNumber?: string | null;
    payChannel?: string;
    paymentMethod?: string | null;
    form?: {
      gradeLabel?: string;
      title?: string;
      whatsappGroupLink?: string | null;
    } | null;
  }) {
    if (process.env.BOOKING_WHATSAPP_AUTO === 'false') return;

    const provider = (process.env.WHATSAPP_PROVIDER || 'console').toLowerCase();
    if (provider === 'console') return;

    const phone = normalizePhone(submission.studentPhone);
    if (!isValidMobile(phone)) return;

    const body = buildBookingPaymentConfirmMessage({
      studentName: submission.studentName,
      studentPhone: phone,
      receiptNumber: submission.receiptNumber,
      centerName: process.env.CENTER_NAME || 'Success Center',
      gradeLabel: submission.form?.gradeLabel || submission.form?.title,
      groupLink: submission.form?.whatsappGroupLink,
    });

    await this.messaging.enqueue({
      channel: MessageChannel.WHATSAPP,
      toPhone: phone,
      title: 'تأكيد دفع الاستمارة',
      body,
      meta: {
        kind: 'booking_payment_confirm',
        payChannel: submission.payChannel,
        paymentMethod: submission.paymentMethod,
      },
    });
  }

  async updateSubmission(
    id: string,
    data: {
      studentName?: string;
      studentPhone?: string;
      parentPhone?: string;
      notes?: string | null;
      totalAmount?: number;
      offeringIds?: string[];
    },
  ) {
    const submission = await this.prisma.bookingSubmission.findUnique({
      where: { id },
      include: {
        form: { include: { offerings: { where: { isActive: true } } } },
        selections: true,
      },
    });
    if (!submission) throw new NotFoundException('الحجز غير موجود');
    if (submission.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('لا يمكن تعديل حجز ملغي');
    }

    const studentName =
      data.studentName != null
        ? String(data.studentName).trim()
        : submission.studentName;
    if (!studentName) throw new BadRequestException('اسم الطالب مطلوب');

    const studentPhone =
      data.studentPhone != null
        ? normalizePhone(String(data.studentPhone))
        : submission.studentPhone;
    const parentPhone =
      data.parentPhone != null
        ? normalizePhone(String(data.parentPhone))
        : submission.parentPhone;
    if (!isValidMobile(studentPhone)) {
      throw new BadRequestException('موبايل الطالب غير صالح');
    }
    if (!isValidMobile(parentPhone)) {
      throw new BadRequestException('موبايل ولي الأمر غير صالح');
    }

    let totalAmount = Number(submission.totalAmount);
    if (data.totalAmount != null && !Number.isNaN(Number(data.totalAmount))) {
      totalAmount = Number(data.totalAmount);
      if (totalAmount < 0) {
        throw new BadRequestException('المبلغ غير صالح');
      }
    }

    let offeringIds = data.offeringIds;
    if (offeringIds) {
      const allowed = new Set(submission.form.offerings.map((o) => o.id));
      offeringIds = [...new Set(offeringIds.filter((oid) => allowed.has(oid)))];
    }

    await this.prisma.$transaction(async (tx) => {
      if (offeringIds) {
        await tx.bookingSelection.deleteMany({
          where: { submissionId: id },
        });
        if (offeringIds.length) {
          await tx.bookingSelection.createMany({
            data: offeringIds.map((offeringId) => ({
              submissionId: id,
              offeringId,
              feeAmount: 0,
            })),
          });
        }
      }

      await tx.bookingSubmission.update({
        where: { id },
        data: {
          studentName,
          studentPhone,
          parentPhone,
          totalAmount,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      });

      // Keep linked student in sync when already paid
      if (submission.status === BookingStatus.PAID && submission.studentId) {
        const parts = studentName.split(/\s+/);
        const firstName = parts[0] || studentName;
        const lastName = parts.slice(1).join(' ') || '—';
        await tx.student.update({
          where: { id: submission.studentId },
          data: {
            firstName,
            lastName,
            phone: studentPhone,
          },
        });
      }
    });

    return this.prisma.bookingSubmission.findUnique({
      where: { id },
      include: {
        form: true,
        selections: { include: { offering: true } },
      },
    });
  }

  async cancelSubmission(id: string) {
    const submission = await this.prisma.bookingSubmission.findUnique({
      where: { id },
    });
    if (!submission) throw new NotFoundException('الحجز غير موجود');
    if (submission.status === BookingStatus.PAID) {
      throw new BadRequestException('لا يمكن إلغاء حجز مدفوع');
    }
    return this.prisma.bookingSubmission.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
    });
  }

  /**
   * Hard-delete a booking submission (admin only).
   * For paid bookings: also removes linked payment, invoice, and the student
   * (with related records) when no other bookings remain for that student.
   */
  async deleteSubmission(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.bookingSubmission.findUnique({
        where: { id },
      });
      if (!submission) throw new NotFoundException('الحجز غير موجود');

      // Booking payment + invoice (by receipt / note)
      if (submission.receiptNumber) {
        const payment = await tx.payment.findUnique({
          where: { receiptNumber: submission.receiptNumber },
        });
        if (payment) {
          await tx.payment.delete({ where: { id: payment.id } });
          if (payment.invoiceId) {
            await tx.invoice.delete({ where: { id: payment.invoiceId } });
          }
        }
      }
      const notePayments = await tx.payment.findMany({
        where: { note: { contains: submission.id } },
        select: { id: true, invoiceId: true },
      });
      for (const p of notePayments) {
        await tx.payment.delete({ where: { id: p.id } });
        if (p.invoiceId) {
          const still = await tx.payment.count({
            where: { invoiceId: p.invoiceId },
          });
          if (still === 0) {
            await tx.invoice.delete({ where: { id: p.invoiceId } });
          }
        }
      }

      const studentId = submission.studentId;
      await tx.bookingSubmission.delete({ where: { id } });

      if (!studentId) {
        return { ok: true as const, deletedStudent: false };
      }

      const otherBookings = await tx.bookingSubmission.count({
        where: { studentId },
      });
      if (otherBookings > 0) {
        return { ok: true as const, deletedStudent: false };
      }

      // Wipe student ops data linked to this booking student
      await tx.payment.deleteMany({ where: { studentId } });
      await tx.invoice.deleteMany({ where: { studentId } });
      await tx.grade.deleteMany({ where: { studentId } });
      await tx.attendanceRecord.deleteMany({ where: { studentId } });
      await tx.studentBlock.deleteMany({ where: { studentId } });
      await tx.onlineCodeSale.deleteMany({ where: { studentId } });
      await tx.handoutSale.deleteMany({ where: { studentId } });

      const entries = await tx.sessionEntry.findMany({
        where: { studentId },
        select: { id: true },
      });
      if (entries.length) {
        const entryIds = entries.map((e) => e.id);
        await tx.sessionRefund.deleteMany({
          where: { entryId: { in: entryIds } },
        });
        await tx.sessionEntry.deleteMany({ where: { studentId } });
      }

      await tx.enrollment.deleteMany({ where: { studentId } });

      const student = await tx.student.findUnique({
        where: { id: studentId },
        include: { parents: true },
      });
      if (!student) {
        return { ok: true as const, deletedStudent: false };
      }

      const parentIds = student.parents.map((p) => p.parentId);
      const userId = student.userId;

      await tx.studentParent.deleteMany({ where: { studentId } });
      await tx.student.delete({ where: { id: studentId } });

      if (userId) {
        await tx.user.delete({ where: { id: userId } }).catch(() => null);
      }

      for (const parentId of parentIds) {
        const stillLinked = await tx.studentParent.count({
          where: { parentId },
        });
        if (stillLinked > 0) continue;
        const parent = await tx.parent.findUnique({ where: { id: parentId } });
        if (!parent) continue;
        await tx.parent.delete({ where: { id: parentId } });
        if (parent.userId) {
          await tx.user.delete({ where: { id: parent.userId } }).catch(() => null);
        }
      }

      return { ok: true as const, deletedStudent: true };
    });
  }

  private async resolveGradeLevelId(
    tx: { gradeLevel: { findFirst: Function } },
    gradeLabel: string,
  ): Promise<string | null> {
    const label = (gradeLabel || '').toLowerCase();
    /** Preferred Egyptian secondary names, then legacy Grade 10/11/12 labels */
    let candidates: string[] = [];
    if (
      label.includes('ثالث') ||
      label.includes('الثاني عشر') ||
      label.includes('grade 12') ||
      /\b12\b/.test(label)
    ) {
      candidates = ['الثالث الثانوي', 'الصف الثالث الثانوي', 'الصف الثاني عشر'];
    } else if (
      label.includes('بكالوريا') ||
      label.includes('ثاني') ||
      label.includes('الحادي عشر') ||
      label.includes('grade 11') ||
      /\b11\b/.test(label)
    ) {
      candidates = [
        'الثاني الثانوي',
        'الصف الثاني الثانوي',
        'الثاني الثانوي - بكالوريا',
        'الصف الثاني الثانوي - بكالوريا',
        'الصف الحادي عشر',
      ];
    } else if (
      label.includes('أول') ||
      label.includes('العاشر') ||
      label.includes('grade 10') ||
      /\b10\b/.test(label)
    ) {
      candidates = [
        'الأول الثانوي',
        'الصف الأول الثانوي',
        'الأول الثانوي - بكالوريا',
        'الصف الأول الثانوي - بكالوريا',
        'الصف العاشر',
      ];
    }
    for (const nameAr of candidates) {
      const g = await tx.gradeLevel.findFirst({ where: { nameAr } });
      if (g?.id) return g.id;
    }
    return null;
  }

  private resolveFormSlug(gradeOrSlug?: string) {
    const raw = (gradeOrSlug || '').trim();
    if (!raw) return 'g3-2026-2027';
    const lower = raw.toLowerCase();
    if (lower.includes('g1') || raw.includes('أول') || raw.includes('اول')) {
      return 'g1-2026-2027';
    }
    if (lower.includes('g2') || raw.includes('ثاني')) return 'g2-2026-2027';
    if (lower.includes('g3') || raw.includes('ثالث')) return 'g3-2026-2027';
    if (raw.startsWith('g1-') || raw.startsWith('g2-') || raw.startsWith('g3-')) {
      return raw;
    }
    return raw;
  }

  /** Fold Arabic spelling variants for teacher-name matching on import. */
  private foldTeacherName(name: string) {
    return (name || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/عبدالله/g, 'عبدالله')
      .replace(/عبداللّه/g, 'عبدالله');
  }

  private matchOfferingIds(
    offerings: Array<{ id: string; teacherName: string; subjectName: string }>,
    teachersCsv?: string,
  ) {
    if (!teachersCsv?.trim()) return [] as string[];
    const names = teachersCsv
      .split(/[,،|/]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const aliases: Record<string, string> = {
      رضافاروق: 'رضاالفاروق',
      سامجنشأت: 'سامحنشأت',
      ابرايهمفتحي: 'ابراهيمفتحي',
      عبداللهاسماعيل: 'عبداللهاسماعيل',
      عبداللهاشرف: 'عبداللهاشرف',
      انساسامه: 'انسسامه',
      امنيةمهدي: 'امنيةمهدي',
      'د.ولاءعبدالناصر': 'د.ولاءعبدالناصر',
      محمدابوريه: 'محمدابوريه',
    };
    const foldedNames = names.map((n) => {
      const f = this.foldTeacherName(n);
      return aliases[f] || f;
    });
    return offerings
      .filter((o) => {
        const ot = this.foldTeacherName(o.teacherName);
        return foldedNames.some((n) => {
          if (!n || n.length < 4) return false;
          return ot === n || (n.length >= 6 && (ot.includes(n) || n.includes(ot)));
        });
      })
      .map((o) => o.id);
  }

  /** Ensure G1/G2/G3 paper forms exist and sheet teachers stay in sync. */
  async ensurePaperForms() {
    const year = '2026-2027';
    const specs = [
      {
        slug: 'g3-2026-2027',
        title: 'استمارة حجز الصف الثالث الثانوي',
        gradeLabel: 'الثالث الثانوي',
        offerings: G3_BOOKING_OFFERINGS,
      },
      {
        slug: 'g2-2026-2027',
        title: 'استمارة حجز الصف الثاني الثانوي - بكالوريا',
        gradeLabel: 'الثاني الثانوي - بكالوريا',
        offerings: G2_BOOKING_OFFERINGS,
      },
      {
        slug: 'g1-2026-2027',
        title: 'استمارة حجز الصف الأول الثانوي - بكالوريا',
        gradeLabel: 'الأول الثانوي - بكالوريا',
        offerings: G1_BOOKING_OFFERINGS,
      },
    ];

    for (const spec of specs) {
      let form = await this.prisma.bookingForm.findUnique({
        where: { slug: spec.slug },
        include: { offerings: true },
      });
      if (!form) {
        form = await this.prisma.bookingForm.create({
          data: {
            slug: spec.slug,
            title: spec.title,
            subtitle: 'تسجيل ورقي / دفع كاش في السنتر',
            academicYear: year,
            gradeLabel: spec.gradeLabel,
            defaultFee: 0,
            isPublished: true,
            notes: 'مستورد من كشف ورقي Excel',
            offerings: {
              create: spec.offerings.map((o) => ({
                teacherName: o.teacherName,
                subjectName: o.subjectName,
                isOnline: o.isOnline ?? false,
                pageNumber: o.pageNumber,
                sortOrder: o.sortOrder,
                feeAmount: 0,
              })),
            },
          },
          include: { offerings: true },
        });
      } else {
        form = await this.prisma.bookingForm.update({
          where: { id: form.id },
          data: {
            title: spec.title,
            gradeLabel: spec.gradeLabel,
            academicYear: year,
          },
          include: { offerings: true },
        });
        await this.syncFormOfferings(form.id, spec.offerings);
        form = await this.prisma.bookingForm.findUnique({
          where: { id: form.id },
          include: { offerings: true },
        });
      }
      const names = (
        form?.offerings?.length
          ? form.offerings.filter((o) => o.isActive).map((o) => o.teacherName)
          : spec.offerings.map((o) => o.teacherName)
      ).filter(Boolean);
      await this.linkTeachersToGrade(spec.gradeLabel, names);
    }
    return this.listForms();
  }

  /** Upsert sheet offerings; deactivate removed ones (keep history/selections). */
  private async syncFormOfferings(
    formId: string,
    desired: typeof G2_BOOKING_OFFERINGS,
  ) {
    const existing = await this.prisma.bookingOffering.findMany({
      where: { formId },
    });
    const fold = (s: string) =>
      (s || '')
        .replace(/\s+/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase();
    const keyOf = (teacher: string, subject: string) =>
      `${fold(teacher)}|${fold(subject)}`;

    const usedIds = new Set<string>();
    for (const o of desired) {
      const key = keyOf(o.teacherName, o.subjectName);
      const hit = existing.find(
        (e) =>
          !usedIds.has(e.id) && keyOf(e.teacherName, e.subjectName) === key,
      );
      if (hit) {
        usedIds.add(hit.id);
        await this.prisma.bookingOffering.update({
          where: { id: hit.id },
          data: {
            teacherName: o.teacherName,
            subjectName: o.subjectName,
            isOnline: o.isOnline ?? false,
            pageNumber: o.pageNumber,
            sortOrder: o.sortOrder,
            isActive: true,
          },
        });
      } else {
        const created = await this.prisma.bookingOffering.create({
          data: {
            formId,
            teacherName: o.teacherName,
            subjectName: o.subjectName,
            isOnline: o.isOnline ?? false,
            pageNumber: o.pageNumber,
            sortOrder: o.sortOrder,
            feeAmount: 0,
            isActive: true,
          },
        });
        usedIds.add(created.id);
      }
    }

    const stale = existing.filter((e) => !usedIds.has(e.id) && e.isActive);
    if (stale.length) {
      await this.prisma.bookingOffering.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { isActive: false },
      });
    }
  }

  /**
   * Import paper Excel/CSV rows as paid booking submissions
   * (same outcome as filling the form + mark-paid).
   */
  async importPaperRows(
    rows: Array<{
      studentName: string;
      studentPhone: string;
      parentPhone: string;
      grade?: string;
      formSlug?: string;
      notes?: string;
      feeAmount?: number;
      teachers?: string;
      formSerial?: number;
    }>,
    opts?: { dryRun?: boolean },
  ) {
    await this.ensurePaperForms();
    const dryRun = !!opts?.dryRun;
    const results: Array<{
      row: number;
      ok: boolean;
      studentName: string;
      message: string;
      studentId?: string;
      submissionId?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // header = 1
      const studentName = String(row.studentName || '').trim();
      try {
        if (!studentName) {
          throw new BadRequestException('اسم الطالب فارغ');
        }
        const studentPhone = normalizePhone(String(row.studentPhone || ''));
        const parentPhone = normalizePhone(
          String(row.parentPhone || row.studentPhone || ''),
        );
        if (!isValidMobile(studentPhone)) {
          throw new BadRequestException('موبايل الطالب غير صالح');
        }
        if (!isValidMobile(parentPhone)) {
          throw new BadRequestException('موبايل ولي الأمر غير صالح');
        }

        const slug = this.resolveFormSlug(row.formSlug || row.grade);
        const form = await this.prisma.bookingForm.findUnique({
          where: { slug },
          include: { offerings: { where: { isActive: true } } },
        });
        if (!form) {
          throw new BadRequestException(`الاستمارة غير موجودة: ${slug}`);
        }

        const offeringIds = this.matchOfferingIds(
          form.offerings,
          row.teachers,
        );

        const fee =
          row.feeAmount != null && !Number.isNaN(Number(row.feeAmount))
            ? Number(row.feeAmount)
            : Number(form.defaultFee || 0);

        if (dryRun) {
          results.push({
            row: rowNum,
            ok: true,
            studentName,
            message: `جاهز للاستيراد → ${form.gradeLabel} (${slug}) · ${fee} EGP`,
          });
          continue;
        }

        const existing = await this.findActiveSubmission(form.id, studentPhone);
        if (existing) {
          if (existing.status === BookingStatus.PAID) {
            if (offeringIds.length) {
              await this.prisma.bookingSelection.deleteMany({
                where: { submissionId: existing.id },
              });
              await this.prisma.bookingSelection.createMany({
                data: offeringIds.map((offeringId) => ({
                  submissionId: existing.id,
                  offeringId,
                  feeAmount: 0,
                })),
                skipDuplicates: true,
              });
            }
            if (
              existing.formSerial == null &&
              row.formSerial != null &&
              Number(row.formSerial) > 0
            ) {
              const serial = await this.nextFormSerial(
                form.id,
                Number(row.formSerial),
              );
              if (serial === Math.floor(Number(row.formSerial))) {
                await this.prisma.bookingSubmission.update({
                  where: { id: existing.id },
                  data: { formSerial: serial },
                });
              }
            }
            results.push({
              row: rowNum,
              ok: true,
              studentName,
              message: offeringIds.length
                ? 'موجود مسبقًا — تم تحديث المدرسين من الشيت'
                : 'موجود مسبقًا (مدفوع) — تم التخطي',
              studentId: existing.studentId || undefined,
              submissionId: existing.id,
            });
            continue;
          }
          const paidExisting = await this.markPaid(
            existing.id,
            `استيراد ورقي Excel صف ${rowNum} — استمارة قائمة`,
          );
          results.push({
            row: rowNum,
            ok: true,
            studentName,
            message: 'موجود مسبقًا (انتظار دفع) — تم تأكيد الدفع من الشيت',
            studentId: paidExisting.studentId || undefined,
            submissionId: paidExisting.id,
          });
          continue;
        }

        const formSerial = await this.nextFormSerial(
          form.id,
          row.formSerial != null ? Number(row.formSerial) : null,
        );

        const submission = await this.prisma.bookingSubmission.create({
          data: {
            formId: form.id,
            formSerial,
            studentName,
            studentPhone,
            parentPhone,
            notes:
              row.notes ||
              `استيراد ورقي Excel · ${form.gradeLabel}`,
            totalAmount: fee,
            status: BookingStatus.SUBMITTED,
            selections: offeringIds.length
              ? {
                  create: offeringIds.map((offeringId) => ({
                    offeringId,
                    feeAmount: 0,
                  })),
                }
              : undefined,
          },
        });

        const paid = await this.markPaid(
          submission.id,
          `استيراد ورقي Excel صف ${rowNum}`,
        );

        results.push({
          row: rowNum,
          ok: true,
          studentName,
          message: 'تم الاستيراد كمدفوع + حساب طالب',
          studentId: paid.studentId || undefined,
          submissionId: paid.id,
        });
      } catch (e) {
        results.push({
          row: rowNum,
          ok: false,
          studentName: studentName || `صف ${rowNum}`,
          message: e instanceof Error ? e.message : 'فشل الصف',
        });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    return { total: results.length, ok, failed, dryRun, results };
  }
}
