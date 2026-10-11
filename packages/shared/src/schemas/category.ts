import { z } from 'zod';
import { msg } from '../i18n/index.ts';
import { uuidSchema } from './common.ts';
import { LIMITS } from './limits.ts';

export const CATEGORY_KINDS = ['income', 'expense'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const categoryKindSchema = z.enum(CATEGORY_KINDS, {
  message: msg('validation.category.kind'),
});

const nameSchema = z
  .string()
  .trim()
  .min(1, { message: msg('validation.category.name') })
  .max(LIMITS.nameMax, { message: msg('validation.name.max', { count: LIMITS.nameMax }) });

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: msg('validation.color') });

export const createCategorySchema = z.object({
  name: nameSchema,
  kind: categoryKindSchema,
  /** Родитель. Дерево ровно два уровня, поэтому у родителя своего быть не может. */
  parentId: uuidSchema.nullable().optional(),
  icon: z.string().trim().max(50).optional(),
  color: colorSchema.optional(),
});

/**
 * Вид (доход или расход) не меняется.
 *
 * Категория расходов с операциями, ставшая категорией доходов, переписала бы
 * знак у всей своей истории — отчёты за прошлые месяцы изменились бы задним
 * числом. Нужна другая — её заводят и переносят операции.
 */
export const updateCategorySchema = z
  .object({
    name: nameSchema.optional(),
    parentId: uuidSchema.nullable().optional(),
    icon: z.string().trim().max(50).nullable().optional(),
    color: colorSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: msg('validation.nothingToChange') });

export const categoryIdParamSchema = z.object({ id: uuidSchema });

/** Куда перенести операции удаляемой категории. Без него — в «без категории». */
export const deleteCategoryQuerySchema = z.object({
  moveTo: uuidSchema.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export interface CategoryResponse {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  /** Сколько операций ссылается на категорию. */
  transactionCount: number;
  createdAt: string;
}

/** Результат удаления: что произошло с операциями и вложенными категориями. */
export interface DeleteCategoryResult {
  ok: true;
  movedTransactions: number;
  promotedChildren: number;
}
