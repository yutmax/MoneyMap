import type {
  CategoryResponse,
  CreateCategoryInput,
  DeleteCategoryResult,
  UpdateCategoryInput,
} from '@moneymap/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { categories, transactions } from '../../db/schema.ts';
import { badRequest, notFound } from '../../lib/errors.ts';
import type { Scope } from '../../lib/scoping.ts';

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
  name: categories.name,
  kind: categories.kind,
  parentId: categories.parentId,
  icon: categories.icon,
  color: categories.color,
  sortOrder: categories.sortOrder,
  defaultKey: categories.defaultKey,
  transactionCount: transactionCountSql.as('transaction_count'),
  createdAt: categories.createdAt,
};

interface CategoryRow {
  id: string;
  name: string;
  kind: CategoryResponse['kind'];
  parentId: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  defaultKey: string | null;
  transactionCount: number | string;
  createdAt: Date;
}

function toResponse(row: CategoryRow): CategoryResponse {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    // Наружу уходит флаг, а не сам ключ: клиенту нужно только решить, можно
    // ли предлагать удаление. Ключ — внутреннее имя набора, и завязывать на
    // него интерфейс значит однажды переименовывать его вместе с вёрсткой.
    isDefault: row.defaultKey !== null,
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
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => toResponse(row as unknown as CategoryRow));
}

async function getRow(db: Db, scope: Scope, id: string) {
  const [row] = await db
    .select(selection)
    .from(categories)
    .where(scope.own(categories, eq(categories.id, id)))
    .limit(1);
  return row;
}

export async function getCategory(db: Db, scope: Scope, id: string): Promise<CategoryResponse> {
  const row = await getRow(db, scope, id);
  if (!row) throw notFound('errors.categoryNotFound');
  return toResponse(row as unknown as CategoryRow);
}

/**
 * Проверка будущего родителя: он существует, того же вида и сам верхнего
 * уровня. Последнее и держит дерево на двух уровнях (§8.4) — глубже вложить
 * просто некуда.
 */
async function assertUsableParent(
  db: Db,
  scope: Scope,
  parentId: string,
  kind: CategoryResponse['kind'],
  selfId?: string,
): Promise<void> {
  if (selfId && parentId === selfId) throw badRequest('errors.categoryOwnParent');

  const [parent] = await db
    .select({ id: categories.id, kind: categories.kind, parentId: categories.parentId })
    .from(categories)
    .where(scope.own(categories, eq(categories.id, parentId)))
    .limit(1);

  if (!parent) throw notFound('errors.categoryNotFound');
  if (parent.kind !== kind) throw badRequest('errors.categoryKindMismatch');
  if (parent.parentId !== null) throw badRequest('errors.categoryDepth');
}

export async function createCategory(
  db: Db,
  scope: Scope,
  input: CreateCategoryInput,
): Promise<CategoryResponse> {
  if (input.parentId) await assertUsableParent(db, scope, input.parentId, input.kind);

  const [created] = await db
    .insert(categories)
    .values(
      scope.stamp({
        name: input.name,
        kind: input.kind,
        parentId: input.parentId ?? null,
        icon: input.icon ?? null,
        color: input.color ?? null,
      }),
    )
    .returning({ id: categories.id });

  if (!created) throw new Error('Категория не создана');
  return getCategory(db, scope, created.id);
}

