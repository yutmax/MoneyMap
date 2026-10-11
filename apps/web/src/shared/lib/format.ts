/**
 * Дата операции без времени.
 *
 * occurred_on — это date, а не момент: «пятое октября» одинаково для всех
 * часовых поясов. Разбирать его как полночь UTC и печатать в локальной зоне
 * значило бы сдвинуть часть дат на сутки назад.
 */
export function formatDate(isoDate: string, locale = 'ru'): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Дата и время «последней активности» в списке устройств. */
export function formatDateTime(iso: string, locale = 'ru'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * «2 часа назад». Intl.RelativeTimeFormat сам подбирает падеж и число,
 * поэтому склонять руками не нужно.
 */
export function formatRelative(iso: string, locale = 'ru'): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = new Date(iso).getTime() - Date.now();

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(Math.round(diffMs / 1000), 'second');
}
