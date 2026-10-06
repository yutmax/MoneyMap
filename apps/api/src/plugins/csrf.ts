import type { FastifyInstance, FastifyRequest } from 'fastify';
import { COOKIE_CSRF } from '../lib/cookies.ts';
import { allowedOrigins } from '../lib/env.ts';
import { csrfFailed } from '../lib/errors.ts';
import { safeEqual } from '../lib/tokens.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Маршруты, которые выполняются до появления CSRF-токена. У анонимного
 * запроса нечего угонять: сессии, от имени которой его можно было бы выполнить,
 * ещё не существует.
 */
const ANONYMOUS_ROUTES = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
]);

const CSRF_HEADER = 'x-csrf-token';

function pathOf(request: FastifyRequest): string {
  const url = request.url;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Защита от CSRF (§6.5). Три независимых барьера, потому что каждый из них
 * по отдельности имеет известные обходы:
 *
 *  1. `SameSite=lax` на самих куках — браузер не отправит их в кросс-сайтовом
 *     POST. Не покрывает старые браузеры и запросы с того же сайта.
 *  2. Проверка `Origin` — отсекает кросс-сайтовые запросы на уровне заголовка,
 *     который скрипт подменить не может. Отсутствует у части клиентов.
 *  3. Double-submit token — значение из не-httpOnly куки должно совпасть
 *     с заголовком. Кросс-доменный скрипт не может прочитать куку, а значит
 *     и не может собрать заголовок.
 */
export function registerCsrf(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;

    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      request.log.warn({ origin }, 'Запрос с недопустимого Origin отклонён');
      throw csrfFailed();
    }

    if (ANONYMOUS_ROUTES.has(pathOf(request))) return;

    const cookieToken = request.cookies[COOKIE_CSRF];
    const headerToken = request.headers[CSRF_HEADER];

    if (!cookieToken || typeof headerToken !== 'string' || headerToken.length === 0) {
      throw csrfFailed();
    }
    if (!safeEqual(cookieToken, headerToken)) throw csrfFailed();
  });
}
