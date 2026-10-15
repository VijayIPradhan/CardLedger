CREATE TABLE "card_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_payment_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "card_payment_allocations_amount_positive" CHECK ("card_payment_allocations"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "card_payment_allocations" ADD CONSTRAINT "card_payment_allocations_card_payment_id_card_payments_id_fk" FOREIGN KEY ("card_payment_id") REFERENCES "public"."card_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_payment_allocations" ADD CONSTRAINT "card_payment_allocations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_payment_allocations_payment_txn_idx" ON "card_payment_allocations" USING btree ("card_payment_id","transaction_id");--> statement-breakpoint
CREATE INDEX "card_payment_allocations_transaction_id_idx" ON "card_payment_allocations" USING btree ("transaction_id");--> statement-breakpoint
-- Backfill from the legacy parent/child card_payments rows. Must match legacyAllocationsSelect
-- in src/db/allocations.ts. Additive only: no legacy row is changed or removed.
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
