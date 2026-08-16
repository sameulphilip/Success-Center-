import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, PaymentStatus, RoleCode } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import {
  G2_BOOKING_OFFERINGS,
  G3_BOOKING_OFFERINGS,
} from './booking.defaults';
import { AuthService } from '../auth/auth.service';
import {
  isValidMobile,
  normalizePhone,
  phoneToLoginEmail,
} from '../common/phone.util';

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

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
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B2545', light: '#FFFFFF' },
    });

    return {
      formId: form.id,
      slug: form.slug,
      title: form.title,
      subtitle: form.subtitle,
      academicYear: form.academicYear,
      gradeLabel: form.gradeLabel,
      isPublished: form.isPublished,
      formFee: Number(form.defaultFee),
      url,
      qrDataUrl,
    };
  }

  /** Public published form by slug */
  async getPublicForm(slug: string) {
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
      offerings: form.offerings.map((o) => ({
        id: o.id,
        teacherName: o.teacherName,
        subjectName: o.subjectName,
        isOnline: o.isOnline,
        pageNumber: o.pageNumber,
      })),
    };
  }

  /** Sheet teachers for a form grade (G2 / G3). */
  private offeringsForGrade(gradeLabel: string) {
    const slug = this.resolveFormSlug(gradeLabel);
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
    }>,
  ) {
    await this.getFormAdmin(id);
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
      teacherId: string;
      subjectId?: string;
      subjectName: string;
      isOnline?: boolean;
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

    const { teacherId, teacherName } = await this.ensureTeacherForOffering(
      form.gradeLabel,
      data.teacherId,
    );

    let subjectId = data.subjectId || null;
    if (!subjectId) {
      subjectId = await this.resolveSubjectIdByName(subjectName);
    }

    const payload = {
      teacherName,
      subjectName,
      teacherId,
      subjectId,
      isOnline: data.isOnline ?? false,
      feeAmount: data.feeAmount ?? 0,
      pageNumber: data.pageNumber ?? 1,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    };

    if (data.id) {
      return this.prisma.bookingOffering.update({
        where: { id: data.id },
        data: payload,
      });
    }
    return this.prisma.bookingOffering.create({
      data: { formId, ...payload },
    });
  }

  async deleteOffering(offeringId: string) {
    await this.prisma.bookingOffering.delete({ where: { id: offeringId } });
    return { ok: true };
  }

  listSubmissions(formId?: string, status?: BookingStatus, phone?: string) {
    const phoneQ = (phone || '').replace(/\D/g, '');
    return this.prisma.bookingSubmission.findMany({
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
  }

  async submitPublic(input: {
    slug: string;
    studentName: string;
    studentPhone: string;
    parentPhone: string;
    offeringIds: string[];
    notes?: string;
  }) {
    const form = await this.prisma.bookingForm.findFirst({
      where: { slug: input.slug, isPublished: true },
      include: { offerings: { where: { isActive: true } } },
    });
    if (!form) throw new NotFoundException('استمارة الحجز غير متاحة');

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
        selections: {
          create: lines,
        },
      },
      include: {
        selections: { include: { offering: true } },
        form: true,
      },
    });

    return {
      id: submission.id,
      formSerial: submission.formSerial,
      status: submission.status,
      totalAmount,
      studentPhone: studentPhone,
      message: 'تم تسجيل الحجز. برجاء التوجه للسنتر للدفع كاش واستلام الإيصال.',
      nextSteps: [
        'ادفع كاش في السنتر واستلم الإيصال',
        'بعد تأكيد الدفع هيتفتح حسابك تلقائي برقم موبايلك',
        'ادخل من صفحة تسجيل الدخول → طالب، وعيّن كلمة المرور أول مرة',
      ],
      selections: submission.selections.map((s) => ({
        teacherName: s.offering.teacherName,
        subjectName: s.offering.subjectName,
        isOnline: s.offering.isOnline,
      })),
    };
  }

  async markPaid(
    submissionId: string,
    opts?:
      | string
      | {
          note?: string;
          method?: 'CASH' | 'VODAFONE_CASH';
          vodafoneTxn?: string;
        },
  ) {
    const options =
      typeof opts === 'string'
        ? { note: opts, method: 'CASH' as const }
        : opts || {};
    const method =
      options.method === 'VODAFONE_CASH' ? 'VODAFONE_CASH' : 'CASH';
    const vodafoneTxn = (options.vodafoneTxn || '').trim();
    if (method === 'VODAFONE_CASH' && !vodafoneTxn) {
      throw new BadRequestException('رقم عملية فودافون كاش مطلوب');
    }
    const note = options.note;
    const methodLabel = method === 'VODAFONE_CASH' ? 'فودافون كاش' : 'كاش';

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

    return this.prisma.$transaction(async (tx) => {
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
            (method === 'VODAFONE_CASH'
              ? `${bookingLabel} · فودافون كاش · ${vodafoneTxn}`
              : bookingLabel),
        },
      });

      // Auto portal account: login by student phone, set password first time
      const phone = normalizePhone(submission.studentPhone);
      let portalAccount: {
        phone: string;
        mustSetPassword: boolean;
        created: boolean;
      } | null = null;

      if (isValidMobile(phone)) {
        const studentRole = await tx.role.findUnique({
          where: { code: RoleCode.STUDENT },
        });
        if (studentRole) {
          let account =
            (await tx.user.findUnique({ where: { phone } })) ||
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
            if (!account.phone) {
              account = await tx.user.update({
                where: { id: account.id },
                data: { phone },
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
        }
      }

      const updated = await tx.bookingSubmission.update({
        where: { id: submission.id },
        data: {
          status: BookingStatus.PAID,
          paidAt: new Date(),
          receiptNumber,
          studentId: student.id,
          paymentMethod: method,
          vodafoneTxn: method === 'VODAFONE_CASH' ? vodafoneTxn : null,
          notes: note || submission.notes,
        },
        include: {
          form: true,
          selections: { include: { offering: true } },
        },
      });

      return { ...updated, portalAccount };
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
      candidates = ['الأول الثانوي', 'الصف الأول الثانوي', 'الصف العاشر'];
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
    if (lower.includes('g2') || raw.includes('ثاني')) return 'g2-2026-2027';
    if (lower.includes('g3') || raw.includes('ثالث')) return 'g3-2026-2027';
    if (raw.startsWith('g2-') || raw.startsWith('g3-')) return raw;
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
        const os = this.foldTeacherName(o.subjectName);
        return foldedNames.some(
          (n) => ot.includes(n) || n.includes(ot) || os.includes(n) || n.includes(os),
        );
      })
      .map((o) => o.id);
  }

  /** Ensure G2/G3 paper forms exist and sheet teachers stay in sync. */
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

        const existingPaid = await this.prisma.bookingSubmission.findFirst({
          where: {
            formId: form.id,
            studentPhone,
            status: BookingStatus.PAID,
          },
        });
        if (existingPaid) {
          // Backfill teacher selections if import previously skipped them
          if (offeringIds.length) {
            const existingSel = await this.prisma.bookingSelection.findMany({
              where: { submissionId: existingPaid.id },
              select: { offeringId: true },
            });
            const have = new Set(existingSel.map((s) => s.offeringId));
            const missing = offeringIds.filter((id) => !have.has(id));
            if (missing.length) {
              await this.prisma.bookingSelection.createMany({
                data: missing.map((offeringId) => ({
                  submissionId: existingPaid.id,
                  offeringId,
                  feeAmount: 0,
                })),
                skipDuplicates: true,
              });
            }
          }
          if (
            existingPaid.formSerial == null &&
            row.formSerial != null &&
            Number(row.formSerial) > 0
          ) {
            const serial = await this.nextFormSerial(
              form.id,
              Number(row.formSerial),
            );
            if (serial === Math.floor(Number(row.formSerial))) {
              await this.prisma.bookingSubmission.update({
                where: { id: existingPaid.id },
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
            studentId: existingPaid.studentId || undefined,
            submissionId: existingPaid.id,
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
