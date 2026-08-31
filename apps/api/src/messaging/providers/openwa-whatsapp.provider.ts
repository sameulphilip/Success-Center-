import { Injectable, Logger } from '@nestjs/common';
import { MessagingProvider } from './messaging-provider';
import { normalizePhone } from './phone.util';

/** Convert E.164 digits to OpenWA chatId (individual). */
export function phoneToOpenWaChatId(phone: string): string {
  const digits = normalizePhone(phone);
  if (!digits) throw new Error(`Invalid WhatsApp phone: ${phone}`);
  return `${digits}@c.us`;
}

type OpenWaSession = { id: string; name?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value.trim());
}

/**
 * OpenWA self-hosted gateway (v0.23+).
 * Env:
 *  OPENWA_BASE_URL       (default http://localhost:2785)
 *  OPENWA_API_KEY
 *  OPENWA_SESSION_ID     session UUID (preferred)
 *  OPENWA_SESSION_NAME   fallback lookup by name (default success)
 */
@Injectable()
export class OpenWaWhatsAppProvider implements MessagingProvider {
  private readonly logger = new Logger(OpenWaWhatsAppProvider.name);
  private resolvedSessionId: string | null = null;

  private baseUrl() {
    return (process.env.OPENWA_BASE_URL || 'http://localhost:2785').replace(
      /\/$/,
      '',
    );
  }

  private apiKey() {
    const key = process.env.OPENWA_API_KEY;
    if (!key) {
      throw new Error('OpenWA not configured (OPENWA_API_KEY)');
    }
    return key;
  }

  private async resolveSessionId(): Promise<string> {
    if (this.resolvedSessionId) return this.resolvedSessionId;
    const direct = process.env.OPENWA_SESSION_ID?.trim();
    if (direct && isUuid(direct)) {
      this.resolvedSessionId = direct;
      return direct;
    }
    if (direct && !isUuid(direct)) {
      this.logger.warn(
        `OPENWA_SESSION_ID is not a full UUID (${direct}) — looking up by name`,
      );
    }

    const name = (process.env.OPENWA_SESSION_NAME || 'success').trim();
    const res = await fetch(`${this.baseUrl()}/api/sessions`, {
      headers: { 'X-API-Key': this.apiKey() },
    });
    const data = (await res.json().catch(() => null)) as
      | OpenWaSession[]
      | { sessions?: OpenWaSession[] }
      | null;

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.sessions)
        ? data.sessions
        : [];

    const hit = list.find(
      (s) => (s.name || '').trim().toLowerCase() === name.toLowerCase(),
    );
    if (!hit?.id) {
      throw new Error(
        `OpenWA session "${name}" not found — set OPENWA_SESSION_ID to the session UUID`,
      );
    }
    this.resolvedSessionId = hit.id;
    this.logger.log(`Resolved OpenWA session "${name}" → ${hit.id}`);
    return hit.id;
  }

  async send(to: string, body: string, title?: string) {
    const sessionId = await this.resolveSessionId();
    const chatId = phoneToOpenWaChatId(to);
    const text = title ? `*${title}*\n${body}` : body;

    const res = await fetch(
      `${this.baseUrl()}/api/sessions/${sessionId}/messages/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey(),
        },
        body: JSON.stringify({
          chatId,
          text: text.slice(0, 4096),
        }),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      const msg =
        data.error || data.message || `OpenWA HTTP ${res.status}`;
      this.logger.error(`Failed to ${chatId}: ${msg}`);
      throw new Error(msg);
    }

    this.logger.log(
      `Sent OpenWA WhatsApp session=${sessionId} to=${chatId} id=${data.messageId || 'n/a'}`,
    );
    return { ok: true, id: data.messageId };
  }
}
