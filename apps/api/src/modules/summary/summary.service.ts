import {
  convert as convertMoney,
  isZero,
  PIVOT_CURRENCY,
  sum as sumMoney,
  toDecimal,
  todayUtc,
  type AccountBucket,
  type CurrencyBucket,
  type MoneyString,
  type NetWorthBreakdown,
  type NetWorthResponse,
  type SummaryResponse,
} from '@moneymap/shared';
import { and, asc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { accounts, currencies, netWorthSnapshots, transactions, users } from '../../db/schema.ts';
import { notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';
import { getRatesTo } from '../rates/rate.service.ts';

interface AccountBalance {
  id: string;
  name: string;
  currencyCode: string;
  balance: MoneyString;
}

/**
 * Остатки счетов на дату.
 *
 * Отдельный запрос, а не `listAccounts`: тому дата не нужна, а снимку net
 * worth (§8.6) — нужна, и считать его из «сегодня» минус операции значило бы
 * повторить ту же арифметику ещё раз, но хуже.
 *
 * Архивные счета не участвуют: архив — это «счёта больше нет», и его остаток
 * в сводном балансе показывал бы деньги, которых нет (§8.2).
 */
async function balancesAsOf(db: Db, scope: Scope, asOf: string): Promise<AccountBalance[]> {
  const movement = sql`coalesce((
    select sum(${transactions.amountAccount})
    from ${transactions}
    where ${transactions.accountId} = ${accounts.id}
      and ${transactions.deletedAt} is null
      and ${transactions.occurredOn} <= ${asOf}
  ), 0)`;

  // Фрагмент обязан попасть в запрос вложенным в другой `sql`: иначе Drizzle
  // печатает колонки без имени таблицы, и коррелированный подзапрос тихо
  // превращается в сравнение transactions с самим собой (см. account.service).
  const balance = sql<string>`(${accounts.openingBalance} + (${movement}))`;

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      currencyCode: accounts.currencyCode,
      balance: balance.as('balance'),
    })
    .from(accounts)
    .where(
      scope.own(
        accounts,
        eq(accounts.isArchived, false),
        // Счёта, который ещё не открыт, в этот день просто не было:
        // иначе график рисует деньги до того, как они появились.
        lte(accounts.openedOn, asOf),
      ),
    )
    .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt));

  return rows;
}

interface Base {
  code: string;
  decimals: number;
}

/**
 * Валюта отображения: запрошенная, иначе базовая валюта пользователя (§8.6).
 *
 * Разрядность берётся из справочника, потому что от неё зависит округление
 * итога: в иенах копеек нет, а в биткоине их восемь.
 */
async function resolveBase(db: Db, userId: string, requested?: string): Promise<Base> {
  const [user] = await db
    .select({ baseCurrency: users.baseCurrency })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw notFound('errors.userNotFound');

  const code = requested ?? user.baseCurrency ?? PIVOT_CURRENCY;
  const [currency] = await db
    .select({ code: currencies.code, decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, code))
    .limit(1);

  return currency ?? { code, decimals: 2 };
}

/**
 * Доля считается от суммы остатков по модулю.
 *
 * Иначе кредитка с долгом уменьшала бы знаменатель, и доли счетов перестали
 * бы складываться в единицу — а в худшем случае знаменатель обнулялся бы
 * вовсе: 1000 на карте и −1000 долга дают нулевой итог при ненулевых долях.
 */
function shareOf(amount: MoneyString, denominator: MoneyString): number {
  if (isZero(denominator)) return 0;
  return toDecimal(amount).abs().div(toDecimal(denominator)).toDecimalPlaces(6).toNumber();
}

export interface Summary {
  summary: SummaryResponse;
  /** Та же разбивка в том виде, в котором её хранит снимок (§8.6). */
  breakdown: NetWorthBreakdown;
}

/**
 * Сводный баланс в базовой валюте (§8.6).
 *
 * Валюты без курса не подставляются нулём и не роняют ответ: их остатки
 * не входят в итог, а коды уезжают в `missing`. Показать неполный итог как
 * полный — хуже, чем сказать, что одна валюта не посчитана.
 */
export async function getSummary(
  db: Db,
  scope: Scope,
  requestedBase?: string,
  asOf: string = todayUtc(),
): Promise<Summary> {
  const base = await resolveBase(db, scope.ownerId, requestedBase);
  const balances = await balancesAsOf(db, scope, asOf);

  const codes = [...new Set(balances.map((row) => row.currencyCode))];
  const rates = await getRatesTo(db, codes, base.code, asOf);

  const stale = new Set<string>();
  const missing = new Set<string>();

  const converted = new Map<string, MoneyString>();
  for (const row of balances) {
    const rate = rates.get(row.currencyCode);
    if (!rate) {
      missing.add(row.currencyCode);
      continue;
    }
    if (rate.stale) stale.add(row.currencyCode);
    converted.set(row.id, convertMoney(row.balance, rate.rate, base.decimals));
  }

  const counted = balances.filter((row) => converted.has(row.id));
  const total = sumMoney(counted.map((row) => converted.get(row.id) as MoneyString));
  const denominator = sumMoney(
    counted.map((row) => {
      const value = converted.get(row.id) as MoneyString;
      return value.startsWith('-') ? value.slice(1) : value;
    }),
  );

  const byAccount: AccountBucket[] = counted.map((row) => {
    const balanceBase = converted.get(row.id) as MoneyString;
    return {
      accountId: row.id,
      accountName: row.name,
      currencyCode: row.currencyCode,
      balance: row.balance,
      balanceBase,
      share: shareOf(balanceBase, denominator),
    };
  });

  const byCurrency: CurrencyBucket[] = codes
    .filter((code) => !missing.has(code))
    .map((code) => {
      const rows = counted.filter((row) => row.currencyCode === code);
      const totalBase = sumMoney(rows.map((row) => converted.get(row.id) as MoneyString));
      return {
        currencyCode: code,
        total: sumMoney(rows.map((row) => row.balance)),
        totalBase,
        share: shareOf(totalBase, denominator),
      };
    })
    .sort((a, b) => b.share - a.share);

  return {
    summary: {
      baseCurrency: base.code,
      total,
      byCurrency,
      byAccount: [...byAccount].sort((a, b) => b.share - a.share),
      stale: [...stale].sort(),
      missing: [...missing].sort(),
      asOf,
    },
    breakdown: {
      accounts: byAccount.map((row) => ({
        accountId: row.accountId,
        currencyCode: row.currencyCode,
        balance: row.balance,
        balanceBase: row.balanceBase,
      })),
      rates: Object.fromEntries([...rates].map(([code, info]) => [code, info.rate])),
    },
  };
}

