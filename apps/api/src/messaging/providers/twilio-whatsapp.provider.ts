import { Injectable, Logger } from '@nestjs/common';
import { MessagingProvider } from './messaging-provider';
import { normalizePhone } from './phone.util';

/**
 * Twilio WhatsApp.
 * Env:
 *  TWILIO_ACCOUNT_SID
 *  TWILIO_AUTH_TOKEN
 *  TWILIO_WHATSAPP_FROM  (e.g. whatsapp:+14155238886)
 */
@Injectable()
export class TwilioWhatsAppProvider implements MessagingProvider {
  private readonly logger = new Logger(TwilioWhatsAppProvider.name);

  async send(to: string, body: string, title?: string) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;

    if (!sid || !token || !from) {
      throw new Error(
        'Twilio WhatsApp not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM)',
      );
    }

    const phone = normalizePhone(to);
    if (!phone) throw new Error(`Invalid WhatsApp phone: ${to}`);

    const text = title ? `*${title}*\n${body}` : body;
    const params = new URLSearchParams({
      From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      To: `whatsapp:+${phone}`,
      Body: text.slice(0, 1600),
    });

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      error_message?: string;
    };

    if (!res.ok) {
      const msg = data.error_message || data.message || `Twilio HTTP ${res.status}`;
      this.logger.error(`Failed to ${phone}: ${msg}`);
      throw new Error(msg);
    }

    this.logger.log(`Sent Twilio WhatsApp to=${phone} sid=${data.sid}`);
    return { ok: true, id: data.sid };
  }
}
