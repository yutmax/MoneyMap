import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from './env.ts';

export interface AccessTokenPayload {
  /** users.id */
  userId: string;
  /** sessions.id — стабилен через все ротации refresh-токена. */
  sessionId: string;
}

const JWT_ALGORITHM = 'HS256' as const;
const JWT_ISSUER = 'moneymap';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

/**
 * `allowExpired` нужен ровно одному потребителю — /auth/logout. Refresh-кука
 * ограничена путём /api/auth/refresh и до logout не доходит, поэтому сессию
 * приходится определять по access-токену. Отзывать сессию по просроченному,
 * но корректно подписанному токену безопасно: хуже, чем «выйти», не станет.
 */
export function verifyAccessToken(
  token: string,
  options: { allowExpired?: boolean } = {},
): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      ignoreExpiration: options.allowExpired ?? false,
    });
    if (typeof decoded !== 'object' || decoded === null) return null;
    const { userId, sessionId } = decoded as Partial<AccessTokenPayload>;
    if (typeof userId !== 'string' || typeof sessionId !== 'string') return null;
    return { userId, sessionId };
  } catch {
    return null;
  }
}

/* ──────────────────────────── opaque-токены ─────────────────────────────── */

/**
 * Refresh-токен — непрозрачная случайная строка, не JWT (§6.1): его нужно уметь
 * отзывать, а JWT по своей природе отозвать нельзя.
 */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** В БД хранится только этот хеш (§6.2). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Сравнение хешей за постоянное время. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
