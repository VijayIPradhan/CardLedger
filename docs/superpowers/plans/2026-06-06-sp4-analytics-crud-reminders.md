# CardLedger SP4 — Analytics, CRUD & Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD for every entity, a "who used" selector on manual transactions, a home analytics dashboard (utilization + upcoming dues), friends management, a manual add-transaction sheet, and Android due-date reminders.

**Architecture:** Pure analytics functions live in `packages/shared` (unit-tested). The Fastify server gains the missing CRUD routes plus optional `holder_id_at_time` on transactions. The React app gains the missing React Query mutation hooks, three new components (HolderForm, AddTransactionSheet, Fab), a restructured HomeScreen, and a notifications helper backed by `@capacitor/local-notifications`. All native features are guarded by `Capacitor.isNativePlatform()` so the PWA is unaffected.

**Tech Stack:** Vitest, Drizzle ORM, Fastify, React Query v5, Zustand, Framer Motion, `@capacitor/local-notifications` ^6.

---

## File Map

### Phase A — Data layer
| File | Change |
|---|---|
| `packages/shared/src/schemas/index.ts` | Add `holder_id_at_time` to `CreateTransactionSchema`; add `UpdateTransactionSchema` |
| `packages/shared/src/domain/analytics.ts` | **New** — `getCardUtilization`, `getTotalUtilization`, `getUpcomingDues` |
| `packages/shared/src/domain/analytics.test.ts` | **New** — Vitest suite |
| `packages/shared/src/index.ts` | Export analytics + `UpdateTransactionSchema` |
| `packages/server/src/routes/transactions.ts` | POST who-used; add GET/:id, PATCH, DELETE |
| `packages/server/src/routes/holders.ts` | Add DELETE (409 if referenced) |
| `packages/server/src/routes/assignments.ts` | Add DELETE |
| `packages/server/src/routes/cards.ts` | DELETE blocks (409) if transactions exist |
| `packages/app/src/data/hooks/useCards.ts` | Add `useDeleteCard` |
| `packages/app/src/data/hooks/useHolders.ts` | Add `useUpdateHolder`, `useDeleteHolder` |
| `packages/app/src/data/hooks/useAssignments.ts` | Add `useDeleteAssignment` |
| `packages/app/src/data/hooks/useTransactions.ts` | Add `useUpdateTransaction`, `useDeleteTransaction`; extend `useCreateTransaction` |

### Phase B — UI
| File | Change |
|---|---|
| `packages/app/src/components/HolderForm.tsx` | **New** — reusable add/edit form |
| `packages/app/src/screens/HolderViewScreen.tsx` | Add-friend button + edit/delete per friend |
| `packages/app/src/components/AddTransactionSheet.tsx` | **New** — manual transaction bottom sheet |
| `packages/app/src/components/Fab.tsx` | **New** — floating + button |
| `packages/app/src/store/uiStore.ts` | Add `addTxnCardId` for FAB pre-selection |
| `packages/app/src/screens/HomeScreen.tsx` | Portfolio summary + per-card % + upcoming dues + FAB + sheet |
| `packages/app/src/screens/CardDetailScreen.tsx` | FAB + edit/delete card + edit/delete txn |
| `packages/app/src/screens/AddCardScreen.tsx` | Edit mode via optional `:id` |
| `packages/app/src/App.tsx` | Add `/cards/:id/edit` route |
| `packages/app/src/lib/notifications.ts` | **New** — schedule due reminders |
| `packages/app/src/screens/SettingsScreen.tsx` | Reminders toggle + days-before |
| `packages/app/package.json` | Add `@capacitor/local-notifications` |

---

## Task 1: Transaction schemas — who-used + update

**Files:**
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Edit CreateTransactionSchema and add UpdateTransactionSchema**

Replace the `CreateTransactionSchema` block in `packages/shared/src/schemas/index.ts` with:

```typescript
export const CreateTransactionSchema = z.object({
  card_id: z.string().uuid(),
  amount: z.number().positive(),
  merchant: z.string().min(1).max(200),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: TransactionSourceSchema,
  holder_id_at_time: z.string().uuid().optional(), // "who used" — manual override
  raw_sms_encrypted: z.string().nullable().optional(),
  dedupe_hash: z.string().nullable().optional(),
});

export const UpdateTransactionSchema = z.object({
  amount: z.number().positive().optional(),
  merchant: z.string().min(1).max(200).optional(),
  txn_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  holder_id_at_time: z.string().uuid().optional(),
});
```

- [ ] **Step 2: Build shared to verify**

Run: `cd packages/shared && pnpm build`
Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/index.ts
git commit -m "feat(shared): optional holder_id_at_time + UpdateTransactionSchema"
```

---

## Task 2: Analytics domain + tests

**Files:**
- Create: `packages/shared/src/domain/analytics.ts`
- Create: `packages/shared/src/domain/analytics.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/domain/analytics.test.ts
import { describe, it, expect } from 'vitest';
import {
  getCardUtilization,
  getTotalUtilization,
  getUpcomingDues,
} from './analytics.js';

describe('getCardUtilization', () => {
  it('computes percent to one decimal', () => {
    expect(getCardUtilization(10000, 5000)).toEqual({ spend: 5000, limit: 10000, percent: 50 });
  });
  it('returns 0 percent when limit is 0', () => {
    expect(getCardUtilization(0, 500)).toEqual({ spend: 500, limit: 0, percent: 0 });
  });
  it('allows over 100 percent', () => {
    expect(getCardUtilization(1000, 1500).percent).toBe(150);
  });
});

describe('getTotalUtilization', () => {
  it('aggregates across cards', () => {
    const cards = [
      { id: 'a', credit_limit: 10000 },
      { id: 'b', credit_limit: 20000 },
    ];
    const spend = { a: 5000, b: 5000 };
    expect(getTotalUtilization(cards, spend)).toEqual({
      spend: 10000,
      limit: 30000,
      percent: 33.3,
    });
  });
  it('returns zeros for no cards', () => {
    expect(getTotalUtilization([], {})).toEqual({ spend: 0, limit: 0, percent: 0 });
  });
});

