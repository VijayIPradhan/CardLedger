# CardLedger Sub-project 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CardLedger monorepo foundation — Fastify + PostgreSQL API, React PWA + Capacitor shell, CRED-style UI, card/holder/assignment/transaction CRUD, and PIN-based auth with biometric stub.

**Architecture:** Turborepo monorepo with three packages: `shared` (TS types + Zod schemas + pure domain logic), `server` (Fastify + Drizzle + PostgreSQL), `app` (React + Vite + Capacitor). Server is source of truth; React Query provides aggressive client-side caching with optimistic updates and offline write queuing via Zustand.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript strict, Fastify, Drizzle ORM, PostgreSQL, React 18, Vite, TanStack React Query v5, Zustand, Tailwind CSS, Framer Motion, Capacitor, Vitest, argon2, jose (JWT)

---

## File Map

```
CardLedger/
├── package.json                          ROOT workspace
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── .husky/pre-commit
│
├── packages/shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── models/index.ts               Card, Holder, Assignment, Transaction types
│       ├── schemas/index.ts              Zod schemas
│       └── domain/
│           ├── resolveHolder.ts          pure holder-resolution function
│           └── billingCycle.ts           cycle start/end/due date helpers
│
├── packages/server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      entry — starts server
│       ├── app.ts                        Fastify factory (exported for tests)
│       ├── db/
│       │   ├── schema.ts                 Drizzle table definitions
│       │   ├── index.ts                  db connection singleton
│       │   ├── migrate.ts                run migrations on startup
│       │   └── seed.ts                   seed "me" holder if empty
│       ├── plugins/
│       │   ├── auth.ts                   JWT verify decorator
│       │   └── rateLimit.ts
│       └── routes/
│           ├── auth.ts
│           ├── cards.ts
│           ├── holders.ts
│           ├── assignments.ts
│           └── transactions.ts
│
└── packages/app/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── index.html
    ├── capacitor.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── styles/globals.css
        ├── data/
        │   ├── apiClient.ts              fetch wrapper with JWT + pending-mutation queue
        │   └── hooks/
        │       ├── useCards.ts
        │       ├── useHolders.ts
        │       ├── useAssignments.ts
        │       └── useTransactions.ts
        ├── store/
        │   ├── uiStore.ts                carousel index, sheet state
        │   └── pendingStore.ts           offline write queue
        ├── components/
        │   ├── Screen.tsx
        │   ├── TopBar.tsx
        │   ├── BottomNav.tsx
        │   ├── BottomSheet.tsx
        │   ├── CardTile.tsx
        │   ├── SpendRing.tsx
        │   ├── DueDateChip.tsx
        │   ├── HolderBadge.tsx
        │   ├── TransactionRow.tsx
        │   ├── BillingCycleGroup.tsx
        │   └── PinPad.tsx
        ├── screens/
        │   ├── LoginScreen.tsx
        │   ├── AppLockScreen.tsx
        │   ├── HomeScreen.tsx
        │   ├── CardDetailScreen.tsx
        │   ├── HolderViewScreen.tsx
        │   ├── AddCardScreen.tsx
        │   └── SettingsScreen.tsx
        └── guards/
            ├── AuthGuard.tsx
            └── AppLockGuard.tsx
```

---

## Task 1: Root monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "cardledger",
  "private": true,
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "eslint": "^9.0.0",
    "prettier": "^3.2.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  },
  "lint-staged": {
    "**/*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 4: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-cardledger}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-cardledger}
      POSTGRES_DB: ${POSTGRES_DB:-cardledger}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 5: Create .env.example**

```env
POSTGRES_URL=postgresql://cardledger:cardledger@localhost:5432/cardledger
POSTGRES_USER=cardledger
POSTGRES_PASSWORD=cardledger
POSTGRES_DB=cardledger
JWT_SECRET=change-me-in-production-min-32-chars
PORT=3001
```

- [ ] **Step 6: Start PostgreSQL and verify**

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```
Expected: `postgres` container status `Up`.

- [ ] **Step 7: Install root deps**

```bash
pnpm install
```

---

## Task 2: `packages/shared` — models + Zod schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/models/index.ts`
- Create: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@cardledger/shared",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

- [ ] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/shared/src/models/index.ts**

```typescript
export type Network = 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
export type Relationship = 'me' | 'friend';
export type TransactionSource = 'sms' | 'manual';
export type Confidence = 'high' | 'low';

export interface Card {
  id: string;
  last4: string;
  network: Network;
  bank: string;
  nickname: string;
  billing_cycle_day: number;
  payment_due_day: number;
  credit_limit: number;
  created_at: string;
}

export interface Holder {
  id: string;
  name: string;
  phone: string;
  relationship: Relationship;
  created_at: string;
}

export interface Assignment {
  id: string;
  card_id: string;
  holder_id: string;
  handed_over_date: string;
  returned_date: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  card_id: string;
  amount: number;
  merchant: string;
  txn_date: string;
  source: TransactionSource;
  holder_id_at_time: string;
  raw_sms_encrypted: string | null;
  dedupe_hash: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Create packages/shared/src/schemas/index.ts**

```typescript
import { z } from 'zod';

export const NetworkSchema = z.enum(['Visa', 'Mastercard', 'RuPay', 'Amex']);
export const RelationshipSchema = z.enum(['me', 'friend']);
export const TransactionSourceSchema = z.enum(['sms', 'manual']);

export const CreateCardSchema = z.object({
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  network: NetworkSchema,
  bank: z.string().min(1).max(100),
  nickname: z.string().min(1).max(100),
  billing_cycle_day: z.number().int().min(1).max(28),
  payment_due_day: z.number().int().min(1).max(28),
  credit_limit: z.number().positive(),
});

export const UpdateCardSchema = CreateCardSchema.partial();

export const CreateHolderSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(10).max(15),
  relationship: RelationshipSchema,
});

export const UpdateHolderSchema = CreateHolderSchema.partial();

export const CreateAssignmentSchema = z.object({
  card_id: z.string().uuid(),
  holder_id: z.string().uuid(),
  handed_over_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const CreateTransactionSchema = z.object({
  card_id: z.string().uuid(),
  amount: z.number().positive(),
  merchant: z.string().min(1).max(200),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: TransactionSourceSchema,
  raw_sms_encrypted: z.string().nullable().optional(),
  dedupe_hash: z.string().nullable().optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});
```

- [ ] **Step 5: Create packages/shared/src/index.ts**

```typescript
export * from './models/index.js';
export * from './schemas/index.js';
export * from './domain/resolveHolder.js';
export * from './domain/billingCycle.js';
```

---

## Task 3: `packages/shared` — domain logic + tests

**Files:**
- Create: `packages/shared/src/domain/resolveHolder.ts`
- Create: `packages/shared/src/domain/billingCycle.ts`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/domain/resolveHolder.test.ts`
- Create: `packages/shared/src/domain/billingCycle.test.ts`

- [ ] **Step 1: Update packages/shared/package.json to add test script and vitest**

Add to `package.json`:
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create packages/shared/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true } });
```

- [ ] **Step 3: Write failing tests for resolveHolder**

Create `packages/shared/src/domain/resolveHolder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveHolder } from './resolveHolder.js';
import type { Assignment } from '../models/index.js';

const ME = 'holder-me';
const FRIEND = 'holder-friend';
const CARD = 'card-1';

