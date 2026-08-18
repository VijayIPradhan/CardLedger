ALTER TABLE "transactions" ADD COLUMN "payments_received" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_payments" DROP COLUMN "settled_transactions";