import type { AccountResponse, CreateAccountInput, UpdateAccountInput } from '@moneymap/shared';
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import {
  accounts,
  budgets,
  recurringOccurrences,
  recurringRules,
  transactions,
} from '../../db/schema.ts';
import { notFound } from '../../lib/errors.ts';
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
  openedOn: string;
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
    openedOn: row.openedOn,
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
  openedOn: accounts.openedOn,
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
        ...(input.openedOn ? { openedOn: input.openedOn } : {}),
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
 * Счёт удаляется вместе со своей историей (§8.2).
 *
 * Раньше счёт с операциями удалить было нельзя, только архивировать. На деле
 * это значило, что заведённый по ошибке или тестовый счёт оставался навсегда.
 * Теперь удаление доступно всегда, а клиент перед ним предупреждает, что
 * операции уйдут тоже.
 *
 * Всё мягко и в одной транзакции:
 *  - операции счёта — вместе со второй ногой каждого перевода. Половина
 *    перевода на другом счёте была бы движением денег ниоткуда — то же
 *    правило, что при удалении одной операции;
 *  - регулярные правила счёта — им больше некуда списывать, а ожидающие
 *    подтверждения срабатывания снимаются;
 *  - лимит по счёту — бюджет на несуществующий счёт показывать негде.
 */
export async function deleteAccount(db: Db, scope: Scope, id: string): Promise<void> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(scope.own(accounts, eq(accounts.id, id)))
    .limit(1);

  if (!row) throw notFound('errors.accountNotFound');

  const now = new Date();

  await db.transaction(async (tx) => {
    // Группы переводов собираются до удаления: потом ноги этого счёта уже
    // не найти обычным запросом.
    const groups = await tx
      .selectDistinct({ groupId: transactions.transferGroupId })
      .from(transactions)
      .where(
        scope.own(
          transactions,
          eq(transactions.accountId, id),
          isNotNull(transactions.transferGroupId),
        ),
      );
    const groupIds = groups.map((g) => g.groupId).filter((g): g is string => g !== null);

    await tx
      .update(transactions)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        scope.own(
          transactions,
          groupIds.length > 0
            ? or(eq(transactions.accountId, id), inArray(transactions.transferGroupId, groupIds))
            : eq(transactions.accountId, id),
        ),
      );

    const rules = await tx
      .update(recurringRules)
      .set({ deletedAt: now, updatedAt: now, nextOccurrenceOn: null })
      .where(scope.own(recurringRules, eq(recurringRules.accountId, id)))
      .returning({ id: recurringRules.id });

    if (rules.length > 0) {
      await tx
        .update(recurringOccurrences)
        .set({ status: 'skipped', resolvedAt: now })
        .where(
          and(
            eq(recurringOccurrences.userId, scope.ownerId),
            eq(recurringOccurrences.status, 'pending'),
            inArray(
              recurringOccurrences.ruleId,
              rules.map((r) => r.id),
            ),
          ),
        );
    }

    await tx.delete(budgets).where(scope.own(budgets, eq(budgets.accountId, id)));

    await tx
      .update(accounts)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(scope.own(accounts, eq(accounts.id, id)), isNull(accounts.deletedAt)));
  });
}
