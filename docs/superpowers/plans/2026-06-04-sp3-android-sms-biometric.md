# CardLedger SP3 — Android SMS + Biometric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Android-native layer to CardLedger: SMS parsing engine (shared), Kotlin SMS plugin, biometric app lock, review-queue UI, and a working debug APK.

**Architecture:** Pure-TypeScript parser lives in `packages/shared` so it can be unit-tested with Vitest without any Android tooling. The Capacitor layer is thin: a hand-written Kotlin plugin bridges `content://sms/inbox` + live SMS receiver to TypeScript, and `@aparajita/capacitor-biometric-auth` v7 handles biometric unlock. All new Android screens are hidden on web via `Capacitor.isNativePlatform()`.

**Tech Stack:** Vitest (parser tests), `@aparajita/capacitor-biometric-auth@^7`, `@capacitor/app@^6`, custom Kotlin Capacitor plugin, Zustand `persist` (review queue), Gradle `assembleDebug` for APK.

---

## File Map

### packages/shared — new files
| File | Responsibility |
|---|---|
| `src/sms/types.ts` | `SmsInput`, `ParseResult`, `ParserRule` interfaces |
| `src/sms/normalize.ts` | `normalizeAmount`, `normalizeDate`, `normalizeMerchant` helpers |
| `src/sms/dedupeHash.ts` | `dedupeHash(input)` — async SHA-256 via WebCrypto |
| `src/sms/parserRules.ts` | `PARSER_RULES` array + `FALLBACK_RULE` constant |
| `src/sms/parser.ts` | `parseSms(input): Promise<ParseResult \| null>` |
| `src/sms/parser.test.ts` | All 8 fixture tests |

### packages/shared — modified
| File | Change |
|---|---|
| `src/index.ts` | Re-export from `./sms/types.js` and `./sms/parser.js` |
| `tsconfig.json` | No change needed (NodeNext supports named-group regex) |

### packages/app — new files
| File | Responsibility |
|---|---|
| `src/plugins/SmsPlugin.ts` | Capacitor TS bridge + web stub |
| `src/lib/permissions.ts` | `requestAllPermissions()` — single runtime prompt |
| `src/lib/biometric.ts` | `unlockWithBiometric()` returning `'success' \| 'fallback' \| 'unavailable'` |
| `src/store/reviewStore.ts` | Zustand persisted review queue |
| `src/guards/PermissionSetupGuard.tsx` | Redirects to /setup-permissions on Android if not yet done |
| `src/screens/PermissionSetupScreen.tsx` | One-time Android permission grant screen |
| `src/screens/SmsImportScreen.tsx` | Inbox scan + live listener |
| `src/screens/ReviewQueueScreen.tsx` | Confirm / edit / dismiss low-confidence parses |

### packages/app — modified
| File | Change |
|---|---|
| `package.json` | Swap biometric lib; add `@capacitor/app`; add build scripts |
| `capacitor.config.ts` | Dev / prod conditional server URL |
| `src/screens/AppLockScreen.tsx` | Biometric → PIN fallback flow |
| `src/screens/SettingsScreen.tsx` | Biometric toggle row |
| `src/components/BottomNav.tsx` | SMS tab + badge on Android |
| `src/App.tsx` | New routes: /setup-permissions, /sms, /sms/review |
| `src/main.tsx` | 5-min background lock via `App.addListener` |

### packages/app/android — generated + patched
| File | Change |
|---|---|
| `app/src/main/java/com/cardledger/app/SmsPlugin.kt` | New — Capacitor plugin |
| `app/src/main/java/com/cardledger/app/SmsReceiver.kt` | New — BroadcastReceiver |
| `app/src/main/java/com/cardledger/app/MainActivity.kt` | Register SmsPlugin |
| `app/src/main/AndroidManifest.xml` | Permissions + receiver declaration |

---

## Task 1: SMS parser types

**Files:**
- Create: `packages/shared/src/sms/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// packages/shared/src/sms/types.ts
export interface SmsInput {
  sender: string;
  body: string;
  timestamp?: number; // Unix ms — optional (fallback to Date.now())
}

export interface ParseResult {
  bank: string;
  last4: string;
  amount: number;
  merchant: string;
  date: string;           // ISO yyyy-MM-dd
  confidence: 'high' | 'low';
  dedupeHash: string;
  raw: SmsInput;
}

export interface ParserRule {
  bank: string;
  senderPatterns: string[];
  patterns: string[];     // RegExp source strings — named groups: amount, last4, date, merchant
  flags?: string;         // RegExp flags, defaults to 'i'
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/sms/types.ts
git commit -m "feat(shared): add SMS parser types"
```

---

## Task 2: Normalize helpers + tests

**Files:**
- Create: `packages/shared/src/sms/normalize.ts`
- Create: `packages/shared/src/sms/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/sms/normalize.test.ts
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
```

- [ ] **Step 2: Run to verify tests fail**

```
cd packages/shared && pnpm test
```
Expected: FAIL — `normalize.js` not found.

- [ ] **Step 3: Implement normalize.ts**

```typescript
// packages/shared/src/sms/normalize.ts
const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function normalizeAmount(raw: string): number {
  const cleaned = raw
    .replace(/^(Rs\.?|₹|INR)\s*/i, '')
    .replace(/,/g, '')
    .trim();
  return parseFloat(cleaned);
}

export function normalizeDate(raw: string): string {
  const s = raw.trim();

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // DD-MMM-YY or DD-MMM-YYYY or DD MMM YYYY
  const dmY = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/);
  if (dmY) {
    const month = MONTH_MAP[dmY[2].toLowerCase()];
    const year = dmY[3].length === 2 ? `20${dmY[3]}` : dmY[3];
    return `${year}-${String(month).padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
  }

  // MMM DD, YYYY  (e.g. "Jun 01, 2026")
  const mdy = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase()];
    return `${mdy[3]}-${String(month).padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  return s; // fallback: return as-is
}

export function normalizeMerchant(raw: string): string {
  return raw.trim().replace(/\s{2,}/g, ' ');
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
cd packages/shared && pnpm test
```
Expected: all normalize tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sms/normalize.ts packages/shared/src/sms/normalize.test.ts
git commit -m "feat(shared): SMS normalize helpers with tests"
```

---

## Task 3: dedupeHash + tests

**Files:**
- Create: `packages/shared/src/sms/dedupeHash.ts`
- Create: `packages/shared/src/sms/dedupeHash.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run to verify tests fail**

