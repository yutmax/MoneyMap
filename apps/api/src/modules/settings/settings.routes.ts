import { updateSettingsSchema } from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import { getMe, updateSettings } from '../auth/auth.service.ts';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/', async (request, reply) => {
    const { userId } = getAuth(request);
    return reply.send({ settings: await getMe(db, userId) });
  });

  app.patch('/', async (request, reply) => {
    const { userId } = getAuth(request);
    const input = parse(updateSettingsSchema, request.body);
    return reply.send({ settings: await updateSettings(db, { userId, input }) });
  });
}
