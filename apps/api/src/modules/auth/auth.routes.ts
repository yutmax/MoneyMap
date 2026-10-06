import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sessionIdParamSchema,
  updateSettingsSchema,
  verifyEmailSchema,
} from '@moneymap/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { db } from '../../db/index.ts';
import {
  clearAuthCookies,
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  setAccessCookie,
  setCsrfCookie,
  setRefreshCookie,
} from '../../lib/cookies.ts';
import { notFound, unauthorized } from '../../lib/errors.ts';
import { Scope } from '../../lib/scoping.ts';
import { verifyAccessToken } from '../../lib/tokens.ts';
import { parse } from '../../lib/validate.ts';
import { deviceOf, getAuth, requireAuth } from '../../plugins/require-auth.ts';
import * as authService from './auth.service.ts';
import type { IssuedAuth } from './session.service.ts';
import * as sessionService from './session.service.ts';

function applyAuthCookies(reply: FastifyReply, auth: IssuedAuth): void {
  setAccessCookie(reply, auth.accessToken);
  setRefreshCookie(reply, auth.refreshToken);
  setCsrfCookie(reply, auth.csrfToken);
}

/** Ключ лимитера по email: защищает конкретный аккаунт от распределённого подбора. */
function emailKey(body: unknown, fallback: string): string {
  const email = (body as { email?: unknown } | null)?.email;
  return typeof email === 'string' ? `email:${email.trim().toLowerCase()}` : `ip:${fallback}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /* ─────────────────────────── регистрация и вход ──────────────────────────── */

  app.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator: (r) => emailKey(r.body, r.ip),
        },
      },
    },
    async (request, reply) => {
      const input = parse(registerSchema, request.body);
      const { user, auth } = await authService.register(db, {
        input,
        device: deviceOf(request),
        log: request.log,
      });
      applyAuthCookies(reply, auth);
      return reply.code(201).send({ user });
    },
  );

  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
          keyGenerator: (r) => emailKey(r.body, r.ip),
        },
      },
    },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const { user, auth } = await authService.login(db, { input, device: deviceOf(request) });
      applyAuthCookies(reply, auth);
      return reply.send({ user });
    },
  );

  /* ──────────────────────────────── refresh ────────────────────────────────── */

  app.post(
    '/refresh',
    { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const presentedToken = request.cookies[COOKIE_REFRESH];
      if (!presentedToken) {
        clearAuthCookies(reply);
        throw unauthorized('Сессия не найдена', 'refresh called without cookie');
      }

      try {
        const auth = await sessionService.rotateSession(db, {
          presentedToken,
          device: deviceOf(request),
          log: request.log,
        });
        applyAuthCookies(reply, auth);
        return reply.send({ ok: true });
      } catch (error) {
        // Любой неуспех refresh означает, что сессии больше нет — куки должны
        // уйти, иначе клиент будет вечно долбиться с мёртвым токеном.
        clearAuthCookies(reply);
        throw error;
      }
    },
  );

  /* ──────────────────────────────── выход ─────────────────────────────────── */

  app.post('/logout', async (request, reply) => {
    // Refresh-кука ограничена путём /api/auth/refresh и сюда не придёт,
    // поэтому сессию определяем по access-токену — в том числе просроченному
    // (см. комментарий к verifyAccessToken).
    const accessToken = request.cookies[COOKIE_ACCESS];
    const payload = accessToken ? verifyAccessToken(accessToken, { allowExpired: true }) : null;

    if (payload) {
      await sessionService.revokeSession(db, {
        scope: new Scope(payload.userId),
        sessionId: payload.sessionId,
        reason: 'logout',
      });
    }

    clearAuthCookies(reply);
    return reply.send({ ok: true });
  });

  app.post('/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    const { scope, sessionId } = getAuth(request);
    const revoked = await sessionService.revokeAllSessions(db, {
      scope,
      exceptSessionId: sessionId,
      reason: 'logout_all',
    });
    return reply.send({ revoked });
  });

  /* ──────────────────────────────── профиль ───────────────────────────────── */

  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = getAuth(request);
    return reply.send({ user: await authService.getMe(db, userId) });
  });

  app.patch('/me', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = getAuth(request);
    const input = parse(updateSettingsSchema, request.body);
    return reply.send({ user: await authService.updateSettings(db, { userId, input }) });
  });

  app.post('/change-password', { preHandler: requireAuth }, async (request, reply) => {
    const { userId, sessionId } = getAuth(request);
    const input = parse(changePasswordSchema, request.body);
    const result = await authService.changePassword(db, {
      userId,
      currentSessionId: sessionId,
      input,
    });
    return reply.send(result);
  });

  /* ──────────────────────── восстановление доступа ────────────────────────── */

  app.post(
    '/forgot-password',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator: (r) => emailKey(r.body, r.ip),
        },
      },
    },
    async (request, reply) => {
      const { email } = parse(forgotPasswordSchema, request.body);
      await authService.requestPasswordReset(db, { email, log: request.log });
      // Ответ не зависит от существования адреса.
      return reply.send({ ok: true });
    },
  );

  app.post(
    '/reset-password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const input = parse(resetPasswordSchema, request.body);
      await authService.resetPassword(db, input);
      clearAuthCookies(reply);
      return reply.send({ ok: true });
    },
  );

  app.post('/verify-email', async (request, reply) => {
    const { token } = parse(verifyEmailSchema, request.body);
    await authService.verifyEmail(db, token);
    return reply.send({ ok: true });
  });

  /* ──────────────────────────── список устройств ──────────────────────────── */

  app.get('/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const { scope, sessionId } = getAuth(request);
    const sessions = await sessionService.listSessions(db, {
      scope,
      currentSessionId: sessionId,
    });
    return reply.send({ sessions });
  });

  app.delete('/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { scope, sessionId } = getAuth(request);
    const { id } = parse(sessionIdParamSchema, request.params);

    const revoked = await sessionService.revokeSession(db, {
      scope,
      sessionId: id,
      reason: 'manual',
    });
    // Чужая или уже отозванная сессия — 404, а не 403 (§10.1).
    if (!revoked) throw notFound('Сессия не найдена');

    // Отзыв собственной сессии равносилен выходу: куки больше не нужны.
    if (id === sessionId) clearAuthCookies(reply);

    return reply.send({ ok: true, wasCurrent: id === sessionId });
  });
}
