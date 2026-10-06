import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { currencies } from '../../db/schema.ts';

export async function referenceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Справочник валют. Открыт без аутентификации: он нужен форме регистрации,
   * общий для всех пользователей и ничего приватного не содержит.
   */
  app.get('/currencies', async (_request, reply) => {
    const rows = await db
      .select({
        code: currencies.code,
        kind: currencies.kind,
        decimals: currencies.decimals,
        symbol: currencies.symbol,
        name: currencies.name,
      })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(asc(currencies.sortOrder), asc(currencies.code));

    reply.header('cache-control', 'public, max-age=3600');
    return reply.send({ currencies: rows });
  });
}
