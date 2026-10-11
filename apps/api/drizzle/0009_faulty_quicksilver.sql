ALTER TABLE "accounts" ADD COLUMN "opened_on" date DEFAULT current_date NOT NULL;--> statement-breakpoint
-- Существующим счетам дата открытия берётся из дня, когда их завели:
-- current_date поставил бы всем сегодняшнее число и обнулил бы историю.
UPDATE "accounts" SET "opened_on" = "created_at"::date;
