import {
  createSnapshotSchema,
  listSnapshotsQuerySchema,
  snapshotIdParamSchema,
  updateReminderSchema,
} from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { scopeOf } from '../../lib/scoping.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import {
  correctSnapshot,
  createSnapshot,
  listReconciliation,
  listSnapshots,
} from './reconciliation.service.ts';
import {
  listNotifications,
  listReminders,
  markNotificationRead,
  updateReminder,
} from './reminder.service.ts';

/** Сверка остатков (§8.8). */
export async function snapshotRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /** Экран сверки: счета с расчётным остатком и датой последней проверки. */
  app.get('/accounts', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    return reply.send({ accounts: await listReconciliation(db, scope) });
  });

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const query = parse(listSnapshotsQuerySchema, request.query);
    return reply.send({ snapshots: await listSnapshots(db, scope, query) });
  });

  app.post('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const input = parse(createSnapshotSchema, request.body);
    return reply.code(201).send({ snapshot: await createSnapshot(db, scope, input) });
  });

  /** Закрыть расхождение корректирующей операцией — одним действием (§8.8). */
  app.post('/:id/correct', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(snapshotIdParamSchema, request.params);
    return reply.send({ snapshot: await correctSnapshot(db, scope, id) });
  });
}

export async function reminderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    return reply.send({ reminders: await listReminders(db, scope) });
  });

  app.put('/:id', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(snapshotIdParamSchema, request.params);
    const input = parse(updateReminderSchema, request.body);
    return reply.send({ reminder: await updateReminder(db, scope, id, input) });
  });
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    return reply.send({ notifications: await listNotifications(db, scope) });
  });

  app.post('/:id/read', async (request, reply) => {
    const scope = scopeOf(getAuth(request).userId);
    const { id } = parse(snapshotIdParamSchema, request.params);
    await markNotificationRead(db, scope, id);
    return reply.send({ ok: true });
  });
}
