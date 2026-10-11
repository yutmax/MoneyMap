import { z } from 'zod';
import { currencyCodeSchema, isoDateSchema } from './common.ts';

/**
 * Отчёты (§8.9).
 *
 * Все суммы пересчитаны в одну валюту — иначе их нельзя складывать.
 * Пересчёт идёт по курсу на дату операции, а не на сегодня: расход в злотых
 * прошлой весной стоил столько, сколько стоил тогда, и переоценивать его
 * сегодняшним курсом значит менять историю.
 */

export const reportPeriodSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  /** Валюта отчёта. По умолчанию базовая валюта пользователя. */
  baseCurrency: currencyCodeSchema.optional(),
});

export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export interface CategoryTotal {
  categoryId: string | null;
  categoryName: string | null;
  amount: string;
  /** Доля от суммы всех категорий, 0..1. */
  share: number;
}

export interface CurrencyTotal {
  currencyCode: string;
  /** В валюте отчёта. */
  amount: string;
  share: number;
}

export interface LargestTransaction {
  id: string;
  occurredOn: string;
  accountName: string;
  categoryName: string | null;
  note: string | null;
  /** В валюте отчёта, по модулю. */
  amount: string;
  kind: 'income' | 'expense';
}

export interface ReportSummary {
  baseCurrency: string;
  from: string;
  to: string;
  income: string;
  expense: string;
  /** Доходы минус расходы. Отрицательное — потратили больше, чем получили. */
  net: string;
  /** Сколько операций вошло в отчёт. */
  count: number;
  topExpenseCategories: CategoryTotal[];
  largest: LargestTransaction[];
  byCurrency: CurrencyTotal[];
}

export interface CategoryReport {
  baseCurrency: string;
  kind: 'income' | 'expense';
  total: string;
  categories: CategoryTotal[];
}

export interface CashflowPoint {
  /** Начало месяца, 'ГГГГ-ММ-01'. */
  month: string;
  income: string;
  expense: string;
  net: string;
}

export interface CashflowReport {
  baseCurrency: string;
  points: CashflowPoint[];
}

export const categoryReportQuerySchema = reportPeriodSchema.extend({
  kind: z.enum(['income', 'expense']).default('expense'),
});

export type CategoryReportQuery = z.infer<typeof categoryReportQuerySchema>;
