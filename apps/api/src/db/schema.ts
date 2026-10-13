import type { NetWorthBreakdown } from '@moneymap/shared';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
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

/**
 * inet — нативный тип Postgres для IP-адресов, валидирует значение сам.
 *
 * На чтении снимается маска: Postgres отдаёт адрес как '1.2.3.4/32', и это
 * уезжало в интерфейс прямо так, вместе с '/32' в списке устройств.
 */
const inet = customType<{ data: string }>({
  dataType: () => 'inet',
  fromDriver: (value) => String(value).replace(/\/\d+$/, ''),
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
export const recurrenceFreq = pgEnum('recurrence_freq', ['daily', 'weekly', 'monthly', 'yearly']);
export const monthEndPolicy = pgEnum('month_end_policy', ['clamp', 'skip']);
export const occurrenceStatus = pgEnum('occurrence_status', ['pending', 'posted', 'skipped']);
export const reminderKind = pgEnum('reminder_kind', ['balance_check']);

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
    /**
     * Откуда вошли (§6.4). Хранится код страны, а не название: название
     * зависит от языка интерфейса и собирается на стороне клиента.
     * Город — как его назвал источник, то есть по-английски.
     */
    countryCode: text(),
    city: text(),
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
    /**
     * С какого дня счёт существует.
     *
     * Без неё начальный остаток считался действующим всегда, и график
     * показывал деньги за годы до того, как счёт появился. Дата открытия
     * отделена от created_at намеренно: счёт можно завести сегодня, а
     * открыт он мог быть пять лет назад, и остаток на нём лежал всё это
     * время.
     */
    openedOn: date()
      .notNull()
      .default(sql`current_date`),
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
     * Иерархия на два уровня (§8.4). Сейчас всегда null: набор плоский, а
     * своих категорий не бывает. Колонка остаётся — вложенность описана в ТЗ
     * и вернётся вместе с пользовательскими категориями.
     */
    parentId: uuid().references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
    kind: categoryKind().notNull(),
    color: text(),
    /**
     * Какая это категория из каталога (`category.catalog.ts`).
     *
     * Ни названия, ни иконки в базе нет: категории задаёт разработчик, и
     * хранить их подписи построчно значило бы держать копию словаря,
     * расходящуюся с ним при первой же правке текста. Название считается по
     * этому ключу на языке запроса, иконка — оттуда же.
     */
    defaultKey: text().notNull(),
    /** Копия порядка из каталога: нужна, чтобы сортировать в SQL. */
    sortOrder: integer().notNull().default(1000),
    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
    deletedAt: timestamptz(),
  },
  (t) => [
    index('categories_user_id_kind_idx').on(t.userId, t.kind),
    // Одна категория каталога на человека: ограничение и держит набор
    // от дублей при повторном заполнении.
    uniqueIndex('categories_user_id_default_key_key').on(t.userId, t.defaultKey),
  ],
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
    /**
     * Правило, из которого операция родилась (§8.7). Нужно, чтобы по
     * списанию было видно, что оно регулярное, и чтобы правило могло
     * показать свою историю.
     */
    recurringRuleId: uuid().references((): AnyPgColumn => recurringRules.id, {
      onDelete: 'set null',
    }),
    /** Ключ из заголовка Idempotency-Key (§8.3). */
    idempotencyKey: text(),
    /**
     * Отпечаток строки импортированного файла (§8.11).
     *
     * По нему повторный импорт того же выгруженного периода не создаёт
     * вторую копию операций. Считается от счёта, даты, суммы и примечания —
     * то есть от того, что в выписке и есть; идентификатора у строки банк
     * не даёт.
     */
    importHash: text(),
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
    // Та же защита, что и у Idempotency-Key, но для импорта: повтор файла
    // отсекается БД, а не сравнением в приложении.
    uniqueIndex('transactions_user_id_import_hash_key').on(t.userId, t.importHash),
  ],
);

/* ───────────────────────────── exchange_rates ───────────────────────────── */

/**
 * Курсы валют (§8.5).
 *
 * Все строки хранятся с одной опорной валютой в base: источник отдаёт курсы
 * относительно евро, и держать полную матрицу 340×340 на каждый день — это
 * сто тысяч строк в сутки вместо трёхсот ради данных, которые полностью
 * выводятся делением. Кросс-курс A→B считается как (EUR→B) / (EUR→A).
 *
 * Исторические строки не перезаписываются: отчёт за прошлый месяц обязан
 * показывать то же, что показывал месяц назад.
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    base: text()
      .notNull()
      .references(() => currencies.code),
    quote: text()
      .notNull()
      .references(() => currencies.code),
    date: date().notNull(),
    rate: money().notNull(),
    /** Откуда взят курс — чтобы расхождение можно было объяснить. */
    source: text().notNull(),
    fetchedAt: timestamptzNow(),
  },
  (t) => [
    primaryKey({ columns: [t.base, t.quote, t.date] }),
    // Первичный ключ покрывает поиск курса одной валюты; этот индекс —
    // выборку всех курсов на дату, которой нужен сводный баланс.
    index('exchange_rates_base_date_idx').on(t.base, t.date.desc()),
  ],
);

