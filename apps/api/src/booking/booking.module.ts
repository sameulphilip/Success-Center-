import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingPublicController } from './booking-public.controller';
import { BookingService } from './booking.service';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [AuthModule, MessagingModule],
  controllers: [BookingPublicController, BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
