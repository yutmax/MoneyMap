import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.ts';
import { COOKIE_ACCESS } from '../lib/cookies.ts';
import { unauthorized } from '../lib/errors.ts';
import { Scope } from '../lib/scoping.ts';
import { verifyAccessToken } from '../lib/tokens.ts';
import { isSessionActive } from '../modules/auth/session.service.ts';

export interface AuthContext {
  userId: string;
  sessionId: string;
  scope: Scope;
}

/** preHandler для защищённых маршрутов. */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = request.cookies[COOKIE_ACCESS];
  if (!token) throw unauthorized('errors.authRequired', 'no access cookie');

  const payload = verifyAccessToken(token);
  if (!payload) throw unauthorized('errors.authRequired', 'invalid or expired access token');

  if (!(await isSessionActive(db, payload.sessionId))) {
    throw unauthorized('errors.sessionEnded', 'session revoked or expired');
  }

  request.authContext = {
    userId: payload.userId,
    sessionId: payload.sessionId,
    scope: new Scope(payload.userId),
  };
}

/**
 * Достаёт контекст, гарантированно проставленный `requireAuth`. Нужен, чтобы
 * хендлеры не были обвешаны `request.authContext!`: восклицательный знак
 * однажды переживёт удаление preHandler-а, а эта функция — нет.
 */
export function getAuth(request: FastifyRequest): AuthContext {
  const auth = request.authContext;
  if (!auth) throw unauthorized('errors.authRequired', 'requireAuth hook missing on route');
  return auth;
}

/** Данные об устройстве для записи в сессию (§6.4). */
export function deviceOf(request: FastifyRequest): { userAgent: string | null; ip: string | null } {
  return {
    userAgent: request.headers['user-agent'] ?? null,
    ip: request.ip ?? null,
  };
}