/* ────────────────────────── net_worth_snapshots ─────────────────────────── */

/**
 * Снимок состояния на дату (§8.6).
 *
 * График строится по ним, а не пересчётом всей истории на каждый запрос:
 * иначе стоимость открытия главной страницы растёт вместе с числом операций.
 */
export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date().notNull(),
    /** Валюта, в которой посчитан итог: сменив базовую, старые точки не врут. */
    baseCurrency: text()
      .notNull()
      .references(() => currencies.code),
    totalAmount: money().notNull(),
    /** Разбивка по счетам — для графика и подсказок, без повторного счёта. */
    breakdown: jsonb().$type<NetWorthBreakdown>().notNull(),
    createdAt: timestamptzNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/* ───────────────────────────── recurring_rules ──────────────────────────── */

/**
 * Правило повторяющейся операции (§8.7).
 *
 * Правило — шаблон, а не расписание уже созданных операций: правка правила
 * не трогает то, что оно успело создать. Иначе смена суммы подписки
 * переписала бы историю платежей за год назад.
 */
export const recurringRules = pgTable(
  'recurring_rules',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    categoryId: uuid().references(() => categories.id, { onDelete: 'set null' }),
    /** Как человек называет это списание: «Netflix», «Аренда». */
    name: text().notNull(),
    /**
     * Доход или расход — тот же набор значений, что у категорий. Отдельный
     * тип Postgres ради тех же двух значений был бы лишней сущностью.
     */
    kind: categoryKind().notNull(),
    amount: money().notNull(),
    currencyCode: text()
      .notNull()
      .references(() => currencies.code),

    freq: recurrenceFreq().notNull(),
    /** Каждые N периодов. */
    interval: integer().notNull().default(1),
    /** 1..31, для monthly и yearly. */
    dayOfMonth: integer(),
    /** 0 — воскресенье, 6 — суббота; для weekly. */
    weekday: integer(),
    /** Что делать с 31-м числом в коротком месяце (§8.7). */
    monthEndPolicy: monthEndPolicy().notNull().default('clamp'),

    startOn: date().notNull(),
    endOn: date(),
    /**
     * Когда правило сработает в следующий раз. Выводится из расписания,
     * но хранится: иначе ежедневная задача считала бы расписание всех
     * правил всех пользователей, чтобы найти несколько сработавших.
     * null — правило закончилось.
     */
    nextOccurrenceOn: date(),

    /** Создавать операцию сразу или спрашивать подтверждение (§8.7). */
    autoPost: boolean().notNull().default(true),
    /** Пауза без удаления: правило остаётся вместе со своей историей. */
    isPaused: boolean().notNull().default(false),

    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
    deletedAt: timestamptz(),
  },
  (t) => [
    index('recurring_rules_user_id_idx').on(t.userId, t.nextOccurrenceOn),
    // Отбор сработавших правил идёт по всем пользователям сразу, поэтому
    // индекс не начинается с user_id.
    index('recurring_rules_due_idx').on(t.nextOccurrenceOn),
  ],
);

/* ─────────────────────────── recurring_occurrences ──────────────────────── */

/**
 * Одно срабатывание правила на конкретную дату (§8.7).
 *
 * Отдельная таблица, а не только `transactions.occurrence_date` из спеки:
 * у срабатывания есть состояния, которых у операции не бывает. Списание
 * с подтверждением сначала ждёт человека, а он может его и отклонить —
 * и отклонённое должно остаться отклонённым, иначе догоняющая генерация
 * предложит его снова завтра.
 *
 * Уникальность по (rule_id, due_on) — то, на чём держится идемпотентность
 * генерации (§10.3). Ежедневная задача и догоняющая генерация при входе
 * работают независимо и могут столкнуться; дубль списания при этом
 * невозможен не по договорённости, а по ограничению БД.
 */
export const recurringOccurrences = pgTable(
  'recurring_occurrences',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ruleId: uuid()
      .notNull()
      .references(() => recurringRules.id, { onDelete: 'cascade' }),
    dueOn: date().notNull(),
    status: occurrenceStatus().notNull().default('pending'),
    /** Операция, которой обернулось срабатывание. null, пока не подтверждено. */
    transactionId: uuid().references(() => transactions.id),
    createdAt: timestamptzNow(),
    /** Когда перестало быть ожидающим. */
    resolvedAt: timestamptz(),
  },
  (t) => [
    uniqueIndex('recurring_occurrences_rule_id_due_on_key').on(t.ruleId, t.dueOn),
    index('recurring_occurrences_user_id_status_idx').on(t.userId, t.status, t.dueOn),
  ],
);

/* ────────────────────────────── reminders ──────────────────────────────── */

