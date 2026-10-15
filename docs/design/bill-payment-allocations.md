# Bill payments: one row per payment, allocations in their own table

Status: phases 1-3 implemented, not yet deployed (2026-10-15)

## Problem

A single payment to the bank is stored as several `card_payments` rows:

- a parent row with the full amount and no `transaction_id` (`is_parent = true`)
- one child row per selected transaction, each with its share and `parent_payment_id`
- optionally an "Unallocated" child for whatever was left over

All of these sit in the same table that every balance calculation sums. The same money
therefore exists two or more times, and every reader has to remember which copy to skip.
They have not agreed:

| Reader                                  | Skipped before 2026-10-15 | Effect                                  |
|-----------------------------------------|---------------------------|-----------------------------------------|
| `summaryDetail.ts`                      | parents                   | correct                                 |
| `currentSpendSql` (cards list, summary) | nothing                   | negative card balance (-22,803)         |
| `debtEngine.ts` (Advance In Hand)       | nothing                   | "Paid from pocket" doubled              |
| `GET /transactions` list                | nothing                   | payment listed twice (web)              |
| Android card detail                     | groups parent/children    | correct display, double rows elsewhere  |
| DELETE / PATCH routes                   | hand-written cascades     | 6 incremental `payments_received` edits |

The last six commits on `main` each patched one reader. The structure, not any one reader,
is the bug: a grouping record must not carry money.

The Android client also creates the rows in N+1 separate HTTP requests, so a network failure
part-way leaves a parent with only some of its children.

## Design

### Data model

```
card_payments                      one row = one real payment to the bank
  id, card_id, holder_id (funder), amount, payment_date, notes, billing_cycle_id, created_at

card_payment_allocations           how a payment is applied to spend; carries no new money
  id
  card_payment_id  -> card_payments.id  ON DELETE CASCADE
  transaction_id   -> transactions.id   ON DELETE CASCADE
  amount           numeric(12,2)  CHECK (amount > 0)
  created_at
  UNIQUE (card_payment_id, transaction_id)
```

Removed after rollout: `card_payments.transaction_id`, `card_payments.parent_payment_id`,
`card_payments.is_parent`, and the unused `transactions.parent_payment_id`,
`transactions.is_parent`, `transactions.linked_transaction_id` (verify unused first).

Invariants, enforced by the server inside one DB transaction (`SELECT ... FOR UPDATE` on the
payment and the affected transactions):

1. `SUM(allocations.amount WHERE card_payment_id = P) <= P.amount`
2. `SUM(allocations.amount WHERE transaction_id = T) <= T.amount`
3. Unallocated amount of P = `P.amount - SUM(allocations of P)`; derived, never stored.

### Settlement

`transactions.payments_received` is a cache of the allocations, refreshed by one function in
the same DB transaction as every allocation write (`recomputeSettlement` in
`packages/server/src/db/allocations.ts`):

```
payments_received = SUM(allocations to the transaction)
is_paid           = payments_received >= amount
                    OR (is_paid AND old payments_received < amount)   -- marked paid by hand
```

No route does `+=` / `-=` on `payments_received` any more; that is what drifted. The second
line keeps a hand-marked transaction paid when a payment against it is edited or removed,
without needing an extra column: if the old payments did not cover the amount, allocations
were not what made it paid.

### Money rules (one definition, shared)

A payment leaves the card's balance and the "hand" by the part of it not already reflected
in a settled transaction:

```
effective(P) = P.amount - SUM(allocations of P to transactions with is_paid = true)
```

- `currentSpendSql`: unpaid spend - unpaid refunds - SUM(effective(P)) for the card
- `debtEngine` forwarded amount: `effective(P)`, still capped by unsettled spend as today
- `summaryDetail.ts`: uses the shared helper instead of its own copy

Implemented as `effectiveCardPaymentAmount` in `packages/shared/src/domain/debtEngine.ts`
and `currentSpendSql` in `packages/server/src/db/sqlFragments.ts`.

### API

```
POST   /card-payments
  { card_id, amount, payment_date, funded_by_holder_id?, notes?,
    allocations?: [{ transaction_id, amount }]    // explicit split, or
    transaction_ids?: [id, ...] }                 // server fills these in order
  -> 201 bill_payment row with allocations and unallocated_amount

GET    /card-payments/:id
PATCH  /card-payments/:id   amount/payment_date/notes/funded_by_holder_id; allocations or
                            transaction_ids replace the whole set ([] = unallocated)
DELETE /card-payments/:id   -> 204; allocations cascade, settlement recomputed
```