```
cd packages/shared && pnpm test
```
Expected: FAIL — `dedupeHash.js` not found.

- [ ] **Step 3: Implement dedupeHash.ts**

Uses `globalThis.crypto.subtle` (available natively in Node 20 + all modern browsers).

```typescript
// packages/shared/src/sms/dedupeHash.ts
import type { SmsInput } from './types.js';

export async function dedupeHash(input: SmsInput): Promise<string> {
  const raw = `${input.sender}|${input.body}|${input.timestamp ?? 0}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
cd packages/shared && pnpm test
```
Expected: all dedupeHash tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sms/dedupeHash.ts packages/shared/src/sms/dedupeHash.test.ts
git commit -m "feat(shared): dedupeHash using WebCrypto SHA-256 with tests"
```

---

## Task 4: Parser rules

**Files:**
- Create: `packages/shared/src/sms/parserRules.ts`

The rules are written as a TypeScript constant (not JSON) so `tsc` compiles them cleanly under `NodeNext` module resolution without needing `resolveJsonModule`.

- [ ] **Step 1: Create parserRules.ts**

```typescript
// packages/shared/src/sms/parserRules.ts
import type { ParserRule } from './types.js';

// Named-group regex patterns for each bank.
// Required groups: amount, last4, date, merchant → confidence = 'high'
// Missing any group → confidence = 'low'
export const PARSER_RULES: ParserRule[] = [
  {
    bank: 'HDFC',
    senderPatterns: ['BZ-HDFCBK', 'HD-HDFCBK', 'HDFCBK'],
    patterns: [
      // "Rs.1,500.00 spent on HDFC Bank Regalia Card XX9876 at Swiggy on 01-06-2026."
      String.raw`Rs\.(?<amount>[\d,]+\.?\d*) spent on HDFC Bank[^C]+Card XX(?<last4>\d{4}) at (?<merchant>[A-Za-z ]+?) on (?<date>\d{2}-\d{2}-\d{4})`,
    ],
  },
  {
    bank: 'ICICI',
    senderPatterns: ['BZ-ICICIB', 'ICICIB', 'ICICIBK'],
    patterns: [
      // "ICICI Bank: Rs.899.00 spent on Amazon Pay Card ending 5432 on Jun 01, 2026 at Amazon."
      String.raw`Rs\.(?<amount>[\d,]+\.?\d*) spent on .+?Card ending (?<last4>\d{4}) on (?<date>[A-Za-z]+ \d{2},? \d{4}) at (?<merchant>[A-Za-z ]+?)\.`,
    ],
  },
  {
    bank: 'SBI',
    senderPatterns: ['AD-SBIINB', 'SBI-UPI', 'SBIINB', 'SBICRD'],
    patterns: [
      // "Rs.2,300.50 debited from SBI Credit Card XX1111 on 01/06/2026 at BigBazaar."
      String.raw`Rs\.(?<amount>[\d,]+\.?\d*) debited from SBI Credit Card XX(?<last4>\d{4}) on (?<date>\d{2}\/\d{2}\/\d{4}) at (?<merchant>[A-Za-z]+)`,
    ],
  },
  {
    bank: 'Axis',
    senderPatterns: ['AX-AXISBK', 'AXISBK'],
    patterns: [
      // "Rs.1,999.00 spent via your Flipkart Axis Bank Card ending 7890 on 01-Jun-26 at Flipkart."
      String.raw`Rs\.(?<amount>[\d,]+\.?\d*) spent via your Flipkart Axis Bank Card ending (?<last4>\d{4}) on (?<date>\d{2}-[A-Za-z]{3}-\d{2}) at (?<merchant>[A-Za-z]+)`,
    ],
  },
];

// Fallback: tried when no bank rule matches the sender
export const FALLBACK_RULE: ParserRule = {
  bank: 'UNKNOWN',
  senderPatterns: [],
  patterns: [
    // Generic spend pattern — captures amount + merchant + date, no last4 → always low confidence
    String.raw`Rs\.?\s*(?<amount>[\d,]+\.?\d*)\s+spent at (?<merchant>.+?) on (?<date>[\d\/]+)`,
    // Generic debit pattern — captures amount + last4, no merchant/date
    String.raw`Rs\.?\s*(?<amount>[\d,]+\.?\d*).*?(?:card|Card).*?(?<last4>\d{4})`,
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/sms/parserRules.ts
git commit -m "feat(shared): SMS parser rules for HDFC/ICICI/SBI/Axis + fallback"
```

---

## Task 5: parseSms() + full test suite

**Files:**
- Create: `packages/shared/src/sms/parser.ts`
- Create: `packages/shared/src/sms/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
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
```

- [ ] **Step 2: Run to verify tests fail**

```
cd packages/shared && pnpm test
```
Expected: FAIL — `parser.js` not found.

- [ ] **Step 3: Implement parser.ts**

```typescript
// packages/shared/src/sms/parser.ts
import type { SmsInput, ParseResult } from './types.js';
import { PARSER_RULES, FALLBACK_RULE } from './parserRules.js';
import { normalizeAmount, normalizeDate, normalizeMerchant } from './normalize.js';
import { dedupeHash as computeHash } from './dedupeHash.js';

const OTP_RE = /\bOTP\b|one.time.pass|verification code/i;

export async function parseSms(input: SmsInput): Promise<ParseResult | null> {
  // Step 1: Reject OTP / non-transaction messages immediately
  if (OTP_RE.test(input.body)) return null;

  // Step 2: Find matching bank rule by sender
  const matchedRule =
    PARSER_RULES.find((rule) =>
      rule.senderPatterns.some((p) => input.sender.includes(p)),
    ) ?? null;

  // Step 3: Try bank rule first, then fallback
  const rulesToTry = matchedRule
    ? [matchedRule, FALLBACK_RULE]
    : [FALLBACK_RULE];

  for (const rule of rulesToTry) {
    for (const patternSrc of rule.patterns) {
      const regex = new RegExp(patternSrc, rule.flags ?? 'i');
      const match = regex.exec(input.body);
      if (!match?.groups) continue;

      const { amount: rawAmt, last4, date: rawDate, merchant: rawMerchant } =
        match.groups;

      // Must capture at least an amount to be a transaction
      if (!rawAmt) continue;

      const isFallback = rule.bank === 'UNKNOWN';
      const hasAll = !!(rawAmt && last4 && rawDate && rawMerchant);
      const confidence: 'high' | 'low' =
        !isFallback && hasAll ? 'high' : 'low';

      const hash = await computeHash(input);

      return {
        bank: rule.bank,
        last4: last4 ?? '',
        amount: normalizeAmount(rawAmt),
        merchant: normalizeMerchant(rawMerchant ?? ''),
        date: rawDate
          ? normalizeDate(rawDate)
          : new Date(input.timestamp ?? Date.now())
              .toISOString()
              .split('T')[0],
        confidence,
        dedupeHash: hash,
        raw: input,
      };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests — expect all PASS**

```
cd packages/shared && pnpm test
```
Expected: 10 tests pass across all suites.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/sms/parserRules.ts packages/shared/src/sms/parser.ts packages/shared/src/sms/parser.test.ts
git commit -m "feat(shared): parseSms() with table-driven rules — 10 tests passing"
```

