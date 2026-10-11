import { convertQuerySchema, ratesQuerySchema, todayUtc } from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { parse } from '../../lib/validate.ts';
import { requireAuth } from '../../plugins/require-auth.ts';
import { assertCurrencyExists } from '../reference/currency.service.ts';
import { convertAmount, listRates } from './rate.service.ts';

export async function rateRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Курсы ничего приватного не содержат, но эндпоинт всё равно за
   * аутентификацией: открытым он был бы бесплатным прокси к нашему источнику,
   * чьи лимиты мы делим со всеми его пользователями.
   */
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const query = parse(ratesQuerySchema, request.query);
    if (query.base) await assertCurrencyExists(db, query.base, 'base');

    const rates = await listRates(db, query.base, query.on);
    // Кеш короткий: курс меняется раз в сутки, но дата набора — нет, и
    // клиент, открывший приложение в полночь, не должен ждать перезагрузки.
    reply.header('cache-control', 'private, max-age=300');
    return reply.send(rates);
  });

  /**
   * Пересчёт суммы. Нужен при вводе операции в валюте, отличной от валюты
   * счёта (§8.5): курс подставляется в форму, но остаётся в ней правимым —
   * фактический курс обмена в обменнике отличается от справочного.
   */
  app.get('/convert', async (request, reply) => {
    const query = parse(convertQuerySchema, request.query);
    const from = await assertCurrencyExists(db, query.from, 'from');
    const to = await assertCurrencyExists(db, query.to, 'to');

    return reply.send(await convertAmount(db, from, to, query.amount, query.on ?? todayUtc()));
  });
}
