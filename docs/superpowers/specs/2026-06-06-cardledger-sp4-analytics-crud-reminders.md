# CardLedger — Sub-project 4: Analytics, CRUD & Reminders
_Date: 2026-06-06_

## Overview

Sub-project 4 rounds out CardLedger into a fully manageable app:

1. **Full CRUD** for every entity, from both server and app
2. **"Who used" selector** on manual transactions
3. **Home dashboard analytics** — per-card + total utilization, upcoming dues
4. **Friends management UI** — add / edit / delete holders
5. **Manual add-transaction** — floating button → bottom sheet
6. **Android due-date reminders** — scheduled local notifications

Built on the existing hybrid architecture (Fastify + PostgreSQL server, React PWA + Capacitor). The plan runs in two phases: **Phase A** (data layer — shared domain, server, hooks) then **Phase B** (UI — friends, add-txn, dashboard, notifications).

---

## 1. Tech Stack Additions

| Layer | Choice |
|---|---|
| Local notifications | `@capacitor/local-notifications` ^6 |
| Analytics | Pure TypeScript domain functions in `packages/shared` |
| Everything else | Existing stack (React Query, Zustand, Framer Motion, Drizzle) |

---

## 2. Data Model & Schema Changes

No new tables. Existing columns suffice: `cards.billing_cycle_day`, `cards.payment_due_day`, `cards.credit_limit`, `transactions.holder_id_at_time`.

### `packages/shared/src/schemas/index.ts`

`CreateTransactionSchema` gains an **optional** `holder_id_at_time`:

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
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  holder_id_at_time: z.string().uuid().optional(),
});
```

**Server resolution rule (transactions POST):** if `holder_id_at_time` is provided, trust it. Otherwise fall back to `resolveHolder(card_id, txn_date, assignments)`. Only return 422 when *both* are absent (i.e. SMS import with no covering assignment).

---

## 3. Shared Domain Logic — `packages/shared/src/domain/analytics.ts`

Pure, dependency-free, fully unit-tested.

```typescript
export interface Utilization {
  spend: number;
  limit: number;
  percent: number; // rounded to 1 decimal; 0 when limit is 0
}

export interface UpcomingDue {
  cardId: string;
  dueDate: string;   // ISO yyyy-MM-dd of the next payment_due_day
  daysUntil: number;
}

/** Single card utilization. percent = spend/limit*100, 1-decimal; 0 if limit<=0. */
export function getCardUtilization(creditLimit: number, cycleSpend: number): Utilization;

/** Aggregate across cards. spendByCardId maps card.id → current-cycle spend. */
export function getTotalUtilization(
  cards: { id: string; credit_limit: number }[],
  spendByCardId: Record<string, number>,
): Utilization;

