import type {
  ChangePasswordInput,
  LoginInput,
  MeResponse,
  RegisterInput,
  UpdateSettingsInput,
} from '@moneymap/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../db/index.ts';
import { userTokens, users } from '../../db/schema.ts';
import {
  badRequest,
  conflict,
  notFound,
  passwordCompromised,
  unauthorized,
} from '../../lib/errors.ts';
import { mailLinks, sendMail } from '../../lib/mailer.ts';
import {
  burnPasswordTime,
  hashPassword,
  isPasswordCompromised,
  needsRehash,
  verifyPassword,
} from '../../lib/password.ts';
import { Scope } from '../../lib/scoping.ts';
import { addHours, generateOpaqueToken, hashToken } from '../../lib/tokens.ts';
import { assertCurrencyExists } from '../reference/currency.service.ts';
import type { DeviceInfo, IssuedAuth } from './session.service.ts';
import { createSession, revokeAllSessions } from './session.service.ts';

const EMAIL_VERIFY_TTL_HOURS = 48;
const PASSWORD_RESET_TTL_HOURS = 1;

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

export function toMeResponse(user: {
  id: string;
  email: string;
  name: string;
  baseCurrency: string | null;
  timezone: string | null;
  onboardedAt: Date | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}): MeResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
    timezone: user.timezone,
    emailVerified: user.emailVerifiedAt !== null,
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueUserToken(
  db: Db,
  args: { userId: string; kind: 'email_verify' | 'password_reset'; ttlHours: number },
): Promise<string> {
  const token = generateOpaqueToken(32);
  await db.insert(userTokens).values({
    userId: args.userId,
    kind: args.kind,
    tokenHash: hashToken(token),
    expiresAt: addHours(new Date(), args.ttlHours),
  });
  return token;
}

/* ──────────────────────────────── register ───────────────────────────────── */

export async function register(
  db: Db,
  args: { input: RegisterInput; device: DeviceInfo; log: FastifyBaseLogger },
): Promise<{ user: MeResponse; auth: IssuedAuth }> {
  const { input } = args;

  if (await isPasswordCompromised(input.password)) throw passwordCompromised();

  const passwordHash = await hashPassword(input.password);

  let created: { id: string } | undefined;
  try {
    // Базовая валюта и таймзона остаются пустыми до онбординга: их задаёт
    // уже вошедший человек, см. modules/onboarding.
    [created] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash })
      .returning({ id: users.id });
  } catch (error) {
    // Регистрация сознательно сообщает о занятом email. Требование §6.5 о
    // неперечислимости пользователей сформулировано для входа; скрывать
    // занятость адреса на регистрации означает ломать её основной сценарий.
    if (isUniqueViolation(error)) throw conflict('Этот email уже зарегистрирован');
    throw error;
  }

  if (!created) throw new Error('Не удалось создать пользователя');

  const [user] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
  if (!user) throw new Error('Пользователь создан, но не читается');

  const verifyToken = await issueUserToken(db, {
    userId: user.id,
    kind: 'email_verify',
    ttlHours: EMAIL_VERIFY_TTL_HOURS,
  });

  sendMail(args.log, {
    to: user.email,
    subject: 'MoneyMap: подтвердите email',
    text: `${user.name}, добро пожаловать.\n\nПодтвердите адрес: ${mailLinks.verifyEmail(verifyToken)}\n\nСсылка действует ${EMAIL_VERIFY_TTL_HOURS} часа.\n`,
  });

  const auth = await createSession(db, { userId: user.id, device: args.device });
  return { user: toMeResponse(user), auth };
}

/* ───────────────────────────────── login ─────────────────────────────────── */

