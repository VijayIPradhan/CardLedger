# CardLedger SP5 — Card Type Detection & Network Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a card's network/bank/variant from the full number typed at add-time (BIN lookup), persist only BIN6 + last4 + detected fields, and show the network logo image on each card tile.

**Architecture:** A pure `cardType` module in `packages/shared` does sanitization + local BIN→network detection (unit-tested). The app adds a client-side `binLookup` (binlist.net with local fallback), bundled network SVG logos, an add-card detection UX, and a CardTile logo. New nullable `bin`/`variant` columns are added to `cards` via a Drizzle migration. The full PAN never leaves component state.

**Tech Stack:** Vitest, Drizzle ORM + drizzle-kit, Fastify, React, Vite (SVG-as-URL imports).

---

## File Map

| File | Change |
|---|---|
| `packages/shared/src/domain/cardType.ts` | **New** — sanitize/extractBin/extractLast4/detectNetwork/luhnValid |
| `packages/shared/src/domain/cardType.test.ts` | **New** — Vitest |
| `packages/shared/src/models/index.ts` | `Card` gains `bin`, `variant` |
| `packages/shared/src/schemas/index.ts` | `CreateCardSchema` gains optional `bin`, `variant` |
| `packages/shared/src/index.ts` | export `./domain/cardType.js` |
| `packages/server/src/db/schema.ts` | `cards` gains `bin`, `variant` text columns |
| `packages/server/drizzle/*` | generated migration |
| `packages/app/src/lib/binLookup.ts` | **New** — client BIN lookup |
| `packages/app/src/lib/networkLogo.ts` | **New** — network → bundled SVG URL |
| `packages/app/src/assets/networks/*.svg` | **New** — visa/mastercard/rupay/amex/card-generic |
| `packages/app/src/vite-env.d.ts` | **New** — `vite/client` types (SVG module decls) |
| `packages/app/src/screens/AddCardScreen.tsx` | card-number field + detection + variant |
| `packages/app/src/components/CardTile.tsx` | network logo image + variant |

---

## Task 1: Shared cardType module + tests

**Files:**
- Create: `packages/shared/src/domain/cardType.ts`
- Create: `packages/shared/src/domain/cardType.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/domain/cardType.test.ts
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
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd packages/shared && pnpm test`
Expected: FAIL — `cardType.js` not found.

- [ ] **Step 3: Implement cardType.ts**

```typescript
// packages/shared/src/domain/cardType.ts
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd packages/shared && pnpm test`
Expected: all cardType tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain/cardType.ts packages/shared/src/domain/cardType.test.ts
git commit -m "feat(shared): cardType detection module (BIN→network, luhn) with tests"
```

---

## Task 2: Card model + schema + shared export

**Files:**
- Modify: `packages/shared/src/models/index.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add bin/variant to Card model**

In `packages/shared/src/models/index.ts`, the `Card` interface currently ends with `credit_limit: number;` then `created_at: string;`. Add two fields so it reads:

```typescript
export interface Card {
  id: string;
  last4: string;
  network: Network;
  bank: string;
  nickname: string;
  billing_cycle_day: number;
  payment_due_day: number;
  credit_limit: number;
  bin: string | null;
  variant: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Add optional bin/variant to CreateCardSchema**

In `packages/shared/src/schemas/index.ts`, the current `CreateCardSchema` ends with `credit_limit: z.number().positive(),`. Add two lines before the closing `})`:

```typescript
export const CreateCardSchema = z.object({
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  network: NetworkSchema,
  bank: z.string().min(1).max(100),
  nickname: z.string().min(1).max(100),
  billing_cycle_day: z.number().int().min(1).max(28),
  payment_due_day: z.number().int().min(1).max(28),
  credit_limit: z.number().positive(),
  bin: z.string().regex(/^\d{6}$/).optional(),
  variant: z.string().max(100).optional(),
});
```

(`UpdateCardSchema = CreateCardSchema.partial()` already exists and inherits these.)

- [ ] **Step 3: Export cardType from index**

In `packages/shared/src/index.ts`, add after the analytics export line:

```typescript
export * from './domain/cardType.js';
```

- [ ] **Step 4: Build shared**

Run: `cd packages/shared && pnpm build`
Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/models/index.ts packages/shared/src/schemas/index.ts packages/shared/src/index.ts
git commit -m "feat(shared): Card.bin/variant + schema + export cardType"
```

