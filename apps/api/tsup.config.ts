import { defineConfig } from 'tsup';

export default defineConfig({
  // Миграции, сид и наполнение курсов — отдельные точки входа: в проде они
  // запускаются своим шагом деплоя, а не из процесса приложения (§10.2).
  entry: [
    'src/server.ts',
    'src/scripts/migrate.ts',
    'src/scripts/seed.ts',
    'src/scripts/rates.ts',
    'src/scripts/snapshots.ts',
  ],
  outDir: 'dist',
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Воркспейс-пакет инлайнится: в прод-образ попадает только apps/api.
  noExternal: ['@moneymap/shared'],
  // argon2 — нативный модуль, бандлить нельзя.
  external: ['argon2'],
});
