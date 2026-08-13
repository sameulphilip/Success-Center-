import { Injectable, Logger } from '@nestjs/common';
import { MessagingProvider } from './messaging-provider';

@Injectable()
export class ConsoleWhatsAppProvider implements MessagingProvider {
  private readonly logger = new Logger(ConsoleWhatsAppProvider.name);

  async send(to: string, body: string, title?: string) {
    this.logger.log(`[WhatsApp] to=${to} title=${title ?? ''} body=${body}`);
    return { ok: true, id: `wa-${Date.now()}` };
  }
}
