# CardLedger — Sub-project 1 Design Spec
_Date: 2026-06-04_

## Overview

CardLedger is a personal credit-card sharing and spend tracker. It tracks cards you own, cards you've lent to friends, and attributes every transaction to the person holding the card on that transaction's date. The system is a hybrid architecture: Fastify + PostgreSQL server as source of truth, React PWA + Capacitor Android app as the client with aggressive caching.

This spec covers **Sub-project 1**: monorepo foundation, data layer, API, CRED-style UI, card/holder/assignment CRUD, and auth. SMS parsing (Sub-project 2) and Android Capacitor SMS integration (Sub-project 3) are out of scope here.

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo |
| Frontend | React + Vite + TypeScript strict |
| Mobile | Capacitor (Android) |
| Styling | Tailwind CSS + Framer Motion |
| Client state | Zustand |
| Server state / cache | TanStack React Query |
| Backend | Fastify + TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Auth | JWT (HS256) + argon2 passwords |
| Android auth | `@capacitor-community/biometric-auth` |
| Shared types | `packages/shared` with Zod schemas |

---

## 2. Folder Structure

```
CardLedger/
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── models/       # Card, Holder, Assignment, Transaction TS types
│   │       └── schemas/      # Zod validation schemas (shared client + server)
│   │
│   ├── server/
│   │   └── src/
│   │       ├── routes/       # cards, holders, assignments, transactions, auth
│   │       ├── db/           # Drizzle schema + migrations
│   │       ├── services/     # business logic: holder resolution, dedupe
│   │       └── plugins/      # auth (JWT), rate-limit, cors
│   │
│   └── app/
│       ├── src/
│       │   ├── domain/       # pure domain logic (no framework deps)
│       │   ├── data/         # API client, cache hooks, sms/ parser (Sub-project 2)
│       │   ├── store/        # Zustand slices
│       │   ├── screens/      # Home, CardDetail, HolderView, AddCard, Settings
│       │   └── components/   # design system primitives
│       ├── android/          # Capacitor Android project
│       └── capacitor.config.ts
│
├── turbo.json
├── package.json              # pnpm workspace root
├── .env.example              # POSTGRES_URL, JWT_SECRET, PORT
└── docker-compose.yml        # PostgreSQL on port 5432, credentials from .env
```

---

## 3. Domain Model

```typescript
// packages/shared/src/models/index.ts

type Network = 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
type Relationship = 'me' | 'friend';
type TransactionSource = 'sms' | 'manual';

interface Card {
  id: string;
  last4: string;               // 4 digits only — never full number
  network: Network;
  bank: string;
  nickname: string;
  billing_cycle_day: number;   // 1–28
  payment_due_day: number;     // 1–28
  credit_limit: number;
  created_at: string;
}

interface Holder {
  id: string;
  name: string;
  phone: string;
  relationship: Relationship;
  created_at: string;
}

interface Assignment {
  id: string;
  card_id: string;
  holder_id: string;
  handed_over_date: string;    // ISO date
  returned_date: string | null; // null = currently held
  created_at: string;
}

interface Transaction {
  id: string;
  card_id: string;
  amount: number;
  merchant: string;
  txn_date: string;            // ISO date
  source: TransactionSource;
  holder_id_at_time: string;   // resolved from Assignment on txn_date
  raw_sms_encrypted: string | null; // AES-GCM encrypted, Android only
  dedupe_hash: string | null;
  created_at: string;
}
```

### Holder Resolution Rule

`holder_id_at_time` is resolved by finding the Assignment where:
```
assignment.card_id === card_id
AND assignment.handed_over_date <= txn_date
AND (assignment.returned_date IS NULL OR assignment.returned_date >= txn_date)
```

This logic lives in `packages/shared/src/domain/resolveHolder.ts` as a pure function, used by both server (during import) and client (during manual entry).

---

## 4. API

All routes require `Authorization: Bearer <jwt>` except `/auth/login`.

```
POST   /auth/login                         → { token }

GET    /cards                              → Card[]
POST   /cards                             → Card
GET    /cards/:id                          → Card
PATCH  /cards/:id                          → Card
DELETE /cards/:id

GET    /holders                            → Holder[]
POST   /holders                           → Holder
GET    /holders/:id                        → Holder
PATCH  /holders/:id                        → Holder

GET    /assignments?card_id=&active=       → Assignment[]
POST   /assignments                       → Assignment
POST   /assignments/:id/return            → Assignment  (sets returned_date = today)

GET    /transactions?card_id=&holder_id=&cycle=  → Transaction[]
POST   /transactions                      → Transaction
POST   /transactions/import              → Transaction[]  (bulk, from SMS parser)
```