export async function updateCategory(
  db: Db,
  scope: Scope,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryResponse> {
  const current = await getRow(db, scope, id);
  if (!current) throw notFound('errors.categoryNotFound');

  if (input.parentId) {
    await assertUsableParent(db, scope, input.parentId, current.kind, id);

    // У категории с детьми не может быть родителя: иначе появился бы третий
    // уровень, которого в модели нет.
    const [child] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(scope.own(categories, eq(categories.parentId, id)))
      .limit(1);
    if (child) throw badRequest('errors.categoryDepth');
  }

  await db
    .update(categories)
    .set({ ...input, updatedAt: new Date() })
    .where(scope.own(categories, eq(categories.id, id)));

  return getCategory(db, scope, id);
}

/**
 * Удаление категории (§8.4).
 *
 * Операции не теряются: они переезжают в указанную категорию или остаются
 * без категории. Вложенные категории поднимаются на верхний уровень, а не
 * удаляются вместе с родителем — у них своя история, и уносить её за
 * компанию с группой нельзя. Сколько всего переехало, возвращается наружу:
 * действие, молча перестроившее дерево, выглядит потерей данных.
 *
 * Категории из набора по умолчанию не удаляются. Проверка стоит здесь, а не
 * только в интерфейсе: кнопку мы прячем, но эндпоинт остаётся открытым, и
 * правило «набор всегда полный» должно держаться там, где оно нарушается.
 */
export async function deleteCategory(
  db: Db,
  scope: Scope,
  id: string,
  moveTo?: string,
): Promise<DeleteCategoryResult> {
  const current = await getRow(db, scope, id);
  if (!current) throw notFound('errors.categoryNotFound');
  if (current.defaultKey !== null) throw badRequest('errors.categoryDefaultDelete');

  if (moveTo) {
    if (moveTo === id) throw badRequest('errors.categoryOwnParent');
    const [target] = await db
      .select({ id: categories.id, kind: categories.kind })
      .from(categories)
      .where(scope.own(categories, eq(categories.id, moveTo)))
      .limit(1);
    if (!target) throw notFound('errors.categoryNotFound');
    if (target.kind !== current.kind) throw badRequest('errors.categoryKindMismatch');
  }

  return db.transaction(async (tx) => {
    const moved = await tx
      .update(transactions)
      .set({ categoryId: moveTo ?? null, updatedAt: new Date() })
      .where(
        and(
          scope.own(transactions, eq(transactions.categoryId, id)),
          isNull(transactions.deletedAt),
        ),
      )
      .returning({ id: transactions.id });

    const promoted = await tx
      .update(categories)
      .set({ parentId: null, updatedAt: new Date() })
      .where(scope.own(categories, eq(categories.parentId, id)))
      .returning({ id: categories.id });

    await tx
      .update(categories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(scope.own(categories, eq(categories.id, id)));

    return {
      ok: true as const,
      movedTransactions: moved.length,
      promotedChildren: promoted.length,
    };
  });
}

/* ──────────────────────── набор по умолчанию (§8.1) ──────────────────────── */

/**
 * Набор перечислен целиком и плоским списком: вложенность здесь только
 * удлинила бы выпадающие списки в операциях и бюджетах, ничего не добавив —
 * двухуровневость остаётся доступной, просто не используется по умолчанию.
 *
 * Набор заметно шире прежнего намеренно. Добавление своих категорий сейчас
 * скрыто, поэтому то, чего нет в этом списке, человеку взять негде: лучше
 * лишняя строка, чем расход, которому некуда встать.
 *
 * Имя иконки — наше, из карты ICONS на фронтенде, а не имя компонента lucide.
 */
const DEFAULT_CATEGORIES: ReadonlyArray<{
  key: string;
  kind: 'income' | 'expense';
  icon: string;
}> = [
  { key: 'salary', kind: 'income', icon: 'banknote' },
  { key: 'sideIncome', kind: 'income', icon: 'briefcase' },
  { key: 'interest', kind: 'income', icon: 'trending-up' },
  { key: 'refunds', kind: 'income', icon: 'rotate-ccw' },
  { key: 'giftsIn', kind: 'income', icon: 'gift' },
  { key: 'otherIncome', kind: 'income', icon: 'circle-ellipsis' },

  { key: 'groceries', kind: 'expense', icon: 'shopping-cart' },
  { key: 'eatingOut', kind: 'expense', icon: 'utensils' },
  { key: 'transport', kind: 'expense', icon: 'bus' },
  { key: 'car', kind: 'expense', icon: 'car' },
  { key: 'housing', kind: 'expense', icon: 'housing' },
  { key: 'utilities', kind: 'expense', icon: 'plug' },
  { key: 'connectivity', kind: 'expense', icon: 'wifi' },
  { key: 'health', kind: 'expense', icon: 'heart-pulse' },
  { key: 'beauty', kind: 'expense', icon: 'sparkles' },
  { key: 'clothes', kind: 'expense', icon: 'shirt' },
  { key: 'entertainment', kind: 'expense', icon: 'clapperboard' },
  { key: 'sport', kind: 'expense', icon: 'dumbbell' },
  { key: 'education', kind: 'expense', icon: 'graduation-cap' },
  { key: 'travel', kind: 'expense', icon: 'plane' },
  { key: 'pets', kind: 'expense', icon: 'paw-print' },
  { key: 'subscriptions', kind: 'expense', icon: 'repeat' },
  { key: 'giftsOut', kind: 'expense', icon: 'party-popper' },
  { key: 'taxes', kind: 'expense', icon: 'landmark' },
  { key: 'otherExpense', kind: 'expense', icon: 'circle-ellipsis' },
];

/**
 * Стартовый набор категорий.
 *
 * Названия переводятся на язык запроса и дальше живут как обычные
 * пользовательские данные: человек их переименовывает. Смена языка интерфейса
 * их не трогает — это уже его записи, а не наши подписи. Удалить их нельзя:
 * набор обязан оставаться полным, пока нет способа завести категорию взамен.
 *
 * Дополняется по ключу, а не «создать всё, если категорий нет вовсе».
 * Прежняя проверка пропускала набор у любого, у кого была хоть одна своя
 * категория, и навсегда оставляла его без остальных; к тому же новые
 * категории, добавленные в список позже, не доезжали бы ни до кого.
 * `onConflictDoNothing` по (user_id, default_key) делает повторный вызов
 * безопасным, а гонку двух запросов — безвредной.
 */
export async function createDefaultCategories(
  db: Db,
  scope: Scope,
  translate: (key: string) => string,
): Promise<number> {
  const values = DEFAULT_CATEGORIES.map((item, index) =>
    scope.stamp({
      name: translate(`defaults.categories.${item.key}`),
      kind: item.kind,
      icon: item.icon,
      defaultKey: item.key,
      sortOrder: (index + 1) * 10,
    }),
  );

  const created = await db
    .insert(categories)
    .values(values)
    .onConflictDoNothing({ target: [categories.userId, categories.defaultKey] })
    .returning({ id: categories.id });

  return created.length;
}
