import type { AccountResponse, CreateAccountInput, UpdateAccountInput } from '@moneymap/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, transactions } from '../../db/schema.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';
import { assertCurrencyExists } from '../reference/currency.service.ts';

/**
 * Баланс считается в том же запросе, что и список (§7.1): остаток на дату
 * открытия плюс все операции по счёту.
 *
 * Подзапрос, а не join с group by: join по счёту без операций дал бы NULL,
 * а с несколькими счетами потребовал бы группировки всей выборки ради одной
 * агрегированной колонки.
 */
const movement = sql`coalesce((
  select sum(${transactions.amountAccount})
  from ${transactions}
  where ${transactions.accountId} = ${accounts.id}
    and ${transactions.deletedAt} is null
), 0)`;

const hasTransactions = sql`exists (
  select 1 from ${transactions}
  where ${transactions.accountId} = ${accounts.id}
    and ${transactions.deletedAt} is null
)`;

/**
 * Оба фрагмента обязаны попасть в запрос вложенными в другой `sql`, иначе
 * Drizzle печатает колонки без имени таблицы.
 *
 * Для коррелированного подзапроса это тихая катастрофа: `where "account_id"
 * = "id"` внутри выборки по transactions читается как
 * `transactions.account_id = transactions.id` — условие, истинное никогда.
 * Запрос при этом валиден, ошибки нет, просто ответ всегда ложь. Ровно это
 * и случилось: баланс (вложенный фрагмент) считался верно, а
 * hasTransactions (невложенный) молча возвращал false, и счёт с операциями
 * удалялся вместо отказа.
 */
const movementSql = sql<string>`(${movement})`;
const hasTransactionsSql = sql<boolean>`(${hasTransactions})`;

interface AccountRow {
  id: string;
  name: string;
  type: AccountResponse['type'];
  currencyCode: string;
  openingBalance: string;
  balance: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
  hasTransactions: boolean;
  createdAt: Date;
}

function toResponse(row: AccountRow): AccountResponse {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currencyCode: row.currencyCode,
    openingBalance: row.openingBalance,
    // Сложение в SQL, а не в decimal.js: оба слагаемых — NUMERIC(38,18),
    // и Postgres складывает их без потери точности.
    balance: row.balance,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    isArchived: row.isArchived,
    hasTransactions: row.hasTransactions,
    createdAt: row.createdAt.toISOString(),
  };
}

const selection = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  currencyCode: accounts.currencyCode,
  openingBalance: accounts.openingBalance,
  balance: sql<string>`(${accounts.openingBalance} + ${movementSql})`.as('balance'),
  icon: accounts.icon,
  color: accounts.color,
  sortOrder: accounts.sortOrder,
  isArchived: accounts.isArchived,
  hasTransactions: hasTransactionsSql.as('has_transactions'),
  createdAt: accounts.createdAt,
};

export async function listAccounts(db: Db, scope: Scope): Promise<AccountResponse[]> {
  const rows = await db
    .select(selection)
    .from(accounts)
    .where(scope.own(accounts))
    .orderBy(asc(accounts.isArchived), asc(accounts.sortOrder), asc(accounts.createdAt));

  return rows.map((row) => toResponse(row as unknown as AccountRow));
}

export async function getAccount(db: Db, scope: Scope, id: string): Promise<AccountResponse> {
  const [row] = await db
    .select(selection)
    .from(accounts)
    .where(scope.own(accounts, eq(accounts.id, id)))
    .limit(1);

  if (!row) throw notFound('errors.accountNotFound');
  return toResponse(row as unknown as AccountRow);
}

export async function createAccount(
  db: Db,
  scope: Scope,
  input: CreateAccountInput,
): Promise<AccountResponse> {
  const currency = await assertCurrencyExists(db, input.currencyCode, 'currencyCode');

  const [created] = await db
    .insert(accounts)
    .values(
      scope.stamp({
        name: input.name,
        type: input.type,
        currencyCode: currency,
        openingBalance: input.openingBalance,
        icon: input.icon ?? null,
        color: input.color ?? null,
      }),
    )
    .returning({ id: accounts.id });

  if (!created) throw new Error('Счёт не создан');
  return getAccount(db, scope, created.id);
}

export async function updateAccount(
  db: Db,
  scope: Scope,
  id: string,
  input: UpdateAccountInput,
): Promise<AccountResponse> {
  const [updated] = await db
    .update(accounts)
    .set({ ...input, updatedAt: new Date() })
    .where(scope.own(accounts, eq(accounts.id, id)))
    .returning({ id: accounts.id });

  if (!updated) throw notFound('errors.accountNotFound');
  return getAccount(db, scope, id);
}

/**
 * Удаление возможно только у счёта без операций (§8.2).
 *
 * Счёт с историей не удаляется даже мягко: он назван в каждой своей операции,
 * и список, где вместо счёта пустота, — это сломанная история, а не чистая.
 * Для таких счетов есть архив, и клиенту возвращается именно это указание.
 */
export async function deleteAccount(db: Db, scope: Scope, id: string): Promise<void> {
  const [row] = await db
    .select({ id: accounts.id, hasTransactions: hasTransactionsSql })
    .from(accounts)
    .where(scope.own(accounts, eq(accounts.id, id)))
    .limit(1);

  if (!row) throw notFound('errors.accountNotFound');
  if (row.hasTransactions) throw conflict('errors.accountHasTransactions');

  await db
    .update(accounts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(scope.own(accounts, eq(accounts.id, id)), isNull(accounts.deletedAt)));
}