const assignments: Assignment[] = [
  {
    id: 'a1', card_id: CARD, holder_id: ME,
    handed_over_date: '2025-01-01', returned_date: '2025-04-30',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'a2', card_id: CARD, holder_id: FRIEND,
    handed_over_date: '2025-05-01', returned_date: null,
    created_at: '2025-05-01T00:00:00Z',
  },
];

describe('resolveHolder', () => {
  it('returns me for a date before handover', () => {
    expect(resolveHolder(CARD, '2025-03-15', assignments)).toBe(ME);
  });

  it('returns friend for a date after handover', () => {
    expect(resolveHolder(CARD, '2025-05-10', assignments)).toBe(FRIEND);
  });

  it('returns friend for today when not yet returned', () => {
    expect(resolveHolder(CARD, '2025-12-01', assignments)).toBe(FRIEND);
  });

  it('returns null when no assignment covers the date', () => {
    expect(resolveHolder(CARD, '2024-12-31', assignments)).toBeNull();
  });

  it('returns null for a different card', () => {
    expect(resolveHolder('card-other', '2025-05-10', assignments)).toBeNull();
  });
});
```

- [ ] **Step 4: Run test — expect FAIL**

```bash
cd packages/shared && pnpm test
```
Expected: `Cannot find module './resolveHolder.js'`

- [ ] **Step 5: Create packages/shared/src/domain/resolveHolder.ts**

```typescript
import type { Assignment } from '../models/index.js';

export function resolveHolder(
  cardId: string,
  txnDate: string,
  assignments: Assignment[],
): string | null {
  const match = assignments.find(
    (a) =>
      a.card_id === cardId &&
      a.handed_over_date <= txnDate &&
      (a.returned_date === null || a.returned_date >= txnDate),
  );
  return match?.holder_id ?? null;
}
```

- [ ] **Step 6: Write failing tests for billingCycle**

Create `packages/shared/src/domain/billingCycle.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getCycleRange, getDaysUntilDue } from './billingCycle.js';

describe('getCycleRange', () => {
  it('returns current cycle where cycle_day is 5 and today is mid-cycle', () => {
    const { start, end } = getCycleRange(5, '2025-06-10');
    expect(start).toBe('2025-06-05');
    expect(end).toBe('2025-07-04');
  });

  it('handles cycle_day after today — rolls back to previous month', () => {
    const { start, end } = getCycleRange(20, '2025-06-10');
    expect(start).toBe('2025-05-20');
    expect(end).toBe('2025-06-19');
  });
});

