ALTER TABLE "cards" ADD COLUMN "palette" jsonb;--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN IF EXISTS "color";