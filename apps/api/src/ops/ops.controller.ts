import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  BlockScope,
  ClassSessionStatus,
  OpsCheckInSource,
  RefundReason,
  RoleCode,
  SessionPayMethod,
} from '@prisma/client';
import { OpsService, parseStudentQr } from './ops.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleCode.SUPER_ADMIN,
  RoleCode.CENTER_MANAGER,
  RoleCode.RECEPTION,
  RoleCode.ACCOUNTANT,
)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('students/lookup')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  async lookupStudent(
    @Query('phone') phone?: string,
    @Query('uid') uid?: string,
    @Query('id') id?: string,
    @Query('qr') qr?: string,
    @Query('name') name?: string,
  ) {
    let studentUid = uid;
    let studentId = id;
    if (qr?.trim()) {
      const parsed = parseStudentQr(qr);
      if (parsed.studentUid) studentUid = parsed.studentUid;
      if (parsed.id) studentId = parsed.id;
    }
    const student = await this.ops.findStudent({
      phone,
      studentUid,
      id: studentId,
      name,
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    return student;
  }

  @Get('sessions')
  list(
    @Query('status') status?: ClassSessionStatus,
    @Query('date') date?: string,
  ) {
    return this.ops.listSessions(status, date);
  }

  @Get('sessions/open')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.ACCOUNTANT,
    RoleCode.TEACHER,
  )
  async listOpen(@CurrentUser() user: { userId: string; role: string }) {
    const teacherId =
      user?.role === RoleCode.TEACHER
        ? await this.ops.resolveTeacherId(user.userId)
        : undefined;
    return this.ops.listOpenSessions(teacherId || undefined);
  }

  @Get('sessions/:id')
  get(@Param('id') id: string) {
    return this.ops.getSession(id);
  }

  @Post('sessions')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  open(
    @Body()
    body: {
      teacherId?: string;
      teacherName?: string;
      subjectId?: string;
      title?: string;
      feeAmount: number;
      centerAmount?: number;
      teacherPercent?: number;
      notes?: string;
      sessionDate?: string;
    },
    @CurrentUser() user: { userId: string },
  ) {
    return this.ops.openSession(body, user?.userId);
  }

  @Patch('sessions/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      teacherId?: string;
      teacherName?: string;
      subjectId?: string | null;
      title?: string | null;
      feeAmount?: number;
      centerAmount?: number;
      notes?: string | null;
    },
    @CurrentUser() user: { role: string },
  ) {
    return this.ops.updateOpenSession(id, body, user?.role);
  }

  @Post('sessions/:id/pay')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  pay(
    @Param('id') id: string,
    @Body()
    body: {
      studentId?: string;
      phone?: string;
      studentUid?: string;
      studentName?: string;
      parentPhone?: string;
      gradeLevelId?: string;
      method: SessionPayMethod;
      vodafoneTxn?: string;
      amount?: number;
      note?: string;
    },
    @CurrentUser() user: { userId: string },
  ) {
    return this.ops.collectPayment(id, body, user?.userId);
  }

  @Post('entries/:id/confirm')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.ops.confirmPayment(id, user?.userId);
  }

  @Post('check-in')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.TEACHER,
  )
  checkIn(
    @Body()
    body: {
      sessionId?: string;
      studentId?: string;
      phone?: string;
      studentUid?: string;
      qrPayload?: string;
      teacherId?: string;
      source?: OpsCheckInSource;
    },
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.ops.checkIn(
      {
        ...body,
        source: body.source || OpsCheckInSource.MANUAL,
      },
      { userId: user?.userId, role: user?.role },
    );
  }

  @Post('sessions/:id/close')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  close(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.ops.closeSession(id, user?.userId);
  }

  @Post('sessions/:id/pay-teacher')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  payTeacher(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.ops.payTeacherShare(id, user?.userId);
  }

  @Delete('sessions/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { role: string },
  ) {
    return this.ops.deleteSession(id, user?.role);
  }

  @Post('entries/:id/refund')
  refund(
    @Param('id') id: string,
    @Body()
    body: { amount?: number; reason: RefundReason; note?: string },
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.ops.refund(id, body, {
      userId: user.userId,
      role: user.role,
    });
  }

  @Get('blocks')
  blocks() {
    return this.ops.listBlocks();
  }

  @Post('blocks')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  createBlock(
    @Body()
    body: {
      studentId: string;
      scope: BlockScope;
      teacherId?: string;
      reason: string;
    },
    @CurrentUser() user: { userId: string },
  ) {
    return this.ops.createBlock(body, user?.userId);
  }

  @Patch('blocks/:id/deactivate')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  deactivate(@Param('id') id: string) {
    return this.ops.deactivateBlock(id);
  }
}
