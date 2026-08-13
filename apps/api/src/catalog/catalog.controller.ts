import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('grade-levels')
  listGrades() {
    return this.catalog.listGradeLevels();
  }

  @Post('grade-levels')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  createGrade(
    @Body() body: { nameAr: string; nameEn: string; sortOrder?: number },
  ) {
    return this.catalog.createGradeLevel(body);
  }

  @Patch('grade-levels/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  updateGrade(
    @Param('id') id: string,
    @Body() body: { nameAr?: string; nameEn?: string; sortOrder?: number },
  ) {
    return this.catalog.updateGradeLevel(id, body);
  }

  @Delete('grade-levels/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  deleteGrade(@Param('id') id: string) {
    return this.catalog.deleteGradeLevel(id);
  }

  @Get('subjects')
  listSubjects() {
    return this.catalog.listSubjects();
  }

  @Post('subjects')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  createSubject(@Body() body: { nameAr: string; nameEn: string }) {
    return this.catalog.createSubject(body);
  }

  @Patch('subjects/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  updateSubject(
    @Param('id') id: string,
    @Body() body: { nameAr?: string; nameEn?: string },
  ) {
    return this.catalog.updateSubject(id, body);
  }

  @Delete('subjects/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  deleteSubject(@Param('id') id: string) {
    return this.catalog.deleteSubject(id);
  }

  @Get('classrooms')
  listClassrooms() {
    return this.catalog.listClassrooms();
  }

  @Post('classrooms')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  createClassroom(@Body() body: { name: string; capacity?: number }) {
    return this.catalog.createClassroom(body);
  }
}
