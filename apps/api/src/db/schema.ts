import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
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
export const accountType = pgEnum('account_type', [
  'cash',
  'bank',
  'card',
  'savings',
  'crypto_wallet',
]);
export const categoryKind = pgEnum('category_kind', ['income', 'expense']);
export const transactionKind = pgEnum('transaction_kind', ['income', 'expense', 'transfer']);

/**
 * Денежная колонка (§5.1).
 *
 * NUMERIC(38, 18) покрывает 8 знаков Bitcoin и 18 знаков Ethereum. Режим
 * string обязателен: с числами Drizzle вернул бы JS-число, а на 18 знаках оно
 * уже не представимо точно — ошибка округления появилась бы между базой
 * и приложением, где её никто не ищет.
 */
const money = () => numeric({ precision: 38, scale: 18, mode: 'string' });

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
    /**
     * Валюта сводного баланса (§8.6). Null до онбординга: регистрация её
     * больше не спрашивает, а подставлять значение, которого человек не
     * выбирал, — значит хранить догадку, неотличимую от решения.
     */
    baseCurrency: text().references(() => currencies.code),
    /** IANA, напр. 'Europe/Kyiv'. Нужна для дат регулярных правил (§8.7). */
    timezone: text(),
    /**
     * Первичная настройка пройдена. Отдельная колонка, а не вывод из
     * заполненности baseCurrency: онбординг будет прирастать шагами (первый
     * счёт — фаза 1), которым не соответствует ни одно поле users.
     */
    onboardedAt: timestamptz(),
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

/* ──────────────────────────────── accounts ──────────────────────────────── */

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    type: accountType().notNull(),
    /** Неизменяема после создания (§8.2): иначе вся история операций врёт. */
    currencyCode: text()
      .notNull()
      .references(() => currencies.code),
    /** Остаток на дату открытия счёта. */
    openingBalance: money().notNull().default('0'),
    /** Имя иконки из подборки на фронтенде, а не из библиотеки напрямую. */
    icon: text(),
    color: text(),
    sortOrder: integer().notNull().default(1000),
    isArchived: boolean().notNull().default(false),
    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
    deletedAt: timestamptz(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId, t.sortOrder)],
);

/* ─────────────────────────────── categories ─────────────────────────────── */

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Иерархия на два уровня (§8.4). Глубину ограничивает приложение:
     * проверять её в БД пришлось бы рекурсивным триггером ради правила,
     * которое всё равно описано в одном месте кода.
     */
    parentId: uuid().references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
    name: text().notNull(),
    kind: categoryKind().notNull(),
    icon: text(),
    color: text(),
    sortOrder: integer().notNull().default(1000),
    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
    deletedAt: timestamptz(),
  },
  (t) => [index('categories_user_id_kind_idx').on(t.userId, t.kind)],
);

/* ────────────────────────────── transactions ────────────────────────────── */

export const transactions = pgTable(
  'transactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    /** null у переводов: перемещение между своими счетами — не категория расходов. */
    categoryId: uuid().references(() => categories.id, { onDelete: 'set null' }),
    kind: transactionKind().notNull(),

    /* Что ввёл человек и во что это превратилось в валюте счёта (§5.2). */
    amountOriginal: money().notNull(),
    currencyOriginal: text()
      .notNull()
      .references(() => currencies.code),
    /** Со знаком: списание отрицательное, поступление положительное (§7.1). */
    amountAccount: money().notNull(),
    /** Зафиксированный курс. 1, когда валюты совпадают. Не пересчитывается. */
    fxRate: money().notNull().default('1'),

    occurredOn: date().notNull(),
    note: text(),
    /** Связывает две ноги одного перевода (§7.2). */
    transferGroupId: uuid(),
    /** Ключ из заголовка Idempotency-Key (§8.3). */
    idempotencyKey: text(),
    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
    deletedAt: timestamptz(),
  },
  (t) => [
    index('transactions_user_id_occurred_on_idx').on(t.userId, t.occurredOn.desc()),
    index('transactions_account_id_occurred_on_idx').on(t.accountId, t.occurredOn),
    index('transactions_transfer_group_idx').on(t.transferGroupId),
    // Повторная отправка того же запроса возвращает существующую запись,
    // а не создаёт дубль в учёте (§8.3).
    uniqueIndex('transactions_user_id_idempotency_key_key').on(t.userId, t.idempotencyKey),
  ],
);

/* ─────────────────────────────── relations ──────────────────────────────── */

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  tokens: many(userTokens),
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
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
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
