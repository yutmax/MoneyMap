import { categoryIdParamSchema } from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import { getCategory, listCategories } from './category.service.ts';

/**
 * Только чтение (§8.4). POST, PATCH и DELETE убраны вместе с возможностью
 * заводить свои категории: набор задаёт разработчик.
 */
export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    return reply.send({ categories: await listCategories(db, scope) });
  });

  app.get('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(categoryIdParamSchema, request.params);
    return reply.send({ category: await getCategory(db, scope, id) });
  });
}
