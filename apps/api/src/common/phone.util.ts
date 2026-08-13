/** Normalize Egyptian-style mobile to digits starting with 0 */
export function normalizePhone(input: string): string {
  let digits = (input || '').replace(/\D/g, '');
  if (digits.startsWith('0020')) digits = digits.slice(4);
  if (digits.startsWith('20') && digits.length >= 11) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return digits;
}

export function phoneToLoginEmail(phone: string): string {
  const p = normalizePhone(phone);
  return `${p}@phone.success.local`;
}

export function isValidMobile(phone: string): boolean {
  const p = normalizePhone(phone);
  return /^01[0125]\d{8}$/.test(p);
}
