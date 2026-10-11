CREATE TABLE "exchange_rates" (
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"date" date NOT NULL,
	"rate" numeric(38, 18) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_base_quote_date_pk" PRIMARY KEY("base","quote","date")
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"base_currency" text NOT NULL,
	"total_amount" numeric(38, 18) NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "net_worth_snapshots_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currencies_code_fk" FOREIGN KEY ("base") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quote_currencies_code_fk" FOREIGN KEY ("quote") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_base_date_idx" ON "exchange_rates" USING btree ("base","date" DESC NULLS LAST);