---

## 5. Client Architecture

### Caching Strategy (React Query)

| Resource | staleTime | Notes |
|---|---|---|
| Cards | 5 min | Rarely changes |
| Holders | 5 min | Rarely changes |
| Assignments | 5 min | Changes on handover/return |
| Transactions | 30 sec | More frequent updates |

Mutations optimistically update the local cache, then revalidate in background.

### Offline Write Handling

Failed mutations (network down) are stored in a `pendingMutations` Zustand slice, serialized to `localStorage`. On reconnect, they replay in order. Covers the primary offline use case: entering a transaction without internet.

### State Split

```
React Query   → all server data (cards, holders, assignments, transactions)
Zustand       → UI state (active carousel index, SMS review queue, app lock state, pending mutations)
```

---

## 6. CRED-style Design System

### Design Tokens

```
Background:   #0A0A0A (base), #111111 (card surface), #1A1A1A (elevated)
Accent:       #C8A96E (gold), #E8C97E (gold highlight)
Text:         #FFFFFF (primary), #8A8A8A (muted), #4A4A4A (disabled)
Success:      #2ECC71   Danger: #E74C3C   Warning: #F39C12
Border radius: 24px (cards), 16px (inputs), 12px (chips)
Font:         Inter Variable (300–700)
Base spacing: 4px grid
```

### Screens

- **Home** — stacked card carousel (parallax depth, swipe to switch), holder badge, spend ring, due-date countdown chip
- **Card Detail** — transaction timeline grouped by billing cycle, holder-attributed spend split
- **Holder View** — avatar initials, per-card spend bars, total owed badge
- **Add Card / Add Transaction** — bottom-sheet forms
- **Settings** — app lock config, PIN change, logout

### Component Library

```
CardTile          HolderBadge       SpendRing
DueDateChip       TransactionRow    BillingCycleGroup
BottomNav         TopBar            Screen (layout wrapper)
PinPad            BiometricPrompt   BottomSheet
```

### Animations

Framer Motion throughout: `AnimatePresence` for screen transitions, `spring` physics (`stiffness: 300, damping: 30`) for card interactions, entrance animations on list items.

---

## 7. Security

### Web (PWA)

- Password login → JWT (24h expiry), stored in `localStorage`
- On app focus, check JWT expiry; redirect to login if expired
- `raw_sms_encrypted` encrypted with WebCrypto AES-GCM before upload; key derived via PBKDF2 from password, stored in `sessionStorage` (cleared on tab close)

### Android (Capacitor)

- First launch: set 6-digit PIN + optional biometric registration
- App lock on cold start and after 5 min background
- `@capacitor-community/biometric-auth` for fingerprint/face
- PIN always available as fallback
- JWT in Capacitor SecureStorage (Android Keystore)
- AES-GCM encryption key in Keystore via SecureStorage

### Server

- Passwords hashed with `argon2`
- JWT signed HS256, secret in `.env`
- Rate limit: 5 login attempts / 15 min
- All queries via Drizzle parameterized — no raw string interpolation
- `last4` only accepted and stored — full card numbers rejected at validation layer
- No PII in server logs

---

## 8. Out of Scope (Sub-projects 2 & 3)

- SMS parser engine, regex ruleset, confidence scoring, review queue
- Capacitor SMS plugin (`READ_SMS` / `RECEIVE_SMS`)
- Android APK build pipeline
- Biometric auth on Android (wired up in Sub-project 3, stub only in Sub-project 1)

---

## 9. Success Criteria for Sub-project 1

- [ ] Monorepo builds cleanly (`turbo build`)
- [ ] PostgreSQL schema migrated via Drizzle, auto-seeded with one "me" holder on first run
- [ ] All CRUD API endpoints tested with Vitest + Fastify's `inject`
- [ ] PWA installable, works in Chrome mobile
- [ ] All 5 screens render with real data from the API
- [ ] CRED-style tokens applied consistently; card carousel animates
- [ ] App lock (PIN) works on web; biometric stub in place for Android
- [ ] Holder resolution pure function has unit tests
- [ ] ESLint + Prettier + Husky pre-commit passing
