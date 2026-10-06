import type { ApiErrorDetail } from '@moneymap/shared';
import type { z } from 'zod';
import { badRequest } from './errors.ts';

function toDetails(error: z.ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/**
 * Разбор входящих данных схемой из `@moneymap/shared`.
 *
 * Схема одна и та же на обеих сторонах (§4.1), поэтому фронтенд почти никогда
 * не доходит до этой проверки — но она тут не для удобства, а потому что
 * клиент не является источником истины.
 */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Проверьте заполненные поля', toDetails(result.error));
  }
  return result.data;
}
