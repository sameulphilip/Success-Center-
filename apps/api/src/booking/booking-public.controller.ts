import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BookingService } from './booking.service';

/** Public booking endpoints — no JWT */
@Controller('booking/public')
export class BookingPublicController {
  constructor(private readonly booking: BookingService) {}

  @Get(':slug')
  getPublic(@Param('slug') slug: string, @Query('channel') channel?: string) {
    return this.booking.getPublicForm(slug, channel);
  }

  @Post(':slug/submit')
  submit(
    @Param('slug') slug: string,
    @Body()
    body: {
      studentName: string;
      studentPhone: string;
      parentPhone: string;
      offeringIds: string[];
      notes?: string;
      channel?: string;
      paymentMethod?: string;
      transferRef?: string;
      proofImage?: string;
    },
  ) {
    return this.booking.submitPublic({ slug, ...body });
  }
}
