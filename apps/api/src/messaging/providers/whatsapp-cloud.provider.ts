import { Injectable, Logger } from '@nestjs/common';
import { MessagingProvider } from './messaging-provider';
import { normalizePhone } from './phone.util';

/**
 * Meta WhatsApp Cloud API.
 * Env:
 *  WHATSAPP_TOKEN
 *  WHATSAPP_PHONE_NUMBER_ID
 *  WHATSAPP_API_VERSION (optional, default v21.0)
 *  WHATSAPP_TEMPLATE_NAME (optional — if set, sends template instead of free text)
 *  WHATSAPP_TEMPLATE_LANG (optional, default ar)
 */
@Injectable()
export class WhatsAppCloudProvider implements MessagingProvider {
  private readonly logger = new Logger(WhatsAppCloudProvider.name);

  async send(to: string, body: string, title?: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

    if (!token || !phoneNumberId) {
      throw new Error(
        'WhatsApp Cloud not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)',
      );
    }

    const phone = normalizePhone(to);
    if (!phone) throw new Error(`Invalid WhatsApp phone: ${to}`);

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const text = title ? `*${title}*\n${body}` : body;

    const payload = templateName
      ? {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: process.env.WHATSAPP_TEMPLATE_LANG || 'ar',
            },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: body.slice(0, 1024) },
                ],
              },
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { preview_url: false, body: text.slice(0, 4096) },
        };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };

    if (!res.ok) {
      const msg = data.error?.message || `WhatsApp API HTTP ${res.status}`;
      this.logger.error(`Failed to ${phone}: ${msg}`);
      throw new Error(msg);
    }

    const id = data.messages?.[0]?.id;
    this.logger.log(`Sent WhatsApp Cloud to=${phone} id=${id || 'n/a'}`);
    return { ok: true, id };
  }
}