---

## Task 3: Server schema columns + migration

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Create: generated migration under `packages/server/drizzle/`

- [ ] **Step 1: Add columns to the cards table**

In `packages/server/src/db/schema.ts`, the `cards` table currently has `credit_limit: numeric(...).notNull(),` then `created_at`. Add `bin` and `variant` (nullable) so it reads:

```typescript
export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  last4: varchar('last4', { length: 4 }).notNull(),
  network: varchar('network', { length: 20 }).notNull(),
  bank: varchar('bank', { length: 100 }).notNull(),
  nickname: varchar('nickname', { length: 100 }).notNull(),
  billing_cycle_day: integer('billing_cycle_day').notNull(),
  payment_due_day: integer('payment_due_day').notNull(),
  credit_limit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull(),
  bin: varchar('bin', { length: 6 }),
  variant: varchar('variant', { length: 100 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `cd packages/server && pnpm db:generate`
Expected: a new file `packages/server/drizzle/0001_*.sql` containing `ALTER TABLE "cards" ADD COLUMN "bin" varchar(6);` and `ALTER TABLE "cards" ADD COLUMN "variant" varchar(100);`, plus an updated `drizzle/meta/_journal.json` and a new snapshot.

- [ ] **Step 3: Verify the generated SQL**

Run: `cat packages/server/drizzle/0001_*.sql`
Expected: two `ADD COLUMN` statements for `bin` and `variant`. (No `NOT NULL`, no data loss.)

- [ ] **Step 4: Build server**

Run: `cd packages/server && pnpm build`
Expected: zero TypeScript errors. (`cards.ts` routes already spread `parsed.data`, so `bin`/`variant` persist automatically — no route change needed.)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/drizzle
git commit -m "feat(server): add cards.bin/variant columns + migration"
```

---

## Task 4: Client BIN lookup

**Files:**
- Create: `packages/app/src/lib/binLookup.ts`

- [ ] **Step 1: Create binLookup.ts**

```typescript
// packages/app/src/lib/binLookup.ts
import { detectNetwork } from '@cardledger/shared';
import type { Network } from '@cardledger/shared';

export interface BinInfo {
  network: Network | null;
  bank: string | null;
  variant: string | null;
}

function mapScheme(scheme?: string): Network | null {
  switch ((scheme ?? '').toLowerCase()) {
    case 'visa':
      return 'Visa';
    case 'mastercard':
      return 'Mastercard';
    case 'amex':
    case 'american express':
      return 'Amex';
    case 'rupay':
      return 'RuPay';
    default:
      return null;
  }
}

/**
 * Look up a BIN online (binlist.net), falling back to local network detection.
 * Never throws — always resolves to a BinInfo. Only the 6-digit BIN is sent.
 */
export async function lookupBin(bin: string): Promise<BinInfo> {
  const clean = bin.replace(/\D/g, '').slice(0, 6);
  const local: BinInfo = { network: detectNetwork(clean), bank: null, variant: null };
  if (clean.length < 6) return local;

  try {
    const res = await fetch(`https://lookup.binlist.net/${clean}`, {
      headers: { 'Accept-Version': '3' },
    });
    if (!res.ok) return local;
    const data = await res.json();
    const network = mapScheme(data?.scheme) ?? local.network;
    const bank: string | null = data?.bank?.name ?? null;
    const rawType = data?.type ? String(data.type) : '';
    const variant = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : null;
    return { network, bank, variant };
  } catch {
    return local;
  }
}
```

- [ ] **Step 2: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/lib/binLookup.ts
git commit -m "feat(app): client-side BIN lookup with local fallback"
```

---

## Task 5: Network logo assets + helper

