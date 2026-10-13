import { onboardingSchema } from '@moneymap/shared';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.ts';
import { parse } from '../../lib/validate.ts';
import { getAuth, requireAuth } from '../../plugins/require-auth.ts';
import { completeOnboarding } from './onboarding.service.ts';

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post('/', async (request, reply) => {
    const { userId } = getAuth(request);
    const input = parse(onboardingSchema, request.body);
    return reply.send({ user: await completeOnboarding(db, { userId, input }) });
  });
}
