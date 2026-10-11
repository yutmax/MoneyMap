import {
  abs,
  isNegative,
  isZero,
  subtract,
  todayIn,
  todayUtc,
  type CreateSnapshotInput,
  type ListSnapshotsQuery,
  type ReconciliationRow,
  type SnapshotResponse,
} from '@moneymap/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, balanceSnapshots, transactions, users } from '../../db/schema.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';
import { createTransaction } from '../transactions/transaction.service.ts';

/**
 * Сверка остатков (§8.8).
 *
 * Главный инструмент контроля качества учёта: расхождение между тем, что
 * показывает банк, и тем, что насчитало приложение, означает незафиксированную
 * операцию. Поэтому расчётное значение запоминается в момент ввода, а не
 * пересчитывается при чтении: операция, добавленная задним числом, изменила
 * бы расчёт и стёрла сам факт расхождения.
 */

/** Остаток счёта на дату: начальный плюс операции не позже неё. */
function balanceAsOf(asOf: string) {
  const movement = sql`coalesce((
    select sum(${transactions.amountAccount})
    from ${transactions}
    where ${transactions.accountId} = ${accounts.id}
      and ${transactions.deletedAt} is null
      and ${transactions.occurredOn} <= ${asOf}
  ), 0)`;

  // Фрагмент обязан попасть в запрос вложенным в другой `sql`: иначе Drizzle
  // печатает колонки без имени таблицы, и коррелированный подзапрос тихо
  // превращается в сравнение transactions с самим собой.
  return sql<string>`(${accounts.openingBalance} + (${movement}))`;
}

async function userToday(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.timezone ? todayIn(row.timezone) : todayUtc();
}

/** Экран сверки: счета с расчётным остатком и датой последней проверки. */
export async function listReconciliation(db: Db, scope: Scope): Promise<ReconciliationRow[]> {
  const today = await userToday(db, scope.ownerId);

  const last = db
    .select({
      accountId: balanceSnapshots.accountId,
      asOf: sql<string>`max(${balanceSnapshots.asOf})`.as('last_as_of'),
    })
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, scope.ownerId))
    .groupBy(balanceSnapshots.accountId)
    .as('last');

  const rows = await db
    .select({
      accountId: accounts.id,
      accountName: accounts.name,
      currencyCode: accounts.currencyCode,
      computedAmount: balanceAsOf(today).as('computed'),
      lastCheckedOn: last.asOf,
      lastDifference: sql<string | null>`(
        select ${balanceSnapshots.reportedAmount} - ${balanceSnapshots.computedAmount}
        from ${balanceSnapshots}
        where ${balanceSnapshots.accountId} = ${accounts.id}
          and ${balanceSnapshots.asOf} = ${last.asOf}
        limit 1
      )`,
    })
    .from(accounts)
    .leftJoin(last, eq(last.accountId, accounts.id))
    .where(scope.own(accounts, eq(accounts.isArchived, false)))
    .orderBy(accounts.sortOrder, accounts.createdAt);

  return rows.map((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    currencyCode: row.currencyCode,
    computedAmount: row.computedAmount,
    lastCheckedOn: row.lastCheckedOn ?? null,
    lastDifference: row.lastDifference ?? null,
  }));
}

const selection = {
  id: balanceSnapshots.id,
  accountId: balanceSnapshots.accountId,
  accountName: accounts.name,
  currencyCode: accounts.currencyCode,
  asOf: balanceSnapshots.asOf,
  reportedAmount: balanceSnapshots.reportedAmount,
  computedAmount: balanceSnapshots.computedAmount,
  note: balanceSnapshots.note,
  correctionId: balanceSnapshots.correctionId,
  createdAt: balanceSnapshots.createdAt,
};

function toResponse(row: {
  [K in keyof typeof selection]: K extends 'createdAt' ? Date : string | null;
}): SnapshotResponse {
  const reported = row.reportedAmount as string;
  const computed = row.computedAmount as string;
  return {
    id: row.id as string,
    accountId: row.accountId as string,
    accountName: row.accountName as string,
    currencyCode: row.currencyCode as string,
    asOf: row.asOf as string,
    reportedAmount: reported,
    computedAmount: computed,
    difference: subtract(reported, computed),
    note: row.note,
    correctionId: row.correctionId,
    createdAt: (row.createdAt as unknown as Date).toISOString(),
  };
}

