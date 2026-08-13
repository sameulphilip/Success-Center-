import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessageChannel } from '@prisma/client';
import { MessagingService } from './messaging.service';

@Injectable()
export class MessagingScheduler {
  private readonly logger = new Logger(MessagingScheduler.name);

  constructor(private readonly messaging: MessagingService) {}

  /** Daily overdue payment WhatsApp reminders at 10:00 Asia/Cairo-ish server local time */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async remindOverduePayments() {
    if (process.env.OVERDUE_REMINDERS_ENABLED === 'false') {
      return;
    }
    try {
      const result = await this.messaging.sendCampaign({
        channel: MessageChannel.WHATSAPP,
        audience: 'OVERDUE_PAYMENTS',
        templateCode: 'OVERDUE_PAYMENT',
        title: 'تذكير بالمتأخرات',
        body: 'تذكير: يوجد مبلغ مستحق على اشتراك الطالب. برجاء السداد.',
      });
      this.logger.log(`Overdue WhatsApp reminders queued: ${result.count}`);
    } catch (e) {
      this.logger.error(
        `Overdue reminder failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