/** Cards whose next payment due date falls within `withinDays`, soonest first. */
export function getUpcomingDues(
  cards: { id: string; payment_due_day: number }[],
  today: string,        // ISO yyyy-MM-dd
  withinDays: number,
): UpcomingDue[];
```

`getUpcomingDues` builds the next due date from `payment_due_day` (this month if the day hasn't passed, else next month) and reuses the existing `getDaysUntilDue` from `billingCycle.ts`.

### Tests (`analytics.test.ts`)
- `getCardUtilization`: 5000/10000 → 50; 0 limit → 0 percent; spend>limit → >100
- `getTotalUtilization`: two cards sum correctly; empty → 0
- `getUpcomingDues`: due day later this month → included with correct daysUntil; due day already passed → next month; outside window → excluded; sorted ascending

---

## 4. Server — Full CRUD + Who-Used

### `routes/transactions.ts`
- **POST** — accept optional `holder_id_at_time`; use it if present, else `resolveHolder`. 422 only when both absent.
- **GET `/:id`** — single transaction or 404
- **PATCH `/:id`** — `UpdateTransactionSchema`; cast `amount` → `String` for numeric column; 404 if missing
- **DELETE `/:id`** — 204

### `routes/holders.ts`
- **DELETE `/:id`** — first check references: if any `transactions.holder_id_at_time = id` OR any `assignments.holder_id = id`, return **409** `{ error: 'Holder has transactions or assignments' }`; else delete, 204

### `routes/assignments.ts`
- **DELETE `/:id`** — 204 (transactions snapshot `holder_id_at_time`, so deleting an assignment is safe)

### `routes/cards.ts`
- **DELETE `/:id`** — change to: if any `transactions.card_id = id` exists, return **409** `{ error: 'Card has transactions' }`; else delete (and its assignments), 204

---

## 5. App Data Hooks — Complete the Set

| File | Add |
|---|---|
| `useCards.ts` | `useDeleteCard` |
| `useHolders.ts` | `useUpdateHolder`, `useDeleteHolder` |
| `useAssignments.ts` | `useDeleteAssignment` |
| `useTransactions.ts` | `useUpdateTransaction`, `useDeleteTransaction`; extend `useCreateTransaction` payload to include optional `holder_id_at_time` |

All mutations invalidate their query keys (plus `['transactions']` where relevant). Delete hooks surface server 409 messages to the caller for display.

---

## 6. Friends Management UI

### `components/HolderForm.tsx` (new, reusable)
Controlled form: `name`, `phone`. Props: `initial?: Holder`, `onSubmit(data)`, `onCancel`. Used for both add and edit. Relationship is fixed to `'friend'` (the "me" holder is system-managed).

### `screens/HolderViewScreen.tsx` (modify)
- Header **"+ Add friend"** button → opens `HolderForm` in a `BottomSheet`
- Each friend card gains **edit** (pencil → prefilled sheet) and **delete** (trash → confirm dialog)
- Delete calls `useDeleteHolder`; on 409, show inline toast "Can't delete — this friend has transactions"

---

## 7. Add-Transaction Bottom Sheet

### `components/AddTransactionSheet.tsx` (new)
Opened via `uiStore.openBottomSheet('add-txn')`. Fields:
- **Card** — dropdown of all cards (required)
- **Amount** — numeric (required, positive)
- **Merchant** — text (required)
- **Date** — date picker, default today
- **Who used** — dropdown of holders; default = the selected card's active-assignment holder, else the "me" holder; fully editable
- Hidden: `source: 'manual'`

On submit → `useCreateTransaction` with `holder_id_at_time` set to the chosen holder. Closes sheet, invalidates transactions.

### FAB — `components/Fab.tsx` (new)
Floating `+` button bottom-right (above BottomNav). Rendered on **Home** and **Card Detail**; on Card Detail it pre-selects that card. Triggers `openBottomSheet('add-txn')`.

---

## 8. Home Dashboard Analytics

`screens/HomeScreen.tsx` restructured (carousel stays). Computation: for each card, current-cycle spend = sum of its transactions within `getCycleRange(billing_cycle_day, today)`.

- **Portfolio summary card** (top): total utilization via `getTotalUtilization`, rendered with a `SpendRing`; shows `₹totalSpend / ₹totalLimit` and the percent. Ring color: gold < 30%, warning 30–70%, danger > 70%.
- **Per-card utilization**: each `CardTile` shows its `getCardUtilization` percent as a thin bar/label.
- **⚠ Upcoming Dues** section: `getUpcomingDues(cards, today, 7)` → list rows of `{nickname · due Jun 9 · in 3 days}`. Hidden when empty.
- **Recent transactions**: unchanged (last 5).

---

## 9. Android Due-Date Reminders

### `lib/notifications.ts` (new)
```typescript
export function isReminderEnabled(): boolean;            // localStorage cl_reminders_enabled, default true
export function setReminderEnabled(v: boolean): void;
export function getReminderDaysBefore(): number;         // localStorage cl_reminder_days, default 3
export function setReminderDaysBefore(n: number): void;
export async function scheduleDueReminders(
  cards: { id: string; nickname: string; payment_due_day: number }[],
): Promise<void>;
```

`scheduleDueReminders`:
1. No-op when `!Capacitor.isNativePlatform()` or `!isReminderEnabled()`
2. Requests `LocalNotifications` permission (once)
3. Cancels all previously scheduled CardLedger notifications
4. For each card: computes the next due date, subtracts `getReminderDaysBefore()` days, schedules a notification at 9 AM titled "Payment due soon" / body "{nickname} payment is due in {n} days". Deterministic integer notification id derived from the card (stable across reschedules).

Called from `main.tsx` after first card load and re-run whenever the cards query updates (a small effect in `HomeScreen` keyed on cards).

### Settings (`screens/SettingsScreen.tsx`)
Native-only block: **"Due-date reminders"** toggle (`isReminderEnabled`) + a **"days before"** stepper (1/2/3/5/7, default 3). Changing either reschedules.

---

## 10. Edit / Delete Completeness

- **Card edit:** `AddCardScreen` accepts an optional `:id` route param → edit mode (prefill, `useUpdateCard`). New route `/cards/:id/edit`. Card Detail gets an edit button.
- **Card delete:** Card Detail "Delete card" action → confirm → `useDeleteCard`; on 409 show "Card has transactions — delete them first".
- **Transaction edit/delete:** each transaction row on Card Detail gets a tap → small action sheet (Edit → reuses fields like AddTransactionSheet in edit mode via `useUpdateTransaction`; Delete → `useDeleteTransaction`).
- **Assignment:** Card Detail can delete an assignment (`useDeleteAssignment`) in addition to existing return.

---

## 11. Routing & Wiring

- `/cards/:id/edit` → `AddCardScreen` (edit mode)
- `AddTransactionSheet` mounted at app shell level so the FAB can open it from any screen
- All new screens/sheets hidden behind existing `AuthGuard` + `AppLockGuard`

---

## 12. Out of Scope

- iOS notifications
- Recurring/auto transactions
- Multi-currency
- Editing the system "me" holder
- Charts/graphs beyond utilization rings (no time-series)

---

## 13. Success Criteria

- [ ] `analytics.ts` passes all utilization + upcoming-dues tests
- [ ] Every entity (card, holder, assignment, transaction) has working create/read/update/delete from the app
- [ ] Deleting a card/holder with transactions is blocked with a clear 409 message
- [ ] Manual transaction add lets the user pick "who used", stored as `holder_id_at_time`
- [ ] Home shows total utilization, per-card utilization, and upcoming dues
- [ ] FAB opens the add-transaction sheet on Home and Card Detail
- [ ] Friends can be added, edited, and deleted from the app
- [ ] Android schedules a local notification N days before each card's due date; toggle + days-before work in Settings
- [ ] PWA unaffected — notifications no-op on web, all analytics/CRUD work in browser
- [ ] `pnpm build` (app + server) and `pnpm test` (shared) all green
