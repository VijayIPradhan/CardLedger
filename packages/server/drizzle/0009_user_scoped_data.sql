-- Add user ownership to cards and holders so each user's data is isolated.
-- Backfill: assign all existing rows to the first user in the table (safe for
-- single-user dev instances; multi-user prod instances should run this with
-- explicit user assignment before setting NOT NULL).
ALTER TABLE "holders" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "holders" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "cards" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "holders" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "holders" ADD CONSTRAINT "holders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
