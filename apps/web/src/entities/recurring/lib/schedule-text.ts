import type { RecurringRuleResponse } from '@moneymap/shared';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Расписание человеческими словами: «каждый месяц, 5-го».
 *
 * Собирается на клиенте, а не приходит строкой с сервера: сервер склеил бы
 * её на одном языке, и в английском интерфейсе осталось бы «каждый месяц».
 * Из тех же соображений тут не строится падежей — только подстановка
 * в заранее переведённый шаблон.
 */
export function scheduleText(rule: RecurringRuleResponse, t: Translate, locale: string): string {
  const every =
    rule.interval === 1
      ? t(`recurring.every.${rule.freq}`)
      : t(`recurring.everyN.${rule.freq}`, { count: rule.interval });

  if (rule.freq === 'weekly' && rule.weekday !== null) {
    return `${every}, ${weekdayName(rule.weekday, locale)}`;
  }

  if ((rule.freq === 'monthly' || rule.freq === 'yearly') && rule.dayOfMonth !== null) {
    const day = t('recurring.onDay', { day: rule.dayOfMonth });
    // Про короткий месяц говорим только тогда, когда он вообще случится.
    const tail = rule.dayOfMonth > 28 ? `, ${t(`recurring.policy.${rule.monthEndPolicy}`)}` : '';
    return `${every}, ${day}${tail}`;
  }

  return every;
}

/** Название дня недели на языке интерфейса. 0 — воскресенье. */
export function weekdayName(weekday: number, locale: string): string {
  // Опорная дата — воскресенье 4 января 1970 года, к нему прибавляется номер.
  const date = new Date(Date.UTC(1970, 0, 4 + weekday));
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date);
}
