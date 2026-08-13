import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MessagingProcessor } from './messaging.processor';
import { MessagingScheduler } from './messaging.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';
import { SMS_PROVIDER, WHATSAPP_PROVIDER } from './messaging.constants';
import {
  createSmsProvider,
  createWhatsAppProvider,
} from './providers/provider.factory';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'messaging' }),
    NotificationsModule,
  ],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    MessagingProcessor,
    MessagingScheduler,
    { provide: SMS_PROVIDER, useFactory: createSmsProvider },
    { provide: WHATSAPP_PROVIDER, useFactory: createWhatsAppProvider },
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
