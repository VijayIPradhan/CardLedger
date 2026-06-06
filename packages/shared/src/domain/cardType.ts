import type { Network } from '../models/index.js';

export function sanitizeCardNumber(input: string): string {
  return input.replace(/\D/g, '');
}

export function extractBin(num: string): string {
  const d = sanitizeCardNumber(num);
  return d.length >= 6 ? d.slice(0, 6) : '';
}

export function extractLast4(num: string): string {
  const d = sanitizeCardNumber(num);
  return d.length >= 4 ? d.slice(-4) : '';
}

export function detectNetwork(bin: string): Network | null {
  const b = sanitizeCardNumber(bin);
  if (b.length < 2) return null;
  const two = Number(b.slice(0, 2));
  const three = Number(b.slice(0, 3));
  const four = b.length >= 4 ? Number(b.slice(0, 4)) : 0;

  if (two === 34 || two === 37) return 'Amex';
  if (b[0] === '4') return 'Visa';
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return 'Mastercard';
  if (two === 60 || two === 65 || two === 81 || two === 82 || three === 508) return 'RuPay';
  return null;
}

export function luhnValid(num: string): boolean {
  const digits = sanitizeCardNumber(num);
  if (digits.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}
