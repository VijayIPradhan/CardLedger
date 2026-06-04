// packages/shared/src/sms/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSms } from './parser.js';
import { resolveHolder } from '../domain/resolveHolder.js';
import type { Assignment } from '../models/index.js';

// ─── Fixture definitions ──────────────────────────────────────────────────────

const FIXTURES = [
  {
    name: 'HDFC standard spend → high confidence',
    input: {
      sender: 'BZ-HDFCBK',
      body: 'Rs.1,500.00 spent on HDFC Bank Regalia Card XX9876 at Swiggy on 01-06-2026. Avbl Limit Rs.48,500.',
      timestamp: 1748736000000,
    },
    expected: {
      bank: 'HDFC',
      last4: '9876',
      amount: 1500,
      merchant: 'Swiggy',
      date: '2026-06-01',
      confidence: 'high' as const,
    },
  },
  {
    name: 'ICICI Amazon Pay → high confidence',
    input: {
      sender: 'BZ-ICICIB',
      body: 'ICICI Bank: Rs.899.00 spent on Amazon Pay Card ending 5432 on Jun 01, 2026 at Amazon. Avl Bal Rs.12,101.',
      timestamp: 1748736000000,
    },
    expected: {
      bank: 'ICICI',
      last4: '5432',
      amount: 899,
      merchant: 'Amazon',
      date: '2026-06-01',
      confidence: 'high' as const,
    },
  },
  {
    name: 'SBI spend → high confidence',
    input: {
      sender: 'AD-SBIINB',
      body: 'Dear Customer, Rs.2,300.50 debited from SBI Credit Card XX1111 on 01/06/2026 at BigBazaar. Avbl Credit Limit Rs.37,699.50.',
      timestamp: 1748736000000,
    },
    expected: {
      bank: 'SBI',
      last4: '1111',
      amount: 2300.5,
      merchant: 'BigBazaar',
      date: '2026-06-01',
      confidence: 'high' as const,
    },
  },
  {
    name: 'Flipkart Axis → high confidence',
    input: {
      sender: 'AX-AXISBK',
      body: 'Rs.1,999.00 spent via your Flipkart Axis Bank Card ending 7890 on 01-Jun-26 at Flipkart.',
      timestamp: 1748736000000,
    },
    expected: {
      bank: 'Axis',
      last4: '7890',
      amount: 1999,
      merchant: 'Flipkart',
      date: '2026-06-01',
      confidence: 'high' as const,
    },
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseSms — high-confidence fixtures', () => {
  for (const f of FIXTURES) {
    it(f.name, async () => {
      const result = await parseSms(f.input);
      expect(result).not.toBeNull();
      expect(result!.bank).toBe(f.expected.bank);
      expect(result!.last4).toBe(f.expected.last4);
      expect(result!.amount).toBeCloseTo(f.expected.amount, 2);
      expect(result!.merchant).toBe(f.expected.merchant);
      expect(result!.date).toBe(f.expected.date);
      expect(result!.confidence).toBe(f.expected.confidence);
      expect(result!.dedupeHash).toHaveLength(64);
      expect(result!.raw).toEqual(f.input);
    });
  }
});

describe('parseSms — OTP rejection', () => {
  it('returns null for OTP messages', async () => {
    const result = await parseSms({
      sender: 'BZ-HDFCBK',
      body: 'Your OTP for HDFC Bank Net Banking is 123456. Valid for 10 minutes. Do not share.',
      timestamp: 1748736000000,
    });
    expect(result).toBeNull();
  });
});

describe('parseSms — unknown bank fallback', () => {
  it('returns low confidence for unknown sender', async () => {
    const result = await parseSms({
      sender: 'UNKNWN-XYZ',
      body: 'Rs.500 spent at Local Store on 01/06/2026 using card 1234.',
      timestamp: 1748736000000,
    });
    expect(result).not.toBeNull();
    expect(result!.bank).toBe('UNKNOWN');
    expect(result!.confidence).toBe('low');
    expect(result!.amount).toBe(500);
  });
});

describe('parseSms — deduplication', () => {
  it('same message parsed twice produces identical dedupeHash', async () => {
    const input = {
      sender: 'BZ-HDFCBK',
      body: 'Rs.1,500.00 spent on HDFC Bank Regalia Card XX9876 at Swiggy on 01-06-2026. Avbl Limit Rs.48,500.',
      timestamp: 1748736000000,
    };
    const r1 = await parseSms(input);
    const r2 = await parseSms({ ...input });
    expect(r1!.dedupeHash).toBe(r2!.dedupeHash);
  });
});

describe('holder resolution — integration', () => {
  it('resolves holder for txn dated during friend assignment', () => {
    const assignments: Assignment[] = [
      {
        id: 'a1',
        card_id: 'card-9876',
        holder_id: 'friend-id',
        handed_over_date: '2026-05-01',
        returned_date: null,
        created_at: '2026-05-01T00:00:00Z',
      },
    ];
    // HDFC fixture date is 2026-06-01, well within the assignment window
    const resolved = resolveHolder('card-9876', '2026-06-01', assignments);
    expect(resolved).toBe('friend-id');
  });

  it('returns null when no assignment covers the txn date', () => {
    const assignments: Assignment[] = [
      {
        id: 'a1',
        card_id: 'card-9876',
        holder_id: 'friend-id',
        handed_over_date: '2026-05-01',
        returned_date: '2026-05-15', // returned before the txn
        created_at: '2026-05-01T00:00:00Z',
      },
    ];
    const resolved = resolveHolder('card-9876', '2026-06-01', assignments);
    expect(resolved).toBeNull();
  });
});
