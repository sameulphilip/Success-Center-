import { Injectable, Logger } from '@nestjs/common';
import { MessagingProvider } from './messaging-provider';

@Injectable()
export class ConsoleSmsProvider implements MessagingProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async send(to: string, body: string) {
    this.logger.log(`[SMS] to=${to} body=${body}`);
    return { ok: true, id: `sms-${Date.now()}` };
  }
}
