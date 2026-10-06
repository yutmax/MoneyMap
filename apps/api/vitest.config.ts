import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Модуль env валидирует окружение при импорте и падает, если его нет —
    // это сознательное решение (см. lib/env.ts), поэтому тестам нужен
    // минимальный валидный набор.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://moneymap:moneymap@localhost:5432/moneymap_test',
      JWT_SECRET: 'test-secret-ровно-для-тестов-не-меньше-32-символов',
      PASSWORD_BREACH_CHECK: 'false',
    },
  },
});
