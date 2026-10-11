import { z } from 'zod';
import { msg } from '../i18n/index.ts';
import { currencyCodeSchema, moneySchema, uuidSchema } from './common.ts';
import { LIMITS } from './limits.ts';

export const ACCOUNT_TYPES = ['cash', 'bank', 'card', 'savings', 'crypto_wallet'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const accountTypeSchema = z.enum(ACCOUNT_TYPES, {
  message: msg('validation.account.type'),
});

const nameSchema = z
  .string()
  .trim()
  .min(1, { message: msg('validation.account.name') })
  .max(LIMITS.nameMax, { message: msg('validation.name.max', { count: LIMITS.nameMax }) });

/** Цвет метки счёта: шестизначный hex. */
const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: msg('validation.color') });

export const createAccountSchema = z.object({
  name: nameSchema,
  type: accountTypeSchema,
  currencyCode: currencyCodeSchema,
  /** Остаток на момент заведения счёта. Может быть отрицательным — кредитка. */
  openingBalance: moneySchema.default('0'),
  icon: z.string().trim().max(50).optional(),
  color: colorSchema.optional(),
});

/**
 * Валюты здесь нет и не будет (§8.2): она зафиксирована при создании.
 * Сменить её задним числом — значит оставить историю операций, посчитанную
 * в одних единицах, под заголовком с другими.
 */
export const updateAccountSchema = z
  .object({
    name: nameSchema.optional(),
    type: accountTypeSchema.optional(),
    openingBalance: moneySchema.optional(),
    icon: z.string().trim().max(50).nullable().optional(),
    color: colorSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: msg('validation.nothingToChange') });

export const accountIdParamSchema = z.object({ id: uuidSchema });

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

/** Счёт в том виде, в котором его отдаёт API. */
export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: string;
  openingBalance: string;
  /** Начальный остаток плюс все операции по счёту (§7.1). */
  balance: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
  /**
   * Есть ли по счёту операции. От этого зависит, можно ли его удалить
   * или остаётся только архивировать (§8.2).
   */
  hasTransactions: boolean;
  createdAt: string;
}
