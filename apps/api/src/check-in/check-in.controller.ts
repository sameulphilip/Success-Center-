import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AttendanceSource } from '@prisma/client';
import { CheckInService } from './check-in.service';
import { DeviceAuthGuard } from './device-auth.guard';

@Controller('check-in')
export class CheckInController {
  constructor(private readonly checkIn: CheckInService) {}

  @Get('health')
  health() {
    return {
      ok: true,
      service: 'Success Check-In',
      mode: 'ops-pay-before-entry',
      deviceAuth: Boolean(process.env.DEVICE_API_KEY),
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(DeviceAuthGuard)
  @Post()
  async scan(
    @Body()
    body: {
      payload: string;
      /** Phase A class session — required when multiple paid sessions are open */
      sessionId?: string;
      teacherId?: string;
      /** @deprecated ignored — kiosk now uses ops sessions, not group attendance */
      groupId?: string;
      source?: AttendanceSource | string;
      deviceName?: string;
    },
  ) {
    return this.checkIn.checkIn(body);
  }
}