export async function login(
  db: Db,
  args: { input: LoginInput; device: DeviceInfo },
): Promise<{ user: MeResponse; auth: IssuedAuth }> {
  const [user] = await db.select().from(users).where(eq(users.email, args.input.email)).limit(1);

  if (!user) {
    // Тратим столько же времени на argon2, сколько потратили бы на реального
    // пользователя: без этого разница во времени отклика сама становится
    // способом перечислить зарегистрированные адреса (§6.5).
    await burnPasswordTime(args.input.password);
    throw unauthorized('Неверный email или пароль', 'login: unknown email');
  }

  const valid = await verifyPassword(user.passwordHash, args.input.password);
  if (!valid) throw unauthorized('Неверный email или пароль', 'login: wrong password');

  if (needsRehash(user.passwordHash)) {
    const rehashed = await hashPassword(args.input.password);
    await db
      .update(users)
      .set({ passwordHash: rehashed, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  const auth = await createSession(db, { userId: user.id, device: args.device });
  return { user: toMeResponse(user), auth };
}

/* ────────────────────────────────── me ──────────────────────────────────── */

export async function getMe(db: Db, userId: string): Promise<MeResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound('Пользователь не найден');
  return toMeResponse(user);
}

export async function updateSettings(
  db: Db,
  args: { userId: string; input: UpdateSettingsInput },
): Promise<MeResponse> {
  if (args.input.baseCurrency) await assertCurrencyExists(db, args.input.baseCurrency);

  const [updated] = await db
    .update(users)
    .set({ ...args.input, updatedAt: new Date() })
    .where(eq(users.id, args.userId))
    .returning();

  if (!updated) throw notFound('Пользователь не найден');
  return toMeResponse(updated);
}

/* ───────────────────────────────── пароль ───────────────────────────────── */

export async function changePassword(
  db: Db,
  args: { userId: string; currentSessionId: string; input: ChangePasswordInput },
): Promise<{ revokedSessions: number }> {
  const [user] = await db.select().from(users).where(eq(users.id, args.userId)).limit(1);
  if (!user) throw notFound('Пользователь не найден');

  const valid = await verifyPassword(user.passwordHash, args.input.currentPassword);
  if (!valid) {
    throw badRequest('Текущий пароль неверен', [
      { path: 'currentPassword', message: 'Неверный пароль' },
    ]);
  }

  if (await isPasswordCompromised(args.input.newPassword)) throw passwordCompromised();

  const passwordHash = await hashPassword(args.input.newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));

  // Смена пароля отзывает все сессии кроме текущей (§8.1).
  const revokedSessions = await revokeAllSessions(db, {
    scope: new Scope(user.id),
    exceptSessionId: args.currentSessionId,
    reason: 'password_changed',
  });

  return { revokedSessions };
}

/**
 * Запрос сброса пароля. Отвечает одинаково независимо от существования адреса:
 * здесь, в отличие от регистрации, запрос анонимный, и различающийся ответ
 * превратил бы эндпоинт в проверялку «есть ли такой пользователь».
 */
export async function requestPasswordReset(
  db: Db,
  args: { email: string; log: FastifyBaseLogger },
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, args.email)).limit(1);
  if (!user) {
    args.log.info({ email: args.email }, 'Сброс пароля запрошен для неизвестного адреса');
    return;
  }

  const token = await issueUserToken(db, {
    userId: user.id,
    kind: 'password_reset',
    ttlHours: PASSWORD_RESET_TTL_HOURS,
  });

  sendMail(args.log, {
    to: user.email,
    subject: 'MoneyMap: сброс пароля',
    text: `${user.name}, здравствуйте.\n\nСсылка для смены пароля: ${mailLinks.resetPassword(token)}\n\nСсылка одноразовая и действует ${PASSWORD_RESET_TTL_HOURS} час. Если вы не запрашивали сброс — просто проигнорируйте письмо.\n`,
  });
}

export async function resetPassword(
  db: Db,
  args: { token: string; password: string },
): Promise<void> {
  if (await isPasswordCompromised(args.password)) throw passwordCompromised();

  const tokenHash = hashToken(args.token);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(userTokens)
      .where(
        and(
          eq(userTokens.tokenHash, tokenHash),
          eq(userTokens.kind, 'password_reset'),
          isNull(userTokens.usedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      throw badRequest('Ссылка недействительна или истекла');
    }

    const passwordHash = await hashPassword(args.password);
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, row.userId));

    await tx.update(userTokens).set({ usedAt: new Date() }).where(eq(userTokens.id, row.id));

    // В отличие от смены пароля изнутри приложения, здесь гасим всё: сброс
    // запрашивают как раз тогда, когда доступ к аккаунту мог быть потерян.
    await revokeAllSessions(tx, { scope: new Scope(row.userId), reason: 'password_reset' });
  });
}

export async function verifyEmail(db: Db, token: string): Promise<void> {
  const tokenHash = hashToken(token);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(userTokens)
      .where(
        and(
          eq(userTokens.tokenHash, tokenHash),
          eq(userTokens.kind, 'email_verify'),
          isNull(userTokens.usedAt),
        ),
      )
      .for('update')
      .limit(1);

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      throw badRequest('Ссылка недействительна или истекла');
    }

    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, row.userId));

    await tx.update(userTokens).set({ usedAt: new Date() }).where(eq(userTokens.id, row.id));
  });
}
