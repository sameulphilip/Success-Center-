import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingPublicController } from './booking-public.controller';
import { BookingService } from './booking.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BookingPublicController, BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
