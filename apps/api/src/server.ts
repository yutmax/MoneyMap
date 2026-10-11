import { buildApp } from './app.ts';
import { pg } from './db/index.ts';
import { startJobs } from './jobs/index.ts';
import { env } from './lib/env.ts';

const app = await buildApp();

// Воркер живёт в том же процессе, что и API (§3.1): на сервере с одним ядром
// отдельный контейнер ради двух задач в сутки стоил бы дороже, чем даёт.
// Когда задачи станут тяжелее, это станет отдельным процессом с тем же
// startJobs и без --listen.
const jobs = await startJobs(app.log);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Останавливаюсь');
  try {
    // Сначала задачи, потом пул: задача, которой оборвали соединение
    // посреди работы, оставляет за собой запись в состоянии «выполняется».
    await jobs?.stop();
    await app.close();
    await pg.end({ timeout: 5 });
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Ошибка при остановке');
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void shutdown(signal));
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error({ err: error }, 'Не удалось запустить сервер');
  process.exit(1);
}
