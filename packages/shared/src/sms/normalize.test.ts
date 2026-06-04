import { describe, it, expect } from 'vitest';
import { normalizeAmount, normalizeDate, normalizeMerchant } from './normalize.js';

describe('normalizeAmount', () => {
  it('strips Rs. prefix and comma separators', () => {
    expect(normalizeAmount('Rs.1,500.00')).toBe(1500);
  });
  it('strips ₹ symbol', () => {
    expect(normalizeAmount('₹899')).toBe(899);
  });
  it('strips INR prefix', () => {
    expect(normalizeAmount('INR 2,300.50')).toBe(2300.5);
  });
  it('handles plain number string', () => {
    expect(normalizeAmount('500')).toBe(500);
  });
});

describe('normalizeDate', () => {
  it('converts DD-MM-YYYY to ISO', () => {
    expect(normalizeDate('01-06-2026')).toBe('2026-06-01');
  });
  it('converts DD/MM/YYYY to ISO', () => {
    expect(normalizeDate('01/06/2026')).toBe('2026-06-01');
  });
  it('converts "Jun 01, 2026" to ISO', () => {
    expect(normalizeDate('Jun 01, 2026')).toBe('2026-06-01');
  });
  it('converts "01-Jun-26" (2-digit year) to ISO', () => {
    expect(normalizeDate('01-Jun-26')).toBe('2026-06-01');
  });
  it('converts "01 Jun 2026" to ISO', () => {
    expect(normalizeDate('01 Jun 2026')).toBe('2026-06-01');
  });
});

describe('normalizeMerchant', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeMerchant('  Swiggy  ')).toBe('Swiggy');
  });
  it('collapses internal double spaces', () => {
    expect(normalizeMerchant('Big  Bazaar')).toBe('Big Bazaar');
  });
});
