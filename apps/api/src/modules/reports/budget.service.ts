import {
  abs,
  add,
  compare,
  isZero,
  PIVOT_CURRENCY,
  subtract,
  toDecimal,
  todayIn,
  todayUtc,
  type BudgetRow,
  type BudgetStatus,
  type SetBudgetsInput,
} from '@moneymap/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, budgets, categories, transactions, users } from '../../db/schema.ts';
import { badRequest } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';

/**
 * Бюджеты по категориям (§8.10).
 *
 * Лимит хранится постоянный, месяц появляется только в расчёте: «на продукты
 * шестьсот» — решение, а не ежемесячная работа. Потраченное считается в
 * базовой валюте пользователя по курсу на дату операции — как и в отчётах,
 * иначе бюджет прошлого месяца менялся бы от сегодняшних торгов.
 */

/** Граница, за которой бюджет считается на исходе. */
const WARNING_SHARE = 0.8;

function monthBounds(month: string): { from: string; to: string } {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(year, index - 1, 1));
  const to = new Date(Date.UTC(year, index, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function previousMonth(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, index - 2, 1));
  return date.toISOString().slice(0, 7);
}

async function baseCurrencyOf(db: Db, userId: string): Promise<string> {
  const [user] = await db
    .select({ baseCurrency: users.baseCurrency })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.baseCurrency ?? PIVOT_CURRENCY;
}

/** Потрачено по каждой категории за месяц, в валюте `base`. */
async function spentByCategory(
  db: Db,
  scope: Scope,
  base: string,
  month: string,
): Promise<Map<string, string>> {
  const { from, to } = monthBounds(month);

  const rateAt = (quote: unknown) => sql`coalesce(
    (
      select r.rate from exchange_rates r
      where r.base = ${PIVOT_CURRENCY} and r.quote = ${quote}
        and r.date <= ${transactions.occurredOn}
      order by r.date desc
      limit 1
    ),
    (
      select r.rate from exchange_rates r
      where r.base = ${PIVOT_CURRENCY} and r.quote = ${quote}
      order by r.date asc
      limit 1
    ),
    1
  )`;

  const amount = sql<string>`round(
    ${transactions.amountAccount} * (${rateAt(base)}) / (${rateAt(accounts.currencyCode)}),
    18
  )`;

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<string>`round(abs(coalesce(sum(${amount}), 0)), 18)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        scope.own(transactions),
        eq(transactions.kind, 'expense'),
        sql`${transactions.occurredOn} between ${from} and ${to}`,
      ),
    )
    .groupBy(transactions.categoryId);

  return new Map(
    rows.filter((row) => row.categoryId).map((row) => [row.categoryId as string, row.spent]),
  );
}

function statusOf(spent: string, limit: string): BudgetStatus {
  if (isZero(limit)) return 'ok';
  if (compare(spent, limit) > 0) return 'over';
  const share = toDecimal(spent).div(toDecimal(limit)).toNumber();
  return share >= WARNING_SHARE ? 'warning' : 'ok';
}

export async function listBudgets(
  db: Db,
  scope: Scope,
  month?: string,
): Promise<{ month: string; baseCurrency: string; budgets: BudgetRow[] }> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, scope.ownerId))
    .limit(1);

  const today = user?.timezone ? todayIn(user.timezone) : todayUtc();
  const period = month ?? today.slice(0, 7);
  const base = await baseCurrencyOf(db, scope.ownerId);

  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      categoryKey: categories.defaultKey,
      amount: budgets.amount,
      rollover: budgets.rollover,
      createdAt: budgets.createdAt,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(eq(budgets.userId, scope.ownerId))
    .orderBy(categories.sortOrder);

  const spent = await spentByCategory(db, scope, base, period);
  // Перенос считается на один месяц назад, а не накапливается с начала
  // времён: «остаток с прошлого месяца» — это то, что человек помнит,
  // а сумма всех остатков за год — уже не бюджет, а другой счёт.
  const previous = rows.some((row) => row.rollover)
    ? await spentByCategory(db, scope, base, previousMonth(period))
    : new Map<string, string>();

  return {
    month: period,
    baseCurrency: base,
    budgets: rows.map((row) => {
      const used = spent.get(row.categoryId) ?? '0';

      // Переносить можно только из месяца, в котором лимит уже существовал.
      // Иначе первый же месяц получает двойной бюджет: «потрачено ноль»
      // до появления лимита — это не сэкономленные деньги, а отсутствие
      // лимита.
      const existedBefore = row.createdAt.toISOString().slice(0, 7) <= previousMonth(period);
      const spentBefore = previous.get(row.categoryId) ?? '0';
      const carried =
        row.rollover && existedBefore && compare(spentBefore, row.amount) < 0
          ? subtract(row.amount, spentBefore)
          : '0';
      const limit = add(row.amount, carried);

      return {
        categoryId: row.categoryId,
        categoryKey: row.categoryKey,
        amount: row.amount,
        carried,
        limit,
        spent: used,
        remaining: subtract(limit, used),
        rollover: row.rollover,
        share: isZero(limit)
          ? 0
          : toDecimal(used).div(toDecimal(limit)).toDecimalPlaces(4).toNumber(),
        status: statusOf(used, limit),
      };
    }),
  };
}

/**
 * Замена набора лимитов целиком (§9: PUT /budgets).
 *
 * Нулевая сумма означает «лимита нет» и удаляет строку: отдельная кнопка
 * удаления рядом с полем ввода была бы вторым способом сказать то же самое.
 */
export async function setBudgets(db: Db, scope: Scope, input: SetBudgetsInput): Promise<void> {
  const ids = input.budgets.map((row) => row.categoryId);

  if (ids.length > 0) {
    const owned = await db
      .select({ id: categories.id })
      .from(categories)
      .where(scope.own(categories, inArray(categories.id, ids)));

    if (owned.length !== new Set(ids).size) throw badRequest('errors.categoryNotFound');
  }

  const keep = input.budgets.filter((row) => !isZero(row.amount));
  const drop = input.budgets.filter((row) => isZero(row.amount)).map((row) => row.categoryId);

  if (keep.length > 0) {
    await db
      .insert(budgets)
      .values(
        keep.map((row) =>
          scope.stamp({
            categoryId: row.categoryId,
            amount: abs(row.amount),
            rollover: row.rollover ?? false,
          }),
        ),
      )
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId],
        set: {
          amount: sql`excluded.amount`,
          rollover: sql`excluded.rollover`,
          updatedAt: sql`now()`,
        },
      });
  }

  if (drop.length > 0) {
    await db
      .delete(budgets)
      .where(and(eq(budgets.userId, scope.ownerId), inArray(budgets.categoryId, drop)));
  }
}
