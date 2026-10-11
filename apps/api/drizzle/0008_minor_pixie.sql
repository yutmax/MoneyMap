ALTER TABLE "transactions" ADD COLUMN "import_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_id_import_hash_key" ON "transactions" USING btree ("user_id","import_hash");