describe('getUpcomingDues', () => {
  it('includes a due day later this month with correct daysUntil', () => {
    // today is the 6th, due on the 9th → 3 days, this month
    const dues = getUpcomingDues([{ id: 'a', payment_due_day: 9 }], '2026-06-06', 7);
    expect(dues).toEqual([{ cardId: 'a', dueDate: '2026-06-09', daysUntil: 3 }]);
  });
  it('rolls a passed due day into next month', () => {
    // today is the 6th, due on the 5th → next month
    const dues = getUpcomingDues([{ id: 'a', payment_due_day: 5 }], '2026-06-06', 40);
    expect(dues[0].dueDate).toBe('2026-07-05');
  });
  it('excludes cards outside the window', () => {
    const dues = getUpcomingDues([{ id: 'a', payment_due_day: 25 }], '2026-06-06', 7);
    expect(dues).toEqual([]);
  });
  it('sorts ascending by daysUntil', () => {
    const cards = [
      { id: 'far', payment_due_day: 12 },
      { id: 'near', payment_due_day: 8 },
    ];
    const dues = getUpcomingDues(cards, '2026-06-06', 10);
    expect(dues.map((d) => d.cardId)).toEqual(['near', 'far']);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd packages/shared && pnpm test`
Expected: FAIL — `analytics.js` not found.

- [ ] **Step 3: Implement analytics.ts**

```typescript
// packages/shared/src/domain/analytics.ts
import { getDaysUntilDue } from './billingCycle.js';

export interface Utilization {
  spend: number;
  limit: number;
  percent: number; // 1-decimal; 0 when limit <= 0
}

export interface UpcomingDue {
  cardId: string;
  dueDate: string; // ISO yyyy-MM-dd
  daysUntil: number;
}

function pct(spend: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((spend / limit) * 1000) / 10;
}

export function getCardUtilization(creditLimit: number, cycleSpend: number): Utilization {
  return { spend: cycleSpend, limit: creditLimit, percent: pct(cycleSpend, creditLimit) };
}

export function getTotalUtilization(
  cards: { id: string; credit_limit: number }[],
  spendByCardId: Record<string, number>,
): Utilization {
  const limit = cards.reduce((s, c) => s + c.credit_limit, 0);
  const spend = cards.reduce((s, c) => s + (spendByCardId[c.id] ?? 0), 0);
  return { spend, limit, percent: pct(spend, limit) };
}

export function getUpcomingDues(
  cards: { id: string; payment_due_day: number }[],
  today: string,
  withinDays: number,
): UpcomingDue[] {
  const [y, m, d] = today.split('-').map(Number);
  return cards
    .map((card) => {
      let dueYear = y;
      let dueMonth = m;
      if (d > card.payment_due_day) {
        dueMonth += 1;
        if (dueMonth === 13) {
          dueMonth = 1;
          dueYear += 1;
        }
      }
      const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(
        card.payment_due_day,
      ).padStart(2, '0')}`;
      return {
        cardId: card.id,
        dueDate,
        daysUntil: getDaysUntilDue(card.payment_due_day, today),
      };
    })
    .filter((x) => x.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd packages/shared && pnpm test`
Expected: all analytics tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain/analytics.ts packages/shared/src/domain/analytics.test.ts
git commit -m "feat(shared): analytics domain — utilization + upcoming dues with tests"
```

---

## Task 3: Export analytics + UpdateTransactionSchema from shared

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add exports**

The current file is:
```typescript
export * from './models/index.js';
export * from './schemas/index.js';
export * from './domain/resolveHolder.js';
export * from './domain/billingCycle.js';
export type { SmsInput, ParseResult, ParserRule } from './sms/types.js';
export { parseSms } from './sms/parser.js';
```

Add one line after the `billingCycle` export:
```typescript
export * from './domain/analytics.js';
```

`UpdateTransactionSchema` is already exported via `export * from './schemas/index.js'` — no extra line needed.

- [ ] **Step 2: Rebuild shared**

Run: `cd packages/shared && pnpm build`
Expected: zero errors; `dist/domain/analytics.js` present.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): export analytics domain from package root"
```

---

## Task 4: Server — transactions full CRUD + who-used

**Files:**
- Modify: `packages/server/src/routes/transactions.ts`

- [ ] **Step 1: Replace the file**

```typescript
// packages/server/src/routes/transactions.ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, assignments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { CreateTransactionSchema, UpdateTransactionSchema, resolveHolder } from '@cardledger/shared';

export async function transactionRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { card_id?: string; holder_id?: string } }>('/', auth, async (req) => {
    const { card_id, holder_id } = req.query;
    const conditions = [];
    if (card_id) conditions.push(eq(transactions.card_id, card_id));
    if (holder_id) conditions.push(eq(transactions.holder_id_at_time, holder_id));
    return db
      .select()
      .from(transactions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(transactions.txn_date);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [txn] = await db.select().from(transactions).where(eq(transactions.id, req.params.id));
    if (!txn) return reply.status(404).send({ error: 'Not found' });
    return txn;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    let holderId = parsed.data.holder_id_at_time ?? null;

    // No explicit "who used" → resolve from assignments (SMS import path)
    if (!holderId) {
      const allAssignments = await db
        .select()
        .from(assignments)
        .where(eq(assignments.card_id, parsed.data.card_id));
      const mapped = allAssignments.map((a) => ({
        id: a.id,
        card_id: a.card_id,
        holder_id: a.holder_id,
        handed_over_date: String(a.handed_over_date),
        returned_date: a.returned_date ? String(a.returned_date) : null,
        created_at: String(a.created_at),
      }));
      holderId = resolveHolder(parsed.data.card_id, parsed.data.txn_date, mapped);
    }

    if (!holderId) {
      return reply.status(422).send({ error: 'No holder assignment found for txn_date' });
    }

    const { amount, holder_id_at_time: _omit, ...rest } = parsed.data;
    const [txn] = await db
      .insert(transactions)
      .values({ ...rest, amount: String(amount), holder_id_at_time: holderId })
      .returning();
    return reply.status(201).send(txn);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const parsed = UpdateTransactionSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { amount, ...rest } = parsed.data;
    const update = amount !== undefined ? { ...rest, amount: String(amount) } : rest;
    const [txn] = await db
      .update(transactions)
      .set(update)
      .where(eq(transactions.id, req.params.id))
      .returning();
    if (!txn) return reply.status(404).send({ error: 'Not found' });
    return txn;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    await db.delete(transactions).where(eq(transactions.id, req.params.id));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: Build server**

Run: `cd packages/server && pnpm build`
Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/transactions.ts
git commit -m "feat(server): transactions GET/:id, PATCH, DELETE + who-used on POST"
```

---

## Task 5: Server — holders/assignments/cards delete rules

**Files:**
- Modify: `packages/server/src/routes/holders.ts`
- Modify: `packages/server/src/routes/assignments.ts`
- Modify: `packages/server/src/routes/cards.ts`

- [ ] **Step 1: holders — add DELETE with 409 guard**

In `packages/server/src/routes/holders.ts`, update the imports line and append a DELETE handler before the closing brace.

Change the imports at the top from:
```typescript
import { holders } from '../db/schema.js';
import { eq } from 'drizzle-orm';
```
to:
```typescript
import { holders, transactions, assignments } from '../db/schema.js';
import { eq, or } from 'drizzle-orm';
```

Add this handler after the existing `patch` handler (before the final `}`):
```typescript
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [txn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.holder_id_at_time, req.params.id))
      .limit(1);
    const [asg] = await db
      .select()
      .from(assignments)
      .where(eq(assignments.holder_id, req.params.id))
      .limit(1);
    if (txn || asg) {
      return reply.status(409).send({ error: 'Holder has transactions or assignments' });
    }
    await db.delete(holders).where(eq(holders.id, req.params.id));
    return reply.status(204).send();
  });
```
> Note: `or` is imported for consistency with other route files but the two-query approach above is used for clarity; the `or` import may be removed if the linter flags it as unused. To avoid an unused import, simply keep the imports as `import { eq } from 'drizzle-orm';` and the two-query handler — do NOT add `or`. Use: `import { eq } from 'drizzle-orm';`

Final import line for holders.ts:
```typescript
import { holders, transactions, assignments } from '../db/schema.js';
import { eq } from 'drizzle-orm';
```

- [ ] **Step 2: assignments — add DELETE**

In `packages/server/src/routes/assignments.ts`, add after the `/:id/return` handler (before the final `}`):
```typescript
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    await db.delete(assignments).where(eq(assignments.id, req.params.id));
    return reply.status(204).send();
  });
```

- [ ] **Step 3: cards — block DELETE when transactions exist**

In `packages/server/src/routes/cards.ts`, change the imports from:
```typescript
import { cards } from '../db/schema.js';
import { eq } from 'drizzle-orm';
```
to:
```typescript
import { cards, transactions, assignments } from '../db/schema.js';
import { eq } from 'drizzle-orm';
```

Replace the existing `delete` handler with:
```typescript
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [txn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.card_id, req.params.id))
      .limit(1);
    if (txn) {
      return reply.status(409).send({ error: 'Card has transactions' });
    }
    await db.delete(assignments).where(eq(assignments.card_id, req.params.id));
    await db.delete(cards).where(eq(cards.id, req.params.id));
    return reply.status(204).send();
  });
```

- [ ] **Step 4: Build server**

Run: `cd packages/server && pnpm build`
Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/holders.ts packages/server/src/routes/assignments.ts packages/server/src/routes/cards.ts
git commit -m "feat(server): holder/assignment DELETE + card delete blocked when txns exist"
```

---

## Task 6: App data hooks — complete CRUD

**Files:**
- Modify: `packages/app/src/data/hooks/useCards.ts`
- Modify: `packages/app/src/data/hooks/useHolders.ts`
- Modify: `packages/app/src/data/hooks/useAssignments.ts`
- Modify: `packages/app/src/data/hooks/useTransactions.ts`

- [ ] **Step 1: useCards — add useDeleteCard**

Append to `packages/app/src/data/hooks/useCards.ts`:
```typescript
export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cards/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
}
```

- [ ] **Step 2: useHolders — add update + delete**

Append to `packages/app/src/data/hooks/useHolders.ts`:
```typescript
export function useUpdateHolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Holder> & { id: string }) =>
      api.patch(`/holders/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holders'] }),
  });
}

export function useDeleteHolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/holders/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holders'] }),
  });
}
```

- [ ] **Step 3: useAssignments — add delete**

Append to `packages/app/src/data/hooks/useAssignments.ts`:
```typescript
export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
}
```

- [ ] **Step 4: useTransactions — extend create, add update + delete**

Replace the entire `packages/app/src/data/hooks/useTransactions.ts` with:
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

// holder_id_at_time is the optional "who used" override (manual entry)
export type CreateTransactionInput = Omit<
  Transaction,
  'id' | 'created_at' | 'holder_id_at_time'
> & { holder_id_at_time?: string };

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTransactionInput) =>
      api.post('/transactions', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Transaction> & { id: string }) =>
      api.patch(`/transactions/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
}
```

- [ ] **Step 5: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TypeScript errors. (SmsImportScreen and ReviewQueueScreen already pass objects matching `CreateTransactionInput`; verify they still compile.)

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/data/hooks/useCards.ts packages/app/src/data/hooks/useHolders.ts packages/app/src/data/hooks/useAssignments.ts packages/app/src/data/hooks/useTransactions.ts
git commit -m "feat(app): complete CRUD hooks — delete card/holder/assignment/txn, update holder/txn"
```

---

## Task 7: Friends management UI

**Files:**
- Create: `packages/app/src/components/HolderForm.tsx`
- Modify: `packages/app/src/screens/HolderViewScreen.tsx`

- [ ] **Step 1: Create HolderForm**

```typescript
// packages/app/src/components/HolderForm.tsx
import { useState } from 'react';
import type { Holder } from '@cardledger/shared';

interface HolderFormProps {
  initial?: Pick<Holder, 'name' | 'phone'>;
  onSubmit: (data: { name: string; phone: string; relationship: 'friend' }) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function HolderForm({ initial, onSubmit, onCancel, submitting }: HolderFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [error, setError] = useState('');

  const inputCls =
    'w-full bg-elevated border border-elevated rounded-input px-4 py-3 text-sm focus:border-gold outline-none';

  function handleSubmit() {
    if (name.trim().length < 1) return setError('Name is required');
    if (phone.trim().length < 10) return setError('Phone must be at least 10 digits');
    onSubmit({ name: name.trim(), phone: phone.trim(), relationship: 'friend' });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Phone</label>
        <input
          className={inputCls}
          value={phone}
          inputMode="tel"
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-gold font-semibold py-3 rounded-input text-sm disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="flex-1 bg-elevated py-3 rounded-input text-sm text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite HolderViewScreen with add/edit/delete**

```typescript
// packages/app/src/screens/HolderViewScreen.tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { BottomSheet } from '../components/BottomSheet.js';
import { HolderForm } from '../components/HolderForm.js';
import {
  useHolders,
  useCreateHolder,
  useUpdateHolder,
  useDeleteHolder,
} from '../data/hooks/useHolders.js';
import { useCards } from '../data/hooks/useCards.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import type { Holder, Card, Transaction } from '@cardledger/shared';

export default function HolderViewScreen() {
  const { data: holders = [] } = useHolders();
  const { data: cards = [] } = useCards();
  const { data: transactions = [] } = useTransactions();
  const createHolder = useCreateHolder();
  const updateHolder = useUpdateHolder();
  const deleteHolder = useDeleteHolder();
  const { openBottomSheet, closeBottomSheet } = useUiStore();
  const [editing, setEditing] = useState<Holder | null>(null);
  const [error, setError] = useState('');

  const cardMap = Object.fromEntries(cards.map((c: Card) => [c.id, c]));
  const friends = holders.filter((h: Holder) => h.relationship === 'friend');

  function getTotal(holder: Holder) {
    return transactions
      .filter((t: Transaction) => t.holder_id_at_time === holder.id)
      .reduce((s: number, t: Transaction) => s + Number(t.amount), 0);
  }

  function getBreakdown(holder: Holder) {
    const byCard: Record<string, number> = {};
    transactions
      .filter((t: Transaction) => t.holder_id_at_time === holder.id)
      .forEach((t: Transaction) => {
        byCard[t.card_id] = (byCard[t.card_id] ?? 0) + Number(t.amount);
      });
    return Object.entries(byCard)
      .map(([cardId, amount]) => ({ card: cardMap[cardId] as Card | undefined, amount }))
      .filter((x): x is { card: Card; amount: number } => !!x.card);
  }

  function openAdd() {
    setEditing(null);
    setError('');
    openBottomSheet('holder-form');
  }

  function openEdit(h: Holder) {
    setEditing(h);
    setError('');
    openBottomSheet('holder-form');
  }

  async function handleSubmit(data: { name: string; phone: string; relationship: 'friend' }) {
    if (editing) {
      await updateHolder.mutateAsync({ id: editing.id, ...data });
    } else {
      await createHolder.mutateAsync(data);
    }
    closeBottomSheet();
  }

  async function handleDelete(h: Holder) {
    setError('');
    try {
      await deleteHolder.mutateAsync(h.id);
    } catch {
      setError(`Can't delete ${h.name} — they have transactions or assignments.`);
    }
  }

  return (
    <Screen className="pb-24">
      <TopBar title="Holders" />
      <div className="px-4 flex flex-col gap-4">
        <button
          onClick={openAdd}
          className="w-full bg-surface border border-elevated rounded-card py-3 text-sm text-gold font-semibold"
        >
          + Add friend
        </button>

        {error && <p className="text-danger text-xs text-center">{error}</p>}

        {friends.length === 0 && (
          <p className="text-muted text-sm text-center py-16">No friends added yet</p>
        )}

        {friends.map((holder: Holder, i: number) => {
          const total = getTotal(holder);
          const breakdown = getBreakdown(holder);
          const initials = holder.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
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
                <div
                  key={card.id}
                  className="flex justify-between items-center py-2 border-t border-elevated/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-elevated px-2 py-0.5 rounded-chip text-muted">
                      {card.network}
                    </span>
                    <span className="text-sm">•••• {card.last4}</span>
                  </div>
                  <span className="text-sm text-danger">−₹{amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => openEdit(holder)}
                  className="flex-1 bg-elevated py-2 rounded-input text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(holder)}
                  className="flex-1 bg-elevated py-2 rounded-input text-xs text-danger"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <BottomSheet id="holder-form" title={editing ? 'Edit friend' : 'Add friend'}>
        <HolderForm
          initial={editing ?? undefined}
          submitting={createHolder.isPending || updateHolder.isPending}
          onSubmit={handleSubmit}
          onCancel={closeBottomSheet}
        />
      </BottomSheet>

      <BottomNav />
    </Screen>
  );
}
```

- [ ] **Step 3: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/HolderForm.tsx packages/app/src/screens/HolderViewScreen.tsx
git commit -m "feat(app): friends management — add/edit/delete with 409 handling"
```

---

## Task 8: Add-transaction sheet + FAB

**Files:**
- Modify: `packages/app/src/store/uiStore.ts`
- Create: `packages/app/src/components/AddTransactionSheet.tsx`
- Create: `packages/app/src/components/Fab.tsx`

- [ ] **Step 1: Extend uiStore with FAB pre-selection**

Replace `packages/app/src/store/uiStore.ts` with:
```typescript
import { create } from 'zustand';

interface UiState {
  activeCardIndex: number;
  setActiveCardIndex: (i: number) => void;
  openSheet: string | null;
  openBottomSheet: (id: string) => void;
  closeBottomSheet: () => void;
  addTxnCardId: string | null; // pre-selected card for the add-txn sheet
  setAddTxnCardId: (id: string | null) => void;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeCardIndex: 0,
  setActiveCardIndex: (i) => set({ activeCardIndex: i }),
  openSheet: null,
  openBottomSheet: (id) => set({ openSheet: id }),
  closeBottomSheet: () => set({ openSheet: null }),
  addTxnCardId: null,
  setAddTxnCardId: (id) => set({ addTxnCardId: id }),
  locked: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
```

- [ ] **Step 2: Create Fab**

```typescript
// packages/app/src/components/Fab.tsx
import { motion } from 'framer-motion';
import { useUiStore } from '../store/uiStore.js';

interface FabProps {
  cardId?: string; // pre-select a card when opening the add-txn sheet
}

export function Fab({ cardId }: FabProps) {
  const { openBottomSheet, setAddTxnCardId } = useUiStore();
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => {
        setAddTxnCardId(cardId ?? null);
        openBottomSheet('add-txn');
      }}
      className="fixed bottom-20 right-5 z-30 w-14 h-14 rounded-full bg-gold text-base text-2xl font-bold shadow-lg flex items-center justify-center"
      aria-label="Add transaction"
    >
      +
    </motion.button>
  );
}
```

- [ ] **Step 3: Create AddTransactionSheet**

```typescript
// packages/app/src/components/AddTransactionSheet.tsx
import { useMemo, useState, useEffect } from 'react';
import { BottomSheet } from './BottomSheet.js';
import { useUiStore } from '../store/uiStore.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useCreateTransaction } from '../data/hooks/useTransactions.js';
import type { Card, Holder, Assignment } from '@cardledger/shared';

const todayISO = () => new Date().toISOString().split('T')[0];

export function AddTransactionSheet() {
  const { openSheet, closeBottomSheet, addTxnCardId } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const createTxn = useCreateTransaction();

  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(todayISO());
  const [holderId, setHolderId] = useState('');
  const [error, setError] = useState('');

  const meHolder = (holders as Holder[]).find((h) => h.relationship === 'me');

  // Default "who used" = active assignment holder for the chosen card, else "me"
  const resolvedHolderId = useMemo(() => {
    const active = (assignments as Assignment[]).find(
      (a) => a.card_id === cardId && !a.returned_date,
    );
    return active?.holder_id ?? meHolder?.id ?? '';
  }, [cardId, assignments, meHolder]);

  // When the sheet opens, seed card + who-used
  useEffect(() => {
    if (openSheet === 'add-txn') {
      const initialCard = addTxnCardId ?? (cards as Card[])[0]?.id ?? '';
      setCardId(initialCard);
      setAmount('');
      setMerchant('');
      setDate(todayISO());
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSheet, addTxnCardId]);

  // Keep who-used in sync with the selected card until the user overrides it
  useEffect(() => {
    setHolderId(resolvedHolderId);
  }, [resolvedHolderId]);

  const inputCls =
    'w-full bg-elevated border border-elevated rounded-input px-4 py-3 text-sm focus:border-gold outline-none';

  async function handleSubmit() {
    setError('');
    const amt = parseFloat(amount);
    if (!cardId) return setError('Pick a card');
    if (!amt || amt <= 0) return setError('Enter a valid amount');
    if (!merchant.trim()) return setError('Enter a merchant');
    if (!holderId) return setError('Pick who used the card');
    try {
      await createTxn.mutateAsync({
        card_id: cardId,
        amount: amt,
        merchant: merchant.trim(),
        txn_date: date,
        source: 'manual',
        holder_id_at_time: holderId,
        raw_sms_encrypted: null,
        dedupe_hash: null,
      });
      closeBottomSheet();
    } catch {
      setError('Could not save transaction');
    }
  }

  return (
    <BottomSheet id="add-txn" title="Add transaction">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Card</label>
          <select className={inputCls} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">— Select card —</option>
            {(cards as Card[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nickname} ···{c.last4}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Amount (₹)</label>
            <input
              type="number"
              inputMode="decimal"
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
          <input className={inputCls} value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Who used</label>
          <select className={inputCls} value={holderId} onChange={(e) => setHolderId(e.target.value)}>
            {(holders as Holder[]).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.relationship === 'me' ? ' (me)' : ''}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-danger text-xs">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSubmit}
            disabled={createTxn.isPending}
            className="flex-1 bg-gold font-semibold py-3 rounded-input text-sm disabled:opacity-50"
          >
            {createTxn.isPending ? 'Saving…' : 'Add transaction'}
          </button>
          <button
            onClick={closeBottomSheet}
            className="flex-1 bg-elevated py-3 rounded-input text-sm text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/store/uiStore.ts packages/app/src/components/Fab.tsx packages/app/src/components/AddTransactionSheet.tsx
git commit -m "feat(app): manual add-transaction sheet with who-used + FAB"
```

---

## Task 9: Home dashboard analytics

**Files:**
- Modify: `packages/app/src/screens/HomeScreen.tsx`

This task reads the current HomeScreen, then adds a portfolio summary, upcoming dues, the FAB, and the add-txn sheet. The card carousel and recent transactions remain.

- [ ] **Step 1: Replace HomeScreen.tsx**

```typescript
// packages/app/src/screens/HomeScreen.tsx
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { CardTile } from '../components/CardTile.js';
import { SpendRing } from '../components/SpendRing.js';
import { Fab } from '../components/Fab.js';
import { AddTransactionSheet } from '../components/AddTransactionSheet.js';
import { useCards } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import { useTransactions } from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import {
  getCycleRange,
  getCardUtilization,
  getTotalUtilization,
  getUpcomingDues,
} from '@cardledger/shared';
import type { Card, Holder, Transaction, Assignment } from '@cardledger/shared';

const todayISO = () => new Date().toISOString().split('T')[0];

export default function HomeScreen() {
  const nav = useNavigate();
  const { activeCardIndex, setActiveCardIndex } = useUiStore();
  const { data: cards = [] } = useCards();
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments();
  const { data: transactions = [] } = useTransactions();

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));
  const cardList = cards as Card[];
  const today = todayISO();

  // current-cycle spend per card
  const spendByCard: Record<string, number> = {};
  for (const card of cardList) {
    const { start, end } = getCycleRange(card.billing_cycle_day, today);
    spendByCard[card.id] = (transactions as Transaction[])
      .filter((t) => t.card_id === card.id && t.txn_date >= start && t.txn_date <= end)
      .reduce((s, t) => s + Number(t.amount), 0);
  }

  const total = getTotalUtilization(
    cardList.map((c) => ({ id: c.id, credit_limit: Number(c.credit_limit) })),
    spendByCard,
  );

  const dues = getUpcomingDues(
    cardList.map((c) => ({ id: c.id, payment_due_day: c.payment_due_day })),
    today,
    7,
  );

  function getCardHolder(cardId: string): Holder | undefined {
    const active = (assignments as Assignment[]).find(
      (a) => a.card_id === cardId && !a.returned_date,
    );
    return active ? holderMap[active.holder_id] : holders.find((h: Holder) => h.relationship === 'me');
  }

  const recent = [...(transactions as Transaction[])]
    .sort((a, b) => (a.txn_date < b.txn_date ? 1 : -1))
    .slice(0, 5);

  return (
    <Screen className="pb-24">
      <TopBar title="CardLedger" />

      {/* Portfolio summary */}
      <div className="px-4 mb-5">
        <div className="bg-surface rounded-card p-5 flex items-center gap-5">
          <div className="relative flex items-center justify-center">
            <SpendRing spent={total.spend} limit={total.limit} size={72} />
            <span className="absolute text-sm font-semibold">{total.percent}%</span>
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted">Total utilization</p>
            <p className="text-lg font-semibold">
              ₹{total.spend.toLocaleString('en-IN')}{' '}
              <span className="text-muted text-sm font-normal">
                / ₹{total.limit.toLocaleString('en-IN')}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Upcoming dues */}
      {dues.length > 0 && (
        <div className="px-4 mb-5">
          <p className="text-xs text-muted mb-2">⚠ Upcoming dues</p>
          <div className="flex flex-col gap-2">
            {dues.map((d) => {
              const card = cardList.find((c) => c.id === d.cardId)!;
              return (
                <button
                  key={d.cardId}
                  onClick={() => nav(`/cards/${d.cardId}`)}
                  className="bg-surface rounded-card px-4 py-3 flex items-center justify-between"
                >
                  <span className="text-sm">{card.nickname}</span>
                  <span className="text-xs text-warning">
                    due {d.dueDate.slice(5)} · in {d.daysUntil}d
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Card carousel */}
      <div className="relative h-56 mb-2">
        <AnimatePresence initial={false}>
          {cardList.map((card, i) => {
            const offset = i - activeCardIndex;
            if (Math.abs(offset) > 2) return null;
            const util = getCardUtilization(Number(card.credit_limit), spendByCard[card.id] ?? 0);
            return (
              <motion.div
                key={card.id}
                className="absolute inset-x-4"
                style={{ zIndex: 10 - Math.abs(offset) }}
                initial={{ opacity: 0, y: 40, scale: 0.9 }}
                animate={{
                  opacity: offset === 0 ? 1 : 0.4,
                  y: offset * 14,
                  scale: 1 - Math.abs(offset) * 0.05,
                }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={() => (offset === 0 ? nav(`/cards/${card.id}`) : setActiveCardIndex(i))}
              >
                <CardTile
                  card={card}
                  holder={getCardHolder(card.id)}
                  cycleSpend={spendByCard[card.id] ?? 0}
                />
                <p className="text-center text-xs text-muted mt-2">
                  {util.percent}% utilized
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      {cardList.length > 1 && (
        <div className="flex justify-center gap-1.5 mb-5">
          {cardList.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveCardIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === activeCardIndex ? 'w-5 bg-gold' : 'w-1.5 bg-elevated'
              }`}
            />
          ))}
        </div>
      )}

      {/* Recent transactions */}
      <div className="px-4">
        <p className="text-xs text-muted mb-2">Recent</p>
        {recent.length === 0 && <p className="text-muted text-sm py-4">No transactions yet</p>}
        {recent.map((t) => (
          <div
            key={t.id}
            className="flex justify-between items-center py-3 border-b border-elevated/40"
          >
            <div>
              <p className="text-sm">{t.merchant}</p>
              <p className="text-xs text-muted">
                {holderMap[t.holder_id_at_time]?.name ?? '—'} · {t.txn_date.slice(5)}
              </p>
            </div>
            <span className="text-sm text-danger">−₹{Number(t.amount).toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>

      <Fab />
      <AddTransactionSheet />
      <BottomNav />
    </Screen>
  );
}
```

- [ ] **Step 2: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/screens/HomeScreen.tsx
git commit -m "feat(app): home dashboard — portfolio utilization, upcoming dues, per-card %, FAB"
```

---

## Task 10: Card edit mode + delete + transaction edit/delete on Card Detail

**Files:**
- Modify: `packages/app/src/screens/AddCardScreen.tsx`
- Modify: `packages/app/src/App.tsx`
- Modify: `packages/app/src/screens/CardDetailScreen.tsx`

- [ ] **Step 1: Read AddCardScreen first**

Run: open `packages/app/src/screens/AddCardScreen.tsx` and note its form fields and how it calls `useCreateCard`. You will add: read `useParams<{ id?: string }>()`, when `id` present load the card via `useCard(id)`, prefill fields, and call `useUpdateCard` instead of `useCreateCard` on submit. Keep all existing field markup. Title becomes "Edit card" when editing.

- [ ] **Step 2: Patch AddCardScreen for edit mode**

At the top of the component add the imports and hooks (merge with existing imports — do not duplicate):
```typescript
import { useParams } from 'react-router-dom';
import { useCard, useCreateCard, useUpdateCard } from '../data/hooks/useCards.js';
```

Inside the component, near the top:
```typescript
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const { data: existing } = useCard(id ?? '');
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
```

Initialize each form field's state from `existing` when editing. For every `useState('')` / `useState(0)` field, change to read from `existing` once loaded using an effect:
```typescript
  useEffect(() => {
    if (existing) {
      setLast4(existing.last4);
      setNetwork(existing.network);
      setBank(existing.bank);
      setNickname(existing.nickname);
      setBillingDay(existing.billing_cycle_day);
      setDueDay(existing.payment_due_day);
      setCreditLimit(Number(existing.credit_limit));
    }
  }, [existing]);
```
(Match the actual state setter names already present in the file. If a setter has a different name, use the existing one.)

On submit, branch:
```typescript
  async function handleSubmit() {
    const payload = {
      last4,
      network,
      bank,
      nickname,
      billing_cycle_day: billingDay,
      payment_due_day: dueDay,
      credit_limit: creditLimit,
    };
    if (isEdit && id) {
      await updateCard.mutateAsync({ id, ...payload });
    } else {
      await createCard.mutateAsync(payload);
    }
    nav('/');
  }
```
Update the screen title/heading to `{isEdit ? 'Edit card' : 'Add card'}`. Add `useEffect` to the React import if missing.

- [ ] **Step 3: Add the edit route in App.tsx**

In `packages/app/src/App.tsx`, add a route next to the existing `/cards/new`:
```typescript
            <Route path="/cards/:id/edit" element={<AddCardScreen />} />
```
Place it inside the same guarded group as `/cards/new` (after that line).

- [ ] **Step 4: Card Detail — FAB, edit/delete card, edit/delete txn**

Replace `packages/app/src/screens/CardDetailScreen.tsx` with:
```typescript
// packages/app/src/screens/CardDetailScreen.tsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { BottomSheet } from '../components/BottomSheet.js';
import { BillingCycleGroup } from '../components/BillingCycleGroup.js';
import { CardTile } from '../components/CardTile.js';
import { Fab } from '../components/Fab.js';
import { AddTransactionSheet } from '../components/AddTransactionSheet.js';
import { useCard, useDeleteCard } from '../data/hooks/useCards.js';
import { useHolders } from '../data/hooks/useHolders.js';
import { useAssignments } from '../data/hooks/useAssignments.js';
import {
  useTransactions,
  useDeleteTransaction,
} from '../data/hooks/useTransactions.js';
import { useUiStore } from '../store/uiStore.js';
import { getCycleRange } from '@cardledger/shared';
import type { Transaction, Holder, Assignment } from '@cardledger/shared';

export default function CardDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: card } = useCard(id!);
  const { data: holders = [] } = useHolders();
  const { data: assignments = [] } = useAssignments(id);
  const { data: transactions = [] } = useTransactions({ card_id: id });
  const deleteCard = useDeleteCard();
  const deleteTxn = useDeleteTransaction();
  const { openBottomSheet, closeBottomSheet } = useUiStore();
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [error, setError] = useState('');

  if (!card) {
    return (
      <Screen>
        <div className="flex-1 flex items-center justify-center text-muted">Loading…</div>
      </Screen>
    );
  }

  const holderMap = Object.fromEntries(holders.map((h: Holder) => [h.id, h]));

  const cycles = ([-2, -1, 0] as const)
    .map((offset) => {
      const refDate = new Date();
      refDate.setMonth(refDate.getMonth() + offset);
      const ref = refDate.toISOString().split('T')[0];
      const { start, end } = getCycleRange(card.billing_cycle_day, ref);
      const txns = (transactions as Transaction[]).filter(
        (t) => t.txn_date >= start && t.txn_date <= end,
      );
      return { label: `${start} – ${end}`, txns };
    })
    .filter((c) => c.txns.length > 0);

  const activeAssignment = (assignments as Assignment[]).find((a) => !a.returned_date);
  const currentHolder = activeAssignment
    ? holderMap[activeAssignment.holder_id]
    : holders.find((h: Holder) => h.relationship === 'me');
  const cycleSpend =
    cycles[cycles.length - 1]?.txns.reduce((s, t) => s + Number(t.amount), 0) ?? 0;

  async function handleDeleteCard() {
    setError('');
    try {
      await deleteCard.mutateAsync(card!.id);
      nav('/');
    } catch {
      setError('Card has transactions — delete them first.');
    }
  }

  async function handleDeleteTxn() {
    if (!selectedTxn) return;
    await deleteTxn.mutateAsync(selectedTxn.id);
    setSelectedTxn(null);
    closeBottomSheet();
  }

  function openTxnActions(t: Transaction) {
    setSelectedTxn(t);
    openBottomSheet('txn-actions');
  }

  return (
    <Screen className="pb-24">
      <TopBar title={card.nickname} back />
      <div className="px-4 mb-4">
        <CardTile card={card} holder={currentHolder} cycleSpend={cycleSpend} />
      </div>

      <div className="px-4 flex gap-2 mb-4">
        <button
          onClick={() => nav(`/cards/${card.id}/edit`)}
          className="flex-1 bg-elevated py-2 rounded-input text-xs"
        >
          Edit card
        </button>
        <button
          onClick={handleDeleteCard}
          className="flex-1 bg-elevated py-2 rounded-input text-xs text-danger"
        >
          Delete card
        </button>
      </div>
      {error && <p className="px-4 text-danger text-xs mb-2">{error}</p>}

      <div className="px-4">
        {cycles.map((c) => (
          <div key={c.label}>
            <p className="text-xs text-muted mt-4 mb-1">{c.label}</p>
            {c.txns.map((t) => (
              <button
                key={t.id}
                onClick={() => openTxnActions(t)}
                className="w-full flex justify-between items-center py-3 border-b border-elevated/40 text-left"
              >
                <div>
                  <p className="text-sm">{t.merchant}</p>
                  <p className="text-xs text-muted">
                    {holderMap[t.holder_id_at_time]?.name ?? '—'} · {t.txn_date.slice(5)}
                  </p>
                </div>
                <span className="text-sm text-danger">
                  −₹{Number(t.amount).toLocaleString('en-IN')}
                </span>
              </button>
            ))}
          </div>
        ))}
        {cycles.length === 0 && (
          <p className="text-muted text-sm text-center py-8">No transactions yet</p>
        )}
      </div>

      <BottomSheet id="txn-actions" title={selectedTxn?.merchant ?? 'Transaction'}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            ₹{selectedTxn ? Number(selectedTxn.amount).toLocaleString('en-IN') : ''} ·{' '}
            {selectedTxn?.txn_date}
          </p>
          <button
            onClick={handleDeleteTxn}
            className="w-full bg-elevated py-3 rounded-input text-sm text-danger mt-2"
          >
            Delete transaction
          </button>
          <button
            onClick={closeBottomSheet}
            className="w-full bg-elevated py-3 rounded-input text-sm text-muted"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>

      <Fab cardId={card.id} />
      <AddTransactionSheet />
      <BottomNav />
    </Screen>
  );
}
```

> Note: `BillingCycleGroup` import is intentionally dropped here because Card Detail now renders rows inline (so transactions are tappable for delete). If the linter flags an unused import remove the `BillingCycleGroup` import line.

- [ ] **Step 5: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/screens/AddCardScreen.tsx packages/app/src/App.tsx packages/app/src/screens/CardDetailScreen.tsx
git commit -m "feat(app): card edit/delete + transaction delete on card detail"
```

---

## Task 11: Install local-notifications + notifications helper

**Files:**
- Modify: `packages/app/package.json`
- Create: `packages/app/src/lib/notifications.ts`

- [ ] **Step 1: Add the dependency**

In `packages/app/package.json` `"dependencies"`, add:
```json
"@capacitor/local-notifications": "^6.0.0",
```

- [ ] **Step 2: Install**

Run: `cd C:/Users/vj/IdeaProjects/CardLedger && pnpm install`
Expected: `@capacitor/local-notifications` resolved.

- [ ] **Step 3: Create notifications.ts**

```typescript
// packages/app/src/lib/notifications.ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getDaysUntilDue } from '@cardledger/shared';

const ENABLED_KEY = 'cl_reminders_enabled';
const DAYS_KEY = 'cl_reminder_days';

export function isReminderEnabled(): boolean {
  const v = localStorage.getItem(ENABLED_KEY);
  return v === null ? true : v === 'true';
}

export function setReminderEnabled(v: boolean): void {
  localStorage.setItem(ENABLED_KEY, String(v));
}

export function getReminderDaysBefore(): number {
  const v = localStorage.getItem(DAYS_KEY);
  return v === null ? 3 : Number(v);
}

export function setReminderDaysBefore(n: number): void {
  localStorage.setItem(DAYS_KEY, String(n));
}

// Stable positive 32-bit int from a card UUID — same card → same notification id
function notifId(cardId: string): number {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) {
    h = (h * 31 + cardId.charCodeAt(i)) % 2147483647;
  }
  return h || 1;
}

interface ReminderCard {
  id: string;
  nickname: string;
  payment_due_day: number;
}

export async function scheduleDueReminders(cards: ReminderCard[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isReminderEnabled()) return;

  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return;

  // Cancel everything we previously scheduled
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }

  const daysBefore = getReminderDaysBefore();
  const today = new Date().toISOString().split('T')[0];

  const notifications = cards
    .map((card) => {
      const daysUntil = getDaysUntilDue(card.payment_due_day, today);
      const fireInDays = daysUntil - daysBefore;
      if (fireInDays < 0) return null; // due sooner than the reminder window
      const at = new Date();
      at.setDate(at.getDate() + fireInDays);
      at.setHours(9, 0, 0, 0);
      return {
        id: notifId(card.id),
        title: 'Payment due soon',
        body: `${card.nickname} payment is due in ${daysBefore} days`,
        schedule: { at },
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}
```

- [ ] **Step 4: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 5: Commit**

```bash
git add packages/app/package.json pnpm-lock.yaml packages/app/src/lib/notifications.ts
git commit -m "feat(app): local-notifications helper for due-date reminders"
```

---

## Task 12: Settings reminders block + scheduling wiring

**Files:**
- Modify: `packages/app/src/screens/SettingsScreen.tsx`
- Modify: `packages/app/src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add reminders controls to Settings**

In `packages/app/src/screens/SettingsScreen.tsx`, add imports (merge with existing):
```typescript
import { useState } from 'react';
import { useCards } from '../data/hooks/useCards.js';
import {
  isReminderEnabled,
  setReminderEnabled,
  getReminderDaysBefore,
  setReminderDaysBefore,
  scheduleDueReminders,
} from '../lib/notifications.js';
import type { Card } from '@cardledger/shared';
```
> `Capacitor` is already imported in SettingsScreen from Task 13 of SP3. If not present, add `import { Capacitor } from '@capacitor/core';`.

Inside the component, add state and handlers:
```typescript
  const { data: cards = [] } = useCards();
  const [remindersOn, setRemindersOn] = useState(isReminderEnabled);
  const [daysBefore, setDaysBefore] = useState(getReminderDaysBefore);

  function reschedule() {
    scheduleDueReminders(
      (cards as Card[]).map((c) => ({
        id: c.id,
        nickname: c.nickname,
        payment_due_day: c.payment_due_day,
      })),
    );
  }

  function toggleReminders() {
    const next = !remindersOn;
    setReminderEnabled(next);
    setRemindersOn(next);
    reschedule();
  }

  function changeDays(n: number) {
    setReminderDaysBefore(n);
    setDaysBefore(n);
    reschedule();
  }
```

Add this block inside the settings card list, only on native (place it after the biometric toggle block, before the closing `</div>` of the settings group):
```typescript
          {Capacitor.isNativePlatform() && (
            <>
              <div className="h-px bg-elevated" />
              <button
                onClick={toggleReminders}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-elevated transition-colors"
              >
                <span className="text-sm">Due-date reminders</span>
                <span
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${
                    remindersOn ? 'bg-gold' : 'bg-elevated'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      remindersOn ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
              {remindersOn && (
                <div className="px-5 py-4 flex items-center justify-between">
                  <span className="text-sm text-muted">Remind days before</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 5, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => changeDays(n)}
                        className={`w-8 h-8 rounded-chip text-xs ${
                          daysBefore === n ? 'bg-gold text-base font-semibold' : 'bg-elevated text-muted'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
```

- [ ] **Step 2: Schedule on card load (HomeScreen effect)**

In `packages/app/src/screens/HomeScreen.tsx`, add the import:
```typescript
import { useEffect } from 'react';
import { scheduleDueReminders } from '../lib/notifications.js';
```
And add this effect after the `cardList` is defined:
```typescript
  useEffect(() => {
    if (cardList.length) {
      scheduleDueReminders(
        cardList.map((c) => ({
          id: c.id,
          nickname: c.nickname,
          payment_due_day: c.payment_due_day,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardList.length]);
```

- [ ] **Step 3: Build app**

Run: `cd packages/app && pnpm build`
Expected: zero TS errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/screens/SettingsScreen.tsx packages/app/src/screens/HomeScreen.tsx
git commit -m "feat(app): reminders settings toggle + auto-schedule on card load"
```

---

## Task 13: Android sync + PWA verification

**Files:** none (build/verify only)

- [ ] **Step 1: Full monorepo build**

Run: `cd C:/Users/vj/IdeaProjects/CardLedger && pnpm build`
Expected: shared, server, app all build with zero errors.

- [ ] **Step 2: Shared tests**

Run: `cd packages/shared && pnpm test`
Expected: all tests pass (previous 33 + new analytics tests).

- [ ] **Step 3: Sync Capacitor (adds local-notifications to Android)**

Run: `cd packages/app && pnpm build && npx cap sync android`
Expected: "Updating Android plugins" lists `@capacitor/local-notifications`.

- [ ] **Step 4: PWA spot-check (manual)**

Run: `cd packages/app && pnpm preview` and open the served URL. Verify in a browser (web = non-native):
- Home shows the portfolio utilization ring + percent
- FAB (+) opens the add-transaction sheet; adding a transaction with a "who used" pick succeeds and appears in Recent
- Holders screen can add/edit/delete a friend
- Settings shows **no** reminders block and **no** biometric toggle (both native-only)
- No console errors

- [ ] **Step 5: Commit (final)**

```bash
git add -A
git commit -m "chore: SP4 complete — analytics, full CRUD, who-used, reminders" --allow-empty
```

---

## Self-Review Checklist

| Spec section | Task |
|---|---|
| §2 schema (holder_id_at_time, UpdateTransactionSchema) | Task 1 |
| §3 analytics domain + tests | Task 2, 3 |
| §4 transactions CRUD + who-used | Task 4 |
| §4 holders/assignments/cards delete rules | Task 5 |
| §5 app data hooks | Task 6 |
| §6 friends management UI | Task 7 |
| §7 add-transaction sheet + FAB | Task 8 |
| §8 home dashboard analytics | Task 9 |
| §10 card edit/delete + txn edit/delete | Task 10 |
| §9 notifications helper | Task 11 |
| §9 settings reminders + scheduling | Task 12 |
| §13 success criteria / PWA unaffected | Task 13 |
