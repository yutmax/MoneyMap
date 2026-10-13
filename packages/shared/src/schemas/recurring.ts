import { z } from 'zod';
import { msg } from '../i18n/index.ts';
import { MONTH_END_POLICIES, RECURRENCE_FREQS } from '../lib/recurrence.ts';
import { currencyCodeSchema, isoDateSchema, positiveMoneySchema, uuidSchema } from './common.ts';
import { LIMITS } from './limits.ts';

const nameSchema = z
  .string()
  .trim()
  .min(1, { message: msg('validation.recurring.name') })
  .max(LIMITS.nameMax, { message: msg('validation.name.max', { count: LIMITS.nameMax }) });

export const recurrenceFreqSchema = z.enum(RECURRENCE_FREQS, {
  message: msg('validation.recurring.freq'),
});

export const monthEndPolicySchema = z.enum(MONTH_END_POLICIES);

/** Каждые N периодов. Верхняя граница — чтобы «каждые 10000 лет» не создавало правило-призрак. */
const intervalSchema = z.coerce.number().int().min(1).max(366).default(1);

const dayOfMonthSchema = z.coerce.number().int().min(1).max(31);
const weekdaySchema = z.coerce.number().int().min(0).max(6);

export const createRecurringRuleSchema = z
  .object({
    name: nameSchema,
    accountId: uuidSchema,
    categoryId: uuidSchema.nullable().optional(),
    kind: z.enum(['income', 'expense'], { message: msg('validation.transaction.kind') }),
    amount: positiveMoneySchema,
    /** Валюта суммы. По умолчанию — валюта счёта (§8.5). */
    currency: currencyCodeSchema.optional(),

    freq: recurrenceFreqSchema,
    interval: intervalSchema,
    /**
     * Для monthly и yearly. Если не задан, берётся число из даты начала:
     * правило «с 5 марта, ежемесячно» и так означает пятое число.
     */
    dayOfMonth: dayOfMonthSchema.nullable().optional(),
    /** Для weekly. Если не задан, берётся день недели даты начала. */
    weekday: weekdaySchema.nullable().optional(),
    monthEndPolicy: monthEndPolicySchema.default('clamp'),

    startOn: isoDateSchema,
    endOn: isoDateSchema.nullable().optional(),
    /** Создавать операцию сразу или спрашивать подтверждение (§8.7). */
    autoPost: z.boolean().default(true),
  })
  .refine((v) => !v.endOn || v.endOn >= v.startOn, {
    message: msg('validation.recurring.endBeforeStart'),
    path: ['endOn'],
  });

/**
 * Вид операции, счёт и дата начала не меняются.
 *
 * Все три уже отражены в созданных операциях: смена вида перевернула бы знак
 * у истории, смена счёта — её валюту, а смена начала сдвинула бы даты,
 * по которым списания уже произошли. Нужно другое — заводится другое правило.
 */
export const updateRecurringRuleSchema = z
  .object({
    name: nameSchema.optional(),
    categoryId: uuidSchema.nullable().optional(),
    amount: positiveMoneySchema.optional(),
    freq: recurrenceFreqSchema.optional(),
    interval: intervalSchema.optional(),
    dayOfMonth: dayOfMonthSchema.nullable().optional(),
    weekday: weekdaySchema.nullable().optional(),
    monthEndPolicy: monthEndPolicySchema.optional(),
    endOn: isoDateSchema.nullable().optional(),
    autoPost: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: msg('validation.nothingToChange') });

export const recurringRuleIdParamSchema = z.object({ id: uuidSchema });

export const pauseRecurringRuleSchema = z.object({ paused: z.boolean() });

/** Горизонт предстоящих списаний. */
export const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;
export type UpcomingQuery = z.infer<typeof upcomingQuerySchema>;

export interface RecurringRuleResponse {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  categoryId: string | null;
  categoryKey: string | null;
  kind: 'income' | 'expense';
  amount: string;
  currencyCode: string;
  freq: (typeof RECURRENCE_FREQS)[number];
  interval: number;
  dayOfMonth: number | null;
  weekday: number | null;
  monthEndPolicy: (typeof MONTH_END_POLICIES)[number];
  startOn: string;
  endOn: string | null;
  /** Ближайшее срабатывание. null — правило закончилось. */
  nextOccurrenceOn: string | null;
  autoPost: boolean;
  isPaused: boolean;
  createdAt: string;
}

/** Будущее срабатывание: его ещё не было, поэтому у него нет ни id, ни состояния. */
export interface UpcomingOccurrence {
  ruleId: string;
  ruleName: string;
  accountId: string;
  accountName: string;
  kind: 'income' | 'expense';
  amount: string;
  currencyCode: string;
  dueOn: string;
  autoPost: boolean;
}

/** Срабатывание, которое ждёт решения человека (§8.7). */
export interface PendingOccurrence {
  id: string;
  ruleId: string;
  ruleName: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryKey: string | null;
  kind: 'income' | 'expense';
  amount: string;
  currencyCode: string;
  dueOn: string;
}
