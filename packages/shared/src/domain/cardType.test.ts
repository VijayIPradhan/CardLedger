import { describe, it, expect } from 'vitest';
import {
  sanitizeCardNumber,
  extractBin,
  extractLast4,
  detectNetwork,
  luhnValid,
} from './cardType.js';

describe('sanitizeCardNumber', () => {
  it('strips spaces and non-digits', () => {
    expect(sanitizeCardNumber('4532 1234 5678 9876')).toBe('4532123456789876');
    expect(sanitizeCardNumber('4111-1111-1111-1111')).toBe('4111111111111111');
  });
});

describe('extractBin / extractLast4', () => {
  it('extractBin returns first 6 digits', () => {
    expect(extractBin('4532123456789876')).toBe('453212');
  });
  it('extractBin returns empty string when fewer than 6 digits', () => {
    expect(extractBin('12345')).toBe('');
  });
  it('extractLast4 returns last 4 digits', () => {
    expect(extractLast4('4532123456789876')).toBe('9876');
  });
  it('extractLast4 returns empty string when fewer than 4 digits', () => {
    expect(extractLast4('123')).toBe('');
  });
});

describe('detectNetwork', () => {
  it('detects Visa (starts 4)', () => {
    expect(detectNetwork('453212')).toBe('Visa');
  });
  it('detects Mastercard (51-55)', () => {
    expect(detectNetwork('511111')).toBe('Mastercard');
  });
  it('detects Mastercard (2221-2720)', () => {
    expect(detectNetwork('222100')).toBe('Mastercard');
  });
  it('detects Amex (34/37)', () => {
    expect(detectNetwork('371449')).toBe('Amex');
    expect(detectNetwork('341111')).toBe('Amex');
  });
  it('detects RuPay (60/65)', () => {
    expect(detectNetwork('607123')).toBe('RuPay');
    expect(detectNetwork('650000')).toBe('RuPay');
  });
  it('returns null for unknown', () => {
    expect(detectNetwork('999999')).toBeNull();
  });
});

describe('luhnValid', () => {
  it('accepts a valid number', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
  });
  it('rejects an invalid number', () => {
    expect(luhnValid('4111111111111112')).toBe(false);
  });
  it('rejects too-short input', () => {
    expect(luhnValid('4111')).toBe(false);
  });
});
