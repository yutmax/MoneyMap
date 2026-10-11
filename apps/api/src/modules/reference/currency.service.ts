import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { currencies } from '../../db/schema.ts';
import { badRequest } from '../../lib/errors.ts';

/**
 * Проверка кода валюты по справочнику.
 *
 * Внешний ключ на currencies.code поймал бы неизвестный код и сам, но ответом
 * была бы ошибка целостности с кодом 500 вместо внятного сообщения на поле
 * формы. Плюс FK ничего не знает про is_active: выведенная из обращения
 * валюта остаётся в таблице ради исторических операций, но выбирать её заново
 * нельзя.
 */
export async function assertCurrencyExists(
  db: Db,
  code: string,
  path = 'baseCurrency',
): Promise<string> {
  const [currency] = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(and(eq(currencies.code, code), eq(currencies.isActive, true)))
    .limit(1);

  if (!currency) {
    throw badRequest('errors.unknownCurrency', [{ path, message: 'validation.currency.unknown' }]);
  }

  return currency.code;
}
