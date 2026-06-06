# CardLedger — Sub-project 5: Card Type Detection & Network Logos
_Date: 2026-06-06_

## Overview

Let the user type a full card number when adding a card; detect **network + bank + variant** from the BIN; render the **network logo image** on the card tile. The full card number is used only transiently on-device and is **never stored or sent to the server** — only the BIN (first 6) + last4 + detected fields are persisted.

This is a focused enhancement to the add-card flow, the card data model, and `CardTile`.

## Security principle (non-negotiable)

- The full PAN lives only in `AddCardScreen` component state.
- Only `bin` (6 digits), `last4`, `network`, `bank`, `variant` are sent to the server.
- The only outbound use of card digits is the **BIN6** sent to the BIN lookup API (a BIN is an industry identifier, not sensitive cardholder data).

---

## 1. Shared detection module — `packages/shared/src/domain/cardType.ts`

Pure, dependency-free, unit-tested.

```typescript
import type { Network } from '../models/index.js';

export function sanitizeCardNumber(input: string): string; // digits only
export function extractBin(num: string): string;           // first 6 digits ('' if <6)
export function extractLast4(num: string): string;         // last 4 digits ('' if <4)
export function detectNetwork(bin: string): Network | null; // BIN-range → network
export function luhnValid(num: string): boolean;            // Luhn checksum
```

`detectNetwork` ranges:
- **Amex** — starts `34` or `37`
- **Visa** — starts `4`
- **Mastercard** — `51`–`55`, or `2221`–`2720`
- **RuPay** — `60`, `65`, `81`, `82`, or `508`
- else `null`

### Tests (`cardType.test.ts`)
- `sanitizeCardNumber('4532 1234 5678 9876')` → `'4532123456789876'`
- `extractBin('4532123456789876')` → `'453212'`; `extractBin('12345')` → `''`
- `extractLast4('4532123456789876')` → `'9876'`
- `detectNetwork('453212')` → `'Visa'`; `'511111'` → `'Mastercard'`; `'222100'` → `'Mastercard'`; `'371449'` → `'Amex'`; `'607123'` → `'RuPay'`; `'999999'` → `null`
- `luhnValid('4532123456789876')` → boolean (test one known-valid and one invalid)

Exported from `packages/shared/src/index.ts`.

---

## 2. Online BIN lookup — `packages/app/src/lib/binLookup.ts`

Runs on-device (browser/Android). The server is never involved.

```typescript
import type { Network } from '@cardledger/shared';

export interface BinInfo {
  network: Network | null;
  bank: string | null;
  variant: string | null; // from `type`/`brand` when present, else null
}

export async function lookupBin(bin: string): Promise<BinInfo>;
```

Behaviour:
1. If `bin.length < 6` → return local-only `{ network: detectNetwork(bin), bank: null, variant: null }`.
2. `fetch('https://lookup.binlist.net/' + bin, { headers: { 'Accept-Version': '3' } })`.
3. On success → map `scheme` → `Network` (visa→Visa, mastercard→Mastercard, amex/american express→Amex, rupay→RuPay), `bank.name`→bank, `type`→variant (e.g. "credit").
4. On any failure (offline, 404, 429 rate-limit, parse) → fall back to `{ network: detectNetwork(bin), bank: null, variant: null }`.

Never throws — always resolves to a `BinInfo`.

---

## 3. Data model + schema

### Server schema (`packages/server/src/db/schema.ts`)
Add two nullable text columns to `cards`:
- `bin: text('bin')`
- `variant: text('variant')`

### Migration
Generate a Drizzle migration adding `bin` and `variant` to `cards` (both nullable). Existing rows get `NULL` — fine.

### Models (`packages/shared/src/models/index.ts`)
`Card` gains:
- `bin: string | null`
- `variant: string | null`

### Zod (`packages/shared/src/schemas/index.ts`)
`CreateCardSchema` adds:
- `bin: z.string().regex(/^\d{6}$/).optional()`
- `variant: z.string().max(100).optional()`

`UpdateCardSchema` stays `CreateCardSchema.partial()` (inherits the new optional fields).

### Server route (`packages/server/src/routes/cards.ts`)
POST/PATCH already spread `parsed.data`; `bin` and `variant` flow through automatically once they're in the schema. No special casting (both are plain text). Confirm `credit_limit` String() handling is unchanged.

---

## 4. Add-card flow — `packages/app/src/screens/AddCardScreen.tsx`

- New **"Card number"** text input at the top (`inputMode="numeric"`, spaces allowed visually).
- On **blur** (or debounce) when sanitized length ≥ 6:
  1. `const digits = sanitizeCardNumber(input)`
  2. `setBin(extractBin(digits))`, `setLast4(extractLast4(digits))`
  3. `const info = await lookupBin(extractBin(digits))`
  4. Auto-fill `network` (if `info.network`), `bank` (if `info.bank`), `variant` (if `info.variant`) — but only overwrite empty/auto fields, don't clobber a value the user manually typed.
  5. Show a hint line: `Detected: {network} · {bank ?? '—'} · {variant ?? '—'}` (or "Couldn't detect — enter manually").
- All existing fields (`network` select, `bank`, `nickname`, days, limit) remain visible and editable.
- New editable **Variant** text field (optional).
- The separate manual `last4` input is **replaced** by the derived value (shown read-only as `•••• {last4}` once a number is entered). If the user clears the number, they can still type last4 manually — keep a fallback last4 input when no card number is entered.
- **Submit payload:** `{ last4, bin, network, bank, variant, nickname, billing_cycle_day, payment_due_day, credit_limit }`. The full number is **not** included.
- **Edit mode:** existing cards have no stored full number; the card-number field starts empty and shows the stored `•••• last4`. Re-entering a number re-detects; leaving it blank keeps existing `last4`/`bin`.

---

## 5. Assets — `packages/app/src/assets/networks/`

Bundled SVGs (lightweight, imported as URLs via Vite):
- `visa.svg`, `mastercard.svg`, `rupay.svg`, `amex.svg`
- `card-generic.svg` — the dummy/fallback mark for unknown network

A small map module `packages/app/src/lib/networkLogo.ts`:
```typescript
import type { Network } from '@cardledger/shared';
export function networkLogo(network: Network | string | null): string; // returns asset URL, generic fallback
```

---

## 6. CardTile — `packages/app/src/components/CardTile.tsx`

- Render `<img src={networkLogo(card.network)} />` (height ~24px) in the **top-right** corner.
- Move `HolderBadge` to sit inline beside the nickname (top-left block) so it doesn't collide with the logo.
- Show `card.variant` (when present) as a small line under the nickname.
- Keep the existing network gradient background.
- Unknown/empty network → `card-generic.svg`.

---

## 7. Out of scope

- Per-bank logo images (bank shown as text; would require dozens of assets + fuzzy matching)
- Storing or transmitting the full PAN (explicitly excluded)
- Server-side BIN lookup (kept client-side so the server never touches card digits)
- Offline caching of BIN results

---

## 8. Success criteria

- [ ] `cardType.ts` passes all detection/luhn unit tests
- [ ] Typing a full number in Add Card auto-detects network + bank + variant (online), falls back to local network detection offline
- [ ] Only `bin` + `last4` + detected fields are persisted; full number never sent (verify in network tab)
- [ ] `CardTile` shows the correct bundled network logo; unknown → generic image
- [ ] Existing cards (no `bin`) still render with the right logo from their `network` field
- [ ] Migration adds `bin`/`variant`; server stores them
- [ ] `pnpm build` (all packages) + `pnpm test` (shared) green; PWA unaffected
