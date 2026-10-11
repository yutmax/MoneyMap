import { z } from 'zod';
import { msg } from '../i18n/index.ts';
import { currencyCodeSchema, isoDateSchema, positiveMoneySchema, uuidSchema } from './common.ts';

export const TRANSACTION_KINDS = ['income', 'expense', 'transfer'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** Доход и расход — то, что заводят вручную. Перевод создаётся своим эндпоинтом. */
export const entryKindSchema = z.enum(['income', 'expense'], {
  message: msg('validation.transaction.kind'),
});

const noteSchema = z.string().trim().max(500).optional();

/**
 * Сумма всегда положительная. Знак выводится из вида операции на сервере:
 * если бы его присылал клиент, расход с положительной суммой увеличивал бы
 * баланс, и ошибка нашлась бы только при сверке остатков.
 */
export const createTransactionSchema = z.object({
  accountId: uuidSchema,
  categoryId: uuidSchema.nullable().optional(),
  kind: entryKindSchema,
  amount: positiveMoneySchema,
  /**
   * Валюта введённой суммы (§8.5). По умолчанию — валюта счёта.
   *
   * Нужна для покупки за границей: карта в рублях, чек в злотых. В учёт
   * операция всё равно попадает в валюте счёта, но то, что человек видел
   * на чеке, сохраняется рядом и больше не пересчитывается.
   */
  currency: currencyCodeSchema.optional(),
  /**
   * Сколько на самом деле списалось со счёта.
   *
   * Необязательна: без неё сумма пересчитывается по курсу на дату операции.
   * Но курс справочника и курс, по которому списал банк, — разные числа,
   * и когда человек видит в выписке второе, выдуманное первое ему не нужно.
   */
  amountAccount: positiveMoneySchema.optional(),
  occurredOn: isoDateSchema,
  note: noteSchema,
});

/**
 * Перевод между своими счетами (§7.2).
 *
 * `toAmount` обязателен, только когда валюты счетов различаются: сложить
 * рубли с долларами без курса нельзя, и выдумывать его приложение не будет —
 * человек вводит обе суммы, а кросс-курс выводится из них. Когда валюты
 * совпадают, сумма одна.
 */
export const createTransferSchema = z
  .object({
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amount: positiveMoneySchema,
    toAmount: positiveMoneySchema.optional(),
    occurredOn: isoDateSchema,
    note: noteSchema,
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: msg('validation.transfer.sameAccount'),
    path: ['toAccountId'],
  });

export const updateTransactionSchema = z
  .object({
    categoryId: uuidSchema.nullable().optional(),
    amount: positiveMoneySchema.optional(),
    /**
     * Исправление суммы, списанной со счёта. Валюта операции не меняется:
     * это была бы другая операция, а не правка этой.
     */
    amountAccount: positiveMoneySchema.optional(),
    occurredOn: isoDateSchema.optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: msg('validation.nothingToChange') });

export const transactionIdParamSchema = z.object({ id: uuidSchema });

export const listTransactionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  search: z.string().trim().max(200).optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export interface TransactionResponse {
  id: string;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  categoryId: string | null;
  categoryName: string | null;
  kind: TransactionKind;
  /** Что ввёл человек. */
  amountOriginal: string;
  currencyOriginal: string;
  /** Со знаком, в валюте счёта: по этой колонке считается баланс. */
  amountAccount: string;
  fxRate: string;
  occurredOn: string;
  note: string | null;
  /** Общий у двух ног одного перевода. */
  transferGroupId: string | null;
  createdAt: string;
}

export interface TransactionPage {
  transactions: TransactionResponse[];
  /** Курсор следующей страницы. null — страница последняя. */
  nextCursor: string | null;
}
