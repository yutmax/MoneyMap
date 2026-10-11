import { z } from 'zod';
import { currencyCodeSchema, isoDateSchema } from './common.ts';

export const summaryQuerySchema = z.object({
  /**
   * Валюта отображения. По умолчанию базовая валюта пользователя.
   *
   * Переключение не меняет данные (§8.6): счета остаются в своих валютах,
   * пересчитывается только итог.
   */
  baseCurrency: currencyCodeSchema.optional(),
});

/** Сколько всего лежит в одной валюте и какая это доля от итога. */
export interface CurrencyBucket {
  currencyCode: string;
  total: string;
  totalBase: string;
  /** Доля от итога, 0..1. */
  share: number;
}

export interface AccountBucket {
  accountId: string;
  accountName: string;
  currencyCode: string;
  balance: string;
  balanceBase: string;
  share: number;
}

export interface SummaryResponse {
  baseCurrency: string;
  /** Сводный баланс всех счетов, пересчитанный в baseCurrency. */
  total: string;
  byCurrency: CurrencyBucket[];
  byAccount: AccountBucket[];
  /**
   * Валюты, по которым курс оказался не на сегодня.
   * Итог посчитан, но интерфейс обязан сказать, что он приблизительный.
   */
  stale: string[];
  /**
   * Валюты, курса которых нет вовсе. Их остатки в total не вошли —
   * умолчать об этом значило бы показать неверный итог как верный.
   */
  missing: string[];
  asOf: string;
}

export const netWorthQuerySchema = z.object({
  baseCurrency: currencyCodeSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export interface NetWorthPoint {
  date: string;
  total: string;
}

export interface NetWorthResponse {
  baseCurrency: string;
  points: NetWorthPoint[];
}

/**
 * Разбивка, которую хранит снимок (§8.6).
 *
 * Вместе с суммой сохраняются курсы: иначе точку на графике нельзя
 * объяснить задним числом, а курс к тому времени уже другой.
 */
export interface NetWorthBreakdown {
  accounts: {
    accountId: string;
    currencyCode: string;
    balance: string;
    balanceBase: string;
  }[];
  /** Код валюты → курс к базовой, которым считали. */
  rates: Record<string, string>;
}

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type NetWorthQuery = z.infer<typeof netWorthQuerySchema>;