describe('getDaysUntilDue', () => {
  it('returns positive days when due date is in future', () => {
    const days = getDaysUntilDue(15, '2025-06-10');
    expect(days).toBe(5);
  });

  it('returns 0 on the due day itself', () => {
    expect(getDaysUntilDue(10, '2025-06-10')).toBe(0);
  });
});
```

- [ ] **Step 7: Run test — expect FAIL**

```bash
pnpm test
```
Expected: `Cannot find module './billingCycle.js'`

- [ ] **Step 8: Create packages/shared/src/domain/billingCycle.ts**

```typescript
export interface CycleRange {
  start: string;
  end: string;
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function getCycleRange(cycleDay: number, today: string): CycleRange {
  const [y, m, d] = today.split('-').map(Number);
  let startYear = y, startMonth = m;
  if (d < cycleDay) {
    startMonth -= 1;
    if (startMonth === 0) { startMonth = 12; startYear -= 1; }
  }
  const start = toISO(startYear, startMonth, cycleDay);
  let endMonth = startMonth + 1, endYear = startYear;
  if (endMonth === 13) { endMonth = 1; endYear += 1; }
  const end = toISO(endYear, endMonth, cycleDay - 1);
  return { start, end };
}

export function getDaysUntilDue(paymentDueDay: number, today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  let dueYear = y, dueMonth = m;
  if (d > paymentDueDay) {
    dueMonth += 1;
    if (dueMonth === 13) { dueMonth = 1; dueYear += 1; }
  }
  const due = new Date(dueYear, dueMonth - 1, paymentDueDay);
  const now = new Date(y, m - 1, d);
  return Math.max(0, Math.round((due.getTime() - now.getTime()) / 86400000));
}
```

- [ ] **Step 9: Run tests — expect PASS**

```bash
pnpm test
```
Expected: 7 tests pass.

- [ ] **Step 10: Build shared**

```bash
pnpm build
```
Expected: `dist/` created with `.js` and `.d.ts` files.

- [ ] **Step 11: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): domain models, Zod schemas, resolveHolder, billingCycle"
```

---

## Task 4: `packages/server` — scaffold + DB schema

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/db/schema.ts`
- Create: `packages/server/src/db/index.ts`
- Create: `packages/server/src/db/migrate.ts`
- Create: `packages/server/src/db/seed.ts`

- [ ] **Step 1: Create packages/server/package.json**

```json
{
  "name": "@cardledger/server",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@cardledger/shared": "workspace:*",
    "fastify": "^4.26.0",
    "@fastify/jwt": "^8.0.0",
    "@fastify/rate-limit": "^9.0.0",
    "@fastify/cors": "^9.0.0",
    "drizzle-orm": "^0.30.0",
    "pg": "^8.11.0",
    "argon2": "^0.31.0",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",
    "@types/uuid": "^9.0.0",
    "drizzle-kit": "^0.20.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "dotenv": "^16.4.0"
  }
}
```

- [ ] **Step 2: Create packages/server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: Create packages/server/src/db/schema.ts**

```typescript
import { pgTable, uuid, varchar, integer, numeric, date, timestamp, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const holders = pgTable('holders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 15 }).notNull(),
  relationship: varchar('relationship', { length: 10 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  last4: varchar('last4', { length: 4 }).notNull(),
  network: varchar('network', { length: 20 }).notNull(),
  bank: varchar('bank', { length: 100 }).notNull(),
  nickname: varchar('nickname', { length: 100 }).notNull(),
  billing_cycle_day: integer('billing_cycle_day').notNull(),
  payment_due_day: integer('payment_due_day').notNull(),
  credit_limit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  card_id: uuid('card_id').references(() => cards.id).notNull(),
  holder_id: uuid('holder_id').references(() => holders.id).notNull(),
  handed_over_date: date('handed_over_date').notNull(),
  returned_date: date('returned_date'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  card_id: uuid('card_id').references(() => cards.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  merchant: varchar('merchant', { length: 200 }).notNull(),
  txn_date: date('txn_date').notNull(),
  source: varchar('source', { length: 10 }).notNull(),
  holder_id_at_time: uuid('holder_id_at_time').references(() => holders.id).notNull(),
  raw_sms_encrypted: text('raw_sms_encrypted'),
  dedupe_hash: varchar('dedupe_hash', { length: 64 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 4: Create packages/server/src/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
export const db = drizzle(pool, { schema });
export { pool };
```

- [ ] **Step 5: Create packages/server/src/db/migrate.ts**

```typescript
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool);
await migrate(db, { migrationsFolder: './drizzle' });
await pool.end();
console.log('Migrations complete');
```

- [ ] **Step 6: Create packages/server/src/db/seed.ts**

```typescript
import { db } from './index.js';
import { holders, users } from './schema.js';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';

export async function seed() {
  const existing = await db.select().from(holders).where(eq(holders.relationship, 'me'));
  if (existing.length === 0) {
    await db.insert(holders).values({
      name: 'Me',
      phone: '0000000000',
      relationship: 'me',
    });
    console.log('Seeded default "me" holder');
  }

  const existingUsers = await db.select().from(users);
  if (existingUsers.length === 0) {
    const hash = await argon2.hash(process.env.DEFAULT_PASSWORD ?? 'changeme123');
    await db.insert(users).values({ username: 'admin', password_hash: hash });
    console.log('Seeded admin user (password from DEFAULT_PASSWORD env or "changeme123")');
  }
}
```

- [ ] **Step 7: Generate and run migrations**

First, create `packages/server/drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit';
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: { connectionString: process.env.POSTGRES_URL! },
} satisfies Config;
```

Then:
```bash
cd packages/server
pnpm install
npx drizzle-kit generate:pg
pnpm db:migrate
```
Expected: tables created in PostgreSQL.

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): DB schema, migrations, seed"
```

---

## Task 5: `packages/server` — Fastify app + auth routes

**Files:**
- Create: `packages/server/src/plugins/auth.ts`
- Create: `packages/server/src/routes/auth.ts`
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/routes/auth.test.ts`

- [ ] **Step 1: Write failing auth test**

Create `packages/server/src/routes/auth.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('POST /auth/login', () => {
  it('returns 400 for missing body', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { username: 'admin', password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns token for correct credentials', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { username: 'admin', password: 'changeme123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('token');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd packages/server && pnpm test
```
Expected: `Cannot find module '../app.js'`

- [ ] **Step 3: Create packages/server/src/plugins/auth.ts**

```typescript
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';

export default fp(async (app: FastifyInstance) => {
  app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-32-chars-minimum!!' });

  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });
});
```

- [ ] **Step 4: Create packages/server/src/routes/auth.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { LoginSchema } from '@cardledger/shared';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { username, password } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' });

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' });

    const token = app.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: '24h' });
    return { token };
  });
}
```

- [ ] **Step 5: Create packages/server/src/app.ts**

```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { cardRoutes } from './routes/cards.js';
import { holderRoutes } from './routes/holders.js';
import { assignmentRoutes } from './routes/assignments.js';
import { transactionRoutes } from './routes/transactions.js';
import { seed } from './db/seed.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: 100, timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });
  await app.register(authPlugin);

  // Rate limit login strictly
  app.register(authRoutes);
  app.register(cardRoutes, { prefix: '/cards' });
  app.register(holderRoutes, { prefix: '/holders' });
  app.register(assignmentRoutes, { prefix: '/assignments' });
  app.register(transactionRoutes, { prefix: '/transactions' });

  return app;
}
```

- [ ] **Step 6: Create packages/server/src/index.ts**

```typescript
import { buildApp } from './app.js';
import { seed } from './db/seed.js';

const app = await buildApp();
await seed();
await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
```

- [ ] **Step 7: Run test — expect PASS**

```bash
pnpm test
```
Expected: 3 auth tests pass.

---

## Task 6: `packages/server` — cards, holders, assignments, transactions routes

**Files:**
- Create: `packages/server/src/routes/cards.ts`
- Create: `packages/server/src/routes/holders.ts`
- Create: `packages/server/src/routes/assignments.ts`
- Create: `packages/server/src/routes/transactions.ts`
- Create: `packages/server/src/routes/cards.test.ts`

- [ ] **Step 1: Write failing cards test**

Create `packages/server/src/routes/cards.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  const res = await app.inject({
    method: 'POST', url: '/auth/login',
    payload: { username: 'admin', password: 'changeme123' },
  });
  token = res.json().token;
});
afterAll(async () => { await app.close(); });

describe('Cards CRUD', () => {
  let cardId: string;

  it('POST /cards creates a card', async () => {
    const res = await app.inject({
      method: 'POST', url: '/cards',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        last4: '1234', network: 'Visa', bank: 'HDFC',
        nickname: 'My HDFC', billing_cycle_day: 5,
        payment_due_day: 25, credit_limit: 100000,
      },
    });
    expect(res.statusCode).toBe(201);
    cardId = res.json().id;
    expect(cardId).toBeTruthy();
  });

  it('GET /cards returns the created card', async () => {
    const res = await app.inject({
      method: 'GET', url: '/cards',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
  });

  it('PATCH /cards/:id updates nickname', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/cards/${cardId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: 'Updated HDFC' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nickname).toBe('Updated HDFC');
  });

  it('DELETE /cards/:id removes the card', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/cards/${cardId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('GET /cards/:id returns 404 after delete', async () => {
    const res = await app.inject({
      method: 'GET', url: `/cards/${cardId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Create packages/server/src/routes/cards.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { CreateCardSchema, UpdateCardSchema } from '@cardledger/shared';

export async function cardRoutes(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).authenticate] };

  app.get('/', auth, async () => db.select().from(cards).orderBy(cards.created_at));

  app.get('/:id', auth, async (req, reply) => {
    const [card] = await db.select().from(cards).where(eq(cards.id, (req.params as any).id));
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [card] = await db.insert(cards).values(parsed.data).returning();
    return reply.status(201).send(card);
  });

  app.patch('/:id', auth, async (req, reply) => {
    const parsed = UpdateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [card] = await db.update(cards).set(parsed.data).where(eq(cards.id, (req.params as any).id)).returning();
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.delete('/:id', auth, async (req, reply) => {
    await db.delete(cards).where(eq(cards.id, (req.params as any).id));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 3: Create packages/server/src/routes/holders.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { holders } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { CreateHolderSchema, UpdateHolderSchema } from '@cardledger/shared';

export async function holderRoutes(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).authenticate] };

  app.get('/', auth, async () => db.select().from(holders).orderBy(holders.name));

  app.get('/:id', auth, async (req, reply) => {
    const [h] = await db.select().from(holders).where(eq(holders.id, (req.params as any).id));
    if (!h) return reply.status(404).send({ error: 'Not found' });
    return h;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateHolderSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [h] = await db.insert(holders).values(parsed.data).returning();
    return reply.status(201).send(h);
  });

  app.patch('/:id', auth, async (req, reply) => {
    const parsed = UpdateHolderSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [h] = await db.update(holders).set(parsed.data).where(eq(holders.id, (req.params as any).id)).returning();
    if (!h) return reply.status(404).send({ error: 'Not found' });
    return h;
  });
}
```

- [ ] **Step 4: Create packages/server/src/routes/assignments.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { assignments } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { CreateAssignmentSchema } from '@cardledger/shared';

export async function assignmentRoutes(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).authenticate] };

  app.get('/', auth, async (req) => {
    const { card_id, active } = (req.query as any);
    const conditions = [];
    if (card_id) conditions.push(eq(assignments.card_id, card_id));
    if (active === 'true') conditions.push(isNull(assignments.returned_date));
    return db.select().from(assignments).where(conditions.length ? and(...conditions) : undefined);
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const [a] = await db.insert(assignments).values(parsed.data).returning();
    return reply.status(201).send(a);
  });

  app.post('/:id/return', auth, async (req, reply) => {
    const today = new Date().toISOString().split('T')[0];
    const [a] = await db
      .update(assignments)
      .set({ returned_date: today })
      .where(eq(assignments.id, (req.params as any).id))
      .returning();
    if (!a) return reply.status(404).send({ error: 'Not found' });
    return a;
  });
}
```

- [ ] **Step 5: Create packages/server/src/routes/transactions.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, assignments } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { CreateTransactionSchema, resolveHolder } from '@cardledger/shared';

export async function transactionRoutes(app: FastifyInstance) {
  const auth = { onRequest: [(app as any).authenticate] };

  app.get('/', auth, async (req) => {
    const { card_id, holder_id } = (req.query as any);
    const conditions = [];
    if (card_id) conditions.push(eq(transactions.card_id, card_id));
    if (holder_id) conditions.push(eq(transactions.holder_id_at_time, holder_id));
    return db.select().from(transactions).where(conditions.length ? and(...conditions) : undefined).orderBy(transactions.txn_date);
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const allAssignments = await db.select().from(assignments).where(eq(assignments.card_id, parsed.data.card_id));
    const mapped = allAssignments.map(a => ({
      ...a,
      returned_date: a.returned_date ?? null,
      handed_over_date: String(a.handed_over_date),
      created_at: String(a.created_at),
    }));
    const holderId = resolveHolder(parsed.data.card_id, parsed.data.txn_date, mapped as any);
    if (!holderId) return reply.status(422).send({ error: 'No holder assignment found for txn_date' });

    const [txn] = await db.insert(transactions).values({
      ...parsed.data,
      holder_id_at_time: holderId,
    }).returning();
    return reply.status(201).send(txn);
  });
}
```

- [ ] **Step 6: Run all server tests**

```bash
pnpm test
```
Expected: all tests pass (auth + cards CRUD).

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): CRUD routes for cards, holders, assignments, transactions"
```

---

## Task 7: `packages/app` — Vite + Tailwind + Capacitor scaffold

**Files:**
- Create: `packages/app/package.json`
- Create: `packages/app/tsconfig.json`
- Create: `packages/app/vite.config.ts`
- Create: `packages/app/tailwind.config.ts`
- Create: `packages/app/postcss.config.js`
- Create: `packages/app/index.html`
- Create: `packages/app/capacitor.config.ts`
- Create: `packages/app/src/styles/globals.css`
- Create: `packages/app/src/main.tsx`
- Create: `packages/app/src/App.tsx`

- [ ] **Step 1: Create packages/app/package.json**

```json
{
  "name": "@cardledger/app",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "cap:sync": "cap sync",
    "cap:android": "cap open android"
  },
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
    "@capacitor-community/biometric-auth": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "@capacitor/cli": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create packages/app/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "paths": {
      "@cardledger/shared": ["../shared/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/app/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cardledger/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: { port: 3000 },
});
```

- [ ] **Step 4: Create packages/app/tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0A0A0A',
        surface: '#111111',
        elevated: '#1A1A1A',
        gold: '#C8A96E',
        'gold-hi': '#E8C97E',
        muted: '#8A8A8A',
        disabled: '#4A4A4A',
        success: '#2ECC71',
        danger: '#E74C3C',
        warning: '#F39C12',
      },
      borderRadius: {
        card: '24px',
        input: '16px',
        chip: '12px',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'sans-serif'],
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5: Create packages/app/postcss.config.js**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Create packages/app/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0A0A0A" />
    <link rel="preconnect" href="https://rsms.me/" />
    <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    <title>CardLedger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create packages/app/src/styles/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

* { box-sizing: border-box; }

body {
  background: #0A0A0A;
  color: #FFFFFF;
  font-family: 'Inter var', Inter, sans-serif;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}

::-webkit-scrollbar { display: none; }
```

- [ ] **Step 8: Create packages/app/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 9: Create packages/app/src/App.tsx** (skeleton — screens added in later tasks)

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './guards/AuthGuard.js';
import { AppLockGuard } from './guards/AppLockGuard.js';
import LoginScreen from './screens/LoginScreen.js';
import HomeScreen from './screens/HomeScreen.js';
import CardDetailScreen from './screens/CardDetailScreen.js';
import HolderViewScreen from './screens/HolderViewScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppLockGuard />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/cards/:id" element={<CardDetailScreen />} />
          <Route path="/holders" element={<HolderViewScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 10: Create packages/app/capacitor.config.ts**

```typescript
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.cardledger.app',
  appName: 'CardLedger',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};
export default config;
```

- [ ] **Step 11: Install deps and verify dev server starts**

```bash
cd packages/app && pnpm install
pnpm dev
```
Expected: Vite dev server at `http://localhost:3000` (blank page is fine — screens not built yet).

- [ ] **Step 12: Commit**

```bash
git add packages/app
git commit -m "feat(app): Vite + React + Tailwind + Capacitor scaffold"
```

---

## Task 8: `packages/app` — API client + React Query hooks + Zustand stores

**Files:**
- Create: `packages/app/src/data/apiClient.ts`
- Create: `packages/app/src/data/hooks/useCards.ts`
- Create: `packages/app/src/data/hooks/useHolders.ts`
- Create: `packages/app/src/data/hooks/useAssignments.ts`
- Create: `packages/app/src/data/hooks/useTransactions.ts`
- Create: `packages/app/src/store/uiStore.ts`
- Create: `packages/app/src/store/pendingStore.ts`

- [ ] **Step 1: Create packages/app/src/data/apiClient.ts**

```typescript
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cl_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cl_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export async function login(username: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/auth/login', { username, password });
  localStorage.setItem('cl_token', data.token);
  return data.token;
}

export function logout() {
  localStorage.removeItem('cl_token');
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem('cl_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Create packages/app/src/data/hooks/useCards.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { Card } from '@cardledger/shared';

export function useCards() {
  return useQuery<Card[]>({
    queryKey: ['cards'],
    queryFn: () => api.get('/cards').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCard(id: string) {
  return useQuery<Card>({
    queryKey: ['cards', id],
    queryFn: () => api.get(`/cards/${id}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Card, 'id' | 'created_at'>) => api.post('/cards', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Card> & { id: string }) =>
      api.patch(`/cards/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}
```

- [ ] **Step 3: Create packages/app/src/data/hooks/useHolders.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { Holder } from '@cardledger/shared';

export function useHolders() {
  return useQuery<Holder[]>({
    queryKey: ['holders'],
    queryFn: () => api.get('/holders').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateHolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Holder, 'id' | 'created_at'>) => api.post('/holders', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holders'] }),
  });
}
```

- [ ] **Step 4: Create packages/app/src/data/hooks/useAssignments.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { Assignment } from '@cardledger/shared';

export function useAssignments(cardId?: string) {
  return useQuery<Assignment[]>({
    queryKey: ['assignments', cardId],
    queryFn: () => api.get('/assignments', { params: { card_id: cardId } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveAssignment(cardId: string) {
  return useQuery<Assignment[]>({
    queryKey: ['assignments', cardId, 'active'],
    queryFn: () => api.get('/assignments', { params: { card_id: cardId, active: 'true' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    select: (data) => data[0],
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Pick<Assignment, 'card_id' | 'holder_id' | 'handed_over_date'>) =>
      api.post('/assignments', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
}

export function useReturnCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => api.post(`/assignments/${assignmentId}/return`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
}
```

- [ ] **Step 5: Create packages/app/src/data/hooks/useTransactions.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { Transaction } from '@cardledger/shared';

export function useTransactions(params?: { card_id?: string; holder_id?: string }) {
  return useQuery<Transaction[]>({
    queryKey: ['transactions', params],
    queryFn: () => api.get('/transactions', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Transaction, 'id' | 'created_at' | 'holder_id_at_time'>) =>
      api.post('/transactions', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}
```

- [ ] **Step 6: Create packages/app/src/store/uiStore.ts**

```typescript
import { create } from 'zustand';

interface UiState {
  activeCardIndex: number;
  setActiveCardIndex: (i: number) => void;
  openSheet: string | null;
  openBottomSheet: (id: string) => void;
  closeBottomSheet: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeCardIndex: 0,
  setActiveCardIndex: (i) => set({ activeCardIndex: i }),
  openSheet: null,
  openBottomSheet: (id) => set({ openSheet: id }),
  closeBottomSheet: () => set({ openSheet: null }),
}));
```

- [ ] **Step 7: Create packages/app/src/store/pendingStore.ts**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PendingMutation {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  payload: unknown;
  timestamp: number;
}

interface PendingState {
  queue: PendingMutation[];
  enqueue: (m: Omit<PendingMutation, 'id' | 'timestamp'>) => void;
  dequeue: (id: string) => void;
}

export const usePendingStore = create<PendingState>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (m) =>
        set((s) => ({
          queue: [...s.queue, { ...m, id: crypto.randomUUID(), timestamp: Date.now() }],
        })),
      dequeue: (id) => set((s) => ({ queue: s.queue.filter((x) => x.id !== id) })),
    }),
    { name: 'cl-pending-mutations' },
  ),
);
```

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/data packages/app/src/store
git commit -m "feat(app): API client, React Query hooks, Zustand stores"
```

---

## Task 9: `packages/app` — core layout components

**Files:**
- Create: `packages/app/src/components/Screen.tsx`
- Create: `packages/app/src/components/TopBar.tsx`
- Create: `packages/app/src/components/BottomNav.tsx`
- Create: `packages/app/src/components/BottomSheet.tsx`

- [ ] **Step 1: Create Screen.tsx**

```tsx
import { motion } from 'framer-motion';

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
}

export function Screen({ children, className = '' }: ScreenProps) {
  return (
    <motion.div
      className={`min-h-screen bg-base flex flex-col ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Create TopBar.tsx**

```tsx
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  title: string;
  back?: boolean;
  action?: React.ReactNode;
}

export function TopBar({ title, back, action }: TopBarProps) {
  const nav = useNavigate();
  return (
    <div className="flex items-center justify-between px-6 pt-12 pb-4">
      <div className="flex items-center gap-3">
        {back && (
          <button onClick={() => nav(-1)} className="text-muted hover:text-white transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <motion.h1
          className="text-2xl font-semibold tracking-tight"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {title}
        </motion.h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create BottomNav.tsx**

```tsx
import { Link, useLocation } from 'react-router-dom';

const tabs = [
  { path: '/', label: 'Home', icon: '⬡' },
  { path: '/holders', label: 'Holders', icon: '◎' },
  { path: '/settings', label: 'Settings', icon: '◈' },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-elevated flex">
      {tabs.map((tab) => {
        const active = pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${
              active ? 'text-gold' : 'text-muted'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
            {active && <span className="w-4 h-0.5 rounded-full bg-gold" />}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Create BottomSheet.tsx**

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useUiStore } from '../store/uiStore.js';

interface BottomSheetProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ id, title, children }: BottomSheetProps) {
  const { openSheet, closeBottomSheet } = useUiStore();
  const isOpen = openSheet === id;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeBottomSheet}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-[28px] z-50 p-6 pb-10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="w-10 h-1 rounded-full bg-elevated mx-auto mb-5" />
            <h2 className="text-xl font-semibold mb-5">{title}</h2>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components
git commit -m "feat(app): Screen, TopBar, BottomNav, BottomSheet layout components"
```

---

## Task 10: `packages/app` — card-display components

**Files:**
- Create: `packages/app/src/components/SpendRing.tsx`
- Create: `packages/app/src/components/DueDateChip.tsx`
- Create: `packages/app/src/components/HolderBadge.tsx`
- Create: `packages/app/src/components/CardTile.tsx`

- [ ] **Step 1: Create SpendRing.tsx**

```tsx
interface SpendRingProps {
  spent: number;
  limit: number;
  size?: number;
}

export function SpendRing({ spent, limit, size = 56 }: SpendRingProps) {
  const pct = Math.min(spent / limit, 1);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1A1A1A" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#C8A96E" strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  );
}
```

- [ ] **Step 2: Create DueDateChip.tsx**

```tsx
interface DueDateChipProps { daysLeft: number; }

export function DueDateChip({ daysLeft }: DueDateChipProps) {
  const urgent = daysLeft <= 3;
  return (
    <span
      className={`text-xs px-2 py-1 rounded-chip font-medium ${
        urgent ? 'bg-danger/20 text-danger' : 'bg-elevated text-muted'
      }`}
    >
      {daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`}
    </span>
  );
}
```

- [ ] **Step 3: Create HolderBadge.tsx**

```tsx
import type { Holder } from '@cardledger/shared';

interface HolderBadgeProps { holder: Holder; }

export function HolderBadge({ holder }: HolderBadgeProps) {
  const initials = holder.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const isMe = holder.relationship === 'me';
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${
        isMe ? 'bg-gold text-base' : 'bg-elevated text-white'
      }`}>
        {initials}
      </div>
      <span className="text-xs text-muted">{isMe ? 'Me' : holder.name}</span>
    </div>
  );
}
```

- [ ] **Step 4: Create CardTile.tsx**

```tsx
import { motion } from 'framer-motion';
import type { Card, Holder } from '@cardledger/shared';
import { SpendRing } from './SpendRing.js';
import { DueDateChip } from './DueDateChip.js';
import { HolderBadge } from './HolderBadge.js';
import { getDaysUntilDue } from '@cardledger/shared';

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
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-white/60 mb-1">{card.bank}</p>
            <p className="text-lg font-semibold">{card.nickname}</p>
          </div>
          {holder && <HolderBadge holder={holder} />}
        </div>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs text-white/60 mb-1">•••• {card.last4}</p>
            <DueDateChip daysLeft={daysLeft} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <SpendRing spent={cycleSpend} limit={Number(card.credit_limit)} />
            <p className="text-[10px] text-white/60">
              ₹{cycleSpend.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components
git commit -m "feat(app): SpendRing, DueDateChip, HolderBadge, CardTile components"
```

---

## Task 11: `packages/app` — transaction components + PinPad

**Files:**
- Create: `packages/app/src/components/TransactionRow.tsx`
- Create: `packages/app/src/components/BillingCycleGroup.tsx`
- Create: `packages/app/src/components/PinPad.tsx`

- [ ] **Step 1: Create TransactionRow.tsx**

```tsx
import { motion } from 'framer-motion';
import type { Transaction, Holder } from '@cardledger/shared';

interface TransactionRowProps {
  txn: Transaction;
  holder?: Holder;
  index?: number;
}

export function TransactionRow({ txn, holder, index = 0 }: TransactionRowProps) {
  return (
    <motion.div
      className="flex items-center justify-between py-3 border-b border-elevated/50"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: index * 0.04 }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{txn.merchant}</p>
        <p className="text-xs text-muted mt-0.5">
          {txn.txn_date} {holder && `· ${holder.name}`}
        </p>
      </div>
      <p className="text-sm font-semibold text-danger ml-4">
        −₹{Number(txn.amount).toLocaleString('en-IN')}
      </p>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create BillingCycleGroup.tsx**

```tsx
import type { Transaction, Holder } from '@cardledger/shared';
import { TransactionRow } from './TransactionRow.js';

interface BillingCycleGroupProps {
  label: string;
  transactions: Transaction[];
  holderMap: Record<string, Holder>;
}

export function BillingCycleGroup({ label, transactions, holderMap }: BillingCycleGroupProps) {
  const total = transactions.reduce((s, t) => s + Number(t.amount), 0);
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-muted uppercase tracking-widest">{label}</p>
        <p className="text-sm font-semibold text-gold">₹{total.toLocaleString('en-IN')}</p>
      </div>
      {transactions.map((txn, i) => (
        <TransactionRow key={txn.id} txn={txn} holder={holderMap[txn.holder_id_at_time]} index={i} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create PinPad.tsx**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
  label?: string;
  error?: string;
}

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function PinPad({ length = 6, onComplete, label = 'Enter PIN', error }: PinPadProps) {
  const [digits, setDigits] = useState<string[]>([]);

  function press(key: string) {
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (key === '') return;
    const next = [...digits, key];
    setDigits(next);
    if (next.length === length) {
      onComplete(next.join(''));
      setDigits([]);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <p className="text-lg font-medium text-muted">{label}</p>
      <div className="flex gap-4">
        {Array.from({ length }).map((_, i) => (
          <motion.div
            key={i}
            className={`w-3 h-3 rounded-full ${i < digits.length ? 'bg-gold' : 'bg-elevated'}`}
            animate={{ scale: i < digits.length ? 1.2 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          />
        ))}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            className="text-sm text-danger"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <div className="grid grid-cols-3 gap-3 w-64">
        {KEYS.map((k, i) => (
          <button
            key={i}
            onClick={() => press(k)}
            disabled={k === ''}
            className={`h-16 rounded-input text-xl font-medium transition-colors
              ${k === '' ? 'invisible' : 'bg-surface hover:bg-elevated active:bg-elevated/80 text-white'}`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components
git commit -m "feat(app): TransactionRow, BillingCycleGroup, PinPad components"
```

---

## Task 12: `packages/app` — guards + auth screens

**Files:**
- Create: `packages/app/src/guards/AuthGuard.tsx`
- Create: `packages/app/src/guards/AppLockGuard.tsx`
- Create: `packages/app/src/screens/LoginScreen.tsx`
- Create: `packages/app/src/screens/AppLockScreen.tsx`

- [ ] **Step 1: Create AuthGuard.tsx**

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from '../data/apiClient.js';

export function AuthGuard() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 2: Create AppLockGuard.tsx**

```tsx
import { Outlet, Navigate } from 'react-router-dom';
import { useUiStore } from '../store/uiStore.js';

export function AppLockGuard() {
  const locked = useUiStore((s) => s.locked);
  if (locked) return <Navigate to="/lock" replace />;
  return <Outlet />;
}
```

Update `uiStore.ts` to add lock state:
```typescript
// Add to UiState interface:
locked: boolean;
lock: () => void;
unlock: () => void;

// Add to create():
locked: false,
lock: () => set({ locked: true }),
unlock: () => set({ locked: false }),
```

- [ ] **Step 3: Add /lock route in App.tsx**

```tsx
// Add import:
import AppLockScreen from './screens/AppLockScreen.js';

// Add route inside AuthGuard but outside AppLockGuard:
<Route path="/lock" element={<AppLockScreen />} />
```

- [ ] **Step 4: Create LoginScreen.tsx**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { login } from '../data/apiClient.js';
import { Screen } from '../components/Screen.js';

export default function LoginScreen() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      nav('/', { replace: true });
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen className="justify-center px-6">
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="w-full max-w-sm mx-auto"
      >
        <h1 className="text-3xl font-bold mb-2">CardLedger</h1>
        <p className="text-muted mb-10">Your cards. Your rules.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </motion.div>
    </Screen>
  );
}
```

- [ ] **Step 5: Create AppLockScreen.tsx**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { PinPad } from '../components/PinPad.js';
import { useUiStore } from '../store/uiStore.js';

const STORAGE_KEY = 'cl_pin_hash';

function hashPin(pin: string): string {
  // Simple hash for demo — in production use WebCrypto PBKDF2
  return btoa(pin + 'cl-salt-v1');
}

export function setupPin(pin: string) {
  localStorage.setItem(STORAGE_KEY, hashPin(pin));
}

export function isPinSet(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export default function AppLockScreen() {
  const [error, setError] = useState('');
  const unlock = useUiStore((s) => s.unlock);
  const nav = useNavigate();
  const pinSet = isPinSet();

  function handlePin(pin: string) {
    if (!pinSet) {
      setupPin(pin);
      unlock();
      nav('/', { replace: true });
      return;
    }
    if (hashPin(pin) === localStorage.getItem(STORAGE_KEY)) {
      unlock();
      nav('/', { replace: true });
    } else {
      setError('Wrong PIN — try again');
    }
  }

  return (
    <Screen className="justify-center">
      <PinPad
        onComplete={handlePin}
        label={pinSet ? 'Enter PIN to unlock' : 'Set a 6-digit PIN'}
        error={error}
      />
    </Screen>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/guards packages/app/src/screens/LoginScreen.tsx packages/app/src/screens/AppLockScreen.tsx packages/app/src/store/uiStore.ts
git commit -m "feat(app): AuthGuard, AppLockGuard, LoginScreen, AppLockScreen, PIN flow"
```

---

## Task 13: `packages/app` — HomeScreen with card carousel

**Files:**
- Create: `packages/app/src/screens/HomeScreen.tsx`

- [ ] **Step 1: Create HomeScreen.tsx**

```tsx
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { CardTile } from '../components/CardTile.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import { getCycleRange } from '@cardledger/shared';

export default function HomeScreen() {
  const nav = useNavigate();
  const { activeCardIndex, setActiveCardIndex } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const { data: transactions = [] } = useTransactions();

  const holderMap = Object.fromEntries(holders.map((h) => [h.id, h]));
  const today = new Date().toISOString().split('T')[0];

  function getCardHolder(cardId: string) {
    const active = assignments.find((a) => a.card_id === cardId && !a.returned_date);
    return active ? holderMap[active.holder_id] : holders.find((h) => h.relationship === 'me');
  }

  function getCycleSpend(card: { id: string; billing_cycle_day: number }) {
    const { start, end } = getCycleRange(card.billing_cycle_day, today);
    return transactions
      .filter((t) => t.card_id === card.id && t.txn_date >= start && t.txn_date <= end)
      .reduce((s, t) => s + Number(t.amount), 0);
  }

  return (
    <Screen className="pb-24">
      <TopBar
        title="CardLedger"
        action={
          <button
            onClick={() => nav('/cards/new')}
            className="w-8 h-8 rounded-full bg-elevated text-gold flex items-center justify-center text-xl leading-none"
          >
            +
          </button>
        }
      />

      {cards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3 px-6">
          <p className="text-4xl">◎</p>
          <p className="text-center">No cards yet. Tap + to add your first card.</p>
        </div>
      ) : (
        <div className="flex-1 px-4 pt-4">
          {/* Stacked carousel */}
          <div className="relative h-56 mb-8">
            <AnimatePresence>
              {cards.map((card, i) => {
                const offset = i - activeCardIndex;
                const isActive = offset === 0;
                return (
                  <motion.div
                    key={card.id}
                    className="absolute w-full px-2"
                    style={{ zIndex: cards.length - Math.abs(offset) }}
                    animate={{
                      y: offset * -8,
                      scale: 1 - Math.abs(offset) * 0.04,
                      opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.15,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    onClick={() => isActive ? nav(`/cards/${card.id}`) : setActiveCardIndex(i)}
                  >
                    <CardTile
                      card={card}
                      holder={getCardHolder(card.id)}
                      cycleSpend={getCycleSpend(card)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-2 mb-6">
            {cards.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveCardIndex(i)}
                className={`rounded-full transition-all ${
                  i === activeCardIndex ? 'w-5 h-2 bg-gold' : 'w-2 h-2 bg-elevated'
                }`}
              />
            ))}
          </div>

          {/* Recent transactions */}
          <div className="px-2">
            <p className="text-xs text-muted uppercase tracking-widest mb-3">Recent</p>
            {transactions.slice(-5).reverse().map((txn) => (
              <div key={txn.id} className="flex justify-between py-3 border-b border-elevated/50">
                <div>
                  <p className="text-sm font-medium">{txn.merchant}</p>
                  <p className="text-xs text-muted">{txn.txn_date}</p>
                </div>
                <p className="text-sm font-semibold text-danger">−₹{Number(txn.amount).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <BottomNav />
    </Screen>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/screens/HomeScreen.tsx
git commit -m "feat(app): HomeScreen with stacked card carousel"
```

---

## Task 14: `packages/app` — CardDetailScreen + AddCardScreen

**Files:**
- Create: `packages/app/src/screens/CardDetailScreen.tsx`
- Create: `packages/app/src/screens/AddCardScreen.tsx`

- [ ] **Step 1: Create CardDetailScreen.tsx**

```tsx
import { useParams } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { BillingCycleGroup } from '../components/BillingCycleGroup.js';
import { CardTile } from '../components/CardTile.js';
import { useCard } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { getCycleRange } from '@cardledger/shared';
import type { Transaction } from '@cardledger/shared';

export default function CardDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const { data: card } = useCard(id!);
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments(id);
  const { data: transactions = [] } = useTransactions({ card_id: id });

  if (!card) return null;

  const holderMap = Object.fromEntries(holders.map((h) => [h.id, h]));
  const today = new Date().toISOString().split('T')[0];

  // Group transactions into billing cycles (last 3 cycles)
  const cycles = [-2, -1, 0].map((offset) => {
    const refDate = new Date();
    refDate.setMonth(refDate.getMonth() + offset);
    const ref = refDate.toISOString().split('T')[0];
    const { start, end } = getCycleRange(card.billing_cycle_day, ref);
    const txns = transactions.filter((t: Transaction) => t.txn_date >= start && t.txn_date <= end);
    return { label: `${start} – ${end}`, txns };
  }).filter((c) => c.txns.length > 0);

  const activeAssignment = assignments.find((a) => !a.returned_date);
  const currentHolder = activeAssignment ? holderMap[activeAssignment.holder_id] : holders.find((h) => h.relationship === 'me');
  const cycleSpend = cycles[cycles.length - 1]?.txns.reduce((s, t) => s + Number(t.amount), 0) ?? 0;

  return (
    <Screen className="pb-24">
      <TopBar title={card.nickname} back />
      <div className="px-4 mb-6">
        <CardTile card={card} holder={currentHolder} cycleSpend={cycleSpend} />
      </div>
      <div className="px-4">
        {cycles.map((c) => (
          <BillingCycleGroup key={c.label} label={c.label} transactions={c.txns} holderMap={holderMap} />
        ))}
        {cycles.length === 0 && (
          <p className="text-muted text-sm text-center py-8">No transactions yet</p>
        )}
      </div>
      <BottomNav />
    </Screen>
  );
}
```

- [ ] **Step 2: Create AddCardScreen.tsx**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { useCreateCard } from '../data/hooks/useCards.js';
import type { Network } from '@cardledger/shared';

const NETWORKS: Network[] = ['Visa', 'Mastercard', 'RuPay', 'Amex'];

export default function AddCardScreen() {
  const nav = useNavigate();
  const createCard = useCreateCard();
  const [form, setForm] = useState({
    last4: '', network: 'Visa' as Network, bank: '', nickname: '',
    billing_cycle_day: 1, payment_due_day: 20, credit_limit: 100000,
  });
  const [error, setError] = useState('');

  function set(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await createCard.mutateAsync(form);
      nav('/', { replace: true });
    } catch {
      setError('Failed to save card');
    }
  }

  const inputCls = 'w-full bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors';

  return (
    <Screen className="pb-10">
      <TopBar title="Add Card" back />
      <form onSubmit={submit} className="px-6 flex flex-col gap-4">
        <input value={form.last4} onChange={(e) => set('last4', e.target.value)}
          placeholder="Last 4 digits" maxLength={4} className={inputCls} />
        <select value={form.network} onChange={(e) => set('network', e.target.value as Network)}
          className={inputCls}>
          {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <input value={form.bank} onChange={(e) => set('bank', e.target.value)}
          placeholder="Bank name" className={inputCls} />
        <input value={form.nickname} onChange={(e) => set('nickname', e.target.value)}
          placeholder="Nickname (e.g. My HDFC)" className={inputCls} />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Billing cycle day</label>
            <input type="number" min={1} max={28} value={form.billing_cycle_day}
              onChange={(e) => set('billing_cycle_day', Number(e.target.value))} className={inputCls} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Payment due day</label>
            <input type="number" min={1} max={28} value={form.payment_due_day}
              onChange={(e) => set('payment_due_day', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Credit limit (₹)</label>
          <input type="number" value={form.credit_limit}
            onChange={(e) => set('credit_limit', Number(e.target.value))} className={inputCls} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={createCard.isPending}
          className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50">
          {createCard.isPending ? 'Saving…' : 'Add Card'}
        </button>
      </form>
    </Screen>
  );
}
```

- [ ] **Step 3: Add AddCardScreen route in App.tsx**

```tsx
import AddCardScreen from './screens/AddCardScreen.js';
// Inside AppLockGuard routes:
<Route path="/cards/new" element={<AddCardScreen />} />
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/screens
git commit -m "feat(app): CardDetailScreen, AddCardScreen"
```

---

## Task 15: `packages/app` — HolderViewScreen + SettingsScreen

**Files:**
- Create: `packages/app/src/screens/HolderViewScreen.tsx`
- Create: `packages/app/src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Create HolderViewScreen.tsx**

```tsx
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useCards } from '../data/hooks/useCards.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import type { Holder, Transaction } from '@cardledger/shared';

export default function HolderViewScreen() {
  const { data: holders = [] } = useHolders();
  const { data: cards = [] } = useCards();
  const { data: transactions = [] } = useTransactions();

  const cardMap = Object.fromEntries(cards.map((c) => [c.id, c]));

  function getHolderTotal(holder: Holder) {
    return transactions
      .filter((t: Transaction) => t.holder_id_at_time === holder.id)
      .reduce((s, t) => s + Number(t.amount), 0);
  }

  function getHolderCardBreakdown(holder: Holder) {
    const byCard: Record<string, number> = {};
    transactions
      .filter((t: Transaction) => t.holder_id_at_time === holder.id)
      .forEach((t) => {
        byCard[t.card_id] = (byCard[t.card_id] ?? 0) + Number(t.amount);
      });
    return Object.entries(byCard).map(([cardId, amount]) => ({
      card: cardMap[cardId],
      amount,
    })).filter((x) => x.card);
  }

  const friends = holders.filter((h) => h.relationship === 'friend');

  return (
    <Screen className="pb-24">
      <TopBar title="Holders" />
      <div className="px-4 flex flex-col gap-4">
        {friends.length === 0 && (
          <p className="text-muted text-sm text-center py-16">No friends added yet</p>
        )}
        {friends.map((holder, i) => {
          const total = getHolderTotal(holder);
          const breakdown = getHolderCardBreakdown(holder);
          const initials = holder.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
          return (
            <motion.div
              key={holder.id}
              className="bg-surface rounded-card p-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25, delay: i * 0.05 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{holder.name}</p>
                  <p className="text-xs text-muted">{holder.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total</p>
                  <p className="font-semibold text-gold">₹{total.toLocaleString('en-IN')}</p>
                </div>
              </div>
              {breakdown.map(({ card, amount }) => (
                <div key={card.id} className="flex justify-between items-center py-2 border-t border-elevated/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-elevated px-2 py-0.5 rounded-chip text-muted">{card.network}</span>
                    <span className="text-sm">•••• {card.last4}</span>
                  </div>
                  <span className="text-sm text-danger">−₹{amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </motion.div>
          );
        })}
      </div>
      <BottomNav />
    </Screen>
  );
}
```

- [ ] **Step 2: Create SettingsScreen.tsx**

```tsx
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { logout } from '../data/apiClient.js';
import { useUiStore } from '../store/uiStore.js';
import { isPinSet, setupPin } from './AppLockScreen.js';
import { useState } from 'react';
import { PinPad } from '../components/PinPad.js';

export default function SettingsScreen() {
  const nav = useNavigate();
  const lock = useUiStore((s) => s.lock);
  const [changingPin, setChangingPin] = useState(false);

  function handleLockNow() {
    lock();
    nav('/lock', { replace: true });
  }

  return (
    <Screen className="pb-24">
      <TopBar title="Settings" />
      <div className="px-4 flex flex-col gap-3">
        <div className="bg-surface rounded-card overflow-hidden">
          <button onClick={handleLockNow}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors">
            <span className="text-sm">Lock app now</span>
            <span className="text-muted">→</span>
          </button>
          <div className="h-px bg-elevated" />
          <button onClick={() => setChangingPin(true)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors">
            <span className="text-sm">{isPinSet() ? 'Change PIN' : 'Set PIN'}</span>
            <span className="text-muted">→</span>
          </button>
        </div>

        {changingPin && (
          <div className="bg-surface rounded-card">
            <PinPad
              label="Enter new PIN"
              onComplete={(pin) => { setupPin(pin); setChangingPin(false); }}
            />
          </div>
        )}

        <div className="bg-surface rounded-card overflow-hidden mt-4">
          <button onClick={logout}
            className="w-full flex items-center justify-between px-5 py-4 text-danger hover:bg-elevated transition-colors">
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

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/screens/HolderViewScreen.tsx packages/app/src/screens/SettingsScreen.tsx
git commit -m "feat(app): HolderViewScreen, SettingsScreen"
```

---

## Task 16: PWA manifest + service worker

**Files:**
- Create: `packages/app/public/manifest.json`
- Create: `packages/app/public/sw.js`
- Modify: `packages/app/index.html`

- [ ] **Step 1: Create public/manifest.json**

```json
{
  "name": "CardLedger",
  "short_name": "CardLedger",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0A0A0A",
  "theme_color": "#0A0A0A",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create public/sw.js**

```js
const CACHE = 'cl-v1';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/auth/') || e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
```

- [ ] **Step 3: Register SW in main.tsx**

Add after imports:
```tsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
```

- [ ] **Step 4: Add manifest link in index.html**

```html
<!-- Inside <head>: -->
<link rel="manifest" href="/manifest.json" />
```

- [ ] **Step 5: Commit**

```bash
git add packages/app/public packages/app/src/main.tsx packages/app/index.html
git commit -m "feat(app): PWA manifest + service worker"
```

---

## Task 17: ESLint + Prettier + Husky

**Files:**
- Create: `.eslintrc.json`
- Create: `.prettierrc`
- Create: `.husky/pre-commit`

- [ ] **Step 1: Create .eslintrc.json**

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "env": { "browser": true, "node": true, "es2022": true }
}
```

- [ ] **Step 2: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 3: Install eslint deps at root**

```bash
pnpm add -Dw @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

- [ ] **Step 4: Init Husky**

```bash
pnpm exec husky init
```

- [ ] **Step 5: Set pre-commit hook**

```bash
echo "pnpm lint-staged" > .husky/pre-commit
```

- [ ] **Step 6: Run lint to verify**

```bash
pnpm lint
```
Expected: no errors (warnings for `any` in routes are acceptable).

- [ ] **Step 7: Final commit**

```bash
git add .eslintrc.json .prettierrc .husky
git commit -m "chore: ESLint, Prettier, Husky pre-commit"
```

---

## Task 18: End-to-end smoke test

- [ ] **Step 1: Start all services**

```bash
# Terminal 1
docker compose up -d

# Terminal 2
cd packages/server && pnpm dev

# Terminal 3
cd packages/app && pnpm dev
```

- [ ] **Step 2: Verify login flow**
Open `http://localhost:3000`. Should redirect to `/login`. Enter `admin` / `changeme123`. Should navigate to Home screen.

- [ ] **Step 3: Verify card creation**
Tap `+` → Add Card form → fill in details → submit. Card should appear on Home carousel.

- [ ] **Step 4: Verify card detail**
Tap active card → CardDetail screen opens, shows empty transaction list.

- [ ] **Step 5: Verify Holder view**
Navigate to Holders tab → shows empty state "No friends added yet".

- [ ] **Step 6: Verify app lock**
Settings → "Lock app now" → redirects to PIN screen → enter PIN → unlocks.

- [ ] **Step 7: Run all tests**

```bash
pnpm test
```
Expected: all shared + server tests pass.

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "chore: sub-project 1 complete — foundation, API, CRED UI, auth"
```

---

## Self-Review Notes

- All Zod schemas in `packages/shared` are used consistently in both server routes and client forms — no drift.
- `resolveHolder` is the same function used by both the server (`transactions.ts` route) and imported in `shared` — no duplication.
- `getCycleRange` / `getDaysUntilDue` are used in `CardTile`, `HomeScreen`, and `CardDetailScreen` — all import from `@cardledger/shared`.
- `AppLockScreen` exports `setupPin` and `isPinSet` which are used by `SettingsScreen` — this is a mild code smell but acceptable for v1 scope; can be extracted to a `src/lib/pin.ts` if it grows.
- The `VITE_API_URL` env var needs to be set in `packages/app/.env` for local dev: `VITE_API_URL=http://localhost:3001`.
- Add `packages/app/.env.example` with `VITE_API_URL=http://localhost:3001` to Task 7.