---

## Task 6: Export SMS from shared index + rebuild

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add SMS exports**

Edit `packages/shared/src/index.ts` — append two lines:

```typescript
export * from './models/index.js';
export * from './schemas/index.js';
export * from './domain/resolveHolder.js';
export * from './domain/billingCycle.js';
export type { SmsInput, ParseResult, ParserRule } from './sms/types.js';
export { parseSms } from './sms/parser.js';
```

- [ ] **Step 2: Rebuild shared**

```
cd packages/shared && pnpm build
```
Expected: `dist/` updated with new sms files, zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): export parseSms and SMS types from package root"
```

---

## Task 7: Install new app dependencies

**Files:**
- Modify: `packages/app/package.json`

The current app has `capacitor-biometric-auth@^0.1.1` (a stub). Replace it with the proper Capacitor 6-compatible library and add `@capacitor/app` for the lifecycle listener.

- [ ] **Step 1: Update package.json dependencies**

In `packages/app/package.json`, make these changes in the `"dependencies"` block:

Remove:
```json
"capacitor-biometric-auth": "^0.1.1"
```

Add:
```json
"@aparajita/capacitor-biometric-auth": "^7.0.0",
"@capacitor/app": "^6.0.0"
```

The final dependencies block should look like:
```json
"dependencies": {
  "@cardledger/shared": "workspace:*",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "react-router-dom": "^6.23.0",
  "@tanstack/react-query": "^5.40.0",
  "zustand": "^4.5.0",
  "framer-motion": "^11.2.0",
  "axios": "^1.7.0",
  "@capacitor/core": "^6.0.0",
  "@capacitor/android": "^6.0.0",
  "@aparajita/capacitor-biometric-auth": "^7.0.0",
  "@capacitor/app": "^6.0.0"
}
```

- [ ] **Step 2: Install**

```
cd C:/Users/vj/IdeaProjects/CardLedger && pnpm install
```
Expected: lockfile updated, `@aparajita/capacitor-biometric-auth` and `@capacitor/app` appear in `node_modules`.

- [ ] **Step 3: Commit**

```bash
git add packages/app/package.json pnpm-lock.yaml
git commit -m "chore(app): swap biometric lib to @aparajita v7, add @capacitor/app"
```

---

## Task 8: Capacitor TS bridge (SmsPlugin.ts)

**Files:**
- Create: `packages/app/src/plugins/SmsPlugin.ts`

- [ ] **Step 1: Create the bridge**

```typescript
// packages/app/src/plugins/SmsPlugin.ts
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface SmsMessage {
  sender: string;
  body: string;
  timestamp: number; // Unix ms
}

