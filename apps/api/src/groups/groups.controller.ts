import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list() {
    return this.groups.list();
  }

  @Get('calendar/all')
  calendar() {
    return this.groups.calendar();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.groups.get(id);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  create(
    @Body()
    body: {
      name: string;
      subjectId: string;
      gradeLevelId: string;
      teacherId: string;
      classroomId?: string;
      feeAmount: number;
      capacity?: number;
      scheduleSlots?: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
      }[];
    },
  ) {
    return this.groups.create(body);
  }

  @Post(':id/enroll')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  enroll(@Param('id') id: string, @Body() body: { studentId: string }) {
    return this.groups.enroll(id, body.studentId);
  }
}
