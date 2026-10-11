import {
  invertRate,
  parseRate,
  PIVOT_CURRENCY,
  todayUtc,
  type MoneyString,
} from '@moneymap/shared';
import { env } from '../../lib/env.ts';

/**
 * Источники курсов (§8.5).
 *
 * Спека называла ECB — он не подошёл: в его наборе 29 валют и среди них нет
 * ни белорусского рубля, ни гривны, ни тенге, ни лари, то есть ровно тех,
 * ради которых приложение и мультивалютное. exchangerate.host, второй вариант
 * оттуда же, с тех пор закрылся за ключ.
 *
 * Поэтому фиат берётся из @fawazahmed0/currency-api — он раздаётся с CDN
 * статикой, без ключей и лимитов, покрывает все наши валюты и умеет
 * исторические даты. Крипта — из CoinGecko, как и просила спека: там же
 * лежит Toncoin, которого в первом источнике нет вовсе.
 *
 * Провайдеры опрашиваются по порядку, и каждому достаются только те валюты,
 * которых ещё нет. Так падение одного источника стоит ровно своих валют,
 * а не всей загрузки.
 */

/** Курсы к опорной валюте: код → сколько его единиц в одной единице PIVOT. */
export interface FetchedRates {
  /** Дата, которой источник датирует эти курсы, а не та, которую мы просили. */
  date: string;
  rates: Map<string, MoneyString>;
}

export interface RateProvider {
  readonly name: string;
  /**
   * Курсы для запрошенных кодов. Возвращает только то, что знает: пропуски
   * достанутся следующему провайдеру, а затем фолбэку на последний курс.
   */
  fetchRates(codes: readonly string[], on: string): Promise<FetchedRates>;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(env.RATES_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${url} → HTTP ${response.status}`);
  }
  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/* ───────────────────────── фиат: currency-api ───────────────────────────── */

const PIVOT_LOWER = PIVOT_CURRENCY.toLowerCase();

/**
 * Два хоста одного и того же набора данных. jsDelivr иногда отдаёт 404 на
 * свежую версию, пока не прогрелся кеш, — тогда выручает вторая ссылка,
 * которую сам источник и предлагает как резервную.
 */
const CURRENCY_API_URLS: ((version: string) => string)[] = [
  (version) =>
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${version}/v1/currencies/${PIVOT_LOWER}.json`,
  (version) => `https://${version}.currency-api.pages.dev/v1/currencies/${PIVOT_LOWER}.json`,
];

export const currencyApiProvider: RateProvider = {
  name: 'currency-api',

  async fetchRates(codes, on) {
    // 'latest' вместо даты: у источника запись за сегодня появляется днём,
    // и запрос по дате до этого момента — гарантированный 404.
    const version = on === todayUtc() ? 'latest' : on;

    let lastError: unknown;
    for (const url of CURRENCY_API_URLS) {
      try {
        const payload = asRecord(await getJson(url(version)));
        const table = asRecord(payload?.[PIVOT_LOWER]);
        if (!payload || !table) throw new Error('неожидаемая форма ответа');

        const rates = new Map<string, MoneyString>();
        for (const code of codes) {
          const rate = parseRate(table[code.toLowerCase()]);
          if (rate) rates.set(code, rate);
        }
        const date = typeof payload.date === 'string' ? payload.date : on;
        return { date, rates };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('currency-api недоступен');
  },
};

/* ────────────────────────── крипта: CoinGecko ───────────────────────────── */

/**
 * Тикер → идентификатор монеты в CoinGecko. Карта ручная и обязана быть
 * ручной: «TON» у них the-open-network, а поиск по тикеру выдаёт ещё три
 * монеты с тем же обозначением, и ошибка здесь стоила бы неверного курса.
 */
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  SOL: 'solana',
  TON: 'the-open-network',
  BNB: 'binancecoin',
  XMR: 'monero',
};

export const coinGeckoProvider: RateProvider = {
  name: 'coingecko',

  async fetchRates(codes, on) {
    const wanted = codes
      .map((code) => ({ code, id: COINGECKO_IDS[code] }))
      .filter((entry): entry is { code: string; id: string } => Boolean(entry.id));
    if (wanted.length === 0) return { date: on, rates: new Map() };

    const rates = new Map<string, MoneyString>();

    if (on === todayUtc()) {
      const ids = wanted.map((entry) => entry.id).join(',');
      const payload = asRecord(
        await getJson(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${PIVOT_LOWER}`,
        ),
      );
      for (const { code, id } of wanted) {
        // CoinGecko отдаёт цену монеты в евро, а в таблице лежит обратное —
        // сколько монеты в одном евро. Без инверсии курс был бы в тысячи раз
        // не тот, и заметно это стало бы только на сводном балансе.
        const price = parseRate(asRecord(payload?.[id])?.[PIVOT_LOWER]);
        if (price) rates.set(code, invertRate(price));
      }
      return { date: on, rates };
    }

    // История стоит одного запроса на монету, поэтому и спрашивается только
    // за те монеты, которых не нашлось в первом источнике.
    const [year, month, day] = on.split('-');
    for (const { code, id } of wanted) {
      try {
        const payload = asRecord(
          await getJson(
            `https://api.coingecko.com/api/v3/coins/${id}/history?date=${day}-${month}-${year}&localization=false`,
          ),
        );
        const marketData = asRecord(asRecord(payload?.market_data)?.current_price);
        const price = parseRate(marketData?.[PIVOT_LOWER]);
        if (price) rates.set(code, invertRate(price));
      } catch {
        // Одна монета без курса — не повод терять остальные: пропуск закроет
        // фолбэк на последний известный курс.
      }
    }
    return { date: on, rates };
  },
};

/** Порядок важен: фиат первым, он же покрывает большую часть крипты. */
export const rateProviders: RateProvider[] = [currencyApiProvider, coinGeckoProvider];