export interface SmsPlugin {
  readInbox(options: { daysBack: number }): Promise<{ messages: SmsMessage[] }>;
  checkPermissions(): Promise<{ sms: PermissionState }>;
  requestPermissions(): Promise<{ sms: PermissionState }>;
  addListener(
    event: 'smsReceived',
    handler: (msg: SmsMessage) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// Web stub: SMS is silently unavailable on PWA — no errors thrown
export const Sms = registerPlugin<SmsPlugin>('SmsPlugin', {
  web: () => ({
    readInbox: async () => ({ messages: [] }),
    checkPermissions: async () => ({ sms: 'denied' as PermissionState }),
    requestPermissions: async () => ({ sms: 'denied' as PermissionState }),
    addListener: async () => ({ remove: async () => {} }),
    removeAllListeners: async () => {},
  }),
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/plugins/SmsPlugin.ts
git commit -m "feat(app): Capacitor SMS plugin TS bridge with web stub"
```

---

## Task 9: permissions.ts

**Files:**
- Create: `packages/app/src/lib/permissions.ts`

- [ ] **Step 1: Create permissions helper**

```typescript
// packages/app/src/lib/permissions.ts
import { Sms } from '../plugins/SmsPlugin.js';

const SETUP_KEY = 'cl_sms_setup';

/** Returns true if the READ_SMS + RECEIVE_SMS runtime prompt has already been accepted. */
export function isSmsSetupDone(): boolean {
  return localStorage.getItem(SETUP_KEY) === 'done';
}

/**
 * Requests READ_SMS + RECEIVE_SMS in a single runtime prompt.
 * Call this ONCE from PermissionSetupScreen.
 * Returns true if granted, false if denied.
 */
export async function requestAllPermissions(): Promise<boolean> {
  const result = await Sms.requestPermissions();
  if (result.sms === 'granted') {
    localStorage.setItem(SETUP_KEY, 'done');
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/lib/permissions.ts
git commit -m "feat(app): requestAllPermissions() — single SMS runtime prompt"
```

---

## Task 10: biometric.ts

**Files:**
- Create: `packages/app/src/lib/biometric.ts`

- [ ] **Step 1: Create biometric helper**

```typescript
// packages/app/src/lib/biometric.ts
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const PREF_KEY = 'cl_biometric_enabled';

/** Returns the stored user preference (default true on first run). */
export function isBiometricEnabled(): boolean {
  const stored = localStorage.getItem(PREF_KEY);
  return stored === null ? true : stored === 'true';
}

/** Persist the user's preference. */
export function setBiometricEnabled(enabled: boolean): void {
  localStorage.setItem(PREF_KEY, String(enabled));
}

/**
 * Attempts biometric authentication.
 * - 'success'     → fingerprint/face matched
 * - 'fallback'    → user cancelled or tapped "Use PIN"
 * - 'unavailable' → hardware not present / not enrolled
 */
export async function unlockWithBiometric(): Promise<'success' | 'fallback' | 'unavailable'> {
  const { isAvailable } = await BiometricAuth.checkBiometry();
  if (!isAvailable) return 'unavailable';

  try {
    await BiometricAuth.authenticate({
      reason: 'Unlock CardLedger',
      cancelTitle: 'Use PIN',
      allowDeviceCredential: false,
    });
    return 'success';
  } catch {
    // User cancelled, tapped Use PIN, or auth failed after retries
    return 'fallback';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/lib/biometric.ts
git commit -m "feat(app): biometric unlock helper with @aparajita/capacitor-biometric-auth v7"
```

---

## Task 11: reviewStore.ts

**Files:**
- Create: `packages/app/src/store/reviewStore.ts`

- [ ] **Step 1: Create the persisted store**

```typescript
// packages/app/src/store/reviewStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParseResult } from '@cardledger/shared';

export interface ReviewItem {
  id: string;
  parseResult: ParseResult;
  /**
   * Auto-matched card ID by last4 at enqueue time.
   * undefined = no card with that last4 found — user must pick from dropdown in ReviewQueueScreen.
   */
  cardId?: string;
}

interface ReviewState {
  queue: ReviewItem[];
  /** Hashes of all processed messages (auto-committed + queued) — used for deduplication. */
  knownHashes: string[];
  enqueue: (item: ReviewItem) => void;
  /** Record a hash as processed without adding to the review queue (used after auto-commit). */
  addHash: (hash: string) => void;
  /** Remove item from queue after user confirms or dismisses. */
  remove: (id: string) => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      queue: [],
      knownHashes: [],
      enqueue: (item) =>
        set((s) => ({
          queue: [...s.queue, item],
          knownHashes: [...s.knownHashes, item.parseResult.dedupeHash],
        })),
      addHash: (hash) =>
        set((s) => ({ knownHashes: [...s.knownHashes, hash] })),
      remove: (id) =>
        set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),
    }),
    { name: 'cl_review_store' },
  ),
);
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/store/reviewStore.ts
git commit -m "feat(app): Zustand persisted review queue store"
```

---

## Task 12: Update AppLockScreen for biometric flow

**Files:**
- Modify: `packages/app/src/screens/AppLockScreen.tsx`

Replace the current PIN-only screen with the biometric → PIN fallback flow.

- [ ] **Step 1: Replace AppLockScreen.tsx**

```typescript
// packages/app/src/screens/AppLockScreen.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Screen } from '../components/Screen.js';
import { PinPad } from '../components/PinPad.js';
import { useUiStore } from '../store/uiStore.js';
import { setupPin, isPinSet, verifyPin } from '../lib/pin.js';
import { unlockWithBiometric, isBiometricEnabled } from '../lib/biometric.js';

export default function AppLockScreen() {
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const unlock = useUiStore((s) => s.unlock);
  const nav = useNavigate();
  const pinSet = isPinSet();

  // On Android, attempt biometric unlock immediately on mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isBiometricEnabled() || !pinSet) {
      setShowPin(true);
      return;
    }
    unlockWithBiometric().then((outcome) => {
      if (outcome === 'success') {
        unlock();
        nav('/', { replace: true });
      } else {
        // 'fallback' or 'unavailable' → show PIN pad
        setShowPin(true);
      }
    });
  }, []);

  function handlePin(pin: string) {
    if (!pinSet) {
      setupPin(pin);
      unlock();
      nav('/', { replace: true });
      return;
    }
    if (verifyPin(pin)) {
      unlock();
      nav('/', { replace: true });
    } else {
      setError('Wrong PIN — try again');
    }
  }

  if (!showPin) {
    // Biometric attempt in progress — show nothing (or a brief spinner)
    return (
      <Screen className="justify-center items-center">
        <span className="text-muted text-sm">Authenticating…</span>
      </Screen>
    );
  }

  return (
    <Screen className="justify-center">
      <PinPad
        onComplete={handlePin}
        label={pinSet ? 'Enter PIN to unlock' : 'Set a 6-digit PIN'}
        error={error}
      />
      {Capacitor.isNativePlatform() && isBiometricEnabled() && pinSet && (
        <button
          className="mt-4 text-gold text-sm underline"
          onClick={() =>
            unlockWithBiometric().then((o) => {
              if (o === 'success') { unlock(); nav('/', { replace: true }); }
            })
          }
        >
          Use biometric
        </button>
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Build app to check for type errors**

```
cd packages/app && pnpm build
```
Expected: builds successfully, zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/screens/AppLockScreen.tsx
git commit -m "feat(app): biometric → PIN fallback in AppLockScreen"
```

---

## Task 13: Biometric toggle in SettingsScreen

**Files:**
- Modify: `packages/app/src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Add biometric toggle row**

Add these imports at the top of `SettingsScreen.tsx`:
```typescript
import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { isBiometricEnabled, setBiometricEnabled } from '../lib/biometric.js';
```

Replace the existing `function SettingsScreen()` body with:

```typescript
export default function SettingsScreen() {
  const nav = useNavigate();
  const lock = useUiStore((s) => s.lock);
  const [changingPin, setChangingPin] = useState(false);
  const [biometricOn, setBiometricOn] = useState(isBiometricEnabled);

  function handleLockNow() {
    lock();
    nav('/lock', { replace: true });
  }

  function toggleBiometric() {
    const next = !biometricOn;
    setBiometricEnabled(next);
    setBiometricOn(next);
  }

  return (
    <Screen className="pb-24">
      <TopBar title="Settings" />
      <div className="px-4 flex flex-col gap-3">
        <div className="bg-surface rounded-card overflow-hidden">
          <button
            onClick={handleLockNow}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
          >
            <span className="text-sm">Lock app now</span>
            <span className="text-muted">→</span>
          </button>
          <div className="h-px bg-elevated" />
          <button
            onClick={() => setChangingPin(true)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
          >
            <span className="text-sm">{isPinSet() ? 'Change PIN' : 'Set PIN'}</span>
            <span className="text-muted">→</span>
          </button>
          {Capacitor.isNativePlatform() && (
            <>
              <div className="h-px bg-elevated" />
              <button
                onClick={toggleBiometric}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
              >
                <span className="text-sm">Biometric unlock</span>
                <span
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${
                    biometricOn ? 'bg-gold' : 'bg-elevated'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      biometricOn ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </>
          )}
        </div>

        {changingPin && (
          <div className="bg-surface rounded-card">
            <PinPad
              label="Enter new PIN"
              onComplete={(pin) => {
                setupPin(pin);
                setChangingPin(false);
              }}
            />
          </div>
        )}

        <div className="bg-surface rounded-card overflow-hidden mt-4">
          <button
            onClick={logout}
            className="w-full flex items-center justify-between px-5 py-4 text-danger hover:bg-elevated transition-colors"
          >
            <span className="text-sm">Sign out</span>
            <span>→</span>
          </button>
        </div>
      </div>
      <BottomNav />
    </Screen>
  );
}
```

- [ ] **Step 2: Build to check for errors**

```
cd packages/app && pnpm build
```
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/screens/SettingsScreen.tsx
git commit -m "feat(app): biometric toggle in SettingsScreen"
```

---

## Task 14: PermissionSetupScreen + guard

**Files:**
- Create: `packages/app/src/guards/PermissionSetupGuard.tsx`
- Create: `packages/app/src/screens/PermissionSetupScreen.tsx`

- [ ] **Step 1: Create PermissionSetupGuard**

```typescript
// packages/app/src/guards/PermissionSetupGuard.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { isSmsSetupDone } from '../lib/permissions.js';

/** On Android, redirects to /setup-permissions until SMS permissions are granted. */
export function PermissionSetupGuard() {
  if (Capacitor.isNativePlatform() && !isSmsSetupDone()) {
    return <Navigate to="/setup-permissions" replace />;
  }
  return <Outlet />;
}
```

- [ ] **Step 2: Create PermissionSetupScreen**

```typescript
// packages/app/src/screens/PermissionSetupScreen.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { requestAllPermissions } from '../lib/permissions.js';

export default function PermissionSetupScreen() {
  const nav = useNavigate();
  const [status, setStatus] = useState<'idle' | 'requesting' | 'denied'>('idle');

  async function handleGrant() {
    setStatus('requesting');
    const granted = await requestAllPermissions();
    if (granted) {
      nav('/', { replace: true });
    } else {
      setStatus('denied');
    }
  }

  return (
    <Screen className="justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <span className="text-5xl">💬</span>
        <h1 className="text-xl font-semibold">Enable SMS Import</h1>
        <p className="text-muted text-sm leading-relaxed">
          CardLedger reads your bank SMS messages to auto-import transactions.
          Your messages never leave this device.
        </p>

        {status === 'denied' && (
          <p className="text-danger text-sm">
            Permission denied. Please enable SMS access in Android Settings → Apps → CardLedger → Permissions.
          </p>
        )}

        <button
          onClick={handleGrant}
          disabled={status === 'requesting'}
          className="w-full bg-gold text-base font-semibold py-4 rounded-input disabled:opacity-50"
        >
          {status === 'requesting' ? 'Requesting…' : 'Grant SMS Access'}
        </button>

        <button
          onClick={() => nav('/', { replace: true })}
          className="text-muted text-sm underline"
        >
          Skip for now
        </button>
      </motion.div>
    </Screen>
  );
}
```

- [ ] **Step 3: Build to check for errors**

```
cd packages/app && pnpm build
```
Expected: zero TS errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/guards/PermissionSetupGuard.tsx packages/app/src/screens/PermissionSetupScreen.tsx
git commit -m "feat(app): PermissionSetupScreen + guard for one-time SMS grant"
```

---

## Task 15: SmsImportScreen

**Files:**
- Create: `packages/app/src/screens/SmsImportScreen.tsx`

- [ ] **Step 1: Create SmsImportScreen**

```typescript
// packages/app/src/screens/SmsImportScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { Sms } from '../plugins/SmsPlugin.js';
import { parseSms } from '@cardledger/shared';
import { useReviewStore } from '../store/reviewStore.js';
import { useCards } from '../data/hooks/useCards.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { useCreateTransaction } from '../data/hooks/useTransactions.js';
import type { Card } from '@cardledger/shared';

export default function SmsImportScreen() {
  const nav = useNavigate();
  const { data: cards = [] } = useCards();
  const { data: transactions = [] } = useTransactions();
  const createTxn = useCreateTransaction();
  const { queue, knownHashes, enqueue, addHash } = useReviewStore();
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; queued: number } | null>(null);
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);

  // Build the full dedupe set: server-confirmed + locally queued
  function buildHashSet(): Set<string> {
    const serverHashes = transactions
      .map((t) => t.dedupe_hash)
      .filter((h): h is string => !!h);
    return new Set([...serverHashes, ...knownHashes]);
  }

  // Match a last4 to a cardId
  function findCardId(last4: string): string | undefined {
    return (cards as Card[]).find((c) => c.last4 === last4)?.id;
  }

  async function handleScan() {
    setScanning(true);
    setSummary(null);
    let imported = 0;
    let queued = 0;
    const hashSet = buildHashSet();

    try {
      const { messages } = await Sms.readInbox({ daysBack: 90 });
      for (const msg of messages) {
        const result = await parseSms(msg);
        if (!result) continue;
        if (hashSet.has(result.dedupeHash)) continue; // already processed

        if (result.confidence === 'high' && result.last4) {
          const cardId = findCardId(result.last4);
          if (cardId) {
            await createTxn.mutateAsync({
              card_id: cardId,
              amount: result.amount,
              merchant: result.merchant,
              txn_date: result.date,
              source: 'sms',
              dedupe_hash: result.dedupeHash,
              raw_sms_encrypted: null,
            });
            addHash(result.dedupeHash);
            imported++;
            continue;
          }
        }

        // Low confidence OR card not found → queue for review
        const cardId = result.last4 ? findCardId(result.last4) : undefined;
        enqueue({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          parseResult: result,
          cardId,
        });
        queued++;
      }
      setSummary({ imported, queued });
    } finally {
      setScanning(false);
    }
  }

  // Live listener: parse incoming SMS in real time while screen is mounted
  useEffect(() => {
    Sms.addListener('smsReceived', async (msg) => {
      const result = await parseSms(msg);
      if (!result) return;
      const hashSet = buildHashSet();
      if (hashSet.has(result.dedupeHash)) return;
      const cardId = result.last4 ? findCardId(result.last4) : undefined;
      enqueue({ id: `live-${Date.now()}`, parseResult: result, cardId });
    }).then((handle) => {
      listenerRef.current = handle;
    });
    return () => { listenerRef.current?.remove(); };
  }, []);

  const pendingCount = queue.length;

  return (
    <Screen className="pb-24">
      <TopBar title="SMS Import" />
      <div className="px-4 flex flex-col gap-4 pt-4">
        <p className="text-muted text-sm">
          Scans your inbox for the last 90 days. High-confidence transactions
          are saved automatically; others go to the review queue.
        </p>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleScan}
          disabled={scanning}
          className="w-full bg-gold text-base font-semibold py-4 rounded-input disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : 'Scan Inbox'}
        </motion.button>

        {summary && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-success"
          >
            {summary.imported} imported · {summary.queued} need review
          </motion.p>
        )}

        {pendingCount > 0 && (
          <button
            onClick={() => nav('/sms/review')}
            className="w-full bg-surface border border-elevated rounded-input py-4 text-sm flex items-center justify-between px-5"
          >
            <span>Review queue</span>
            <span className="bg-danger text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {pendingCount}
            </span>
          </button>
        )}
      </div>
      <BottomNav />
    </Screen>
  );
}
```

- [ ] **Step 2: Build to check for errors**

```
cd packages/app && pnpm build
```
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/screens/SmsImportScreen.tsx
git commit -m "feat(app): SmsImportScreen — inbox scan + live listener + deduplication"
```

---

## Task 16: ReviewQueueScreen

**Files:**
- Create: `packages/app/src/screens/ReviewQueueScreen.tsx`

- [ ] **Step 1: Create ReviewQueueScreen**

```typescript
// packages/app/src/screens/ReviewQueueScreen.tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { useReviewStore, type ReviewItem } from '../store/reviewStore.js';
import { useCreateTransaction } from '../data/hooks/useTransactions.js';
import { useCards } from '../data/hooks/useCards.js';
import type { Card } from '@cardledger/shared';

export default function ReviewQueueScreen() {
  const { queue, remove } = useReviewStore();
  const createTxn = useCreateTransaction();
  const { data: cards = [] } = useCards();

  if (queue.length === 0) {
    return (
      <Screen className="pb-24">
        <TopBar title="Review Queue" />
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted">
          <span className="text-4xl">✓</span>
          <p className="text-sm">All caught up</p>
        </div>
        <BottomNav />
      </Screen>
    );
  }

  return (
    <Screen className="pb-24">
      <TopBar title={`Review Queue (${queue.length})`} />
      <div className="px-4 flex flex-col gap-3 pt-4">
        <AnimatePresence>
          {queue.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              cards={cards as Card[]}
              onConfirm={async (cardId, amount, merchant, date) => {
                await createTxn.mutateAsync({
                  card_id: cardId,
                  amount,
                  merchant,
                  txn_date: date,
                  source: 'sms',
                  dedupe_hash: item.parseResult.dedupeHash,
                  raw_sms_encrypted: null,
                });
                remove(item.id);
              }}
              onDismiss={() => remove(item.id)}
            />
          ))}
        </AnimatePresence>
      </div>
      <BottomNav />
    </Screen>
  );
}

// ─── ReviewCard sub-component ────────────────────────────────────────────────

interface ReviewCardProps {
  item: ReviewItem;
  cards: Card[];
  onConfirm: (cardId: string, amount: number, merchant: string, date: string) => Promise<void>;
  onDismiss: () => void;
}

function ReviewCard({ item, cards, onConfirm, onDismiss }: ReviewCardProps) {
  const pr = item.parseResult;
  const [amount, setAmount] = useState(String(pr.amount));
  const [merchant, setMerchant] = useState(pr.merchant);
  const [date, setDate] = useState(pr.date);
  const [cardId, setCardId] = useState(item.cardId ?? '');
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!cardId) return;
    setSaving(true);
    try {
      await onConfirm(cardId, parseFloat(amount), merchant, date);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full bg-elevated border border-elevated rounded-input px-3 py-2 text-sm focus:border-gold outline-none';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="bg-surface rounded-card p-4 flex flex-col gap-3"
    >
      {/* Raw SMS snippet */}
      <p className="text-xs text-muted font-mono leading-relaxed line-clamp-3">
        {pr.raw.body}
      </p>
      <p className="text-xs text-muted">
        Bank: <span className="text-white">{pr.bank}</span>
        {pr.last4 && <> · last4: <span className="text-white">{pr.last4}</span></>}
      </p>

      {/* Editable fields */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Amount (₹)</label>
          <input
            type="number"
            className={inputCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Date</label>
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Merchant</label>
        <input
          type="text"
          className={inputCls}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Card</label>
        <select
          className={inputCls}
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
        >
          <option value="">— Select card —</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nickname} ···{c.last4}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleConfirm}
          disabled={saving || !cardId}
          className="flex-1 bg-gold font-semibold py-2 rounded-input text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 bg-elevated py-2 rounded-input text-sm text-muted"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Build to check for errors**

```
cd packages/app && pnpm build
```
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/screens/ReviewQueueScreen.tsx
git commit -m "feat(app): ReviewQueueScreen — editable confirm/dismiss per item"
```

---

## Task 17: BottomNav with SMS tab + badge

**Files:**
- Modify: `packages/app/src/components/BottomNav.tsx`

- [ ] **Step 1: Replace BottomNav.tsx**

```typescript
// packages/app/src/components/BottomNav.tsx
import { Link, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useReviewStore } from '../store/reviewStore.js';

const WEB_TABS = [
  { path: '/', label: 'Home', icon: '⬡' },
  { path: '/holders', label: 'Holders', icon: '◎' },
  { path: '/settings', label: 'Settings', icon: '◈' },
];

const ANDROID_TABS = [
  ...WEB_TABS,
  { path: '/sms', label: 'SMS', icon: '✉' },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const reviewCount = useReviewStore((s) => s.queue.length);
  const tabs = Capacitor.isNativePlatform() ? ANDROID_TABS : WEB_TABS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-elevated flex">
      {tabs.map((tab) => {
        const active = pathname === tab.path || pathname.startsWith(tab.path + '/');
        const isSms = tab.path === '/sms';
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${
              active ? 'text-gold' : 'text-muted'
            }`}
          >
            <span className="text-lg leading-none relative">
              {tab.icon}
              {isSms && reviewCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-danger text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {reviewCount > 9 ? '9+' : reviewCount}
                </span>
              )}
            </span>
            <span>{tab.label}</span>
            {active && <span className="w-4 h-0.5 rounded-full bg-gold" />}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Build to check for errors**

```
cd packages/app && pnpm build
```
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/BottomNav.tsx
git commit -m "feat(app): BottomNav adds SMS tab with review badge on Android"
```

---

## Task 18: Update App.tsx routes

**Files:**
- Modify: `packages/app/src/App.tsx`

- [ ] **Step 1: Replace App.tsx**

```typescript
// packages/app/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './guards/AuthGuard.js';
import { AppLockGuard } from './guards/AppLockGuard.js';
import { PermissionSetupGuard } from './guards/PermissionSetupGuard.js';
import LoginScreen from './screens/LoginScreen.js';
import HomeScreen from './screens/HomeScreen.js';
import CardDetailScreen from './screens/CardDetailScreen.js';
import HolderViewScreen from './screens/HolderViewScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';
import AppLockScreen from './screens/AppLockScreen.js';
import AddCardScreen from './screens/AddCardScreen.js';
import PermissionSetupScreen from './screens/PermissionSetupScreen.js';
import SmsImportScreen from './screens/SmsImportScreen.js';
import ReviewQueueScreen from './screens/ReviewQueueScreen.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<AuthGuard />}>
        <Route path="/lock" element={<AppLockScreen />} />
        <Route path="/setup-permissions" element={<PermissionSetupScreen />} />
        <Route element={<AppLockGuard />}>
          <Route element={<PermissionSetupGuard />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/cards/new" element={<AddCardScreen />} />
            <Route path="/cards/:id" element={<CardDetailScreen />} />
            <Route path="/holders" element={<HolderViewScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/sms" element={<SmsImportScreen />} />
            <Route path="/sms/review" element={<ReviewQueueScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 2: Build to check for errors**

```
cd packages/app && pnpm build
```
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/App.tsx
git commit -m "feat(app): add /setup-permissions, /sms, /sms/review routes"
```

---

## Task 19: 5-minute background lock in main.tsx

**Files:**
- Modify: `packages/app/src/main.tsx`

- [ ] **Step 1: Add App lifecycle listener**

Replace the contents of `packages/app/src/main.tsx` with:

```typescript
// packages/app/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useUiStore } from './store/uiStore.js';
import AppRoot from './App.js';
import './styles/globals.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

// 5-minute background lock (Android only)
if (Capacitor.isNativePlatform()) {
  let bgTimestamp: number | null = null;
  const LOCK_AFTER_MS = 5 * 60 * 1000;

  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      bgTimestamp = Date.now();
    } else {
      if (bgTimestamp !== null && Date.now() - bgTimestamp > LOCK_AFTER_MS) {
        useUiStore.getState().lock();
      }
      bgTimestamp = null;
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoot />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Build to check for errors**

```
cd packages/app && pnpm build
```
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/main.tsx
git commit -m "feat(app): 5-min background lock via @capacitor/app appStateChange"
```

---

## Task 20: Update capacitor.config.ts

**Files:**
- Modify: `packages/app/capacitor.config.ts`

- [ ] **Step 1: Replace capacitor.config.ts**

```typescript
// packages/app/capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'com.cardledger.app',
  appName: 'CardLedger',
  webDir: 'dist',
  // Dev mode: point to host server via Android emulator alias 10.0.2.2
  // Production: bundled dist talks directly to deployed server — server key omitted
  ...(isDev && {
    server: {
      url: 'http://10.0.2.2:3001',
      androidScheme: 'http',
    },
  }),
  plugins: {
    SplashScreen: { launchAutoHide: false },
  },
};

export default config;
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/capacitor.config.ts
git commit -m "feat(app): capacitor.config.ts dev/prod server URL conditional"
```

---

## Task 21: Update app package.json scripts

**Files:**
- Modify: `packages/app/package.json`

- [ ] **Step 1: Add APK build scripts**

In `packages/app/package.json`, replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "cap:init": "cap add android",
  "cap:build": "pnpm build && cap sync android",
  "cap:apk": "cd android && ./gradlew assembleDebug",
  "cap:install": "adb install android/app/build/outputs/apk/debug/app-debug.apk",
  "cap:run": "pnpm cap:build && pnpm cap:apk && pnpm cap:install"
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/package.json
git commit -m "chore(app): add cap:build, cap:apk, cap:install, cap:run scripts"
```

---

## Task 22: cap add android

**Prerequisite:** Node 20, JDK 17, Android SDK with `sdkmanager`. Run from `packages/app`.

- [ ] **Step 1: Build the web assets first (required by cap add)**

```
cd packages/app && pnpm build
```
Expected: `dist/` populated.

- [ ] **Step 2: Run cap add android**

```
cd packages/app && npx cap add android
```
Expected: `packages/app/android/` created with full Gradle project structure. Output ends with `✔ Adding native android project in android in 1.2s`.

- [ ] **Step 3: Verify structure**

```
ls packages/app/android/app/src/main/java/com/cardledger/app/
```
Expected: `MainActivity.kt` exists.

- [ ] **Step 4: Commit**

```bash
git add packages/app/android
git commit -m "chore(app): cap add android — initial Android project scaffold"
```

---

## Task 23: Kotlin SMS plugin

**Files:**
- Create: `packages/app/android/app/src/main/java/com/cardledger/app/SmsPlugin.kt`
- Create: `packages/app/android/app/src/main/java/com/cardledger/app/SmsReceiver.kt`
- Modify: `packages/app/android/app/src/main/java/com/cardledger/app/MainActivity.kt`
- Modify: `packages/app/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create SmsPlugin.kt**

```kotlin
// packages/app/android/app/src/main/java/com/cardledger/app/SmsPlugin.kt
package com.cardledger.app

import android.Manifest
import android.database.Cursor
import android.net.Uri
import com.getcapacitor.*
import com.getcapacitor.annotation.*

@CapacitorPlugin(
    name = "SmsPlugin",
    permissions = [
        Permission(
            strings = [Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS],
            alias = "sms"
        )
    ]
)
class SmsPlugin : Plugin() {

    companion object {
        @JvmStatic
        var instance: SmsPlugin? = null
    }

    override fun load() {
        instance = this
    }

    /** Called by SmsReceiver when a new SMS arrives. Fires 'smsReceived' to JS. */
    fun notifySms(sender: String, body: String) {
        val data = JSObject()
        data.put("sender", sender)
        data.put("body", body)
        data.put("timestamp", System.currentTimeMillis())
        notifyListeners("smsReceived", data)
    }

    @PluginMethod
    fun readInbox(call: PluginCall) {
        val daysBack = call.getInt("daysBack", 90)!!
        val cutoff = System.currentTimeMillis() - daysBack.toLong() * 24L * 60L * 60L * 1000L

        val messages = JSArray()
        val cursor: Cursor? = context.contentResolver.query(
            Uri.parse("content://sms/inbox"),
            arrayOf("address", "body", "date"),
            "date > ?",
            arrayOf(cutoff.toString()),
            "date DESC"
        )

        cursor?.use { c ->
            val addrIdx = c.getColumnIndexOrThrow("address")
            val bodyIdx = c.getColumnIndexOrThrow("body")
            val dateIdx = c.getColumnIndexOrThrow("date")
            while (c.moveToNext()) {
                val obj = JSObject()
                obj.put("sender", c.getString(addrIdx) ?: "")
                obj.put("body", c.getString(bodyIdx) ?: "")
                obj.put("timestamp", c.getLong(dateIdx))
                messages.put(obj)
            }
        }

        val result = JSObject()
        result.put("messages", messages)
        call.resolve(result)
    }
}
```

- [ ] **Step 2: Create SmsReceiver.kt**

```kotlin
// packages/app/android/app/src/main/java/com/cardledger/app/SmsReceiver.kt
package com.cardledger.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        Telephony.Sms.Intents.getMessagesFromIntent(intent)?.forEach { msg ->
            SmsPlugin.instance?.notifySms(
                msg.displayOriginatingAddress ?: "",
                msg.messageBody ?: ""
            )
        }
    }
}
```

- [ ] **Step 3: Update MainActivity.kt to register the plugin**

The generated `MainActivity.kt` looks like:
```kotlin
package com.cardledger.app
import android.os.Bundle
import com.getcapacitor.BridgeActivity
class MainActivity : BridgeActivity()
```

Replace it with:
```kotlin
// packages/app/android/app/src/main/java/com/cardledger/app/MainActivity.kt
package com.cardledger.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SmsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

- [ ] **Step 4: Update AndroidManifest.xml**

Open `packages/app/android/app/src/main/AndroidManifest.xml`.

Add permissions immediately after the opening `<manifest ...>` tag (before `<application>`):
```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
```

Add the receiver declaration inside `<application>`, just before the closing `</application>` tag:
```xml
<receiver android:name=".SmsReceiver" android:exported="true">
    <intent-filter android:priority="999">
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

- [ ] **Step 5: Commit**

```bash
git add packages/app/android/app/src/main/java/com/cardledger/app/SmsPlugin.kt
git add packages/app/android/app/src/main/java/com/cardledger/app/SmsReceiver.kt
git add packages/app/android/app/src/main/java/com/cardledger/app/MainActivity.kt
git add packages/app/android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): custom SmsPlugin + SmsReceiver, permissions in manifest"
```

---

## Task 24: cap sync + build debug APK

- [ ] **Step 1: cap sync (copies web assets + plugins to android)**

```
cd packages/app && npx cap sync android
```
Expected: output ends with `✔ Copying web assets from dist to android/app/src/main/assets/public` and `✔ Updating Android plugins`.

- [ ] **Step 2: Build the debug APK**

```
cd packages/app/android && ./gradlew assembleDebug
```
On Windows use `gradlew.bat assembleDebug`.

Expected: `BUILD SUCCESSFUL` after 2-3 minutes. APK at `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 3: Verify APK exists**

```
ls packages/app/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: file present, size > 5 MB.

- [ ] **Step 4: (Optional) Install to connected device**

```
cd packages/app && adb install android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: `Success` printed by adb.

- [ ] **Step 5: Commit**

```bash
git add packages/app/android/app/build/outputs/apk/debug/app-debug.apk
git commit -m "build(android): debug APK — CardLedger v0.1 SP3"
```
> Note: If you prefer not to commit the binary, add `**/build/` to `.gitignore` and skip this step.

---

## Task 25: PWA smoke test

Verify the web build is unaffected — no Android-specific code breaks in browser.

- [ ] **Step 1: Run a full web build**

```
cd packages/app && pnpm build
```
Expected: zero TS errors, zero Vite warnings about missing modules.

- [ ] **Step 2: Run shared tests**

```
cd packages/shared && pnpm test
```
Expected: all 10+ tests pass.

- [ ] **Step 3: Start preview and manually verify**

```
cd packages/app && pnpm preview
```
Open `http://localhost:4173`. Login → check:
- BottomNav shows 3 tabs (not 4) on web
- SettingsScreen has no Biometric toggle row on web
- No `/sms` route in nav
- No console errors

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore: SP3 complete — SMS parser, Kotlin plugin, biometric, APK build"
```

---

## Self-Review Checklist

| Spec requirement | Task covering it |
|---|---|
| `parseSms()` passes all 8 fixture tests | Task 5 |
| `READ_SMS + RECEIVE_SMS` single runtime prompt | Task 9, Task 14 |
| `Sms.readInbox({ daysBack: 90 })` TS bridge | Task 8 |
| High-confidence auto-commits to /transactions | Task 15 |
| Low-confidence → review queue | Task 15, Task 11 |
| Biometric unlock with PIN fallback | Task 10, Task 12 |
| 5-minute background lock | Task 19 |
| Settings biometric toggle | Task 13 |
| `./gradlew assembleDebug` produces APK | Task 24 |
| PWA unaffected (SMS tabs hidden, no errors) | Task 25 |
| AndroidManifest permissions + receiver | Task 23 |
| `cap add android` scaffold | Task 22 |
| cap sync copies assets | Task 24 |
| Review queue confirm/edit/dismiss | Task 16 |
| BottomNav badge count | Task 17 |
