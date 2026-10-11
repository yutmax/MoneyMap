import {
  createTransactionSchema,
  createTransferSchema,
  listTransactionsQuerySchema,
  transactionIdParamSchema,
  updateTransactionSchema,
} from '@moneymap/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from './transaction.service.ts';

/**
 * Ключ идемпотентности (§8.3). Заголовок, а не поле тела: повтор — свойство
 * доставки запроса, а не самой операции.
 */
function idempotencyKeyOf(request: FastifyRequest): string | undefined {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 && value.length <= 200 ? value : undefined;
}

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const query = parse(listTransactionsQuerySchema, request.query);
    return reply.send(await listTransactions(db, scope, query));
  });

  app.get('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(transactionIdParamSchema, request.params);
    return reply.send({ transaction: await getTransaction(db, scope, id) });
  });

  app.post('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(createTransactionSchema, request.body);
    const transaction = await createTransaction(db, scope, input, {
      idempotencyKey: idempotencyKeyOf(request),
    });
    return reply.code(201).send({ transaction });
  });

  app.post('/transfer', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(createTransferSchema, request.body);
    const legs = await createTransfer(db, scope, input, idempotencyKeyOf(request));
    return reply.code(201).send({ transactions: legs });
  });

  app.patch('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(transactionIdParamSchema, request.params);
    const input = parse(updateTransactionSchema, request.body);
    return reply.send({ transaction: await updateTransaction(db, scope, id, input) });
  });

  app.delete('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(transactionIdParamSchema, request.params);
    const removed = await deleteTransaction(db, scope, id);
    return reply.send({ ok: true, removed });
  });
}
