import { z } from 'zod';

const booleanish = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().min(1, { message: 'DATABASE_URL обязателен' }),

    /** HS256-ключ для access-токенов. 32+ байта — иначе подпись имеет смысл формально. */
    JWT_SECRET: z.string().min(32, { message: 'JWT_SECRET короче 32 символов' }),

    /** Origin фронтенда для CORS и проверки CSRF. Несколько — через запятую. */
    WEB_ORIGIN: z.string().default('http://localhost:5173'),
    /** Базовый URL фронтенда для ссылок в письмах. */
    PUBLIC_WEB_URL: z.string().default('http://localhost:5173'),

    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: booleanish(false),

    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(60),

    /** Проверка пароля по HIBP (§6.5). Отключается, если нет исходящей сети. */
    PASSWORD_BREACH_CHECK: booleanish(true),

    /**
     * Определение страны и города по IP при входе (§6.4). Выключается, если
     * нет исходящей сети или не хочется отдавать адреса стороннему сервису.
     */
    GEOIP_LOOKUP: booleanish(true),

    /**
     * Фоновые задачи (§8.5, §8.6). Выключаются в тестах и в dev, где
     * лишний воркер на той же базе только мешает.
     */
    JOBS_ENABLED: booleanish(true),
    /** Загрузка курсов. По умолчанию ночью по UTC: источник обновляется днём. */
    RATES_CRON: z.string().default('15 3 * * *'),
    /** Снимок net worth. После курсов, чтобы считать по свежим. */
    SNAPSHOTS_CRON: z.string().default('45 3 * * *'),
    /**
     * Генерация регулярных операций. Раньше снимка: списание, созданное
     * сегодня, должно попасть в сегодняшний снимок, а не в завтрашний.
     */
    RECURRING_CRON: z.string().default('5 3 * * *'),
    /** Таймаут запроса к источнику курсов. */
    RATES_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    // Refresh-кука выставляется с Secure — без TLS аутентификация нерабочая (§4.3).
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'В production обязателен COOKIE_SECURE=true: refresh-кука требует Secure',
      });
    }
    if (env.WEB_ORIGIN.includes('localhost')) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: 'В production WEB_ORIGIN не может указывать на localhost',
      });
    }
  });

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    // Падаем до поднятия сервера: половинчато сконфигурированный сервер аутентификации
    // хуже, чем отсутствующий.
    throw new Error(`Некорректное окружение:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export const env = load();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Список разрешённых origin'ов фронтенда. */
export const allowedOrigins = env.WEB_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export type Env = typeof env;
