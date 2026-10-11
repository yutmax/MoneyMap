import { shiftDays, todayUtc } from '@moneymap/shared';
import { db, pg } from '../db/index.ts';
import { refreshRates } from '../modules/rates/rate.service.ts';

/**
 * Ручная загрузка курсов.
 *
 * Нужна в двух случаях: первый выкат, когда таблица пуста и фоновая задача
 * ещё не просыпалась, и наполнение истории, без которой график net worth
 * начинается с сегодняшнего дня.
 *
 *   pnpm db:rates            — курсы на сегодня
 *   pnpm db:rates 2026-10-01 — курсы на дату
 *   pnpm db:rates --days 30  — последние 30 дней
 */
const log = { warn: (obj: unknown, msg: string) => console.warn(msg, obj) };

function datesFromArgs(argv: string[]): string[] {
  const daysIndex = argv.indexOf('--days');
  if (daysIndex !== -1) {
    const days = Number(argv[daysIndex + 1]);
    if (!Number.isInteger(days) || days < 1 || days > 400) {
      throw new Error('--days ожидает целое число от 1 до 400');
    }
    // От старых к новым: так в логе видно, как наполняется история, а не
    // обратный отсчёт.
    return Array.from({ length: days }, (_, i) => shiftDays(todayUtc(), i - days + 1));
  }

  const date = argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  return [date ?? todayUtc()];
}

try {
  for (const date of datesFromArgs(process.argv.slice(2))) {
    const result = await refreshRates(db, date, log);
    const missing = result.missing.length > 0 ? `, без курса: ${result.missing.join(', ')}` : '';
    console.log(
      `${result.date}: ${result.saved} курсов (${JSON.stringify(result.bySource)})${missing}`,
    );
  }
  await pg.end();
} catch (error) {
  console.error('Курсы не загружены:', error);
  await pg.end();
  process.exit(1);
}
