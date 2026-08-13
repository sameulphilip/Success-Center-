import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.ACCOUNTANT,
    RoleCode.TEACHER,
  )
  list(@Query('q') q?: string, @Query('gradeLevelId') gradeLevelId?: string) {
    return this.students.list({ q, gradeLevelId });
  }

  @Get('parents/all')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
  )
  listParents() {
    return this.students.listParents();
  }

  @Get('mine/children')
  @Roles(RoleCode.PARENT, RoleCode.STUDENT)
  mine(@CurrentUser() user: { userId: string; role: string }) {
    return this.students.mine(user.userId, user.role);
  }

  @Get(':id')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.ACCOUNTANT,
    RoleCode.TEACHER,
    RoleCode.PARENT,
    RoleCode.STUDENT,
  )
  get(@Param('id') id: string) {
    return this.students.get(id);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  create(
    @Body()
    body: {
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      gradeLevelId?: string;
      notes?: string;
      parentIds?: string[];
    },
  ) {
    return this.students.create(body);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.students.update(id, body as never);
  }

  @Post('parents')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  createParent(
    @Body()
    body: {
      firstName: string;
      lastName: string;
      phone: string;
      email?: string;
      studentId?: string;
    },
  ) {
    return this.students.createParent(body);
  }

  @Post(':id/parents/:parentId')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  linkParent(
    @Param('id') id: string,
    @Param('parentId') parentId: string,
    @Body() body: { relation?: string },
  ) {
    return this.students.linkParent(id, parentId, body.relation);
  }
}
