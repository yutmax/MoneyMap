ALTER TABLE "users" ALTER COLUMN "base_currency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "timezone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Кто уже зарегистрировался по старой форме, выбрал валюту и таймзону прямо
-- там: для них первичная настройка пройдена, и гонять их через онбординг
-- повторно незачем.
UPDATE "users"
SET "onboarded_at" = "created_at"
WHERE "base_currency" IS NOT NULL
  AND "timezone" IS NOT NULL
  AND "onboarded_at" IS NULL;
