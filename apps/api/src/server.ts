import { buildApp } from './app.ts';
import { pg } from './db/index.ts';
import { env } from './lib/env.ts';

const app = await buildApp();

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Останавливаюсь');
  try {
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
