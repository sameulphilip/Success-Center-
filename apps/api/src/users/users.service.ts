import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_CATALOG, describeAccess } from './access-catalog';

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  roleId: true,
  role: {
    select: {
      id: true,
      code: true,
      nameAr: true,
      nameEn: true,
      permissions: true,
    },
  },
  teacher: { select: { id: true } },
  parent: { select: { id: true } },
  student: { select: { id: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  accessCatalog() {
    return ACCESS_CATALOG;
  }

  list() {
    return this.prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('الحساب غير موجود');
    return {
      ...user,
      access: describeAccess(user.role.permissions),
    };
  }

  async create(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    roleCode: RoleCode;
    isActive?: boolean;
  }) {
    const email = data.email.trim().toLowerCase();
    if (!email || !data.password || !data.fullName?.trim()) {
      throw new BadRequestException('البريد والاسم وكلمة المرور مطلوبين');
    }
    if (data.password.length < 6) {
      throw new BadRequestException('كلمة المرور قصيرة جدًا');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('البريد مستخدم بالفعل');

    const role = await this.prisma.role.findUnique({
      where: { code: data.roleCode },
    });
    if (!role) throw new BadRequestException('الدور غير موجود');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: data.fullName.trim(),
        phone: data.phone?.trim() || null,
        roleId: role.id,
        isActive: data.isActive ?? true,
      },
      select: userSelect,
    });
    return { ...user, access: describeAccess(user.role.permissions) };
  }

  async update(
    id: string,
    data: Partial<{
      fullName: string;
      phone: string | null;
      email: string;
      roleCode: RoleCode;
      isActive: boolean;
      password: string;
    }>,
    actorUserId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('الحساب غير موجود');

    if (
      actorUserId &&
      actorUserId === id &&
      data.isActive === false
    ) {
      throw new BadRequestException('لا يمكنك تعطيل حسابك أنت');
    }

    let roleId = user.roleId;
    if (data.roleCode) {
      const role = await this.prisma.role.findUnique({
        where: { code: data.roleCode },
      });
      if (!role) throw new BadRequestException('الدور غير موجود');
      if (
        actorUserId === id &&
        user.role.code === RoleCode.SUPER_ADMIN &&
        data.roleCode !== RoleCode.SUPER_ADMIN
      ) {
        throw new BadRequestException('لا يمكنك إزالة دور مدير النظام من نفسك');
      }
      roleId = role.id;
    }

    if (data.email) {
      const email = data.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (clash) throw new BadRequestException('البريد مستخدم بالفعل');
    }

    if (data.password !== undefined && data.password.length < 6) {
      throw new BadRequestException('كلمة المرور قصيرة جدًا');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined
          ? { fullName: data.fullName.trim() }
          : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined
          ? { email: data.email.trim().toLowerCase() }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.roleCode ? { roleId } : {}),
        ...(data.password
          ? { passwordHash: await bcrypt.hash(data.password, 10) }
          : {}),
        // invalidate refresh sessions when password or role changes
        ...((data.password || data.roleCode || data.isActive === false)
          ? { refreshToken: null }
          : {}),
      },
      select: userSelect,
    });

    return { ...updated, access: describeAccess(updated.role.permissions) };
  }

  async updateRolePermissions(roleId: string, permissions: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.code === RoleCode.SUPER_ADMIN) {
      throw new BadRequestException('صلاحيات مدير النظام ثابتة (*)');
    }
    if (!Array.isArray(permissions) || !permissions.length) {
      throw new BadRequestException('اختر صلاحية واحدة على الأقل');
    }
    const allowed = new Set(ACCESS_CATALOG.map((a) => a.code));
    const cleaned = [...new Set(permissions)].filter((p) => allowed.has(p));
    if (!cleaned.length) {
      throw new BadRequestException('صلاحيات غير صالحة');
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: cleaned },
      include: { _count: { select: { users: true } } },
    });
    return {
      ...updated,
      access: describeAccess(updated.permissions),
    };
  }
}
