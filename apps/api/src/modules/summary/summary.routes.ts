import { netWorthQuerySchema, summaryQuerySchema } from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import { assertCurrencyExists } from '../reference/currency.service.ts';
import { getNetWorth, getSummary } from './summary.service.ts';

export async function summaryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const query = parse(summaryQuerySchema, request.query);
    if (query.baseCurrency) await assertCurrencyExists(db, query.baseCurrency, 'baseCurrency');

    // breakdown из пары не берётся: он нужен снимку, а клиенту то же самое
    // уже разложено по byAccount и byCurrency.
    const { summary } = await getSummary(db, scope, query.baseCurrency);
    return reply.send({ summary });
  });

  app.get('/net-worth', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const query = parse(netWorthQuerySchema, request.query);
    if (query.baseCurrency) await assertCurrencyExists(db, query.baseCurrency, 'baseCurrency');

    return reply.send(await getNetWorth(db, scope, query));
  });
}
