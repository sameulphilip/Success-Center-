import {
  Body,
  Controller,
  Get,
  Param,
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
