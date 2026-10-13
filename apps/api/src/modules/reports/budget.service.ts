import {
  abs,
  add,
  compare,
  divide,
  isZero,
  PIVOT_CURRENCY,
  subtract,
  toDecimal,
  todayIn,
  todayUtc,
  toMoney,
  type BudgetRow,
  type BudgetStatus,
  type BudgetTarget,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@moneymap/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, budgets, categories, transactions, users } from '../../db/schema.ts';
import { badRequest, notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';

/**
 * Бюджеты (§8.10).
 *
 * Лимит ставится либо на категорию, либо на счёт целиком. Второе отвечает на
 * другой вопрос: не «сколько в месяц на продукты», а «сколько с этой карты».
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

/** Дней в месяце: 28–31, отсюда и «сколько в день». */
function daysInMonth(month: string): number {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
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

/**
 * Потрачено за месяц в валюте `base`, сгруппированное по цели бюджета.
 *
 * Группировка приходит параметром: расчёт для категории и для счёта
 * отличается ровно одной колонкой, и разводить его на две почти одинаковые
 * функции значило бы чинить курсовую арифметику дважды.
 */
async function spentBy(
  db: Db,
  scope: Scope,
  base: string,
  month: string,
  by: 'category' | 'account',
): Promise<Map<string, string>> {
  const { from, to } = monthBounds(month);
  const groupColumn = by === 'category' ? transactions.categoryId : transactions.accountId;

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
      target: groupColumn,
      spent: sql<string>`round(abs(coalesce(sum(${amount}), 0)), 18)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        scope.own(transactions),
        // Только расходы: перевод между своими счетами денег не тратит, и
        // учитывать его в лимите по счёту было бы двойным счётом.
        eq(transactions.kind, 'expense'),
        sql`${transactions.occurredOn} between ${from} and ${to}`,
      ),
    )
    .groupBy(groupColumn);

  return new Map(
    rows.filter((row) => row.target).map((row) => [row.target as string, toMoney(row.spent)]),
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
      id: budgets.id,
      categoryId: budgets.categoryId,
      categoryKey: categories.defaultKey,
      categorySort: categories.sortOrder,
      accountId: budgets.accountId,
      accountName: accounts.name,
      accountSort: accounts.sortOrder,
      amount: budgets.amount,
      rollover: budgets.rollover,
      createdAt: budgets.createdAt,
    })
    .from(budgets)
    // Обе связи внешние: у строки заполнена ровно одна из них.
    .leftJoin(categories, eq(categories.id, budgets.categoryId))
    .leftJoin(accounts, eq(accounts.id, budgets.accountId))
    .where(eq(budgets.userId, scope.ownerId));

  const hasCategory = rows.some((row) => row.categoryId !== null);
  const hasAccount = rows.some((row) => row.accountId !== null);
  const empty = new Map<string, string>();

  const spent = {
    category: hasCategory ? await spentBy(db, scope, base, period, 'category') : empty,
    account: hasAccount ? await spentBy(db, scope, base, period, 'account') : empty,
  };

  // Перенос считается на один месяц назад, а не накапливается с начала
  // времён: «остаток с прошлого месяца» — это то, что человек помнит,
  // а сумма всех остатков за год — уже не бюджет, а другой счёт.
  const rollingOver = rows.some((row) => row.rollover);
  const before = previousMonth(period);
  const previous = {
    category:
      rollingOver && hasCategory ? await spentBy(db, scope, base, before, 'category') : empty,
    account: rollingOver && hasAccount ? await spentBy(db, scope, base, before, 'account') : empty,
  };

  const days = daysInMonth(period);

  const mapped = rows.map((row) => {
    const byCategory = row.categoryId !== null;
    const targetId = (byCategory ? row.categoryId : row.accountId) as string;
    const used = (byCategory ? spent.category : spent.account).get(targetId) ?? '0';
    const amount = toMoney(row.amount);

    // Переносить можно только из месяца, в котором лимит уже существовал.
    // Иначе первый же месяц получает двойной бюджет: «потрачено ноль»
    // до появления лимита — это не сэкономленные деньги, а отсутствие
    // лимита.
    const existedBefore = row.createdAt.toISOString().slice(0, 7) <= before;
    const spentBefore = (byCategory ? previous.category : previous.account).get(targetId) ?? '0';
    const carried =
      row.rollover && existedBefore && compare(spentBefore, amount) < 0
        ? subtract(amount, spentBefore)
        : '0';
    const limit = add(amount, carried);

    const target: BudgetTarget = byCategory
      ? { kind: 'category', categoryId: targetId, categoryKey: row.categoryKey as string }
      : { kind: 'account', accountId: targetId, accountName: row.accountName as string };

    return {
      row: {
        id: row.id,
        target,
        amount,
        carried,
        limit,
        spent: used,
        remaining: subtract(limit, used),
        // Ноль делить незачем, а «ноль в день» — честный ответ для нулевого
        // лимита: он просто не задан.
        perDay: isZero(limit) ? '0' : divide(limit, String(days)),
        rollover: row.rollover,
        share: isZero(limit)
          ? 0
          : toDecimal(used).div(toDecimal(limit)).toDecimalPlaces(4).toNumber(),
        status: statusOf(used, limit),
      } satisfies BudgetRow,
      // Порядок: сначала категории в порядке каталога, затем счета в своём.
      // Сортировка в SQL потребовала бы coalesce по двум разным колонкам
      // ради того, что здесь читается одной строкой.
      sort: (byCategory ? [0, row.categorySort ?? 0] : [1, row.accountSort ?? 0]) as [
        number,
        number,
      ],
    };
  });

  mapped.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1]);

  return { month: period, baseCurrency: base, budgets: mapped.map((item) => item.row) };
}

/* ──────────────────────────── правка по одному ──────────────────────────── */

/** Цель должна принадлежать владельцу: чужой id не должен заводить бюджет. */
async function assertTargetOwned(db: Db, scope: Scope, input: CreateBudgetInput): Promise<void> {
  if (input.categoryId !== undefined) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(scope.own(categories, eq(categories.id, input.categoryId)))
      .limit(1);
    if (!category) throw notFound('errors.categoryNotFound');
    return;
  }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(scope.own(accounts, eq(accounts.id, input.accountId as string)))
    .limit(1);
  if (!account) throw notFound('errors.accountNotFound');
}

export async function createBudget(db: Db, scope: Scope, input: CreateBudgetInput): Promise<void> {
  if (isZero(input.amount)) throw badRequest('errors.budgetAmountZero');
  await assertTargetOwned(db, scope, input);

  // onConflictDoNothing вместо проверки «уже есть» отдельным запросом: между
  // проверкой и вставкой помещается второй такой же запрос, а уникальный
  // индекс не обманешь.
  const [created] = await db
    .insert(budgets)
    .values(
      scope.stamp({
        categoryId: input.categoryId ?? null,
        accountId: input.accountId ?? null,
        // Лимит — это сколько можно потратить; знак здесь ничего не значит.
        amount: abs(input.amount),
        rollover: input.rollover ?? false,
      }),
    )
    .onConflictDoNothing()
    .returning({ id: budgets.id });

  if (!created) throw badRequest('errors.budgetExists');
}

export async function updateBudget(
  db: Db,
  scope: Scope,
  id: string,
  input: UpdateBudgetInput,
): Promise<void> {
  const patch: { amount?: string; rollover?: boolean } = {};

  if (input.amount !== undefined) {
    if (isZero(input.amount)) throw badRequest('errors.budgetAmountZero');
    patch.amount = abs(input.amount);
  }
  if (input.rollover !== undefined) patch.rollover = input.rollover;

  const [updated] = await db
    .update(budgets)
    .set({ ...patch, updatedAt: new Date() })
    .where(scope.own(budgets, eq(budgets.id, id)))
    .returning({ id: budgets.id });

  if (!updated) throw notFound('errors.budgetNotFound');
}

export async function deleteBudget(db: Db, scope: Scope, id: string): Promise<void> {
  const [removed] = await db
    .delete(budgets)
    .where(scope.own(budgets, eq(budgets.id, id)))
    .returning({ id: budgets.id });

  if (!removed) throw notFound('errors.budgetNotFound');
}
