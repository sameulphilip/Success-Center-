export type BookingPaymentWhatsAppParams = {
  studentName: string;
  studentPhone: string;
  receiptNumber?: string | null;
  centerName?: string;
  gradeLabel?: string | null;
  groupLink?: string | null;
};

export function studentLoginUrlWithPhone(
  phone: string,
  origin = process.env.PUBLIC_WEB_URL || 'https://success.cowdlly.com',
) {
  const base = `${origin.replace(/\/$/, '')}/login?mode=student`;
  return `${base}&phone=${encodeURIComponent(phone.trim())}`;
}

export function buildBookingPaymentConfirmMessage(
  params: BookingPaymentWhatsAppParams,
): string {
  const loginUrl = studentLoginUrlWithPhone(params.studentPhone);
  const name = params.studentName.trim() || 'الطالب';
  const center = params.centerName?.trim() || 'Success Center';
  const grade = params.gradeLabel?.trim();

  const lines = [
    `مرحباً ${name}،`,
    '',
    `تم تأكيد دفع استمارة الحجز في ${center} ✅`,
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
