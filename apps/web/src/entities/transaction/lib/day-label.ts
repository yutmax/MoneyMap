import { shiftDays } from '@moneymap/shared';

/**
 * Заголовок дня в ленте операций: «Сегодня», «Вчера», дальше дата.
 *
 * Год печатается только у прошлых лет: в ленте за текущий год «2026 г.»
 * в каждом заголовке — это шум, а у прошлогодней операции без года
 * легко обмануться месяцем.
 */
export function dayLabel(
  isoDate: string,
  today: string,
  locale: string,
  words: { today: string; yesterday: string },
): string {
  if (isoDate === today) return words.today;
  if (isoDate === shiftDays(today, -1)) return words.yesterday;

  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
