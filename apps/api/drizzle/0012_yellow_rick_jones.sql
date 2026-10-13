ALTER TABLE "budgets" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_id_account_id_key" ON "budgets" USING btree ("user_id","account_id");--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_target_one_of" CHECK (num_nonnulls("budgets"."category_id", "budgets"."account_id") = 1);