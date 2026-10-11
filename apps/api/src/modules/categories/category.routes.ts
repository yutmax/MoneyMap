import {
  categoryIdParamSchema,
  createCategorySchema,
  deleteCategoryQuerySchema,
  updateCategorySchema,
} from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from './category.service.ts';

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

  app.post('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(createCategorySchema, request.body);
    return reply.code(201).send({ category: await createCategory(db, scope, input) });
  });

  app.patch('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(categoryIdParamSchema, request.params);
    const input = parse(updateCategorySchema, request.body);
    return reply.send({ category: await updateCategory(db, scope, id, input) });
  });

  app.delete('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(categoryIdParamSchema, request.params);
    const { moveTo } = parse(deleteCategoryQuerySchema, request.query);
    return reply.send(await deleteCategory(db, scope, id, moveTo));
  });
}
