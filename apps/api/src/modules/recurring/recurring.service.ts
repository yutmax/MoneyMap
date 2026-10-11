import {
  nextOccurrence,
  occurrencesBetween,
  shiftDays,
  todayIn,
  todayUtc,
  type CreateRecurringRuleInput,
  type PendingOccurrence,
  type Recurrence,
  type RecurringRuleResponse,
  type UpcomingOccurrence,
  type UpdateRecurringRuleInput,
} from '@moneymap/shared';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import {
  accounts,
  categories,
  recurringOccurrences,
  recurringRules,
  users,
} from '../../db/schema.ts';
import { badRequest, conflict, notFound } from '../../lib/errors.ts';
import { scopeOf, type Scope } from '../../lib/scoping.ts';
import { assertCurrencyExists } from '../reference/currency.service.ts';
import { createTransaction } from '../transactions/transaction.service.ts';

/* ───────────────────────────── чтение и формат ──────────────────────────── */

const selection = {
  id: recurringRules.id,
  name: recurringRules.name,
  accountId: recurringRules.accountId,
  accountName: accounts.name,
  accountCurrency: accounts.currencyCode,
  categoryId: recurringRules.categoryId,
  categoryName: categories.name,
  kind: recurringRules.kind,
  amount: recurringRules.amount,
  currencyCode: recurringRules.currencyCode,
  freq: recurringRules.freq,
  interval: recurringRules.interval,
  dayOfMonth: recurringRules.dayOfMonth,
  weekday: recurringRules.weekday,
  monthEndPolicy: recurringRules.monthEndPolicy,
  startOn: recurringRules.startOn,
  endOn: recurringRules.endOn,
  nextOccurrenceOn: recurringRules.nextOccurrenceOn,
  autoPost: recurringRules.autoPost,
  isPaused: recurringRules.isPaused,
  createdAt: recurringRules.createdAt,
};

type RuleRow = { [K in keyof typeof selection]: unknown };

