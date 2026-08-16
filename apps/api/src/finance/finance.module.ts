import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CashService } from './cash.service';
import { FinanceController } from './finance.controller';
import { PermsGuard } from '../auth/perms.guard';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, CashService, PermsGuard],
  exports: [FinanceService, CashService],
})
export class FinanceModule {}
