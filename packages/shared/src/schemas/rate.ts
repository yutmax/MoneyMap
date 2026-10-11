import { z } from 'zod';
import { currencyCodeSchema, isoDateSchema, positiveMoneySchema } from './common.ts';

/**
 * Опорная валюта таблицы курсов (§8.5).
 *
 * Курсы хранятся только относительно неё, а кросс-курс A→B выводится
 * делением: (PIVOT→B) / (PIVOT→A). Полная матрица из трёхсот валют стоила бы
 * сто тысяч строк в день вместо трёхсот — ради значений, которые полностью
 * восстанавливаются из этих трёхсот.
 *
 * Евро, а не доллар, потому что бесплатные источники отдают курсы именно
 * к евро: любой другой выбор добавил бы лишнее деление на каждую запись
 * и накопленную ошибку округления там, где её можно не иметь.
 */
export const PIVOT_CURRENCY = 'EUR';

/** Курс одной валюты к другой на конкретную дату. */
export interface RateInfo {
  base: string;
  quote: string;
  /**
   * Дата курса. Может оказаться раньше запрошенной: при недоступности
   * источника берётся последний известный курс (§8.5).
   */
  date: string;
  rate: string;
  /** Откуда взят курс — чтобы расхождение можно было объяснить. */
  source: string;
  /** true, когда курс не на запрошенную дату, а подставлен фолбэком. */
  stale: boolean;
}

export const convertQuerySchema = z.object({
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  amount: positiveMoneySchema,
  /** Дата курса. По умолчанию — сегодня. */
  on: isoDateSchema.optional(),
});

export interface ConvertResponse extends RateInfo {
  amount: string;
  converted: string;
}

export const ratesQuerySchema = z.object({
  base: currencyCodeSchema.optional(),
  on: isoDateSchema.optional(),
});

export interface RatesResponse {
  base: string;
  date: string;
  /** Код валюты → сколько её единиц в одной единице base. */
  rates: Record<string, string>;
  /** Валюты, у которых курс старше запрошенной даты. */
  stale: string[];
}

export type ConvertQuery = z.infer<typeof convertQuerySchema>;
export type RatesQuery = z.infer<typeof ratesQuerySchema>;
