import {
  abs,
  add,
  isZero,
  PIVOT_CURRENCY,
  sum as sumMoney,
  toDecimal,
  type CashflowReport,
  type CategoryReport,
  type CategoryReportQuery,
  type Locale,
  type ReportPeriod,
  type ReportSummary,
} from '@moneymap/shared';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, categories, transactions, users } from '../../db/schema.ts';
import { notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';
import { categoryNameOrNull } from '../categories/category.catalog.ts';

/**
 * Отчёты (§8.9).
 *
 * Суммы приводятся к одной валюте курсом **на дату операции**, а не на
 * сегодня: расход в злотых прошлой весной стоил столько, сколько стоил
 * тогда. Пересчёт по сегодняшнему курсу незаметно переписывал бы историю,
 * и сумма за закрытый месяц менялась бы от того, что сегодня было на бирже.
 *
 * Делается это в SQL, а не в приложении: иначе каждую операцию пришлось бы
 * вытащить вместе с её курсом и сложить в JS — то есть выгрузить всю
 * историю ради одного числа.
 */

/** Курс опорной валюты к `quote` на дату операции, с откатом к ближайшему. */
function rateAt(quote: unknown) {
  return sql`coalesce(
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
}

/**
 * Сумма операции в валюте отчёта.
 *
 * round до восемнадцати знаков обязателен: деление numeric в Postgres даёт
 * больше, и такое значение уже не является денежной строкой — проверка
 * на выходе из API его отвергнет.
 */
function inReportCurrency(base: string) {
  return sql<string>`round(
    ${transactions.amountAccount} * (${rateAt(base)}) / (${rateAt(accounts.currencyCode)}),
    18
  )`;
}

async function resolveBase(db: Db, userId: string, requested?: string): Promise<string> {
  if (requested) return requested;
  const [user] = await db
    .select({ baseCurrency: users.baseCurrency })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw notFound('errors.userNotFound');
  return user.baseCurrency ?? PIVOT_CURRENCY;
}

/** Условие «операции пользователя за период, не удалённые». */
function periodFilter(scope: Scope, period: { from: string; to: string }) {
  return scope.own(
    transactions,
    gte(transactions.occurredOn, period.from),
    lte(transactions.occurredOn, period.to),
  );
}

function shareOf(amount: string, total: string): number {
  if (isZero(total)) return 0;
  return toDecimal(amount).abs().div(toDecimal(total).abs()).toDecimalPlaces(6).toNumber();
}

/* ──────────────────────────── по категориям ─────────────────────────────── */

export async function categoryReport(
  db: Db,
  scope: Scope,
  query: CategoryReportQuery,
): Promise<CategoryReport> {
  const base = await resolveBase(db, scope.ownerId, query.baseCurrency);
  const amount = inReportCurrency(base);

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryKey: categories.defaultKey,
      amount: sql<string>`round(sum(${amount}), 18)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(periodFilter(scope, query), eq(transactions.kind, query.kind)))
    .groupBy(transactions.categoryId, categories.defaultKey)
    .orderBy(sql`abs(sum(${amount})) desc`);

  // Знак уводится здесь: расходы хранятся отрицательными, но отчёт о
  // расходах с минусом перед каждым числом читается как ошибка.
  const totals = rows.map((row) => ({ ...row, amount: abs(row.amount) }));
  const total = sumMoney(totals.map((row) => row.amount));

  return {
    baseCurrency: base,
    kind: query.kind,
    total,
    categories: totals.map((row) => ({
      categoryId: row.categoryId,
      categoryKey: row.categoryKey,
      amount: row.amount,
      share: shareOf(row.amount, total),
    })),
  };
}

/* ────────────────────────────── кэшфлоу ─────────────────────────────────── */

export async function cashflowReport(
  db: Db,
  scope: Scope,
  period: ReportPeriod,
): Promise<CashflowReport> {
  const base = await resolveBase(db, scope.ownerId, period.baseCurrency);
  const amount = inReportCurrency(base);

  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${transactions.occurredOn}), 'YYYY-MM-DD')`,
      income: sql<string>`round(coalesce(sum(${amount}) filter (where ${transactions.kind} = 'income'), 0), 18)`,
      expense: sql<string>`round(coalesce(sum(${amount}) filter (where ${transactions.kind} = 'expense'), 0), 18)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(periodFilter(scope, period))
    // Переводы в кэшфлоу не входят: деньги не пришли и не ушли, они
    // переложены из кармана в карман, и учитывать их значит удвоить оборот.
    .groupBy(sql`date_trunc('month', ${transactions.occurredOn})`)
    .orderBy(sql`date_trunc('month', ${transactions.occurredOn})`);

  return {
    baseCurrency: base,
    points: rows.map((row) => ({
      month: row.month,
      income: row.income,
      expense: abs(row.expense),
      net: add(row.income, row.expense),
    })),
  };
}

/* ─────────────────────────────── сводка ─────────────────────────────────── */

const TOP_CATEGORIES = 5;
const LARGEST = 5;

