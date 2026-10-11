import { shiftDays, todayUtc } from '@moneymap/shared';
import { db, pg } from '../db/index.ts';
import { scopeOf } from '../lib/scoping.ts';
import { saveSnapshot, usersForSnapshots } from '../modules/summary/summary.service.ts';

/**
 * Ручной расчёт снимков net worth.
 *
 * Нужен для истории: фоновая задача считает только сегодняшний день, и без
 * наполнения график начинается с даты установки приложения, хотя операции
 * в нём есть и за прошлый год.
 *
 *   pnpm db:snapshots            — сегодня
 *   pnpm db:snapshots 2026-09-01 — на дату
 *   pnpm db:snapshots --days 365 — за последний год
 *
 * Курсы залить раньше снимков: курса на прошлую дату нет — возьмётся
 * последний известный, и историческая точка посчитается по сегодняшнему
 * курсу. Сначала `pnpm db:rates --days 365`, потом это.
 */
function datesFromArgs(argv: string[]): string[] {
  const daysIndex = argv.indexOf('--days');
  if (daysIndex !== -1) {
    const days = Number(argv[daysIndex + 1]);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new Error('--days ожидает целое число от 1 до 3650');
    }
    return Array.from({ length: days }, (_, i) => shiftDays(todayUtc(), i - days + 1));
  }

  const date = argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  return [date ?? todayUtc()];
}

try {
  const dates = datesFromArgs(process.argv.slice(2));
  const userIds = await usersForSnapshots(db);

  for (const userId of userIds) {
    const scope = scopeOf(userId);
    let last = '';
    for (const date of dates) {
      const { summary } = await saveSnapshot(db, scope, date);
      last = `${summary.total} ${summary.baseCurrency}`;
    }
    console.log(`${userId}: ${dates.length} снимков, на ${dates.at(-1)} — ${last}`);
  }

  console.log(`Готово: ${userIds.length} пользователей.`);
  await pg.end();
} catch (error) {
  console.error('Снимки не посчитаны:', error);
  await pg.end();
  process.exit(1);
}
