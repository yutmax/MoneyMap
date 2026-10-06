import type { SessionSummary } from '@moneymap/shared';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db, DbExecutor } from '../../db/index.ts';
import { refreshTokens, sessions, users } from '../../db/schema.ts';
import { env } from '../../lib/env.ts';
import { sessionReuseDetected, unauthorized } from '../../lib/errors.ts';
import { sendMail } from '../../lib/mailer.ts';
import type { Scope } from '../../lib/scoping.ts';
import { addDays, generateOpaqueToken, hashToken, signAccessToken } from '../../lib/tokens.ts';
import { parseUserAgent } from '../../lib/user-agent.ts';

export interface DeviceInfo {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedAuth {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
}

/**
 * Окно, в котором повторное предъявление уже использованного refresh-токена
 * считается добросовестным повтором, а не кражей.
 *
 * Без него любой сетевой ретрай (телефон в метро) или гонка двух вкладок
 * отзывали бы сессию и выбрасывали пользователя. Детекция кражи при этом
 * сохраняется: украденный токен почти всегда предъявляется существенно позже
 * легитимного. Клиент дополнительно сериализует refresh в один поток.
 */
const REUSE_GRACE_MS = 10_000;

function newRefreshToken() {
  const token = generateOpaqueToken(32);
  return { token, hash: hashToken(token) };
}

/** Создаёт сессию устройства и первый refresh-токен. */
export async function createSession(
  db: DbExecutor,
  args: { userId: string; device: DeviceInfo },
): Promise<IssuedAuth> {
  const expiresAt = addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS);
  const { token, hash } = newRefreshToken();

  const [session] = await db
    .insert(sessions)
    .values({
      userId: args.userId,
      userAgent: args.device.userAgent,
      ip: args.device.ip,
      expiresAt,
    })
    .returning({ id: sessions.id });

  if (!session) throw new Error('Не удалось создать сессию');

  await db.insert(refreshTokens).values({
    sessionId: session.id,
    tokenHash: hash,
    expiresAt,
  });

  return {
    accessToken: signAccessToken({ userId: args.userId, sessionId: session.id }),
    refreshToken: token,
    csrfToken: generateOpaqueToken(32),
    sessionId: session.id,
  };
}

/**
 * Ротация refresh-токена (§6.3).
 *
 * Вся работа идёт в одной транзакции с блокировкой строки токена: без `FOR
 * UPDATE` два параллельных refresh могли бы оба увидеть `used_at = null`
 * и выдать две расходящиеся цепочки токенов на одну сессию.
 */
export async function rotateSession(
  db: Db,
  args: { presentedToken: string; device: DeviceInfo; log: FastifyBaseLogger },
): Promise<IssuedAuth> {
  const presentedHash = hashToken(args.presentedToken);

  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, presentedHash))
      .for('update')
      .limit(1);

    if (!existing) return { kind: 'unknown' as const };

    if (existing.usedAt) {
      const age = Date.now() - existing.usedAt.getTime();
      if (age <= REUSE_GRACE_MS) return { kind: 'retry' as const };

      // Токен предъявлен повторно спустя заметное время — считаем компрометацией
      // и гасим всю сессию целиком, а не только этот токен.
      const [owner] = await tx
        .select({ email: users.email, name: users.name, userAgent: sessions.userAgent })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, existing.sessionId))
        .limit(1);

      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: 'reuse_detected' })
        .where(and(eq(sessions.id, existing.sessionId), isNull(sessions.revokedAt)));

      return { kind: 'reuse' as const, owner };
    }

    if (existing.expiresAt.getTime() <= Date.now()) return { kind: 'expired' as const };

    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, existing.sessionId))
      .limit(1);

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return { kind: 'expired' as const };
    }

    const { token, hash } = newRefreshToken();
    const [created] = await tx
      .insert(refreshTokens)
      .values({
        sessionId: session.id,
        tokenHash: hash,
        // Срок жизни цепочки не продлевается за границу самой сессии: иначе
        // 60 дней превратились бы в бесконечность при активном использовании.
        expiresAt: session.expiresAt,
      })
      .returning({ id: refreshTokens.id });

    if (!created) throw new Error('Не удалось выдать refresh-токен');

    await tx
      .update(refreshTokens)
      .set({ usedAt: new Date(), replacedBy: created.id })
      .where(eq(refreshTokens.id, existing.id));

    await tx
      .update(sessions)
      .set({
        lastUsedAt: new Date(),
        userAgent: args.device.userAgent ?? session.userAgent,
        ip: args.device.ip ?? session.ip,
      })
      .where(eq(sessions.id, session.id));

    return {
      kind: 'rotated' as const,
      auth: {
        accessToken: signAccessToken({ userId: session.userId, sessionId: session.id }),
        refreshToken: token,
        csrfToken: generateOpaqueToken(32),
        sessionId: session.id,
      },
    };
  });

  switch (outcome.kind) {
    case 'rotated':
      return outcome.auth;

    case 'reuse': {
      args.log.warn(
        { tokenHashPrefix: presentedHash.slice(0, 12) },
        'Повторное использование refresh-токена, сессия отозвана',
      );
      if (outcome.owner) {
        const device = parseUserAgent(outcome.owner.userAgent).device;
        sendMail(args.log, {
          to: outcome.owner.email,
          subject: 'MoneyMap: сессия отозвана из соображений безопасности',
          text:
            `${outcome.owner.name}, здравствуйте.\n\n` +
            `Мы заметили повторное использование токена сессии (${device}) и отозвали её целиком.\n` +
            `Если это были не вы — смените пароль: кто-то мог получить доступ к вашему устройству.\n`,
        });
      }
      throw sessionReuseDetected();
    }

    case 'retry':
      throw unauthorized(
        'Сессия обновляется, повторите запрос',
        'refresh retry within grace window',
      );

    case 'expired':
      throw unauthorized('Сессия истекла', 'refresh token expired or session inactive');

    case 'unknown':
      throw unauthorized('Сессия не найдена', 'unknown refresh token');
  }
}

/**
 * Проверяет, что сессия из access-токена всё ещё активна.
 *
 * Да, это запрос в БД на каждый авторизованный вызов. Альтернатива — доверять
 * подписи access-токена — означает, что «отозвать устройство» начинает
 * работать с задержкой до 15 минут, а это ровно та функция, ради которой
 * сессии вообще введены. Запрос идёт по первичному ключу.
 */
export async function isSessionActive(db: Db, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function revokeSession(
  db: DbExecutor,
  args: { scope: Scope; sessionId: string; reason: string },
): Promise<boolean> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: args.reason })
    .where(args.scope.own(sessions, eq(sessions.id, args.sessionId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return result.length > 0;
}

export async function revokeAllSessions(
  db: DbExecutor,
  args: { scope: Scope; exceptSessionId?: string; reason: string },
): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: args.reason })
    .where(
      args.scope.own(
        sessions,
        isNull(sessions.revokedAt),
        args.exceptSessionId ? ne(sessions.id, args.exceptSessionId) : undefined,
      ),
    )
    .returning({ id: sessions.id });
  return result.length;
}

/** Список активных устройств (§6.4). */
export async function listSessions(
  db: Db,
  args: { scope: Scope; currentSessionId: string },
): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      // inet приводится к тексту явно: иначе драйвер отдаёт его как объект.
      ip: sql<string | null>`${sessions.ip}::text`,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(args.scope.own(sessions, isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastUsedAt));

  return rows.map((row) => {
    const ua = parseUserAgent(row.userAgent);
    return {
      id: row.id,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: row.id === args.currentSessionId,
    };
  });
}