**Files:**
- Create: `packages/app/src/vite-env.d.ts`
- Create: `packages/app/src/assets/networks/visa.svg`
- Create: `packages/app/src/assets/networks/mastercard.svg`
- Create: `packages/app/src/assets/networks/rupay.svg`
- Create: `packages/app/src/assets/networks/amex.svg`
- Create: `packages/app/src/assets/networks/card-generic.svg`
- Create: `packages/app/src/lib/networkLogo.ts`

- [ ] **Step 1: Add Vite client types (enables `import x from '*.svg'`)**

```typescript
// packages/app/src/vite-env.d.ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Create the SVG assets**

`packages/app/src/assets/networks/visa.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 16"><text x="0" y="13" font-family="Arial, Helvetica, sans-serif" font-size="14" font-style="italic" font-weight="bold" fill="#ffffff">VISA</text></svg>
```

`packages/app/src/assets/networks/mastercard.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 30"><circle cx="19" cy="15" r="12" fill="#EB001B"/><circle cx="31" cy="15" r="12" fill="#F79E1B" fill-opacity="0.85"/></svg>
```

`packages/app/src/assets/networks/rupay.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 16"><text x="0" y="13" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">RuPay</text></svg>
```

`packages/app/src/assets/networks/amex.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 16"><text x="0" y="13" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">AMEX</text></svg>
```

`packages/app/src/assets/networks/card-generic.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 30"><rect x="1" y="1" width="46" height="28" rx="4" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/><rect x="6" y="9" width="9" height="6" rx="1" fill="#ffffff" fill-opacity="0.7"/></svg>
```

- [ ] **Step 3: Create networkLogo.ts**

```typescript
// packages/app/src/lib/networkLogo.ts
import visa from '../assets/networks/visa.svg';
import mastercard from '../assets/networks/mastercard.svg';
import rupay from '../assets/networks/rupay.svg';
import amex from '../assets/networks/amex.svg';
import generic from '../assets/networks/card-generic.svg';

const MAP: Record<string, string> = {
  Visa: visa,
  Mastercard: mastercard,
  RuPay: rupay,
  Amex: amex,
};

/** Returns the bundled logo URL for a network, or the generic card image. */
export function networkLogo(network: string | null | undefined): string {
  if (!network) return generic;
  return MAP[network] ?? generic;
}
```

- [ ] **Step 4: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors; the five `.svg` assets are bundled.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/vite-env.d.ts packages/app/src/assets/networks packages/app/src/lib/networkLogo.ts
git commit -m "feat(app): bundled network logo SVGs + networkLogo helper"
```

---

## Task 6: Add-card detection UX

**Files:**
- Modify: `packages/app/src/screens/AddCardScreen.tsx`

Replace the ENTIRE file with:

