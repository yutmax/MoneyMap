import {
  convert as convertMoney,
  divide,
  PIVOT_CURRENCY,
  todayUtc,
  type ConvertResponse,
  type MoneyString,
  type RateInfo,
  type RatesResponse,
} from '@moneymap/shared';
import { and, asc, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/index.ts';
import { currencies, exchangeRates } from '../../db/schema.ts';
import { rateUnavailable } from '../../lib/errors.ts';
import { rateProviders } from './rate.providers.ts';

/** Курс к опорной валюте вместе с датой, на которую он реально известен. */
interface PivotRate {
  rate: MoneyString;
  date: string;
  source: string;
}

/** Опорная валюта сама к себе — единица на любую дату, в таблице её нет. */
function identity(date: string): PivotRate {
  return { rate: '1', date, source: 'pivot' };
}

/**
 * Ближайший курс каждой валюты, по одному на валюту.
 *
 * `distinct on` вместо запроса на каждую валюту: фолбэк (§8.5) — это
 * «ближайшая строка к дате», и получить её сразу для всех валют умеет сама БД.
 */
async function nearestPivotRates(
  db: DbExecutor,
  codes: readonly string[],
  on: string,
  direction: 'before' | 'after',
): Promise<Map<string, PivotRate>> {
  const rows = await db
    .selectDistinctOn([exchangeRates.quote], {
      quote: exchangeRates.quote,
      rate: exchangeRates.rate,
      date: exchangeRates.date,
      source: exchangeRates.source,
    })
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.base, PIVOT_CURRENCY),
        inArray(exchangeRates.quote, [...codes]),
        direction === 'before' ? lte(exchangeRates.date, on) : gt(exchangeRates.date, on),
      ),
    )
    .orderBy(
      asc(exchangeRates.quote),
      direction === 'before' ? desc(exchangeRates.date) : asc(exchangeRates.date),
    );

  return new Map(
    rows.map((row) => [row.quote, { rate: row.rate, date: row.date, source: row.source }]),
  );
}

/**
 * Курсы к опорной валюте на дату (§8.5).
 *
 * Сначала последний курс не позже даты — это обычный фолбэк на вчерашний,
 * когда сегодняшний ещё не загружен.
 *
 * Если и его нет, берётся самый ранний курс ПОСЛЕ даты. Выглядит странно,
 * но альтернатива хуже: история курсов начинается с дня, когда приложение
 * установили, и операция месячной давности в чужой валюте иначе не
 * пересчитывалась бы вовсе. Спека требует обратного — отсутствие курса
 * не должно блокировать работу. Такой курс всегда помечен `stale`, и его
 * дата видна клиенту.
 */
async function pivotRatesFor(
  db: DbExecutor,
  codes: readonly string[],
  on: string,
): Promise<Map<string, PivotRate>> {
  const result = new Map<string, PivotRate>();

  const wanted = codes.filter((code) => code !== PIVOT_CURRENCY);
  if (codes.includes(PIVOT_CURRENCY)) result.set(PIVOT_CURRENCY, identity(on));
  if (wanted.length === 0) return result;

  for (const [code, rate] of await nearestPivotRates(db, wanted, on, 'before')) {
    result.set(code, rate);
  }

  const missing = wanted.filter((code) => !result.has(code));
  if (missing.length > 0) {
    for (const [code, rate] of await nearestPivotRates(db, missing, on, 'after')) {
      result.set(code, rate);
    }
  }

  return result;
}

/**
 * Кросс-курс from→to.
 *
 * Считается делением двух курсов к опорной валюте: только они и лежат
 * в таблице (§8.5). Дата результата — более старая из двух: курс пары
 * не бывает свежее своей несвежей половины.
 */
function cross(
  from: PivotRate,
  to: PivotRate,
  requested: string,
): Omit<RateInfo, 'base' | 'quote'> {
  const date = from.date < to.date ? from.date : to.date;
  return {
    date,
    rate: divide(to.rate, from.rate),
    source: from.source === to.source ? from.source : `${from.source}+${to.source}`,
    stale: date !== requested,
  };
}

export async function getRate(
  db: DbExecutor,
  from: string,
  to: string,
  on: string = todayUtc(),
): Promise<RateInfo> {
  if (from === to) {
    return { base: from, quote: to, date: on, rate: '1', source: 'identity', stale: false };
  }

  const rates = await pivotRatesFor(db, [from, to], on);
  const fromRate = rates.get(from);
  const toRate = rates.get(to);
  if (!fromRate || !toRate) throw rateUnavailable();

  return { base: from, quote: to, ...cross(fromRate, toRate, on) };
}

