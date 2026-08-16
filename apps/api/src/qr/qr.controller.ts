import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { QrService } from './qr.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('qr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QrController {
  constructor(
    private readonly qr: QrService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('mine')
  @Roles(RoleCode.STUDENT)
  async mine(@CurrentUser() user: { userId: string }) {
    const student = await this.prisma.student.findFirst({
      where: { userId: user.userId },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return this.qr.studentQr(student.id);
  }

  @Get('students/:id')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.TEACHER,
    RoleCode.STUDENT,
    RoleCode.PARENT,
  )
  studentQr(@Param('id') id: string) {
    return this.qr.studentQr(id);
  }

  @Get('student-login')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
  )
  studentLoginQr(@Query('baseUrl') baseUrl?: string) {
    return this.qr.studentLoginQr(baseUrl);
  }

  @Get('gate')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
  )
  gateQr() {
    return this.qr.gateQr();
  }
}
