import { daysBetween, daysInMonth, isoFrom, monthsBetween, shiftDays, weekdayOf } from './dates.ts';
import type { IsoDate } from './dates.ts';

/**
 * Расписание повторяющейся операции (§8.7).
 *
 * Вся арифметика дат собрана здесь и работает с календарными датами,
 * а не с моментами времени: «первого числа» — это число в календаре
 * пользователя, и переводить его в UTC и обратно значит однажды получить
 * тридцать первое января вместо первого февраля.
 *
 * Лежит в общем пакете, потому что считать нужно обеим сторонам: сервер
 * генерирует списания, а форма правила показывает, когда оно сработает,
 * ещё до сохранения.
 */

export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

/**
 * Что делать с правилом на 31-е число в месяце, где его нет (§8.7).
 * Выбор обязан быть явным: «прижать к последнему дню» и «пропустить месяц» —
 * оба разумны, и угадывать за человека, что он имел в виду, нельзя.
 */
export const MONTH_END_POLICIES = ['clamp', 'skip'] as const;
export type MonthEndPolicy = (typeof MONTH_END_POLICIES)[number];

export interface Recurrence {
  freq: RecurrenceFreq;
  /** Каждые N периодов. 1 — каждый. */
  interval: number;
  /** 0 — воскресенье, 6 — суббота. Только для weekly. */
  weekday: number | null;
  /** 1..31. Только для monthly и yearly. */
  dayOfMonth: number | null;
  monthEndPolicy: MonthEndPolicy;
  startOn: IsoDate;
  endOn: IsoDate | null;
}

/**
 * Предел перебора периодов.
 *
 * Нужен не от медленности, а от правил, которые не срабатывают никогда:
 * «каждые 12 месяцев 31-го числа» с началом в феврале и политикой skip —
 * бесконечный цикл, если его не ограничить. Двести периодов с запасом
 * покрывают любую реальную дыру в календаре.
 */
const MAX_PERIODS = 200;

/** Дата в месяце с учётом политики. null — месяц пропускается. */
function dayInMonth(
  year: number,
  month: number,
  day: number,
  policy: MonthEndPolicy,
): IsoDate | null {
  const length = daysInMonth(year, month);
  if (day <= length) return isoFrom(year, month, day);
  return policy === 'clamp' ? isoFrom(year, month, length) : null;
}

/** Первый день недели `weekday` не раньше `from`. */
function firstWeekday(from: IsoDate, weekday: number): IsoDate {
  const shift = (weekday - weekdayOf(from) + 7) % 7;
  return shiftDays(from, shift);
}

/**
 * Кандидат на срабатывание под номером `index`, считая от начала правила.
 * null — период есть, но срабатывания в нём нет (короткий месяц с policy skip).
 */
function candidate(rule: Recurrence, index: number): IsoDate | null {
  const step = Math.max(1, Math.trunc(rule.interval));
  const [year, month] = rule.startOn.split('-').map(Number) as [number, number, number];

  switch (rule.freq) {
    case 'daily':
      return shiftDays(rule.startOn, index * step);

    case 'weekly': {
      const anchor = firstWeekday(rule.startOn, rule.weekday ?? weekdayOf(rule.startOn));
      return shiftDays(anchor, index * step * 7);
    }

    case 'monthly': {
      const day = rule.dayOfMonth ?? Number(rule.startOn.slice(8, 10));
      // Месяцы считаются сложением к номеру: isoFrom нормализует переход
      // через декабрь сам, и отдельной арифметики по годам не нужно.
      const total = month - 1 + index * step;
      return dayInMonth(year + Math.floor(total / 12), (total % 12) + 1, day, rule.monthEndPolicy);
    }

    case 'yearly': {
      const day = rule.dayOfMonth ?? Number(rule.startOn.slice(8, 10));
      return dayInMonth(year + index * step, month, day, rule.monthEndPolicy);
    }
  }
}

/**
 * Номер периода, с которого имеет смысл искать срабатывание после `after`.
 *
 * Перебор с нуля для ежедневного правила, заведённого три года назад, — это
 * тысяча холостых шагов на каждый вызов. Здесь номер вычисляется сразу,
 * а перебор остаётся только для пропущенных периодов.
 */
function startIndex(rule: Recurrence, after: IsoDate): number {
  if (after <= rule.startOn) return 0;
  const step = Math.max(1, Math.trunc(rule.interval));

  switch (rule.freq) {
    case 'daily':
      return Math.max(0, Math.floor(daysBetween(rule.startOn, after) / step));

    case 'weekly': {
      const anchor = firstWeekday(rule.startOn, rule.weekday ?? weekdayOf(rule.startOn));
      if (after <= anchor) return 0;
      return Math.max(0, Math.floor(daysBetween(anchor, after) / (step * 7)));
    }

    case 'monthly':
      return Math.max(0, Math.floor(monthsBetween(rule.startOn, after) / step));

    case 'yearly':
      return Math.max(0, Math.floor(monthsBetween(rule.startOn, after) / (12 * step)));
  }
}

/** Срабатывание строго позже `after`, или null, если правило закончилось. */
export function nextOccurrence(rule: Recurrence, after: IsoDate): IsoDate | null {
  const from = startIndex(rule, after);

  for (let index = from; index < from + MAX_PERIODS; index += 1) {
    const date = candidate(rule, index);
    if (date === null) continue;
    if (date < rule.startOn) continue;
    // Выход за конец правила — не «пропустить и искать дальше»: дальше
    // будет только дальше.
    if (rule.endOn && date > rule.endOn) return null;
    if (date > after) return date;
  }
  return null;
}

/** Первое срабатывание правила. */
export function firstOccurrence(rule: Recurrence): IsoDate | null {
  return nextOccurrence(rule, shiftDays(rule.startOn, -1));
}

/**
 * Срабатывания в отрезке [from, to] включительно.
 *
 * `limit` — защита от правила «каждый день» на горизонте в год: список
 * предстоящих списаний такой длины всё равно никто не читает.
 */
export function occurrencesBetween(
  rule: Recurrence,
  from: IsoDate,
  to: IsoDate,
  limit = 100,
): IsoDate[] {
  const dates: IsoDate[] = [];
  let cursor = shiftDays(from, -1);

  while (dates.length < limit) {
    const date = nextOccurrence(rule, cursor);
    if (date === null || date > to) break;
    dates.push(date);
    cursor = date;
  }
  return dates;
}
