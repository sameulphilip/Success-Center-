import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('access-catalog')
  @Roles(RoleCode.SUPER_ADMIN)
  accessCatalog() {
    return this.users.accessCatalog();
  }

  @Get('roles')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  roles() {
    return this.users.listRoles();
  }

  @Patch('roles/:id/permissions')
  @Roles(RoleCode.SUPER_ADMIN)
  updateRolePermissions(
    @Param('id') id: string,
    @Body() body: { permissions: string[] },
  ) {
    return this.users.updateRolePermissions(id, body.permissions);
  }

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  list() {
    return this.users.list();
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN)
  create(
    @Body()
    body: {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
      roleCode: RoleCode;
      isActive?: boolean;
    },
  ) {
    return this.users.create(body);
  }

  @Get(':id')
  @Roles(RoleCode.SUPER_ADMIN)
  getOne(@Param('id') id: string) {
    return this.users.getById(id);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @CurrentUser() actor: { userId: string },
    @Body()
    body: Partial<{
      fullName: string;
      phone: string | null;
      email: string;
      roleCode: RoleCode;
      isActive: boolean;
      password: string;
    }>,
  ) {
    return this.users.update(id, body, actor?.userId);
  }
}
