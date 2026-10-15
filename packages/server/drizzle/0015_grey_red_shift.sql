-- 0012 dropped card_payments and no migration recreated it, so fresh databases failed here.
-- Production already had the table (with holder_id) when this ran; this block only fills the
-- gap for new environments and matches the 0015 snapshot.
CREATE TABLE IF NOT EXISTS "card_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL REFERENCES "public"."cards"("id"),
	"holder_id" uuid NOT NULL REFERENCES "public"."holders"("id"),
	"amount" numeric(12, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"notes" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "card_payments" ADD COLUMN "transaction_id" uuid;
--> statement-breakpoint
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;