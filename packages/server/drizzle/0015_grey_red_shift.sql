ALTER TABLE "card_payments" ADD COLUMN "transaction_id" uuid;
--> statement-breakpoint
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;