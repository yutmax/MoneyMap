import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, pg } from '../db/index.ts';

/**
 * Миграции запускаются отдельным шагом деплоя, а не из стартового хендлера
 * приложения (§10.2): при нескольких репликах это была бы гонка.
 */
// fileURLToPath, а не URL.pathname: на Windows pathname даёт «/D:/...».
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

try {
  console.log(`Применяю миграции из ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('Миграции применены.');
  await pg.end();
} catch (error) {
  console.error('Миграции не применились:', error);
  await pg.end();
  process.exit(1);
}
