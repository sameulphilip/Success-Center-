import { studentLoginUrl } from './student-login-qr';

export function whatsAppPhoneDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0020') && digits.length >= 13) return digits.slice(2);
  if (digits.startsWith('20') && digits.length >= 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `20${digits.slice(1)}`;
  if (digits.startsWith('1') && digits.length === 10) return `20${digits}`;
  if (digits.length >= 10) return digits;
  return null;
}

export function studentLoginUrlWithPhone(phone: string, origin?: string) {
  const base = studentLoginUrl(origin);
  return `${base}&phone=${encodeURIComponent(phone.trim())}`;
}

export type OnlinePaymentWhatsAppParams = {
  studentName: string;
  studentPhone: string;
  receiptNumber?: string | null;
  gradeLabel?: string | null;
  groupLink?: string | null;
};

export function buildOnlinePaymentConfirmMessage(
  params: OnlinePaymentWhatsAppParams,
): string {
  const loginUrl = studentLoginUrlWithPhone(params.studentPhone);
  const name = params.studentName.trim() || 'الطالب';
  const grade = params.gradeLabel?.trim();
  const lines = [
    `مرحباً ${name}،`,
    '',
    'تم تأكيد دفع استمارة الحجز في Success Center ✅',
  ];
  if (params.receiptNumber) {
    lines.push(`رقم الإيصال: ${params.receiptNumber}`);
  }
  lines.push(
    '',
    'سجّل دخولك من الرابط:',
    loginUrl,
    '',
    'اختر «طالب» → أدخل رقم موبايلك → عيّن الرقم السري (أول مرة).',
  );
  const link = params.groupLink?.trim();
  if (link) {
    const label = grade ? `جروب ${grade}` : 'جروب الصف';
    lines.push('', `— ${label} —`, link);
  }
  return lines.join('\n');
}

export function openStudentPaymentWhatsApp(
  params: OnlinePaymentWhatsAppParams,
): boolean {
  if (typeof window === 'undefined') return false;
  const digits = whatsAppPhoneDigits(params.studentPhone);
  if (!digits) return false;
  const text = encodeURIComponent(buildOnlinePaymentConfirmMessage(params));
  window.open(
    `https://wa.me/${digits}?text=${text}`,
    '_blank',
    'noopener,noreferrer',
  );
  return true;
}
