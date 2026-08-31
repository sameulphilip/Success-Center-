import { ConsoleSmsProvider } from './console-sms.provider';
import { ConsoleWhatsAppProvider } from './console-whatsapp.provider';
import { MessagingProvider } from './messaging-provider';
import { OpenWaWhatsAppProvider } from './openwa-whatsapp.provider';
import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';
import { WhatsAppCloudProvider } from './whatsapp-cloud.provider';

export function createWhatsAppProvider(): MessagingProvider {
  const mode = (process.env.WHATSAPP_PROVIDER || 'console').toLowerCase();
  if (mode === 'meta' || mode === 'cloud' || mode === 'whatsapp-cloud') {
    return new WhatsAppCloudProvider();
  }
  if (mode === 'twilio') {
    return new TwilioWhatsAppProvider();
  }
  if (mode === 'openwa') {
    return new OpenWaWhatsAppProvider();
  }
  return new ConsoleWhatsAppProvider();
}

export function createSmsProvider(): MessagingProvider {
  const mode = (process.env.SMS_PROVIDER || 'console').toLowerCase();
  // Real SMS can be added later (Twilio SMS). Keep console for now.
  if (mode === 'twilio') {
    // Reuse Twilio WhatsApp only if SMS not ready — fall back to console.
    return new ConsoleSmsProvider();
  }
  return new ConsoleSmsProvider();
}

export function whatsappProviderLabel() {
  return (process.env.WHATSAPP_PROVIDER || 'console').toLowerCase();
}
