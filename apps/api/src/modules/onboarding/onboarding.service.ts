import type { MeResponse, OnboardingInput } from '@moneymap/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import { toMeResponse } from '../auth/auth.service.ts';
import { assertCurrencyExists } from '../reference/currency.service.ts';

/**
 * Первичная настройка: то, что раньше спрашивала форма регистрации.
 *
 * Проходится ровно один раз. Повторный вызов отклоняется, а не перезаписывает
 * настройки: иначе этот эндпоинт стал бы вторым, нигде не ограниченным
 * способом менять базовую валюту в обход `PATCH /settings` — с той разницей,
 * что здесь нет ни подтверждения, ни пояснения о последствиях для истории
 * операций.
 */
export async function completeOnboarding(
  db: Db,
  args: { userId: string; input: OnboardingInput },
): Promise<MeResponse> {
  const code = await assertCurrencyExists(db, args.input.baseCurrency);

  // Условие isNull(onboardedAt) стоит в самом UPDATE, а не в отдельной
  // проверке перед ним: два одновременных запроса прошли бы проверку оба,
  // а здесь второй не найдёт строки и получит честный конфликт.
  const [updated] = await db
    .update(users)
    .set({
      baseCurrency: code,
      timezone: args.input.timezone,
      onboardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, args.userId), isNull(users.onboardedAt)))
    .returning();

  if (updated) return toMeResponse(updated);

  const [existing] = await db.select().from(users).where(eq(users.id, args.userId)).limit(1);
  if (!existing) throw notFound('Пользователь не найден');

  throw conflict('Первичная настройка уже пройдена');
}
