import { describe, expect, it } from 'vitest';
import { firstOccurrence, nextOccurrence, occurrencesBetween } from './recurrence.ts';
import type { Recurrence } from './recurrence.ts';

/**
 * Тесты расписаний (§8.7) — с упором на то, из-за чего списания теряются
 * или двоятся: короткие месяцы, границы правила, длинные интервалы.
 */
function rule(patch: Partial<Recurrence>): Recurrence {
  return {
    freq: 'monthly',
    interval: 1,
    weekday: null,
    dayOfMonth: null,
    monthEndPolicy: 'clamp',
    startOn: '2026-01-15',
    endOn: null,
    ...patch,
  };
}

describe('ежедневные', () => {
  it('идут подряд', () => {
    const daily = rule({ freq: 'daily', startOn: '2026-03-01' });
    expect(firstOccurrence(daily)).toBe('2026-03-01');
    expect(nextOccurrence(daily, '2026-03-01')).toBe('2026-03-02');
  });

  it('держат шаг через границу месяца', () => {
    const every3 = rule({ freq: 'daily', interval: 3, startOn: '2026-01-28' });
    expect(occurrencesBetween(every3, '2026-01-28', '2026-02-10')).toEqual([
      '2026-01-28',
      '2026-01-31',
      '2026-02-03',
      '2026-02-06',
      '2026-02-09',
    ]);
  });

  it('не перебирают периоды с нуля на давнем правиле', () => {
    // Правило из 2015 года: без вычисления номера периода это тысячи шагов.
    const old = rule({ freq: 'daily', startOn: '2015-01-01' });
    expect(nextOccurrence(old, '2026-06-10')).toBe('2026-06-11');
  });
});

describe('еженедельные', () => {
  it('привязаны к дню недели, а не к дате начала', () => {
    // 2026-03-02 — понедельник, правило на пятницу (5).
    const friday = rule({ freq: 'weekly', weekday: 5, startOn: '2026-03-02' });
    expect(firstOccurrence(friday)).toBe('2026-03-06');
    expect(nextOccurrence(friday, '2026-03-06')).toBe('2026-03-13');
  });

  it('берут день недели из даты начала, если он не задан', () => {
    const weekly = rule({ freq: 'weekly', startOn: '2026-03-04' });
    expect(firstOccurrence(weekly)).toBe('2026-03-04');
    expect(nextOccurrence(weekly, '2026-03-04')).toBe('2026-03-11');
  });

  it('считают интервал в неделях', () => {
    const biweekly = rule({ freq: 'weekly', interval: 2, weekday: 1, startOn: '2026-03-02' });
    expect(occurrencesBetween(biweekly, '2026-03-01', '2026-04-15')).toEqual([
      '2026-03-02',
      '2026-03-16',
      '2026-03-30',
      '2026-04-13',
    ]);
  });
});

describe('короткий месяц', () => {
  it('clamp прижимает 31-е к последнему дню', () => {
    const rent = rule({ dayOfMonth: 31, startOn: '2026-01-31', monthEndPolicy: 'clamp' });
    expect(occurrencesBetween(rent, '2026-01-01', '2026-05-01')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('skip пропускает месяц целиком', () => {
    const rent = rule({ dayOfMonth: 31, startOn: '2026-01-31', monthEndPolicy: 'skip' });
    expect(occurrencesBetween(rent, '2026-01-01', '2026-05-01')).toEqual([
      '2026-01-31',
      '2026-03-31',
    ]);
  });

  it('29 февраля в високосном году существует', () => {
    // 2028 високосный, 2026 — нет.
    const leap = rule({ freq: 'yearly', dayOfMonth: 29, startOn: '2024-02-29' });
    expect(nextOccurrence(leap, '2024-02-29')).toBe('2025-02-28');
    expect(nextOccurrence(leap, '2027-03-01')).toBe('2028-02-29');
  });

  it('правило, которое не может сработать, возвращает null, а не висит', () => {
    // Каждые 12 месяцев 31-го, начиная с февраля, с политикой skip:
    // февраль тридцать первого не бывает никогда.
    const never = rule({
      interval: 12,
      dayOfMonth: 31,
      startOn: '2026-02-01',
      monthEndPolicy: 'skip',
    });
    expect(firstOccurrence(never)).toBeNull();
  });
});

describe('границы правила', () => {
  it('первое срабатывание не раньше даты начала', () => {
    // Число месяца раньше даты старта — первый месяц пропускается.
    const salary = rule({ dayOfMonth: 5, startOn: '2026-01-15' });
    expect(firstOccurrence(salary)).toBe('2026-02-05');
  });

  it('после даты окончания срабатываний нет', () => {
    const limited = rule({ dayOfMonth: 10, startOn: '2026-01-01', endOn: '2026-03-31' });
    expect(occurrencesBetween(limited, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ]);
    expect(nextOccurrence(limited, '2026-03-10')).toBeNull();
  });

  it('интервал в месяцах считается от месяца начала', () => {
    const quarterly = rule({ interval: 3, dayOfMonth: 1, startOn: '2026-01-01' });
    expect(occurrencesBetween(quarterly, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
    ]);
  });
});

describe('выборка отрезком', () => {
  it('включает обе границы', () => {
    const monthly = rule({ dayOfMonth: 10, startOn: '2026-01-01' });
    expect(occurrencesBetween(monthly, '2026-02-10', '2026-04-10')).toEqual([
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
    ]);
  });

  it('не отдаёт больше лимита', () => {
    const daily = rule({ freq: 'daily', startOn: '2026-01-01' });
    expect(occurrencesBetween(daily, '2026-01-01', '2026-12-31', 5)).toHaveLength(5);
  });
});
