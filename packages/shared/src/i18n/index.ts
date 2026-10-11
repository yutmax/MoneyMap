import en from './locales/en.json' with { type: 'json' };
import ru from './locales/ru.json' with { type: 'json' };

export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';

export type Dictionary = { [key: string]: string | Dictionary };

/**
 * Словари лежат рядом со схемами, потому что сообщения валидации рождаются
 * в zod и показываются и на сервере (в ответе API), и в формах.
 *
 * Тип — свободное дерево строк, а не `typeof ru`: наборы ключей у языков
 * совпадают не полностью и не должны. Формы множественного числа разные —
 * в русском one/few/many, в английском one/other, — и требовать от английского
 * словаря `revoked_few` значит требовать выдумать форму, которой в языке нет.
 * Совпадение всех остальных ключей проверяет тест i18n.test.ts.
 */
export const resources: Record<Locale, Dictionary> = { ru, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/* ────────────────────────── ключи с параметрами ─────────────────────────── */

const PARAMS_SEPARATOR = '::';

/**
 * Упаковывает ключ перевода вместе с параметрами в одну строку.
 *
 * Нужно потому, что zod умеет отдать только строку `message`, а сообщение
 * «Минимум 8 символов» обязано брать восьмёрку оттуда же, откуда её берёт
 * сама проверка. Иначе число живёт в двух местах и однажды разъезжается —
 * схема требует восемь, а подсказка обещает десять.
 *
 *   msg('validation.password.min', { count: 8 })
 *   → 'validation.password.min::{"count":8}'
 */
export function msg(key: string, params?: Record<string, string | number>): string {
  return params ? `${key}${PARAMS_SEPARATOR}${JSON.stringify(params)}` : key;
}

/** Разбирает то, что упаковал `msg`. Строка без параметров — просто ключ. */
export function parseMessage(value: string): {
  key: string;
  params: Record<string, string | number>;
} {
  const at = value.indexOf(PARAMS_SEPARATOR);
  if (at === -1) return { key: value, params: {} };

  const key = value.slice(0, at);
  try {
    return { key, params: JSON.parse(value.slice(at + PARAMS_SEPARATOR.length)) as never };
  } catch {
    return { key, params: {} };
  }
}

/* ──────────────────────────────── перевод ───────────────────────────────── */

function lookup(locale: Locale, key: string): string | undefined {
  let node: unknown = resources[locale];
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Перевод без зависимостей — для API, которому нужны только ветки
 * `validation` и `errors`. На фронтенде работает i18next: там нужны
 * множественные числа, смена языка на лету и React-биндинги, и писать это
 * самому смысла нет.
 */
export function translate(locale: Locale, message: string): string {
  const { key, params } = parseMessage(message);
  const template = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key);

  // Ключа нет ни в одном словаре — показываем сам ключ. Увидеть
  // `validation.password.min` в интерфейсе неприятно, но это честнее
  // пустоты и сразу указывает, что именно забыли перевести.
  if (template === undefined) return key;

  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Выбор языка по заголовку `Accept-Language`. */
export function pickLocale(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...rest] = part.trim().split(';');
      const q = rest.find((p) => p.trim().startsWith('q='));
      return { tag: (tag ?? '').toLowerCase(), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((entry) => entry.tag.length > 0 && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}
