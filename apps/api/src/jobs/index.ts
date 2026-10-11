import { todayUtc } from '@moneymap/shared';
import type { FastifyBaseLogger } from 'fastify';
import { PgBoss, type Job } from 'pg-boss';
import { db } from '../db/index.ts';
import { env } from '../lib/env.ts';
import { refreshRates } from '../modules/rates/rate.service.ts';
import { saveSnapshot, usersForSnapshots } from '../modules/summary/summary.service.ts';
import { scopeOf } from '../lib/scoping.ts';

/**
 * Фоновые задачи (§3.1): pg-boss на том же Postgres.
 *
 * Не node-cron и не setInterval, хотя задач всего две: расписание в памяти
 * процесса — это задача, пропущенная при каждом рестарте, и две задачи,
 * запущенные одновременно, когда процессов станет два. pg-boss держит
 * расписание и блокировку в базе, то есть там, где они переживут и то, и
 * другое.
 */

const QUEUES = {
  rates: 'rates.refresh',
  snapshots: 'net-worth.snapshot',
} as const;

/** Дата, на которую считать. Пустая — значит сегодня. */
interface DatedJob {
  date?: string;
}

/**
 * Дата из задания. У задания из расписания `data` равно null, а не пустому
 * объекту, и обращение к полю напрямую роняло обработчик — ошибку при этом
 * видно только в таблице заданий, в логе приложения её нет.
 */
function dateOf(job: Job<DatedJob> | undefined): string | undefined {
  return job?.data?.date;
}

/**
 * Обёртка, которая пишет ошибку задачи в лог приложения.
 *
 * pg-boss складывает её в собственную таблицу и повторяет попытку, но в логе
 * не оставляет ничего: в `error` летят только сбои самой очереди. Упавшая
 * загрузка курсов должна быть видна там, где смотрят логи, а не только тому,
 * кто знает про схему pgboss. Ошибка пробрасывается дальше — повтор нужен.
 */
async function logged(
  log: FastifyBaseLogger,
  queue: string,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    log.error({ err: error, queue }, 'Фоновая задача упала');
    throw error;
  }
}

export interface Jobs {
  /** Прогоняет задачу немедленно, минуя расписание: для ручного запуска. */
  run(queue: keyof typeof QUEUES, date?: string): Promise<void>;
  stop(): Promise<void>;
}

async function ensureQueue(boss: PgBoss, name: string): Promise<void> {
  // createQueue на существующей очереди — ошибка, а старт сервера обязан
  // быть повторяемым: очередь создаётся один раз, процесс поднимается много.
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
}

/**
 * Ежедневная загрузка курсов (§8.5).
 *
 * `missed: 'once'` вместо пропуска: сервер мог быть выключен в момент
 * запуска задачи, и единственный догоняющий прогон дешевле дырки в курсах.
 */
async function refreshRatesJob(log: FastifyBaseLogger, date = todayUtc()): Promise<void> {
  const result = await refreshRates(db, date, log);
  if (result.missing.length > 0) {
    log.warn(result, 'Курсы загружены частично');
  } else {
    log.info(result, 'Курсы загружены');
  }
}

/**
 * Ежедневный снимок net worth (§8.6).
 *
 * Пользователи обходятся в одной задаче: их десятки, и запрос на каждого
 * быстрее, чем накладные расходы на отдельное задание в очереди. Когда
 * пользователей станет столько, что обход не укладывается в задачу, —
 * это станет рассылкой задания на пользователя, и больше ничего не изменится.
 */
async function snapshotJob(log: FastifyBaseLogger, date = todayUtc()): Promise<void> {
  const userIds = await usersForSnapshots(db);
  let saved = 0;

  for (const userId of userIds) {
    try {
      await saveSnapshot(db, scopeOf(userId), date);
      saved += 1;
    } catch (error) {
      // Один пользователь без снимка не повод лишить снимка остальных:
      // пропуск — это дырка на графике, ошибка задачи — отсутствие графика.
      log.error({ err: error, userId }, 'Снимок не посчитан');
    }
  }

  log.info({ date, saved, total: userIds.length }, 'Снимки net worth посчитаны');
}

export async function startJobs(log: FastifyBaseLogger): Promise<Jobs | null> {
  if (!env.JOBS_ENABLED) {
    log.info('Фоновые задачи выключены (JOBS_ENABLED=false)');
    return null;
  }

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    // Своя схема: таблицы очереди не имеют отношения к модели приложения,
    // и в выводе миграций Drizzle им делать нечего.
    schema: 'pgboss',
    // Две задачи в сутки не нуждаются в пуле: лишние соединения на сервере
    // с одним ядром отнимаются у запросов.
    max: 2,
    application_name: 'moneymap-jobs',
  });

  // Подписка на 'error' обязательна: EventEmitter без слушателя этого
  // события бросает исключение в пустоту и убивает процесс. А без фоновых
  // задач приложение работает — просто курсы остаются вчерашними.
  //
  // Приведение типа — цена того, что pg-boss объявляет базовый EventEmitter
  // дефолтным импортом 'node:events'. При esModuleInterop: false такой
  // импорт типизируется пустым, и методы подписки до нас не доходят.
  const emitter = boss as unknown as {
    on(event: 'error', listener: (error: Error) => void): unknown;
  };
  emitter.on('error', (error) => log.error({ err: error }, 'Ошибка очереди задач'));

  await boss.start();

  for (const queue of Object.values(QUEUES)) await ensureQueue(boss, queue);

  await boss.work<DatedJob>(QUEUES.rates, { batchSize: 1 }, async ([job]) =>
    logged(log, QUEUES.rates, () => refreshRatesJob(log, dateOf(job))),
  );
  await boss.work<DatedJob>(QUEUES.snapshots, { batchSize: 1 }, async ([job]) =>
    logged(log, QUEUES.snapshots, () => snapshotJob(log, dateOf(job))),
  );

  // Расписание в UTC, а не в таймзоне сервера: дата курса — величина по UTC,
  // и смена таймзоны машины не должна сдвигать загрузку на другие сутки.
  await boss.schedule(QUEUES.rates, env.RATES_CRON, null, { tz: 'UTC', missed: 'once' });
  await boss.schedule(QUEUES.snapshots, env.SNAPSHOTS_CRON, null, { tz: 'UTC', missed: 'once' });

  log.info({ rates: env.RATES_CRON, snapshots: env.SNAPSHOTS_CRON }, 'Фоновые задачи запущены');

  return {
    run: async (queue, date) => {
      await boss.send(QUEUES[queue], date ? { date } : {});
    },
    stop: () => boss.stop({ graceful: true }),
  };
}
