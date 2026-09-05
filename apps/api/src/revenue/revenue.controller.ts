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
import { RoleCode, SessionPayMethod } from '@prisma/client';
import { RevenueService } from './revenue.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('revenue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleCode.SUPER_ADMIN,
  RoleCode.CENTER_MANAGER,
  RoleCode.RECEPTION,
  RoleCode.ACCOUNTANT,
)
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  // Online
  @Get('inventory-by-teacher')
  inventoryByTeacher() {
    return this.revenue.inventoryByTeacher();
  }

  @Get('online/offers')
  listOffers() {
    return this.revenue.listOffers();
  }

  @Post('online/offers')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  createOffer(
    @Body()
    body: {
      teacherId: string;
      subjectId?: string;
      title: string;
      price: number;
      teacherPercent?: number;
      centerAmount?: number;
      notes?: string;
      codesCount?: number;
    },
  ) {
    return this.revenue.createOffer(body);
  }

  @Post('online/offers/:id/update')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  updateOfferPost(
    @Param('id') id: string,
    @Body()
    body: {
      teacherId?: string;
      subjectId?: string | null;
      title?: string;
      price?: number;
      teacherPercent?: number;
      centerAmount?: number;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    return this.revenue.updateOffer(id, body);
  }

  @Patch('online/offers/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  updateOffer(
    @Param('id') id: string,
    @Body()
    body: {
      teacherId?: string;
      subjectId?: string | null;
      title?: string;
      price?: number;
      teacherPercent?: number;
      centerAmount?: number;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    return this.revenue.updateOffer(id, body);
  }

  @Get('online/offers/:id/codes')
  codes(@Param('id') id: string) {
    return this.revenue.listOfferCodes(id);
  }

  @Post('online/offers/:id/codes')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  addCodes(@Param('id') id: string, @Body() body: { count?: number }) {
    return this.revenue.addCodes(id, body.count ?? 10);
  }

  @Post('online/offers/:id/sell')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  sellOnline(
    @Param('id') id: string,
    @Body()
    body: {
      method: SessionPayMethod;
      vodafoneTxn?: string;
      studentId?: string;
      buyerPhone?: string;
      buyerName?: string;
      note?: string;
      qty?: number;
    },
    @CurrentUser() user: { userId: string; role?: string },
  ) {
    return this.revenue.sellOnlineCode(id, body, user?.userId, user?.role);
  }

  @Post('online/offers/:id/return')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  returnOnline(
    @Param('id') id: string,
    @Body() body: { qty?: number; note?: string },
  ) {
    return this.revenue.returnOnlineCodesToTeacher(id, body);
  }

  @Get('online/sales')
  onlineSales() {
    return this.revenue.listOnlineSales();
  }

  @Post('online/sales/:id/confirm')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  confirmOnline(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.revenue.confirmOnlineSale(id, user?.userId);
  }

  @Delete('online/sales/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  deleteOnlineSale(@Param('id') id: string) {
    return this.revenue.deleteOnlineSale(id);
  }

  @Delete('online/offers/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  deleteOffer(@Param('id') id: string) {
    return this.revenue.deleteOffer(id);
  }

  // Handouts
  @Get('handouts/sales')
  handoutSales() {
    return this.revenue.listHandoutSales();
  }

  @Post('handouts/sales/:id/confirm')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  confirmHandout(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.revenue.confirmHandoutSale(id, user?.userId);
  }

  @Patch('handouts/sales/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  updateHandoutSale(
    @Param('id') id: string,
    @Body()
    body: {
      qty?: number;
      method?: SessionPayMethod;
      vodafoneTxn?: string | null;
      buyerPhone?: string | null;
      note?: string | null;
    },
  ) {
    return this.revenue.updateHandoutSale(id, body);
  }

  @Delete('handouts/sales/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  deleteHandoutSale(@Param('id') id: string) {
    return this.revenue.deleteHandoutSale(id);
  }

  @Get('handouts')
  handouts() {
    return this.revenue.listHandouts();
  }

  @Post('handouts')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  createHandout(
    @Body()
    body: {
      title: string;
      price: number;
      teacherPercent?: number;
      centerAmount?: number;
      teacherId?: string;
      stock?: number;
    },
  ) {
    return this.revenue.createHandout(body);
  }

  @Post('handouts/:id/update')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  updateHandoutPost(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      price?: number;
      teacherPercent?: number;
      centerAmount?: number;
      teacherId?: string | null;
      stock?: number;
      isActive?: boolean;
    },
  ) {
    return this.revenue.updateHandout(id, body);
  }

  @Patch('handouts/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  updateHandout(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      price?: number;
      teacherPercent?: number;
      centerAmount?: number;
      teacherId?: string | null;
      stock?: number;
      isActive?: boolean;
    },
  ) {
    return this.revenue.updateHandout(id, body);
  }

  @Delete('handouts/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  deleteHandout(@Param('id') id: string) {
    return this.revenue.deleteHandout(id);
  }

  @Post('handouts/:id/sell')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  sellHandout(
    @Param('id') id: string,
    @Body()
    body: {
      qty?: number;
      method: SessionPayMethod;
      vodafoneTxn?: string;
      studentId?: string;
      sessionId?: string;
      buyerPhone?: string;
      note?: string;
    },
    @CurrentUser() user: { userId: string; role?: string },
  ) {
    return this.revenue.sellHandout(id, body, user?.userId, user?.role);
  }

  @Post('handouts/:id/return')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  returnHandout(
    @Param('id') id: string,
    @Body() body: { qty?: number; note?: string },
  ) {
    return this.revenue.returnHandoutToTeacher(id, body);
  }

  // Rooms
  @Get('rentals')
  rentals() {
    return this.revenue.listRentals();
  }

  @Post('rentals')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  createRental(
    @Body()
    body: {
      classroomId: string;
      renterName: string;
      renterPhone?: string;
      title?: string;
      startsAt: string;
      endsAt: string;
      amount: number;
      method?: SessionPayMethod;
      vodafoneTxn?: string;
      notes?: string;
    },
    @CurrentUser() user: { userId: string; role?: string },
  ) {
    return this.revenue.createRental(body, user?.userId, user?.role);
  }

  @Post('rentals/:id/confirm')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  confirmRental(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.revenue.confirmRental(id, user?.userId);
  }

  @Post('rentals/:id/cancel')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  cancelRental(@Param('id') id: string) {
    return this.revenue.cancelRental(id);
  }
}