/**
 * Напоминание о сверке остатков (§8.8).
 *
 * Одно на пользователя и вид: напоминаний «проверить остатки» не бывает
 * два, а уникальность по (user_id, kind) заодно делает настройку
 * идемпотентной — её можно создавать по факту обращения, не спрашивая,
 * существует ли она.
 */
export const reminders = pgTable(
  'reminders',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reminderKind().notNull(),
    /** 1..31. Игнорируется, когда выбран последний день месяца. */
    dayOfMonth: integer().notNull().default(1),
    /**
     * «Последний день месяца» вместо фиксированного числа (§8.8). Отдельный
     * флаг, а не число 31 с политикой: «последний день» — это намерение,
     * а 31-е с прижатием — совпадение, которое верно не для всех месяцев.
     */
    useLastDay: boolean().notNull().default(false),
    /** Местное время пользователя, без зоны: зона лежит в его профиле. */
    timeOfDay: time().notNull().default('10:00'),
    /** 'in_app' | 'email'. Массив, потому что каналы складываются. */
    channels: text().array().notNull().default(['in_app']),
    isEnabled: boolean().notNull().default(false),
    /**
     * Когда сработало в последний раз. По нему задача отличает «ещё не
     * напоминали сегодня» от «уже напомнили»: иначе ежечасный прогон
     * повторял бы напоминание до конца суток.
     */
    lastFiredAt: timestamptz(),
    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
  },
  (t) => [uniqueIndex('reminders_user_id_kind_key').on(t.userId, t.kind)],
);

/* ───────────────────────────── notifications ───────────────────────────── */

/**
 * Внутреннее уведомление (§8.8).
 *
 * kind — текст, а не перечисление, в отличие от остальных справочных полей
 * схемы: видов уведомлений будет прибавляться вместе с каждой новой
 * возможностью, и миграция типа на каждое из них — плата ни за что.
 * Payload хранит только параметры; текст собирает интерфейс на своём языке.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    payload: jsonb().$type<Record<string, string | number>>().notNull().default({}),
    readAt: timestamptz(),
    createdAt: timestamptzNow(),
  },
  (t) => [index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt.desc())],
);

/* ────────────────────────── balance_snapshots ──────────────────────────── */

/**
 * Сверка остатка по счёту (§8.8).
 *
 * Хранятся оба числа: введённое человеком и рассчитанное приложением
 * на момент ввода. Расчётное именно запоминается, а не пересчитывается
 * при чтении: смысл записи в том, каким расхождение было тогда, а поздняя
 * операция задним числом изменила бы расчёт и стёрла сам факт расхождения.
 */
export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    asOf: date().notNull(),
    /** Что человек увидел в банке. */
    reportedAmount: money().notNull(),
    /** Что в этот момент насчитало приложение. */
    computedAmount: money().notNull(),
    note: text(),
    /** Операция, которой закрыли расхождение. null — не закрывали. */
    correctionId: uuid().references(() => transactions.id),
    createdAt: timestamptzNow(),
  },
  (t) => [
    // Сверка счёта на дату одна: вторая означала бы два разных ответа
    // на вопрос, сколько было на счёте в тот день.
    uniqueIndex('balance_snapshots_account_id_as_of_key').on(t.accountId, t.asOf),
    index('balance_snapshots_user_id_as_of_idx').on(t.userId, t.asOf.desc()),
  ],
);

/* ─────────────────────────────── budgets ───────────────────────────────── */

/**
 * Лимит расходов на календарный месяц (§8.10).
 *
 * Лимит постоянный, а не заведённый на каждый месяц отдельно: «на продукты
 * шестьсот» — это решение, а не ежемесячная работа. Месяц входит в расчёт,
 * а не в хранение, поэтому строка и одна на цель.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Цель лимита — категория или счёт целиком, ровно одно из двух.
     *
     * Две колонки, а не одна с видом цели: внешний ключ на каждую сторону
     * удаляет бюджет вместе с тем, к чему он привязан, и сделать это
     * обобщённой ссылкой нельзя. «Ровно одно» держит `budgets_target_one_of`.
     */
    categoryId: uuid().references(() => categories.id, { onDelete: 'cascade' }),
    accountId: uuid().references(() => accounts.id, { onDelete: 'cascade' }),
    amount: money().notNull(),
    /** Переносить неизрасходованный остаток на следующий месяц (§8.10). */
    rollover: boolean().notNull().default(false),
    createdAt: timestamptzNow(),
    updatedAt: timestamptzNow(),
  },
  (t) => [
    // NULL сам с собой не конфликтует, поэтому бюджеты по счетам не мешают
    // уникальности по категориям и наоборот — отдельные частичные индексы
    // здесь не нужны.
    uniqueIndex('budgets_user_id_category_id_key').on(t.userId, t.categoryId),
    uniqueIndex('budgets_user_id_account_id_key').on(t.userId, t.accountId),
    check('budgets_target_one_of', sql`num_nonnulls(${t.categoryId}, ${t.accountId}) = 1`),
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
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type NewRecurringRule = typeof recurringRules.$inferInsert;
export type RecurringOccurrence = typeof recurringOccurrences.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
