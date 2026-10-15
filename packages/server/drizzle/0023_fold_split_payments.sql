-- Phase 2 of docs/design/bill-payment-allocations.md: one card_payments row per real payment.
--
-- A split payment was a parent row (the full amount) plus child rows (the shares, and an
-- "Unallocated" child for any rest). The children's links are already in
-- card_payment_allocations (0022 + dual-write); this folds them away so the money exists once.
--
-- Everything changed is copied first. To roll back, see "Rollback" in the design doc.

CREATE TABLE "card_payments_phase1_backup" AS SELECT * FROM "card_payments";
--> statement-breakpoint
CREATE TABLE "card_payment_allocations_phase1_backup" AS SELECT * FROM "card_payment_allocations";
--> statement-breakpoint
CREATE TABLE "transactions_settlement_phase1_backup" AS
  SELECT "id", "payments_received", "is_paid" FROM "transactions";
--> statement-breakpoint

-- 1. Rebuild allocations from the legacy rows one last time, so they are exact even if a write
--    slipped past the phase 1 dual-write. Same SQL as the 0022 backfill.
DELETE FROM "card_payment_allocations";
--> statement-breakpoint
INSERT INTO "card_payment_allocations" ("card_payment_id", "transaction_id", "amount")
SELECT card_payment_id, transaction_id, amount FROM (
  SELECT COALESCE(cp.parent_payment_id, cp.id) AS card_payment_id,
         cp.transaction_id,
         SUM(cp.amount) AS amount
  FROM card_payments cp
  WHERE cp.transaction_id IS NOT NULL
    AND (cp.parent_payment_id IS NULL
         OR EXISTS (SELECT 1 FROM card_payments p WHERE p.id = cp.parent_payment_id))
  GROUP BY 1, 2
) legacy
WHERE amount > 0;
--> statement-breakpoint

-- 2. Children carry no money of their own: their shares are allocations now, and the parent's
--    amount already includes them (and any unallocated rest).
DELETE FROM "card_payments" WHERE "parent_payment_id" IS NOT NULL;
--> statement-breakpoint

-- 3. A parent is now simply the payment.
UPDATE "card_payments" SET "is_parent" = false WHERE "is_parent" = true;
--> statement-breakpoint

-- 4. payments_received becomes the sum of allocations. Only rows whose value changes are
--    touched. is_paid follows the runtime rule in recomputeSettlement: set once covered,
--    cleared only if it had been set by payments, so hand-marked transactions stay paid.
UPDATE "transactions" t
SET "payments_received" = s.total,
    "is_paid" = (s.total >= t.amount) OR (t.is_paid AND t.payments_received < t.amount)
FROM (
  SELECT t2.id, COALESCE(SUM(a.amount), 0) AS total
  FROM transactions t2
  LEFT JOIN card_payment_allocations a ON a.transaction_id = t2.id
  GROUP BY t2.id
) s
WHERE t.id = s.id AND s.total <> t.payments_received;
