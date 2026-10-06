import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * citext — регистронезависимый text. Нужен для email (§7), чтобы
 * Ivan@mail.com и ivan@mail.com были одной записью на уровне БД, а не только
 * благодаря нормализации в приложении.
 * Расширение включается первой строкой миграции 0000.
 */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/** inet — нативный тип Postgres для IP-адресов, валидирует значение сам. */
const inet = customType<{ data: string }>({
  dataType: () => 'inet',
});

// Два отдельных хелпера, а не один с флагом: ветвящийся возвращал объединение
// типов, из которого Drizzle выводил колонку как nullable, несмотря на notNull().
const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });
const timestamptzNow = () => timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const currencyKind = pgEnum('currency_kind', ['fiat', 'crypto']);
export const userTokenKind = pgEnum('user_token_kind', ['email_verify', 'password_reset']);

/* ─────────────────────────────── currencies ─────────────────────────────── */

export const currencies = pgTable('currencies', {
  code: text().primaryKey(),
  kind: currencyKind().notNull(),
  /** Знаков после запятой при отображении: 2 для USD, 8 для BTC, 18 для ETH. */
  decimals: integer().notNull(),
  symbol: text().notNull(),
  name: text().notNull(),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(1000),
});

/* ───────────────────────────────── users ────────────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: citext().notNull(),
    name: text().notNull(),
    passwordHash: text().notNull(),
    /** Валюта сводного баланса (§8.6). */
    baseCurrency: text()
      .notNull()
      .references(() => currencies.code),
    /** IANA, напр. 'Europe/Kyiv'. Нужна для дат регулярных правил (§8.7). */
    timezone: text().notNull(),
    emailVerifiedAt: timestamptz(),
    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email)],
);

/* ──────────────────────────────── sessions ──────────────────────────────── */

/**
 * Логическая сессия = одно устройство. Живёт через множество ротаций
 * refresh-токена, поэтому её id стабилен и именно он лежит в access-токене
 * и показывается в списке устройств (§6.4).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text(),
    ip: inet(),
    createdAt: timestamptzNow(),
    /** Обновляется при каждом refresh — по нему строится «последняя активность». */
    lastUsedAt: timestamptzNow(),
    expiresAt: timestamptz().notNull(),
    revokedAt: timestamptz(),
    /** 'logout' | 'logout_all' | 'reuse_detected' | 'password_changed' | 'manual' */
    revokedReason: text(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId, t.lastUsedAt)],
);

/**
 * Одна строка = один выданный refresh-токен. Ротация (§6.3) добавляет новую
 * строку и помечает предыдущую used_at + replaced_by, образуя цепочку.
 * Предъявление строки, у которой used_at уже заполнен, — признак кражи.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** Только SHA-256 хеш (§6.2): дамп БД не даёт возможности войти. */
    tokenHash: text().notNull(),
    createdAt: timestamptzNow(),
    expiresAt: timestamptz().notNull(),
    usedAt: timestamptz(),
    replacedBy: uuid(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_key').on(t.tokenHash),
    index('refresh_tokens_session_id_idx').on(t.sessionId),
  ],
);

/* ────────────────────────────── user_tokens ─────────────────────────────── */

/** Одноразовые токены из писем: подтверждение email и сброс пароля (§8.1). */
export const userTokens = pgTable(
  'user_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: userTokenKind().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    usedAt: timestamptz(),
    createdAt: timestamptzNow(),
  },
  (t) => [
    uniqueIndex('user_tokens_token_hash_key').on(t.tokenHash),
    index('user_tokens_user_id_kind_idx').on(t.userId, t.kind),
  ],
);

/* ─────────────────────────────── relations ──────────────────────────────── */

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  tokens: many(userTokens),
  baseCurrencyRef: one(currencies, {
    fields: [users.baseCurrency],
    references: [currencies.code],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  session: one(sessions, { fields: [refreshTokens.sessionId], references: [sessions.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Currency = typeof currencies.$inferSelect;
