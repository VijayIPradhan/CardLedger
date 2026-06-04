// packages/shared/src/sms/dedupeHash.test.ts
import { describe, it, expect } from 'vitest';
import { dedupeHash } from './dedupeHash.js';
import type { SmsInput } from './types.js';

const SAMPLE: SmsInput = {
  sender: 'BZ-HDFCBK',
  body: 'Rs.1,500.00 spent on HDFC Bank Regalia Card XX9876 at Swiggy on 01-06-2026.',
  timestamp: 1748736000000,
};

describe('dedupeHash', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const hash = await dedupeHash(SAMPLE);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for identical inputs', async () => {
    const h1 = await dedupeHash(SAMPLE);
    const h2 = await dedupeHash({ ...SAMPLE });
    expect(h1).toBe(h2);
  });

  it('returns different hashes for different bodies', async () => {
    const h1 = await dedupeHash(SAMPLE);
    const h2 = await dedupeHash({ ...SAMPLE, body: 'Your OTP is 123456.' });
    expect(h1).not.toBe(h2);
  });

  it('returns different hashes for different senders', async () => {
    const h1 = await dedupeHash(SAMPLE);
    const h2 = await dedupeHash({ ...SAMPLE, sender: 'BZ-ICICIB' });
    expect(h1).not.toBe(h2);
  });
});
