import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AttendanceSource, AttendanceStatus, RoleCode } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('sessions')
  listSessions(@Query('groupId') groupId?: string) {
    return this.attendance.listSessions(groupId);
  }

  @Get('absentees/today')
  absentees() {
    return this.attendance.absenteesToday();
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.attendance.getSession(id);
  }

  @Post('sessions')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.TEACHER,
  )
  createSession(
    @Body() body: { groupId: string; sessionDate: string; notes?: string },
  ) {
    return this.attendance.createSession(
      body.groupId,
      body.sessionDate,
      body.notes,
    );
  }

  @Post('mark')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.TEACHER,
  )
  mark(
    @Body()
    body: {
      sessionId: string;
      records: {
        studentId?: string;
        teacherId?: string;
        status: AttendanceStatus;
        source?: AttendanceSource;
        note?: string;
      }[];
    },
  ) {
    return this.attendance.mark(body.sessionId, body.records);
  }

  @Post('qr')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.TEACHER,
  )
  markQr(
    @Body()
    body: {
      studentUid?: string;
      payload?: string;
      groupId: string;
      source?: AttendanceSource;
    },
  ) {
    const raw = body.payload || body.studentUid;
    if (!raw) {
      return { ok: false, message: 'payload or studentUid required' };
    }
    return this.attendance.markByQr(raw, body.groupId, body.source);
  }

  @Post('notify-absentees')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
  )
  notifyAbsentees() {
    return this.attendance.resendAbsenceNotifications();
  }
}
