import { z } from 'zod';
import { currencyCodeSchema, isoDateSchema, moneySchema, uuidSchema } from './common.ts';

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

/* ─────────────────────────────── бюджеты ───────────────────────────────── */

/** Состояние бюджета. Цвет — не единственный признак: рядом всегда подпись. */
export const BUDGET_STATUSES = ['ok', 'warning', 'over'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const budgetsQuerySchema = z.object({
  /** Месяц 'ГГГГ-ММ'. По умолчанию текущий у пользователя. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export const setBudgetsSchema = z.object({
  budgets: z
    .array(
      z.object({
        categoryId: uuidSchema,
        /** Ноль означает «лимита нет» и убирает бюджет. */
        amount: moneySchema,
        rollover: z.boolean().optional(),
      }),
    )
    .max(200),
});

export type SetBudgetsInput = z.infer<typeof setBudgetsSchema>;

export interface BudgetRow {
  categoryId: string;
  categoryName: string;
  /** Лимит, как его задал человек. */
  amount: string;
  /** Перенесённый остаток прошлого месяца. '0', если перенос выключен. */
  carried: string;
  /** Сколько можно потратить в этом месяце: лимит плюс перенос. */
  limit: string;
  spent: string;
  remaining: string;
  rollover: boolean;
  /** Потрачено от лимита, 0..n. Больше единицы — перерасход. */
  share: number;
  status: BudgetStatus;
}

/* ───────────────────────────── импорт CSV ─────────────────────────────── */

/** Какая колонка файла за что отвечает. null — колонки нет. */
export interface ImportMapping {
  date: number;
  amount: number;
  note: number | null;
  category: number | null;
}

export interface ImportPreview {
  delimiter: string;
  columns: string[];
  /** Первые строки файла — чтобы человек увидел, что разобралось. */
  rows: string[][];
  total: number;
  /** Догадка по заголовкам. Решение всё равно за человеком. */
  suggested: {
    date: number | null;
    amount: number | null;
    note: number | null;
    category: number | null;
  };
}

export interface ImportResult {
  imported: number;
  /** Строки, уже бывшие в базе: повторный импорт того же файла. */
  duplicates: number;
  /** Номера строк файла, которые не разобрались. */
  failed: number[];
}

/** Файл приходит текстом: читает его браузер, а не сервер из формы. */
export const importPreviewSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
});

export const importRunSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
  accountId: uuidSchema,
  delimiter: z.string().min(1).max(1).optional(),
  mapping: z.object({
    date: z.number().int().min(0),
    amount: z.number().int().min(0),
    note: z.number().int().min(0).nullable(),
    category: z.number().int().min(0).nullable(),
  }),
});

export type ImportRunInput = z.infer<typeof importRunSchema>;