/** Курсы валют к одной базовой — то, из чего считается сводный баланс (§8.6). */
export async function getRatesTo(
  db: DbExecutor,
  codes: readonly string[],
  base: string,
  on: string = todayUtc(),
): Promise<Map<string, RateInfo>> {
  const unique = [...new Set([...codes, base])];
  const pivot = await pivotRatesFor(db, unique, on);
  const baseRate = pivot.get(base);

  const result = new Map<string, RateInfo>();
  // Без курса базовой валюты пересчитать нельзя ничего, кроме неё самой.
  if (!baseRate) return result;

  for (const code of unique) {
    if (code === base) {
      result.set(code, {
        base,
        quote: code,
        date: on,
        rate: '1',
        source: 'identity',
        stale: false,
      });
      continue;
    }
    const quoteRate = pivot.get(code);
    if (!quoteRate) continue;
    result.set(code, { base, quote: code, ...cross(quoteRate, baseRate, on) });
  }
  return result;
}

export async function convertAmount(
  db: Db,
  from: string,
  to: string,
  amount: MoneyString,
  on: string = todayUtc(),
): Promise<ConvertResponse> {
  const [target] = await db
    .select({ decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, to))
    .limit(1);
  if (!target) throw rateUnavailable();

  const rate = await getRate(db, from, to, on);
  return { ...rate, amount, converted: convertMoney(amount, rate.rate, target.decimals) };
}

async function activeCurrencyCodes(db: Db): Promise<string[]> {
  const rows = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.isActive, true));
  return rows.map((row) => row.code);
}

/** Курсы всего справочника к одной базовой — для подсказок на фронтенде. */
export async function listRates(
  db: Db,
  base: string | undefined,
  on: string = todayUtc(),
): Promise<RatesResponse> {
  const resolvedBase = base ?? PIVOT_CURRENCY;
  const rates = await getRatesTo(db, await activeCurrencyCodes(db), resolvedBase, on);

  const table: Record<string, string> = {};
  const stale: string[] = [];
  let date = on;
  for (const [code, info] of rates) {
    table[code] = info.rate;
    if (info.stale) {
      stale.push(code);
      // Дата набора — самая старая из использованных: назвать его свежим,
      // когда часть курсов вчерашняя, значит соврать об актуальности.
      if (info.date < date) date = info.date;
    }
  }

  return { base: resolvedBase, date, rates: table, stale: stale.sort() };
}

/* ───────────────────────────── загрузка ─────────────────────────────────── */

export interface RefreshResult {
  date: string;
  saved: number;
  /** Валюты, курс которых не отдал ни один источник. */
  missing: string[];
  /** Какой источник сколько дал — это первое, что смотрят в логе. */
  bySource: Record<string, number>;
}

/**
 * Загружает курсы на дату и складывает их в exchange_rates (§8.5).
 *
 * Источники опрашиваются по очереди, каждому достаются только ненайденные
 * валюты. Ошибка источника не прерывает загрузку: без свежего курса остаются
 * только его валюты, а их закрывает фолбэк на последний известный.
 */
export async function refreshRates(
  db: Db,
  on: string = todayUtc(),
  log?: { warn: (obj: unknown, msg: string) => void },
): Promise<RefreshResult> {
  const codes = (await activeCurrencyCodes(db)).filter((code) => code !== PIVOT_CURRENCY);

  const collected = new Map<string, { rate: MoneyString; source: string; date: string }>();
  const bySource: Record<string, number> = {};

  for (const provider of rateProviders) {
    const missing = codes.filter((code) => !collected.has(code));
    if (missing.length === 0) break;

    try {
      const fetched = await provider.fetchRates(missing, on);
      for (const [code, rate] of fetched.rates) {
        collected.set(code, { rate, source: provider.name, date: fetched.date });
      }
      bySource[provider.name] = fetched.rates.size;
    } catch (error) {
      bySource[provider.name] = 0;
      log?.warn({ err: error, provider: provider.name }, 'Источник курсов недоступен');
    }
  }

  const missing = codes.filter((code) => !collected.has(code));
  if (collected.size === 0) {
    return { date: on, saved: 0, missing, bySource };
  }

  const rows = [...collected].map(([quote, { rate, source, date }]) => ({
    base: PIVOT_CURRENCY,
    quote,
    // Дата от источника, а не запрошенная: иначе один и тот же набор курсов
    // лёг бы в базу дважды под разными датами.
    date,
    rate,
    source,
  }));

  // Сегодняшний курс в течение суток ещё уточняется, поэтому перезаписывается.
  // Прошлые даты — нет: отчёт за прошлый месяц обязан остаться тем же (§8.5).
  const insert = db.insert(exchangeRates).values(rows);
  await (on === todayUtc()
    ? insert.onConflictDoUpdate({
        target: [exchangeRates.base, exchangeRates.quote, exchangeRates.date],
        set: {
          rate: sql`excluded.rate`,
          source: sql`excluded.source`,
          fetchedAt: sql`now()`,
        },
      })
    : insert.onConflictDoNothing());

  return { date: on, saved: rows.length, missing, bySource };
}
