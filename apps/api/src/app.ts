import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ERROR_CODES, type ApiErrorBody } from '@moneymap/shared';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { allowedOrigins, env, isProduction } from './lib/env.ts';
import { AppError } from './lib/errors.ts';
import { authRoutes } from './modules/auth/auth.routes.ts';
import { referenceRoutes } from './modules/reference/reference.routes.ts';
import { settingsRoutes } from './modules/settings/settings.routes.ts';
import { registerCsrf } from './plugins/csrf.ts';

/** Заголовки и поля, которые нельзя писать в лог (§10.1). */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.token',
];

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      ...(isProduction
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }),
    },
    // За Caddy реальный IP приходит в X-Forwarded-For. Без этого флага
    // rate limiting будет считать все запросы с одного адреса — прокси.
    trustProxy: isProduction,
    bodyLimit: 256 * 1024,
    disableRequestLogging: false,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP отдаёт Caddy вместе со статикой фронтенда.
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token'],
    maxAge: 600,
  });

  await app.register(cookie, { secret: undefined, parseOptions: {} });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // preHandler, а не onRequest: лимитеры на /login и /forgot-password
    // ключуются по email из тела запроса, а на onRequest тело ещё не разобрано.
    hook: 'preHandler',
    keyGenerator: (request) => request.ip,
    addHeadersOnExceeding: { 'x-ratelimit-remaining': true },
  });

  registerCsrf(app);

  /* ──────────────────────────── обработка ошибок ──────────────────────────── */

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      // В лог уходит технический текст, пользователю — человеческий.
      request.log.info(
        { code: error.code, statusCode: error.statusCode },
        error.logMessage ?? error.message,
      );
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
      return reply.code(error.statusCode).send(body);
    }

    if (error.statusCode === 429) {
      const body: ApiErrorBody = {
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Слишком много попыток. Попробуйте позже.',
        },
      };
      return reply.code(429).send(body);
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      const body: ApiErrorBody = {
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: error.message },
      };
      return reply.code(error.statusCode).send(body);
    }

    // Неожидаемая ошибка: в лог со стеком, наружу — ничего о внутренностях.
    request.log.error({ err: error }, 'Необработанная ошибка');
    const body: ApiErrorBody = {
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Внутренняя ошибка сервера' },
    };
    return reply.code(500).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorBody = {
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Маршрут ${request.method} ${request.url} не найден`,
      },
    };
    return reply.code(404).send(body);
  });

  /* ──────────────────────────────── маршруты ──────────────────────────────── */

  app.get('/health', async () => ({ status: 'ok', uptime: Math.round(process.uptime()) }));

  // Префикс /api задаётся здесь, а не в прокси: путь должен совпадать в dev
  // и в prod, потому что от него зависит область действия refresh-куки.
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(settingsRoutes, { prefix: '/settings' });
      await api.register(referenceRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
