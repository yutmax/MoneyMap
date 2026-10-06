import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://moneymap:moneymap@localhost:5432/moneymap',
  },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