function toResponse(row: RuleRow): RecurringRuleResponse {
  return {
    id: row.id as string,
    name: row.name as string,
    accountId: row.accountId as string,
    accountName: row.accountName as string,
    accountCurrency: row.accountCurrency as string,
    categoryId: (row.categoryId as string | null) ?? null,
    categoryName: (row.categoryName as string | null) ?? null,
    kind: row.kind as RecurringRuleResponse['kind'],
    amount: row.amount as string,
    currencyCode: row.currencyCode as string,
    freq: row.freq as RecurringRuleResponse['freq'],
    interval: row.interval as number,
    dayOfMonth: (row.dayOfMonth as number | null) ?? null,
    weekday: (row.weekday as number | null) ?? null,
    monthEndPolicy: row.monthEndPolicy as RecurringRuleResponse['monthEndPolicy'],
    startOn: row.startOn as string,
    endOn: (row.endOn as string | null) ?? null,
    nextOccurrenceOn: (row.nextOccurrenceOn as string | null) ?? null,
    autoPost: row.autoPost as boolean,
    isPaused: row.isPaused as boolean,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

/** Расписание в том виде, в котором его понимает общий пакет. */
type ScheduleFields = Pick<
  RecurringRuleResponse,
  'freq' | 'interval' | 'weekday' | 'dayOfMonth' | 'monthEndPolicy' | 'startOn' | 'endOn'
>;

function toRecurrence(rule: ScheduleFields): Recurrence {
  return {
    freq: rule.freq,
    interval: rule.interval,
    weekday: rule.weekday,
    dayOfMonth: rule.dayOfMonth,
    monthEndPolicy: rule.monthEndPolicy,
    startOn: rule.startOn,
    endOn: rule.endOn,
  };
}

/**
 * Ближайшее срабатывание, начиная с сегодняшнего дня.
 *
 * Дата начала в прошлом — это «правило действует с такого-то числа»,
 * а не «создай мне задним числом год списаний». Догоняющая генерация
 * существует для пропусков работающего правила, а не для его предыстории.
 */
function nextFromToday(rule: ScheduleFields, today: string): string | null {
  const from = rule.startOn > today ? rule.startOn : today;
  // nextOccurrence ищет строго позже, а сам день `from` должен попадать.
  return nextOccurrence(toRecurrence(rule), shiftDays(from, -1));
}

export async function listRules(db: Db, scope: Scope): Promise<RecurringRuleResponse[]> {
  const rows = await db
    .select(selection)
    .from(recurringRules)
    .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
    .leftJoin(categories, eq(categories.id, recurringRules.categoryId))
    .where(scope.own(recurringRules))
    .orderBy(asc(recurringRules.isPaused), asc(recurringRules.nextOccurrenceOn));

  return rows.map((row) => toResponse(row as RuleRow));
}

export async function getRule(db: Db, scope: Scope, id: string): Promise<RecurringRuleResponse> {
  const [row] = await db
    .select(selection)
    .from(recurringRules)
    .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
    .leftJoin(categories, eq(categories.id, recurringRules.categoryId))
    .where(scope.own(recurringRules, eq(recurringRules.id, id)))
    .limit(1);

  if (!row) throw notFound('errors.recurringRuleNotFound');
  return toResponse(row as RuleRow);
}

/* ─────────────────────────────── проверки ───────────────────────────────── */

async function loadAccount(db: Db, scope: Scope, accountId: string) {
  const [account] = await db
    .select({
      id: accounts.id,
      currencyCode: accounts.currencyCode,
      isArchived: accounts.isArchived,
    })
    .from(accounts)
    .where(scope.own(accounts, eq(accounts.id, accountId)))
    .limit(1);

  if (!account) throw notFound('errors.accountNotFound');
  if (account.isArchived) throw badRequest('errors.accountArchived');
  return account;
}

async function assertCategory(
  db: Db,
  scope: Scope,
  categoryId: string,
  kind: 'income' | 'expense',
): Promise<void> {
  const [category] = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(scope.own(categories, eq(categories.id, categoryId)))
    .limit(1);

  if (!category) throw notFound('errors.categoryNotFound');
  if (category.kind !== kind) throw badRequest('errors.categoryKindForTransaction');
}

/**
 * Какое сегодня число у пользователя.
 *
 * Даты правил считаются в его таймзоне (§8.7): иначе «первое число»
 * наступит для части пользователей двадцать восьмого в одиннадцать вечера.
 */
async function userToday(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.timezone ? todayIn(row.timezone) : todayUtc();
}

/* ─────────────────────────────── изменение ──────────────────────────────── */

export async function createRule(
  db: Db,
  scope: Scope,
  input: CreateRecurringRuleInput,
): Promise<RecurringRuleResponse> {
  const account = await loadAccount(db, scope, input.accountId);
  if (input.categoryId) await assertCategory(db, scope, input.categoryId, input.kind);

  const currency = input.currency
    ? await assertCurrencyExists(db, input.currency, 'currency')
    : account.currencyCode;

  // Недостающие части расписания берутся из даты начала: правило «с 5 марта,
  // ежемесячно» и так означает пятое число, спрашивать об этом отдельно —
  // значит спрашивать дважды об одном.
  const weekday =
    input.weekday ??
    (input.freq === 'weekly' ? new Date(`${input.startOn}T00:00:00Z`).getUTCDay() : null);
  const dayOfMonth =
    input.dayOfMonth ??
    (input.freq === 'monthly' || input.freq === 'yearly'
      ? Number(input.startOn.slice(8, 10))
      : null);

  const schedule: ScheduleFields = {
    freq: input.freq,
    interval: input.interval,
    weekday,
    dayOfMonth,
    monthEndPolicy: input.monthEndPolicy,
    startOn: input.startOn,
    endOn: input.endOn ?? null,
  };

  const [created] = await db
    .insert(recurringRules)
    .values(
      scope.stamp({
        accountId: account.id,
        categoryId: input.categoryId ?? null,
        name: input.name,
        kind: input.kind,
        amount: input.amount,
        currencyCode: currency,
        freq: input.freq,
        interval: input.interval,
        dayOfMonth,
        weekday,
        monthEndPolicy: input.monthEndPolicy,
        startOn: input.startOn,
        endOn: input.endOn ?? null,
        nextOccurrenceOn: nextFromToday(schedule, await userToday(db, scope.ownerId)),
        autoPost: input.autoPost,
      }),
    )
    .returning({ id: recurringRules.id });

  if (!created) throw new Error('Правило не создано');
  return getRule(db, scope, created.id);
}

export async function updateRule(
  db: Db,
  scope: Scope,
  id: string,
  input: UpdateRecurringRuleInput,
): Promise<RecurringRuleResponse> {
  const current = await getRule(db, scope, id);
  if (input.categoryId) await assertCategory(db, scope, input.categoryId, current.kind);

  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };

  // Расписание изменилось — ближайшее срабатывание пересчитывается. Уже
  // созданные операции при этом не трогаются: правило задаёт будущее.
  const touchesSchedule =
    input.freq !== undefined ||
    input.interval !== undefined ||
    input.dayOfMonth !== undefined ||
    input.weekday !== undefined ||
    input.monthEndPolicy !== undefined ||
    input.endOn !== undefined;

  if (touchesSchedule) {
    patch.nextOccurrenceOn = nextFromToday(
      {
        freq: input.freq ?? current.freq,
        interval: input.interval ?? current.interval,
        weekday: input.weekday === undefined ? current.weekday : input.weekday,
        dayOfMonth: input.dayOfMonth === undefined ? current.dayOfMonth : input.dayOfMonth,
        monthEndPolicy: input.monthEndPolicy ?? current.monthEndPolicy,
        startOn: current.startOn,
        endOn: input.endOn === undefined ? current.endOn : input.endOn,
      },
      await userToday(db, scope.ownerId),
    );
  }

  await db
    .update(recurringRules)
    .set(patch)
    .where(scope.own(recurringRules, eq(recurringRules.id, id)));

  return getRule(db, scope, id);
}

/**
 * Пауза и снятие с паузы (§8.7). Правило остаётся вместе со своей историей.
 *
 * Пропущенное за время паузы не досоздаётся при возобновлении: пауза —
 * это решение «пока не надо», и возвращать отменённые списания человек
 * не просил.
 */
export async function pauseRule(
  db: Db,
  scope: Scope,
  id: string,
  paused: boolean,
): Promise<RecurringRuleResponse> {
  const current = await getRule(db, scope, id);

  await db
    .update(recurringRules)
    .set({
      isPaused: paused,
      nextOccurrenceOn: paused
        ? current.nextOccurrenceOn
        : nextFromToday(current, await userToday(db, scope.ownerId)),
      updatedAt: new Date(),
    })
    .where(scope.own(recurringRules, eq(recurringRules.id, id)));

  return getRule(db, scope, id);
}

/**
 * Удаление мягкое: созданные правилом операции остаются и продолжают на него
 * ссылаться. Ожидающие подтверждения срабатывания снимаются — подтверждать
 * списание по удалённому правилу уже нечего.
 */
export async function deleteRule(db: Db, scope: Scope, id: string): Promise<void> {
  const now = new Date();
  const [removed] = await db
    .update(recurringRules)
    .set({ deletedAt: now, updatedAt: now, nextOccurrenceOn: null })
    .where(scope.own(recurringRules, eq(recurringRules.id, id)))
    .returning({ id: recurringRules.id });

  if (!removed) throw notFound('errors.recurringRuleNotFound');

  await db
    .update(recurringOccurrences)
    .set({ status: 'skipped', resolvedAt: now })
    .where(
      and(
        eq(recurringOccurrences.ruleId, id),
        eq(recurringOccurrences.userId, scope.ownerId),
        eq(recurringOccurrences.status, 'pending'),
      ),
    );
}

/* ───────────────────────────── генерация ────────────────────────────────── */

/** Что нужно знать, чтобы превратить срабатывание в операцию. */
interface Posting {
  ruleId: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  kind: 'income' | 'expense';
  amount: string;
  currencyCode: string;
}

/**
 * Превращает срабатывание в операцию.
 *
 * Порядок шагов выбран так, чтобы обрыв посередине не стоил денег: сначала
 * строка срабатывания (её уникальность и защищает от дубля), потом операция,
 * и только потом отметка «проведено». Оборвись процесс между вторым и третьим
 * шагом — останется ожидающее срабатывание, которое доведёт до конца
 * следующий прогон; обратный порядок оставил бы списание-призрак.
 */
async function post(db: Db, occurrenceId: string, posting: Posting, dueOn: string): Promise<void> {
  const transaction = await createTransaction(
    db,
    scopeOf(posting.userId),
    {
      accountId: posting.accountId,
      categoryId: posting.categoryId,
      kind: posting.kind,
      amount: posting.amount,
      currency: posting.currencyCode,
      occurredOn: dueOn,
    },
    { recurringRuleId: posting.ruleId },
  );

  await db
    .update(recurringOccurrences)
    .set({ status: 'posted', transactionId: transaction.id, resolvedAt: new Date() })
    .where(eq(recurringOccurrences.id, occurrenceId));
}

/** Предел на одно правило за прогон: защита от правила, забытого на годы. */
const MAX_PER_RULE = 400;

export interface GenerationResult {
  created: number;
  posted: number;
}

type JobLog = { error: (obj: unknown, msg: string) => void };

/**
 * Досоздаёт всё, чему наступил срок (§8.7).
 *
 * Два уровня по спеке: эту же функцию зовёт и ежедневная задача, и вход
 * пользователя. Воркер — только триггер: сервер мог быть выключен, и тогда
 * списания потерялись бы безвозвратно. Повторный вызов безвреден —
 * уникальность (rule_id, due_on) делает генерацию идемпотентной.
 */
export async function generateDue(
  db: Db,
  args: { userId?: string; log?: JobLog } = {},
): Promise<GenerationResult> {
  const rules = await db
    .select({
      id: recurringRules.id,
      userId: recurringRules.userId,
      accountId: recurringRules.accountId,
      categoryId: recurringRules.categoryId,
      kind: recurringRules.kind,
      amount: recurringRules.amount,
      currencyCode: recurringRules.currencyCode,
      freq: recurringRules.freq,
      interval: recurringRules.interval,
      weekday: recurringRules.weekday,
      dayOfMonth: recurringRules.dayOfMonth,
      monthEndPolicy: recurringRules.monthEndPolicy,
      startOn: recurringRules.startOn,
      endOn: recurringRules.endOn,
      nextOccurrenceOn: recurringRules.nextOccurrenceOn,
      autoPost: recurringRules.autoPost,
      timezone: users.timezone,
    })
    .from(recurringRules)
    .innerJoin(users, eq(users.id, recurringRules.userId))
    .where(
      and(
        isNull(recurringRules.deletedAt),
        eq(recurringRules.isPaused, false),
        // Отбор по UTC заведомо не уже, чем нужно: «сегодня» пользователя
        // может отставать на сутки, и окончательную проверку делает цикл.
        lte(recurringRules.nextOccurrenceOn, todayUtc()),
        args.userId ? eq(recurringRules.userId, args.userId) : undefined,
      ),
    );

  const result: GenerationResult = { created: 0, posted: 0 };

  for (const rule of rules) {
    const today = rule.timezone ? todayIn(rule.timezone) : todayUtc();
    const posting: Posting = {
      ruleId: rule.id,
      userId: rule.userId,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      kind: rule.kind,
      amount: rule.amount,
      currencyCode: rule.currencyCode,
    };

    let due = rule.nextOccurrenceOn;
    for (let guard = 0; guard < MAX_PER_RULE && due !== null && due <= today; guard += 1) {
      try {
        const [occurrence] = await db
          .insert(recurringOccurrences)
          .values({ userId: rule.userId, ruleId: rule.id, dueOn: due, status: 'pending' })
          .onConflictDoNothing()
          .returning({ id: recurringOccurrences.id });

        if (occurrence) {
          result.created += 1;
          if (rule.autoPost) {
            await post(db, occurrence.id, posting, due);
            result.posted += 1;
          }
        }
      } catch (error) {
        // Правило остаётся на той же дате и попробует ещё раз в следующий
        // прогон: пропустить дату молча — значит потерять списание.
        args.log?.error({ err: error, ruleId: rule.id, dueOn: due }, 'Срабатывание не создано');
        break;
      }

      due = nextOccurrence(toRecurrence(rule), due);
    }

    await db
      .update(recurringRules)
      .set({ nextOccurrenceOn: due })
      .where(eq(recurringRules.id, rule.id));
  }

  result.posted += await postStranded(db, args.userId, args.log);
  return result;
}

/**
 * Доводит до операции то, что осталось ожидающим у автоматических правил.
 *
 * Такое остаётся после обрыва между созданием срабатывания и созданием
 * операции, либо после ошибки, которую уже починили: архивный счёт вернули
 * из архива, удалённую категорию заменили. Состояние безопасное, но
 * списание, которое человек не собирался подтверждать руками, должно
 * однажды пройти само.
 */
async function postStranded(db: Db, userId?: string, log?: JobLog): Promise<number> {
  const stranded = await db
    .select({
      id: recurringOccurrences.id,
      dueOn: recurringOccurrences.dueOn,
      userId: recurringOccurrences.userId,
      ruleId: recurringRules.id,
      accountId: recurringRules.accountId,
      categoryId: recurringRules.categoryId,
      kind: recurringRules.kind,
      amount: recurringRules.amount,
      currencyCode: recurringRules.currencyCode,
    })
    .from(recurringOccurrences)
    .innerJoin(recurringRules, eq(recurringRules.id, recurringOccurrences.ruleId))
    .where(
      and(
        eq(recurringOccurrences.status, 'pending'),
        eq(recurringRules.autoPost, true),
        isNull(recurringRules.deletedAt),
        userId ? eq(recurringOccurrences.userId, userId) : undefined,
      ),
    )
    .limit(100);

  let posted = 0;
  for (const row of stranded) {
    try {
      await post(db, row.id, { ...row, ruleId: row.ruleId }, row.dueOn);
      posted += 1;
    } catch (error) {
      log?.error({ err: error, occurrenceId: row.id }, 'Зависшее срабатывание не проведено');
    }
  }
  return posted;
}

/* ──────────────────────── предстоящие и ожидающие ───────────────────────── */

/**
 * Предстоящие списания на N дней вперёд (§8.7).
 *
 * Считаются из правил на лету и нигде не хранятся: их ещё не было, а строка
 * в БД о том, что «возможно случится», устарела бы при первой правке правила.
 */
export async function listUpcoming(
  db: Db,
  scope: Scope,
  days: number,
): Promise<UpcomingOccurrence[]> {
  const rules = await db
    .select({
      id: recurringRules.id,
      name: recurringRules.name,
      accountId: recurringRules.accountId,
      accountName: accounts.name,
      kind: recurringRules.kind,
      amount: recurringRules.amount,
      currencyCode: recurringRules.currencyCode,
      freq: recurringRules.freq,
      interval: recurringRules.interval,
      weekday: recurringRules.weekday,
      dayOfMonth: recurringRules.dayOfMonth,
      monthEndPolicy: recurringRules.monthEndPolicy,
      startOn: recurringRules.startOn,
      endOn: recurringRules.endOn,
      autoPost: recurringRules.autoPost,
    })
    .from(recurringRules)
    .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
    .where(scope.own(recurringRules, eq(recurringRules.isPaused, false)));

  const today = await userToday(db, scope.ownerId);
  const until = shiftDays(today, days);

  // Сегодняшнее срабатывание, которое уже прошло, предстоящим не является:
  // строка «Аренда, сегодня» рядом с уже списанной арендой читается как
  // второе списание. Ожидающие подтверждения тоже исключены — они живут
  // в своей очереди, и показывать их дважды значит предложить подтвердить
  // то, что уже предложено.
  const materialised = new Set(
    (
      await db
        .select({ ruleId: recurringOccurrences.ruleId, dueOn: recurringOccurrences.dueOn })
        .from(recurringOccurrences)
        .where(
          and(
            eq(recurringOccurrences.userId, scope.ownerId),
            gte(recurringOccurrences.dueOn, today),
            lte(recurringOccurrences.dueOn, until),
          ),
        )
    ).map((row) => `${row.ruleId}|${row.dueOn}`),
  );

  const upcoming = rules.flatMap((rule) =>
    occurrencesBetween(toRecurrence(rule), today, until)
      .filter((dueOn) => !materialised.has(`${rule.id}|${dueOn}`))
      .map((dueOn) => ({
        ruleId: rule.id,
        ruleName: rule.name,
        accountId: rule.accountId,
        accountName: rule.accountName,
        kind: rule.kind,
        amount: rule.amount,
        currencyCode: rule.currencyCode,
        dueOn,
        autoPost: rule.autoPost,
      })),
  );

  return upcoming.sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.ruleName.localeCompare(b.ruleName),
  );
}

