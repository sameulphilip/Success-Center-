import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  isValidMobile,
  normalizePhone,
  phoneToLoginEmail,
} from '../common/phone.util';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(params?: { q?: string; gradeLevelId?: string }) {
    return this.prisma.student.findMany({
      where: {
        isActive: true,
        ...(params?.gradeLevelId ? { gradeLevelId: params.gradeLevelId } : {}),
        ...(params?.q
          ? {
              OR: [
                { firstName: { contains: params.q, mode: 'insensitive' } },
                { lastName: { contains: params.q, mode: 'insensitive' } },
                { phone: { contains: params.q } },
                { studentUid: { contains: params.q } },
              ],
            }
          : {}),
      },
      include: {
        gradeLevel: true,
        parents: { include: { parent: true } },
        enrollments: {
          where: { isActive: true },
          include: {
            group: { include: { subject: true, teacher: true } },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async get(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        gradeLevel: true,
        parents: { include: { parent: true } },
        enrollments: {
          include: {
            group: {
              include: {
                subject: true,
                teacher: true,
                classroom: true,
                scheduleSlots: true,
              },
            },
          },
        },
        attendance: {
          take: 100,
          orderBy: { markedAt: 'desc' },
          include: {
            session: { include: { group: { include: { subject: true } } } },
          },
        },
        grades: {
          include: { exam: { include: { subject: true, group: true } } },
          orderBy: { exam: { examDate: 'desc' } },
        },
        invoices: { include: { payments: true, group: true } },
        payments: { orderBy: { paidAt: 'desc' } },
        sessionEntries: {
          take: 200,
          orderBy: { createdAt: 'desc' },
          include: {
            session: {
              include: { teacher: true, subject: true },
            },
          },
        },
        blocks: {
          where: { isActive: true },
          include: { teacher: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const phoneVariants = new Set<string>();
    if (student.phone?.trim()) phoneVariants.add(student.phone.trim());
    const normalized = student.phone ? normalizePhone(student.phone) : '';
    if (normalized) phoneVariants.add(normalized);

    const bookingSubmissions = await this.prisma.bookingSubmission.findMany({
      where: {
        OR: [
          { studentId: id },
          ...[...phoneVariants].map((studentPhone) => ({ studentPhone })),
        ],
      },
      include: {
        form: {
          select: {
            id: true,
            title: true,
            gradeLabel: true,
            academicYear: true,
            slug: true,
          },
        },
        selections: {
          include: {
            offering: {
              select: {
                teacherName: true,
                subjectName: true,
                isOnline: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const paidBooking = bookingSubmissions.find((b) => b.status === 'PAID');

    return {
      ...student,
      bookingSubmissions,
      formFeePaid: !!paidBooking,
      paidBooking: paidBooking || null,
    };
  }

  async create(data: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    gradeLevelId?: string;
    notes?: string;
    parentIds?: string[];
  }) {
    const student = await this.prisma.student.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email || null,
        gradeLevelId: data.gradeLevelId,
        notes: data.notes,
        parents: data.parentIds?.length
          ? {
              create: data.parentIds.map((parentId) => ({ parentId })),
            }
          : undefined,
      },
      include: {
        gradeLevel: true,
        parents: { include: { parent: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'STUDENT_CREATED',
        entityType: 'Student',
        entityId: student.id,
        details: { name: `${student.firstName} ${student.lastName}` },
      },
    });

    return student;
  }

  async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      gradeLevelId?: string;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    await this.get(id);
    return this.prisma.student.update({
      where: { id },
      data,
      include: {
        gradeLevel: true,
        parents: { include: { parent: true } },
      },
    });
  }

  async linkParent(studentId: string, parentId: string, relation = 'guardian') {
    await this.get(studentId);
    return this.prisma.studentParent.upsert({
      where: { studentId_parentId: { studentId, parentId } },
      create: { studentId, parentId, relation },
      update: { relation },
    });
  }

  async createParent(data: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    studentId?: string;
  }) {
    const parent = await this.prisma.parent.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        ...(data.studentId
          ? { students: { create: [{ studentId: data.studentId }] } }
          : {}),
      },
      include: { students: { include: { student: true } } },
    });
    return parent;
  }

  listParents() {
    return this.prisma.parent.findMany({
      include: { students: { include: { student: true } } },
      orderBy: { firstName: 'asc' },
    });
  }

  async mine(userId: string, role: string) {
    if (role === 'STUDENT') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { student: true },
      });
      const studentId =
        user?.student?.id ||
        (
          await this.prisma.student.findFirst({ where: { userId } })
        )?.id;
      if (!studentId) return [];
      return [await this.get(studentId)];
    }

    const parent = await this.prisma.parent.findFirst({
      where: { userId },
      include: { students: true },
    });
    if (!parent) return [];
    return Promise.all(parent.students.map((s) => this.get(s.studentId)));
  }

  async getPortalLogin(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const phone = student.phone ? normalizePhone(student.phone) : '';
    const account =
      student.user ||
      (phone
        ? await this.prisma.user.findUnique({ where: { phone } })
        : null) ||
      (phone
        ? await this.prisma.user.findUnique({
            where: { email: phoneToLoginEmail(phone) },
          })
        : null);

    return {
      studentId: student.id,
      name: `${student.firstName} ${student.lastName}`.trim(),
      phone: account?.phone || phone || student.phone || null,
      hasAccount: !!account,
      pin: account?.portalPin || null,
      mustSetPassword: account?.mustSetPassword ?? true,
      isActive: account?.isActive ?? false,
    };
  }

  async setPortalLogin(
    studentId: string,
    pin: string,
    opts?: { mustSetPassword?: boolean },
  ) {
    const password = String(pin || '').trim();
    if (password.length < 6) {
      throw new BadRequestException('الرقم السري لازم 6 حروف أو أرقام على الأقل');
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const phone = student.phone ? normalizePhone(student.phone) : '';
    if (!isValidMobile(phone)) {
      throw new BadRequestException(
        'رقم موبايل الطالب غير صالح — صلّحه في بيانات الطالب أولاً',
      );
    }

    const studentRole = await this.prisma.role.findUnique({
      where: { code: RoleCode.STUDENT },
    });
    if (!studentRole) {
      throw new BadRequestException('دور الطالب غير موجود');
    }

    let account =
      (student.userId
        ? await this.prisma.user.findUnique({ where: { id: student.userId } })
        : null) ||
      (await this.prisma.user.findUnique({ where: { phone } })) ||
      (await this.prisma.user.findUnique({
        where: { email: phoneToLoginEmail(phone) },
      }));

    const passwordHash = await bcrypt.hash(password, 10);
    const mustSetPassword = opts?.mustSetPassword === true;

    if (!account) {
      const email = phoneToLoginEmail(phone);
      const emailTaken = await this.prisma.user.findUnique({ where: { email } });
      account = await this.prisma.user.create({
        data: {
          email: emailTaken
            ? `${phone}.${Date.now()}@phone.success.local`
            : email,
          phone,
          fullName: `${student.firstName} ${student.lastName}`.trim(),
          passwordHash,
          portalPin: password,
          mustSetPassword,
          roleId: studentRole.id,
          isActive: true,
          student: { connect: { id: student.id } },
        },
      });
    } else {
      account = await this.prisma.user.update({
        where: { id: account.id },
        data: {
          phone: account.phone || phone,
          passwordHash,
          portalPin: password,
          mustSetPassword,
          isActive: true,
          refreshToken: null,
        },
      });
      if (!student.userId) {
        await this.prisma.student.update({
          where: { id: student.id },
          data: { userId: account.id },
        });
      }
    }

    return {
      studentId: student.id,
      phone: account.phone || phone,
      hasAccount: true,
      pin: password,
      mustSetPassword: account.mustSetPassword,
      isActive: true,
    };
  }
}
