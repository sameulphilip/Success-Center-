import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PaymentStatus, RoleCode } from '@prisma/client';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleCode.SUPER_ADMIN,
  RoleCode.CENTER_MANAGER,
  RoleCode.ACCOUNTANT,
  RoleCode.RECEPTION,
)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('invoices')
  invoices(@Query('status') status?: PaymentStatus) {
    return this.finance.listInvoices(status);
  }

  @Get('outstanding')
  outstanding() {
    return this.finance.outstanding();
  }

  @Get('payments')
  payments() {
    return this.finance.listPayments();
  }

  @Post('payments')
  recordPayment(
    @Body()
    body: {
      studentId: string;
      invoiceId?: string;
      amount: number;
      discount?: number;
      extras?: number;
      method?: string;
      note?: string;
    },
  ) {
    return this.finance.recordPayment(body);
  }

  @Get('payouts')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.ACCOUNTANT)
  payouts() {
    return this.finance.listPayouts();
  }

  @Post('payouts')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.ACCOUNTANT)
  computePayout(
    @Body()
    body: {
      teacherId: string;
      periodStart: string;
      periodEnd: string;
      deductions?: number;
    },
  ) {
    return this.finance.computeTeacherPayout(
      body.teacherId,
      body.periodStart,
      body.periodEnd,
      body.deductions,
    );
  }

  @Post('payouts/from-profit')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.ACCOUNTANT)
  computePayoutFromProfit(
    @Body()
    body: {
      teacherId: string;
      periodStart: string;
      periodEnd: string;
      deductions?: number;
    },
  ) {
    return this.finance.computeTeacherPayoutFromProfit(
      body.teacherId,
      body.periodStart,
      body.periodEnd,
      body.deductions,
    );
  }

  @Post('payouts/:id/pay')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.ACCOUNTANT)
  payPayout(@Param('id') id: string, @Body() body: { amount: number }) {
    return this.finance.payTeacherPayout(id, body.amount);
  }
}
