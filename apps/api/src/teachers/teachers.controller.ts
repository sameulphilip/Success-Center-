import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('teachers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.ACCOUNTANT,
  )
  list(@Query('q') q?: string) {
    return this.teachers.list(q);
  }

  @Get(':id')
  @Roles(
    RoleCode.SUPER_ADMIN,
    RoleCode.CENTER_MANAGER,
    RoleCode.RECEPTION,
    RoleCode.ACCOUNTANT,
    RoleCode.TEACHER,
  )
  get(@Param('id') id: string) {
    return this.teachers.get(id);
  }

  @Get(':id/performance')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.TEACHER)
  performance(@Param('id') id: string) {
    return this.teachers.performance(id);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  create(
    @Body()
    body: {
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      hourlyRate?: number;
      subjectIds?: string[];
      gradeLevelIds?: string[];
    },
  ) {
    return this.teachers.create(body);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.teachers.update(id, body as never);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  remove(@Param('id') id: string) {
    return this.teachers.remove(id);
  }
}