export async function listSnapshots(
  db: Db,
  scope: Scope,
  query: ListSnapshotsQuery,
): Promise<SnapshotResponse[]> {
  const rows = await db
    .select(selection)
    .from(balanceSnapshots)
    .innerJoin(accounts, eq(accounts.id, balanceSnapshots.accountId))
    .where(
      and(
        eq(balanceSnapshots.userId, scope.ownerId),
        query.accountId ? eq(balanceSnapshots.accountId, query.accountId) : undefined,
      ),
    )
    .orderBy(desc(balanceSnapshots.asOf), desc(balanceSnapshots.createdAt))
    .limit(query.limit);

  return rows.map((row) => toResponse(row as never));
}

async function getSnapshot(db: Db, scope: Scope, id: string): Promise<SnapshotResponse> {
  const [row] = await db
    .select(selection)
    .from(balanceSnapshots)
    .innerJoin(accounts, eq(accounts.id, balanceSnapshots.accountId))
    .where(and(eq(balanceSnapshots.id, id), eq(balanceSnapshots.userId, scope.ownerId)))
    .limit(1);

  if (!row) throw notFound('errors.snapshotNotFound');
  return toResponse(row as never);
}

/**
 * Ввод фактического остатка (§8.8).
 *
 * Повторная сверка того же счёта на ту же дату не создаёт вторую запись,
 * а переписывает первую: два разных ответа на вопрос «сколько было на счёте
 * в тот день» — это не история, а противоречие. Опечатку при вводе иначе
 * было бы нечем исправить.
 */
export async function createSnapshot(
  db: Db,
  scope: Scope,
  input: CreateSnapshotInput,
): Promise<SnapshotResponse> {
  const [account] = await db
    .select({ id: accounts.id, computed: balanceAsOf(input.asOf) })
    .from(accounts)
    .where(scope.own(accounts, eq(accounts.id, input.accountId)))
    .limit(1);

  if (!account) throw notFound('errors.accountNotFound');

  const [saved] = await db
    .insert(balanceSnapshots)
    .values(
      scope.stamp({
        accountId: account.id,
        asOf: input.asOf,
        reportedAmount: input.reportedAmount,
        computedAmount: account.computed,
        note: input.note ?? null,
      }),
    )
    .onConflictDoUpdate({
      target: [balanceSnapshots.accountId, balanceSnapshots.asOf],
      set: {
        reportedAmount: sql`excluded.reported_amount`,
        computedAmount: sql`excluded.computed_amount`,
        note: sql`excluded.note`,
        createdAt: sql`now()`,
      },
    })
    .returning({ id: balanceSnapshots.id });

  if (!saved) throw new Error('Сверка не сохранена');
  return getSnapshot(db, scope, saved.id);
}

/**
 * Корректирующая операция по расхождению (§8.8) — одним действием.
 *
 * Это обычная операция, а не особая запись: она и должна вести себя как
 * обычная — попадать в ленту, в баланс и в отчёты. Расхождение означает
 * забытую операцию, и честный способ его закрыть — завести ту операцию,
 * пусть и без подробностей.
 */
export async function correctSnapshot(db: Db, scope: Scope, id: string): Promise<SnapshotResponse> {
  const snapshot = await getSnapshot(db, scope, id);

  if (snapshot.correctionId) throw conflict('errors.snapshotCorrected');
  if (isZero(snapshot.difference)) throw conflict('errors.snapshotMatches');

  // Денег больше, чем знает приложение, — значит был незаписанный доход;
  // меньше — незаписанный расход. Знак операции выводит сервер, сюда
  // уходит модуль.
  const transaction = await createTransaction(db, scope, {
    accountId: snapshot.accountId,
    categoryId: null,
    kind: isNegative(snapshot.difference) ? 'expense' : 'income',
    amount: abs(snapshot.difference),
    occurredOn: snapshot.asOf,
  });

  await db
    .update(balanceSnapshots)
    .set({ correctionId: transaction.id })
    .where(eq(balanceSnapshots.id, snapshot.id));

  return getSnapshot(db, scope, snapshot.id);
}
