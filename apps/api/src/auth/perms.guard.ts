import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { expandPermissions } from '../users/access-catalog';
import { PERMS_KEY } from './perms.decorator';

@Injectable()
export class PermsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const needed = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!needed?.length) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId as string | undefined;
    if (!userId) throw new ForbiddenException('Insufficient permissions');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { permissions: true } } },
    });
    const have = expandPermissions(user?.role.permissions || []);
    if (have.has('*')) return true;
    const ok = needed.some((code) => have.has(code));
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
