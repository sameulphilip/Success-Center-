import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  @Delete('payments/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.receipts')
  deletePayment(
    @Param('id') id: string,
    @Query('source') source?: string,
  ) {
    const src = String(source || 'PAYMENT').toUpperCase();
    if (src !== 'PAYMENT' && src !== 'SESSION') {
      throw new BadRequestException('مصدر الإيصال غير صالح');
    }
    return this.finance.deleteReceipt(id, src as 'PAYMENT' | 'SESSION');
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
  cashSnapshot(@CurrentUser() user: { userId: string; role?: string }) {
    return this.cash.snapshot(undefined, user);
  }

  @Get('cash/day-sheet')
  @RequirePerms('finance.close', 'finance.safe')
  daySheet(@Query('date') date?: string) {
    return this.cash.daySheet(date);
  }

  @Post('cash/expenses')
  @RequirePerms('finance.safe')
  addExpense(
    @CurrentUser() user: { userId: string; role?: string },
    @Body()
    body: {
      amount: number;
      category: string;
      paidFrom: string;
      note?: string;
      businessDate?: string;
    },
  ) {
    return this.cash.addExpense(user.userId, body, user.role);
  }

  @Delete('cash/expenses/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.safe')
  deleteExpense(@Param('id') id: string) {
    return this.cash.deleteExpense(id);
  }

  @Delete('cash/extra-revenue/:kind/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.safe')
  deleteExtraRevenue(
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.cash.deleteExtraRevenue(kind, id);
  }

  @Post('cash/teacher-holds/settle')
  @RequirePerms('finance.safe')
  settleTeacherHold(
    @CurrentUser() user: { userId: string },
    @Body() body: { teacherId?: string | null },
  ) {
    return this.cash.settleTeacherHold(user.userId, body?.teacherId);
  }

  @Get('cash/teacher-settlements')
  @RequirePerms('finance.safe', 'finance.close')
  teacherSettlements(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.cash.teacherSettlementsReport(from, to);
  }

  @Post('cash/close-day')
  @RequirePerms('finance.close')
  closeDay(
    @CurrentUser() user: { userId: string },
    @Body() body: { countedAmount: number; note?: string; businessDate?: string },
  ) {
    return this.cash.closeDay(user.userId, body);
  }

  @Post('cash/reopen-day')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.close')
  reopenDay(
    @CurrentUser() user: { userId: string },
    @Body() body: { businessDate?: string },
  ) {
    return this.cash.reopenDay(body || {}, user?.userId);
  }

  @Get('cash/audit-logs')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.close')
  auditLogs(@Query('limit') limit?: string) {
    return this.cash.listAuditLogs(limit ? Number(limit) : 40);
  }

  @Post('cash/handover')
  @RequirePerms('finance.safe')
  handover(
    @CurrentUser() user: { userId: string },
    @Body() body: { amount: number; note?: string },
  ) {
    return this.cash.handover(user.userId, body);
  }

  @Post('cash/online-wallet/claim')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.safe')
  claimOnlineWallet(
    @CurrentUser() user: { userId: string },
    @Body() body: { amount?: number; note?: string },
  ) {
    return this.cash.claimOnlineWallet(user.userId, body || {});
  }

  @Get('cash/online-wallet/claims')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.safe')
  listOnlineWalletClaims() {
    return this.cash.listOnlineWalletClaims();
  }

  @Post('cash/owner-advance')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.safe')
  createOwnerAdvance(
    @CurrentUser() user: { userId: string },
    @Body() body: { kind: 'IN' | 'OUT'; amount: number; note?: string },
  ) {
    return this.cash.createOwnerAdvance(user.userId, body || ({} as any));
  }

  @Get('cash/owner-advances')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @RequirePerms('finance.safe')
  listOwnerAdvances(@Query('limit') limit?: string) {
    return this.cash.listOwnerAdvances(limit ? Number(limit) : 40);
  }
}
