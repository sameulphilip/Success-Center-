/** Normalize phone to E.164 digits (default Egypt +20). */
export function normalizePhone(input: string, defaultCountry = '20'): string {
  let digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = `${defaultCountry}${digits.slice(1)}`;
  }
  if (!digits.startsWith(defaultCountry) && digits.length === 10) {
    digits = `${defaultCountry}${digits}`;
  }
  return digits;
}
