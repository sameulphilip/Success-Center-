import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ExamsService } from './exams.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  list(@Query('groupId') groupId?: string) {
    return this.exams.list(groupId);
  }

  @Get('student/:studentId/report')
  studentReport(@Param('studentId') studentId: string) {
    return this.exams.studentReport(studentId);
  }

  @Post('compare')
  compare(@Body() body: { examIds: string[] }) {
    return this.exams.compare(body.examIds);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.exams.get(id);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.TEACHER)
  create(
    @Body()
    body: {
      title: string;
      groupId: string;
      subjectId: string;
      maxScore: number;
      examDate: string;
    },
  ) {
    return this.exams.create(body);
  }

  @Post(':id/grades')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.TEACHER)
  upsertGrades(
    @Param('id') id: string,
    @Body()
    body: { grades: { studentId: string; score: number; note?: string }[] },
  ) {
    return this.exams.upsertGrades(id, body.grades);
  }
}
