import { BadRequestException } from '@nestjs/common';

/**
 * IATA air waybill number: 3-digit airline prefix + 8-digit serial, where the
 * serial's last digit is the check digit — the first seven digits modulo 7.
 * Accepts any spacing/dashes ("125 1234 5675", "12512345675") and returns the
 * canonical "125-12345675". Blank input → `null` (the number may come later).
 */
export function normalizeAwbNumber(
  input: string | null | undefined,
): string | null {
  const raw = input?.trim() ?? '';
  if (raw === '') return null;
  if (!/^[0-9\s-]+$/.test(raw)) {
    throw new BadRequestException(
      `מספר MAWB "${raw}" אינו תקין — יש להזין 11 ספרות (קידומת חברת תעופה + 8 ספרות)`,
    );
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) {
    throw new BadRequestException(
      `מספר MAWB "${raw}" אינו תקין — יש להזין 11 ספרות (קידומת חברת תעופה + 8 ספרות)`,
    );
  }
  const serial = digits.slice(3);
  const checkDigit = Number(serial[7]);
  if (Number(serial.slice(0, 7)) % 7 !== checkDigit) {
    throw new BadRequestException(
      `ספרת הביקורת של מספר MAWB "${raw}" שגויה — יש לבדוק את המספר מול ה-AWB`,
    );
  }
  return `${digits.slice(0, 3)}-${serial}`;
}

/** The 3-digit airline prefix of a normalised AWB number, or `null`. */
export function airlinePrefixOf(awbNumber: string | null): string | null {
  return awbNumber && /^\d{3}-/.test(awbNumber) ? awbNumber.slice(0, 3) : null;
}

/** HAWB numbers are free text from the agent's document; uniqueness compares this form. */
export function normalizeHawbNumber(
  input: string | null | undefined,
): string | null {
  const value = input?.trim().toUpperCase() ?? '';
  return value === '' ? null : value;
}
