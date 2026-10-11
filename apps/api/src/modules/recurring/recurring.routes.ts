import {
  createRecurringRuleSchema,
  pauseRecurringRuleSchema,
  recurringRuleIdParamSchema,
  updateRecurringRuleSchema,
  upcomingQuerySchema,
} from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import {
  confirmOccurrence,
  createRule,
  deleteRule,
  generateDue,
  getRule,
  listPending,
  listRules,
  listUpcoming,
  pauseRule,
  skipOccurrence,
  updateRule,
} from './recurring.service.ts';

export async function recurringRuleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    return reply.send({ rules: await listRules(db, scope) });
  });

  /**
   * Предстоящие списания (§8.7). Маршрут объявлен до '/:id' не ради Fastify —
   * он разбирает статический сегмент раньше параметра сам, — а чтобы при
   * чтении файла не возникало вопроса, кто кого перехватывает.
   */
  app.get('/upcoming', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { days } = parse(upcomingQuerySchema, request.query);
    return reply.send({ upcoming: await listUpcoming(db, scope, days) });
  });

  app.get('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(recurringRuleIdParamSchema, request.params);
    return reply.send({ rule: await getRule(db, scope, id) });
  });

  app.post('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(createRecurringRuleSchema, request.body);
    const rule = await createRule(db, scope, input);

    // Правило, начинающееся сегодня, должно сработать сегодня, а не ждать
    // ночной задачи: человек только что его завёл и ждёт увидеть результат.
    await generateDue(db, { userId: scope.ownerId, log: request.log });

    return reply.code(201).send({ rule: await getRule(db, scope, rule.id) });
  });

  app.patch('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(recurringRuleIdParamSchema, request.params);
    const input = parse(updateRecurringRuleSchema, request.body);
    return reply.send({ rule: await updateRule(db, scope, id, input) });
  });

  app.post('/:id/pause', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(recurringRuleIdParamSchema, request.params);
    const { paused } = parse(pauseRecurringRuleSchema, request.body);
    return reply.send({ rule: await pauseRule(db, scope, id, paused) });
  });

  app.delete('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(recurringRuleIdParamSchema, request.params);
    await deleteRule(db, scope, id);
    return reply.send({ ok: true });
  });
}

/**
 * Срабатывания, ожидающие решения человека (§8.7).
 *
 * Отдельная группа маршрутов, а не вложенная в правило: подтверждают не
 * правило, а конкретное списание, и приходят к нему из очереди, где правило
 * ещё неизвестно.
 */
export async function recurringOccurrenceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/pending', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    return reply.send({ pending: await listPending(db, scope) });
  });

  app.post('/:id/confirm', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(recurringRuleIdParamSchema, request.params);
    await confirmOccurrence(db, scope, id);
    return reply.send({ ok: true });
  });

  app.post('/:id/skip', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(recurringRuleIdParamSchema, request.params);
    await skipOccurrence(db, scope, id);
    return reply.send({ ok: true });
  });
}
