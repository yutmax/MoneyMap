import { defineConfig } from 'tsup';

export default defineConfig({
  // Миграции и сид — отдельные точки входа: в проде они запускаются
  // своим шагом деплоя, а не из процесса приложения (§10.2).
  entry: ['src/server.ts', 'src/scripts/migrate.ts', 'src/scripts/seed.ts'],
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