One request, one DB transaction: no partial payments. The transactions a payment names are
locked (`SELECT ... FOR UPDATE`) before their remaining amounts are read, so two payments made
at once cannot both claim the same balance. Rejected with 400: a transaction on another card or
not a spend, a transaction listed twice, an explicit allocation beyond what the transaction still
owes, allocations beyond the payment, an edit that takes the payment below what it has allocated.

`distributePayment` (`packages/shared/src/domain/paymentDistribution.ts`) is the split rule,
in whole paise: fill bills in the order given, each up to what it still owes; the rest is
unallocated. `PaymentDistribution.kt` keeps the same rule for the Android preview only.

All rules live in `packages/server/src/lib/cardPayments.ts`; both `/card-payments` and the
older paths below call it.

`GET /transactions` returns one `bill_payment` row per payment (never per allocation), with
`allocations` and `unallocated_amount`; `linked_transaction_id` is set when there is exactly
one allocation, for older clients.

Compatibility for installed builds:

- `POST /transactions` with `type: 'bill_payment'` creates a payment that settles at most the
  linked transaction (any excess stays unallocated, where it used to over-settle it).
- With `parent_payment_id` (old Android splits): adds a share to that payment as an allocation.
- `PATCH` / `DELETE /transactions/:id` on a card payment go through the same service.

### Migration

- `0022_card_payment_allocations` (phase 1): creates the table and backfills it from the
  legacy rows. Additive.
- `0023_fold_split_payments` (phase 2): backs up `card_payments`, the allocations and every
  transaction's `payments_received` / `is_paid` into `*_phase1_backup` tables; rebuilds the
  allocations from the legacy rows; deletes child rows; turns parents into ordinary payments;
  recomputes `payments_received` / `is_paid` where they change.
- Phase 4 (later): drop the legacy columns and the backup tables.

Both run automatically at server start. Deploying phases 1 and 2 together is fine: 0023
rebuilds the allocations itself.

### Rollout

1. Done: allocations table, backfill, server keeps it in step.
2. Done: reads use allocations (`currentSpendSql`, `effectiveCardPaymentAmount` in the debt
   engine and card detail, `GET /transactions`); writes maintain allocations and recompute
   settlement; old-client split requests are folded into allocations; migration 0023.
3. Done: `/card-payments` with server-side distribution; web and Android record a payment in
   one request.
4. Drop legacy columns and backups.

### Before deploying phase 2 (read-only, on production as it is now)

Take a database backup first (pgAdmin: right-click the database > Backup).

Transactions whose settlement will change. Expected: none, or only rows whose
`payments_received` had drifted from their linked payments. Review every row:

```sql
WITH legacy AS (
  SELECT cp.transaction_id, SUM(cp.amount) AS total
  FROM card_payments cp
  WHERE cp.transaction_id IS NOT NULL
    AND (cp.parent_payment_id IS NULL
         OR EXISTS (SELECT 1 FROM card_payments p WHERE p.id = cp.parent_payment_id))
  GROUP BY 1)
SELECT t.id, t.merchant, t.txn_date, t.amount,
       t.payments_received AS received_now, COALESCE(l.total, 0) AS received_after,
       t.is_paid AS paid_now,
       (COALESCE(l.total, 0) >= t.amount)
         OR (t.is_paid AND t.payments_received < t.amount) AS paid_after
FROM transactions t LEFT JOIN legacy l ON l.transaction_id = t.id
WHERE COALESCE(l.total, 0) <> t.payments_received;
```

Split payments whose shares add up to more than the payment (allowed before, would be shown
as allocated beyond their amount afterwards). Expected: none:

```sql
SELECT p.id, p.payment_date, p.amount, SUM(c.amount) AS shares
FROM card_payments p JOIN card_payments c ON c.parent_payment_id = p.id
WHERE c.transaction_id IS NOT NULL
GROUP BY p.id, p.payment_date, p.amount
HAVING SUM(c.amount) > p.amount;
```

What will be folded away (for the record):