/* ──────────────────────────── график net worth ──────────────────────────── */

/**
 * График строится по снимкам (§8.6).
 *
 * Снимок хранит итог в той валюте, что была базовой на тот день, поэтому
 * точка пересчитывается в запрошенную валюту курсом своей даты: иначе смена
 * базовой валюты переписала бы всю историю графика задним числом.
 *
 * Пересчёт идёт в SQL — ради одного запроса вместо запроса курсов на каждую
 * точку. Деление дало бы numeric с десятками знаков, поэтому round до
 * разрядности валюты стоит здесь же, иначе значение не пройдёт проверку
 * денежной строки на выходе.
 */
export async function getNetWorth(
  db: Db,
  scope: Scope,
  query: { baseCurrency?: string; from?: string; to?: string },
): Promise<NetWorthResponse> {
  const base = await resolveBase(db, scope.ownerId, query.baseCurrency);

  // Три варианта по убыванию точности, как и в rate.service: курс не позже
  // даты снимка, иначе самый ранний известный, иначе единица. Последняя —
  // не догадка: до неё доходит только снимок в той же валюте, что и
  // запрошенная, где курс и равен единице.
  const rateAt = (quote: unknown) => sql`coalesce(
    (
      select r.rate from exchange_rates r
      where r.base = ${PIVOT_CURRENCY} and r.quote = ${quote}
        and r.date <= ${netWorthSnapshots.date}
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

  const total = sql<string>`round(
    ${netWorthSnapshots.totalAmount} * (${rateAt(base.code)}) / (${rateAt(netWorthSnapshots.baseCurrency)}),
    ${base.decimals}
  )`;

  const rows = await db
    .select({ date: netWorthSnapshots.date, total: total.as('total') })
    .from(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.userId, scope.ownerId),
        query.from ? gte(netWorthSnapshots.date, query.from) : undefined,
        query.to ? lte(netWorthSnapshots.date, query.to) : undefined,
      ),
    )
    .orderBy(asc(netWorthSnapshots.date));

  /*
   * Сегодняшняя точка считается заново, а не берётся из снимка.
   *
   * Снимок за сегодня пишет ночная задача (§8.6), и до следующего её прогона
   * он остаётся таким, каким был записан. Из-за этого последняя точка графика
   * не двигалась в течение дня и расходилась с крупным числом над ним — оно-то
   * всегда считается по текущим остаткам. Две цифры об одном и том же,
   * отличающиеся друг от друга, — это не задержка данных, а ошибка.
   *
   * Снимок при этом не переписывается: чтение не должно писать. Ночная задача
   * запишет итог дня сама, а до тех пор точка живёт только в ответе.
   */
  const today = todayUtc();
  const withinRange = (!query.from || query.from <= today) && (!query.to || today <= query.to);

  if (!withinRange) return { baseCurrency: base.code, points: rows };

  const { summary } = await getSummary(db, scope, base.code, today);
  const points = rows.filter((row) => row.date !== today);
  points.push({ date: today, total: summary.total });

  return { baseCurrency: base.code, points };
}

/**
 * Снимок на дату (§8.6). Сегодняшний переписывается — в течение дня итог
 * ещё меняется с каждой операцией; прошлые остаются как были.
 */
export async function saveSnapshot(
  db: Db,
  scope: Scope,
  asOf: string = todayUtc(),
): Promise<Summary> {
  const result = await getSummary(db, scope, undefined, asOf);

  await db
    .insert(netWorthSnapshots)
    .values({
      userId: scope.ownerId,
      date: asOf,
      baseCurrency: result.summary.baseCurrency,
      totalAmount: result.summary.total,
      breakdown: result.breakdown,
    })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.date],
      set: {
        baseCurrency: sql`excluded.base_currency`,
        totalAmount: sql`excluded.total_amount`,
        breakdown: sql`excluded.breakdown`,
        createdAt: sql`now()`,
      },
    });

  return result;
}

/** Пользователи, которым имеет смысл считать снимок: прошедшие первичную настройку. */
export async function usersForSnapshots(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.onboardedAt))
    .orderBy(asc(users.createdAt));
  return rows.map((row) => row.id);
}
