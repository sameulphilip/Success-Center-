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

  listForms() {
    return this.prisma.bookingForm.findMany({
      include: {
        _count: { select: { offerings: true, submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    return form;
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

  async upsertOffering(
    formId: string,
    data: {
      id?: string;
      teacherName: string;
      subjectName: string;
      isOnline?: boolean;
      feeAmount?: number;
      pageNumber?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const form = await this.getFormAdmin(formId);
    let offering;
    if (data.id) {
      offering = await this.prisma.bookingOffering.update({
        where: { id: data.id },
        data: {
          teacherName: data.teacherName,
          subjectName: data.subjectName,
          isOnline: data.isOnline ?? false,
          feeAmount: data.feeAmount ?? 0,
          pageNumber: data.pageNumber ?? 1,
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        },
      });
    } else {
      offering = await this.prisma.bookingOffering.create({
        data: {
          formId,
          teacherName: data.teacherName,
          subjectName: data.subjectName,
          isOnline: data.isOnline ?? false,
          feeAmount: data.feeAmount ?? 0,
          pageNumber: data.pageNumber ?? 1,
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        },
      });
    }
    await this.linkTeachersToGrade(form.gradeLabel, [data.teacherName]);
    return offering;
  }

  async deleteOffering(offeringId: string) {
    await this.prisma.bookingOffering.delete({ where: { id: offeringId } });
    return { ok: true };
  }

  listSubmissions(formId?: string, status?: BookingStatus) {
    return this.prisma.bookingSubmission.findMany({
      where: {
        ...(formId ? { formId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        form: true,
        selections: { include: { offering: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
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

    const submission = await this.prisma.bookingSubmission.create({
      data: {
        formId: form.id,
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

  async markPaid(submissionId: string, note?: string) {
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
      const invoice = await tx.invoice.create({
        data: {
          studentId: student.id,
          feeAmount: amount,
          paidAmount: amount,
          status: PaymentStatus.PAID,
          note: `حجز استمارة ${submission.form.slug} · كاش`,
        },
      });

      await tx.payment.create({
        data: {
          studentId: student.id,
          invoiceId: invoice.id,
          amount,
          method: 'CASH',
          receiptNumber,
          note: note || `تأكيد دفع حجز ${submission.id}`,
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
      label.includes('ثاني') ||
      label.includes('الحادي عشر') ||
      label.includes('grade 11') ||
      /\b11\b/.test(label)
    ) {
      candidates = ['الثاني الثانوي', 'الصف الثاني الثانوي', 'الصف الحادي عشر'];
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

  /** Ensure G2/G3 paper forms exist (idempotent). */
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
        title: 'استمارة حجز الصف الثاني الثانوي',
        gradeLabel: 'الثاني الثانوي',
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
      }
      const names = (form.offerings?.length
        ? form.offerings.map((o) => o.teacherName)
        : spec.offerings.map((o) => o.teacherName)
      ).filter(Boolean);
      await this.linkTeachersToGrade(spec.gradeLabel, names);
    }
    return this.listForms();
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

        const submission = await this.prisma.bookingSubmission.create({
          data: {
            formId: form.id,
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