```typescript
// packages/app/src/screens/AddCardScreen.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { useCard, useCreateCard, useUpdateCard } from '../data/hooks/useCards.js';
import { sanitizeCardNumber, extractBin, extractLast4 } from '@cardledger/shared';
import { lookupBin } from '../lib/binLookup.js';
import type { Network } from '@cardledger/shared';

const NETWORKS: Network[] = ['Visa', 'Mastercard', 'RuPay', 'Amex'];

const INPUT_CLS =
  'w-full bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors text-white';

export default function AddCardScreen() {
  const nav = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const { data: existing } = useCard(id ?? '');
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();

  const [cardNumber, setCardNumber] = useState('');
  const [detectMsg, setDetectMsg] = useState('');
  const [form, setForm] = useState({
    last4: '',
    bin: '',
    network: 'Visa' as Network,
    bank: '',
    variant: '',
    nickname: '',
    billing_cycle_day: 1,
    payment_due_day: 20,
    credit_limit: 100000,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit && existing && !Array.isArray(existing)) {
      setForm({
        last4: existing.last4,
        bin: existing.bin ?? '',
        network: existing.network,
        bank: existing.bank,
        variant: existing.variant ?? '',
        nickname: existing.nickname,
        billing_cycle_day: existing.billing_cycle_day,
        payment_due_day: existing.payment_due_day,
        credit_limit: Number(existing.credit_limit),
      });
    }
  }, [existing, isEdit]);

  function setField(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Detect network/bank/variant from the typed number. The full number is
  // used only here and is never stored or submitted.
  async function handleDetect() {
    const digits = sanitizeCardNumber(cardNumber);
    if (digits.length < 6) return;
    const bin = extractBin(digits);
    const last4 = extractLast4(digits);
    setDetectMsg('Detecting…');
    const info = await lookupBin(bin);
    setForm((f) => ({
      ...f,
      bin,
      last4,
      network: info.network ?? f.network,
      bank: info.bank ?? f.bank,
      variant: info.variant ?? f.variant,
    }));
    if (info.network || info.bank) {
      setDetectMsg(`Detected: ${info.network ?? '—'} · ${info.bank ?? '—'} · ${info.variant ?? '—'}`);
    } else {
      setDetectMsg("Couldn't detect — enter details manually.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const payload = {
      last4: form.last4,
      bin: form.bin || undefined,
      network: form.network,
      bank: form.bank,
      variant: form.variant || undefined,
      nickname: form.nickname,
      billing_cycle_day: form.billing_cycle_day,
      payment_due_day: form.payment_due_day,
      credit_limit: form.credit_limit,
    };
    try {
      if (isEdit && id) {
        await updateCard.mutateAsync({ id, ...payload });
      } else {
        await createCard.mutateAsync(payload);
      }
      nav('/', { replace: true });
    } catch {
      setError('Failed to save card — check all fields');
    }
  }

  const saving = createCard.isPending || updateCard.isPending;

  return (
    <Screen className="pb-10">
      <TopBar title={isEdit ? 'Edit Card' : 'Add Card'} back />
      <form onSubmit={submit} className="px-6 flex flex-col gap-4">
        <div>
          <label className="text-xs text-muted mb-1 block">
            Card number — used to detect type, not stored
          </label>
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            onBlur={handleDetect}
            inputMode="numeric"
            placeholder="Optional — autofills network & bank"
            className={INPUT_CLS}
          />
          {detectMsg && <p className="text-xs text-gold mt-1">{detectMsg}</p>}
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">Last 4 digits</label>
          <input
            value={form.last4}
            onChange={(e) => setField('last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="9876"
            maxLength={4}
            className={INPUT_CLS}
          />
        </div>

        <select
          value={form.network}
          onChange={(e) => setField('network', e.target.value as Network)}
          className={INPUT_CLS}
        >
          {NETWORKS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          value={form.bank}
          onChange={(e) => setField('bank', e.target.value)}
          placeholder="Bank name"
          className={INPUT_CLS}
        />
        <input
          value={form.variant}
          onChange={(e) => setField('variant', e.target.value)}
          placeholder="Variant (e.g. Regalia) — optional"
          className={INPUT_CLS}
        />
        <input
          value={form.nickname}
          onChange={(e) => setField('nickname', e.target.value)}
          placeholder="Nickname (e.g. My HDFC)"
          className={INPUT_CLS}
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Billing cycle day</label>
            <input
              type="number"
              min={1}
              max={28}
              value={form.billing_cycle_day}
              onChange={(e) => setField('billing_cycle_day', Number(e.target.value))}
              className={INPUT_CLS}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Payment due day</label>
            <input
              type="number"
              min={1}
              max={28}
              value={form.payment_due_day}
              onChange={(e) => setField('payment_due_day', Number(e.target.value))}
              className={INPUT_CLS}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Credit limit (₹)</label>
          <input
            type="number"
            value={form.credit_limit}
            onChange={(e) => setField('credit_limit', Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Card'}
        </button>
      </form>
    </Screen>
  );
}
```

