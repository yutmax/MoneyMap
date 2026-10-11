import {
  dateIn,
  daysInMonth,
  timeIn,
  todayUtc,
  type NotificationResponse,
  type ReminderChannel,
  type ReminderResponse,
  type UpdateReminderInput,
} from '@moneymap/shared';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../db/index.ts';
import { notifications, reminders, users } from '../../db/schema.ts';
import { notFound } from '../../lib/errors.ts';
import { sendMail } from '../../lib/mailer.ts';
import type { Scope } from '../../lib/scoping.ts';

/**
 * Напоминания о сверке остатков (§8.8).
 *
 * Напоминание — не будильник, а повод: оно создаёт внутреннее уведомление
 * и, если попросили, письмо. Решение о том, что делать дальше, принимает
 * человек на экране сверки.
 */

function toResponse(row: typeof reminders.$inferSelect): ReminderResponse {
  return {
    id: row.id,
    kind: row.kind,
    isEnabled: row.isEnabled,
    dayOfMonth: row.dayOfMonth,
    useLastDay: row.useLastDay,
    // Из БД время приходит с секундами, интерфейсу они не нужны.
    timeOfDay: row.timeOfDay.slice(0, 5),
    channels: row.channels as ReminderChannel[],
    lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
  };
}

/**
 * Напоминания пользователя. Недостающие заводятся здесь же.
 *
 * В §9 нет POST /reminders, и это не упущение: набор напоминаний задан
 * видами, а не пользователем. Заводить строку при первом обращении проще,
 * чем при регистрации: тогда о ней пришлось бы помнить и в онбординге,
 * и в миграции для тех, кто зарегистрировался раньше.
 */
export async function listReminders(db: Db, scope: Scope): Promise<ReminderResponse[]> {
  await db
    .insert(reminders)
    .values(scope.stamp({ kind: 'balance_check' as const }))
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, scope.ownerId))
    .orderBy(reminders.kind);

  return rows.map(toResponse);
}

export async function updateReminder(
  db: Db,
  scope: Scope,
  id: string,
  input: UpdateReminderInput,
): Promise<ReminderResponse> {
  const [updated] = await db
    .update(reminders)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(reminders.id, id), eq(reminders.userId, scope.ownerId)))
    .returning();

  if (!updated) throw notFound('errors.reminderNotFound');
  return toResponse(updated);
}

/* ───────────────────────────── уведомления ─────────────────────────────── */

export async function listNotifications(db: Db, scope: Scope): Promise<NotificationResponse[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, scope.ownerId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function markNotificationRead(db: Db, scope: Scope, id: string): Promise<void> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, scope.ownerId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });

  // Повторная отметка — обычное дело: вторая вкладка, второй клик.
  // Ошибкой это не считаем, молча ничего не меняем.
  if (!updated) return;
}

/* ──────────────────────────── срабатывание ─────────────────────────────── */

/**
 * День месяца, в который напоминание должно сработать.
 *
 * Для «31-го числа» в феврале берётся последний день: пропустить месяц
 * значило бы не напомнить вовсе, а человек просил напоминать каждый месяц.
 * Для «последнего дня» последний день и так единственный вариант.
 */
function targetDay(
  reminder: { dayOfMonth: number; useLastDay: boolean },
  localDate: string,
): number {
  const [year, month] = localDate.split('-').map(Number) as [number, number, number];
  const length = daysInMonth(year, month);
  return reminder.useLastDay ? length : Math.min(reminder.dayOfMonth, length);
}

export interface ReminderRunResult {
  fired: number;
}

/**
 * Рассылает напоминания, которым настало время (§8.8).
 *
 * Задача ходит раз в час, а не раз в сутки: у напоминания есть время
 * в местной зоне, и суточный прогон попадал бы в него только у тех, чья
 * зона совпала с зоной сервера. Внутри часа проверка «уже напоминали
 * сегодня» не даёт повторить.
 *
 * Строка «захватывается» условным обновлением до того, как уйдёт письмо:
 * два процесса, проснувшиеся одновременно, получат один победивший
 * UPDATE на двоих, и второе уведомление не появится. Обратный порядок —
 * сначала отправить, потом отметить — дублировал бы напоминание при любом
 * обрыве, а дубль здесь хуже пропуска.
 */
export async function fireDueReminders(db: Db, log: FastifyBaseLogger): Promise<ReminderRunResult> {
  const rows = await db
    .select({
      id: reminders.id,
      userId: reminders.userId,
      kind: reminders.kind,
      dayOfMonth: reminders.dayOfMonth,
      useLastDay: reminders.useLastDay,
      timeOfDay: reminders.timeOfDay,
      channels: reminders.channels,
      lastFiredAt: reminders.lastFiredAt,
      timezone: users.timezone,
      email: users.email,
      name: users.name,
    })
    .from(reminders)
    .innerJoin(users, eq(users.id, reminders.userId))
    .where(eq(reminders.isEnabled, true));

  const now = new Date();
  let fired = 0;

  for (const reminder of rows) {
    const zone = reminder.timezone ?? 'UTC';
    const localDate = reminder.timezone ? dateIn(zone, now) : todayUtc();
    const localTime = timeIn(zone, now);

    const day = Number(localDate.slice(8, 10));
    if (day !== targetDay(reminder, localDate)) continue;
    if (localTime < reminder.timeOfDay.slice(0, 5)) continue;
    if (reminder.lastFiredAt && dateIn(zone, reminder.lastFiredAt) === localDate) continue;

    const [claimed] = await db
      .update(reminders)
      .set({ lastFiredAt: now })
      .where(
        and(
          eq(reminders.id, reminder.id),
          or(
            isNull(reminders.lastFiredAt),
            // Сравнение идёт в местной зоне пользователя, а не в зоне
            // сервера: иначе у половины мира «сегодня» наступало бы не тогда.
            sql`(${reminders.lastFiredAt} at time zone ${zone})::date < ${localDate}::date`,
          ),
        ),
      )
      .returning({ id: reminders.id });

    if (!claimed) continue;

    const channels = reminder.channels as ReminderChannel[];

    if (channels.includes('in_app')) {
      await db.insert(notifications).values({
        userId: reminder.userId,
        kind: reminder.kind,
        payload: { asOf: localDate },
      });
    }

    if (channels.includes('email')) {
      sendMail(log, {
        to: reminder.email,
        subject: 'MoneyMap: пора сверить остатки',
        text: `${reminder.name}, сегодня ${localDate} — день сверки.\n\nОткройте приложение и введите фактические остатки по счетам: расхождение с расчётом означает незафиксированную операцию.\n`,
      });
    }

    fired += 1;
  }

  return { fired };
}