```sql
SELECT COUNT(*) FILTER (WHERE parent_payment_id IS NOT NULL) AS child_rows_deleted,
       COUNT(*) FILTER (WHERE is_parent) AS parents_kept_as_payments
FROM card_payments;
```

### After deploying phase 2 (read-only)

All three should return zero rows:

```sql
-- no parent/child rows left
SELECT id FROM card_payments WHERE parent_payment_id IS NOT NULL OR is_parent;

-- payments_received matches the allocations
SELECT t.id FROM transactions t
LEFT JOIN (SELECT transaction_id, SUM(amount) AS total FROM card_payment_allocations GROUP BY 1) a
  ON a.transaction_id = t.id
WHERE COALESCE(a.total, 0) <> t.payments_received;

-- no payment allocated beyond its amount
SELECT p.id FROM card_payments p JOIN card_payment_allocations a ON a.card_payment_id = p.id
GROUP BY p.id, p.amount HAVING SUM(a.amount) > p.amount;
```

### Rollback of phase 2

Redeploy the previous server build, then restore from the backup tables in one transaction.
Payments recorded after the phase 2 deploy are kept; one that was split across several
transactions will read as a single unlinked payment under the old code.

```sql
BEGIN;
DELETE FROM card_payment_allocations;
INSERT INTO card_payments
  SELECT * FROM card_payments_phase1_backup b
  WHERE NOT EXISTS (SELECT 1 FROM card_payments c WHERE c.id = b.id);
UPDATE card_payments c SET is_parent = b.is_parent
  FROM card_payments_phase1_backup b WHERE b.id = c.id;
INSERT INTO card_payment_allocations SELECT * FROM card_payment_allocations_phase1_backup;
UPDATE transactions t SET payments_received = b.payments_received, is_paid = b.is_paid
  FROM transactions_settlement_phase1_backup b WHERE b.id = t.id;
ALTER TABLE card_payments_phase1_backup RENAME TO card_payments_rolled_back;
ALTER TABLE card_payment_allocations_phase1_backup RENAME TO card_payment_allocations_rolled_back;
ALTER TABLE transactions_settlement_phase1_backup RENAME TO transactions_settlement_rolled_back;
DELETE FROM drizzle.__drizzle_migrations
  WHERE created_at = (SELECT MAX(created_at) FROM drizzle.__drizzle_migrations);
COMMIT;
```

The renames keep the backups but free their names, and the last statement forgets 0023, so
phase 2 applies cleanly on its next deploy. Check that the newest migrations row really is 0023
before running it, and drop the `*_rolled_back` tables once they are no longer needed.

### Migration chain repair (found while testing phase 1)

A fresh database could not be migrated: 0012 drops `card_payments` and nothing recreated it
before 0015 altered it (production had the table, created outside the migrations, with a
`holder_id` no migration adds). 0015 now creates the table if it is missing, matching its
snapshot. Production has already applied 0015 and never re-runs it.

### Tests

- shared (`debtEngine.test.ts`): parent rows not double-counted; an allocated payment gives the
  same result as its legacy parent and children; allocations override a stale link.
- server (`allocations.test.ts`, `cards.test.ts`): old-client split stored as one payment with
  allocations and listed once; balance counts it once; cannot edit below allocated; delete and
  relink recompute settlement; hand-marked paid survives; cross-card links rejected.
- migration, run against PGlite with production's history (0000-0017 by Drizzle, 0018-0021 by
  hand, legacy parent/child/unallocated/standalone rows): card balances, friend debts, Advance
  In Hand, payments_received and is_paid are identical before and after 0023; 11 legacy rows
  become 6 payments; the preview, after-deploy and rollback SQL in this doc were executed as
  written, and phase 2 re-applies after a rollback. A fresh database migrates 0000-0023.

- phase 3: `paymentDistribution.test.ts` (exact, partial, overpay, nothing selected, settled
  bills); `cardPayments.test.ts` (one-request split of the 22,803 case, overpayment kept
  unallocated, both invariants, cross-card rejection, replace/delete resettle both sides, spend
  amount edits resettle). The concurrent-payments test passes on PGlite, which runs one
  transaction at a time, so it does not prove the row lock; that needs real Postgres.

## Interim fixes (2026-10-15)

- `currentSpendSql` and `debtEngine` skip `is_parent` rows.
- Android writes a single row when a payment has nothing to split.

Superseded by phase 2, which removes parent/child rows altogether.
