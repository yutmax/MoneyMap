import type { CategoryResponse } from '@moneymap/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { categories, transactions } from '../../db/schema.ts';
import { notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';
import { categoryIcon, defaultSortOrder, DEFAULT_CATEGORIES } from './category.catalog.ts';

/**
 * Категории только читаются (§8.4).
 *
 * Создание, правка и удаление убраны целиком, а не спрятаны за проверкой:
 * набор задан разработчиком, и эндпоинта, который его меняет, быть не должно.
 * Прятать кнопку, оставляя открытый метод, — договорённость, а не правило.
 */

/**
 * Количество операций в категории. Вложен в отдельный `sql`, иначе Drizzle
 * напечатает колонки без имени таблицы и коррелированный подзапрос сравнит
 * `transactions.category_id` с `transactions.id` — условие, истинное никогда.
 * Та же ловушка, что в account.service.ts.
 */
const countExpr = sql`(select count(*) from ${transactions}
  where ${transactions.categoryId} = ${categories.id}
    and ${transactions.deletedAt} is null)`;

const transactionCountSql = sql<number>`(${countExpr})`;

const selection = {
  id: categories.id,
  kind: categories.kind,
  parentId: categories.parentId,
  color: categories.color,
  sortOrder: categories.sortOrder,
  defaultKey: categories.defaultKey,
  transactionCount: transactionCountSql.as('transaction_count'),
  createdAt: categories.createdAt,
};

interface CategoryRow {
  id: string;
  kind: CategoryResponse['kind'];
  parentId: string | null;
  color: string | null;
  sortOrder: number;
  defaultKey: string;
  transactionCount: number | string;
  createdAt: Date;
}

function toResponse(row: CategoryRow): CategoryResponse {
  return {
    id: row.id,
    key: row.defaultKey,
    icon: categoryIcon(row.defaultKey),
    kind: row.kind,
    parentId: row.parentId,
    color: row.color,
    sortOrder: row.sortOrder,
    // count(*) приходит из Postgres как bigint, а драйвер отдаёт его строкой.
    transactionCount: Number(row.transactionCount),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCategories(db: Db, scope: Scope): Promise<CategoryResponse[]> {
  const rows = await db
    .select(selection)
    .from(categories)
    .where(scope.own(categories))
    // Порядок задаёт каталог. Сортировать по подписи нельзя: её здесь нет,
    // а на клиенте она зависит от языка — список переставлялся бы при его смене.
    .orderBy(asc(categories.kind), asc(categories.sortOrder));

  return rows.map((row) => toResponse(row as unknown as CategoryRow));
}

export async function getCategory(db: Db, scope: Scope, id: string): Promise<CategoryResponse> {
  const [row] = await db
    .select(selection)
    .from(categories)
    .where(scope.own(categories, eq(categories.id, id)))
    .limit(1);

  if (!row) throw notFound('errors.categoryNotFound');
  return toResponse(row as unknown as CategoryRow);
}

/* ──────────────────────── набор по умолчанию (§8.1) ──────────────────────── */

/**
 * Заводит недостающие категории каталога.
 *
 * Перевод сюда больше не нужен: в базу едут только ключ, вид и порядок, а
 * подпись появляется на клиенте. Раньше язык запроса решал, на каком языке
 * человек навсегда получит названия, — теперь решать нечего.
 *
 * Дополняет по ключу, а не «создать всё, если категорий нет вовсе»: иначе
 * категория, добавленная в каталог позже, не доехала бы ни до кого.
 * `onConflictDoNothing` делает повторный вызов безопасным, а гонку двух
 * запросов — безвредной.
 */
export async function createDefaultCategories(db: Db, scope: Scope): Promise<number> {
  const values = DEFAULT_CATEGORIES.map((item) =>
    scope.stamp({
      kind: item.kind,
      defaultKey: item.key,
      sortOrder: defaultSortOrder(item.key),
    }),
  );

  const created = await db
    .insert(categories)
    .values(values)
    .onConflictDoNothing({ target: [categories.userId, categories.defaultKey] })
    .returning({ id: categories.id });

  return created.length;
}
