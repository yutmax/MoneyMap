import { z } from 'zod';
import { msg } from '../i18n/index.ts';
import { MONEY_PATTERN } from '../lib/money.ts';

/** Код валюты: ISO-4217 для фиата, тикер для крипты (USDT, WBTC). */
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,10}$/, { message: msg('validation.currency.code') });

/** Денежное значение в API — строка (§5.1). */
export const moneySchema = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, { message: msg('validation.money.format') });

export const positiveMoneySchema = moneySchema.refine(
  (v) => !v.startsWith('-') && /[1-9]/.test(v),
  {
    message: msg('validation.money.positive'),
  },
);

/**
 * IANA-таймзона. Валидируется через сам Intl, а не по списку: список
 * обновляется с tzdata, захардкоженный перечень устареет.
 */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: msg('validation.timezone.unknown') },
  );

/** Дата без времени: 'YYYY-MM-DD'. Для occurred_on, as_of и прочих date-колонок. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: msg('validation.date.format') })
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), {
    message: msg('validation.date.invalid'),
  });

export const uuidSchema = z.uuid({ message: msg('validation.id') });

/** Курсорная пагинация (§10.3). */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
