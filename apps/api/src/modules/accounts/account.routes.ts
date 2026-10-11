import { accountIdParamSchema, createAccountSchema, updateAccountSchema } from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from './account.service.ts';

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    return reply.send({ accounts: await listAccounts(db, scope) });
  });

  app.get('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(accountIdParamSchema, request.params);
    return reply.send({ account: await getAccount(db, scope, id) });
  });

  app.post('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(createAccountSchema, request.body);
    return reply.code(201).send({ account: await createAccount(db, scope, input) });
  });

  app.patch('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(accountIdParamSchema, request.params);
    const input = parse(updateAccountSchema, request.body);
    return reply.send({ account: await updateAccount(db, scope, id, input) });
  });

  app.delete('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(accountIdParamSchema, request.params);
    await deleteAccount(db, scope, id);
    return reply.send({ ok: true });
  });
}
