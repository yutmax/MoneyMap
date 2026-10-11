import { env } from './env.ts';

/**
 * Откуда вошли (§6.4).
 *
 * Адрес в списке устройств отвечает на вопрос «это точно я?», а на голый
 * IP так не ответишь: человек не помнит своих адресов. Город и страна —
 * помнит.
 *
 * Данные берутся у внешнего сервиса в момент входа и складываются в сессию,
 * а не запрашиваются при каждом открытии списка. Три причины: список
 * открывается чаще, чем происходят входы; к адресу привязано событие
 * прошлого, и показывать для него сегодняшнюю привязку неверно; и падение
 * чужого сервиса не должно ломать страницу.
 *
 * Тот же приём, что и у проверки пароля по базе утечек: внешний вызов на
 * пути аутентификации, с выключателем в окружении — на случай сервера без
 * исходящей сети или нежелания отдавать адреса на сторону.
 */

export interface GeoLocation {
  /** ISO-3166-1 alpha-2. Название страны соберёт интерфейс: оно зависит от языка. */
  countryCode: string;
  /** Как его называет источник, по-английски: города Intl не переводит. */
  city: string | null;
}

const TIMEOUT_MS = 5000;

/** Адрес без маски и без обёртки IPv4-in-IPv6: '::ffff:1.2.3.4/32' → '1.2.3.4'. */
export function normalizeIp(ip: string): string {
  const bare = ip.trim().replace(/\/\d+$/, '');
  return bare.toLowerCase().startsWith('::ffff:') ? bare.slice('::ffff:'.length) : bare;
}

/**
 * Адреса, у которых географии нет по определению: локальные, частные сети,
 * link-local и диапазон операторского NAT.
 */
function isPrivate(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  const v6 = ip.toLowerCase();
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb')
  );
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Определяет страну и город по адресу. Возвращает null, если не вышло:
 * ошибка — не повод отказать во входе, поле просто останется пустым.
 *
 * ipwho.is выбран за то, что у него нет ключей и регистрации, он отвечает
 * по HTTPS и не требует ничего, кроме адреса. Цена — чужой бесплатный
 * сервис в цепочке: поэтому таймаут, поэтому null вместо исключения
 * и поэтому выключатель.
 */
export async function lookupLocation(ip: string | null): Promise<GeoLocation | null> {
  if (!env.GEOIP_LOOKUP || !ip) return null;

  const address = normalizeIp(ip);
  if (address === '' || isPrivate(address)) return null;

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(address)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    // Сервис отвечает 200 и на неудачу, отличая её полем success.
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return null;
    const data = payload as Record<string, unknown>;
    if (data.success !== true) return null;

    const code = asString(data.country_code)?.toUpperCase();
    if (!code || !/^[A-Z]{2}$/.test(code)) return null;

    return { countryCode: code, city: asString(data.city) };
  } catch {
    return null;
  }
}
