-- Phase 4 of docs/design/bill-payment-allocations.md: card_payment_allocations is the only record
-- of what a payment settles, so the old link columns go.
--
-- Columns are dropped by name only. Their foreign keys and indexes go with them, which matters:
-- in production those keys were created inline by 0020/0021 and carry Postgres' generated
-- names, not Drizzle's, so dropping them by name would fail there.
--
-- The *_phase1_backup tables from 0023 are kept as an archive; drop them by hand when no longer
-- wanted (see the design doc). The phase 2 rollback cannot run after this migration.

-- 1. A payment still linked through the old column but with no allocations would lose its link.
--    0023 rebuilt allocations from these links, so none are expected; carry any over regardless,
--    with the old meaning (the whole payment against that transaction).
CREATE TEMP TABLE "carried_links" ON COMMIT DROP AS
  SELECT cp.id AS card_payment_id, cp.transaction_id, cp.amount
  FROM card_payments cp
  WHERE cp.transaction_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM card_payment_allocations a WHERE a.card_payment_id = cp.id);
--> statement-breakpoint
INSERT INTO "card_payment_allocations" ("card_payment_id", "transaction_id", "amount")
  SELECT card_payment_id, transaction_id, amount FROM carried_links WHERE amount > 0;
--> statement-breakpoint
UPDATE "transactions" t
SET "payments_received" = s.total,
    "is_paid" = (s.total >= t.amount) OR (t.is_paid AND t.payments_received < t.amount)
FROM (
  SELECT t2.id, COALESCE(SUM(a.amount), 0) AS total
  FROM transactions t2
  LEFT JOIN card_payment_allocations a ON a.transaction_id = t2.id
  WHERE t2.id IN (SELECT transaction_id FROM carried_links)
  GROUP BY t2.id
) s
WHERE t.id = s.id;
--> statement-breakpoint

-- 2. card_payments: parent/child rows were folded away by 0023; the link is in allocations.
ALTER TABLE "card_payments" DROP COLUMN IF EXISTS "transaction_id";
--> statement-breakpoint
ALTER TABLE "card_payments" DROP COLUMN IF EXISTS "parent_payment_id";
--> statement-breakpoint
ALTER TABLE "card_payments" DROP COLUMN IF EXISTS "is_parent";
--> statement-breakpoint

-- 3. transactions: these were added by 0021 for bill payments stored as transactions, which the
--    server never wrote; bill payments have always gone to card_payments. Drop them only if no
--    row uses them. Otherwise leave them in place (nothing reads them any more) and say so in
--    the server log, so the rows can be looked at before deciding what they mean.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE parent_payment_id IS NOT NULL OR is_parent OR linked_transaction_id IS NOT NULL
  ) THEN
    RAISE NOTICE 'transactions has rows using parent_payment_id / is_parent / linked_transaction_id; columns kept. See docs/design/bill-payment-allocations.md.';
  ELSE
    ALTER TABLE transactions DROP COLUMN IF EXISTS parent_payment_id;
    ALTER TABLE transactions DROP COLUMN IF EXISTS is_parent;
    ALTER TABLE transactions DROP COLUMN IF EXISTS linked_transaction_id;
  END IF;
END $$;
