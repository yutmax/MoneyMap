import { z } from 'zod';
import { msg } from '../i18n/index.ts';
import { isoDateSchema, moneySchema, uuidSchema } from './common.ts';

/* ───────────────────────────── напоминания ─────────────────────────────── */

export const REMINDER_KINDS = ['balance_check'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_CHANNELS = ['in_app', 'email'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

/** Время в сутках: 'ЧЧ:ММ'. Секунды не нужны — напоминание не будильник. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: msg('validation.reminder.time') });

export const updateReminderSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
    useLastDay: z.boolean().optional(),
    timeOfDay: timeOfDaySchema.optional(),
    channels: z.array(z.enum(REMINDER_CHANNELS)).min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: msg('validation.nothingToChange') });

export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

export interface ReminderResponse {
  id: string;
  kind: ReminderKind;
  isEnabled: boolean;
  dayOfMonth: number;
  useLastDay: boolean;
  /** 'ЧЧ:ММ' в таймзоне пользователя. */
  timeOfDay: string;
  channels: ReminderChannel[];
  lastFiredAt: string | null;
}

/* ───────────────────────────── уведомления ─────────────────────────────── */

export interface NotificationResponse {
  id: string;
  kind: string;
  /** Только параметры: текст собирает интерфейс на своём языке. */
  payload: Record<string, string | number>;
  readAt: string | null;
  createdAt: string;
}

/* ─────────────────────────────── сверка ────────────────────────────────── */

export const createSnapshotSchema = z.object({
  accountId: uuidSchema,
  /** Дата, на которую известен фактический остаток. */
  asOf: isoDateSchema,
  /**
   * Фактический остаток. Может быть отрицательным — кредитка в минусе,
   * и запретить это значит запретить сверять кредитку.
   */
  reportedAmount: moneySchema,
  note: z.string().trim().max(500).optional(),
});

export const snapshotIdParamSchema = z.object({ id: uuidSchema });

export const listSnapshotsQuerySchema = z.object({
  accountId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
export type ListSnapshotsQuery = z.infer<typeof listSnapshotsQuerySchema>;

export interface SnapshotResponse {
  id: string;
  accountId: string;
  accountName: string;
  currencyCode: string;
  asOf: string;
  reportedAmount: string;
  computedAmount: string;
  /**
   * Фактический минус расчётный. Положительное — денег больше, чем знает
   * приложение; отрицательное — меньше. Ноль означает, что учёт сошёлся.
   */
  difference: string;
  note: string | null;
  /** Операция, которой закрыли расхождение. */
  correctionId: string | null;
  createdAt: string;
}

/** Что показывать на экране сверки по каждому счёту. */
export interface ReconciliationRow {
  accountId: string;
  accountName: string;
  currencyCode: string;
  /** Остаток по данным приложения на сегодня. */
  computedAmount: string;
  /** Последняя сверка, если была. */
  lastCheckedOn: string | null;
  lastDifference: string | null;
}
