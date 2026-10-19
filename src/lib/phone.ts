/**
 * v3.11 — Bangladeshi mobile numbers as people (and browsers) type them.
 *
 * Browser autofill (Google / Chrome / Safari) fills the phone field with the
 * number saved in the account — usually in international form:
 * "+880 1712-345678", "+8801712345678" or "8801712345678". The checkout used
 * to drop anything longer than 11 digits, so an autofilled number simply did
 * not appear while the name and address did. Every form now folds those
 * forms back to the local 11 digits ("01712345678").
 */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bengali digits (০১৭…) → ASCII (017…) */
export const asciiDigits = (value: string) => String(value || '').replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/**
 * Whatever is typed, pasted or autofilled → at most 11 digits.
 *   +880 1712-345678 → 01712345678
 *   008801712345678  → 01712345678
 *   1712345678       → 01712345678 (country code typed separately)
 */
export function normalizeBdPhone(raw: string): string {
  let digits = asciiDigits(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('880') && digits.length >= 13) digits = digits.slice(2);
  else if (digits.startsWith('88') && digits.length > 11) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return digits.slice(0, 11);
}

export const BD_PHONE_RE = /^01[3-9]\d{8}$/;

export const isBdPhone = (value: string) => BD_PHONE_RE.test(normalizeBdPhone(value));
