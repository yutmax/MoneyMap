import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  msg,
  parseMessage,
  pickLocale,
  resources,
  translate,
} from './index.ts';

/** Плоский список ключей: `errors.csrf`, `auth.login.title` и т.д. */
function flatKeys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k));
}

/**
 * Формы множественного числа есть не у всех языков: в русском — one/few/many,
 * в английском — one/other. Сравнивать их между словарями бессмысленно.
 */
const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/;

describe('словари', () => {
  const base = flatKeys(resources[DEFAULT_LOCALE])
    .filter((k) => !PLURAL_SUFFIX.test(k))
    .sort();

  for (const locale of LOCALES) {
    it(`${locale}: тот же набор ключей, что и в ${DEFAULT_LOCALE}`, () => {
      const keys = flatKeys(resources[locale])
        .filter((k) => !PLURAL_SUFFIX.test(k))
        .sort();
      expect(keys).toEqual(base);
    });

    it(`${locale}: нет пустых строк`, () => {
      const empty = flatKeys(resources[locale]).filter(
        (key) => translate(locale, key).trim().length === 0,
      );
      expect(empty).toEqual([]);
    });
  }

  it('у каждого плейсхолдера есть пара во всех языках', () => {
    const placeholders = (locale: (typeof LOCALES)[number], key: string) =>
      [...translate(locale, key).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

    for (const key of base) {
      const expected = placeholders(DEFAULT_LOCALE, key);
      for (const locale of LOCALES) {
        expect({ key, locale, placeholders: placeholders(locale, key) }).toEqual({
          key,
          locale,
          placeholders: expected,
        });
      }
    }
  });
});

describe('msg / parseMessage', () => {
  it('упаковывает и разбирает параметры', () => {
    const packed = msg('validation.password.min', { count: 8 });
    expect(parseMessage(packed)).toEqual({ key: 'validation.password.min', params: { count: 8 } });
  });

  it('ключ без параметров остаётся собой', () => {
    expect(parseMessage('errors.csrf')).toEqual({ key: 'errors.csrf', params: {} });
  });

  it('битые параметры не роняют разбор', () => {
    expect(parseMessage('errors.csrf::{не json')).toEqual({ key: 'errors.csrf', params: {} });
  });
});

describe('translate', () => {
  it('подставляет параметры', () => {
    expect(translate('ru', msg('validation.password.min', { count: 8 }))).toBe(
      'Минимум 8 символов',
    );
    expect(translate('en', msg('validation.password.min', { count: 8 }))).toBe(
      'At least 8 characters',
    );
  });

  it('неизвестный ключ возвращается как есть — забытый перевод должен быть виден', () => {
    expect(translate('ru', 'nope.not.here')).toBe('nope.not.here');
  });

  it('плейсхолдер без значения остаётся нетронутым', () => {
    expect(translate('ru', 'errors.routeNotFound')).toContain('{{method}}');
  });
});

describe('pickLocale', () => {
  it.each([
    ['en-US,en;q=0.9,ru;q=0.8', 'en'],
    ['ru-RU,ru;q=0.9', 'ru'],
    ['de-DE,de;q=0.9', DEFAULT_LOCALE],
    ['', DEFAULT_LOCALE],
    [undefined, DEFAULT_LOCALE],
  ])('%s → %s', (header, expected) => {
    expect(pickLocale(header)).toBe(expected);
  });

  it('учитывает q-веса, а не порядок', () => {
    expect(pickLocale('de;q=1.0,en;q=0.9,ru;q=0.95')).toBe('ru');
  });
});