export async function summaryReport(
  db: Db,
  scope: Scope,
  period: ReportPeriod,
): Promise<ReportSummary> {
  const base = await resolveBase(db, scope.ownerId, period.baseCurrency);
  const amount = inReportCurrency(base);

  const [totals] = await db
    .select({
      income: sql<string>`round(coalesce(sum(${amount}) filter (where ${transactions.kind} = 'income'), 0), 18)`,
      expense: sql<string>`round(coalesce(sum(${amount}) filter (where ${transactions.kind} = 'expense'), 0), 18)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(periodFilter(scope, period));

  const expenses = await categoryReport(db, scope, { ...period, kind: 'expense' });

  const largest = await db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      accountName: accounts.name,
      categoryKey: categories.defaultKey,
      note: transactions.note,
      kind: transactions.kind,
      amount: sql<string>`round(abs(${amount}), 18)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(periodFilter(scope, period), sql`${transactions.kind} <> 'transfer'`))
    .orderBy(sql`abs(${amount}) desc`)
    .limit(LARGEST);

  const byCurrencyRows = await db
    .select({
      currencyCode: accounts.currencyCode,
      amount: sql<string>`round(coalesce(sum(abs(${amount})) filter (where ${transactions.kind} = 'expense'), 0), 18)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(periodFilter(scope, period))
    .groupBy(accounts.currencyCode)
    .orderBy(
      sql`coalesce(sum(abs(${amount})) filter (where ${transactions.kind} = 'expense'), 0) desc`,
    );

  const currencyTotal = sumMoney(byCurrencyRows.map((row) => row.amount));

  return {
    baseCurrency: base,
    from: period.from,
    to: period.to,
    income: totals?.income ?? '0',
    expense: abs(totals?.expense ?? '0'),
    net: add(totals?.income ?? '0', totals?.expense ?? '0'),
    count: totals?.count ?? 0,
    topExpenseCategories: expenses.categories.slice(0, TOP_CATEGORIES),
    largest: largest.map((row) => ({
      id: row.id,
      occurredOn: row.occurredOn,
      accountName: row.accountName,
      categoryKey: row.categoryKey,
      note: row.note,
      amount: row.amount,
      kind: row.kind as 'income' | 'expense',
    })),
    byCurrency: byCurrencyRows
      .filter((row) => !isZero(row.amount))
      .map((row) => ({
        currencyCode: row.currencyCode,
        amount: row.amount,
        share: shareOf(row.amount, currencyTotal),
      })),
  };
}

/* ───────────────────────────── экспорт CSV ──────────────────────────────── */

/**
 * Одно поле CSV.
 *
 * Кавычки удваиваются, а поле берётся в кавычки, как только в нём есть
 * запятая, кавычка или перевод строки: примечание «Кафе, обед» иначе
 * разъезжается на две колонки. Поле, начинающееся с =, +, - или @,
 * получает апостроф — Excel и Sheets считают такое формулой, и выгрузка
 * чужих данных становится способом исполнить чужую команду.
 */
function csvField(value: string | null): string {
  const text = value ?? '';
  // Отрицательная сумма начинается с минуса и формулой не является:
  // апостроф перед ней испортил бы колонку чисел ради защиты от того,
  // чего в этой колонке не бывает.
  const looksNumeric = /^-?\d+(\.\d+)?$/.test(text);
  const safe = !looksNumeric && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const CSV_HEADER = [
  'date',
  'kind',
  'account',
  'account_currency',
  'category',
  'amount_account',
  'amount_original',
  'currency_original',
  'fx_rate',
  'note',
];

/**
 * Выгрузка операций за период (§8.9).
 *
 * Единственное место, где подпись категории собирается на сервере: файл
 * уезжает человеку готовым, и перевести ключ в нём уже некому. Остальные
 * ответы отдают ключ и переводятся на клиенте.
 */
export async function exportCsv(
  db: Db,
  scope: Scope,
  period: ReportPeriod,
  locale: Locale,
): Promise<string> {
  const rows = await db
    .select({
      occurredOn: transactions.occurredOn,
      kind: transactions.kind,
      accountName: accounts.name,
      accountCurrency: accounts.currencyCode,
      categoryKey: categories.defaultKey,
      amountAccount: transactions.amountAccount,
      amountOriginal: transactions.amountOriginal,
      currencyOriginal: transactions.currencyOriginal,
      fxRate: transactions.fxRate,
      note: transactions.note,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(periodFilter(scope, period))
    .orderBy(transactions.occurredOn, transactions.createdAt);

  const lines = [CSV_HEADER.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.occurredOn,
        row.kind,
        row.accountName,
        row.accountCurrency,
        categoryNameOrNull(locale, row.categoryKey),
        row.amountAccount,
        row.amountOriginal,
        row.currencyOriginal,
        row.fxRate,
        row.note,
      ]
        .map((value) => csvField(value === null ? null : String(value)))
        .join(','),
    );
  }

  // CRLF и BOM: без них Excel на русской локали открывает файл одной
  // колонкой и ломает кириллицу. BOM записан escape-последовательностью:
  // сам символ линтер считает нестандартным пробелом в исходнике.
  return `\ufeff${lines.join('\r\n')}\r\n`;
}
