import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  isValidMobile,
  normalizePhone,
  phoneToLoginEmail,
} from '../common/phone.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        role: true,
        teacher: true,
        parent: true,
        student: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (user.mustSetPassword) {
      throw new UnauthorizedException(
        'هذا الحساب يحتاج تعيين كلمة مرور أول مرة — استخدم الدخول برقم الموبايل',
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    return this.finishLogin(user);
  }

  private async findPortalUser(phoneRaw: string) {
    const phone = normalizePhone(phoneRaw);
    if (!isValidMobile(phone)) return null;
    const email = phoneToLoginEmail(phone);
    return (
      (await this.prisma.user.findUnique({
        where: { phone },
        include: {
          role: true,
          teacher: true,
          parent: true,
          student: true,
        },
      })) ||
      (await this.prisma.user.findUnique({
        where: { email },
        include: {
          role: true,
          teacher: true,
          parent: true,
          student: true,
        },
      })) ||
      (
        await this.prisma.student.findFirst({
          where: { OR: [{ phone }, { phone: String(phoneRaw || '').trim() }] },
          include: {
            user: {
              include: {
                role: true,
                teacher: true,
                parent: true,
                student: true,
              },
            },
          },
        })
      )?.user ||
      null
    );
  }

  /** Public: check if phone can login / needs first password */
  async phoneStatus(phoneRaw: string) {
    const phone = normalizePhone(phoneRaw);
    if (!isValidMobile(phone)) {
      throw new BadRequestException('رقم الموبايل غير صالح');
    }

    const user = await this.findPortalUser(phoneRaw);

    if (!user || !user.isActive) {
      return {
        status: 'not_ready' as const,
        message:
          'الحساب مش جاهز بعد. بعد ما الاستقبال يأكد الدفع (تحويل أو كاش) بيتفتح الحساب، وأول دخول تعيّن الرقم السري.',
      };
    }

    if (user.mustSetPassword) {
      return {
        status: 'needs_password' as const,
        fullName: user.fullName,
        phone: user.phone || phone,
        message: 'أول مرة: اكتب الرقم السري لحسابك',
      };
    }

    return {
      status: 'ready' as const,
      fullName: user.fullName,
      phone: user.phone || phone,
      role: user.role.code,
      message: 'أدخل الرقم السري للدخول',
    };
  }

  /** First-time password setup with phone, then login */
  async phoneSetup(phoneRaw: string, password: string) {
    const phone = normalizePhone(phoneRaw);
    if (!isValidMobile(phone)) {
      throw new BadRequestException('رقم الموبايل غير صالح');
    }
    if (!password || password.length < 6) {
      throw new BadRequestException('الرقم السري لازم 6 حروف أو أرقام على الأقل');
    }

    const user = await this.findPortalUser(phoneRaw);

    if (!user || !user.isActive) {
      throw new BadRequestException(
        'الحساب غير متاح. تأكد إن الاستقبال أكّد الدفع.',
      );
    }
    if (!user.mustSetPassword) {
      throw new BadRequestException(
        'الحساب مفعّل بالفعل — سجّل الدخول بالرقم السري',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustSetPassword: false, portalPin: password },
      include: {
        role: true,
        teacher: true,
        parent: true,
        student: true,
      },
    });

    return this.finishLogin(updated);
  }

  async phoneLogin(phoneRaw: string, password: string) {
    const phone = normalizePhone(phoneRaw);
    if (!isValidMobile(phone)) {
      throw new BadRequestException('رقم الموبايل غير صالح');
    }

    const user = await this.findPortalUser(phoneRaw);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (user.mustSetPassword) {
      throw new BadRequestException(
        'لازم تعيّن الرقم السري أول مرة قبل الدخول',
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    return this.finishLogin(user);
  }

  /**
   * Forgot PIN: phone + student card UID → set a new PIN and login.
   * Parents can use any linked child's UID.
   */
  async phoneResetPassword(
    phoneRaw: string,
    studentUidRaw: string,
    password: string,
  ) {
    const phone = normalizePhone(phoneRaw);
    if (!isValidMobile(phone)) {
      throw new BadRequestException('رقم الموبايل غير صالح');
    }
    const studentUid = String(studentUidRaw || '').trim();
    if (!studentUid) {
      throw new BadRequestException('اكتب كود الطالب المكتوب على الكارت');
    }
    if (!password || password.length < 6) {
      throw new BadRequestException(
        'الرقم السري لازم 6 حروف أو أرقام على الأقل',
      );
    }

    const user = await this.findPortalUser(phoneRaw);
    if (!user || !user.isActive) {
      throw new BadRequestException(
        'الحساب غير متاح. تأكد من رقم الموبايل أو راجع الاستقبال.',
      );
    }

    const matched = await this.verifyPortalUid(user, studentUid);
    if (!matched) {
      throw new UnauthorizedException(
        'كود الطالب غير مطابق لهذا الموبايل — راجع الكارت أو الاستقبال',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustSetPassword: false,
        portalPin: password,
      },
      include: {
        role: true,
        teacher: true,
        parent: true,
        student: true,
      },
    });

    return this.finishLogin(updated);
  }

  /** Logged-in student/parent changes PIN with the current one. */
  async changePortalPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException(
        'الرقم السري الجديد لازم 6 حروف أو أرقام على الأقل',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        teacher: true,
        parent: true,
        student: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    const role = user.role.code;
    if (role !== 'STUDENT' && role !== 'PARENT') {
      throw new ForbiddenException('تغيير الرقم السري للبوابة فقط');
    }
    if (user.mustSetPassword) {
      throw new BadRequestException('لازم تعيّن الرقم السري أول مرة من صفحة الدخول');
    }
    const ok = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('الرقم السري الحالي غير صحيح');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustSetPassword: false,
        portalPin: newPassword,
      },
    });
    return { ok: true, message: 'تم تغيير الرقم السري' };
  }

  private async verifyPortalUid(
    user: {
      student?: { studentUid?: string | null } | null;
      parent?: { id: string } | null;
    },
    studentUid: string,
  ) {
    const want = studentUid.toLowerCase();
    if (user.student?.studentUid?.toLowerCase() === want) return true;
    if (!user.parent?.id) return false;
    const link = await this.prisma.studentParent.findFirst({
      where: {
        parentId: user.parent.id,
        student: {
          OR: [
            { studentUid: { equals: studentUid, mode: 'insensitive' } },
            { studentUid: studentUid },
          ],
        },
      },
      select: { studentId: true },
    });
    return Boolean(link);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        teacher: true,
        parent: true,
        student: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<{ sub: string; type?: string }>(
        refreshToken,
        { secret: process.env.JWT_SECRET || 'dev-secret' },
      );
      if (payload.type !== 'refresh') {
        throw new ForbiddenException('Invalid refresh token');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });
      if (!user || user.refreshToken !== refreshToken) {
        throw new ForbiddenException('Invalid refresh token');
      }
      return this.issueTokens(user.id, user.email, user.role.code);
    } catch {
      throw new ForbiddenException('Invalid refresh token');
    }
  }

  /** Placeholder hash until student sets password */
  static async tempPasswordHash() {
    return bcrypt.hash(randomBytes(24).toString('hex'), 10);
  }

  private async finishLogin(user: {
    id: string;
    email: string;
    fullName: string;
    role: { code: string; permissions: string[] };
    teacher?: { id: string } | null;
    parent?: { id: string } | null;
    student?: { id: string } | null;
  }) {
    const tokens = await this.issueTokens(user.id, user.email, user.role.code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });
    return {
      ...tokens,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    fullName: string;
    phone?: string | null;
    mustSetPassword?: boolean;
    role: { code: string; permissions: string[] };
    teacher?: { id: string } | null;
    parent?: { id: string } | null;
    student?: { id: string } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      mustSetPassword: user.mustSetPassword ?? false,
      role: user.role.code,
      permissions: user.role.permissions,
      teacherId: user.teacher?.id ?? null,
      parentId: user.parent?.id ?? null,
      studentId: user.student?.id ?? null,
    };
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      email,
      role,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, role, type: 'refresh' },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' },
    );
    return { accessToken, refreshToken };
  }
}
