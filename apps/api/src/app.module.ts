import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { TeachersModule } from './teachers/teachers.module';
import { GroupsModule } from './groups/groups.module';
import { CatalogModule } from './catalog/catalog.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FinanceModule } from './finance/finance.module';
import { ExamsModule } from './exams/exams.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagingModule } from './messaging/messaging.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { QrModule } from './qr/qr.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { CheckInModule } from './check-in/check-in.module';
import { BookingModule } from './booking/booking.module';
import { OpsModule } from './ops/ops.module';
import { RevenueModule } from './revenue/revenue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    StudentsModule,
    TeachersModule,
    GroupsModule,
    AttendanceModule,
    FinanceModule,
    ExamsModule,
    NotificationsModule,
    MessagingModule,
    DashboardModule,
    QrModule,
    ReportsModule,
    CheckInModule,
    BookingModule,
    OpsModule,
    RevenueModule,
  ],
})
export class AppModule {}

