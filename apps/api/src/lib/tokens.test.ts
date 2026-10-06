import { describe, expect, it } from 'vitest';
import {
  addDays,
  addHours,
  generateOpaqueToken,
  hashToken,
  safeEqual,
  signAccessToken,
  verifyAccessToken,
} from './tokens.ts';

describe('access-токен', () => {
  const payload = {
    userId: '6f1b4e4a-0000-4000-8000-000000000001',
    sessionId: '6f1b4e4a-0000-4000-8000-000000000002',
  };

  it('подписывает и читает обратно', () => {
    expect(verifyAccessToken(signAccessToken(payload))).toEqual(payload);
  });

  it('отвергает подделанную подпись', () => {
    const token = signAccessToken(payload);
    // Меняем последний символ подписи.
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyAccessToken(tampered)).toBeNull();
  });

  it('отвергает мусор вместо токена', () => {
    expect(verifyAccessToken('')).toBeNull();
    expect(verifyAccessToken('не.токен.вообще')).toBeNull();
  });

  it('отвергает токен, подписанный алгоритмом none', () => {
    // Классическая атака на JWT: alg: none с пустой подписью.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(verifyAccessToken(`${header}.${body}.`)).toBeNull();
  });
});

describe('opaque-токены', () => {
  it('выдаёт разные значения', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(500);
  });

  it('использует base64url — токен безопасен в заголовке и куке', () => {
    expect(generateOpaqueToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('хеш детерминирован и не содержит исходного значения', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('сравнение за постоянное время', () => {
  it('сравнивает по значению', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('не падает на разной длине', () => {
    // timingSafeEqual на буферах разной длины бросает исключение — отсюда
    // проверка длины до вызова.
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});

describe('арифметика дат', () => {
  it('не мутирует исходную дату', () => {
    const start = new Date('2026-01-31T12:00:00.000Z');
    const later = addDays(start, 30);
    expect(start.toISOString()).toBe('2026-01-31T12:00:00.000Z');
    expect(later.toISOString()).toBe('2026-03-02T12:00:00.000Z');
  });

  it('считает часы', () => {
    expect(addHours(new Date('2026-01-01T23:00:00.000Z'), 2).toISOString()).toBe(
      '2026-01-02T01:00:00.000Z',
    );
  });
});