/** Очередь подтверждений (§8.7). */
export async function listPending(db: Db, scope: Scope): Promise<PendingOccurrence[]> {
  const rows = await db
    .select({
      id: recurringOccurrences.id,
      dueOn: recurringOccurrences.dueOn,
      ruleId: recurringRules.id,
      ruleName: recurringRules.name,
      accountId: recurringRules.accountId,
      accountName: accounts.name,
      categoryId: recurringRules.categoryId,
      categoryName: categories.name,
      kind: recurringRules.kind,
      amount: recurringRules.amount,
      currencyCode: recurringRules.currencyCode,
    })
    .from(recurringOccurrences)
    .innerJoin(recurringRules, eq(recurringRules.id, recurringOccurrences.ruleId))
    .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
    .leftJoin(categories, eq(categories.id, recurringRules.categoryId))
    .where(
      and(
        eq(recurringOccurrences.userId, scope.ownerId),
        eq(recurringOccurrences.status, 'pending'),
        isNull(recurringRules.deletedAt),
      ),
    )
    .orderBy(asc(recurringOccurrences.dueOn));

  return rows.map((row) => ({
    ...row,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
  }));
}

async function loadPending(db: Db, scope: Scope, id: string) {
  const [row] = await db
    .select({
      id: recurringOccurrences.id,
      status: recurringOccurrences.status,
      dueOn: recurringOccurrences.dueOn,
      userId: recurringOccurrences.userId,
      ruleId: recurringRules.id,
      accountId: recurringRules.accountId,
      categoryId: recurringRules.categoryId,
      kind: recurringRules.kind,
      amount: recurringRules.amount,
      currencyCode: recurringRules.currencyCode,
    })
    .from(recurringOccurrences)
    .innerJoin(recurringRules, eq(recurringRules.id, recurringOccurrences.ruleId))
    .where(and(eq(recurringOccurrences.id, id), eq(recurringOccurrences.userId, scope.ownerId)))
    .limit(1);

  if (!row) throw notFound('errors.occurrenceNotFound');
  // Повторное подтверждение — почти всегда второй клик по той же кнопке,
  // и создавать по нему второе списание нельзя.
  if (row.status !== 'pending') throw conflict('errors.occurrenceResolved');
  return row;
}

export async function confirmOccurrence(db: Db, scope: Scope, id: string): Promise<void> {
  const row = await loadPending(db, scope, id);
  await post(db, row.id, { ...row, ruleId: row.ruleId }, row.dueOn);
}

export async function skipOccurrence(db: Db, scope: Scope, id: string): Promise<void> {
  const row = await loadPending(db, scope, id);
  await db
    .update(recurringOccurrences)
    .set({ status: 'skipped', resolvedAt: new Date() })
    .where(eq(recurringOccurrences.id, row.id));
}

/**
 * Догоняющая генерация при входе (§8.7).
 *
 * Второй уровень после ежедневной задачи, и обязательный: если сервер был
 * выключен в её час, списания не появились бы вовсе. Воркер — триггер,
 * а не источник истины.
 *
 * Фоном: вход не должен ждать генерации, а она не должна ронять вход.
 */
export function catchUp(db: Db, userId: string, log?: JobLog): void {
  void generateDue(db, { userId, log }).catch((error) => {
    log?.error({ err: error, userId }, 'Догоняющая генерация не удалась');
  });
}
