import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Единственное место в коде, где в запрос подставляется владелец данных (§5.4).
 *
 * Две причины, почему это класс, а не россыпь `eq(table.userId, userId)` по
 * модулям:
 *  1. забыть вызвать `scope.own()` заметно при чтении, а забыть один `where` —
 *     нет, и это утечка данных между пользователями;
 *  2. переход на семейные бюджеты — это замена `userId` на `workspaceId`
 *     в этом файле, а не ревизия всех запросов.
 */

type OwnedTable = { userId: PgColumn };
type MaybeSoftDeletable = { deletedAt?: PgColumn };

export class Scope {
  constructor(readonly ownerId: string) {}

  /**
   * «Запись принадлежит владельцу и не удалена» + дополнительные условия.
   * Таблицы без `deleted_at` обрабатываются так же — проверка просто не добавляется.
   */
  own<T extends OwnedTable & MaybeSoftDeletable>(table: T, ...extra: Array<SQL | undefined>): SQL {
    const conditions: Array<SQL | undefined> = [eq(table.userId, this.ownerId)];
    if (table.deletedAt) conditions.push(isNull(table.deletedAt));
    conditions.push(...extra);
    // and() возвращает undefined только при пустом списке — здесь он непустой.
    return and(...conditions) as SQL;
  }

  /** То же, но включая soft-deleted: для истории и восстановления (§5.5). */
  ownIncludingDeleted<T extends OwnedTable>(table: T, ...extra: Array<SQL | undefined>): SQL {
    return and(eq(table.userId, this.ownerId), ...extra) as SQL;
  }

  /** Проставляет владельца в insert-значения. */
  stamp<T extends object>(values: T): T & { userId: string } {
    return { ...values, userId: this.ownerId };
  }
}

export const scopeOf = (userId: string) => new Scope(userId);
