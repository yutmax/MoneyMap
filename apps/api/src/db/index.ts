import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from '../lib/env.ts';
import * as schema from './schema.ts';

export const pg = postgres(env.DATABASE_URL, {
  max: isProduction ? 20 : 5,
  idle_timeout: 30,
  connect_timeout: 10,
  // NOTICE из Postgres не несёт пользы в логах приложения.
  onnotice: () => {},
});

export const db = drizzle(pg, { schema, casing: 'snake_case' });

export type Db = typeof db;
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Любой приёмник запросов: пул или транзакция. */
export type DbExecutor = Db | DbTransaction;

export { schema };
