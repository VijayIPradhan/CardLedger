CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"limit_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "rewards_schema" jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "original_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "original_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "forex_markup_fee" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reward_earned" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reward_currency" varchar(20);--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_user_id_idx" ON "budgets" USING btree ("user_id");