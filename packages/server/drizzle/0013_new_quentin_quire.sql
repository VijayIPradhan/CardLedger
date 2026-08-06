CREATE INDEX IF NOT EXISTS "assignments_card_id_idx" ON "assignments" ("card_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_holder_id_idx" ON "assignments" ("holder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_user_id_idx" ON "cards" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holders_user_id_idx" ON "holders" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_holder_id_idx" ON "payments" ("holder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_card_id_idx" ON "transactions" ("card_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_holder_id_idx" ON "transactions" ("holder_id_at_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_txn_date_idx" ON "transactions" ("txn_date");