ALTER TABLE "categories" ADD COLUMN "default_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_id_default_key_key" ON "categories" USING btree ("user_id","default_key");