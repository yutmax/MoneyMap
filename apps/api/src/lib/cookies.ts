import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';
import { env } from './env.ts';

export const COOKIE_ACCESS = 'mm_at';
export const COOKIE_REFRESH = 'mm_rt';
/** Не httpOnly: клиент обязан его прочитать и положить в заголовок. */
export const COOKIE_CSRF = 'mm_csrf';

/** Путь refresh-куки (§6.1). Браузер не отправит её ни на один другой эндпоинт. */
export const REFRESH_COOKIE_PATH = '/api/auth/refresh';

const base: CookieSerializeOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

export function setAccessCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_ACCESS, token, {
    ...base,
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  });
}

export function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_REFRESH, token, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export function setCsrfCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_CSRF, token, {
    ...base,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_ACCESS, { ...base });
  reply.clearCookie(COOKIE_REFRESH, { ...base, path: REFRESH_COOKIE_PATH });
  reply.clearCookie(COOKIE_CSRF, { ...base, httpOnly: false });
}
