import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MessageChannel, RoleCode } from '@prisma/client';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('status')
  status() {
    return this.messaging.providerStatus();
  }

  @Get('templates')
  templates() {
    return this.messaging.listTemplates();
  }

  @Get('jobs')
  jobs() {
    return this.messaging.listJobs();
  }

  @Post('send')
  send(
    @Body()
    body: {
      channel: MessageChannel;
      templateCode?: string;
      body: string;
      title?: string;
      audience:
        | 'GROUP'
        | 'OVERDUE_PAYMENTS'
        | 'ABSENT_TODAY'
        | 'ALL_PARENTS'
        | 'CUSTOM';
      groupId?: string;
      studentIds?: string[];
    },
  ) {
    return this.messaging.sendCampaign(body);
  }

  @Post('remind-overdue')
  remindOverdue() {
    return this.messaging.sendCampaign({
      channel: MessageChannel.WHATSAPP,
      audience: 'OVERDUE_PAYMENTS',
      templateCode: 'OVERDUE_PAYMENT',
      title: 'تذكير بالمتأخرات',
      body: 'تذكير: يوجد مبلغ مستحق ({{amountDue}} EGP) على اشتراك {{studentName}}.',
    });
  }
}
