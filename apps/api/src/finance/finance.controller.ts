import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PaymentStatus, RoleCode } from '@prisma/client';
import { FinanceService } from './finance.service';
import { CashService } from './cash.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermsGuard } from '../auth/perms.guard';
import { RequirePerms } from '../auth/perms.decorator';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard, PermsGuard)
@Roles(
  RoleCode.SUPER_ADMIN,
  RoleCode.CENTER_MANAGER,
  RoleCode.ACCOUNTANT,
  RoleCode.RECEPTION,
)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly cash: CashService,
  ) {}

  @Get('summary')
  @RequirePerms('finance.receipts')
  summary() {
    return this.finance.summary();
  }

  @Get('invoices')
  @RequirePerms('finance.receipts')
  invoices(@Query('status') status?: PaymentStatus) {
    return this.finance.listInvoices(status);
  }

  @Get('outstanding')
  @RequirePerms('finance.receipts')
  outstanding() {
    return this.finance.outstanding();
  }

  @Get('payments')
  @RequirePerms('finance.receipts')
  payments() {
    return this.finance.listPayments();
  }

  @Post('payments')
  @RequirePerms('finance.receipts')
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
  @RequirePerms('finance')
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

  @Get('cash/snapshot')
  @RequirePerms('finance.safe', 'finance.close')
  cashSnapshot() {
    return this.cash.snapshot();
  }

  @Post('cash/expenses')
  @RequirePerms('finance.safe')
  addExpense(
    @CurrentUser() user: { userId: string },
    @Body()
    body: {
      amount: number;
      category: string;
      paidFrom: string;
      note?: string;
    },
  ) {
    return this.cash.addExpense(user.userId, body);
  }

  @Post('cash/close-day')
  @RequirePerms('finance.close')
  closeDay(
    @CurrentUser() user: { userId: string },
    @Body() body: { countedAmount: number; note?: string },
  ) {
    return this.cash.closeDay(user.userId, body);
  }

  @Post('cash/handover')
  @RequirePerms('finance.safe')
  handover(
    @CurrentUser() user: { userId: string },
    @Body() body: { amount: number; note?: string },
  ) {
    return this.cash.handover(user.userId, body);
  }
}