- [ ] **Step 2: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/screens/AddCardScreen.tsx
git commit -m "feat(app): add-card number field with BIN detection (number never stored)"
```

---

## Task 7: CardTile network logo

**Files:**
- Modify: `packages/app/src/components/CardTile.tsx`

Replace the ENTIRE file with:

```typescript
// packages/app/src/components/CardTile.tsx
import { motion } from 'framer-motion';
import type { Card, Holder } from '@cardledger/shared';
import { getDaysUntilDue } from '@cardledger/shared';
import { SpendRing } from './SpendRing.js';
import { DueDateChip } from './DueDateChip.js';
import { HolderBadge } from './HolderBadge.js';
import { networkLogo } from '../lib/networkLogo.js';

const NETWORK_COLORS: Record<string, string> = {
  Visa: 'from-[#1a237e] to-[#283593]',
  Mastercard: 'from-[#b71c1c] to-[#c62828]',
  RuPay: 'from-[#1b5e20] to-[#2e7d32]',
  Amex: 'from-[#006064] to-[#00838f]',
};

interface CardTileProps {
  card: Card;
  holder?: Holder;
  cycleSpend: number;
  onClick?: () => void;
}

export function CardTile({ card, holder, cycleSpend, onClick }: CardTileProps) {
  const gradient = NETWORK_COLORS[card.network] ?? 'from-elevated to-surface';
  const today = new Date().toISOString().split('T')[0];
  const daysLeft = getDaysUntilDue(card.payment_due_day, today);

  return (
    <motion.div
      onClick={onClick}
      className={`relative w-full aspect-[1.586/1] rounded-card bg-gradient-to-br ${gradient} p-6 cursor-pointer select-none`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="absolute inset-0 rounded-card bg-black/10" />
      <div className="relative flex flex-col justify-between h-full">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/60 mb-1">{card.bank}</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold truncate">{card.nickname}</p>
              {holder && <HolderBadge holder={holder} />}
            </div>
            {card.variant && <p className="text-xs text-white/60 mt-0.5">{card.variant}</p>}
          </div>
          <img
            src={networkLogo(card.network)}
            alt={card.network}
            className="h-6 w-auto object-contain shrink-0"
          />
        </div>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs text-white/60 mb-1">•••• {card.last4}</p>
            <DueDateChip daysLeft={daysLeft} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <SpendRing spent={cycleSpend} limit={Number(card.credit_limit)} />
            <p className="text-[10px] text-white/60">₹{cycleSpend.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/CardTile.tsx
git commit -m "feat(app): CardTile shows network logo + variant"
```

---

## Task 8: Verify (build, tests, sync, PWA smoke)

**Files:** none (verify only)

- [ ] **Step 1: Full monorepo build**

Run: `cd C:/Users/vj/IdeaProjects/CardLedger && pnpm build`
Expected: shared, server, app all build with zero errors.

- [ ] **Step 2: Shared tests**

Run: `cd packages/shared && pnpm test`
Expected: all pass (prior 42 + new cardType tests).

- [ ] **Step 3: Capacitor sync**

Run: `cd packages/app && npx cap sync android`
Expected: assets copied, no errors.

- [ ] **Step 4: PWA smoke (manual)**

Run: `cd packages/app && pnpm preview`, open the URL, log in. Verify:
- Add Card: typing a Visa test number `4111 1111 1111 1111` and tabbing out shows "Detected: Visa · …" and fills network=Visa, last4=1111. (Bank may be `—` if binlist rate-limits — local network detection still works.)
- Open DevTools Network: confirm the POST to `/api/cards` body contains `bin` + `last4` but **NOT** the full 16-digit number.
- Home + Card Detail: each card tile shows the correct network logo; a card with an unknown/blank network shows the generic card image.
- No console errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: SP5 complete — card type detection + network logos" --allow-empty
```

---

## Self-Review Checklist

| Spec section | Task |
|---|---|
| §1 cardType module + tests | Task 1 |
| §3 Card model + Zod + export | Task 2 |
| §3 server columns + migration | Task 3 |
| §2 binLookup (online + fallback) | Task 4 |
| §5 assets + networkLogo + svg types | Task 5 |
| §4 add-card detection, PAN never stored | Task 6 |
| §6 CardTile logo + variant | Task 7 |
| §8 success criteria / PWA verify | Task 8 |
