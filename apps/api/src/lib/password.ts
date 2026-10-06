import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { env } from './env.ts';

/**
 * Параметры argon2id по текущей рекомендации OWASP (§3.1): m=19 MiB, t=2, p=1.
 * Меняя их, старые хеши не ломаются: argon2 хранит параметры внутри хеша.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Битый или чужой формат хеша — это не «пароль верный».
    return false;
  }
}

/**
 * Хеш несуществующего пароля. Нужен, чтобы при неизвестном email логин занимал
 * столько же времени, сколько при известном: иначе разница во времени отклика
 * сама становится API для перечисления пользователей (§6.5).
 */
let dummyHash: Promise<string> | null = null;

export function burnPasswordTime(password: string): Promise<boolean> {
  dummyHash ??= argon2.hash('moneymap-timing-equalizer', ARGON2_OPTIONS);
  return dummyHash.then((hash) => verifyPassword(hash, password));
}

/** Пароль, которому пора пересчитать хеш: параметры в БД слабее текущих. */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

/* ─────────────────────── проверка по утечкам (HIBP) ─────────────────────── */

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range';
const HIBP_TIMEOUT_MS = 2500;

/**
 * k-anonymity (§6.5): наружу уходят только первые 5 символов SHA-1, сам пароль
 * и его полный хеш не передаются никуда.
 *
 * Падает «открыто»: если сервис недоступен или отвечает медленно, регистрация
 * продолжается. Недоступный внешний сервис не должен блокировать вход в
 * собственное приложение.
 */
export async function isPasswordCompromised(password: string): Promise<boolean> {
  if (!env.PASSWORD_BREACH_CHECK) return false;

  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      headers: {
        // Выравнивает размер ответа, чтобы длина не выдавала запрошенный префикс.
        'Add-Padding': 'true',
        'User-Agent': 'MoneyMap-PasswordCheck',
      },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    if (!response.ok) return false;

    const body = await response.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, countRaw] = line.trim().split(':');
      if (hashSuffix !== suffix) continue;
      // Строки с padding приходят с count=0 — их надо отличать от реальных совпадений.
      return Number(countRaw ?? '0') > 0;
    }
    return false;
  } catch {
    return false;
  }
}
